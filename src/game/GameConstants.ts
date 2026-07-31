import { NeutralShip } from '../entities/NeutralShip';
import { Ship } from '../entities/Ship';

export const JUMP_FLUX_COST = 2;
export const JUMP_SPOOL_TIME = 5;
export const JUMP_SUPPRESS_RANGE = 600;

const TARGET_NAMES: Record<string, string> = {
  raider: 'Vigil Raider',
  brute: 'Vigil Warden',
  turret: 'Vigil Battery',
  capital: 'Warden-class Carrier',
  hauler: 'Civilian Hauler',
};

const TARGET_ROLES: Record<string, string> = {
  raider: 'Vigil fighter',
  brute: 'Vigil gunship',
  turret: 'Defense battery',
  capital: 'Vigil carrier',
};

export function targetDisplayName(kind: string): string {
  return TARGET_NAMES[kind] ?? 'Unknown Contact';
}

export function targetPresentation(
  ship: Ship,
  aimAssist: boolean,
): {
  name: string;
  relationship: 'hostile' | 'friendly' | 'neutral';
  detail: string;
} {
  if (!aimAssist && ship instanceof NeutralShip) {
    return ship.isMerchant
      ? {
          name: 'Independent Merchant',
          relationship: 'friendly',
          detail: 'Friendly · Merchant · Trade and resupply',
        }
      : {
          name: 'Civilian Hauler',
          relationship: 'neutral',
          detail: 'Neutral · Hauler · Contracts and deliveries',
        };
  }
  return {
    name: targetDisplayName(ship.kind),
    relationship: 'hostile',
    detail: `Hostile · ${TARGET_ROLES[ship.kind] ?? 'Vigil contact'}`,
  };
}
