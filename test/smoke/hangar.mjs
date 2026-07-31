import { capturePageErrors, settleBrowserFrames } from './helpers.mjs';

export async function runPreferenceSmoke(browser, baseUrl, errors) {
  // The exact static hangar review route used for visual testing must commit a
  // selection on click. ENGAGE is deliberately never pressed here.
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  capturePageErrors(page, errors, 'preference page');
  await page.context().addCookies([
    { name: 'cleverspace_ship', value: 'aegis', url: baseUrl },
    { name: 'cleverspace_difficulty', value: 'reckoning', url: baseUrl },
  ]);
  await page.goto(`${baseUrl}/?testScene=hangar&seed=7`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__RENDER_DONE__ === true);
  await settleBrowserFrames(page);
  const migrated = await page.evaluate(() => ({
    ship: window.game.selectedShipId,
    difficulty: window.game.selectedDifficultyId,
    cookie: document.cookie,
  }));
  const written = await page.evaluate(() => {
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
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__RENDER_DONE__ === true);
  await settleBrowserFrames(page);
  const reloaded = await page.evaluate(() => ({
    ship: window.game.selectedShipId,
    difficulty: window.game.selectedDifficultyId,
    playerShip: window.game.player.def.id,
    state: window.game.state,
  }));
  await page.close();

  const persisted =
    migrated.ship === 'aegis' &&
    migrated.difficulty === 'reckoning' &&
    migrated.cookie.includes('nebreck_ship=aegis') &&
    migrated.cookie.includes('nebreck_difficulty=reckoning') &&
    written.ship === reloaded.ship &&
    written.difficulty === reloaded.difficulty &&
    written.playerShip === written.ship &&
    reloaded.playerShip === reloaded.ship &&
    written.state === 'hangar' &&
    reloaded.state === 'hangar' &&
    written.cookie.includes('nebreck_ship=') &&
    written.cookie.includes('nebreck_difficulty=');
  console.log('hangar preferences:', JSON.stringify({ migrated, written, reloaded, persisted }));
  return persisted;
}

export async function runHangarSmoke(page) {
  // Fullscreen-like tall viewport: the independent action visor must retain
  // the ship-selector row's bottom baseline.
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

  // Structural QA: every hull must be one connected geometry-level body.
  const shipAudit = await page.evaluate(() => window.auditShips());
  const disconnected = shipAudit.filter((audit) => audit.components !== 1);
  console.log(
    'ship connectivity:',
    disconnected.length === 0
      ? `all ${shipAudit.length} hulls fully connected`
      : disconnected
          .map((audit) =>
            `${audit.kind}: ${audit.components} pieces, orphans [${audit.orphans.join(', ')}]`)
          .join(' / '),
  );

  await page.evaluate(() => {
    window.game.startMission();
    // The assertions use deterministic stepping, not background rAF.
    window.game.loop.stop();
  });

  const missileGate = await page.evaluate(() => {
    const game = window.game;
    const previousRate = game.weapons.missileRate;
    game.weapons.missileRate = 0;
    game.inventory.add('scrap', 20);
    const before = {
      scrap: game.inventory.counts.scrap,
      missiles: game.inventory.missiles,
    };
    const crafted = game.craft('missile-rack');
    const bought = game.executeTrade('buy-missiles');

    game.openLoadout();
    const craftRow = [...document.querySelectorAll('.recipe-row')]
      .find((row) => row.textContent.includes('Seeker Missiles'));
    const craftButton = craftRow?.querySelector('button');
    const craftUi = {
      disabled: craftButton?.disabled ?? false,
      label: craftButton?.textContent ?? '',
    };
    game.closeLoadout();

    game.openTrade();
    const tradeRow = [...document.querySelectorAll('.recipe-row')]
      .find((row) => row.textContent.includes('Seeker Missiles'));
    const tradeButton = tradeRow?.querySelector('button');
    const tradeUi = {
      disabled: tradeButton?.disabled ?? false,
      label: tradeButton?.textContent ?? '',
    };
    game.closeTrade();
    game.weapons.missileRate = previousRate;

    return {
      crafted,
      bought,
      unchanged:
        game.inventory.counts.scrap === before.scrap &&
        game.inventory.missiles === before.missiles,
      craftUi,
      tradeUi,
    };
  });
  console.log('missile rack gate:', JSON.stringify(missileGate));

  // Civilian ranking is angular: a far contact directly under the crosshair
  // beats a much nearer off-axis contact when combat is not active.
  const civilianTargeting = await page.evaluate(() => {
    const game = window.game;
    const merchant = game.neutrals.find((neutral) => neutral.isMerchant);
    const nearby = game.neutrals.find((neutral) => neutral !== merchant);
    const blocked = game.neutrals.find(
      (neutral) => neutral !== merchant && neutral !== nearby,
    );
    if (!merchant || !nearby || !blocked) return { staged: false };
    const savedMerchant = merchant.position.clone();
    const savedNearby = nearby.position.clone();
    const savedBlocked = blocked.position.clone();
    const origin = game.player.position.clone();
    const cameraForward = merchant.position.clone().set(0.18, 0, -1).normalize();
    game.player.object.rotation.set(0, 0, 0);
    merchant.position.copy(origin).addScaledVector(cameraForward, 600);
    nearby.position.copy(origin).add({ x: 0, y: 0, z: -100 });
    blocked.position.copy(origin).add({ x: 0, y: 0, z: -110 });
    game.chaseCam.snapTo(game.player.object);
    game.chaseCam.camera.updateMatrixWorld(true);
    game.targeting.update(
      game.player,
      [blocked],
      [nearby, merchant],
      game.weapons.weapon.projectileSpeed,
      500,
      cameraForward,
      false,
    );
    game.renderHudOnce();
    const current = game.targeting.current;
    const preview = document.querySelector('.target-preview');
    const result = {
      staged: true,
      selectedMerchant: current?.ship === merchant,
      sensorThroughClutter: current?.ship === merchant,
      informational: current?.aimAssist === false && game.targeting.aimTarget === null,
      detail: document.querySelector('.preview-detail')?.textContent ?? '',
      friendlyStyle: preview?.classList.contains('friendly') ?? false,
      wireframe: !!preview?.querySelector('canvas'),
      leadHidden: document.querySelector('.lead-pip')?.style.opacity === '0',
      centeredDistance: Math.round(merchant.position.distanceTo(origin)),
      nearbyDistance: Math.round(nearby.position.distanceTo(origin)),
    };
    merchant.position.copy(origin).add({ x: 220, y: 0, z: -100 });
    nearby.position.copy(origin).add({ x: -220, y: 0, z: -100 });
    game.targeting.update(
      game.player,
      [blocked],
      [nearby, merchant],
      game.weapons.weapon.projectileSpeed,
      500,
      cameraForward,
      false,
    );
    game.renderHudOnce();
    const targetBox = document.querySelector('.target-box');
    const transitionSeconds = targetBox
      ? getComputedStyle(targetBox).transitionDuration
          .split(',')
          .map((duration) => Number.parseFloat(duration))
      : [Infinity];
    result.clearedOnFocusLoss = game.targeting.current === null;
    result.reticleHidden = targetBox?.style.opacity === '0';
    result.noFade = transitionSeconds.every((duration) => duration === 0);
    merchant.position.copy(savedMerchant);
    nearby.position.copy(savedNearby);
    blocked.position.copy(savedBlocked);
    game.targeting.current = null;
    return result;
  });
  console.log('civilian targeting:', JSON.stringify(civilianTargeting));

  const craftingScroll = await page.evaluate(() => {
    const game = window.game;
    game.inventory.add('scrap', 99);
    game.inventory.add('crystal', 99);
    game.inventory.add('flux', 9);
    game.openLoadout();
    const pane = document.querySelector('.loadout-right');
    pane.scrollTop = Math.min(120, pane.scrollHeight - pane.clientHeight);
    const before = pane.scrollTop;
    const row = [...document.querySelectorAll('.recipe-row')]
      .find((candidate) => candidate.textContent.includes('Engine Tuning'));
    const levelBefore = game.inventory.levels.get('engine-tune') ?? 0;
    row?.querySelector('button')?.click();
    const afterPane = document.querySelector('.loadout-right');
    const after = afterPane?.scrollTop ?? -1;
    const crafted = (game.inventory.levels.get('engine-tune') ?? 0) === levelBefore + 1;
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
    game.closeLoadout();
    return { before, after, crafted, iconLayout };
  });
  console.log('crafting scroll:', JSON.stringify(craftingScroll));

  // Every crystal on a vein shares its centroid anchor, and ordinary motion
  // is screen-space damped instead of snapping between crystal points.
  const veinPrompt = await page.evaluate(() => {
    const game = window.game;
    const body = game.sector.asteroids.bodies.find(
      (candidate) => candidate.orePoints.length > 0,
    );
    if (!body) return { found: false };
    const point = body.orePoints[0];
    const centroid = point.clone().set(0, 0, 0);
    for (const orePoint of body.orePoints) centroid.add(orePoint);
    centroid.multiplyScalar(1 / body.orePoints.length);
    const outward = point.clone().sub(body.position).normalize();
    game.player.position.copy(point).addScaledVector(outward, 120);
    game.player.velocity.set(0, 0, 0);
    game.player.faceToward(point);
    game.chaseCam.snapTo(game.player.object);
    game.chaseCam.camera.updateMatrixWorld(true);
    game.lootAimed = game.aimedLoot(-1);
    game.targeting.current = null;
    game.renderHudOnce();
    const prompt = document.querySelector('.interact-prompt');
    const preview = document.querySelector('.target-preview');
    const previewName = document.querySelector('[data-el="previewName"]')?.textContent ?? '';
    const ore = game.lootAimBody?.ore;
    const expectedPreviewColor = ore === 'crystal' ? 0x2ee6c8 : 0xffa040;
    const resourceColorMatched =
      game.hudPresenter.targetPreview.mat.color.getHex() === expectedPreviewColor;
    const previewRotation =
      game.hudPresenter.targetPreview.mounted.wireframe.quaternion.clone();
    game.hudPresenter.targetPreview.update('ore-scrap', 1, previewRotation, 'neutral');
    const scrapPreviewMatched =
      game.hudPresenter.targetPreview.mat.color.getHex() === 0xffa040;
    game.hudPresenter.targetPreview.update('ore-crystal', 1, previewRotation, 'neutral');
    const crystalPreviewMatched =
      game.hudPresenter.targetPreview.mat.color.getHex() === 0x2ee6c8;
    game.renderHudOnce();
    const projected = centroid.clone().project(game.chaseCam.camera);
    const expectedX = (projected.x * 0.5 + 0.5) * innerWidth;
    const expectedY = (-projected.y * 0.5 + 0.5) * innerHeight;
    const firstX = parseFloat(prompt.style.left);
    const firstY = parseFloat(prompt.style.top);
    const stableCentroid = game.lootAimPoint.distanceTo(centroid) < 0.001;

    game.lootAimPoint.x += 28;
    const movedProjection = game.lootAimPoint.clone().project(game.chaseCam.camera);
    const movedRawX = (movedProjection.x * 0.5 + 0.5) * innerWidth;
    const movedRawY = (-movedProjection.y * 0.5 + 0.5) * innerHeight;
    game.renderHudOnce();
    const secondX = parseFloat(prompt.style.left);
    const secondY = parseFloat(prompt.style.top);
    game.lootAimPoint.copy(centroid);
    return {
      found: true,
      aimed: game.lootAimed,
      anchored: prompt.classList.contains('world-anchored'),
      stableCentroid,
      delta: Math.hypot(firstX - expectedX, firstY - expectedY),
      eased: Math.hypot(secondX - firstX, secondY - firstY) > 0.1,
      didNotSnap: Math.hypot(secondX - movedRawX, secondY - movedRawY) > 1,
      previewVisible: preview?.classList.contains('show') ?? false,
      previewName,
      resourceColorMatched,
      resourcePaletteMatched: scrapPreviewMatched && crystalPreviewMatched,
      informational: game.targeting.current === null && game.targeting.aimTarget === null,
      closeEnemyPriority: game.aimedLoot(1) === null,
    };
  });
  console.log('vein prompt:', JSON.stringify(veinPrompt));

  return {
    hangarAlignment,
    disconnected,
    missileGate,
    civilianTargeting,
    craftingScroll,
    veinPrompt,
  };
}
