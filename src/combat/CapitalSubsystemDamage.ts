import { CapitalShip } from '../entities/CapitalShip';
import { Turret, TURRET_WEAPON_STATS } from '../entities/Turret';

/** Destroying the complete battery bank removes this share of carrier max hull. */
export const CAPITAL_BATTERY_HULL_DAMAGE_SHARE = 0.35;

/**
 * A mounted battery's carrier damage is weighted by its full durability against
 * the original battery pool, so tougher turret classes cost the carrier more.
 */
export function capitalBatteryHullDamage(capital: CapitalShip, turret: Turret): number {
  const totalDurability = capital.turretMounts.reduce((total, mount) => {
    const stats = TURRET_WEAPON_STATS[mount.weapon];
    return total + stats.hull + stats.shield;
  }, 0);
  const turretDurability = turret.hullMax + turret.shieldMax;
  return capital.hullMax * CAPITAL_BATTERY_HULL_DAMAGE_SHARE *
    turretDurability / Math.max(totalDurability, 1);
}
