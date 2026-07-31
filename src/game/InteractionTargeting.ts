import { Vector3 } from 'three';
import { NeutralShip } from '../entities/NeutralShip';
import { PlayerShip } from '../entities/PlayerShip';
import { Ship } from '../entities/Ship';
import { AsteroidBody } from '../world/AsteroidField';

export type AimedLootKind = 'stash' | 'vein';

export interface AimedLootResult {
  kind: AimedLootKind | null;
  /** Exact ore-point object; rotating asteroids mutate it in place. */
  point: Vector3 | null;
  /** Owning body keeps a multi-crystal vein on one stable prompt anchor. */
  body: AsteroidBody | null;
}

const forward = new Vector3();
const offset = new Vector3();
const blockOffset = new Vector3();
const veinFacing = new Vector3();
const veinViewer = new Vector3();

/**
 * Resolve world interaction under the boresight. Visibility is deliberately
 * delegated to the active world because a surface also has analytic terrain.
 */
export function findAimedLoot(
  player: PlayerShip,
  bodies: readonly AsteroidBody[],
  shootables: readonly Ship[],
  targetDot: number,
  hasLineOfSight: (from: Vector3, to: Vector3, ignoredBody: AsteroidBody) => boolean,
  aimDirection?: Vector3,
): AimedLootResult {
  if (aimDirection && aimDirection.lengthSq() > 1e-8) forward.copy(aimDirection).normalize();
  else player.forward(forward);
  let best: AimedLootKind | null = null;
  let bestPoint: Vector3 | null = null;
  let bestBody: AsteroidBody | null = null;
  let bestDot = 0.992;
  let bestDist = Infinity;

  for (const body of bodies) {
    if (body.destroyed || (!body.stash && body.ore === null)) continue;
    const points = body.ore !== null && body.orePoints.length > 0 ? body.orePoints : null;
    const pointCount = points?.length ?? 1;
    for (let i = 0; i < pointCount; i++) {
      const point = points?.[i] ?? body.position;
      offset.copy(point).sub(player.position);
      const dist = offset.length();
      if (dist > 450 || dist < 1) continue;
      const dot = offset.multiplyScalar(1 / dist).dot(forward);
      if (dot <= targetDot + 0.001) continue;
      if (dot < bestDot || (dot === bestDot && dist >= bestDist)) continue;

      // A crystal on the far hemisphere is not visible just because its host
      // rock's centre happens to sit inside the loose aim cone.
      if (points) {
        veinFacing.copy(point).sub(body.position);
        veinViewer.copy(player.position).sub(body.position);
        if (veinFacing.dot(veinViewer) <= 0) continue;
      }
      if (!hasLineOfSight(player.position, point, body)) continue;

      let shipBlocked = false;
      for (const ship of shootables) {
        if (!ship.alive) continue;
        blockOffset.copy(ship.position).sub(player.position);
        const along = blockOffset.dot(offset);
        if (along <= 0) continue;
        const perpSq = blockOffset.lengthSq() - along * along;
        const radiusSq = ship.radius * ship.radius;
        if (perpSq >= radiusSq) continue;
        const entry = along - Math.sqrt(radiusSq - perpSq);
        if (entry > 0 && entry < dist) {
          shipBlocked = true;
          break;
        }
      }
      if (shipBlocked) continue;

      best = body.stash ? 'stash' : 'vein';
      bestPoint = point;
      bestBody = body;
      bestDot = dot;
      bestDist = dist;
    }
  }

  return {
    kind: best,
    point: best === 'vein' ? bestPoint : null,
    body: bestBody,
  };
}

export function nearestNeutral(
  playerPosition: Vector3,
  neutrals: readonly NeutralShip[],
  maxDistance = 130,
): NeutralShip | null {
  let best: NeutralShip | null = null;
  let bestDist = maxDistance;
  for (const neutral of neutrals) {
    if (!neutral.alive) continue;
    const distance = neutral.position.distanceTo(playerPosition);
    if (distance < bestDist) {
      bestDist = distance;
      best = neutral;
    }
  }
  return best;
}
