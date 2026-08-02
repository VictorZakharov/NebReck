import { Vector3 } from 'three';
import { Rng } from '../core/Rng';
import { AsteroidBody, ChildAsteroidMotion } from './AsteroidField';

export interface ChildAsteroidSpawner {
  spawnChild(
    position: Vector3,
    radius: number,
    rng: Rng,
    palette?: number,
    motion?: ChildAsteroidMotion,
  ): AsteroidBody | null;
}

const childOffset = new Vector3();
const outward = new Vector3();

/** Replace a shattered rock only with smaller, collidable, destructible bodies. */
export function spawnAsteroidChildren(
  world: ChildAsteroidSpawner,
  parent: AsteroidBody,
  rng: Rng,
  requestedCount = rng.int(2, 3),
): number {
  if (
    parent.radius < 9 || parent.hero || parent.stash ||
    parent.solo !== null || parent.box !== null
  ) return 0;

  let spawned = 0;
  for (let index = 0; index < requestedCount; index++) {
    const [x, y, z] = rng.unitSphere();
    outward.set(x, y, z).normalize();
    childOffset.copy(outward).multiplyScalar(parent.radius * 0.55).add(parent.position);
    const [jx, jy, jz] = rng.unitSphere();
    const [ax, ay, az] = rng.unitSphere();
    const motion: ChildAsteroidMotion = {
      velocity: outward.clone()
        .multiplyScalar(rng.range(4, 10))
        .addScaledVector(new Vector3(jx, jy, jz), rng.range(0.5, 2)),
      spinAxis: new Vector3(ax, ay, az),
      spinSpeed: rng.range(0.8, 2.6),
    };
    if (world.spawnChild(
      childOffset,
      parent.radius * rng.range(0.32, 0.48),
      rng,
      parent.palette,
      motion,
    )) spawned++;
  }
  return spawned;
}
