import { Vector3 } from 'three';
import { Ship } from '../entities/Ship';
import { AsteroidBody } from '../world/AsteroidField';

export interface CapitalBeamShipHit {
  ship: Ship;
  point: Vector3;
}

export interface CapitalBeamTrace {
  stopDistance: number;
  obstacle: AsteroidBody | null;
  ships: CapitalBeamShipHit[];
}

const rayEnd = new Vector3();
const hitPoint = new Vector3();
const bodyOffset = new Vector3();

/**
 * Trace a thick carrier ray. The nearest asteroid absorbs it completely;
 * ships before that point are hit, while everything behind it is protected.
 * This allocates only on the rare committed shot, never in the frame loop.
 */
export function traceCapitalBeam(
  origin: Vector3,
  direction: Vector3,
  range: number,
  radius: number,
  bodies: readonly AsteroidBody[],
  ships: readonly Ship[],
): CapitalBeamTrace {
  let stopDistance = range;
  let obstacle: AsteroidBody | null = null;
  for (const body of bodies) {
    if (body.destroyed || pointInsideInflatedBody(origin, body, radius)) continue;
    const distance = body.box
      ? rayBoxDistance(origin, direction, range, body, radius)
      : raySphereDistance(origin, direction, body.position, body.radius + radius);
    if (distance === null || distance >= stopDistance) continue;
    stopDistance = distance;
    obstacle = body;
  }

  rayEnd.copy(origin).addScaledVector(direction, stopDistance);
  const hits: CapitalBeamShipHit[] = [];
  for (const ship of ships) {
    if (!ship.alive || !ship.intersectSegment(origin, rayEnd, hitPoint, radius)) continue;
    hits.push({ ship, point: hitPoint.clone() });
  }
  return { stopDistance, obstacle, ships: hits };
}

function raySphereDistance(
  origin: Vector3,
  direction: Vector3,
  center: Vector3,
  radius: number,
): number | null {
  bodyOffset.copy(center).sub(origin);
  const along = bodyOffset.dot(direction);
  const perpendicularSq = bodyOffset.lengthSq() - along * along;
  const radiusSq = radius * radius;
  if (perpendicularSq > radiusSq) return null;
  const chord = Math.sqrt(Math.max(0, radiusSq - perpendicularSq));
  const entry = along - chord;
  const exit = along + chord;
  if (exit < 0) return null;
  return Math.max(0, entry);
}

function rayBoxDistance(
  origin: Vector3,
  direction: Vector3,
  range: number,
  body: AsteroidBody,
  padding: number,
): number | null {
  const box = body.box!;
  let near = 0;
  let far = range;
  for (const axis of ['x', 'y', 'z'] as const) {
    const half = box[`h${axis}` as 'hx' | 'hy' | 'hz'] + padding;
    const start = origin[axis] - body.position[axis];
    const delta = direction[axis];
    if (Math.abs(delta) < 1e-8) {
      if (Math.abs(start) > half) return null;
      continue;
    }
    let entry = (-half - start) / delta;
    let exit = (half - start) / delta;
    if (entry > exit) [entry, exit] = [exit, entry];
    near = Math.max(near, entry);
    far = Math.min(far, exit);
    if (near > far) return null;
  }
  return far >= 0 && near <= range ? Math.max(0, near) : null;
}

function pointInsideInflatedBody(
  point: Vector3,
  body: AsteroidBody,
  padding: number,
): boolean {
  if (body.box) {
    return (
      Math.abs(point.x - body.position.x) <= body.box.hx + padding &&
      Math.abs(point.y - body.position.y) <= body.box.hy + padding &&
      Math.abs(point.z - body.position.z) <= body.box.hz + padding
    );
  }
  return point.distanceToSquared(body.position) <= (body.radius + padding) ** 2;
}
