import { Euler, Group, Quaternion, Vector3 } from 'three';
import { Input } from '../core/Input';
import { CONFIG } from '../game/Config';
import { PlayerShipDef, PlayerStats } from '../game/Ships';
import { CockpitDisplays } from './CockpitDisplays';
import { buildCockpitMesh } from './CockpitMesh';
import { Ship } from './Ship';
import { STYLE_ACCENTS } from './ShipMesh';

const rotDelta = new Euler();
const rotQuat = new Quaternion();
const desiredVel = new Vector3();
const fwd = new Vector3();
const right = new Vector3();
const up = new Vector3();

/**
 * Arcade flight model: mouse steers pitch/yaw with smoothed rates, Q/E rolls,
 * WASD thrusts/strafes, Shift boosts (energy-gated). Velocity chases the
 * commanded direction so flying feels responsive but still drifts through
 * turns. All rates are dt-scaled: identical behavior at 60 Hz and 144 Hz.
 *
 * Stats come from the selected hangar ship (`PlayerShipDef`); `speedMult` is
 * raised by crafted engine upgrades during a run.
 */
export class PlayerShip extends Ship {
  readonly def: PlayerShipDef;
  readonly stats: PlayerStats;
  /** First-person interior, toggled by the camera blend. */
  readonly cockpit: Group;
  /** Live console displays inside the cockpit. */
  readonly displays: CockpitDisplays;

  boostEnergy: number;
  boosting = false;
  /** Crafted engine upgrades scale speed/accel. */
  speedMult = 1;
  /** Current speed as a fraction of boost speed, for HUD + camera. */
  speedFrac = 0;

  private pitchRate = 0;
  private yawRate = 0;
  private rollRate = 0;

  constructor(def: PlayerShipDef, mods: { hull?: number; boost?: number } = {}) {
    // Copy the stat block so Legacy meta-upgrades never mutate the catalog.
    const s: PlayerStats = {
      ...def.stats,
      hullMax: Math.round(def.stats.hullMax * (mods.hull ?? 1)),
      boostEnergyMax: Math.round(def.stats.boostEnergyMax * (mods.boost ?? 1)),
    };
    super(def.kind, s.hullMax, s.shieldMax, s.shieldRegenRate, s.shieldRegenDelay);
    this.def = def;
    this.stats = s;
    this.boostEnergy = s.boostEnergyMax;
    this.displays = new CockpitDisplays(STYLE_ACCENTS[def.kind]);
    this.cockpit = buildCockpitMesh(STYLE_ACCENTS[def.kind], this.displays);
    this.object.add(this.cockpit);
  }

  update(dt: number, input: Input): void {
    const s = this.stats;
    const { dx, dy } = input.consumeMouseDelta(dt);

    // Mouse deflection → target angular rates, smoothed for weight.
    const sens = CONFIG.player.mouseSensitivity;
    const targetYaw = -dx * sens * s.turnRate * 60;
    const targetPitch = -dy * sens * s.turnRate * 60;
    const smooth = 1 - Math.exp(-12 * dt);
    this.yawRate += (clampRate(targetYaw, s.turnRate * 2) - this.yawRate) * smooth;
    this.pitchRate += (clampRate(targetPitch, s.turnRate * 2) - this.pitchRate) * smooth;

    let targetRoll = input.flightAxis('roll') * s.rollRate;
    if (input.isDown('KeyQ')) targetRoll += s.rollRate;
    if (input.isDown('KeyE')) targetRoll -= s.rollRate;
    targetRoll += this.yawRate * 0.55; // banked turns
    this.rollRate += (targetRoll - this.rollRate) * smooth;

    rotDelta.set(this.pitchRate * dt, this.yawRate * dt, this.rollRate * dt, 'YXZ');
    rotQuat.setFromEuler(rotDelta);
    this.object.quaternion.multiply(rotQuat);

    // Thrust.
    this.forward(fwd);
    right.set(1, 0, 0).applyQuaternion(this.object.quaternion);
    up.set(0, 1, 0).applyQuaternion(this.object.quaternion);

    const touchThrust = input.flightAxis('thrust');
    let thrust = touchThrust < 0 ? touchThrust * 0.6 : touchThrust;
    if (input.isDown('KeyW')) thrust += 1;
    if (input.isDown('KeyS')) thrust -= 0.6;
    let strafeX = input.flightAxis('strafeX');
    if (input.isDown('KeyD')) strafeX += 1;
    if (input.isDown('KeyA')) strafeX -= 1;
    let strafeY = input.flightAxis('strafeY');
    if (input.isDown('Space')) strafeY += 1;
    if (input.isDown('ControlLeft')) strafeY -= 1;

    const wantsBoost = input.isDown('ShiftLeft') && thrust > 0 && this.boostEnergy > 1;
    this.boosting = wantsBoost;
    if (wantsBoost) {
      this.boostEnergy = Math.max(0, this.boostEnergy - s.boostDrain * dt);
    } else {
      this.boostEnergy = Math.min(s.boostEnergyMax, this.boostEnergy + s.boostRegen * dt);
    }

    const maxSpeed = (wantsBoost ? s.boostSpeed : s.maxSpeed) * this.speedMult;
    desiredVel
      .copy(fwd)
      .multiplyScalar(thrust * maxSpeed)
      .addScaledVector(right, strafeX * s.maxSpeed * this.speedMult * 0.45)
      .addScaledVector(up, strafeY * s.maxSpeed * this.speedMult * 0.4);

    const accel = (wantsBoost ? s.accel * 1.8 : s.accel) * this.speedMult;
    const t = 1 - Math.exp((-accel / s.maxSpeed) * dt * 2.2);
    this.velocity.lerp(desiredVel, t);
    this.position.addScaledVector(this.velocity, dt);

    this.throttle = Math.min(1, this.velocity.length() / s.maxSpeed) * (wantsBoost ? 1 : 0.8);
    this.speedFrac = this.velocity.length() / s.boostSpeed;

    this.updateCommon(dt);
  }

  override dispose(): void {
    this.displays.dispose();
    super.dispose();
  }
}

function clampRate(v: number, max: number): number {
  return Math.max(-max, Math.min(max, v));
}
