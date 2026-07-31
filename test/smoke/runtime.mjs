export async function runRuntimeSmoke(page) {
  await page.evaluate(() => {
    const game = window.game;
    game.loop.stop();
    game.encounters.dispatchWing(3, game.player.position);
  });
  const averageHunterDistance = () => page.evaluate(() => {
    const game = window.game;
    const hunters = game.enemies.filter((enemy) => enemy.hunter);
    if (hunters.length === 0) return 0;
    return hunters.reduce(
      (sum, enemy) => sum + enemy.position.distanceTo(game.player.position),
      0,
    ) / hunters.length;
  });
  const distanceBefore = await averageHunterDistance();
  await page.evaluate(() => {
    const game = window.game;
    const hunters = game.enemies.filter((enemy) => enemy.hunter);
    for (let frame = 0; frame < 240; frame++) {
      for (const hunter of hunters) {
        hunter.update(
          1 / 30,
          game.player.position,
          game.player.velocity,
          () => {},
          true,
        );
      }
    }
  });
  const distanceAfter = await averageHunterDistance();
  const closed = distanceBefore - distanceAfter;
  console.log(
    `engagement: hunters ${distanceBefore.toFixed(0)} -> ` +
      `${distanceAfter.toFixed(0)} (closed ${closed.toFixed(0)}, must be > 20)`,
  );

  await page.evaluate(() => {
    const game = window.game;
    game.player.position.set(0, 0, -400);
    for (let frame = 0; frame < 120; frame++) {
      game.chaseCam.update(
        1 / 30,
        game.player.object,
        game.player.speedFrac,
        game.player.boosting,
      );
    }
  });
  const camDist = await page.evaluate(() =>
    window.game.chaseCam.camera.position.distanceTo(window.game.player.position)
  );
  console.log(`camera follow: ${camDist.toFixed(1)} units from ship (must be < 60)`);

  await page.evaluate(() => {
    const game = window.game;
    const turret = game.turrets.find((candidate) => candidate.alive);
    game.player.position.copy(turret.position);
    game.player.position.y += 150;
    game.player.velocity.set(0, 0, 0);
    for (let frame = 0; frame < 180; frame++) {
      turret.update(
        1 / 60,
        game.player.position,
        true,
        () => {},
        true,
      );
    }
  });
  const turretAim = await page.evaluate(() => {
    const game = window.game;
    const turret = game.turrets.find((candidate) => candidate.alive);
    if (!turret) return { dot: -1 };
    const forward = turret.velocity.clone();
    turret.forward(forward);
    const toPlayer = game.player.position.clone().sub(turret.position).normalize();
    return { dot: Number(forward.dot(toPlayer).toFixed(3)) };
  });
  console.log(`turret overhead aim: dot=${turretAim.dot} (must be > 0.85)`);

  const dev = await page.evaluate(() => {
    const game = window.game;
    const turret = game.turrets.find((candidate) => candidate.alive);
    game.player.position.copy(turret.position);
    game.player.position.y += 60;
    const cloakRefused = !game.activateCloak();
    game.inventory.add('scrap', 6);
    const nanobotsBeforeThreat = game.inventory.nanobots;
    const scrapBeforeThreat = game.inventory.counts.scrap;
    const craftRefused = !game.craft('nanobot-kit');
    game.openLoadout();
    const threatButton = [...document.querySelectorAll('.recipe-row')]
      .find((row) => row.textContent.includes('Nanobot Kit'))
      ?.querySelector('button');
    const craftThreatUi = {
      disabled: threatButton?.disabled ?? false,
      label: threatButton?.textContent ?? '',
      warning: document.querySelector('.loadout-hint')?.textContent ?? '',
    };
    game.closeLoadout();
    const craftUnchanged =
      game.inventory.nanobots === nanobotsBeforeThreat &&
      game.inventory.counts.scrap === scrapBeforeThreat;
    game.player.position.set(0, 2600, 0);
    game.player.velocity.set(0, 0, 0);
    const cloakOk = game.activateCloak();
    const cloaked = game.devices.cloaked;
    const energyBefore = game.weapons.energy;
    for (let frame = 0; frame < 60; frame++) game.updateDevices(1 / 60);
    const energyAfter = game.weapons.energy;
    let hullOpacity = 0;
    game.player.exterior.traverse((object) => {
      if (object.isMesh && object.material !== game.cloakShellMat) {
        hullOpacity = Math.max(hullOpacity, object.material.opacity);
      }
    });
    const shellOpacity = game.cloakShellMat?.opacity ?? 0;
    const empOk = game.activateEmp();
    game.inventory.nanobots = 1;
    game.renderHudOnce();
    const nanoHotkey =
      document.querySelector('[data-el="devNano"]')?.textContent === 'Nano H ×1';
    game.player.hull = Math.max(1, game.player.hullMax - 50);
    const before = game.player.hull;
    const nanoOk = game.useNanobots();
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
      healed: game.player.hull > before,
    };
  });
  console.log('devices:', JSON.stringify(dev));

  // Repeatedly fill reinforcement/projectile ceilings and verify per-actor GPU
  // resources return to their baseline after cleanup.
  const combatStability = await page.evaluate(async () => {
    const game = window.game;
    game.loop.stop();
    let contextLost = false;
    game.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      contextLost = true;
      event.preventDefault();
    });

    const retireHunters = () => {
      for (const enemy of [...game.enemies]) {
        if (!enemy.hunter) continue;
        enemy.shield = 0;
        enemy.hull = 1;
        game.combat.resolveHit({
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
    game.projectiles.clear();
    game.rebuildTargetLists();
    game.renderHudOnce();
    game.postFx.render(0);
    const baseline = {
      sceneChildren: game.scene.children.length,
      geometries: game.renderer.info.memory.geometries,
      textures: game.renderer.info.memory.textures,
    };

    game.audio.init();
    let peakHunters = 0;
    let peakProjectiles = 0;
    let peakAudio = 0;
    let overflowSpawned = 0;
    for (let cycle = 0; cycle < 5; cycle++) {
      game.encounters.dispatchWing(100, game.player.position);
      overflowSpawned += game.encounters.dispatchWing(100, game.player.position);
      const hunters = game.enemies.filter((enemy) => enemy.hunter);
      peakHunters = Math.max(peakHunters, hunters.length);

      hunters.forEach((enemy, index) => {
        enemy.position.copy(game.player.position).add({
          x: (index % 4 - 1.5) * 18,
          y: (Math.floor(index / 4) - 1) * 14,
          z: -150 - index * 3,
        });
        enemy.faceToward(game.player.position);
        for (let burst = 0; burst < 34; burst++) {
          game.combat.enemyFire(enemy);
          peakAudio = Math.max(peakAudio, game.audio.debugActiveOneShots);
        }
      });
      peakProjectiles = Math.max(
        peakProjectiles,
        game.projectiles.debugSnapshot().length,
      );
      game.rebuildTargetLists();
      game.renderHudOnce();
      game.postFx.render(0);

      retireHunters();
      game.projectiles.clear();
      game.particles.update(5);
      game.explosions.update(5);
      game.debris.update(5);
      game.rebuildTargetLists();
      game.renderHudOnce();
      game.postFx.render(0);
    }

    await new Promise((resolve) => setTimeout(resolve, 260));
    const final = {
      sceneChildren: game.scene.children.length,
      geometries: game.renderer.info.memory.geometries,
      textures: game.renderer.info.memory.textures,
    };
    return {
      contextLost,
      peakHunters,
      overflowSpawned,
      peakProjectiles,
      peakAudio,
      audioLimit: game.audio.debugMaxOneShots,
      contactPool: document.querySelectorAll('.contact-marker').length,
      baseline,
      final,
    };
  });
  console.log('dense combat stability:', JSON.stringify(combatStability));

  const aegisMissiles = await page.evaluate(() => {
    const game = window.game;
    game.selectedShipId = 'kestrel';
    game.startMission();
    const kestrelRegenDisabled = game.player.def.missileRegenSeconds === null;
    game.selectedShipId = 'aegis';
    game.startMission();
    game.loop.stop();
    const initial = game.inventory.missiles;
    game.inventory.missiles = 0;
    const interval = game.player.def.missileRegenSeconds;
    game.inventory.regenerateMissiles(9.98, interval);
    const beforeTenSeconds = game.inventory.missiles;
    game.loop.stepManual(0.02);
    return {
      initial,
      kestrelRegenDisabled,
      beforeTenSeconds,
      afterTenSeconds: game.inventory.missiles,
      interval,
    };
  });
  console.log('Aegis seeker fabricator:', JSON.stringify(aegisMissiles));

  return { closed, camDist, turretAim, dev, combatStability, aegisMissiles };
}
