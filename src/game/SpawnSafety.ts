import { Vector3 } from 'three';
import { Rng } from '../core/Rng';
import { AsteroidBody } from '../world/AsteroidField';

/** Clears fixed batteries, patrol detection, and the carrier's charge envelope. */
export const SECTOR_ENTRY_SAFE_DISTANCE = 700;

const SEARCH_BANDS = [
  [150, 750],
  [600, 1200],
  [1000, 1700],
] as const;

/** Pick the nearest useful empty shell that still guarantees a quiet sector entry. */
export function findSafeSectorEntry(
  rng: Rng,
  bodies: readonly AsteroidBody[],
  hostilePositions: readonly Vector3[],
  patrolWaypoints: readonly Vector3[],
): Vector3 {
  let best: Vector3 | null = null;
  let bestClearance = -Infinity;
  for (const [near, far] of SEARCH_BANDS) {
    for (let index = 0; index < 48; index++) {
      const [dx, dy, dz] = rng.unitSphere();
      const position = new Vector3(dx, dy * 0.4, dz)
        .normalize()
        .multiplyScalar(rng.range(near, far));
      const insideRock = bodies.some((body) =>
        !body.destroyed && body.position.distanceToSquared(position) < (body.radius + 20) ** 2
      );
      if (insideRock) continue;
      let clearance = Infinity;
      for (const hostile of hostilePositions) {
        clearance = Math.min(clearance, hostile.distanceTo(position));
      }
      for (const waypoint of patrolWaypoints) {
        clearance = Math.min(clearance, waypoint.distanceTo(position));
      }
      if (clearance > bestClearance) {
        bestClearance = clearance;
        best = position;
      }
    }
    if (bestClearance >= SECTOR_ENTRY_SAFE_DISTANCE) break;
  }
  if (best && bestClearance >= SECTOR_ENTRY_SAFE_DISTANCE) return best;

  // Extremely dense generated layouts get a deterministic outer-shell
  // fallback. Triangle inequality guarantees both threat and rock clearance.
  const direction = best?.clone() ?? new Vector3(1, 0, 0);
  if (direction.lengthSq() < 1e-6) direction.set(1, 0, 0);
  direction.normalize();
  let occupiedExtent = 0;
  for (const body of bodies) {
    if (!body.destroyed) occupiedExtent = Math.max(
      occupiedExtent,
      body.position.length() + body.radius + 20,
    );
  }
  for (const point of [...hostilePositions, ...patrolWaypoints]) {
    occupiedExtent = Math.max(occupiedExtent, point.length());
  }
  return direction.multiplyScalar(occupiedExtent + SECTOR_ENTRY_SAFE_DISTANCE + 50);
}
