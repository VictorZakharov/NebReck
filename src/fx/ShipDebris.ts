import {
  Group,
  Material,
  Mesh,
  Object3D,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { collectDebrisSourceParts, DebrisSourcePart } from './ShipDebrisSources';

interface GroundSampler {
  heightAt(x: number, z: number): number;
}

interface Fragment {
  mesh: Mesh;
  velocity: Vector3;
  spinAxis: Vector3;
  spinSpeed: number;
  life: number;
  maxLife: number;
  baseScale: Vector3;
  radius: number;
  elongation: number;
  maxExtent: number;
}

export interface ShipDebrisDiagnostics {
  activeFragments: number;
  exactSourceParts: number;
  geometryTypes: string[];
  maxElongation: number;
  maxExtent: number;
}

const worldPosition = new Vector3();
const outward = new Vector3();
const randomDirection = new Vector3();

/**
 * Bounded rigid breakup using cloned components from the destroyed craft.
 * Geometry and materials are the real hull parts; no substitute debris model.
 */
export class ShipDebris {
  readonly group = new Group();
  private readonly fragments: Fragment[] = [];

  constructor(private readonly capacity = 72) {}

  spawn(
    source: Object3D,
    sourceVelocity: Vector3,
    hullRadius: number,
    rng: Rng,
  ): void {
    source.updateWorldMatrix(true, true);
    const origin = source.getWorldPosition(worldPosition).clone();
    const candidates = collectDebrisSourceParts(source, hullRadius);
    const count = Math.min(candidates.length, Math.min(12, 5 + Math.floor(hullRadius / 2)));

    for (let index = 0; index < count; index++) {
      this.makeFragment(candidates[index], origin, sourceVelocity, hullRadius, rng);
    }
  }

  update(dt: number, ground: GroundSampler | null): void {
    for (let index = this.fragments.length - 1; index >= 0; index--) {
      const fragment = this.fragments[index];
      fragment.life -= dt;
      if (fragment.life <= 0) {
        this.release(index);
        continue;
      }

      if (ground) fragment.velocity.y -= 24 * dt;
      else fragment.velocity.multiplyScalar(Math.exp(-0.045 * dt));
      fragment.mesh.position.addScaledVector(fragment.velocity, dt);
      fragment.mesh.rotateOnWorldAxis(fragment.spinAxis, fragment.spinSpeed * dt);

      if (ground) this.resolveGround(fragment, ground, dt);
      const fade = Math.min(1, fragment.life / Math.min(1.2, fragment.maxLife * 0.12));
      fragment.mesh.scale.copy(fragment.baseScale).multiplyScalar(fade);
    }
  }

  diagnostics(): ShipDebrisDiagnostics {
    return {
      activeFragments: this.fragments.length,
      exactSourceParts: this.fragments.filter(
        (fragment) => typeof fragment.mesh.userData.sourcePartUuid === 'string',
      ).length,
      geometryTypes: [...new Set(this.fragments.map((fragment) => fragment.mesh.geometry.type))],
      maxElongation: Math.max(0, ...this.fragments.map((fragment) => fragment.elongation)),
      maxExtent: Math.max(0, ...this.fragments.map((fragment) => fragment.maxExtent)),
    };
  }

  private makeFragment(
    part: DebrisSourcePart,
    origin: Vector3,
    sourceVelocity: Vector3,
    hullRadius: number,
    rng: Rng,
  ): void {
    const source = part.mesh;
    if (this.fragments.length >= this.capacity) this.release(0);
    const geometry = source.geometry.clone();
    const material = cloneMaterial(source.material);
    const mesh = new Mesh(geometry, material);
    mesh.userData.sourcePartUuid = source.uuid;
    source.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.renderOrder = source.renderOrder;
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    this.group.add(mesh);

    geometry.computeBoundingSphere();
    const radius = Math.max(
      0.12,
      (geometry.boundingSphere?.radius ?? 0.5) * Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z),
    );
    outward.copy(mesh.position).sub(origin);
    if (outward.lengthSq() < 0.01) {
      const [x, y, z] = rng.unitSphere();
      outward.set(x, y, z);
    } else outward.normalize();
    const [rx, ry, rz] = rng.unitSphere();
    randomDirection.set(rx, ry, rz);
    const velocity = sourceVelocity.clone()
      .addScaledVector(outward, rng.range(5, 12) + hullRadius * 0.28)
      .addScaledVector(randomDirection, rng.range(2, 6));
    const [ax, ay, az] = rng.unitSphere();
    const maxLife = rng.range(9, 14);
    this.fragments.push({
      mesh,
      velocity,
      spinAxis: new Vector3(ax, ay, az),
      spinSpeed: rng.range(1.2, 4.2),
      life: maxLife,
      maxLife,
      baseScale: mesh.scale.clone(),
      radius,
      elongation: part.elongation,
      maxExtent: part.maxExtent,
    });
  }

  private resolveGround(fragment: Fragment, ground: GroundSampler, dt: number): void {
    const floor = ground.heightAt(fragment.mesh.position.x, fragment.mesh.position.z) +
      fragment.radius * 0.32;
    if (fragment.mesh.position.y >= floor) return;
    fragment.mesh.position.y = floor;
    if (fragment.velocity.y < -1.5) fragment.velocity.y *= -0.22;
    else fragment.velocity.y = 0;
    const friction = Math.exp(-4.2 * dt);
    fragment.velocity.x *= friction;
    fragment.velocity.z *= friction;
    fragment.spinSpeed *= Math.exp(-3.2 * dt);
  }

  private release(index: number): void {
    const [fragment] = this.fragments.splice(index, 1);
    this.group.remove(fragment.mesh);
    fragment.mesh.geometry.dispose();
    disposeMaterial(fragment.mesh.material);
  }
}

function cloneMaterial(material: Material | Material[]): Material | Material[] {
  return Array.isArray(material) ? material.map((item) => item.clone()) : material.clone();
}

function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const item of material) item.dispose();
  } else material.dispose();
}
