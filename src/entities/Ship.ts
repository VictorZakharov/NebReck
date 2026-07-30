import { Group, Matrix4, Sprite, Vector3 } from 'three';
import { buildShipMesh, ShipKind, ShipMesh } from './ShipMesh';

const faceMat = new Matrix4();
const faceUp = new Vector3(0, 1, 0);
const faceSide = new Vector3(1, 0, 0);
const faceDir = new Vector3();

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

  constructor(kind: ShipKind, hullMax: number, shieldMax: number, shieldRegenRate = 6, shieldRegenDelay = 4) {
    const mesh: ShipMesh = buildShipMesh(kind);
    this.kind = kind;
    this.object = new Group();
    this.exterior = mesh.group;
    this.object.add(this.exterior);
    this.radius = mesh.radius;
    this.gunpoints = mesh.gunpoints;
    this.enginePoints = mesh.enginePoints;
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
}
