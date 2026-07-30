import { Inventory } from './Inventory';
import type { ResourceType } from '../entities/PickupSystem';

export type TradeHolding = ResourceType | 'nano' | 'missile';

export interface TradeOffer {
  id: string;
  label: string;
  description: string;
  /** Which page of the merchant screen this appears on. */
  side: 'buy' | 'sell';
  cost: { kind: TradeHolding; amount: number };
  gain: { kind: TradeHolding; amount: number };
}

/** The merchant's standing stock list. */
export const TRADE_OFFERS: TradeOffer[] = [
  {
    id: 'buy-flux',
    label: 'Flux Core',
    description: 'Jump fuel and upgrade feedstock. Everyone needs it; I price accordingly.',
    side: 'buy',
    cost: { kind: 'scrap', amount: 8 },
    gain: { kind: 'flux', amount: 1 },
  },
  {
    id: 'buy-nano',
    label: 'Nanobot Kit',
    description: 'Field hull repair, factory sealed. Mostly.',
    side: 'buy',
    cost: { kind: 'scrap', amount: 5 },
    gain: { kind: 'nano', amount: 1 },
  },
  {
    id: 'buy-crystal',
    label: 'Ion Crystals ×3',
    description: 'Refined and stable. Mined by someone braver than you.',
    side: 'buy',
    cost: { kind: 'scrap', amount: 6 },
    gain: { kind: 'crystal', amount: 3 },
  },
  {
    id: 'buy-missiles',
    label: 'Seeker Missiles ×4',
    description: 'Fire-and-forget. Warranty void the moment you pull the trigger.',
    side: 'buy',
    cost: { kind: 'scrap', amount: 5 },
    gain: { kind: 'missile', amount: 4 },
  },
  {
    id: 'sell-crystal',
    label: 'Ion Crystals ×3',
    description: 'Fair rate. For the Drift.',
    side: 'sell',
    cost: { kind: 'crystal', amount: 3 },
    gain: { kind: 'scrap', amount: 6 },
  },
  {
    id: 'sell-flux',
    label: 'Flux Core',
    description: 'Desperate? I do not judge. I profit.',
    side: 'sell',
    cost: { kind: 'flux', amount: 1 },
    gain: { kind: 'scrap', amount: 10 },
  },
  {
    id: 'sell-nano',
    label: 'Nanobot Kit',
    description: 'Factory seal intact? Store credit says it is.',
    side: 'sell',
    cost: { kind: 'nano', amount: 1 },
    gain: { kind: 'scrap', amount: 4 },
  },
];

export function canTrade(id: string, inv: Inventory): boolean {
  switch (id) {
    case 'buy-flux': return inv.counts.scrap >= 8;
    case 'buy-nano': return inv.counts.scrap >= 5;
    case 'buy-crystal': return inv.counts.scrap >= 6;
    case 'buy-missiles': return inv.counts.scrap >= 5;
    case 'sell-crystal': return inv.counts.crystal >= 3;
    case 'sell-flux': return inv.counts.flux >= 1;
    case 'sell-nano': return inv.nanobots >= 1;
    default: return false;
  }
}

/** Executes the trade; caller must have checked canTrade. */
export function applyTrade(id: string, inv: Inventory): void {
  switch (id) {
    case 'buy-flux': inv.counts.scrap -= 8; inv.add('flux', 1); break;
    case 'buy-nano': inv.counts.scrap -= 5; inv.nanobots++; break;
    case 'buy-crystal': inv.counts.scrap -= 6; inv.add('crystal', 3); break;
    case 'buy-missiles': inv.counts.scrap -= 5; inv.missiles += 4; break;
    case 'sell-crystal': inv.counts.crystal -= 3; inv.add('scrap', 6); break;
    case 'sell-flux': inv.counts.flux -= 1; inv.add('scrap', 10); break;
    case 'sell-nano': inv.nanobots -= 1; inv.add('scrap', 4); break;
  }
}
