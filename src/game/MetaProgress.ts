export interface MetaUpgradeDef {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  /** Credits for level N (0-based). */
  cost: (level: number) => number;
}

export const META_UPGRADES: MetaUpgradeDef[] = [
  {
    id: 'hull',
    name: 'Reinforced Frames',
    description: '+10% maximum hull on every ship, permanently.',
    maxLevel: 3,
    cost: (l) => 400 * (l + 1),
  },
  {
    id: 'damage',
    name: 'Focusing Arrays',
    description: '+5% primary weapon damage, permanently.',
    maxLevel: 3,
    cost: (l) => 500 * (l + 1),
  },
  {
    id: 'boost',
    name: 'Drive Calibration',
    description: '+10% boost energy reserve, permanently.',
    maxLevel: 3,
    cost: (l) => 350 * (l + 1),
  },
  {
    id: 'stock',
    name: 'Salvage Contacts',
    description: 'Launch every run with +4 Scrap Alloy in the hold.',
    maxLevel: 2,
    cost: (l) => 300 * (l + 1),
  },
];

const STORAGE_KEY = 'nebula-reckoning-meta';

/**
 * The roguelike meta layer: score converts to CREDITS on death, credits buy
 * permanent Legacy upgrades. Persists in localStorage; disabled (in-memory,
 * all zeros) in headless/test mode so the harness stays deterministic.
 */
export class MetaProgress {
  credits = 0;
  levels: Record<string, number> = {};

  constructor(private readonly persist: boolean) {
    if (!persist) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { credits?: number; levels?: Record<string, number> };
        this.credits = data.credits ?? 0;
        this.levels = data.levels ?? {};
      }
    } catch { /* corrupted/unavailable storage → fresh meta */ }
  }

  levelOf(id: string): number {
    return this.levels[id] ?? 0;
  }

  /** Multiplier helpers used when a run starts. */
  hullMult(): number { return 1 + 0.1 * this.levelOf('hull'); }
  damageMult(): number { return 1 + 0.05 * this.levelOf('damage'); }
  boostMult(): number { return 1 + 0.1 * this.levelOf('boost'); }
  startingScrap(): number { return 4 * this.levelOf('stock'); }

  /** Score → credits payout at the end of a run. */
  bankScore(score: number): number {
    const earned = Math.floor(score / 10);
    this.credits += earned;
    this.save();
    return earned;
  }

  canBuy(def: MetaUpgradeDef): boolean {
    const level = this.levelOf(def.id);
    return level < def.maxLevel && this.credits >= def.cost(level);
  }

  buy(def: MetaUpgradeDef): boolean {
    if (!this.canBuy(def)) return false;
    this.credits -= def.cost(this.levelOf(def.id));
    this.levels[def.id] = this.levelOf(def.id) + 1;
    this.save();
    return true;
  }

  private save(): void {
    if (!this.persist) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ credits: this.credits, levels: this.levels }));
    } catch { /* storage full/blocked — meta just won't persist */ }
  }
}
