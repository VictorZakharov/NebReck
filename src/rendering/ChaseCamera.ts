import {
  Euler,
  MathUtils,
  Matrix4,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import { CONFIG } from '../game/Config';

const tmpOffset = new Vector3();
const tmpLook = new Vector3();
const tmpShake = new Vector3();
const tmpUp = new Vector3();
const tmpMat = new Matrix4();
const targetQuat = new Quaternion();
const firstPos = new Vector3();
const firstQuat = new Quaternion();
const shakeEuler = new Euler();
const shakeQuat = new Quaternion();

/** Cockpit eye point in ship-local space (kept high so the dash stays low). */
const EYE_LOCAL = new Vector3(0, 0.58, -0.55);

export type CameraMode = 'third' | 'first';

/**
 * Player camera with two modes blended smoothly:
 *  - third: critically-damped chase follow with look-ahead, banks with the ship
 *  - first: locked to the cockpit eye, ship-rigid
 * Toggling animates `blend` 0↔1; callers use `blend` to swap hull/cockpit
 * visibility mid-transition. Trauma shake and boost FOV kick apply in both.
 */
export class ChaseCamera {
  readonly camera: PerspectiveCamera;
  mode: CameraMode = 'third';
  /** 0 = fully third person, 1 = fully first person. */
  blend = 0;

  private trauma = 0;
  private damageKick = 0;
  private shakeTime = 0;
  private followDist = CONFIG.camera.followDistance;
  // Persistent third-person smoothing state (independent of the final blend).
  private readonly smoothPos = new Vector3();
  private readonly smoothQuat = new Quaternion();

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(CONFIG.camera.fov, aspect, 0.1, 20000);
  }

  toggleMode(): void {
    this.mode = this.mode === 'third' ? 'first' : 'third';
  }

  /** Add shake; strength in [0,1]. Decays automatically. */
  addTrauma(strength: number): void {
    this.trauma = Math.min(1, this.trauma + strength);
  }

  /** Damage-scaled impact shake. Hull strikes hit harder than shield ripples. */
  addDamageShake(damage: number, shieldAbsorbed: boolean): void {
    const severity = 1 - Math.exp(-Math.max(0, damage) / 24);
    const strength = Math.min(1, 0.08 + severity * (shieldAbsorbed ? 0.48 : 0.95));
    // A second rocket must feel like a second rocket. Preserve the larger base
    // impulse, then compound a bounded fraction instead of replacing it via max().
    this.trauma = Math.min(1, Math.max(this.trauma, strength) + strength * 0.32);
    this.damageKick = Math.min(1.6, this.damageKick + strength * 0.9);
  }

  diagnostics(): { trauma: number; damageKick: number } {
    return { trauma: this.trauma, damageKick: this.damageKick };
  }

  snapTo(target: Object3D): void {
    this.computeGoal(target, tmpOffset, tmpLook);
    this.smoothPos.copy(tmpOffset);
    this.smoothQuat.copy(this.goalQuaternion(target, this.smoothPos));
    this.blend = this.mode === 'first' ? 1 : 0;
    this.apply(target);
  }

  update(dt: number, target: Object3D, speedFrac: number, boosting: boolean): void {
    // At speed the camera tucks IN toward the ship (not away) — the FOV kick
    // supplies the sense of velocity, the shorter leash keeps the ship large.
    const targetDist =
      CONFIG.camera.followDistance *
      (1 - Math.min(1, speedFrac) * CONFIG.camera.boostDistancePull);
    this.followDist += (targetDist - this.followDist) * (1 - Math.exp(-4 * dt));

    // Third-person follow state.
    this.computeGoal(target, tmpOffset, tmpLook);
    this.smoothPos.lerp(tmpOffset, 1 - Math.exp(-CONFIG.camera.positionLag * dt));
    this.smoothQuat.slerp(this.goalQuaternion(target, this.smoothPos), 1 - Math.exp(-8 * dt));

    // View-mode blend (~0.3s transition).
    const targetBlend = this.mode === 'first' ? 1 : 0;
    this.blend += (targetBlend - this.blend) * (1 - Math.exp(-10 * dt));
    if (Math.abs(this.blend - targetBlend) < 0.002) this.blend = targetBlend;

    this.apply(target);

    // FOV kick scales with speed, extra while boosting; cockpit sits a touch tighter.
    const baseFov = MathUtils.lerp(CONFIG.camera.fov, CONFIG.camera.fov - 4, this.blend);
    const targetFov =
      baseFov + speedFrac * 3 + (boosting ? CONFIG.camera.boostFovKick : 0);
    this.camera.fov = MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-5 * dt));
    this.camera.updateProjectionMatrix();

    // Trauma shake is squared for a soft falloff; damage adds a short rotation.
    // Both channels are damped in cockpit view so head-rattle never feels broken.
    this.trauma = Math.max(0, this.trauma - dt * 1.15);
    this.damageKick = Math.max(0, this.damageKick - dt * 2.7);
    if (this.trauma > 0) {
      this.shakeTime += dt * 40;
      const s = this.trauma * this.trauma * (1.05 - this.blend * 0.78);
      tmpShake.set(
        Math.sin(this.shakeTime * 1.1) * s,
        Math.cos(this.shakeTime * 1.7) * s,
        Math.sin(this.shakeTime * 2.3) * s * 0.5,
      );
      this.camera.position.add(tmpShake);
      const rotational = (s * 0.035 + this.damageKick * 0.025) *
        (1 - this.blend * 0.68);
      shakeEuler.set(
        Math.sin(this.shakeTime * 1.37) * rotational * 0.62,
        Math.cos(this.shakeTime * 0.91) * rotational,
        Math.sin(this.shakeTime * 1.83) * rotational * 1.25,
      );
      shakeQuat.setFromEuler(shakeEuler);
      this.camera.quaternion.multiply(shakeQuat);
    }
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Mix third-person smoothed state with the cockpit eye by `blend`. */
  private apply(target: Object3D): void {
    firstPos.copy(EYE_LOCAL);
    target.localToWorld(firstPos);
    target.getWorldQuaternion(firstQuat);

    const k = easeInOut(this.blend);
    this.camera.position.copy(this.smoothPos).lerp(firstPos, k);
    this.camera.quaternion.copy(this.smoothQuat).slerp(firstQuat, k);
  }

  /** Orientation looking from `eye` to the look-ahead point, banked with the ship. */
  private goalQuaternion(target: Object3D, eye: Vector3): Quaternion {
    tmpUp.set(0, 1, 0).applyQuaternion(target.quaternion);
    tmpMat.lookAt(eye, tmpLook, tmpUp);
    return targetQuat.setFromRotationMatrix(tmpMat);
  }

  private computeGoal(target: Object3D, outPos: Vector3, outLook: Vector3): void {
    outPos.set(0, CONFIG.camera.followHeight, this.followDist);
    target.localToWorld(outPos);
    // Aim above the ship so the hull sits low in frame, near the bottom edge.
    outLook.set(0, CONFIG.camera.lookUpOffset, -CONFIG.camera.lookAhead);
    target.localToWorld(outLook);
  }
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
