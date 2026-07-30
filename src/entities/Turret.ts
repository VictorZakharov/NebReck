import { Matrix4, Quaternion, Vector3 } from 'three';
import { Rng } from '../core/Rng';
import { Ship } from './Ship';

const toPlayer = new Vector3();
const fwd = new Vector3();
const targetQuat = new Quaternion();
const lookMat = new Matrix4();
const zero = new Vector3();
const up = new Vector3(0, 1, 0);
const sideHint = new Vector3(1, 0, 0);

export const TURRET_STATS = {
  hull: 60,
  shield: 0,
  range: 340,
  turnRate: 1.4,
  fireCooldown: 0.9,
  projectileSpeed: 200,
  damage: 8,
  score: 200,
} as const;

/**
 * Stationary defense emplacement guarding cave-asteroid bases. Tracks the
 * player inside its engagement range and fires twin bolts when aligned.
 * Reuses the Ship damage/health model so projectiles treat it like any hull.
 */
export class Turret extends Ship {
  /** Seconds of EMP stun remaining. */
  stunTimer = 0;
  private fireTimer: number;

  constructor(rng: Rng) {
    super('turret', TURRET_STATS.hull, TURRET_STATS.shield);
    this.fireTimer = rng.range(0.4, 1.4);
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
    if (!playerVisible) {
      this.updateCommon(dt);
      return;
    }

    toPlayer.copy(playerPos).sub(this.position);
    const dist = toPlayer.length();
    if (dist > TURRET_STATS.range) {
      this.updateCommon(dt);
      return;
    }

    // Swivel toward the player at a capped rate (-Z = barrels, see Ship.faceToward).
    // The up-hint must never be parallel to the aim direction: with the player
    // directly OVERHEAD (the normal case on planets), lookAt(…, (0,1,0))
    // degenerates and the barrels collapse into the ground.
    toPlayer.normalize();
    const hint = Math.abs(toPlayer.y) > 0.85 ? sideHint : up;
    targetQuat.setFromRotationMatrix(lookMat.lookAt(zero, toPlayer, hint));
    this.object.quaternion.rotateTowards(targetQuat, TURRET_STATS.turnRate * dt);

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.forward(fwd);
      if (fwd.dot(toPlayer) > 0.97) {
        fire(this);
        this.fireTimer = TURRET_STATS.fireCooldown;
      }
    }
    this.updateCommon(dt);
  }
}
