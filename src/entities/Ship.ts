import {
  BufferGeometry,
  Group,
  Material,
  Matrix4,
  Quaternion,
  Sprite,
  Vector3,
} from 'three';
import { buildShipMesh, ShipHitBox, ShipKind, ShipMesh } from './ShipMesh';

const faceMat = new Matrix4();
const faceUp = new Vector3(0, 1, 0);
const faceSide = new Vector3(1, 0, 0);
const faceDir = new Vector3();
const hitInverse = new Quaternion();
const hitLocalA = new Vector3();
const hitLocalB = new Vector3();
const hitLocalPoint = new Vector3();
const hitBestPoint = new Vector3();
const hitSegment = new Vector3();
const hitToCenter = new Vector3();

export interface DamageResult {
  died: boolean;
  shieldAbsorbed: boolean;
}

/**
 * Common ship state: transform (via `object`), velocity, hull/shield with
 * delayed shield regen, and engine glow driven by throttle. Player and enemy
 * ships both extend this; combat systems only care about this interface.
 */
export class Ship {
  readonly object: Group;
  /** The visible hull — hidden while the camera sits inside it (cockpit view). */
  readonly exterior: Group;
  readonly velocity = new Vector3();
  readonly kind: ShipKind;
  readonly radius: number;
  readonly gunpoints: Vector3[];
  readonly enginePoints: Vector3[];
  readonly hitBoxes: ShipHitBox[];

  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  shieldRegenRate: number;
  shieldRegenDelay: number;
  alive = true;
  /** 0..1, drives engine glow + trail emission. */
  throttle = 0;
  /** Engine glow multiplier — the cloak dims thruster signatures. */
  glowDim = 1;

  private shieldCooldown = 0;
  private readonly engineGlows: Sprite[];
  private disposed = false;

  constructor(kind: ShipKind, hullMax: number, shieldMax: number, shieldRegenRate = 6, shieldRegenDelay = 4) {
    const mesh: ShipMesh = buildShipMesh(kind);
    this.kind = kind;
    this.object = new Group();
    this.exterior = mesh.group;
    this.object.add(this.exterior);
    this.radius = mesh.radius;
    this.gunpoints = mesh.gunpoints;
    this.enginePoints = mesh.enginePoints;
    this.hitBoxes = mesh.hitBoxes;
    this.engineGlows = mesh.engineGlows;
    this.hull = hullMax;
    this.hullMax = hullMax;
    this.shield = shieldMax;
    this.shieldMax = shieldMax;
    this.shieldRegenRate = shieldRegenRate;
    this.shieldRegenDelay = shieldRegenDelay;
  }

  get position(): Vector3 {
    return this.object.position;
  }

  /** World-space forward direction (-Z of the ship). */
  forward(out: Vector3): Vector3 {
    return out.set(0, 0, -1).applyQuaternion(this.object.quaternion);
  }

  /**
   * Point the NOSE (-Z) at a world point. NOT Object3D.lookAt — that aims +Z
   * for non-camera objects, which is backwards for ships (see GOTCHAS.md).
   * Uses a side up-hint when aiming near-vertical (lookAt degenerates when
   * the aim direction parallels the up vector).
   */
  faceToward(point: Vector3): void {
    faceDir.copy(point).sub(this.position).normalize();
    const hint = Math.abs(faceDir.y) > 0.85 ? faceSide : faceUp;
    faceMat.lookAt(this.position, point, hint);
    this.object.quaternion.setFromRotationMatrix(faceMat);
  }

  /**
   * Swept world-space hit test. Most craft use their compact broad sphere;
   * large compound hulls expose tight local boxes so nearby sub-targets stay
   * shootable and the visible plating blocks line of sight accurately.
   */
  intersectSegment(a: Vector3, b: Vector3, out: Vector3, padding = 0): boolean {
    if (this.hitBoxes.length === 0) {
      return segmentHitsSphere(a, b, this.position, this.radius + padding, out);
    }

    hitInverse.copy(this.object.quaternion).invert();
    hitLocalA.copy(a).sub(this.position).applyQuaternion(hitInverse);
    hitLocalB.copy(b).sub(this.position).applyQuaternion(hitInverse);
    let bestDistanceSq = Infinity;
    let found = false;
    for (const box of this.hitBoxes) {
      if (!segmentHitsBox(hitLocalA, hitLocalB, box, hitLocalPoint, padding)) continue;
      const distanceSq = hitLocalPoint.distanceToSquared(hitLocalA);
      if (distanceSq >= bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      hitBestPoint.copy(hitLocalPoint);
      found = true;
    }
    if (!found) return false;
    out.copy(hitBestPoint).applyQuaternion(this.object.quaternion).add(this.position);
    return true;
  }

  takeDamage(amount: number): DamageResult {
    if (!this.alive) return { died: false, shieldAbsorbed: false };
    this.shieldCooldown = this.shieldRegenDelay;
    let shieldAbsorbed = false;
    if (this.shield > 0) {
      shieldAbsorbed = true;
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
    }
    if (amount > 0) this.hull -= amount;
    if (this.hull <= 0) {
      this.hull = 0;
      this.alive = false;
      return { died: true, shieldAbsorbed };
    }
    return { died: false, shieldAbsorbed };
  }

  protected updateCommon(dt: number): void {
    if (this.shieldCooldown > 0) {
      this.shieldCooldown -= dt;
    } else if (this.shield < this.shieldMax) {
      this.shield = Math.min(this.shieldMax, this.shield + this.shieldRegenRate * dt);
    }
    const glow = (0.35 + this.throttle * 0.85) * this.glowDim;
    for (const s of this.engineGlows) {
      s.material.opacity = glow;
      s.scale.setScalar(1.1 + this.throttle * 1.4);
    }
  }

  /**
   * Release the per-instance GPU buffers and materials created by ShipMesh.
   * Cached procedural textures are deliberately retained because they are
   * shared by every live hull. Safe to call more than once.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    this.object.traverse((object) => {
      const renderable = object as unknown as {
        geometry?: BufferGeometry;
        material?: Material | Material[];
      };
      if (renderable.geometry) geometries.add(renderable.geometry);
      if (Array.isArray(renderable.material)) {
        for (const material of renderable.material) materials.add(material);
      } else if (renderable.material) {
        materials.add(renderable.material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
}

function segmentHitsSphere(
  a: Vector3,
  b: Vector3,
  center: Vector3,
  radius: number,
  out: Vector3,
): boolean {
  hitSegment.copy(b).sub(a);
  hitToCenter.copy(center).sub(a);
  const lengthSq = hitSegment.lengthSq();
  const t = lengthSq > 1e-8
    ? Math.max(0, Math.min(1, hitToCenter.dot(hitSegment) / lengthSq))
    : 0;
  out.copy(a).addScaledVector(hitSegment, t);
  return out.distanceToSquared(center) <= radius * radius;
}

function segmentHitsBox(
  a: Vector3,
  b: Vector3,
  box: ShipHitBox,
  out: Vector3,
  padding: number,
): boolean {
  let tMin = 0;
  let tMax = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const half = box.half[axis] + padding;
    const start = a[axis] - box.center[axis];
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-8) {
      if (Math.abs(start) > half) return false;
      continue;
    }
    let near = (-half - start) / delta;
    let far = (half - start) / delta;
    if (near > far) [near, far] = [far, near];
    tMin = Math.max(tMin, near);
    tMax = Math.min(tMax, far);
    if (tMin > tMax) return false;
  }
  out.copy(a).lerp(b, tMin);
  return true;
}
