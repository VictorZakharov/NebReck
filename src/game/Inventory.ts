import { ResourceType } from '../entities/PickupSystem';

export type RecipeCost = Partial<Record<ResourceType, number>>;

export interface Recipe {
  id: string;
  name: string;
  description: string;
  cost: RecipeCost;
  /** null = repeatable consumable; a number caps how many times it can be built. */
  maxLevel: number | null;
}

/** Everything craftable from the in-flight Loadout screen (Tab). */
export const RECIPES: Recipe[] = [
  {
    id: 'nanobot-kit',
    name: 'Nanobot Kit',
    description: 'Fabricate a hull-repair swarm, carried as a consumable. Press H in flight to heal 35 hull.',
    cost: { scrap: 6 },
    maxLevel: null,
  },
  {
    id: 'missile-rack',
    name: 'Seeker Missiles ×2',
    description: 'Print a pair of seeker rounds for the launcher. Fire-and-forget vengeance.',
    cost: { scrap: 3 },
    maxLevel: null,
  },
  {
    id: 'shield-cell',
    name: 'Shield Cell',
    description: 'Dump a charged cell into the emitters. Restores 40 shield instantly.',
    cost: { crystal: 5 },
    maxLevel: null,
  },
  {
    id: 'weapon-amp',
    name: 'Weapon Amplifier',
    description: 'Overdrive the focusing arrays. +15% primary weapon damage.',
    cost: { crystal: 8, scrap: 4 },
    maxLevel: 3,
  },
  {
    id: 'engine-tune',
    name: 'Engine Tuning',
    description: 'Feed a flux core to the drives. +8% speed and acceleration.',
    cost: { scrap: 8, flux: 1 },
    maxLevel: 3,
  },
  {
    id: 'shield-matrix',
    name: 'Shield Matrix',
    description: 'Weave a flux lattice into the emitters. +25 maximum shield.',
    cost: { crystal: 8, flux: 1 },
    maxLevel: 3,
  },
];

/**
 * Per-run resource wallet + crafted upgrade levels. Pure bookkeeping — the
 * gameplay effects of a craft are applied by Game.craft().
 */
export class Inventory {
  counts: Record<ResourceType, number> = { scrap: 0, crystal: 0, flux: 0 };
  /** Carried hull-repair consumables (used with H in flight). */
  nanobots = 0;
  /** Seeker missile ammo — replenished at merchants. */
  missiles = 8;
  levels = new Map<string, number>();
  private missileRegenProgress = 0;

  add(type: ResourceType, n = 1): void {
    this.counts[type] += n;
  }

  /** Advance a ship-provided seeker fabricator using frame-rate-independent time. */
  regenerateMissiles(dt: number, interval: number | null): number {
    if (interval === null || interval <= 0) return 0;
    this.missileRegenProgress += Math.max(0, dt) / interval;
    const gained = Math.floor(this.missileRegenProgress + 1e-9);
    if (gained > 0) {
      this.missileRegenProgress -= gained;
      this.missiles += gained;
    }
    return gained;
  }

  levelOf(recipe: Recipe): number {
    return this.levels.get(recipe.id) ?? 0;
  }

  canAfford(recipe: Recipe): boolean {
    for (const [type, n] of Object.entries(recipe.cost)) {
      if (this.counts[type as ResourceType] < (n ?? 0)) return false;
    }
    return true;
  }

  canCraft(recipe: Recipe): boolean {
    if (recipe.maxLevel !== null && this.levelOf(recipe) >= recipe.maxLevel) return false;
    return this.canAfford(recipe);
  }

  /** Pays the cost and bumps the level. Caller must have checked canCraft. */
  pay(recipe: Recipe): void {
    for (const [type, n] of Object.entries(recipe.cost)) {
      this.counts[type as ResourceType] -= n ?? 0;
    }
    this.levels.set(recipe.id, this.levelOf(recipe) + 1);
  }
}
