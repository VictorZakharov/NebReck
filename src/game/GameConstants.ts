import { EnemyShip } from '../entities/EnemyShip';
import { NeutralShip } from '../entities/NeutralShip';
import { Ship } from '../entities/Ship';
import { Turret } from '../entities/Turret';

export const JUMP_FLUX_COST = 2;
export const JUMP_SPOOL_TIME = 5;
export const JUMP_SUPPRESS_RANGE = 600;
/** Nearby hostiles prevent delicate systems such as cloak and field crafting. */
export const SYSTEM_LOCKOUT_RANGE_METERS = 180;
/** Carrier batteries become distinct lock/HUD contacts only at knife range (metres). */
export const CAPITAL_TURRET_LOCK_RANGE_METERS = 260;

const TARGET_NAMES: Record<string, string> = {
  raider: 'Vigil Raider',
  brute: 'Vigil Warden',
  bomber: 'Vigil Harrow Bomber',
  turret: 'Vigil Battery',
  'autogun-turret': 'Vigil Rotary Battery',
  'rocket-turret': 'Vigil Rocket Battery',
  capital: 'Warden-class Carrier',
  hauler: 'Civilian Hauler',
};

const TARGET_ROLES: Record<string, string> = {
  raider: 'Vigil fighter',
  brute: 'Vigil gunship',
  bomber: 'Missile bomber',
  turret: 'Defense battery',
  'autogun-turret': 'Rotary battery',
  'rocket-turret': 'Rocket battery',
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
          detail: 'Friendly \u00b7 Merchant \u00b7 Trade and resupply',
        }
      : {
          name: 'Civilian Hauler',
          relationship: 'neutral',
          detail: 'Neutral \u00b7 Hauler \u00b7 Contracts and deliveries',
        };
  }
  if (ship instanceof EnemyShip && ship.rocketMode) {
    return {
      name: ship.rocketMode === 'homing' ? 'Vigil Seeker Bomber' : 'Vigil Strike Bomber',
      relationship: 'hostile',
      detail: ship.rocketMode === 'homing'
        ? 'Hostile \u00b7 Missile bomber \u00b7 Homing payload'
        : 'Hostile \u00b7 Missile bomber \u00b7 High-velocity rockets',
    };
  }
  if (ship instanceof EnemyShip && ship.autoGun) {
    return {
      name: 'Vigil Ripper',
      relationship: 'hostile',
      detail: 'Hostile \u00b7 Autogun interceptor \u00b7 Rotary cannon',
    };
  }
  if (ship instanceof Turret && ship.weapon !== 'bolt') {
    if (ship.weapon === 'autogun') {
      return {
        name: 'Vigil Rotary Battery',
        relationship: 'hostile',
        detail: 'Hostile \u00b7 Battery \u00b7 Rotary autogun',
      };
    }
    return {
      name: ship.weapon === 'homing' ? 'Vigil Seeker Battery' : 'Vigil Rocket Battery',
      relationship: 'hostile',
      detail: ship.weapon === 'homing'
        ? 'Hostile \u00b7 Battery \u00b7 Homing rockets'
        : 'Hostile \u00b7 Battery \u00b7 High-velocity rockets',
    };
  }
  return {
    name: targetDisplayName(ship.kind),
    relationship: 'hostile',
    detail: `Hostile \u00b7 ${TARGET_ROLES[ship.kind] ?? 'Vigil contact'}`,
  };
}
