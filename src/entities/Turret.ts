import { Matrix4, Quaternion, Vector3 } from 'three';
import { ENEMY_ROCKETS, EnemyRocketMode } from '../combat/WeaponDefs';
import { Rng } from '../core/Rng';
import { Ship } from './Ship';

const toPlayer = new Vector3();
const fwd = new Vector3();
const targetQuat = new Quaternion();
const lookMat = new Matrix4();
const zero = new Vector3();
const up = new Vector3(0, 1, 0);
const sideHint = new Vector3(1, 0, 0);

export type TurretWeapon = 'bolt' | 'autogun' | EnemyRocketMode;

export const TURRET_WEAPON_STATS = {
  bolt: {
    hull: 60, shield: 0, range: 340, turnRate: 1.4,
    fireCooldown: 0.9, projectileSpeed: 200, damage: 8, score: 200,
  },
  autogun: {
    hull: 58, shield: 0, range: 468, turnRate: 1.7,
    fireCooldown: 0.11, projectileSpeed: 390, damage: 2.6, score: 225,
  },
  homing: {
    hull: 76, shield: 0, range: 520, turnRate: 1.0,
    fireCooldown: 3.4, projectileSpeed: 92, damage: ENEMY_ROCKETS.homing.damage, score: 275,
  },
  fast: {
    hull: 70, shield: 0, range: 470, turnRate: 1.2,
    fireCooldown: 2.35, projectileSpeed: 285, damage: 24, score: 250,
  },
} as const;

/** Compatibility alias for ordinary gun batteries. */
export const TURRET_STATS = TURRET_WEAPON_STATS.bolt;

/**
 * Stationary defense emplacement guarding cave-asteroid bases. Tracks the
 * player inside its engagement range and fires twin bolts when aligned.
 * Reuses the Ship damage/health model so projectiles treat it like any hull.
 */
export class Turret extends Ship {
  readonly weapon: TurretWeapon;
  readonly stats: typeof TURRET_WEAPON_STATS[TurretWeapon];
  /** Fixed world-space outward normal for carrier mounts. */
  readonly mountNormal: Vector3 | null;
  /** Seconds of EMP stun remaining. */
  stunTimer = 0;
  /** Tutorial target: tracks visibly but never releases a shot. */
  training = false;
  private fireTimer: number;

  constructor(rng: Rng, weapon: TurretWeapon = 'bolt', mountNormal: Vector3 | null = null) {
    const stats = TURRET_WEAPON_STATS[weapon];
    super(
      weapon === 'bolt'
        ? 'turret'
        : weapon === 'autogun' ? 'autogun-turret' : 'rocket-turret',
      stats.hull,
      stats.shield,
    );
    this.weapon = weapon;
    this.stats = stats;
    this.mountNormal = mountNormal?.clone().normalize() ?? null;
    this.fireTimer = rng.range(0.4, 1.4);
  }

  canTraverse(target: Vector3): boolean {
    if (!this.mountNormal) return true;
    toPlayer.copy(target).sub(this.position);
    if (toPlayer.lengthSq() < 1e-6) return true;
    // Carrier mounts can swivel through a broad outward hemisphere but never
    // shoot through the deck to reach the opposite side of the hull.
    return toPlayer.normalize().dot(this.mountNormal) >= 0.08;
  }

  update(
    dt: number,
    playerPos: Vector3,
    playerAlive: boolean,
    fire: (t: Turret) => void,
    playerVisible = true,
  ): void {
    if (!this.alive || !playerAlive) return;
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.updateCommon(dt);
      return;
    }
    if (!playerVisible || !this.canTraverse(playerPos)) {
      this.updateCommon(dt);
      return;
    }

    toPlayer.copy(playerPos).sub(this.position);
    const dist = toPlayer.length();
    if (dist > this.stats.range) {
      this.updateCommon(dt);
      return;
    }

    // Swivel toward the player at a capped rate (-Z = barrels, see Ship.faceToward).
    // The up-hint must never be parallel to the aim direction: with the player
    // directly OVERHEAD (the normal case on planets), lookAt(…, (0,1,0))
    // degenerates and the barrels collapse into the ground.
    toPlayer.normalize();
    const hint = this.mountNormal && Math.abs(toPlayer.dot(this.mountNormal)) < 0.92
      ? this.mountNormal
      : Math.abs(toPlayer.y) > 0.85 ? sideHint : up;
    targetQuat.setFromRotationMatrix(lookMat.lookAt(zero, toPlayer, hint));
    this.object.quaternion.rotateTowards(targetQuat, this.stats.turnRate * dt);

    this.fireTimer -= dt;
    if (!this.training && this.fireTimer <= 0) {
      this.forward(fwd);
      if (fwd.dot(toPlayer) > 0.97) {
        fire(this);
        this.fireTimer = this.stats.fireCooldown;
      }
    }
    this.updateCommon(dt);
  }
}
