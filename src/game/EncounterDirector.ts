import { Vector3 } from 'three';
import { EventBus } from '../core/EventBus';
import { Rng } from '../core/Rng';
import type { EnemyWeaponMode } from '../entities/EnemyShip';
import { DifficultyDef } from './Difficulty';

export interface HunterSpawnSpec {
  kind: 'raider' | 'brute' | 'bomber';
  position: Vector3;
  aggression: number;
  weaponMode?: EnemyWeaponMode;
}

/** Hard ceiling prevents abandoned hunter wings from growing the scene forever. */
export const MAX_ACTIVE_HUNTERS = 12;

/**
 * Exploration-mode threat pacing (replaces the old wave system). The sector's
 * standing forces — patrols, cave garrisons, the capital — ARE the content;
 * this director only adds consequences:
 *  - killing Vigil assets raises your ALERT signature (0–5)
 *  - at alert ≥ 1, hunter wings periodically jump in from deep space and come
 *    looking — bigger and more often the hotter you burn
 *  - an occasional ambient scout pair wanders in regardless, so a quiet run
 *    still meets the Vigil eventually
 * Hunters arrive 900–1200 out on a shared vector: visible on radar, never on
 * top of the player.
 */
export class EncounterDirector {
  alert = 0;
  private heat = 0;
  private dispatchCooldown = 45; // opening grace even at high aggression
  private ambientTimer: number;

  constructor(
    private readonly events: EventBus,
    private readonly rng: Rng,
    private readonly difficulty: DifficultyDef,
    private readonly spawn: (spec: HunterSpawnSpec) => void,
    private readonly activeHunters: () => number = () => 0,
  ) {
    this.ambientTimer = rng.range(90, 140);
  }

  /** Every Vigil kill feeds the heat; alert is the displayed tier. */
  onVigilKill(kind: 'fighter' | 'turret' | 'capital'): void {
    this.heat += kind === 'capital' ? 6 : kind === 'turret' ? 2 : 1;
    const next = Math.min(5, Math.floor(this.heat / 3));
    if (next !== this.alert) {
      this.alert = next;
      this.events.emit('alert-changed', { alert: this.alert });
    }
  }

  /** Jumping sectors sheds some heat — you got away, mostly. */
  onSectorJump(): void {
    this.heat = Math.max(0, this.heat - 6);
    this.alert = Math.min(5, Math.floor(this.heat / 3));
    this.dispatchCooldown = Math.max(this.dispatchCooldown, 30);
  }

  update(dt: number, playerPos: Vector3): void {
    this.dispatchCooldown -= dt;
    this.ambientTimer -= dt;

    if (this.alert >= 1 && this.dispatchCooldown <= 0) {
      const count = Math.min(2 + Math.floor(this.alert / 2), 5);
      this.dispatchWing(count, playerPos);
      this.dispatchCooldown = this.rng.range(55, 85) - this.alert * 5;
    }
    if (this.ambientTimer <= 0) {
      this.dispatchWing(2, playerPos);
      this.ambientTimer = this.rng.range(100, 160);
    }
  }

  /** Spawn a hunter wing on a shared deep-space arrival vector. */
  dispatchWing(count: number, playerPos: Vector3): number {
    const available = Math.max(0, MAX_ACTIVE_HUNTERS - this.activeHunters());
    const actualCount = Math.min(Math.max(0, Math.floor(count)), available);
    if (actualCount === 0) return 0;
    const [wx, wy, wz] = this.rng.unitSphere();
    const arrival = new Vector3(wx, wy * 0.5, wz).normalize();
    const aggression = Math.min((0.45 + this.alert * 0.07) * this.difficulty.aggression, 0.9);
    for (let i = 0; i < actualCount; i++) {
      const dist = this.rng.range(900, 1200);
      const [jx, jy, jz] = this.rng.unitSphere();
      const kind = i === 0 && actualCount >= 3
        ? 'brute'
        : i === 1 && actualCount >= 3 ? 'bomber' : 'raider';
      this.spawn({
        kind,
        position: new Vector3(
          playerPos.x + arrival.x * dist + jx * 60,
          playerPos.y + arrival.y * dist + jy * 30,
          playerPos.z + arrival.z * dist + jz * 60,
        ),
        aggression,
        weaponMode: kind === 'raider' && i % 2 === 0 ? 'autogun' : undefined,
      });
    }
    this.events.emit('hunters-inbound', { count: actualCount });
    return actualCount;
  }
}
