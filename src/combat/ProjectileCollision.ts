import { Intersection, Matrix3, Matrix4, Mesh, Raycaster, Vector3 } from 'three';
import { AsteroidBody } from '../world/AsteroidField';

const segment = new Vector3();
const fromCenter = new Vector3();
const instanceMatrix = new Matrix4();
const normalMatrix = new Matrix3();
const probe = new Mesh();
const raycaster = new Raycaster();
const intersections: Intersection[] = [];
const rockHitPoint = new Vector3();
const rockHitNormal = new Vector3();
const oreHitPoint = new Vector3();
const oreHitNormal = new Vector3();
const oreCandidatePoint = new Vector3();
const oreCandidateNormal = new Vector3();
const SURFACE_SWEEP_EPSILON = 0.35;

probe.matrixAutoUpdate = false;

function insideAsteroidBody(point: Vector3, body: AsteroidBody): boolean {
  if (body.box) {
    return (
      Math.abs(point.x - body.position.x) < body.box.hx &&
      Math.abs(point.y - body.position.y) < body.box.hy &&
      Math.abs(point.z - body.position.z) < body.box.hz
    );
  }
  return point.distanceToSquared(body.position) < body.radius * body.radius;
}

/** Ignore only a muzzle segment genuinely leaving a body, never an incoming shot. */
export function segmentExitsAsteroidBody(
  start: Vector3,
  end: Vector3,
  body: AsteroidBody,
): boolean {
  return insideAsteroidBody(start, body) &&
    end.distanceToSquared(body.position) > start.distanceToSquared(body.position) + 1e-6;
}

/** Exact visible-rock entry when possible, conservative collider fallback otherwise. */
export function segmentHitsAsteroid(
  start: Vector3,
  end: Vector3,
  body: AsteroidBody,
  out: Vector3,
  normalOut?: Vector3,
): boolean {
  if (body.box) return segmentHitsAabb(start, end, body, out, normalOut);

  const hitOre = segmentHitsOrePoints(start, end, body, oreHitPoint, oreHitNormal);
  let hitRock = false;
  // The physical sphere is intentionally conservative. Refine against the
  // actual rotated/scaled instanced geometry so impact FX land on the rock,
  // including elongated and displaced silhouettes.
  if (body.mesh && body.index >= 0) {
    if (segmentOverlapsSphere(start, end, body.position, body.radius * 1.5)) {
      hitRock = segmentHitsVisibleInstance(start, end, body, rockHitPoint, rockHitNormal);
    }
  } else {
    hitRock = segmentHitsSphere(
      start, end, body.position, body.radius, rockHitPoint, rockHitNormal,
    );
  }

  if (!hitRock && !hitOre) return false;
  const oreIsFirst = hitOre && (
    !hitRock || oreHitPoint.distanceToSquared(start) < rockHitPoint.distanceToSquared(start)
  );
  out.copy(oreIsFirst ? oreHitPoint : rockHitPoint);
  normalOut?.copy(oreIsFirst ? oreHitNormal : rockHitNormal);
  return true;
}

/** Exact-enough swept hit test for each visible crystal in a vein. */
function segmentHitsOrePoints(
  start: Vector3,
  end: Vector3,
  body: AsteroidBody,
  out: Vector3,
  normalOut: Vector3,
): boolean {
  if (!body.ore || body.orePoints.length === 0) return false;
  let nearestDistanceSq = Infinity;
  let found = false;
  for (let index = 0; index < body.orePoints.length; index++) {
    const point = body.orePoints[index];
    const radius = body.orePointRadii[index] ?? Math.max(0.5, body.radius * 0.12);
    if (!segmentHitsSphere(
      start, end, point, radius, oreCandidatePoint, oreCandidateNormal,
    )) continue;
    const distanceSq = oreCandidatePoint.distanceToSquared(start);
    if (distanceSq >= nearestDistanceSq) continue;
    nearestDistanceSq = distanceSq;
    out.copy(oreCandidatePoint);
    normalOut.copy(oreCandidateNormal);
    found = true;
  }
  return found;
}

/** Broadphase only: overlap remains true after the segment enters the bound. */
function segmentOverlapsSphere(
  start: Vector3,
  end: Vector3,
  center: Vector3,
  radius: number,
): boolean {
  segment.copy(end).sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq <= 1e-8) return start.distanceToSquared(center) <= radius * radius;
  fromCenter.copy(center).sub(start);
  const t = Math.max(0, Math.min(1, fromCenter.dot(segment) / lengthSq));
  fromCenter.copy(start).addScaledVector(segment, t);
  return fromCenter.distanceToSquared(center) <= radius * radius;
}

/** Slab-method segment vs axis-aligned box; writes entry point to `out`. */
function segmentHitsAabb(
  startPoint: Vector3,
  endPoint: Vector3,
  body: AsteroidBody,
  out: Vector3,
  normalOut?: Vector3,
): boolean {
  const box = body.box!;
  let tMin = 0;
  let tMax = 1;
  let normalAxis: 'x' | 'y' | 'z' | null = null;
  let normalSign = 0;
  const axes: ['x' | 'y' | 'z', number][] = [['x', box.hx], ['y', box.hy], ['z', box.hz]];
  for (const [axis, half] of axes) {
    const start = startPoint[axis] - body.position[axis];
    const delta = endPoint[axis] - startPoint[axis];
    if (Math.abs(delta) < 1e-8) {
      if (Math.abs(start) > half) return false;
      continue;
    }
    let t1 = (-half - start) / delta;
    let t2 = (half - start) / delta;
    let sign1 = -1;
    let sign2 = 1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      [sign1, sign2] = [sign2, sign1];
    }
    if (t1 > tMin) {
      tMin = t1;
      normalAxis = axis;
      normalSign = sign1;
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  out.copy(startPoint).lerp(endPoint, tMin);
  if (normalOut) {
    normalOut.set(0, 0, 0);
    if (normalAxis) normalOut[normalAxis] = normalSign;
    else normalOut.copy(out).sub(body.position).normalize();
  }
  return true;
}

/** True entry point of segment AB against a sphere, not closest approach. */
function segmentHitsSphere(
  start: Vector3,
  end: Vector3,
  center: Vector3,
  radius: number,
  out: Vector3,
  normalOut?: Vector3,
): boolean {
  segment.copy(end).sub(start);
  fromCenter.copy(start).sub(center);
  const lengthSq = segment.lengthSq();
  if (lengthSq <= 1e-8) return false;
  const projection = fromCenter.dot(segment);
  const discriminant = projection * projection -
    lengthSq * (fromCenter.lengthSq() - radius * radius);
  if (discriminant < 0) return false;
  const t = (-projection - Math.sqrt(discriminant)) / lengthSq;
  if (t < 0 || t > 1) return false;
  out.copy(start).addScaledVector(segment, t);
  normalOut?.copy(out).sub(center).normalize();
  return true;
}

function segmentHitsVisibleInstance(
  start: Vector3,
  end: Vector3,
  body: AsteroidBody,
  out: Vector3,
  normalOut?: Vector3,
): boolean {
  const mesh = body.mesh!;
  segment.copy(end).sub(start);
  const length = segment.length();
  if (length <= 1e-8) return false;

  mesh.updateWorldMatrix(true, false);
  mesh.getMatrixAt(body.index, instanceMatrix);
  probe.geometry = mesh.geometry;
  probe.material = mesh.material;
  probe.matrixWorld.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
  raycaster.set(start, segment.divideScalar(length));
  raycaster.near = 0;
  // Query beyond this tiny frame segment, then accept only a near-future hit.
  // This avoids losing a front face to floating-point clipping at raycaster.far;
  // once a segment starts just inside a FrontSide mesh, that entry face is gone.
  raycaster.far = length + body.radius * 3;
  intersections.length = 0;
  probe.raycast(raycaster, intersections);

  let nearest: Intersection | null = null;
  for (const hit of intersections) {
    if (
      hit.distance <= length + SURFACE_SWEEP_EPSILON &&
      (!nearest || hit.distance < nearest.distance)
    ) nearest = hit;
  }
  if (!nearest) return false;
  out.copy(nearest.point);
  if (normalOut) {
    if (nearest.face) {
      normalMatrix.getNormalMatrix(probe.matrixWorld);
      normalOut.copy(nearest.face.normal).applyNormalMatrix(normalMatrix).normalize();
    } else normalOut.copy(out).sub(body.position).normalize();
  }
  return true;
}
