import { Group, IcosahedronGeometry, Object3D, Vector3 } from 'three';
import { Rng } from '../core/Rng';
import { AsteroidBody } from './AsteroidField';
import { TurretSpawn } from './CaveAsteroid';

export type BaseKind = 'compound' | 'comm' | 'depot' | 'fortress';

export interface SurfacePatrol {
  waypoints: Vector3[];
  size: number;
}

export interface CaveWaypoint {
  x: number;
  z: number;
  r: number;
  depth: number;
}

export interface CaveLandmark {
  /** Deep chamber flight centre. */
  center: Vector3;
  /** Centre of the visible opening. */
  mouth: Vector3;
  /** Clear outside point on the approach line. */
  approach: Vector3;
  /** Clear point just inside the arch. */
  entry: Vector3;
  /** Dense, guaranteed-clear approach path following the curved trench. */
  route: Vector3[];
  /** Known-accessible guard positions for geometry regressions. */
  interiorGuard: Vector3;
  exteriorGuard: Vector3;
}

/** The narrow mutation surface shared by the independent landmark builders. */
export interface SurfaceStructureHost {
  group: Group;
  bodies: AsteroidBody[];
  turretSpawns: TurretSpawn[];
  patrols: SurfacePatrol[];
  caveLandmarks: CaveLandmark[];
  baseLandmarks: { center: Vector3; kind: BaseKind }[];
  heightAt(x: number, z: number): number;
  registerObstacle(object: Object3D, padding?: number): void;
  addCrystalFormation(rng: Rng, x: number, y: number, z: number): void;
  addStash(rng: Rng, x: number, y: number, z: number): void;
  addTurretPost(x: number, y: number, z: number, lookX: number, lookZ: number): void;
}

/** Shared broad-noise displacement for both surface and cave boulders. */
export function displaceRock(
  geometry: IcosahedronGeometry,
  rng: Rng,
  amount: number,
): void {
  const position = geometry.attributes.position;
  const vertex = new Vector3();
  const seed = rng.range(0, 100);
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const noise =
      Math.sin(vertex.x * 3.1 + seed) +
      Math.sin(vertex.y * 4.3 + seed * 1.7) +
      Math.sin(vertex.z * 3.7 + seed * 2.3);
    vertex.multiplyScalar(1 + (noise / 3) * amount);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();
}
