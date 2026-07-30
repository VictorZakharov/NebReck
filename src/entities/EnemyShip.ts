import { Matrix4, Quaternion, Vector3 } from 'three';
import { EnemyBrain } from '../ai/EnemyBrain';
import { Rng } from '../core/Rng';
import { Ship } from './Ship';

export interface EnemyStats {
  hull: number;
  shield: number;
  maxSpeed: number;
  turnRate: number;
  fireCooldown: number;
  projectileSpeed: number;
  damage: number;
  score: number;
}

export const ENEMY_STATS: Record<'raider' | 'brute', EnemyStats> = {
  raider: {
    hull: 34, shield: 16, maxSpeed: 66, turnRate: 1.9,
    fireCooldown: 0.55, projectileSpeed: 190, damage: 6, score: 100,
  },
  brute: {
    hull: 110, shield: 50, maxSpeed: 42, turnRate: 1.0,
    fireCooldown: 1.1, projectileSpeed: 160, damage: 14, score: 250,
  },
};

const desiredDir = new Vector3();
const targetQuat = new Quaternion();
const lookMatrixUp = new Vector3(0, 1, 0);
const sideHint = new Vector3(1, 0, 0);
const fwd = new Vector3();
const leadPoint = new Vector3();

/**
 * AI-piloted ship. Steering is quaternion slerp toward the brain's target at
 * a capped turn rate; speed chases throttle. Firing is exposed via a callback
 * so the combat system owns projectiles.
 */
export class EnemyShip extends Ship {
  readonly stats: EnemyStats;
  /** True for dispatched hunter wings (vs. sector-resident patrols). */
  hunter = false;
  /** Seconds of EMP stun remaining — no steering, no firing. */
  stunTimer = 0;
  private readonly brain: EnemyBrain;
  private fireTimer: number;

  constructor(
    kind: 'raider' | 'brute',
    rng: Rng,
    aggression: number,
    toughness = 1,
    waypoints: Vector3[] = [],
  ) {
    const stats = ENEMY_STATS[kind];
    super(kind, stats.hull * toughness, stats.shield * toughness, 4, 5);
    this.stats = stats;
    this.brain = new EnemyBrain(rng, aggression, waypoints);
    this.fireTimer = rng.range(0.3, 1.2);
  }

  notifyDamaged(): void {
    this.brain.onDamaged();
  }

  update(
    dt: number,
    playerPos: Vector3,
    playerVel: Vector3,
    fire: (ship: EnemyShip) => void,
    playerVisible = true,
  ): void {
    if (!this.alive) return;

    // EMP stun: dead stick — drift on momentum, no thinking, no shooting.
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.velocity.multiplyScalar(Math.pow(0.6, dt));
      this.position.addScaledVector(this.velocity, dt);
      this.throttle = 0;
      this.updateCommon(dt);
      return;
    }

    // Lead the player based on projectile flight time.
    const dist = this.position.distanceTo(playerPos);
    const flightTime = dist / this.stats.projectileSpeed;
    leadPoint.copy(playerPos).addScaledVector(playerVel, flightTime);

    const d = this.brain.think(dt, this.position, playerPos, leadPoint, playerVisible);

    // Turn toward steer target at capped rate. Matrix4.lookAt(eye, target)
    // points -Z from eye toward target — exactly the ship's nose convention.
    // Side up-hint when climbing/diving near-vertical (degenerate lookAt).
    desiredDir.copy(d.steerTarget).sub(this.position);
    if (desiredDir.lengthSq() > 1e-6) {
      desiredDir.normalize();
      const hint = Math.abs(desiredDir.y) > 0.85 ? sideHint : lookMatrixUp;
      targetQuat.setFromRotationMatrix(tmpLookMatrix.lookAt(zero, desiredDir, hint));
      const maxAngle = this.stats.turnRate * dt;
      this.object.quaternion.rotateTowards(targetQuat, maxAngle);
    }

    // Velocity chases forward * throttle.
    this.forward(fwd);
    const targetSpeed = this.stats.maxSpeed * d.throttle;
    this.velocity.lerp(fwd.multiplyScalar(targetSpeed), 1 - Math.exp(-1.8 * dt));
    this.position.addScaledVector(this.velocity, dt);
    this.throttle = d.throttle;

    // Fire only when actually pointing near the lead point.
    this.fireTimer -= dt;
    if (d.wantsFire && playerVisible && this.fireTimer <= 0) {
      this.forward(fwd);
      desiredDir.copy(leadPoint).sub(this.position).normalize();
      if (fwd.dot(desiredDir) > 0.965) {
        fire(this);
        this.fireTimer = this.stats.fireCooldown;
      }
    }

    this.updateCommon(dt);
  }
}

const tmpLookMatrix = new Matrix4();
const zero = new Vector3();
