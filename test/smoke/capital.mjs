export async function runCapitalSmoke(page) {
  const capitalSystems = await page.evaluate(() => {
    const game = window.game;
    const capital = game.capital;
    if (!capital) return { present: false };
    const initialMounts = [...game.capitalTurrets];
    const forward = capital.position.clone();
    capital.forward(forward);
    game.player.position.copy(capital.position).addScaledVector(forward, 600);
    game.player.faceToward(capital.position);
    game.chaseCam.snapTo(game.player.object);
    game.chaseCam.camera.updateMatrixWorld(true);
    game.targeting.current = null;
    game.rebuildTargetLists();
    const weapons = [...new Set(initialMounts.map((turret) => turret.weapon))];
    const top = initialMounts.find((turret) => turret.mountNormal?.y > 0.5);
    const bottom = initialMounts.find((turret) => turret.mountNormal?.y < -0.5);
    const farMountsHidden = initialMounts.every(
      (turret) => !game.hostiles.includes(turret),
    );
    const farHullAvailable = game.hostiles.includes(capital);
    game.targeting.update(
      game.player,
      game.hostiles.filter(
        (hostile) => hostile === capital || initialMounts.includes(hostile),
      ),
      [],
      game.weapons.weapon.projectileSpeed,
    );
    game.renderHudOnce();
    const farTargetsHull = game.targeting.current?.ship === capital;
    const farPreviewHull =
      document.querySelector('[data-el="previewName"]')?.textContent ===
      'Warden-class Carrier';
    const previewPanel = document.querySelector('.target-preview');
    const previewCanvas = document.querySelector('.preview-canvas');
    const farPreviewHostileOutline =
      previewPanel?.classList.contains('hostile') &&
      game.hudPresenter.targetPreview.outlineActive &&
      getComputedStyle(previewCanvas).filter === 'none';
    const previewHealthHsl = {};
    game.hudPresenter.targetPreview.mat.color.getHSL(previewHealthHsl);
    const farPreviewHealthColor = previewHealthHsl.h > 0.3;
    const previewRenderer = game.hudPresenter.targetPreview.renderer;
    const previewGl = previewRenderer.getContext();
    const previewPixels = new Uint8Array(170 * 128 * 4);
    previewGl.readPixels(
      0, 0, 170, 128,
      previewGl.RGBA, previewGl.UNSIGNED_BYTE, previewPixels,
    );
    let farPreviewVisiblePixels = 0;
    let previewMinX = 170;
    let previewMaxX = -1;
    let previewMinY = 128;
    let previewMaxY = -1;
    for (let pixel = 0; pixel < 170 * 128; pixel++) {
      if (previewPixels[pixel * 4 + 3] < 8) continue;
      const x = pixel % 170;
      const y = Math.floor(pixel / 170);
      farPreviewVisiblePixels++;
      previewMinX = Math.min(previewMinX, x);
      previewMaxX = Math.max(previewMaxX, x);
      previewMinY = Math.min(previewMinY, y);
      previewMaxY = Math.max(previewMaxY, y);
    }
    const farPreviewPixelWidth = Math.max(0, previewMaxX - previewMinX + 1);
    const farPreviewPixelHeight = Math.max(0, previewMaxY - previewMinY + 1);
    const previewRoot = game.hudPresenter.targetPreview.cache.get('capital')?.wireframe;
    let previewHullBreadthRatio = 0;
    if (previewRoot) {
      const savedQuaternion = previewRoot.quaternion.clone();
      previewRoot.quaternion.identity();
      previewRoot.updateMatrixWorld(true);
      const point = capital.position.clone();
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      previewRoot.traverse((child) => {
        const positions = child.geometry?.getAttribute?.('position');
        if (!positions) return;
        for (let index = 0; index < positions.count; index++) {
          point.fromBufferAttribute(positions, index);
          child.localToWorld(point);
          min[0] = Math.min(min[0], point.x);
          min[1] = Math.min(min[1], point.y);
          min[2] = Math.min(min[2], point.z);
          max[0] = Math.max(max[0], point.x);
          max[1] = Math.max(max[1], point.y);
          max[2] = Math.max(max[2], point.z);
        }
      });
      const width = max[0] - min[0];
      const height = max[1] - min[1];
      const length = max[2] - min[2];
      previewHullBreadthRatio = Math.min(width, height) / Math.max(length, 0.001);
      previewRoot.quaternion.copy(savedQuaternion);
      previewRoot.updateMatrixWorld(true);
    }

    const closeMount = top ?? initialMounts[0];
    game.player.position.copy(capital.position).addScaledVector(forward, 200);
    if (closeMount) game.player.faceToward(closeMount.position);
    game.targeting.current = null;
    game.rebuildTargetLists();
    const nearMountsAvailable = initialMounts.every(
      (turret) => game.hostiles.includes(turret),
    );
    game.targeting.update(
      game.player,
      game.hostiles.filter(
        (hostile) => hostile === capital || initialMounts.includes(hostile),
      ),
      [],
      game.weapons.weapon.projectileSpeed,
    );
    const nearMountLock = initialMounts.includes(game.targeting.current?.ship);
    game.targeting.current = null;
    const activeBodies = game.world.bodies.filter((body) => !body.destroyed);
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
      topLineOfSight = game.combat.hasLineOfSight(topOrigin, above);
      bottomOccluded = !game.combat.hasLineOfSight(bottomOrigin, above);
      for (let frame = 0; frame < 240; frame++) {
        top.update(1 / 60, above, true, () => topShots++, true);
        bottom.update(1 / 60, above, true, () => bottomShots++, true);
      }
    }
    for (const [body, destroyed] of savedDestroyed) body.destroyed = destroyed;

    const sacrificial = initialMounts.find(
      (turret) => turret !== top && turret !== bottom,
    );
    const carrierHullBefore = capital.hull;
    const batteryDurability = initialMounts.reduce(
      (total, turret) => total + turret.hullMax + turret.shieldMax,
      0,
    );
    if (sacrificial) {
      game.combat.resolveHit({
        ship: sacrificial,
        asteroid: null,
        point: sacrificial.position.clone(),
        damage: 100_000,
        faction: 'player',
        wasMissile: false,
      });
    }
    const expectedBatteryHullDamage = sacrificial
      ? capital.hullMax *
        0.35 *
        (sacrificial.hullMax + sacrificial.shieldMax) /
        batteryDurability
      : 0;
    const batteryHullDamage = carrierHullBefore - capital.hull;
    const weightedMountDamage =
      !!sacrificial &&
      !sacrificial.alive &&
      capital.alive &&
      Math.abs(batteryHullDamage - expectedBatteryHullDamage) < 0.01;

    const right = capital.position
      .clone()
      .set(1, 0, 0)
      .applyQuaternion(capital.object.quaternion);
    game.player.alive = true;
    game.player.hull = game.player.hullMax;
    game.player.shield = game.player.shieldMax;
    game.player.velocity.set(0, 0, 0);
    capital.phase = 'idle';
    capital.cooldown = 0;
    let committedShot = null;
    let chargeSignals = 0;
    const arcContext = {
      player: game.player,
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
    game.player.position.copy(capital.position).addScaledVector(right, 300);
    capital.update(1 / 60, arcContext);
    const rejectedFromSide = capital.beamPhase === 'idle';
    game.player.position.copy(capital.position).addScaledVector(forward, 650);
    capital.update(1 / 60, arcContext);
    const rejectedBeyondActivation = capital.beamPhase === 'idle';
    game.player.position.copy(capital.position).addScaledVector(forward, 320);
    capital.update(1 / 60, arcContext);
    const startedInFront = capital.beamPhase === 'charging';
    const finiteChargeGuide =
      capital.beamGuideLength > 70 && capital.beamGuideLength < 400;
    game.player.position
      .copy(capital.position)
      .addScaledVector(forward, 700)
      .addScaledVector(right, 400);
    for (let frame = 0; frame < 122; frame++) {
      capital.update(1 / 60, arcContext);
    }
    const arcDot = committedShot ? forward.dot(committedShot.direction) : -1;
    const committedWithinArc =
      !!committedShot &&
      arcDot >= Math.cos(Math.PI / 14) - 0.002 &&
      chargeSignals === 1;

    capital.phase = 'idle';
    capital.cooldown = 0;
    capital.update(0);
    const beamBodies = game.world.bodies
      .filter((body) => !body.destroyed && !body.box)
      .slice(0, 2);
    let firstObstacleDestroyed = false;
    let secondObstacleSurvived = false;
    let playerProtected = false;
    let beamFired = 0;
    if (beamBodies.length === 2) {
      const [first, second] = beamBodies;
      const states = game.world.bodies.map((body) => ({
        body,
        destroyed: body.destroyed,
      }));
      const firstState = {
        position: first.position.clone(),
        radius: first.radius,
        box: first.box,
      };
      const secondState = {
        position: second.position.clone(),
        radius: second.radius,
        box: second.box,
      };
      for (const state of states) state.body.destroyed = true;
      first.destroyed = false;
      first.box = null;
      first.radius = 18;
      first.position.copy(capital.position).addScaledVector(forward, 125);
      second.destroyed = false;
      second.box = null;
      second.radius = 18;
      second.position.copy(capital.position).addScaledVector(forward, 220);
      game.player.position.copy(capital.position).addScaledVector(forward, 360);
      game.player.alive = true;
      game.player.hull = game.player.hullMax;
      game.player.shield = game.player.shieldMax;
      const hullBefore = game.player.hull;
      const shieldBefore = game.player.shield;
      let visible = true;
      const obstacleContext = {
        player: game.player,
        playerVisible: true,
        canSeePlayer: () => visible,
        onCharge: () => {},
        onFire: (shot) => {
          beamFired++;
          return game.combat.capitalBeamFire(shot);
        },
      };
      capital.update(1 / 60, obstacleContext);
      visible = false;
      for (let frame = 0; frame < 122; frame++) {
        capital.update(1 / 60, obstacleContext);
      }
      firstObstacleDestroyed = first.destroyed;
      secondObstacleSurvived = !second.destroyed;
      playerProtected =
        game.player.alive &&
        game.player.hull === hullBefore &&
        game.player.shield === shieldBefore;
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
    game.player.position.set(0, 2600, 0);
    game.player.velocity.set(0, 0, 0);

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
      farPreviewHostileOutline,
      farPreviewHealthColor,
      farPreviewVisiblePixels,
      farPreviewPixelWidth,
      farPreviewPixelHeight,
      previewHullBreadthRatio: Number(previewHullBreadthRatio.toFixed(3)),
      nearMountsAvailable,
      nearMountLock,
      weightedMountDamage,
      batteryHullDamage: Number(batteryHullDamage.toFixed(2)),
      topLineOfSight,
      bottomOccluded,
      topShots,
      bottomShots,
      rejectedFromSide,
      rejectedBeyondActivation,
      startedInFront,
      finiteChargeGuide,
      beamGuideLength: Number(capital.beamGuideLength.toFixed(1)),
      committedWithinArc,
      arcDot: Number(arcDot.toFixed(4)),
      beamFired,
      firstObstacleDestroyed,
      secondObstacleSurvived,
      playerProtected,
    };
  });
  console.log('capital systems:', JSON.stringify(capitalSystems));
  return capitalSystems;
}
