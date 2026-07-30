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
}

/**
 * Soft lock-on over ALL hostiles (fighters, turrets, the capital): the
 * candidate nearest the boresight wins, with DISTANCE weighted heavily enough
 * that a turret 100 m away beats a fighter a kilometre out at similar angle.
 * Hysteresis keeps the lock from flickering between two ships.
 */
export class Targeting {
  current: TargetInfo | null = null;
  private readonly lead = new Vector3();

  update(player: PlayerShip, hostiles: readonly Ship[], projectileSpeed: number): void {
    player.forward(fwd);
    let best: Ship | null = null;
    let bestScore = Infinity;
    const maxRange = 1500;
    const cosCone = Math.cos(0.32); // ~18°
    const keepCosCone = Math.cos(0.5); // wider cone to *keep* a lock

    for (const h of hostiles) {
      if (!h.alive) continue;
      toTarget.copy(h.position).sub(player.position);
      const dist = toTarget.length();
      if (dist > maxRange) continue;
      toTarget.divideScalar(dist);
      const dot = fwd.dot(toTarget);
      const isCurrent = this.current?.ship === h;
      if (dot < (isCurrent ? keepCosCone : cosCone)) continue;
      // Angle matters, but a 10× closer target must win at similar angles.
      const score = (1 - dot) * 400 + dist * 0.5 - (isCurrent ? 60 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }

    if (!best) {
      this.current = null;
      return;
    }

    const dist = best.position.distanceTo(player.position);
    const flightTime = dist / projectileSpeed;
    this.lead.copy(best.position).addScaledVector(best.velocity, flightTime);
    this.current = { ship: best, leadPoint: this.lead, distance: dist };
  }
}
