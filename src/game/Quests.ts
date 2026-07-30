import { Vector3 } from 'three';
import { Rng } from '../core/Rng';
import { ResourceType } from '../entities/PickupSystem';

export type QuestKind = 'bounty' | 'collect' | 'delivery' | 'courier';

export interface QuestReward {
  score: number;
  flux?: number;
  crystal?: number;
  scrap?: number;
}

export interface Quest {
  id: number;
  kind: QuestKind;
  title: string;
  description: string;
  /** HUD progress string, updated by the system. */
  progress: string;
  reward: QuestReward;
  // bounty
  killsRemaining?: number;
  // collect
  resource?: ResourceType;
  amount?: number;
  // delivery
  destination?: Vector3;
}

const CARGO_FLAVOR = [
  'med supplies', 'survey data', 'vaccine cores', 'refugee letters',
  'prewar seed vault', 'drive schematics', 'a sealed datacore',
];

/**
 * Procedural contracts, offered by neutral haulers when hailed (R):
 *  - bounty:   destroy N Vigil fighters, anywhere
 *  - collect:  bring X of a resource back to any hauler
 *  - delivery: carry a package to a gold beacon elsewhere in this sector
 *  - courier:  carry a package THROUGH a jump — completes on sector arrival
 * Max two active. In-sector deliveries void if you jump away first.
 */
export class QuestSystem {
  active: Quest[] = [];
  completedCount = 0;
  private nextId = 1;

  constructor(private readonly rng: Rng) {}

  generateOffer(sectorIndex: number, playerPos: Vector3): Quest {
    const roll = this.rng.next();
    const id = this.nextId++;
    if (roll < 0.35) {
      const n = 2 + this.rng.int(0, 2) + Math.floor(sectorIndex / 2);
      return {
        id, kind: 'bounty',
        title: `Bounty: ${n} Vigil fighters`,
        description: `The Vigil shot up our last convoy. ${n} of their fighters, any of them — make it hurt.`,
        progress: `0/${n}`,
        killsRemaining: n,
        reward: { score: 250 * n, flux: 1 },
      };
    }
    if (roll < 0.65) {
      const resource: ResourceType = this.rng.chance(0.6) ? 'crystal' : 'scrap';
      const amount = 5 + this.rng.int(0, 4);
      return {
        id, kind: 'collect',
        title: `Procure: ${amount} ${resource === 'crystal' ? 'Ion Crystals' : 'Scrap Alloy'}`,
        description: `Our fabricators are dry. Bring ${amount} ${resource} to any hauler on the lanes and we pay well.`,
        progress: `0/${amount}`,
        resource, amount,
        reward: { score: 120 * amount, flux: 2 },
      };
    }
    if (roll < 0.85) {
      const [dx, dy, dz] = this.rng.unitSphere();
      const destination = new Vector3(dx, dy * 0.3, dz)
        .normalize()
        .multiplyScalar(this.rng.range(700, 1300))
        .add(playerPos);
      const cargo = this.rng.pick(CARGO_FLAVOR);
      return {
        id, kind: 'delivery',
        title: 'Delivery: beacon drop',
        description: `Run ${cargo} to the marked beacon. Gold marker on your HUD — don't dawdle, and don't jump away with our cargo.`,
        progress: 'to beacon',
        destination,
        reward: { score: 900, crystal: 3, flux: 1 },
      };
    }
    const cargo = this.rng.pick(CARGO_FLAVOR);
    return {
      id, kind: 'courier',
      title: 'Courier: next sector',
      description: `Take ${cargo} THROUGH the jump. Deliver it on the far side — the Drift still needs mail service.`,
      progress: 'jump to deliver',
      reward: { score: 800, flux: 3 },
    };
  }

  /** Bounty progress; returns quests completed by this kill. */
  onVigilKill(): Quest[] {
    const done: Quest[] = [];
    for (const q of this.active) {
      if (q.kind !== 'bounty' || q.killsRemaining === undefined) continue;
      q.killsRemaining--;
      const total = Number(q.title.match(/(\d+)/)?.[1] ?? 0);
      q.progress = `${total - q.killsRemaining}/${total}`;
      if (q.killsRemaining <= 0) done.push(q);
    }
    this.remove(done);
    return done;
  }

  /** Delivery beacon proximity; returns completed quests. */
  onPositionUpdate(playerPos: Vector3): Quest[] {
    const done = this.active.filter(
      (q) => q.kind === 'delivery' && q.destination && q.destination.distanceTo(playerPos) < 70,
    );
    this.remove(done);
    return done;
  }

  /** Jump: couriers complete; in-sector deliveries are voided. */
  onJump(): { completed: Quest[]; voided: Quest[] } {
    const completed = this.active.filter((q) => q.kind === 'courier');
    const voided = this.active.filter((q) => q.kind === 'delivery');
    this.remove(completed);
    this.remove(voided, false);
    return { completed, voided };
  }

  /** Planetfall: in-sector delivery beacons become unreachable — void them. */
  voidDeliveries(): Quest[] {
    const voided = this.active.filter((q) => q.kind === 'delivery');
    this.remove(voided, false);
    return voided;
  }

  /** Non-mutating check: is any collect contract ready to hand over? */
  hasTurnIn(counts: Record<ResourceType, number>): boolean {
    return this.active.some(
      (q) => q.kind === 'collect' && q.resource && q.amount !== undefined && counts[q.resource] >= q.amount,
    );
  }

  /** Turn-in attempt at a hauler; returns the completed collect quest if any. */
  tryTurnIn(counts: Record<ResourceType, number>): Quest | null {
    for (const q of this.active) {
      if (q.kind !== 'collect' || !q.resource || !q.amount) continue;
      if (counts[q.resource] >= q.amount) {
        this.remove([q]);
        return q;
      }
    }
    return null;
  }

  updateCollectProgress(counts: Record<ResourceType, number>): void {
    for (const q of this.active) {
      if (q.kind === 'collect' && q.resource && q.amount) {
        q.progress = `${Math.min(counts[q.resource], q.amount)}/${q.amount}`;
      }
    }
  }

  accept(q: Quest): void {
    this.active.push(q);
  }

  private remove(list: Quest[], countAsCompleted = true): void {
    if (list.length === 0) return;
    if (countAsCompleted) this.completedCount += list.length;
    this.active = this.active.filter((q) => !list.includes(q));
  }
}
