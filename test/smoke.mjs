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

// The exact static hangar review route used for visual testing must commit a
// selection on click. ENGAGE is deliberately never pressed in this scenario.
const preferencePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
preferencePage.on('pageerror', (e) => errors.push(e.message));
preferencePage.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await preferencePage.goto(`http://localhost:${PORT}/?testScene=hangar&seed=7`, { waitUntil: 'load' });
await preferencePage.waitForTimeout(600);
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
await preferencePage.waitForTimeout(400);
const preferenceReloaded = await preferencePage.evaluate(() => ({
  ship: window.game.selectedShipId,
  difficulty: window.game.selectedDifficultyId,
  playerShip: window.game.player.def.id,
  state: window.game.state,
}));
await preferencePage.close();
const preferencesPersist =
  preferenceWritten.ship === preferenceReloaded.ship &&
  preferenceWritten.difficulty === preferenceReloaded.difficulty &&
  preferenceWritten.playerShip === preferenceWritten.ship &&
  preferenceReloaded.playerShip === preferenceReloaded.ship &&
  preferenceWritten.state === 'hangar' &&
  preferenceReloaded.state === 'hangar' &&
  preferenceWritten.cookie.includes('cleverspace_ship=') &&
  preferenceWritten.cookie.includes('cleverspace_difficulty=');
console.log(
  'hangar preferences:',
  JSON.stringify({ written: preferenceWritten, reloaded: preferenceReloaded, persisted: preferencesPersist }),
);

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// Pinned seed: the default page rolls a random world per session.
await page.goto(`http://localhost:${PORT}/?seed=99&headless=1`, { waitUntil: 'load' });
await page.waitForTimeout(1000);

// Fullscreen-like tall viewport: the independent action visor must retain the
// ship-selector row's bottom baseline instead of remaining at its windowed Y.
await page.evaluate(() => window.game.showHangar());
await page.setViewportSize({ width: 1920, height: 1080 });
await page.waitForTimeout(350);
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
await page.waitForTimeout(350);

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

await page.evaluate(() => window.game.startMission());

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
  g.renderHudOnce();
  const prompt = document.querySelector('.interact-prompt');
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
  };
});
console.log('planetfall:', JSON.stringify(planet));

// Let the test bolts fly, then stage the near-lock scenario: player ~120 m
// from a live turret, aiming at it — soft lock must pick the CLOSE turret,
// not some fighter a kilometre out (distance-weighted targeting).
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.game;
  const t0 = g.turrets[0];
  window.__smoke.turretDamaged = !t0.alive || t0.hull < window.__smoke.turretHullBefore;
  const target = g.turrets.find((x) => x.alive) ?? t0;
  g.player.hull = g.player.hullMax;
  g.player.position.set(target.position.x + 80, target.position.y + 40, target.position.z + 80);
  g.player.velocity.set(0, 0, 0);
  g.player.faceToward(target.position);
});
await page.waitForTimeout(2500);
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
  const started = g.startJump(true);
  if (started) g.jumpSpool = 0.05;
  return {
    started,
    state: g.state,
    alive: g.player.alive,
    flux: g.inventory.counts.flux,
    spool: g.jumpSpool,
  };
});
console.log('jump start:', JSON.stringify(jumpStart));
await page.waitForTimeout(4000);
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

// 4. Hunter dispatch + engagement.
await page.evaluate(() => {
  const g = window.game;
  // From this point onward use deterministic stepping. Hosted SwiftShader can
  // render only a handful of rAF frames during an eight-second wall-clock wait,
  // which used to make both this movement check and the following camera check
  // report failures unrelated to gameplay.
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
  g.player.position.set(0, 2600, 0);
  g.player.velocity.set(0, 0, 0);
  const cloakOk = g.activateCloak();
  const cloaked = g.devices.cloaked;
  const energyBefore = g.weapons.energy;
  for (let i = 0; i < 60; i++) g.loop.stepManual(1 / 60);
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
  g.player.hull = Math.max(1, g.player.hullMax - 50);
  const before = g.player.hull;
  const nanoOk = g.useNanobots();
  return {
    cloakRefused,
    cloakOk,
    cloaked,
    energyBefore: Number(energyBefore.toFixed(2)),
    energyAfter: Number(energyAfter.toFixed(2)),
    hullOpacity: Number(hullOpacity.toFixed(3)),
    shellOpacity: Number(shellOpacity.toFixed(3)),
    empOk,
    nanoOk,
    healed: g.player.hull > before,
  };
});
console.log('devices:', JSON.stringify(dev));

console.log('page errors:', errors.length === 0 ? 'none' : errors.join('\n'));

await browser.close();
server.close();
process.exit(
  errors.length > 0 ||
    !preferencesPersist ||
    disconnected.length > 0 ||
    hangarAlignment.delta > 2 ||
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
    peace.enemies !== 0 || peace.turrets !== 0 || peace.capital ||
    peace.neutrals < 2 || peace.flux < 2 || !peace.planetsClear ||
    !quest.hailed || !quest.offered || !quest.accepted || quest.active !== 1 ||
    !trade.merchant || !trade.docked || !trade.traded || trade.fluxGained !== 1 ||
    trade.engineSilenced !== 1 ||
    trade.iconLayout.holdSvgs < 5 || trade.iconLayout.offerSvgs < 2 ||
    trade.iconLayout.fluxOrbits < 2 ||
    trade.iconLayout.labelSpread > 1 || trade.iconLayout.countSpread > 1 ||
    trade.iconLayout.rightInset < 10 || trade.iconLayout.headerDelta > 1 ||
    !planet.onPlanet || planet.garrison < 4 || planet.stashes < 3 ||
    planet.caveTunnels < 2 || !planet.caveCentersClear ||
    !planet.cavePassagesClear || !planet.caveGuardsClear ||
    planet.caveShellCount < 100 || !planet.caveWallsClosed ||
    planet.terrainSurfaceError > 0.01 ||
    planet.rockLobes < 10 || planet.malformedRockLobes > 0 ||
    planet.collisionProbe.idleDamage > 0.01 ||
    planet.collisionProbe.impactDamage < 5 ||
    planet.minHostile <= 200 || !planet.onSurface || !planet.level ||
    !planetB.turretDamaged || !planetB.lockedNear ||
    !planetB.backInSpace || !planetB.persisted ||
    !planetB.revisit.sameSurface || !planetB.revisit.harvested ||
    planetB.revisit.garrison !== 0 ||
    !jumpStart.started ||
    postJump.sector !== 2 || postJump.enemies === 0 || !postJump.capital ||
    postJump.safeDist <= 380 ||
    closed <= 20 ||
    camDist >= 60 ||
    turretAim.dot <= 0.85 ||
    !dev.cloakRefused || !dev.cloakOk || !dev.cloaked ||
    dev.energyAfter >= dev.energyBefore - 1 ||
    dev.hullOpacity > 0.06 || dev.shellOpacity < 0.1 ||
    !dev.empOk || !dev.nanoOk || !dev.healed
    ? 1
    : 0,
);
