import { Vector3 } from 'three';
import type { AsteroidBody } from './AsteroidField';

const CELL_SIZE = 96;

/**
 * Two-dimensional broadphase for the static bodies on a planet surface.
 *
 * Surface collision used to scan every cave-shell sphere for every LOS,
 * projectile, and ship query. Bodies are static for the lifetime of a saved
 * planet, so indexing their X/Z bounds once removes that per-frame linear
 * walk without changing the exact narrow-phase collision tests.
 */
export class SurfaceBodyIndex {
  private readonly cells = new Map<number, AsteroidBody[]>();
  private readonly seen = new WeakMap<AsteroidBody, number>();
  private queryId = 0;

  rebuild(bodies: readonly AsteroidBody[]): void {
    this.cells.clear();
    for (const body of bodies) {
      const collisionRadius = body.mesh ? body.radius * 1.5 : body.radius;
      const halfX = body.box?.hx ?? collisionRadius;
      const halfZ = body.box?.hz ?? collisionRadius;
      let worldMinX = body.position.x - halfX;
      let worldMaxX = body.position.x + halfX;
      let worldMinZ = body.position.z - halfZ;
      let worldMaxZ = body.position.z + halfZ;
      for (let index = 0; index < body.orePoints.length; index++) {
        const point = body.orePoints[index];
        const radius = body.orePointRadii[index] ?? 0;
        worldMinX = Math.min(worldMinX, point.x - radius);
        worldMaxX = Math.max(worldMaxX, point.x + radius);
        worldMinZ = Math.min(worldMinZ, point.z - radius);
        worldMaxZ = Math.max(worldMaxZ, point.z + radius);
      }
      const minX = cell(worldMinX);
      const maxX = cell(worldMaxX);
      const minZ = cell(worldMinZ);
      const maxZ = cell(worldMaxZ);
      for (let cellX = minX; cellX <= maxX; cellX++) {
        for (let cellZ = minZ; cellZ <= maxZ; cellZ++) {
          const key = cellKey(cellX, cellZ);
          const bucket = this.cells.get(key);
          if (bucket) bucket.push(body);
          else this.cells.set(key, [body]);
        }
      }
    }
  }

  queryPoint(
    point: Vector3,
    padding: number,
    out: AsteroidBody[],
  ): readonly AsteroidBody[] {
    return this.queryBounds(
      point.x - padding,
      point.x + padding,
      point.z - padding,
      point.z + padding,
      out,
    );
  }

  querySegment(
    from: Vector3,
    to: Vector3,
    padding: number,
    out: AsteroidBody[],
  ): readonly AsteroidBody[] {
    return this.queryBounds(
      Math.min(from.x, to.x) - padding,
      Math.max(from.x, to.x) + padding,
      Math.min(from.z, to.z) - padding,
      Math.max(from.z, to.z) + padding,
      out,
    );
  }

  get cellCount(): number {
    return this.cells.size;
  }

  private queryBounds(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    out: AsteroidBody[],
  ): readonly AsteroidBody[] {
    out.length = 0;
    const queryId = ++this.queryId;
    for (let cellX = cell(minX); cellX <= cell(maxX); cellX++) {
      for (let cellZ = cell(minZ); cellZ <= cell(maxZ); cellZ++) {
        const bucket = this.cells.get(cellKey(cellX, cellZ));
        if (!bucket) continue;
        for (const body of bucket) {
          if (this.seen.get(body) === queryId) continue;
          this.seen.set(body, queryId);
          out.push(body);
        }
      }
    }
    return out;
  }
}

function cell(value: number): number {
  return Math.floor(value / CELL_SIZE);
}

function cellKey(x: number, z: number): number {
  return x * 65_536 + z;
}
