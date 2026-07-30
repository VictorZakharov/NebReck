import {
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { getSurfaceTexture } from '../rendering/SurfaceTextures';

interface Fragment {
  active: boolean;
  mesh: Mesh;
  velocity: Vector3;
  spinAxis: Vector3;
  spinSpeed: number;
  life: number;
  maxLife: number;
  baseScale: number;
}

/**
 * Pooled rock fragments spawned when an asteroid shatters: chunks tumble
 * outward, drift, then shrink away. Purely visual (no colliders) — the
 * gameplay-relevant rock is already gone.
 */
export class AsteroidDebris {
  readonly group = new Group();
  private readonly pool: Fragment[] = [];

  constructor(rng: Rng, capacity = 36) {
    const material = new MeshStandardMaterial({
      color: 0x777168, roughness: 0.94, metalness: 0.04,
      map: getSurfaceTexture('rock', 2, 2),
      bumpMap: getSurfaceTexture('rock', 2, 2),
      bumpScale: 0.7,
    });
    // A few pre-displaced chunk shapes, shared across the pool.
    const geometries = Array.from({ length: 3 }, () => {
      const geo = new IcosahedronGeometry(1, 1);
      const pos = geo.attributes.position;
      const v = new Vector3();
      const seed = rng.range(0, 100);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n = Math.sin(v.x * 3.7 + seed) + Math.sin(v.y * 4.1 + seed * 1.7) + Math.sin(v.z * 3.3 + seed * 2.9);
        v.multiplyScalar(1 + (n / 3) * 0.3);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const normal = geo.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).normalize();
        normal.setXYZ(i, v.x, v.y, v.z);
      }
      normal.needsUpdate = true;
      return geo;
    });

    for (let i = 0; i < capacity; i++) {
      const mesh = new Mesh(geometries[i % geometries.length], material);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({
        active: false,
        mesh,
        velocity: new Vector3(),
        spinAxis: new Vector3(0, 1, 0),
        spinSpeed: 1,
        life: 0,
        maxLife: 1,
        baseScale: 1,
      });
    }
  }

  /** Shatter burst: chunk count and speed scale with the destroyed rock. */
  spawn(position: Vector3, rockRadius: number, rng: Rng): void {
    const count = Math.min(6, 3 + Math.floor(rockRadius / 8));
    for (let i = 0; i < count; i++) {
      const f = this.pool.find((x) => !x.active);
      if (!f) return;
      f.active = true;
      f.maxLife = rng.range(4, 7);
      f.life = f.maxLife;
      f.baseScale = rockRadius * rng.range(0.16, 0.32);
      const [dx, dy, dz] = rng.unitSphere();
      f.velocity.set(dx, dy, dz).multiplyScalar(rng.range(4, 14));
      const [ax, ay, az] = rng.unitSphere();
      f.spinAxis.set(ax, ay, az);
      f.spinSpeed = rng.range(0.8, 2.6);
      f.mesh.position.copy(position).addScaledVector(f.velocity, 0.08);
      f.mesh.rotation.set(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6));
      f.mesh.scale.setScalar(f.baseScale);
      f.mesh.visible = true;
    }
  }

  update(dt: number): void {
    for (const f of this.pool) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        f.mesh.visible = false;
        continue;
      }
      f.mesh.position.addScaledVector(f.velocity, dt);
      f.mesh.rotateOnAxis(f.spinAxis, f.spinSpeed * dt);
      // Shrink out over the last quarter of life.
      const frac = f.life / f.maxLife;
      f.mesh.scale.setScalar(f.baseScale * Math.min(1, frac * 4));
    }
  }
}
