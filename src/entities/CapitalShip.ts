import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import type { TurretWeapon } from './Turret';
import { Ship } from './Ship';

export const CAPITAL_BEAM_CHARGE_TIME = 2;
export const CAPITAL_BEAM_ACTIVATION_RANGE = 500;
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
  private guideLength = CAPITAL_BEAM_RANGE;

  constructor() {
    super('capital', 1600, 0, 0, 999);
    this.throttle = 0.25;

    // Charge guides, beam cylinders, orb, and rings are transient VFX rather
    // than carrier structure; never clone this subtree into physical debris.
    this.beamPivot.userData.excludeFromDebris = true;
    this.beamPivot.position.copy(localMuzzle);
    this.object.add(this.beamPivot);
    const cylinder = new CylinderGeometry(1, 1, 1, 16, 1, true);
    this.chargeGuide = this.makeBeam(cylinder, 0xff6b32, 0, true);
    this.beamHalo = this.makeBeam(cylinder, 0xff2608, 0, false);
    this.beamCore = this.makeBeam(cylinder, 0xfff1c4, 0, false);

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

  /** Current visible charge-guide reach, exposed for deterministic diagnostics. */
  get beamGuideLength(): number {
    return this.guideLength;
  }

  update(dt: number, context?: CapitalBeamContext): void {
    this.visualTime += dt;
    for (const beam of [this.chargeGuide, this.beamHalo, this.beamCore]) {
      (beam.material as ShaderMaterial).uniforms.uTime.value = this.visualTime;
    }
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
    if (
      context.player.position.distanceToSquared(this.position) >
      CAPITAL_BEAM_ACTIVATION_RANGE ** 2
    ) return false;
    this.worldMuzzle(beamOrigin);
    this.forward(beamForward);
    desiredAim.copy(context.player.position).sub(beamOrigin);
    const distance = desiredAim.length();
    if (distance < 70) return false;
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
    const targetDistance = desiredAim.length();
    this.guideLength = Math.min(
      CAPITAL_BEAM_RANGE,
      Math.max(70, targetDistance + CAPITAL_BEAM_RADIUS * 3),
    );
    if (targetDistance < 1e-3) desiredAim.copy(beamForward);
    else desiredAim.divideScalar(targetDistance);
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

  private makeBeam(
    geometry: CylinderGeometry,
    color: number,
    opacity: number,
    dashed: boolean,
  ): Mesh {
    const beam = new Mesh(
      geometry,
      makeBeamMaterial(color, opacity, dashed),
    );
    beam.rotation.x = Math.PI / 2;
    this.beamPivot.add(beam);
    this.setMeshLength(beam, CAPITAL_BEAM_RANGE, 0.1);
    return beam;
  }

  private updateChargeVisual(): void {
    const fraction = Math.max(0, Math.min(1, this.beamChargeFraction));
    const pulse = 0.82 + Math.sin(this.visualTime * (8 + fraction * 14)) * 0.18;
    const guideMat = this.chargeGuide.material as ShaderMaterial;
    guideMat.uniforms.uOpacity.value = (0.035 + fraction * 0.2) * pulse;
    this.setMeshLength(this.chargeGuide, this.guideLength, 0.06 + fraction * 0.14);
    (this.chargeOrb.material as MeshBasicMaterial).opacity = 0.18 + fraction * 0.78;
    this.chargeOrb.scale.setScalar(0.55 + fraction * 2.1 + pulse * 0.18);
    this.chargeRings.forEach((ring, index) => {
      (ring.material as MeshBasicMaterial).opacity = 0.18 + fraction * 0.58;
      const collapse = Math.max(0.2, 1.35 - fraction + index * 0.18);
      ring.scale.setScalar(collapse * pulse);
      ring.rotation.z = this.visualTime * (index % 2 === 0 ? 1.8 : -2.2);
    });
    setBeamOpacity(this.beamHalo, 0);
    setBeamOpacity(this.beamCore, 0);
  }

  private updateFiringVisual(): void {
    const fraction = Math.max(0, this.firingLeft / 0.42);
    setBeamOpacity(this.chargeGuide, 0);
    setBeamOpacity(this.beamHalo, 0.5 * fraction);
    setBeamOpacity(this.beamCore, 0.98 * fraction);
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
    setBeamOpacity(this.chargeGuide, 0);
    setBeamOpacity(this.beamHalo, 0);
    setBeamOpacity(this.beamCore, 0);
    (this.chargeOrb.material as MeshBasicMaterial).opacity = 0;
    for (const ring of this.chargeRings) {
      (ring.material as MeshBasicMaterial).opacity = 0;
    }
  }

  private worldMuzzle(out: Vector3): Vector3 {
    return out.copy(localMuzzle).applyQuaternion(this.object.quaternion).add(this.position);
  }
}

function makeBeamMaterial(color: number, opacity: number, dashed: boolean): ShaderMaterial {
  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color).multiplyScalar(dashed ? 2.2 : 4.2) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uDashed: { value: dashed ? 1 : 0 },
    },
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uDashed;
      varying vec2 vUv;
      void main() {
        float phase = fract(vUv.y * 18.0 - uTime * 3.8);
        float dash = smoothstep(0.1, 0.18, phase) * (1.0 - smoothstep(0.42, 0.52, phase));
        float pulse = 0.62 + 0.38 * sin(uTime * 13.0 + vUv.y * 80.0);
        if (uDashed > 0.5 && dash < 0.08) discard;
        float pattern = mix(0.78 + pulse * 0.22, dash * pulse, uDashed);
        float alpha = uOpacity * pattern;
        if (alpha <= 0.002) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
  return material;
}

function setBeamOpacity(mesh: Mesh, opacity: number): void {
  (mesh.material as ShaderMaterial).uniforms.uOpacity.value = opacity;
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
