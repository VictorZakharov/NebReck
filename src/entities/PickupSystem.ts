import {
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';

export type ResourceType = 'scrap' | 'crystal' | 'flux';

export const RESOURCE_INFO: Record<ResourceType, { name: string; color: number; glyph: string }> = {
  scrap: { name: 'Scrap Alloy', color: 0xffa040, glyph: '▲' },
  crystal: { name: 'Ion Crystal', color: 0x2ee6c8, glyph: '◆' },
  flux: { name: 'Flux Core', color: 0xc26aff, glyph: '✦' },
};

/** In-memory snapshot used when swapping between orbit and a visited planet. */
export interface PickupSnapshot {
  type: ResourceType;
  position: Vector3;
  velocity: Vector3;
  rotation: Vector3;
  life: number;
}

interface Pickup {
  active: boolean;
  type: ResourceType;
  mesh: Mesh;
  material: MeshBasicMaterial;
  velocity: Vector3;
  life: number;
}

const toPlayer = new Vector3();

/**
 * Pooled resource drops from mined veins and destroyed ships. They tumble
 * outward, then magnet toward the player inside attraction range and are
 * collected on contact.
 */
export class PickupSystem {
  readonly group = new Group();
  private readonly pool: Pickup[] = [];
  private readonly geometry = new OctahedronGeometry(0.55, 0);

  constructor(capacity = 64) {
    for (let i = 0; i < capacity; i++) {
      const material = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const mesh = new Mesh(this.geometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({
        active: false,
        type: 'scrap',
        mesh,
        material,
        velocity: new Vector3(),
        life: 0,
      });
    }
  }

  spawn(position: Vector3, type: ResourceType, count: number, rng: Rng): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool.find((x) => !x.active);
      if (!p) return;
      p.active = true;
      p.type = type;
      p.life = 90;
      const [dx, dy, dz] = rng.unitSphere();
      p.velocity.set(dx, dy, dz).multiplyScalar(rng.range(4, 11));
      p.mesh.position.copy(position).addScaledVector(p.velocity, 0.1);
      p.mesh.rotation.set(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6));
      p.material.color.set(RESOURCE_INFO[type].color).multiplyScalar(1.8);
      p.mesh.visible = true;
    }
  }

  update(
    dt: number,
    playerPos: Vector3,
    playerAlive: boolean,
    onCollect: (type: ResourceType) => void,
  ): void {
    // Generous tractor field: inside the epicenter everything comes to YOU.
    const magnetRadius = 120;
    const collectRadius = 9;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.mesh.rotation.y += dt * 2.2;
      p.mesh.rotation.x += dt * 1.3;

      if (playerAlive) {
        toPlayer.copy(playerPos).sub(p.mesh.position);
        const dist = toPlayer.length();
        if (dist < collectRadius) {
          p.active = false;
          p.mesh.visible = false;
          onCollect(p.type);
          continue;
        }
        if (dist < magnetRadius) {
          // Stronger pull the closer it gets — feels like a tractor beam.
          const pull = 160 * (1 - dist / magnetRadius) + 45;
          p.velocity.addScaledVector(toPlayer.normalize(), pull * dt);
        }
      }
      p.velocity.multiplyScalar(Math.pow(0.55, dt));
      p.mesh.position.addScaledVector(p.velocity, dt);
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.active = false;
      p.mesh.visible = false;
    }
  }

  /** Preserve loose salvage while its world is detached from the scene. */
  snapshot(): PickupSnapshot[] {
    return this.pool
      .filter((p) => p.active)
      .map((p) => ({
        type: p.type,
        position: p.mesh.position.clone(),
        velocity: p.velocity.clone(),
        rotation: new Vector3(p.mesh.rotation.x, p.mesh.rotation.y, p.mesh.rotation.z),
        life: p.life,
      }));
  }

  restore(snapshot: readonly PickupSnapshot[]): void {
    this.clear();
    for (const saved of snapshot) {
      const p = this.pool.find((candidate) => !candidate.active);
      if (!p) break;
      p.active = true;
      p.type = saved.type;
      p.life = saved.life;
      p.velocity.copy(saved.velocity);
      p.mesh.position.copy(saved.position);
      p.mesh.rotation.set(saved.rotation.x, saved.rotation.y, saved.rotation.z);
      p.material.color.set(RESOURCE_INFO[saved.type].color).multiplyScalar(1.8);
      p.mesh.visible = true;
    }
  }
}
