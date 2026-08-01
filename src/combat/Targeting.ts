import { Vector3 } from 'three';
import { PlayerShip } from '../entities/PlayerShip';
import { Ship } from '../entities/Ship';

const fwd = new Vector3();
const scanFwd = new Vector3();
const toTarget = new Vector3();
const CROSSHAIR_MARGIN = 0.045; // reticle-sized sensor pick radius (~2.6 degrees)

export interface TargetInfo {
  ship: Ship;
  /** Where to shoot so bolts arrive as the target does. */
  leadPoint: Vector3;
  distance: number;
  /** False for informational civilian contacts: bracket only, never aim/homing. */
  aimAssist: boolean;
}

/**
 * Sensor soft lock over all hostiles (fighters, turrets, the capital).
 * While at least one enemy is pursuing the player, hostiles retain priority
 * and those inside weapon reach receive distance-weighted aim assist. With no
 * pursuit, hostiles and sensor-only civilians share one camera-crosshair scan
 * at any rendered distance, so the player inspects whichever contact they are
 * actually pointing at. Weapon reach affects aim assist, never sensor selection.
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
    weaponRange = Infinity,
    crosshairForward?: Vector3,
    pursuitActive = true,
    crosshairOrigin?: Vector3,
  ): void {
    player.forward(fwd);
    scanFwd.copy(crosshairForward ?? fwd);
    if (scanFwd.lengthSq() < 1e-8) scanFwd.copy(fwd);
    else scanFwd.normalize();

    const closeRange = Math.max(0, weaponRange);
    const scanOrigin = crosshairOrigin ?? player.position;
    let hostile: Ship | null;
    let best: Ship | null;
    if (!pursuitActive) {
      hostile = this.bestCandidate(
        player,
        hostiles,
        true,
        scanFwd,
        scanOrigin,
        0,
        Infinity,
      );
      const contact = this.bestCandidate(
        player,
        contacts,
        true,
        scanFwd,
        scanOrigin,
        0,
        Infinity,
      );
      best = this.crosshairWinner(scanOrigin, hostile, contact, scanFwd);
      if (best !== hostile) hostile = null;
    } else {
      const closeHostile = this.bestCandidate(
        player,
        hostiles,
        false,
        fwd,
        player.position,
        0,
        closeRange,
      );
      hostile = closeHostile ?? this.bestCandidate(
        player,
        hostiles,
        true,
        scanFwd,
        scanOrigin,
        closeRange,
        Infinity,
      );
      // During combat, hostile aim assist retains priority. Civilian contacts
      // remain a fallback only when no enemy qualifies in the acquire cone.
      best = hostile ?? this.bestCandidate(
        player,
        contacts,
        true,
        scanFwd,
        scanOrigin,
        0,
        Infinity,
      );
    }
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
    crosshairPriority: boolean,
    forward: Vector3,
    scanOrigin: Vector3,
    minRangeExclusive: number,
    maxRangeInclusive: number,
  ): Ship | null {
    let best: Ship | null = null;
    let bestScore = Infinity;
    let bestDot = -Infinity;
    let bestDistance = Infinity;
    const cosCone = Math.cos(0.32); // ~18°
    const keepCosCone = Math.cos(0.5); // wider cone to *keep* a lock

    for (const h of candidates) {
      if (!h.alive) continue;
      const dist = h.position.distanceTo(player.position);
      if (
        dist < 1e-5 || dist <= minRangeExclusive ||
        dist > maxRangeInclusive
      ) continue;
      toTarget.copy(h.position).sub(scanOrigin);
      const scanDistance = toTarget.length();
      if (scanDistance < 1e-5) continue;
      toTarget.divideScalar(scanDistance);
      const dot = forward.dot(toTarget);
      const isCurrent = this.current?.ship === h;
      const acquireCos = crosshairPriority
        ? Math.cos(CROSSHAIR_MARGIN + Math.asin(Math.min(0.95, h.radius / scanDistance)))
        : cosCone;
      // Informational contacts do not get combat-lock hysteresis: once they
      // leave the ordinary crosshair cone, their bracket disappears at once.
      if (dot < (!crosshairPriority && isCurrent ? keepCosCone : acquireCos)) continue;
      if (crosshairPriority) {
        const dotDelta = dot - bestDot;
        if (dotDelta > 1e-7 || (Math.abs(dotDelta) <= 1e-7 && dist < bestDistance)) {
          bestDot = dot;
          bestDistance = dist;
          best = h;
        }
        continue;
      }
      // Angle matters, but a 10× closer target must win at similar angles.
      const score = (1 - dot) * 400 + dist * 0.5 - (isCurrent ? 60 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }

    return best;
  }

  /** Compare already-filtered hostile/contact winners without per-frame arrays. */
  private crosshairWinner(
    scanOrigin: Vector3,
    hostile: Ship | null,
    contact: Ship | null,
    forward: Vector3,
  ): Ship | null {
    if (!hostile) return contact;
    if (!contact) return hostile;
    toTarget.copy(hostile.position).sub(scanOrigin);
    const hostileDistance = toTarget.length();
    const hostileDot = forward.dot(toTarget.divideScalar(hostileDistance));
    toTarget.copy(contact.position).sub(scanOrigin);
    const contactDistance = toTarget.length();
    const contactDot = forward.dot(toTarget.divideScalar(contactDistance));
    return contactDot > hostileDot + 1e-7 ||
      (Math.abs(contactDot - hostileDot) <= 1e-7 && contactDistance < hostileDistance)
      ? contact : hostile;
  }
}
