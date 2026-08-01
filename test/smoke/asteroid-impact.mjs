export async function runAsteroidImpactSmoke(page) {
  const result = await page.evaluate(() => {
    const game = window.game;
    const rock = game.sector.asteroids.bodies
      .filter((body) => !body.destroyed && body.mesh && body.index >= 0)
      .sort((a, b) => b.radius - a.radius)[0];
    if (!rock) return { found: false };

    const outward = game.player.position.clone().sub(rock.position);
    if (outward.lengthSq() < 1e-6) outward.set(0, 0, 1);
    outward.normalize();
    const origin = rock.position.clone().addScaledVector(outward, rock.radius * 2 + 40);
    const direction = outward.clone().negate();

    const probe = (missile) => {
      game.projectiles.clear();
      if (missile) game.projectiles.spawnMissile(origin, direction, null);
      else {
        const weapon = game.weapons.weapon;
        game.projectiles.spawnBolt({
          position: origin,
          direction,
          speed: 420,
          damage: 1,
          faction: 'player',
          color: weapon.color,
          boltLength: weapon.boltLength,
          boltWidth: weapon.boltWidth,
          life: 2,
        });
      }

      let rawPoint = null;
      let rawNormal = null;
      let effectPoint = null;
      const originalSpawn = game.explosions.spawn;
      game.explosions.spawn = (position) => { effectPoint ??= position.clone(); };
      for (let frame = 0; frame < 180 && !rawPoint; frame++) {
        game.projectiles.update(1 / 120, [], null, [rock], (hit) => {
          rawPoint = hit.point.clone();
          rawNormal = hit.normal?.clone() ?? null;
          game.combat.resolveHit({ ...hit, damage: 0 });
        });
      }
      game.explosions.spawn = originalSpawn;
      game.projectiles.clear();
      const clearance = rawPoint && rawNormal && effectPoint
        ? effectPoint.clone().sub(rawPoint).dot(rawNormal)
        : 0;
      return {
        hit: rawPoint !== null,
        rawRadius: rawPoint?.distanceTo(rock.position) ?? 0,
        normalLength: rawNormal?.length() ?? 0,
        clearance,
        entrySide: rawPoint ? rawPoint.clone().sub(rock.position).dot(outward) > 0 : false,
      };
    };

    const regular = probe(false);
    const missile = probe(true);
    return { found: true, radius: rock.radius, regular, missile };
  });
  console.log('asteroid impact surface:', JSON.stringify(result));
  return result;
}

export function collectAsteroidImpactFailures(result) {
  if (
    !result.found ||
    !result.regular.hit ||
    !result.missile.hit ||
    !result.regular.entrySide ||
    !result.missile.entrySide ||
    result.regular.rawRadius < result.radius * 0.3 ||
    result.missile.rawRadius < result.radius * 0.3 ||
    result.regular.normalLength < 0.99 ||
    result.missile.normalLength < 0.99 ||
    result.regular.clearance < 0.78 ||
    result.missile.clearance < 1.18
  ) return ['asteroid impact surface placement'];
  return [];
}
