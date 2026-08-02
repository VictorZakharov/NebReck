export async function runFxSmoke(page) {
  const result = await page.evaluate(() => {
    const game = window.game;
    game.loop.stop();
    game.explosions.update(10);
    const origin = game.player.position.clone();
    origin.y += 30;
    game.explosions.spawn(origin, 1, 'impact');
    game.explosions.update(0.1);
    const cleanImpactSmoke = game.explosions.diagnostics().activeSmokePuffs;
    game.explosions.update(10);
    game.explosions.spawn(origin, 1, 'missile');
    game.explosions.update(0.1);
    const missileFx = game.explosions.diagnostics();
    const missileSmoke = missileFx.activeSmokePuffs;
    game.explosions.update(10);
    game.explosions.spawn(origin, 1, 'ship');
    game.explosions.update(1.2);
    const shipSmoke = game.explosions.diagnostics().activeSmokePuffs;
    const peak = game.explosions.diagnostics();
    const shipSmokeRadius = peak.smokeRadius;
    game.explosions.update(10);
    const smokeDissipated = game.explosions.diagnostics().activeSmokePuffs;
    const player = game.player;
    player.alive = true;
    player.hull = player.hullMax;
    player.shield = Math.min(50, player.shieldMax);
    game.playerShield.update(2);
    const point = player.position.clone();
    point.x += player.radius;
    game.combat.resolveHit({
      ship: player,
      asteroid: null,
      point,
      damage: 10,
      faction: 'enemy',
      wasMissile: false,
    });
    const shieldFlare = game.playerShield.diagnostics().active;
    const shieldShake = game.chaseCam.diagnostics().damageKick;

    for (let frame = 0; frame < 120; frame++) {
      game.chaseCam.update(1 / 60, player.object, 0, false);
      game.playerShield.update(1 / 60);
    }
    player.shield = 5;
    game.combat.resolveHit({
      ship: player,
      asteroid: null,
      point,
      damage: 10,
      faction: 'enemy',
      wasMissile: false,
    });
    const depletedShieldFlare = game.playerShield.diagnostics().active;

    for (let frame = 0; frame < 120; frame++) {
      game.chaseCam.update(1 / 60, player.object, 0, false);
      game.playerShield.update(1 / 60);
    }
    player.shield = 0;
    game.combat.resolveHit({
      ship: player,
      asteroid: null,
      point,
      damage: 55,
      faction: 'enemy',
      wasMissile: false,
    });
    const hullShake = game.chaseCam.diagnostics().damageKick;
    player.hull = 1_000;
    game.combat.resolveHit({
      ship: player,
      asteroid: null,
      point,
      damage: 55,
      faction: 'enemy',
      wasMissile: true,
    });
    const stackedHullShake = game.chaseCam.diagnostics().damageKick;
    player.hull = player.hullMax;
    player.shield = player.shieldMax;
    player.alive = true;

    return {
      cleanImpactSmoke,
      missileSmoke,
      fireballVolumes: missileFx.activeFireballVolumes,
      volumeDrawCalls: missileFx.volumeDrawCalls,
      shipSmoke,
      shipSmokeRadius,
      smokeDissipated,
      bounded: peak.activeSmokePuffs <= peak.smokeCapacity,
      shieldFlare,
      depletedShieldFlare,
      shieldShake,
      hullShake,
      stackedHullShake,
    };
  });
  console.log('cinematic FX:', JSON.stringify(result));
  return result;
}

export function collectFxFailures(result) {
  if (
    result.cleanImpactSmoke !== 0 ||
    result.missileSmoke <= 0 ||
    result.fireballVolumes <= 0 || result.volumeDrawCalls !== 2 ||
    result.shipSmoke <= result.missileSmoke ||
    result.shipSmokeRadius < 20 ||
    result.smokeDissipated !== 0 ||
    !result.bounded ||
    !result.shieldFlare ||
    result.depletedShieldFlare ||
    result.hullShake <= result.shieldShake ||
    result.stackedHullShake <= result.hullShake + 0.1
  ) return ['explosion and damage feedback'];
  return [];
}
