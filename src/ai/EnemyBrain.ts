import { Vector3 } from 'three';
import { Rng } from '../core/Rng';

export type BrainState = 'patrol' | 'approach' | 'attack' | 'break';

export interface BrainDecision {
  /** World-space point to steer toward. */
  steerTarget: Vector3;
  /** Speed fraction 0..1 of the ship's max. */
  throttle: number;
  /** Whether the brain wants to shoot this frame. */
  wantsFire: boolean;
}

const toPlayer = new Vector3();
const evadeDir = new Vector3();

/** Player must get this close to pull a patrolling wing into the fight. */
const PATROL_DETECT_RANGE = 380;

/**
 * Per-enemy combat state machine:
 *  - patrol:  fly a waypoint loop until the player comes into detection range
 *  - approach: close distance with a personal lateral offset (prevents conga lines)
 *  - attack:  track the player's lead point, fire inside the aim cone
 *  - break:   after a close pass or on a timer, peel away hard for a moment
 */
export class EnemyBrain {
  state: BrainState;
  private stateTime = 0;
  private nextBreak: number;
  private waypointIndex = 0;
  private readonly waypoints: Vector3[];
  private readonly offset: Vector3;
  private readonly breakVector = new Vector3();
  private readonly decision: BrainDecision = {
    steerTarget: new Vector3(),
    throttle: 1,
    wantsFire: false,
  };

  constructor(
    private readonly rng: Rng,
    private readonly aggression: number,
    waypoints: Vector3[] = [],
  ) {
    this.waypoints = waypoints;
    this.state = waypoints.length > 0 ? 'patrol' : 'approach';
    this.nextBreak = rng.range(5, 9);
    const [ox, oy, oz] = rng.unitSphere();
    this.offset = new Vector3(ox, oy, oz).multiplyScalar(rng.range(20, 45));
  }

  think(
    dt: number,
    selfPos: Vector3,
    playerPos: Vector3,
    leadPoint: Vector3,
    playerVisible = true,
  ): BrainDecision {
    this.stateTime += dt;
    const d = this.decision;
    d.wantsFire = false;

    // Cloaked player: patrollers keep patrolling, engaged ships drift along
    // their personal offset heading, blind, until the sensor return comes back.
    if (!playerVisible && this.state !== 'patrol') {
      d.steerTarget.copy(selfPos).add(this.offset);
      d.throttle = 0.5;
      return d;
    }

    toPlayer.copy(playerPos).sub(selfPos);
    const dist = toPlayer.length();

    switch (this.state) {
      case 'patrol': {
        const wp = this.waypoints[this.waypointIndex];
        d.steerTarget.copy(wp);
        d.throttle = 0.55;
        if (selfPos.distanceToSquared(wp) < 45 * 45) {
          this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
        }
        if (dist < PATROL_DETECT_RANGE) this.transition('approach');
        break;
      }
      case 'approach': {
        d.steerTarget.copy(playerPos).add(this.offset);
        d.throttle = 1;
        if (dist < 260) this.transition('attack');
        break;
      }
      case 'attack': {
        d.steerTarget.copy(leadPoint);
        d.throttle = dist < 80 ? 0.55 : 0.85;
        d.wantsFire = dist < 320 && this.rng.chance(this.aggression);
        if (dist < 38 || this.stateTime > this.nextBreak) this.transition('break');
        if (dist > 420) this.transition('approach');
        break;
      }
      case 'break': {
        if (this.stateTime === dt) {
          // Fresh break: pick a peel direction roughly perpendicular to the player.
          const [x, y, z] = this.rng.unitSphere();
          evadeDir.set(x, y, z).cross(toPlayer).normalize();
          if (evadeDir.lengthSq() < 0.1) evadeDir.set(0, 1, 0);
          this.breakVector.copy(evadeDir);
        }
        d.steerTarget.copy(selfPos).addScaledVector(this.breakVector, 220);
        d.throttle = 1;
        if (this.stateTime > this.rng.range(1.4, 2.4)) {
          this.nextBreak = this.rng.range(5, 9);
          this.transition('attack');
        }
        break;
      }
    }
    return d;
  }

  /** Called when this enemy takes a hit — patrollers wake up, others may panic. */
  onDamaged(): void {
    if (this.state === 'patrol') {
      this.transition('approach');
      return;
    }
    if (this.state !== 'break' && this.rng.chance(0.35)) this.transition('break');
  }

  private transition(next: BrainState): void {
    this.state = next;
    this.stateTime = 0;
  }
}
