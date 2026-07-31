import {
  AdditiveBlending,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { TurretWeapon } from './Turret';
import { Ship } from './Ship';

export const CAPITAL_BEAM_CHARGE_TIME = 2;
export const CAPITAL_BEAM_RANGE = 1400;
export const CAPITAL_BEAM_RADIUS = 7;
export const CAPITAL_BEAM_HALF_ANGLE = Math.PI / 14; // 12.9 degrees

export interface CapitalTurretMount {
  position: Vector3;
  normal: Vector3;
  weapon: TurretWeapon;
}

export interface CapitalBeamShot {
  origin: Vector3;
  direction: Vector3;
  range: number;
  radius: number;
}

export interface CapitalBeamContext {
  player: Ship;
  playerVisible: boolean;
  canSeePlayer(): boolean;
  onCharge(): void;
  /** Returns the distance reached before the first absorbing obstacle. */
  onFire(shot: CapitalBeamShot): number;
}

export type CapitalBeamPhase = 'idle' | 'charging' | 'firing';

const localMuzzle = new Vector3(0, 0.4, -32.7);
const localForward = new Vector3(0, 0, -1);
const beamOrigin = new Vector3();
const beamForward = new Vector3();
const desiredAim = new Vector3();
const clampedAim = new Vector3();
const lateralAim = new Vector3();
const localAim = new Vector3();
const localRight = new Vector3(1, 0, 0);
const inverseCapital = new Quaternion();
const aimQuaternion = new Quaternion();

/**
 * A Vigil capital ship: stationary carrier, twelve independently targetable
 * top/bottom batteries, and a committed frontal superweapon. Once charging,
 * the ray always fires after two seconds at the last visible player bearing,
 * clamped to its physical traverse cone.
 */
export class CapitalShip extends Ship {
  readonly turretMounts: CapitalTurretMount[] = [
    { position: new Vector3(-3.2, 4.05, -13), normal: new Vector3(0, 1, 0), weapon: 'homing' },
    { position: new Vector3(3.2, 4.05, -13), normal: new Vector3(0, 1, 0), weapon: 'autogun' },
    { position: new Vector3(-3.4, 4.05, -4), normal: new Vector3(0, 1, 0), weapon: 'bolt' },
    { position: new Vector3(3.4, 4.05, -4), normal: new Vector3(0, 1, 0), weapon: 'fast' },
    { position: new Vector3(-5.9, 2.25, 7), normal: new Vector3(0, 1, 0), weapon: 'autogun' },
    { position: new Vector3(5.9, 2.25, 7), normal: new Vector3(0, 1, 0), weapon: 'homing' },
    { position: new Vector3(-3.0, -5.45, -10), normal: new Vector3(0, -1, 0), weapon: 'fast' },
    { position: new Vector3(3.0, -5.45, -10), normal: new Vector3(0, -1, 0), weapon: 'bolt' },
    { position: new Vector3(-3.0, -5.45, 2), normal: new Vector3(0, -1, 0), weapon: 'autogun' },
    { position: new Vector3(3.0, -5.45, 2), normal: new Vector3(0, -1, 0), weapon: 'homing' },
    { position: new Vector3(-5.9, -2.55, 11), normal: new Vector3(0, -1, 0), weapon: 'bolt' },
    { position: new Vector3(5.9, -2.55, 11), normal: new Vector3(0, -1, 0), weapon: 'fast' },
  ];

  private readonly beamPivot = new Group();
  private readonly chargeGuide: Mesh;
  private readonly beamHalo: Mesh;
  private readonly beamCore: Mesh;
  private readonly chargeOrb: Mesh;
  private readonly chargeRings: Mesh[] = [];
  private readonly lastVisiblePlayer = new Vector3();
  private phase: CapitalBeamPhase = 'idle';
  private chargeLeft = 0;
  private firingLeft = 0;
  private cooldown = 5;
  private visualTime = 0;

  constructor() {
    super('capital', 1600, 0, 0, 999);
    this.throttle = 0.25;

    this.beamPivot.position.copy(localMuzzle);
    this.object.add(this.beamPivot);
    const cylinder = new CylinderGeometry(1, 1, 1, 16, 1, true);
    this.chargeGuide = this.makeBeam(cylinder, 0xff4a20, 0);
    this.beamHalo = this.makeBeam(cylinder, 0xff2608, 0);
    this.beamCore = this.makeBeam(cylinder, 0xfff1c4, 0);

    this.chargeOrb = new Mesh(
      new SphereGeometry(1, 18, 12),
      new MeshBasicMaterial({
        color: 0xff6432,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        blending: AdditiveBlending,
      }),
    );
    this.beamPivot.add(this.chargeOrb);
    for (let index = 0; index < 3; index++) {
      const ring = new Mesh(
        new TorusGeometry(1.3 + index * 0.55, 0.08, 6, 28),
        new MeshBasicMaterial({
          color: index === 2 ? 0xffb05a : 0xff3b18,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
          blending: AdditiveBlending,
        }),
      );
      ring.position.z = 0.2 + index * 0.28;
      this.beamPivot.add(ring);
      this.chargeRings.push(ring);
    }
  }

  get beamPhase(): CapitalBeamPhase {
    return this.phase;
  }

  get beamChargeFraction(): number {
    return this.phase === 'charging'
      ? 1 - this.chargeLeft / CAPITAL_BEAM_CHARGE_TIME
      : this.phase === 'firing' ? 1 : 0;
  }

  update(dt: number, context?: CapitalBeamContext): void {
    this.visualTime += dt;
    if (this.phase === 'firing') {
      this.firingLeft -= dt;
      this.updateFiringVisual();
      if (this.firingLeft <= 0) {
        this.phase = 'idle';
        this.hideBeam();
      }
    } else if (this.phase === 'charging') {
      this.updateCommittedAim(context);
      this.chargeLeft -= dt;
      this.updateChargeVisual();
      if (this.chargeLeft <= 0 && context) this.fireBeam(context);
    } else {
      this.cooldown -= dt;
      this.hideBeam();
      if (context && this.cooldown <= 0 && this.canBeginCharge(context)) {
        this.phase = 'charging';
        this.chargeLeft = CAPITAL_BEAM_CHARGE_TIME;
        this.lastVisiblePlayer.copy(context.player.position);
        this.updateCommittedAim(context);
        context.onCharge();
      }
    }
    this.updateCommon(dt);
  }

  private canBeginCharge(context: CapitalBeamContext): boolean {
    if (!context.player.alive || !context.playerVisible) return false;
    this.worldMuzzle(beamOrigin);
    this.forward(beamForward);
    desiredAim.copy(context.player.position).sub(beamOrigin);
    const distance = desiredAim.length();
    if (distance < 70 || distance > CAPITAL_BEAM_RANGE) return false;
    if (beamForward.dot(desiredAim.divideScalar(distance)) < Math.cos(CAPITAL_BEAM_HALF_ANGLE)) {
      return false;
    }
    return context.canSeePlayer();
  }

  private updateCommittedAim(context?: CapitalBeamContext): void {
    this.worldMuzzle(beamOrigin);
    if (
      context?.player.alive && context.playerVisible && context.canSeePlayer()
    ) {
      this.lastVisiblePlayer.copy(context.player.position);
    }
    this.forward(beamForward).normalize();
    desiredAim.copy(this.lastVisiblePlayer).sub(beamOrigin);
    if (desiredAim.lengthSq() < 1e-6) desiredAim.copy(beamForward);
    else desiredAim.normalize();
    clampDirectionToCone(
      beamForward,
      desiredAim,
      CAPITAL_BEAM_HALF_ANGLE,
      this.object.quaternion,
      clampedAim,
    );
    inverseCapital.copy(this.object.quaternion).invert();
    localAim.copy(clampedAim).applyQuaternion(inverseCapital).normalize();
    this.beamPivot.quaternion.copy(aimQuaternion.setFromUnitVectors(localForward, localAim));
  }

  private fireBeam(context: CapitalBeamContext): void {
    this.phase = 'firing';
    this.firingLeft = 0.42;
    this.cooldown = 11;
    this.worldMuzzle(beamOrigin);
    const distance = context.onFire({
      origin: beamOrigin,
      direction: clampedAim,
      range: CAPITAL_BEAM_RANGE,
      radius: CAPITAL_BEAM_RADIUS,
    });
    this.setBeamLength(Math.max(1, Math.min(CAPITAL_BEAM_RANGE, distance)));
  }

  private makeBeam(geometry: CylinderGeometry, color: number, opacity: number): Mesh {
    const beam = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        toneMapped: false,
        blending: AdditiveBlending,
      }),
    );
    beam.rotation.x = Math.PI / 2;
    this.beamPivot.add(beam);
    this.setMeshLength(beam, CAPITAL_BEAM_RANGE, 0.1);
    return beam;
  }

  private updateChargeVisual(): void {
    const fraction = Math.max(0, Math.min(1, this.beamChargeFraction));
    const pulse = 0.82 + Math.sin(this.visualTime * (8 + fraction * 14)) * 0.18;
    const guideMat = this.chargeGuide.material as MeshBasicMaterial;
    guideMat.opacity = (0.08 + fraction * 0.34) * pulse;
    this.setMeshLength(this.chargeGuide, CAPITAL_BEAM_RANGE, 0.08 + fraction * 0.18);
    (this.chargeOrb.material as MeshBasicMaterial).opacity = 0.18 + fraction * 0.78;
    this.chargeOrb.scale.setScalar(0.55 + fraction * 2.1 + pulse * 0.18);
    this.chargeRings.forEach((ring, index) => {
      (ring.material as MeshBasicMaterial).opacity = 0.18 + fraction * 0.58;
      const collapse = Math.max(0.2, 1.35 - fraction + index * 0.18);
      ring.scale.setScalar(collapse * pulse);
      ring.rotation.z = this.visualTime * (index % 2 === 0 ? 1.8 : -2.2);
    });
    (this.beamHalo.material as MeshBasicMaterial).opacity = 0;
    (this.beamCore.material as MeshBasicMaterial).opacity = 0;
  }

  private updateFiringVisual(): void {
    const fraction = Math.max(0, this.firingLeft / 0.42);
    (this.chargeGuide.material as MeshBasicMaterial).opacity = 0;
    (this.beamHalo.material as MeshBasicMaterial).opacity = 0.5 * fraction;
    (this.beamCore.material as MeshBasicMaterial).opacity = 0.98 * fraction;
    (this.chargeOrb.material as MeshBasicMaterial).opacity = fraction;
    this.chargeOrb.scale.setScalar(3.4 + (1 - fraction) * 1.8);
    this.chargeRings.forEach((ring, index) => {
      (ring.material as MeshBasicMaterial).opacity = 0.7 * fraction;
      ring.scale.setScalar(1 + index * 0.12 + (1 - fraction) * 1.35);
    });
  }

  private setBeamLength(length: number): void {
    this.setMeshLength(this.beamHalo, length, CAPITAL_BEAM_RADIUS * 1.8);
    this.setMeshLength(this.beamCore, length, CAPITAL_BEAM_RADIUS * 0.62);
  }

  private setMeshLength(mesh: Mesh, length: number, radius: number): void {
    mesh.position.set(0, 0, -length * 0.5);
    mesh.scale.set(radius, length, radius);
  }

  private hideBeam(): void {
    (this.chargeGuide.material as MeshBasicMaterial).opacity = 0;
    (this.beamHalo.material as MeshBasicMaterial).opacity = 0;
    (this.beamCore.material as MeshBasicMaterial).opacity = 0;
    (this.chargeOrb.material as MeshBasicMaterial).opacity = 0;
    for (const ring of this.chargeRings) {
      (ring.material as MeshBasicMaterial).opacity = 0;
    }
  }

  private worldMuzzle(out: Vector3): Vector3 {
    return out.copy(localMuzzle).applyQuaternion(this.object.quaternion).add(this.position);
  }
}

function clampDirectionToCone(
  forward: Vector3,
  desired: Vector3,
  halfAngle: number,
  shipRotation: Quaternion,
  out: Vector3,
): Vector3 {
  const cosAngle = Math.cos(halfAngle);
  const dot = Math.max(-1, Math.min(1, forward.dot(desired)));
  if (dot >= cosAngle) return out.copy(desired);
  lateralAim.copy(desired).addScaledVector(forward, -dot);
  if (lateralAim.lengthSq() < 1e-6) {
    lateralAim.copy(localRight).applyQuaternion(shipRotation);
  } else {
    lateralAim.normalize();
  }
  return out
    .copy(forward)
    .multiplyScalar(cosAngle)
    .addScaledVector(lateralAim, Math.sin(halfAngle))
    .normalize();
}
