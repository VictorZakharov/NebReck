import { Vector3 } from 'three';
import { Ship } from './Ship';

/**
 * A Vigil capital ship — the sector's set-piece threat. Holds station at its
 * post (no flight AI); its firepower comes from the turret batteries mounted
 * on the hull (Game instantiates Turrets at `turretMounts`). Enormous hull
 * pool; killing it is a project, not an accident.
 */
export class CapitalShip extends Ship {
  /** Ship-local mount points for the turret batteries. */
  readonly turretMounts: Vector3[] = [
    new Vector3(3.2, 3.6, -8),
    new Vector3(-3.2, 3.6, -8),
    new Vector3(3.2, 3.6, 8),
    new Vector3(-3.2, 3.6, 8),
  ];

  constructor() {
    super('capital', 1600, 0, 0, 999);
    this.throttle = 0.25; // idle drive glow
  }

  update(dt: number): void {
    this.updateCommon(dt);
  }
}
