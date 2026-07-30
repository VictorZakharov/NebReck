import { Vector3 } from 'three';
import { AsteroidBody } from '../world/AsteroidField';

const AXES = ['x', 'y', 'z'] as const;

/** Slab-method ray test against a body's tight world-axis-aligned box. */
export function rayHitsBodyBox(
  origin: Vector3,
  direction: Vector3,
  maxDistance: number,
  body: AsteroidBody,
): boolean {
  const box = body.box!;
  let tMin = 0;
  let tMax = maxDistance;
  for (const axis of AXES) {
    const half = box[`h${axis}` as 'hx' | 'hy' | 'hz'];
    const start = origin[axis] - body.position[axis];
    const delta = direction[axis];
    if (Math.abs(delta) < 1e-8) {
      if (Math.abs(start) > half) return false;
      continue;
    }
    let t1 = (-half - start) / delta;
    let t2 = (half - start) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return tMax >= 0 && tMin <= maxDistance;
}

export function pointInsideBody(
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
  return body.position.distanceToSquared(point) <= (body.radius + padding) ** 2;
}
