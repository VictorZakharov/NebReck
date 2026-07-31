import { Vector3 } from 'three';
import { PlayerShip } from '../entities/PlayerShip';
import { Ship } from '../entities/Ship';

const fwd = new Vector3();
const toTarget = new Vector3();

export interface TargetInfo {
  ship: Ship;
  /** Where to shoot so bolts arrive as the target does. */
  leadPoint: Vector3;
  distance: number;
  /** False for informational civilian contacts: bracket only, never aim/homing. */
  aimAssist: boolean;
}

/**
 * LOS-aware soft lock over all hostiles (fighters, turrets, the capital).
 * When none qualifies, the same centre-screen scan exposes a civilian contact
 * for HUD identification only. Distance is weighted heavily and hysteresis
 * keeps the current contact from flickering between nearby ships.
 */
export class Targeting {
  current: TargetInfo | null = null;
  private readonly lead = new Vector3();

  /** The target weapons may converge or home on; civilian contacts return null. */
  get aimTarget(): TargetInfo | null {
    return this.current?.aimAssist ? this.current : null;
  }

  update(
    player: PlayerShip,
    hostiles: readonly Ship[],
    contacts: readonly Ship[],
    projectileSpeed: number,
    isVisible: (ship: Ship) => boolean = () => true,
  ): void {
    player.forward(fwd);
    const hostile = this.bestCandidate(player, hostiles, isVisible);
    const best = hostile ?? this.bestCandidate(player, contacts, isVisible);
    if (!best) {
      this.current = null;
      return;
    }

    const dist = best.position.distanceTo(player.position);
    const flightTime = dist / projectileSpeed;
    this.lead.copy(best.position).addScaledVector(best.velocity, flightTime);
    this.current = {
      ship: best,
      leadPoint: this.lead,
      distance: dist,
      aimAssist: hostile !== null,
    };
  }

  private bestCandidate(
    player: PlayerShip,
    candidates: readonly Ship[],
    isVisible: (ship: Ship) => boolean,
  ): Ship | null {
    let best: Ship | null = null;
    let bestScore = Infinity;
    const maxRange = 1500;
    const cosCone = Math.cos(0.32); // ~18°
    const keepCosCone = Math.cos(0.5); // wider cone to *keep* a lock

    for (const h of candidates) {
      if (!h.alive) continue;
      toTarget.copy(h.position).sub(player.position);
      const dist = toTarget.length();
      if (dist < 1e-5 || dist > maxRange) continue;
      toTarget.divideScalar(dist);
      const dot = fwd.dot(toTarget);
      const isCurrent = this.current?.ship === h;
      if (dot < (isCurrent ? keepCosCone : cosCone)) continue;
      if (!isVisible(h)) continue;
      // Angle matters, but a 10× closer target must win at similar angles.
      const score = (1 - dot) * 400 + dist * 0.5 - (isCurrent ? 60 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }

    return best;
  }
}
