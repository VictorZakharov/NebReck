export async function runProjectileDamageSmoke(page) {
  const result = await page.evaluate(() => {
    const game = window.game;
    const player = game.player;
    game.projectiles.clear();

    const vein = game.sector.asteroids.bodies.find((body) => (
      !body.destroyed && body.ore && body.mesh && body.orePoints.length > 0
    ));
    let veinResult = { found: false };
    if (vein) {
      const savedOreHp = vein.oreHp;
      const savedRockHp = vein.hp;
      const point = vein.orePoints[0];
      const outward = point.clone().sub(vein.position).normalize();
      const origin = point.clone().addScaledVector(
        outward,
        (vein.orePointRadii[0] ?? 1) + 12,
      );
      const direction = point.clone().sub(origin).normalize();
      game.targeting.current = null;
      game.lootAimed = 'vein';
      game.lootAimBody = vein;
      game.lootAimPoint = point;
      game.renderHudOnce();
      const healthBar = document.querySelector('[data-el="previewHullBar"]');
      const healthBefore = Number.parseFloat(healthBar?.style.width ?? '0');

      game.projectiles.spawnBolt({
        position: origin,
        direction,
        speed: 480,
        damage: 1,
        faction: 'player',
        color: game.weapons.weapon.color,
        boltLength: game.weapons.weapon.boltLength,
        boltWidth: game.weapons.weapon.boltWidth,
        life: 1,
      });
      let hit = null;
      for (let frame = 0; frame < 60 && !hit; frame++) {
        game.projectiles.update(1 / 120, [], null, [vein], (projectileHit) => {
          hit = projectileHit;
          game.combat.resolveHit(projectileHit);
        });
      }
      game.renderHudOnce();
      const healthAfter = Number.parseFloat(healthBar?.style.width ?? '0');
      const hitCrystal = hit && vein.orePoints.some((orePoint, index) => (
        hit.point.distanceTo(orePoint) <= (vein.orePointRadii[index] ?? 1) + 0.1
      ));
      veinResult = {
        found: true,
        hitOwner: hit?.asteroid === vein,
        hitCrystal,
        healthLost: savedOreHp - vein.oreHp,
        healthBefore,
        healthAfter,
      };
      vein.oreHp = savedOreHp;
      vein.hp = savedRockHp;
      game.lootAimed = null;
      game.lootAimBody = null;
      game.lootAimPoint = null;
      game.projectiles.clear();
    }

    const savedPlayer = {
      hull: player.hull,
      shield: player.shield,
      alive: player.alive,
    };
    player.alive = true;
    player.hull = player.hullMax;
    player.shield = 0;
    const rocketOrigin = player.position.clone().add({ x: 0, y: 0, z: 48 });
    const rocketDirection = player.position.clone().sub(rocketOrigin).normalize();
    game.projectiles.spawnEnemyRocket(
      rocketOrigin,
      rocketDirection,
      player,
      'fast',
    );
    const fastSnapshot = game.projectiles.debugSnapshot()[0];
    let fastHit = null;
    for (let frame = 0; frame < 60 && !fastHit; frame++) {
      game.projectiles.update(1 / 120, [], player, [], (projectileHit) => {
        fastHit = projectileHit;
        game.combat.resolveHit(projectileHit);
      });
    }
    const fastRocket = {
      unguided: fastSnapshot?.kind === 'missile' && !fastSnapshot.homing && !fastSnapshot.hasTarget,
      hitPlayer: fastHit?.ship === player && fastHit?.wasMissile === true,
      damage: player.hullMax - player.hull,
    };
    player.hull = savedPlayer.hull;
    player.shield = savedPlayer.shield;
    player.alive = savedPlayer.alive;
    game.projectiles.clear();

    return { vein: veinResult, fastRocket };
  });
  console.log('projectile damage paths:', JSON.stringify(result));
  return result;
}

export function collectProjectileDamageFailures(result) {
  if (
    !result.vein.found ||
    !result.vein.hitOwner ||
    !result.vein.hitCrystal ||
    result.vein.healthLost !== 1 ||
    result.vein.healthAfter >= result.vein.healthBefore ||
    !result.fastRocket.unguided ||
    !result.fastRocket.hitPlayer ||
    result.fastRocket.damage < 23.9
  ) return ['vein collision, live health, and fast-rocket damage'];
  return [];
}
