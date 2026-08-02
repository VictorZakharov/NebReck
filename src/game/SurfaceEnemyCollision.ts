import { Vector3 } from 'three';
import type { EnemyShip } from '../entities/EnemyShip';
import type { AsteroidBody } from '../world/AsteroidField';
import type { PlanetSurface } from '../world/PlanetSurface';

const relative = new Vector3();
const push = new Vector3();
const nearbyBodies: AsteroidBody[] = [];

/** Keep one surface enemy outside terrain and registered obstacle geometry. */
export function resolveEnemySurfaceCollision(
  enemy: EnemyShip,
  surface: PlanetSurface,
): void {
  const minY = surface.heightAt(enemy.position.x, enemy.position.z) + enemy.radius + 0.8;
  if (enemy.position.y < minY) {
    enemy.position.y = minY;
    enemy.velocity.y = Math.max(8, Math.abs(enemy.velocity.y) * 0.35);
  }

  const candidates = surface.queryBodiesNear(enemy.position, enemy.radius, nearbyBodies);
  for (const body of candidates) {
    if (body.destroyed) continue;
    const broadRadius = body.radius + enemy.radius;
    if (body.position.distanceToSquared(enemy.position) > broadRadius * broadRadius) continue;

    let touching = false;
    if (body.box) {
      relative.copy(enemy.position).sub(body.position);
      const px = body.box.hx + enemy.radius - Math.abs(relative.x);
      const py = body.box.hy + enemy.radius - Math.abs(relative.y);
      const pz = body.box.hz + enemy.radius - Math.abs(relative.z);
      if (px > 0 && py > 0 && pz > 0) {
        touching = true;
        if (px <= py && px <= pz) {
          push.set(relative.x >= 0 ? 1 : -1, 0, 0);
          enemy.position.x = body.position.x + push.x * (body.box.hx + enemy.radius + 0.3);
        } else if (py <= pz) {
          push.set(0, relative.y >= 0 ? 1 : -1, 0);
          enemy.position.y = body.position.y + push.y * (body.box.hy + enemy.radius + 0.3);
        } else {
          push.set(0, 0, relative.z >= 0 ? 1 : -1);
          enemy.position.z = body.position.z + push.z * (body.box.hz + enemy.radius + 0.3);
        }
      }
    } else {
      relative.copy(enemy.position).sub(body.position);
      if (relative.lengthSq() < broadRadius * broadRadius) {
        touching = true;
        if (relative.lengthSq() < 1e-6) relative.set(0, 1, 0);
        push.copy(relative).normalize();
        enemy.position.copy(body.position).addScaledVector(push, broadRadius + 0.3);
      }
    }
    if (touching) {
      enemy.velocity.reflect(push).multiplyScalar(0.35).addScaledVector(push, 10);
      break;
    }
  }
}
