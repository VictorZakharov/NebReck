/**
 * Live-gameplay smoke test. Asserts the exploration loop end-to-end:
 *  1. sector 1 is PEACEFUL (no Vigil) with full jump fuel + neutral traffic
 *  2. hailing a hauler grants a contract
 *  3. jumping arrives in a repopulated, hostile sector 2
 *  4. dispatched hunters CLOSE on the player (the inverted-lookAt regression)
 *  5. the chase camera follows the ship
 *  6. devices work: cloak engages visibly, drains energy, EMP fires, nanobots heal
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = 8127;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const filePath = join(DIST, p === '/' ? 'index.html' : p);
  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const errors = [];

/** Wait for browser layout/font work without pretending wall time is game time. */
async function settleBrowserFrames(page, frameCount = 2) {
  await page.evaluate(async (frames) => {
    await document.fonts.ready;
    for (let frame = 0; frame < frames; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, frameCount);
}

/** Advance the complete game by an exact amount, independent of renderer FPS. */
async function advanceGameTime(page, seconds, hz = 60) {
  await page.evaluate(({ frameCount, dt }) => {
    const g = window.game;
    g.loop.stop();
    for (let frame = 0; frame < frameCount; frame++) g.loop.stepManual(dt);
  }, { frameCount: Math.ceil(seconds * hz), dt: 1 / hz });
}

/** Advance projectile collision only, keeping unrelated actors frozen. */
async function advanceProjectileTime(page, seconds, hz = 60) {
  await page.evaluate(({ frameCount, dt }) => {
    const g = window.game;
    g.loop.stop();
    const targets = [...g.enemies, ...g.turrets, ...g.neutrals];
    if (g.capital?.alive) targets.push(g.capital);
    for (let frame = 0; frame < frameCount; frame++) {
      g.projectiles.update(
        dt,
        targets,
        g.player.alive ? g.player : null,
        g.world.bodies,
        (hit) => g.combat.resolveHit(hit),
        g.surface ? g.terrainProjectileHit : undefined,
        (target) => target !== g.player || !g.devices.cloaked,
      );
    }
  }, { frameCount: Math.ceil(seconds * hz), dt: 1 / hz });
}

// The exact static hangar review route used for visual testing must commit a
// selection on click. ENGAGE is deliberately never pressed in this scenario.
const preferencePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
preferencePage.on('pageerror', (e) => errors.push(e.message));
preferencePage.on('crash', () => errors.push('preference page crashed'));
preferencePage.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await preferencePage.context().addCookies([
  { name: 'cleverspace_ship', value: 'aegis', url: `http://localhost:${PORT}` },
  { name: 'cleverspace_difficulty', value: 'reckoning', url: `http://localhost:${PORT}` },
]);
await preferencePage.goto(`http://localhost:${PORT}/?testScene=hangar&seed=7`, { waitUntil: 'load' });
await preferencePage.waitForFunction(() => window.__RENDER_DONE__ === true);
await settleBrowserFrames(preferencePage);
const preferenceMigrated = await preferencePage.evaluate(() => ({
  ship: window.game.selectedShipId,
  difficulty: window.game.selectedDifficultyId,
  cookie: document.cookie,
}));
const preferenceWritten = await preferencePage.evaluate(() => {
  document.querySelectorAll('.ship-card')[0]?.click();
  document.querySelectorAll('.diff-btn')[0]?.click();
  return {
    ship: window.game.selectedShipId,
    difficulty: window.game.selectedDifficultyId,
    playerShip: window.game.player.def.id,
    state: window.game.state,
    cookie: document.cookie,
  };
});
await preferencePage.reload({ waitUntil: 'load' });
await preferencePage.waitForFunction(() => window.__RENDER_DONE__ === true);
await settleBrowserFrames(preferencePage);
const preferenceReloaded = await preferencePage.evaluate(() => ({
  ship: window.game.selectedShipId,
  difficulty: window.game.selectedDifficultyId,
  playerShip: window.game.player.def.id,
  state: window.game.state,
}));
await preferencePage.close();
const preferencesPersist =
  preferenceMigrated.ship === 'aegis' &&
  preferenceMigrated.difficulty === 'reckoning' &&
  preferenceMigrated.cookie.includes('nebreck_ship=aegis') &&
  preferenceMigrated.cookie.includes('nebreck_difficulty=reckoning') &&
  preferenceWritten.ship === preferenceReloaded.ship &&
  preferenceWritten.difficulty === preferenceReloaded.difficulty &&
  preferenceWritten.playerShip === preferenceWritten.ship &&
  preferenceReloaded.playerShip === preferenceReloaded.ship &&
  preferenceWritten.state === 'hangar' &&
  preferenceReloaded.state === 'hangar' &&
  preferenceWritten.cookie.includes('nebreck_ship=') &&
  preferenceWritten.cookie.includes('nebreck_difficulty=');
console.log(
  'hangar preferences:',
  JSON.stringify({
    migrated: preferenceMigrated,
    written: preferenceWritten,
    reloaded: preferenceReloaded,
    persisted: preferencesPersist,
  }),
);

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('crash', () => errors.push('game page crashed'));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// Pinned seed: the default page rolls a random world per session.
await page.goto(`http://localhost:${PORT}/?seed=99&headless=1`, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.game));
await settleBrowserFrames(page);

// Fullscreen-like tall viewport: the independent action visor must retain the
// ship-selector row's bottom baseline instead of remaining at its windowed Y.
await page.evaluate(() => window.game.showHangar());
await page.setViewportSize({ width: 1920, height: 1080 });
await settleBrowserFrames(page);
const hangarAlignment = await page.evaluate(() => {
  const ships = document.querySelector('.hangar-ships')?.getBoundingClientRect();
  const actions = document.querySelector('.hangar-actions')?.getBoundingClientRect();
  return {
    shipsBottom: ships?.bottom ?? -1,
    actionsBottom: actions?.bottom ?? -1,
    delta: ships && actions ? Math.abs(ships.bottom - actions.bottom) : Infinity,
  };
});
console.log('fullscreen hangar baseline:', JSON.stringify(hangarAlignment));
await page.setViewportSize({ width: 1280, height: 720 });
await settleBrowserFrames(page);

// 0. Structural QA: every hull must be one connected body at geometry level
// (covers all viewing angles) — no floating plates/fins/pods ("ship slop").
const shipAudit = await page.evaluate(() => window.auditShips());
const disconnected = shipAudit.filter((a) => a.components !== 1);
console.log(
  'ship connectivity:',
  disconnected.length === 0
    ? `all ${shipAudit.length} hulls fully connected`
    : disconnected.map((a) => `${a.kind}: ${a.components} pieces, orphans [${a.orphans.join(', ')}]`).join(' · '),
);

await page.evaluate(() => {
  window.game.startMission();
  // Nothing below relies on background rAF. Keeping the full Three.js scene
  // rendering between assertions costs tens of seconds on CI SwiftShader.
  window.game.loop.stop();
});

// A hull without a seeker rack cannot manufacture or buy ammunition. Both
// screens explain why, and the model-level methods reject direct calls too.
const missileGate = await page.evaluate(() => {
  const g = window.game;
  const previousRate = g.weapons.missileRate;
  g.weapons.missileRate = 0;
  g.inventory.add('scrap', 20);
  const before = { scrap: g.inventory.counts.scrap, missiles: g.inventory.missiles };
  const crafted = g.craft('missile-rack');
  const bought = g.executeTrade('buy-missiles');

  g.openLoadout();
  const craftRow = [...document.querySelectorAll('.recipe-row')]
    .find((row) => row.textContent.includes('Seeker Missiles'));
  const craftButton = craftRow?.querySelector('button');
  const craftUi = {
    disabled: craftButton?.disabled ?? false,
    label: craftButton?.textContent ?? '',
  };
  g.closeLoadout();

  g.openTrade();
  const tradeRow = [...document.querySelectorAll('.recipe-row')]
    .find((row) => row.textContent.includes('Seeker Missiles'));
  const tradeButton = tradeRow?.querySelector('button');
  const tradeUi = {
    disabled: tradeButton?.disabled ?? false,
    label: tradeButton?.textContent ?? '',
  };
  g.closeTrade();
  g.weapons.missileRate = previousRate;

  return {
    crafted,
    bought,
    unchanged:
      g.inventory.counts.scrap === before.scrap &&
      g.inventory.missiles === before.missiles,
    craftUi,
    tradeUi,
  };
});
console.log('missile rack gate:', JSON.stringify(missileGate));

// If the only hostile candidate is occluded, targeting may identify a visible
// merchant. Civilian ranking is angular: a far contact directly under the
// crosshair beats a much nearer off-axis contact. It remains informational,
// with no lead pip or weapon aim target, and vanishes immediately on focus loss.
const civilianTargeting = await page.evaluate(() => {
  const g = window.game;
  const merchant = g.neutrals.find((neutral) => neutral.isMerchant);
  const nearby = g.neutrals.find((neutral) => neutral !== merchant);
  const blocked = g.neutrals.find(
    (neutral) => neutral !== merchant && neutral !== nearby,
  );
  if (!merchant || !nearby || !blocked) return { staged: false };
  const savedMerchant = merchant.position.clone();
  const savedNearby = nearby.position.clone();
  const savedBlocked = blocked.position.clone();
  const origin = g.player.position.clone();
  const cameraForward = merchant.position.clone().set(0.18, 0, -1).normalize();
  g.player.object.rotation.set(0, 0, 0);
  merchant.position.copy(origin).addScaledVector(cameraForward, 600);
  nearby.position.copy(origin).add({ x: 0, y: 0, z: -100 });
  blocked.position.copy(origin).add({ x: 0, y: 0, z: -110 });
  g.chaseCam.snapTo(g.player.object);
  g.chaseCam.camera.updateMatrixWorld(true);
  g.targeting.update(
    g.player,
    [blocked],
    [nearby, merchant],
    g.weapons.weapon.projectileSpeed,
    () => false,
    500,
    cameraForward,
  );
  g.renderHudOnce();
  const current = g.targeting.current;
  const preview = document.querySelector('.target-preview');
  const result = {
    staged: true,
    selectedMerchant: current?.ship === merchant,
    sensorThroughClutter: current?.ship === merchant,
    informational: current?.aimAssist === false && g.targeting.aimTarget === null,
    detail: document.querySelector('.preview-detail')?.textContent ?? '',
    friendlyStyle: preview?.classList.contains('friendly') ?? false,
    wireframe: !!preview?.querySelector('canvas'),
    leadHidden: document.querySelector('.lead-pip')?.style.opacity === '0',
    centeredDistance: Math.round(merchant.position.distanceTo(origin)),
    nearbyDistance: Math.round(nearby.position.distanceTo(origin)),
  };
  merchant.position.copy(origin).add({ x: 220, y: 0, z: -100 });
  nearby.position.copy(origin).add({ x: -220, y: 0, z: -100 });
  g.targeting.update(
    g.player,
    [blocked],
    [nearby, merchant],
    g.weapons.weapon.projectileSpeed,
    () => false,
    500,
    cameraForward,
  );
  g.renderHudOnce();
  const targetBox = document.querySelector('.target-box');
  const transitionSeconds = targetBox
    ? getComputedStyle(targetBox).transitionDuration
        .split(',')
        .map((duration) => Number.parseFloat(duration))
    : [Infinity];
  result.clearedOnFocusLoss = g.targeting.current === null;
  result.reticleHidden = targetBox?.style.opacity === '0';
  result.noFade = transitionSeconds.every((duration) => duration === 0);
  merchant.position.copy(savedMerchant);
  nearby.position.copy(savedNearby);
  blocked.position.copy(savedBlocked);
  g.targeting.current = null;
  return result;
});
console.log('civilian targeting:', JSON.stringify(civilianTargeting));

// Crafting refreshes the overlay after every purchase. The scroll container
// must remain at the recipe the player was working on.
const craftingScroll = await page.evaluate(() => {
  const g = window.game;
  g.inventory.add('scrap', 99);
  g.inventory.add('crystal', 99);
  g.inventory.add('flux', 9);
  g.openLoadout();
  const pane = document.querySelector('.loadout-right');
  pane.scrollTop = Math.min(120, pane.scrollHeight - pane.clientHeight);
  const before = pane.scrollTop;
  const row = [...document.querySelectorAll('.recipe-row')]
    .find((candidate) => candidate.textContent.includes('Engine Tuning'));
  const levelBefore = g.inventory.levels.get('engine-tune') ?? 0;
  row?.querySelector('button')?.click();
  const afterPane = document.querySelector('.loadout-right');
  const after = afterPane?.scrollTop ?? -1;
  const crafted = (g.inventory.levels.get('engine-tune') ?? 0) === levelBefore + 1;
  const holdRows = [...document.querySelectorAll('.loadout-left .res-line')];
  const labelLefts = holdRows.map((entry) =>
    entry.querySelector('.res-label').getBoundingClientRect().left
  );
  const countRights = holdRows.map((entry) =>
    entry.querySelector('.res-count').getBoundingClientRect().right
  );
  const rightInsets = holdRows.map((entry) => {
    const rowRect = entry.getBoundingClientRect();
    const countRect = entry.querySelector('.res-count').getBoundingClientRect();
    return rowRect.right - countRect.right;
  });
  const spread = (values) => Math.max(...values) - Math.min(...values);
  const iconLayout = {
    holdSvgs: document.querySelectorAll('.loadout-left .holding-icon').length,
    costSvgs: document.querySelectorAll('.recipe-cost .holding-icon').length,
    labelSpread: spread(labelLefts),
    countSpread: spread(countRights),
    minRightInset: Math.min(...rightInsets),
  };
  g.closeLoadout();
  return { before, after, crafted, iconLayout };
});
console.log('crafting scroll:', JSON.stringify(craftingScroll));

// Every crystal on a vein shares its centroid anchor, and ordinary motion is
// screen-space damped instead of snapping the label between crystal points.
const veinPrompt = await page.evaluate(() => {
  const g = window.game;
  const body = g.sector.asteroids.bodies.find((candidate) => candidate.orePoints.length > 0);
  if (!body) return { found: false };
  const point = body.orePoints[0];
  const centroid = point.clone().set(0, 0, 0);
  for (const orePoint of body.orePoints) centroid.add(orePoint);
  centroid.multiplyScalar(1 / body.orePoints.length);
  const outward = point.clone().sub(body.position).normalize();
  g.player.position.copy(point).addScaledVector(outward, 120);
  g.player.velocity.set(0, 0, 0);
  g.player.faceToward(point);
  g.chaseCam.snapTo(g.player.object);
  g.chaseCam.camera.updateMatrixWorld(true);
  g.lootAimed = g.aimedLoot(-1);
  g.targeting.current = null;
  g.renderHudOnce();
  const prompt = document.querySelector('.interact-prompt');
  const preview = document.querySelector('.target-preview');
  const previewName = document.querySelector('[data-el="previewName"]')?.textContent ?? '';
  const projected = centroid.clone().project(g.chaseCam.camera);
  const expectedX = (projected.x * 0.5 + 0.5) * innerWidth;
  const expectedY = (-projected.y * 0.5 + 0.5) * innerHeight;
  const firstX = parseFloat(prompt.style.left);
  const firstY = parseFloat(prompt.style.top);
  const stableCentroid = g.lootAimPoint.distanceTo(centroid) < 0.001;

  // Move the stable world anchor once. One HUD tick must advance toward the
  // new raw projection, but not teleport all the way there.
  g.lootAimPoint.x += 28;
  const movedProjection = g.lootAimPoint.clone().project(g.chaseCam.camera);
  const movedRawX = (movedProjection.x * 0.5 + 0.5) * innerWidth;
  const movedRawY = (-movedProjection.y * 0.5 + 0.5) * innerHeight;
  g.renderHudOnce();
  const secondX = parseFloat(prompt.style.left);
  const secondY = parseFloat(prompt.style.top);
  g.lootAimPoint.copy(centroid);
  return {
    found: true,
    aimed: g.lootAimed,
    anchored: prompt.classList.contains('world-anchored'),
    stableCentroid,
    delta: Math.hypot(
      firstX - expectedX,
      firstY - expectedY,
    ),
    eased: Math.hypot(secondX - firstX, secondY - firstY) > 0.1,
    didNotSnap: Math.hypot(secondX - movedRawX, secondY - movedRawY) > 1,
    previewVisible: preview?.classList.contains('show') ?? false,
    previewName,
    informational: g.targeting.current === null && g.targeting.aimTarget === null,
    closeEnemyPriority: g.aimedLoot(1) === null,
  };
});
console.log('vein prompt:', JSON.stringify(veinPrompt));

// 1. Peaceful opening sector with full fuel.
const peace = await page.evaluate(() => {
  const g = window.game;
  return {
    sector: g.sectorIndex,
    enemies: g.enemies.length,
    turrets: g.turrets.length,
    capital: !!g.capital,
    neutrals: g.neutrals.length,
    flux: g.inventory.counts.flux,
    // Planets must never overlap on screen — separation uses ring clearance.
    planetsClear: (() => {
      const ps = g.sector.planets;
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const ci = ps[i].ring ? ps[i].radius * 2.2 : ps[i].radius;
          const cj = ps[j].ring ? ps[j].radius * 2.2 : ps[j].radius;
          if (ps[i].position.distanceTo(ps[j].position) <= (ci + cj) * 1.25 + 400) return false;
        }
      }
      return true;
    })(),
  };
});
console.log('sector 1 (must be peaceful):', JSON.stringify(peace));

// 2. Contracts: hail → review the offer → accept.
const quest = await page.evaluate(() => {
  const g = window.game;
  const n = g.neutrals[0];
  g.player.position.copy(n.position);
  g.player.position.x += 30;
  const hailed = g.hailNearestNeutral();
  const offered = !!g.pendingOffer;
  const offerTitle = g.pendingOffer?.title ?? null;
  const accepted = g.acceptOffer();
  return { hailed, offered, offerTitle, accepted, active: g.quests.active.length };
});
console.log('contract:', JSON.stringify(quest));

// 2b. Merchant: dock and trade.
const trade = await page.evaluate(() => {
  const g = window.game;
  g.declineOffer(); // clear the pending contract from the hail test
  const merchant = g.neutrals.find((n) => n.isMerchant);
  if (!merchant) return { merchant: false };
  let engineSilenced = 0;
  const originalSilence = g.audio.silenceEngine;
  g.audio.silenceEngine = function () {
    engineSilenced++;
    return originalSilence.call(this);
  };
  g.player.position.copy(merchant.position);
  g.player.position.x += 25;
  g.lootAimed = null;
  g.lootAimPoint = null;
  g.lootAimBody = null;
  g.player.faceToward(merchant.position);
  g.chaseCam.snapTo(g.player.object);
  g.chaseCam.camera.updateMatrixWorld(true);
  g.renderHudOnce();
  const merchantPrompt = document.querySelector('.interact-prompt');
  const promptAnchored = merchantPrompt?.classList.contains('world-anchored') ?? false;
  const promptText = merchantPrompt?.textContent ?? '';
  g.hailNearestNeutral();
  const docked = g.state === 'trade';
  g.inventory.add('scrap', 8);
  const fluxBefore = g.inventory.counts.flux;
  const traded = g.executeTrade('buy-flux');
  const holdRows = [...document.querySelectorAll('.loadout-left .res-line')];
  const spread = (values) => Math.max(...values) - Math.min(...values);
  const labelSpread = spread(holdRows.map((entry) =>
    entry.querySelector('.res-label').getBoundingClientRect().left
  ));
  const countSpread = spread(holdRows.map((entry) =>
    entry.querySelector('.res-count').getBoundingClientRect().right
  ));
  const rightInset = Math.min(...holdRows.map((entry) => {
    const rowRect = entry.getBoundingClientRect();
    const countRect = entry.querySelector('.res-count').getBoundingClientRect();
    return rowRect.right - countRect.right;
  }));
  const title = document.querySelector('.loadout-left h2').getBoundingClientRect();
  const subtitle = document.querySelector('.loadout-ship').getBoundingClientRect();
  const iconLayout = {
    holdSvgs: document.querySelectorAll('.loadout-left .holding-icon').length,
    offerSvgs: document.querySelectorAll('.recipe-cost .holding-icon').length,
    fluxOrbits: document.querySelectorAll('.holding-flux ellipse').length,
    labelSpread,
    countSpread,
    rightInset,
    headerDelta: Math.abs(title.left - subtitle.left),
  };
  g.audio.silenceEngine = originalSilence;
  g.closeTrade();
  return {
    merchant: true,
    docked,
    traded,
    fluxGained: g.inventory.counts.flux - fluxBefore,
    engineSilenced,
    promptAnchored,
    promptText,
    iconLayout,
  };
});
console.log('merchant:', JSON.stringify(trade));

// 2c. Planetfall: land, verify LEVEL covered surface spawn + garrison + caves.
// Fires test bolts at a rooftop turret: they must REACH it (tight building
// AABBs — not the fat broadphase sphere that used to shield turrets).
const planet = await page.evaluate(() => {
  const g = window.game;
  window.__smoke = {
    bodiesBefore: g.sector.asteroids.bodies.length,
    neutralsBefore: g.neutrals.length,
    marker: g.sector.asteroids.bodies.find((b) => !b.hero && !b.solo),
  };
  g.sector.asteroids.destroyRock(window.__smoke.marker); // scar to prove identity

  const planetTarget = g.sector.planets[0];
  g.lootAimed = null;
  g.lootAimPoint = null;
  g.lootAimBody = null;
  g.player.position.copy(planetTarget.position).add({ x: 0, y: 0, z: planetTarget.radius + 500 });
  g.player.faceToward(planetTarget.position);
  g.chaseCam.snapTo(g.player.object);
  g.chaseCam.camera.updateMatrixWorld(true);
  g.renderHudOnce();
  const planetPromptEl = document.querySelector('.interact-prompt');
  const planetPrompt = {
    anchored: planetPromptEl?.classList.contains('world-anchored') ?? false,
    text: planetPromptEl?.textContent ?? '',
  };

  g.enterPlanet(0);
  const onPlanet = !!g.surface;
  const garrison = g.enemies.length + g.turrets.length;
  const stashes = g.surface ? g.surface.bodies.filter((b) => b.stash).length : 0;
  let caveTunnels = 0;
  g.surface?.group.traverse((object) => {
    if (object.name === 'cave-tunnel') caveTunnels++;
  });
  const caveCentersClear = g.surface?.caveLandmarks.every((landmark) =>
    !g.surface.bodies.some((body) =>
      body.hero &&
      !body.box &&
      !body.solo &&
      body.radius > 15 &&
      body.position.distanceToSquared(landmark.center) < (body.radius + 3) ** 2
    )
  ) ?? false;
  const cavePassagesClear = g.surface?.caveLandmarks.every((landmark) => {
    for (let segment = 0; segment < landmark.route.length - 1; segment++) {
      for (let step = 0; step <= 5; step++) {
        const point = landmark.route[segment]
          .clone()
          .lerp(landmark.route[segment + 1], step / 5);
        if (point.y < g.surface.heightAt(point.x, point.z) + g.player.radius + 0.5) {
          return false;
        }
        if (g.surface.bodies.some((body) =>
          body.caveShell &&
          body.position.distanceToSquared(point) <
            (body.radius + g.player.radius + 0.15) ** 2
        )) {
          return false;
        }
      }
    }
    return true;
  }) ?? false;
  const pointBlocked = (point) => g.surface.bodies.some((body) => {
    if (body.destroyed || body.stash) return false;
    if (body.box) {
      return (
        Math.abs(point.x - body.position.x) < body.box.hx + 1.2 &&
        Math.abs(point.y - body.position.y) < body.box.hy + 1.2 &&
        Math.abs(point.z - body.position.z) < body.box.hz + 1.2
      );
    }
    return body.position.distanceToSquared(point) < (body.radius + 1.2) ** 2;
  });
  const caveGuardsClear = g.surface?.caveLandmarks.every((landmark) =>
    !pointBlocked(landmark.interiorGuard) &&
    !pointBlocked(landmark.exteriorGuard)
  ) ?? false;
  const caveShellCount = g.surface?.bodies.filter((body) => body.caveShell).length ?? 0;
  const caveWallsClosed = g.surface?.caveLandmarks.every((landmark) => {
    const route = landmark.route;
    const center = route[route.length - 1];
    const previous = route[route.length - 2];
    const tangent = center.clone().sub(previous);
    tangent.y = 0;
    tangent.normalize();
    const side = tangent.clone().set(-tangent.z, 0, tangent.x);
    return [-1, 1].every((sign) => {
      for (let distance = 4; distance <= 55; distance += 1.5) {
        const probe = center.clone().addScaledVector(side, distance * sign);
        if (g.surface.bodies.some((body) =>
          body.caveShell &&
          body.position.distanceToSquared(probe) <
            (body.radius + g.player.radius) ** 2
        )) {
          return true;
        }
      }
      return false;
    });
  }) ?? false;
  const terrain = g.surface?.group.getObjectByName('surface-terrain');
  let terrainSurfaceError = Infinity;
  if (terrain?.geometry?.index) {
    const positions = terrain.geometry.attributes.position;
    const indices = terrain.geometry.index;
    terrainSurfaceError = 0;
    const stride = Math.max(3, Math.floor(indices.count / 60 / 3) * 3);
    for (let offset = 0; offset < indices.count; offset += stride) {
      const ia = indices.getX(offset);
      const ib = indices.getX(Math.min(offset + 1, indices.count - 1));
      const ic = indices.getX(Math.min(offset + 2, indices.count - 1));
      const x = (positions.getX(ia) + positions.getX(ib) + positions.getX(ic)) / 3;
      const y = (positions.getY(ia) + positions.getY(ib) + positions.getY(ic)) / 3;
      const z = (positions.getZ(ia) + positions.getZ(ib) + positions.getZ(ic)) / 3;
      terrainSurfaceError = Math.max(
        terrainSurfaceError,
        Math.abs(g.surface.heightAt(x, z) - y),
      );
    }
  }
  let malformedRockLobes = 0;
  let rockLobes = 0;
  g.surface?.group.traverse((object) => {
    if (
      object.name !== 'surface-rock-lobe' &&
      object.name !== 'cave-rock-lobe'
    ) {
      return;
    }
    rockLobes++;
    const scales = [object.scale.x, object.scale.y, object.scale.z];
    if (Math.max(...scales) / Math.max(0.001, Math.min(...scales)) > 2.1) {
      malformedRockLobes++;
    }
  });

  // Cave impact damage uses closing speed, not overlap alone.
  const collisionProbe = {
    idleDamage: Infinity,
    impactDamage: 0,
  };
  const firstCave = g.surface?.caveLandmarks[0];
  const shell = firstCave && g.surface.bodies
    .filter((body) => body.caveShell && body.radius < 10)
    .sort(
      (a, b) =>
        a.position.distanceToSquared(firstCave.entry) -
        b.position.distanceToSquared(firstCave.entry),
    )[0];
  if (firstCave && shell) {
    const savedPosition = g.player.position.clone();
    const savedVelocity = g.player.velocity.clone();
    const savedHull = g.player.hull;
    const savedShield = g.player.shield;
    const inward = firstCave.entry.clone().sub(shell.position).normalize();
    const overlapDistance = shell.radius + g.player.radius - 0.2;
    const protection = () => g.player.hull + g.player.shield;

    g.player.position.copy(shell.position).addScaledVector(inward, overlapDistance);
    g.player.velocity.set(0, 0, 0);
    const idleBefore = protection();
    g.resolveShipCollisions(1 / 60);
    collisionProbe.idleDamage = idleBefore - protection();

    g.player.position.copy(shell.position).addScaledVector(inward, overlapDistance);
    g.player.velocity.copy(inward).multiplyScalar(-55);
    const impactBefore = protection();
    g.resolveShipCollisions(1 / 60);
    collisionProbe.impactDamage = impactBefore - protection();

    g.player.position.copy(savedPosition);
    g.player.velocity.copy(savedVelocity);
    g.player.hull = savedHull;
    g.player.shield = savedShield;
  }
  let minHostile = Infinity;
  for (const h of [...g.enemies, ...g.turrets]) {
    minHostile = Math.min(minHostile, h.position.distanceTo(g.player.position));
  }
  const ground = g.surface ? g.surface.heightAt(g.player.position.x, g.player.position.z) : 0;
  const onSurface = g.player.position.y > ground && g.player.position.y < ground + 40;
  // Wings parallel to the ground — no random pitch/roll on surface spawn.
  const level =
    Math.abs(g.player.object.rotation.x) < 0.01 && Math.abs(g.player.object.rotation.z) < 0.01;

  const surfaceTurretsClear = g.turrets.every((turret) =>
    g.surface.isTurretSpawnClear(turret.position)
  );
  window.__smoke.surfaceTurretHulls = g.turrets.map((turret) => turret.hull);
  g.turrets.forEach((turret, index) => {
    const spawn = g.surface.turretSpawns[index];
    const outward = spawn.lookAt.clone().sub(turret.position);
    outward.y = 0;
    if (outward.lengthSq() < 0.001) outward.set(0, 0, 1);
    outward.normalize();
    for (const lift of [7, 18]) {
      const from = turret.position.clone().addScaledVector(outward, 26);
      from.y += lift;
      g.projectiles.spawnBolt({
        position: from,
        direction: turret.position.clone().sub(from).normalize(),
        speed: 220,
        damage: 2,
        faction: 'player',
        color: g.surface.fog.color,
        boltLength: 3,
        boltWidth: 0.2,
        life: 3,
      });
    }
  });

  const t = g.turrets[0];
  window.__smoke.turretHullBefore = t.hull;
  const col = g.surface.fog.color.clone();
  for (let i = 0; i < 4; i++) {
    const from = t.position.clone();
    from.x += 28 + i;
    from.y += 26;
    from.z += 28 - i;
    g.projectiles.spawnBolt({
      position: from,
      direction: t.position.clone().sub(from).normalize(),
      speed: 220,
      damage: 8,
      faction: 'player',
      color: col,
      boltLength: 3,
      boltWidth: 0.2,
      life: 3,
    });
  }

  return {
    onPlanet,
    garrison,
    stashes,
    caveTunnels,
    caveCentersClear,
    cavePassagesClear,
    caveGuardsClear,
    caveShellCount,
    caveWallsClosed,
    terrainSurfaceError,
    rockLobes,
    malformedRockLobes,
    collisionProbe,
    minHostile: Math.round(minHostile),
    onSurface,
    level,
    surfaceTurretsClear,
    planetPrompt,
  };
});
console.log('planetfall:', JSON.stringify(planet));

// A renderer-independent second of projectile time. SwiftShader may produce
// only a few rAF ticks per wall-clock second, especially on shared CI runners.
await advanceProjectileTime(page, 1);

// Stage the near-lock scenario: player ~120 m from a live turret, aiming at it
// — soft lock must pick the CLOSE turret, not a fighter a kilometre away.
await page.evaluate(() => {
  const g = window.game;
  const t0 = g.turrets[0];
  window.__smoke.turretDamaged = !t0.alive || t0.hull < window.__smoke.turretHullBefore;
  window.__smoke.allSurfaceTurretsDamageable = g.turrets.every(
    (turret, index) =>
      !turret.alive || turret.hull < window.__smoke.surfaceTurretHulls[index],
  );
  let target = g.turrets.find((x) => x.alive) ?? t0;
  let viewpoint = target.position.clone().add({ x: 0, y: 80, z: 0 });
  for (let index = 0; index < g.turrets.length; index++) {
    const candidate = g.turrets[index];
    if (!candidate.alive) continue;
    const spawn = g.surface.turretSpawns[index];
    const outward = spawn.lookAt.clone().sub(candidate.position);
    outward.y = 0;
    if (outward.lengthSq() < 0.001) outward.set(0, 0, 1);
    outward.normalize();
    const candidateView = candidate.position.clone().addScaledVector(outward, 120);
    candidateView.y = Math.max(
      candidate.position.y + 18,
      g.surface.heightAt(candidateView.x, candidateView.z) + g.player.radius + 6,
    );
    if (!g.combat.hasLineOfSight(candidateView, candidate.position)) continue;
    target = candidate;
    viewpoint = candidateView;
    break;
  }
  g.player.hull = g.player.hullMax;
  g.player.position.copy(viewpoint);
  g.player.velocity.set(0, 0, 0);
  g.player.faceToward(target.position);
});
await advanceGameTime(page, 1 / 60);
const planetB = await page.evaluate(() => {
  const g = window.game;
  const lock = g.targeting.current;
  const lockDist = lock ? Math.round(lock.distance) : -1;
  const lockedNear = lock !== null && lock.distance < 250;
  const surfaceIdentity = g.surface;
  const harvested = g.surface.bodies.find((body) => !body.destroyed && (body.stash || body.ore));
  if (harvested) g.surface.destroyRock(harvested);
  // Simulate a fully-cleared garrison; the revisit must not repopulate it.
  for (const enemy of g.enemies) g.scene.remove(enemy.object);
  for (const turret of g.turrets) g.scene.remove(turret.object);
  g.enemies = [];
  g.turrets = [];
  g.exitPlanet();
  g.player.hull = g.player.hullMax;
  const persisted =
    g.sector.asteroids.bodies.length === window.__smoke.bodiesBefore &&
    window.__smoke.marker.destroyed === true &&
    g.neutrals.length === window.__smoke.neutralsBefore;
  g.enterPlanet(0);
  const revisit = {
    sameSurface: g.surface === surfaceIdentity,
    harvested: !!harvested?.destroyed,
    garrison: g.enemies.length + g.turrets.length,
  };
  g.exitPlanet();
  return {
    turretDamaged: window.__smoke.turretDamaged,
    allSurfaceTurretsDamageable: window.__smoke.allSurfaceTurretsDamageable,
    lockDist,
    lockedNear,
    backInSpace: !g.surface && g.sectorIndex === 1,
    persisted,
    revisit,
  };
});
console.log('planet combat:', JSON.stringify(planetB));

// 3. Jump to sector 2 (fast-forwarded spool). Aim straight up from high
// above the field plane: guaranteed clear corridor, no planet in the cone.
const jumpStart = await page.evaluate(() => {
  const g = window.game;
  g.player.object.position.set(0, 900, 0);
  g.player.object.rotation.set(-Math.PI / 2, 0, 0);
  g.player.velocity.set(0, 0, 0);
  g.inventory.add('flux', 2);
  g.renderHudOnce();
  const heldBeforeJump = g.inventory.counts.flux;
  const jumpLabel = document.querySelector('[data-el="jumpText"]')?.textContent ?? '';
  const started = g.startJump(true);
  if (started) g.jumpSpool = 0.01;
  return {
    started,
    state: g.state,
    alive: g.player.alive,
    flux: g.inventory.counts.flux,
    fluxHud: jumpLabel.includes(`Flux 2/${heldBeforeJump}`),
    jumpLabel,
    spool: g.jumpSpool,
  };
});
console.log('jump start:', JSON.stringify(jumpStart));
// Tick one performs the jump; tick two rebuilds the new sector's target lists.
await advanceGameTime(page, 2 / 60);
const postJump = await page.evaluate(() => ({
  sector: window.game.sectorIndex,
  enemies: window.game.enemies.length,
  turrets: window.game.turrets.length,
  capital: !!window.game.capital,
  safeDist: (() => {
    const g = window.game;
    let min = Infinity;
    const hostiles = [...g.enemies, ...g.turrets];
    if (g.capital) hostiles.push(g.capital);
    for (const h of hostiles) min = Math.min(min, h.position.distanceTo(g.player.position));
    return Math.round(min);
  })(),
}));
console.log('sector 2 (must be hostile):', JSON.stringify(postJump));

// Target selection has two deliberate regimes. Inside the current weapon's
// reach, distance-weighted aim assist wins; outside it, the camera crosshair
// chooses the most centred contact. Capture styling stays range-coloured.
const targetingPolicy = await page.evaluate(() => {
  const g = window.game;
  const [centred, closer] = g.enemies.filter((enemy) => enemy.alive).slice(0, 2);
  if (!centred || !closer) return { staged: false };
  const savedCentred = centred.position.clone();
  const savedCloser = closer.position.clone();
  const origin = g.player.position.clone().set(0, 2600, 0);
  const cameraForward = origin.clone().set(0.18, 0, -1).normalize();
  g.player.position.copy(origin);
  g.player.object.rotation.set(0, 0, 0);
  g.player.velocity.set(0, 0, 0);
  g.chaseCam.snapTo(g.player.object);
  g.chaseCam.camera.updateMatrixWorld(true);

  centred.position.copy(origin).addScaledVector(cameraForward, 900);
  closer.position.copy(origin).add({ x: 0, y: 0, z: -650 });
  g.targeting.current = null;
  g.targeting.update(g.player, [centred, closer], [], 340, () => true, 500, cameraForward);
  g.renderHudOnce();
  const box = document.querySelector('.target-box');
  const farSelectedCentred = g.targeting.current?.ship === centred;
  const farGrey = box?.classList.contains('far') &&
    getComputedStyle(box).borderTopColor.includes('150, 165, 175');

  centred.position.copy(origin).addScaledVector(cameraForward, 450);
  closer.position.copy(origin).add({ x: 15, y: 0, z: -100 });
  g.targeting.current = null;
  g.targeting.update(g.player, [centred, closer], [], 340, () => true, 500, cameraForward);
  g.renderHudOnce();
  const nearSelectedCloser = g.targeting.current?.ship === closer;
  const nearRed = !box?.classList.contains('far') &&
    getComputedStyle(box).borderTopColor.includes('255, 59, 48');

  centred.position.copy(savedCentred);
  closer.position.copy(savedCloser);
  g.targeting.current = null;
  return { staged: true, farSelectedCentred, farGrey, nearSelectedCloser, nearRed };
});
console.log('targeting policy:', JSON.stringify(targetingPolicy));

// Explicit weapon packages prove a pursuing seeker bomber launches at one
// kilometre and rotary fighters/batteries use their rapid-fire definitions.
const enemyWeaponVariety = await page.evaluate(() => {
  const g = window.game;
  g.player.position.set(0, 2600, 0);
  g.player.velocity.set(0, 0, 0);
  const start = g.enemies.length;
  g.spawnEnemy({
    kind: 'bomber',
    position: g.player.position.clone().add({ x: 0, y: 0, z: -1050 }),
    aggression: 1,
    weaponMode: 'homing',
  });
  const bomber = g.enemies[g.enemies.length - 1];
  bomber.faceToward(g.player.position);
  bomber.fireTimer = 0;
  let seekerShots = 0;
  bomber.update(1 / 60, g.player.position, g.player.velocity, () => seekerShots++, true);

  g.spawnEnemy({
    kind: 'raider',
    position: g.player.position.clone().add({ x: 0, y: 0, z: -300 }),
    aggression: 1,
    weaponMode: 'autogun',
  });
  const rotary = g.enemies[g.enemies.length - 1];
  rotary.faceToward(g.player.position);
  rotary.fireTimer = 0;
  let rotaryBursts = 0;
  rotary.update(0.06, g.player.position, g.player.velocity, () => rotaryBursts++, true);
  rotary.update(0.06, g.player.position, g.player.velocity, () => rotaryBursts++, true);
  const battery = g.capitalTurrets.find((turret) => turret.weapon === 'autogun');
  const result = {
    seekerAt1050m: bomber.rocketMode === 'homing' && seekerShots > 0,
    rotaryShip: rotary.autoGun && rotaryBursts >= 2,
    rotaryBattery:
      battery?.kind === 'autogun-turret' && battery.stats.fireCooldown <= 0.11,
  };
  const temporary = g.enemies.splice(start);
  for (const enemy of temporary) {
    g.scene.remove(enemy.object);
    enemy.dispose();
  }
  return result;
});
console.log('enemy weapon variety:', JSON.stringify(enemyWeaponVariety));

// 3b. Enemy ordnance is tested with deterministic projectile time: the fast
// rocket is unguided, the seeker reports a lock, becomes imminent inside two
// seconds, and drops its target as soon as a safely activated cloak engages.
const missileSetup = await page.evaluate(() => {
  const g = window.game;
  g.projectiles.clear();
  const seekerCarriers = [
    ...g.enemies.filter((enemy) => enemy.rocketMode === 'homing'),
    ...g.turrets.filter((turret) => turret.weapon === 'homing'),
  ].length;
  const beforeLaunch = g.projectiles.incomingThreat(g.player);
  const idleThreat = { locked: beforeLaunch.locked, count: beforeLaunch.count };
  g.devices.breakCloak();
  g.devices.cloakCooldown = 0;
  g.cloakVisual.set(g.player, false);
  g.player.alive = true;
  g.player.hull = g.player.hullMax;
  g.player.shield = g.player.shieldMax;
  g.player.position.set(0, 2600, 0);
  g.player.velocity.set(0, 0, 0);
  const seekerOrigin = g.player.position.clone();
  seekerOrigin.z -= 380;
  const fastOrigin = seekerOrigin.clone();
  fastOrigin.x += 28;
  g.projectiles.spawnEnemyRocket(
    seekerOrigin,
    g.player.position.clone().sub(seekerOrigin),
    g.player,
    'homing',
  );
  g.projectiles.spawnEnemyRocket(
    fastOrigin,
    g.player.position.clone().sub(fastOrigin),
    g.player,
    'fast',
  );
  const snapshot = g.projectiles.debugSnapshot().filter((shot) => shot.faction === 'enemy');
  const threat = g.projectiles.incomingThreat(g.player);
  const activeTrackingRockets = snapshot.filter(
    (shot) => shot.kind === 'missile' && shot.homing && shot.hasTarget,
  ).length;
  g.renderHudOnce();
  const warning = document.querySelector('.missile-warning');
  return {
    homing: snapshot.some((shot) => shot.homing && shot.hasTarget && shot.speed < 150),
    fast: snapshot.some((shot) => !shot.homing && !shot.hasTarget && shot.speed > 250),
    locked: threat.locked && !threat.imminent && threat.count === 1,
    tracksInFlightOnly:
      seekerCarriers > 0 && !idleThreat.locked && idleThreat.count === 0 &&
      threat.count === activeTrackingRockets && activeTrackingRockets === 1,
    warning: warning?.classList.contains('show') && !warning.classList.contains('imminent'),
  };
});
await advanceProjectileTime(page, 0.3);
const missileImminent = await page.evaluate(() => {
  const g = window.game;
  const threat = g.projectiles.incomingThreat(g.player);
  g.renderHudOnce();
  const warning = document.querySelector('.missile-warning');
  return {
    imminent:
      threat.imminent && threat.timeToImpact <= 2 && threat.timeToImpact >= 1.5,
    timeToImpact: Number(threat.timeToImpact.toFixed(2)),
    warning: warning?.classList.contains('imminent') ?? false,
  };
});
await advanceProjectileTime(page, 0.1);
const missileCountdown = await page.evaluate((previousEta) => {
  const g = window.game;
  const inbound = g.projectiles.incomingThreat(g.player);
  const wasImminent = inbound.imminent;
  const currentEta = inbound.timeToImpact;
  const seeker = g.projectiles.pool.find((shot) =>
    shot.active && shot.faction === 'enemy' && shot.homing && shot.target === g.player
  );
  if (seeker) {
    seeker.mesh.position.copy(g.player.position).add({ x: 0, y: 0, z: 45 });
    seeker.velocity.copy(seeker.mesh.position).sub(g.player.position).normalize().multiplyScalar(205);
  }
  const missed = g.projectiles.incomingThreat(g.player);
  return {
    nonIncreasing: wasImminent && currentEta <= previousEta + 0.001,
    missedTimerRemoved:
      missed.locked && !missed.imminent && !Number.isFinite(missed.timeToImpact),
    currentEta: Number(currentEta.toFixed(2)),
  };
}, missileImminent.timeToImpact);
const cloakMissileBreak = await page.evaluate(() => ({
  activated: window.game.activateCloak(),
}));
await advanceProjectileTime(page, 1 / 60);
Object.assign(cloakMissileBreak, await page.evaluate(() => {
  const g = window.game;
  const threat = g.projectiles.incomingThreat(g.player);
  const targetDropped = g.projectiles.debugSnapshot()
    .filter((shot) => shot.faction === 'enemy' && shot.homing)
    .every((shot) => !shot.hasTarget);
  g.devices.breakCloak();
  g.devices.cloakCooldown = 0;
  g.cloakVisual.set(g.player, false);
  g.projectiles.clear();
  return { unlocked: !threat.locked, targetDropped };
}));
console.log('enemy missiles:', JSON.stringify({
  missileSetup,
  missileImminent,
  missileCountdown,
  cloakMissileBreak,
}));

// 3c. Carrier battery and annihilator behavior. All time is advanced directly
// on the unit under test, so this adds no wall-clock waits to CI.
const capitalSystems = await page.evaluate(() => {
  const g = window.game;
  const capital = g.capital;
  if (!capital) return { present: false };
  const initialMounts = [...g.capitalTurrets];
  const forward = capital.position.clone();
  capital.forward(forward);
  g.player.position.copy(capital.position).addScaledVector(forward, 600);
  g.player.faceToward(capital.position);
  g.targeting.current = null;
  g.rebuildTargetLists();
  const weapons = [...new Set(initialMounts.map((turret) => turret.weapon))];
  const top = initialMounts.find((turret) => turret.mountNormal?.y > 0.5);
  const bottom = initialMounts.find((turret) => turret.mountNormal?.y < -0.5);
  const farMountsHidden = initialMounts.every((turret) => !g.hostiles.includes(turret));
  const farHullAvailable = g.hostiles.includes(capital);
  g.targeting.update(
    g.player,
    g.hostiles.filter((hostile) => hostile === capital || initialMounts.includes(hostile)),
    [],
    g.weapons.weapon.projectileSpeed,
    () => true,
  );
  g.renderHudOnce();
  const farTargetsHull = g.targeting.current?.ship === capital;
  const farPreviewHull =
    document.querySelector('[data-el="previewName"]')?.textContent === 'Warden-class Carrier';

  const closeMount = top ?? initialMounts[0];
  g.player.position.copy(capital.position).addScaledVector(forward, 200);
  if (closeMount) g.player.faceToward(closeMount.position);
  g.targeting.current = null;
  g.rebuildTargetLists();
  const nearMountsAvailable = initialMounts.every((turret) => g.hostiles.includes(turret));
  g.targeting.update(
    g.player,
    g.hostiles.filter((hostile) => hostile === capital || initialMounts.includes(hostile)),
    [],
    g.weapons.weapon.projectileSpeed,
    () => true,
  );
  const nearMountLock = initialMounts.includes(g.targeting.current?.ship);
  g.targeting.current = null;
  const activeBodies = g.world.bodies.filter((body) => !body.destroyed);
  const savedDestroyed = activeBodies.map((body) => [body, body.destroyed]);
  for (const body of activeBodies) body.destroyed = true;

  const above = capital.position.clone();
  above.y += 180;
  let topLineOfSight = false;
  let bottomOccluded = false;
  let topShots = 0;
  let bottomShots = 0;
  if (top && bottom) {
    const topOrigin = top.position.clone().addScaledVector(top.mountNormal, 3);
    const bottomOrigin = bottom.position.clone().addScaledVector(bottom.mountNormal, 3);
    topLineOfSight = g.combat.hasLineOfSight(topOrigin, above);
    bottomOccluded = !g.combat.hasLineOfSight(bottomOrigin, above);
    for (let frame = 0; frame < 240; frame++) {
      top.update(1 / 60, above, true, () => topShots++, true);
      bottom.update(1 / 60, above, true, () => bottomShots++, true);
    }
  }
  for (const [body, destroyed] of savedDestroyed) body.destroyed = destroyed;

  const sacrificial = initialMounts.find((turret) => turret !== top && turret !== bottom);
  const carrierHullBefore = capital.hull;
  if (sacrificial) {
    g.combat.resolveHit({
      ship: sacrificial,
      asteroid: null,
      point: sacrificial.position.clone(),
      damage: 100_000,
      faction: 'player',
      wasMissile: false,
    });
  }
  const independentMount = !!sacrificial && !sacrificial.alive && capital.hull === carrierHullBefore;

  const right = capital.position.clone().set(1, 0, 0).applyQuaternion(capital.object.quaternion);
  g.player.alive = true;
  g.player.hull = g.player.hullMax;
  g.player.shield = g.player.shieldMax;
  g.player.velocity.set(0, 0, 0);
  capital.phase = 'idle';
  capital.cooldown = 0;
  let committedShot = null;
  let chargeSignals = 0;
  const arcContext = {
    player: g.player,
    playerVisible: true,
    canSeePlayer: () => true,
    onCharge: () => chargeSignals++,
    onFire: (shot) => {
      committedShot = {
        direction: shot.direction.clone(),
        range: shot.range,
      };
      return shot.range;
    },
  };
  g.player.position.copy(capital.position).addScaledVector(right, 300);
  capital.update(1 / 60, arcContext);
  const rejectedFromSide = capital.beamPhase === 'idle';
  g.player.position.copy(capital.position).addScaledVector(forward, 320);
  capital.update(1 / 60, arcContext);
  const startedInFront = capital.beamPhase === 'charging';
  g.player.position
    .copy(capital.position)
    .addScaledVector(forward, 300)
    .addScaledVector(right, 400);
  for (let frame = 0; frame < 122; frame++) capital.update(1 / 60, arcContext);
  const arcDot = committedShot ? forward.dot(committedShot.direction) : -1;
  const committedWithinArc =
    !!committedShot && arcDot >= Math.cos(Math.PI / 14) - 0.002 && chargeSignals === 1;

  capital.phase = 'idle';
  capital.cooldown = 0;
  capital.update(0);
  const beamBodies = g.world.bodies.filter((body) => !body.destroyed && !body.box).slice(0, 2);
  let firstObstacleDestroyed = false;
  let secondObstacleSurvived = false;
  let playerProtected = false;
  let beamFired = 0;
  if (beamBodies.length === 2) {
    const [first, second] = beamBodies;
    const states = g.world.bodies.map((body) => ({ body, destroyed: body.destroyed }));
    const firstState = { position: first.position.clone(), radius: first.radius, box: first.box };
    const secondState = { position: second.position.clone(), radius: second.radius, box: second.box };
    for (const state of states) state.body.destroyed = true;
    first.destroyed = false;
    first.box = null;
    first.radius = 18;
    first.position.copy(capital.position).addScaledVector(forward, 125);
    second.destroyed = false;
    second.box = null;
    second.radius = 18;
    second.position.copy(capital.position).addScaledVector(forward, 220);
    g.player.position.copy(capital.position).addScaledVector(forward, 360);
    g.player.alive = true;
    g.player.hull = g.player.hullMax;
    g.player.shield = g.player.shieldMax;
    const hullBefore = g.player.hull;
    const shieldBefore = g.player.shield;
    let visible = true;
    const obstacleContext = {
      player: g.player,
      playerVisible: true,
      canSeePlayer: () => visible,
      onCharge: () => {},
      onFire: (shot) => {
        beamFired++;
        return g.combat.capitalBeamFire(shot);
      },
    };
    capital.update(1 / 60, obstacleContext);
    visible = false;
    for (let frame = 0; frame < 122; frame++) capital.update(1 / 60, obstacleContext);
    firstObstacleDestroyed = first.destroyed;
    secondObstacleSurvived = !second.destroyed;
    playerProtected =
      g.player.alive && g.player.hull === hullBefore && g.player.shield === shieldBefore;
    for (const state of states) {
      if (state.body !== first) state.body.destroyed = state.destroyed;
    }
    first.position.copy(firstState.position);
    first.radius = firstState.radius;
    first.box = firstState.box;
    first.destroyed = true;
    second.position.copy(secondState.position);
    second.radius = secondState.radius;
    second.box = secondState.box;
  }
  capital.phase = 'idle';
  capital.cooldown = 999;
  capital.update(0);
  g.player.position.set(0, 2600, 0);
  g.player.velocity.set(0, 0, 0);

  return {
    present: true,
    mounts: initialMounts.length,
    top: initialMounts.filter((turret) => turret.mountNormal?.y > 0.5).length,
    bottom: initialMounts.filter((turret) => turret.mountNormal?.y < -0.5).length,
    weapons,
    farMountsHidden,
    farHullAvailable,
    farTargetsHull,
    farPreviewHull,
    nearMountsAvailable,
    nearMountLock,
    independentMount,
    topLineOfSight,
    bottomOccluded,
    topShots,
    bottomShots,
    rejectedFromSide,
    startedInFront,
    committedWithinArc,
    arcDot: Number(arcDot.toFixed(4)),
    beamFired,
    firstObstacleDestroyed,
    secondObstacleSurvived,
    playerProtected,
  };
});
console.log('capital systems:', JSON.stringify(capitalSystems));

// 4. Hunter dispatch + engagement.
await page.evaluate(() => {
  const g = window.game;
  // Keep deterministic stepping active. Hosted SwiftShader can render only a
  // handful of rAF frames per second, so wall-clock waits are both slow and
  // unrelated to the amount of gameplay simulation exercised.
  g.loop.stop();
  g.encounters.dispatchWing(3, g.player.position);
});
const avgDist = () =>
  page.evaluate(() => {
    const g = window.game;
    const hunters = g.enemies.filter((e) => e.hunter);
    if (hunters.length === 0) return 0;
    return hunters.reduce((s, e) => s + e.position.distanceTo(g.player.position), 0) / hunters.length;
  });
const distBefore = await avgDist();
await page.evaluate(() => {
  const g = window.game;
  const hunters = g.enemies.filter((enemy) => enemy.hunter);
  for (let frame = 0; frame < 240; frame++) {
    for (const hunter of hunters) {
      hunter.update(
        1 / 30,
        g.player.position,
        g.player.velocity,
        () => {},
        true,
      );
    }
  }
});
const distAfter = await avgDist();
const closed = distBefore - distAfter;
console.log(`engagement: hunters ${distBefore.toFixed(0)} → ${distAfter.toFixed(0)} (closed ${closed.toFixed(0)}, must be > 20)`);

// 5. Chase camera follows across a teleport.
await page.evaluate(() => {
  const g = window.game;
  g.player.position.set(0, 0, -400);
  for (let frame = 0; frame < 120; frame++) {
    g.chaseCam.update(
      1 / 30,
      g.player.object,
      g.player.speedFrac,
      g.player.boosting,
    );
  }
});
const camDist = await page.evaluate(() =>
  window.game.chaseCam.camera.position.distanceTo(window.game.player.position),
);
console.log(`camera follow: ${camDist.toFixed(1)} units from ship (must be < 60)`);

// 5b. Turret overhead-aim regression (lookAt up-vector degeneracy): park the
// player DIRECTLY ABOVE a turret; its barrels must align, not point at dirt.
await page.evaluate(() => {
  const g = window.game;
  const turret = g.turrets.find((t) => t.alive);
  g.player.position.copy(turret.position);
  g.player.position.y += 150;
  g.player.velocity.set(0, 0, 0);
  // Advance the unit under test by deterministic simulation time. Wall-clock
  // waits only produced ~2 seconds on some SwiftShader runs and made this
  // otherwise unrelated check fail according to host rendering speed.
  for (let frame = 0; frame < 180; frame++) {
    turret.update(
      1 / 60,
      g.player.position,
      true,
      () => {},
      true,
    );
  }
});
const turretAim = await page.evaluate(() => {
  const g = window.game;
  const t = g.turrets.find((x) => x.alive);
  if (!t) return { dot: -1 };
  const fwd = t.velocity.clone(); // borrow a Vector3 instance
  t.forward(fwd);
  const toPlayer = g.player.position.clone().sub(t.position).normalize();
  return { dot: Number(fwd.dot(toPlayer).toFixed(3)) };
});
console.log(`turret overhead aim: dot=${turretAim.dot} (must be > 0.85)`);

// 6. Devices & consumables. Cloak refuses within 180 u of a hostile, so
// prove BOTH sides: refused up close, engaged after breaking away.
const dev = await page.evaluate(() => {
  const g = window.game;
  const turret = g.turrets.find((t) => t.alive);
  g.player.position.copy(turret.position);
  g.player.position.y += 60;
  const cloakRefused = !g.activateCloak();
  g.inventory.add('scrap', 6);
  const nanobotsBeforeThreat = g.inventory.nanobots;
  const scrapBeforeThreat = g.inventory.counts.scrap;
  const craftRefused = !g.craft('nanobot-kit');
  g.openLoadout();
  const threatButton = [...document.querySelectorAll('.recipe-row')]
    .find((row) => row.textContent.includes('Nanobot Kit'))?.querySelector('button');
  const craftThreatUi = {
    disabled: threatButton?.disabled ?? false,
    label: threatButton?.textContent ?? '',
    warning: document.querySelector('.loadout-hint')?.textContent ?? '',
  };
  g.closeLoadout();
  const craftUnchanged =
    g.inventory.nanobots === nanobotsBeforeThreat &&
    g.inventory.counts.scrap === scrapBeforeThreat;
  g.player.position.set(0, 2600, 0);
  g.player.velocity.set(0, 0, 0);
  const cloakOk = g.activateCloak();
  const cloaked = g.devices.cloaked;
  const energyBefore = g.weapons.energy;
  // Exercise only the subsystem under test; rendering 60 full world frames in
  // SwiftShader adds CI time without adding coverage to the cloak assertion.
  for (let i = 0; i < 60; i++) g.updateDevices(1 / 60);
  const energyAfter = g.weapons.energy;
  let hullOpacity = 0;
  g.player.exterior.traverse((obj) => {
    if (obj.isMesh && obj.material !== g.cloakShellMat) {
      hullOpacity = Math.max(hullOpacity, obj.material.opacity);
    }
  });
  const shellOpacity = g.cloakShellMat?.opacity ?? 0;
  const empOk = g.activateEmp();
  g.inventory.nanobots = 1;
  g.renderHudOnce();
  const nanoHotkey = document.querySelector('[data-el="devNano"]')?.textContent === 'Nano H ×1';
  g.player.hull = Math.max(1, g.player.hullMax - 50);
  const before = g.player.hull;
  const nanoOk = g.useNanobots();
  return {
    cloakRefused,
    craftRefused,
    craftUnchanged,
    craftThreatUi,
    cloakOk,
    cloaked,
    energyBefore: Number(energyBefore.toFixed(2)),
    energyAfter: Number(energyAfter.toFixed(2)),
    hullOpacity: Number(hullOpacity.toFixed(3)),
    shellOpacity: Number(shellOpacity.toFixed(3)),
    empOk,
    nanoHotkey,
    nanoOk,
    healed: g.player.hull > before,
  };
});
console.log('devices:', JSON.stringify(dev));

// 7. Dense-combat stability regression. Repeatedly fill the reinforcement and
// projectile limits, render the resulting firefight, destroy the temporary
// wings, and prove per-actor GPU resources return to their original level.
// Audio is intentionally initialized here so a suspended/running WebAudio
// graph cannot grow without bound under a wall of nearby guns.
const combatStability = await page.evaluate(async () => {
  const g = window.game;
  g.loop.stop();
  let contextLost = false;
  g.renderer.domElement.addEventListener('webglcontextlost', (event) => {
    contextLost = true;
    event.preventDefault();
  });

  const retireHunters = () => {
    for (const enemy of [...g.enemies]) {
      if (!enemy.hunter) continue;
      enemy.shield = 0;
      enemy.hull = 1;
      g.combat.resolveHit({
        ship: enemy,
        asteroid: null,
        point: enemy.position.clone(),
        damage: 10_000,
        faction: 'player',
        wasMissile: false,
      });
    }
  };

  retireHunters();
  g.projectiles.clear();
  g.rebuildTargetLists();
  g.renderHudOnce();
  g.postFx.render(0);
  const baseline = {
    sceneChildren: g.scene.children.length,
    geometries: g.renderer.info.memory.geometries,
    textures: g.renderer.info.memory.textures,
  };

  g.audio.init();
  let peakHunters = 0;
  let peakProjectiles = 0;
  let peakAudio = 0;
  let overflowSpawned = 0;
  for (let cycle = 0; cycle < 5; cycle++) {
    g.encounters.dispatchWing(100, g.player.position);
    overflowSpawned += g.encounters.dispatchWing(100, g.player.position);
    const hunters = g.enemies.filter((enemy) => enemy.hunter);
    peakHunters = Math.max(peakHunters, hunters.length);

    hunters.forEach((enemy, index) => {
      enemy.position.copy(g.player.position).add({
        x: (index % 4 - 1.5) * 18,
        y: (Math.floor(index / 4) - 1) * 14,
        z: -150 - index * 3,
      });
      enemy.faceToward(g.player.position);
      for (let burst = 0; burst < 34; burst++) {
        g.combat.enemyFire(enemy);
        peakAudio = Math.max(peakAudio, g.audio.debugActiveOneShots);
      }
    });
    peakProjectiles = Math.max(peakProjectiles, g.projectiles.debugSnapshot().length);
    g.rebuildTargetLists();
    g.renderHudOnce();
    g.postFx.render(0);

    retireHunters();
    g.projectiles.clear();
    g.particles.update(5);
    g.explosions.update(5);
    g.debris.update(5);
    g.rebuildTargetLists();
    g.renderHudOnce();
    g.postFx.render(0);
  }

  // Let short gun sounds run their normal onended cleanup. Longer explosion
  // tails may remain active, but they must still respect the hard ceiling.
  await new Promise((resolve) => setTimeout(resolve, 260));
  const final = {
    sceneChildren: g.scene.children.length,
    geometries: g.renderer.info.memory.geometries,
    textures: g.renderer.info.memory.textures,
  };
  return {
    contextLost,
    peakHunters,
    overflowSpawned,
    peakProjectiles,
    peakAudio,
    audioLimit: g.audio.debugMaxOneShots,
    contactPool: document.querySelectorAll('.contact-marker').length,
    baseline,
    final,
  };
});
console.log('dense combat stability:', JSON.stringify(combatStability));

console.log('page errors:', errors.length === 0 ? 'none' : errors.join('\n'));

await browser.close();
server.close();
process.exit(
  errors.length > 0 ||
    !preferencesPersist ||
    disconnected.length > 0 ||
    hangarAlignment.delta > 2 ||
    missileGate.crafted || missileGate.bought || !missileGate.unchanged ||
    !missileGate.craftUi.disabled || missileGate.craftUi.label !== 'No rack' ||
    !missileGate.tradeUi.disabled || missileGate.tradeUi.label !== 'No rack' ||
    !civilianTargeting.staged || !civilianTargeting.selectedMerchant ||
    !civilianTargeting.sensorThroughClutter ||
    !civilianTargeting.informational || !civilianTargeting.friendlyStyle ||
    !civilianTargeting.wireframe || !civilianTargeting.leadHidden ||
    civilianTargeting.centeredDistance <= civilianTargeting.nearbyDistance ||
    !civilianTargeting.clearedOnFocusLoss || !civilianTargeting.reticleHidden ||
    !civilianTargeting.noFade ||
    !civilianTargeting.detail.includes('Friendly') ||
    !civilianTargeting.detail.includes('Merchant') ||
    !craftingScroll.crafted || craftingScroll.before <= 0 ||
    Math.abs(craftingScroll.after - craftingScroll.before) > 1 ||
    craftingScroll.iconLayout.holdSvgs < 4 ||
    craftingScroll.iconLayout.costSvgs < 3 ||
    craftingScroll.iconLayout.labelSpread > 1 ||
    craftingScroll.iconLayout.countSpread > 1 ||
    craftingScroll.iconLayout.minRightInset < 10 ||
    !veinPrompt.found || veinPrompt.aimed !== 'vein' ||
    !veinPrompt.anchored || !veinPrompt.stableCentroid ||
    veinPrompt.delta > 1 || !veinPrompt.eased || !veinPrompt.didNotSnap ||
    !veinPrompt.previewVisible || !veinPrompt.previewName.includes('Vein') ||
    !veinPrompt.informational || !veinPrompt.closeEnemyPriority ||
    peace.enemies !== 0 || peace.turrets !== 0 || peace.capital ||
    peace.neutrals < 2 || peace.flux < 2 || !peace.planetsClear ||
    !quest.hailed || !quest.offered || !quest.accepted || quest.active !== 1 ||
    !trade.merchant || !trade.docked || !trade.traded || trade.fluxGained !== 1 ||
    trade.engineSilenced !== 1 ||
    !trade.promptAnchored || !trade.promptText.includes('trade') ||
    trade.iconLayout.holdSvgs < 5 || trade.iconLayout.offerSvgs < 2 ||
    trade.iconLayout.fluxOrbits < 2 ||
    trade.iconLayout.labelSpread > 1 || trade.iconLayout.countSpread > 1 ||
    trade.iconLayout.rightInset < 10 || trade.iconLayout.headerDelta > 1 ||
    !planet.onPlanet || planet.garrison < 4 || planet.stashes < 3 ||
    planet.caveTunnels < 2 || !planet.caveCentersClear ||
    !planet.planetPrompt.anchored || !planet.planetPrompt.text.includes('Land') ||
    !planet.cavePassagesClear || !planet.caveGuardsClear ||
    planet.caveShellCount < 100 || !planet.caveWallsClosed ||
    planet.terrainSurfaceError > 0.01 ||
    planet.rockLobes < 10 || planet.malformedRockLobes > 0 ||
    planet.collisionProbe.idleDamage > 0.01 ||
    planet.collisionProbe.impactDamage < 5 ||
    planet.minHostile <= 200 || !planet.onSurface || !planet.level ||
    !planet.surfaceTurretsClear || !planetB.turretDamaged ||
    !planetB.allSurfaceTurretsDamageable || !planetB.lockedNear ||
    !planetB.backInSpace || !planetB.persisted ||
    !planetB.revisit.sameSurface || !planetB.revisit.harvested ||
    planetB.revisit.garrison !== 0 ||
    !jumpStart.started || !jumpStart.fluxHud ||
    postJump.sector !== 2 || postJump.enemies === 0 || !postJump.capital ||
    postJump.safeDist <= 380 ||
    !targetingPolicy.staged || !targetingPolicy.farSelectedCentred ||
    !targetingPolicy.farGrey || !targetingPolicy.nearSelectedCloser ||
    !targetingPolicy.nearRed ||
    !enemyWeaponVariety.seekerAt1050m || !enemyWeaponVariety.rotaryShip ||
    !enemyWeaponVariety.rotaryBattery ||
    !missileSetup.homing || !missileSetup.fast || !missileSetup.locked ||
    !missileSetup.tracksInFlightOnly ||
    !missileSetup.warning || !missileImminent.imminent || !missileImminent.warning ||
    !missileCountdown.nonIncreasing || !missileCountdown.missedTimerRemoved ||
    !cloakMissileBreak.activated || !cloakMissileBreak.unlocked ||
    !cloakMissileBreak.targetDropped ||
    !capitalSystems.present || capitalSystems.mounts < 8 ||
    capitalSystems.top < 4 || capitalSystems.bottom < 4 ||
    !capitalSystems.weapons.includes('bolt') ||
    !capitalSystems.weapons.includes('autogun') ||
    !capitalSystems.weapons.includes('homing') ||
    !capitalSystems.weapons.includes('fast') ||
    !capitalSystems.farMountsHidden || !capitalSystems.farHullAvailable ||
    !capitalSystems.farTargetsHull || !capitalSystems.farPreviewHull ||
    !capitalSystems.nearMountsAvailable || !capitalSystems.nearMountLock ||
    !capitalSystems.independentMount ||
    !capitalSystems.topLineOfSight || !capitalSystems.bottomOccluded ||
    capitalSystems.topShots < 1 || capitalSystems.bottomShots !== 0 ||
    !capitalSystems.rejectedFromSide || !capitalSystems.startedInFront ||
    !capitalSystems.committedWithinArc || capitalSystems.beamFired !== 1 ||
    !capitalSystems.firstObstacleDestroyed || !capitalSystems.secondObstacleSurvived ||
    !capitalSystems.playerProtected ||
    closed <= 20 ||
    camDist >= 60 ||
    turretAim.dot <= 0.85 ||
    !dev.cloakRefused || !dev.craftRefused || !dev.craftUnchanged ||
    !dev.craftThreatUi.disabled || dev.craftThreatUi.label !== 'Threat close' ||
    !dev.craftThreatUi.warning.includes('crafting locked') ||
    !dev.cloakOk || !dev.cloaked ||
    dev.energyAfter >= dev.energyBefore - 1 ||
    dev.hullOpacity > 0.06 || dev.shellOpacity < 0.1 ||
    !dev.empOk || !dev.nanoHotkey || !dev.nanoOk || !dev.healed
    || combatStability.contextLost || combatStability.peakHunters !== 12 ||
    combatStability.overflowSpawned !== 0 ||
    combatStability.peakProjectiles < 300 || combatStability.peakProjectiles > 320 ||
    combatStability.peakAudio > combatStability.audioLimit ||
    combatStability.contactPool > 50 ||
    combatStability.final.sceneChildren !== combatStability.baseline.sceneChildren ||
    combatStability.final.geometries > combatStability.baseline.geometries + 2 ||
    combatStability.final.textures > combatStability.baseline.textures
    ? 1
    : 0,
);
