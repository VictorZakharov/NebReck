import { advanceProjectileTime } from './helpers.mjs';

export async function runTargetingSmoke(page) {
  const targetingPolicy = await page.evaluate(() => {
    const game = window.game;
    const [centred, closer] = game.enemies.filter((enemy) => enemy.alive).slice(0, 2);
    const peacefulContact = game.neutrals.find((neutral) => neutral.alive);
    if (!centred || !closer || !peacefulContact) return { staged: false };
    const savedCentred = centred.position.clone();
    const savedCloser = closer.position.clone();
    const savedContact = peacefulContact.position.clone();
    const peacefulTurret = game.turrets.find((turret) =>
      turret.alive && !game.capitalTurrets.includes(turret)
    );
    const savedTurret = peacefulTurret?.position.clone();
    const origin = game.player.position.clone().set(0, 2600, 0);
    const cameraForward = origin.clone().set(0.18, 0, -1).normalize();
    const cameraRight = cameraForward.clone().cross({ x: 0, y: 1, z: 0 }).normalize();
    game.player.position.copy(origin);
    game.player.object.rotation.set(0, 0, 0);
    game.player.velocity.set(0, 0, 0);
    game.chaseCam.snapTo(game.player.object);
    game.chaseCam.camera.updateMatrixWorld(true);
    const cameraOrigin = game.chaseCam.camera.position.clone();

    centred.position.copy(origin).addScaledVector(cameraForward, 900);
    closer.position.copy(origin).add({ x: 0, y: 0, z: -650 });
    game.targeting.current = null;
    game.targeting.update(
      game.player,
      [centred, closer],
      [],
      340,
      500,
      cameraForward,
    );
    game.renderHudOnce();
    const box = document.querySelector('.target-box');
    const farSelectedCentred = game.targeting.current?.ship === centred;
    const farGrey =
      box?.classList.contains('far') &&
      getComputedStyle(box).borderTopColor.includes('150, 165, 175');

    // Regression for the live failure: the contact directly under the reticle
    // at 1,847 m must beat a 1,444 m contact several degrees off-axis. Sensor
    // inspection is not capped by the 1,500 m combat-era acquire distance.
    centred.position.copy(cameraOrigin).addScaledVector(cameraForward, 1847);
    closer.position
      .copy(cameraOrigin)
      .addScaledVector(cameraForward, 1435)
      .addScaledVector(cameraRight, 160);
    game.targeting.current = null;
    game.targeting.update(
      game.player,
      [centred, closer],
      [],
      340,
      500,
      cameraForward,
      false,
      cameraOrigin,
    );
    let unlimitedScanSelectedCentred =
      game.targeting.current?.ship === centred && game.targeting.current.distance > 1800;
    const blocker = game.world.bodies.find((body) => !body.destroyed && !body.box);
    const blockerPosition = blocker?.position.clone(), blockerRadius = blocker?.radius;
    if (blocker) {
      blocker.position.copy(cameraOrigin).addScaledVector(cameraForward, 700);
      blocker.radius = 90;
    }
    const centredOccluded = !game.combat.hasLineOfSight(
      game.player.position, centred.position, null, centred,
    );
    game.targeting.current = null;
    game.targeting.update(
      game.player, [centred, closer], [], 340, 500, cameraForward, false, cameraOrigin,
    );
    unlimitedScanSelectedCentred &&=
      centredOccluded && game.targeting.current?.ship === centred;
    if (blocker && blockerPosition && blockerRadius !== undefined) { blocker.position.copy(blockerPosition); blocker.radius = blockerRadius; }
    centred.position.copy(origin).addScaledVector(cameraForward, 450);
    closer.position.copy(origin).add({ x: 15, y: 0, z: -100 });
    game.targeting.current = null;
    game.targeting.update(
      game.player,
      [centred, closer],
      [],
      340,
      500,
      cameraForward,
      false,
    );
    const unpursuedSelectedCentred = game.targeting.current?.ship === centred;

    if (peacefulTurret) {
      centred.position.copy(origin).addScaledVector(cameraForward, 700)
        .addScaledVector(cameraRight, 90);
      peacefulTurret.position.copy(origin).addScaledVector(cameraForward, 850);
      game.targeting.current = null;
      game.targeting.update(
        game.player, [centred, peacefulTurret], [], 340, 500, cameraForward, false,
      );
    }
    const unpursuedTurretSelected = game.targeting.current?.ship === peacefulTurret;

    game.targeting.current = null;
    game.targeting.update(
      game.player,
      [centred, closer],
      [],
      340,
      500,
      cameraForward,
      true,
    );
    game.renderHudOnce();
    const pursuedSelectedCloser = game.targeting.current?.ship === closer;
    const nearRed =
      !box?.classList.contains('far') &&
      getComputedStyle(box).borderTopColor.includes('255, 59, 48');

    centred.position
      .copy(origin)
      .addScaledVector(cameraForward, 900)
      .addScaledVector(cameraRight, 20);
    peacefulContact.position.copy(origin).addScaledVector(cameraForward, 1100);
    game.targeting.current = null;
    game.targeting.update(
      game.player,
      [centred],
      [peacefulContact],
      340,
      500,
      cameraForward,
      false,
    );
    const peaceSelectedCentredContact =
      game.targeting.current?.ship === peacefulContact && game.targeting.aimTarget === null;

    game.targeting.current = null;
    game.targeting.update(
      game.player,
      [centred],
      [peacefulContact],
      340,
      500,
      cameraForward,
      true,
    );
    const combatPreservesHostilePriority =
      game.targeting.current?.ship === centred &&
      game.targeting.aimTarget?.ship === centred;

    centred.position.copy(savedCentred);
    closer.position.copy(savedCloser);
    peacefulContact.position.copy(savedContact);
    if (peacefulTurret && savedTurret) peacefulTurret.position.copy(savedTurret);
    game.targeting.current = null;
    return {
      staged: true,
      farSelectedCentred,
      farGrey,
      unlimitedScanSelectedCentred,
      unpursuedSelectedCentred,
      unpursuedTurretSelected,
      pursuedSelectedCloser,
      nearRed,
      peaceSelectedCentredContact,
      combatPreservesHostilePriority,
    };
  });
  console.log('targeting policy:', JSON.stringify(targetingPolicy));

  const enemyWeaponVariety = await page.evaluate(() => {
    const game = window.game;
    game.player.position.set(0, 2600, 0);
    game.player.velocity.set(0, 0, 0);
    const start = game.enemies.length;
    game.spawnEnemy({
      kind: 'bomber',
      position: game.player.position.clone().add({ x: 0, y: 0, z: -1050 }),
      aggression: 1,
      weaponMode: 'homing',
    });
    const bomber = game.enemies[game.enemies.length - 1];
    bomber.faceToward(game.player.position);
    bomber.fireTimer = 0;
    let seekerShots = 0;
    bomber.update(
      1 / 60,
      game.player.position,
      game.player.velocity,
      () => seekerShots++,
      true,
    );

    game.spawnEnemy({
      kind: 'raider',
      position: game.player.position.clone().add({ x: 0, y: 0, z: -300 }),
      aggression: 1,
      weaponMode: 'autogun',
    });
    const rotary = game.enemies[game.enemies.length - 1];
    rotary.faceToward(game.player.position);
    rotary.fireTimer = 0;
    let rotaryBursts = 0;
    rotary.update(
      0.06,
      game.player.position,
      game.player.velocity,
      () => rotaryBursts++,
      true,
    );
    rotary.update(
      0.06,
      game.player.position,
      game.player.velocity,
      () => rotaryBursts++,
      true,
    );
    const battery = game.capitalTurrets.find((turret) => turret.weapon === 'autogun');
    const result = {
      seekerAt1050m: bomber.rocketMode === 'homing' && seekerShots > 0,
      rotaryShip: rotary.autoGun && rotaryBursts >= 2,
      rotaryBattery:
        battery?.kind === 'autogun-turret' && battery.stats.fireCooldown <= 0.11,
    };
    const temporary = game.enemies.splice(start);
    for (const enemy of temporary) {
      game.scene.remove(enemy.object);
      enemy.dispose();
    }
    return result;
  });
  console.log('enemy weapon variety:', JSON.stringify(enemyWeaponVariety));

  const missileSetup = await page.evaluate(() => {
    const game = window.game;
    game.projectiles.clear();
    const seekerCarriers = [
      ...game.enemies.filter((enemy) => enemy.rocketMode === 'homing'),
      ...game.turrets.filter((turret) => turret.weapon === 'homing'),
    ].length;
    const beforeLaunch = game.projectiles.incomingThreat(game.player);
    const idleThreat = { locked: beforeLaunch.locked, count: beforeLaunch.count };
    game.devices.breakCloak();
    game.devices.cloakCooldown = 0;
    game.cloakVisual.set(game.player, false);
    game.player.alive = true;
    game.player.hull = game.player.hullMax;
    game.player.shield = game.player.shieldMax;
    game.player.position.set(0, 2600, 0);
    game.player.velocity.set(0, 0, 0);
    const seekerOrigin = game.player.position.clone();
    seekerOrigin.z -= 380;
    const fastOrigin = seekerOrigin.clone();
    fastOrigin.x += 28;
    game.projectiles.spawnEnemyRocket(
      seekerOrigin,
      game.player.position.clone().sub(seekerOrigin),
      game.player,
      'homing',
    );
    game.projectiles.spawnEnemyRocket(
      fastOrigin,
      game.player.position.clone().sub(fastOrigin),
      game.player,
      'fast',
    );
    const playerOrigin = seekerOrigin.clone();
    playerOrigin.x -= 28;
    game.projectiles.spawnMissile(
      playerOrigin,
      game.player.position.clone().sub(playerOrigin),
      null,
    );
    const snapshot = game.projectiles.debugSnapshot()
      .filter((shot) => shot.faction === 'enemy');
    const enemySeekerDamage = game.projectiles.pool.find((shot) =>
      shot.active && shot.faction === 'enemy' && shot.homing
    )?.damage ?? 0;
    const playerSeekerDamage = game.projectiles.pool.find((shot) =>
      shot.active && shot.faction === 'player' && shot.homing
    )?.damage ?? 0;
    const threat = game.projectiles.incomingThreat(game.player);
    const activeTrackingRockets = snapshot.filter(
      (shot) => shot.kind === 'missile' && shot.homing && shot.hasTarget,
    ).length;
    game.renderHudOnce();
    const warning = document.querySelector('.missile-warning');
    return {
      homing: snapshot.some((shot) => shot.homing && shot.hasTarget && shot.speed < 150),
      fast: snapshot.some((shot) => !shot.homing && !shot.hasTarget && shot.speed > 250),
      enemySeekerDamage,
      playerSeekerDamage,
      locked: threat.locked && !threat.imminent && threat.count === 1,
      tracksInFlightOnly:
        seekerCarriers > 0 &&
        !idleThreat.locked &&
        idleThreat.count === 0 &&
        threat.count === activeTrackingRockets &&
        activeTrackingRockets === 1,
      warning:
        warning?.classList.contains('show') &&
        !warning.classList.contains('imminent'),
    };
  });
  await advanceProjectileTime(page, 0.3);
  const missileImminent = await page.evaluate(() => {
    const game = window.game;
    const threat = game.projectiles.incomingThreat(game.player);
    game.renderHudOnce();
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
    const game = window.game;
    const inbound = game.projectiles.incomingThreat(game.player);
    const wasImminent = inbound.imminent;
    const currentEta = inbound.timeToImpact;
    const seeker = game.projectiles.pool.find((shot) =>
      shot.active &&
      shot.faction === 'enemy' &&
      shot.homing &&
      shot.target === game.player
    );
    if (seeker) {
      seeker.mesh.position.copy(game.player.position).add({ x: 0, y: 0, z: 45 });
      seeker.velocity
        .copy(seeker.mesh.position)
        .sub(game.player.position)
        .normalize()
        .multiplyScalar(205);
    }
    const missed = game.projectiles.incomingThreat(game.player);
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
    const game = window.game;
    const threat = game.projectiles.incomingThreat(game.player);
    const targetDropped = game.projectiles.debugSnapshot()
      .filter((shot) => shot.faction === 'enemy' && shot.homing)
      .every((shot) => !shot.hasTarget);
    game.devices.breakCloak();
    game.devices.cloakCooldown = 0;
    game.cloakVisual.set(game.player, false);
    game.projectiles.clear();
    return { unlocked: !threat.locked, targetDropped };
  }));
  console.log('enemy missiles:', JSON.stringify({
    missileSetup,
    missileImminent,
    missileCountdown,
    cloakMissileBreak,
  }));

  const playerSeekerRange = await page.evaluate(() => {
    const game = window.game;
    const target = game.enemies.find((enemy) => enemy.alive);
    if (!target) return { staged: false };
    const savedPosition = target.position.clone();
    const savedVelocity = target.velocity.clone();
    const origin = game.player.position.clone().set(0, 5000, 0);
    const direction = origin.clone().set(0, 0, -1);

    const fireProbe = (distance) => {
      target.position.copy(origin).addScaledVector(direction, distance);
      target.velocity.set(0, 0, 0);
      game.projectiles.clear();
      game.projectiles.spawnMissile(origin, direction, target);
      const missile = game.projectiles.pool.find(
        (shot) => shot.active && shot.faction === 'player' && shot.homing,
      );
      let hit = false;
      for (
        let step = 0;
        step < 420 && game.projectiles.debugSnapshot().length > 0;
        step++
      ) {
        game.projectiles.update(
          1 / 60,
          [target],
          null,
          [],
          () => { hit = true; },
        );
      }
      return { hit, maxDistance: missile?.maxDistance ?? 0 };
    };

    const beyond = fireProbe(1200);
    const within = fireProbe(900);
    game.projectiles.clear();
    target.position.copy(savedPosition);
    target.velocity.copy(savedVelocity);
    return {
      staged: true,
      maxDistance: beyond.maxDistance,
      beyondExpired: !beyond.hit,
      withinHit: within.hit,
    };
  });
  console.log('player seeker range:', JSON.stringify(playerSeekerRange));

  const flightKeyChord = await page.evaluate(() => {
    const input = window.game.input;
    const savedCapture = input.flightKeysActive;
    input.flightKeysActive = true;
    const controlDown = new KeyboardEvent('keydown', {
      key: 'Control',
      code: 'ControlLeft',
      ctrlKey: true,
      cancelable: true,
    });
    const forwardDown = new KeyboardEvent('keydown', {
      key: 'w',
      code: 'KeyW',
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(controlDown);
    window.dispatchEvent(forwardDown);
    const result = {
      consumed: forwardDown.defaultPrevented,
      forward: input.isDown('KeyW'),
      descend: input.isDown('ControlLeft'),
    };
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlLeft' }));
    input.flightKeysActive = savedCapture;
    return result;
  });
  console.log('flight key chord:', JSON.stringify(flightKeyChord));

  return {
    targetingPolicy,
    enemyWeaponVariety,
    missileSetup,
    missileImminent,
    missileCountdown,
    cloakMissileBreak,
    playerSeekerRange,
    flightKeyChord,
  };
}
