import { Vector3 } from 'three';
import { PlayerShip } from '../entities/PlayerShip';
import { AsteroidBody } from '../world/AsteroidField';

export interface TutorialFlightCourse {
  start: Vector3;
  gate: Vector3;
}

const axes = [
  new Vector3(1, 0, 0), new Vector3(-1, 0, 0),
  new Vector3(0, 0, 1), new Vector3(0, 0, -1),
];
const start = new Vector3();
const gate = new Vector3();

/** Put the first navigation gate beyond real debris so straight flight is not enough. */
export function debrisFlightCourse(
  player: PlayerShip,
  bodies: readonly AsteroidBody[],
): TutorialFlightCourse | null {
  let best: TutorialFlightCourse | null = null;
  let bestScore = Infinity;
  for (const body of bodies) {
    const distance = body.position.distanceTo(player.position);
    if (body.destroyed || body.radius < 18 || body.radius > 105) continue;
    const density = bodies.filter((neighbor) => !neighbor.destroyed && neighbor !== body &&
      neighbor.position.distanceTo(body.position) < 310).length;
    for (const axis of axes) {
      start.copy(body.position).addScaledVector(axis, -(body.radius + 140));
      gate.copy(body.position).addScaledVector(axis, body.radius + 110);
      if (!clearEndpoint(start, body, bodies) || !clearEndpoint(gate, body, bodies)) continue;
      const score = distance - Math.min(density, 14) * 120;
      if (score < bestScore) {
        best = { start: start.clone(), gate: gate.clone() };
        bestScore = score;
      }
      break;
    }
  }
  return best;
}

function clearEndpoint(
  point: Vector3,
  courseBody: AsteroidBody,
  bodies: readonly AsteroidBody[],
): boolean {
  return !bodies.some((body) => body !== courseBody && !body.destroyed &&
    point.distanceTo(body.position) < body.radius + 36);
}
