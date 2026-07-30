import { ShipKind } from '../entities/ShipMesh';

/** Full flight/defense stat block for a playable ship. */
export interface PlayerStats {
  maxSpeed: number;
  boostSpeed: number;
  accel: number;
  strafeAccel: number;
  turnRate: number;
  rollRate: number;
  hullMax: number;
  shieldMax: number;
  shieldRegenRate: number;
  shieldRegenDelay: number;
  boostEnergyMax: number;
  boostDrain: number;
  boostRegen: number;
  /** Weapon energy regen multiplier. */
  energyMult: number;
  /** Weapon energy bank capacity. */
  energyMax: number;
}

export interface PlayerShipDef {
  id: string;
  name: string;
  role: string;
  description: string;
  kind: ShipKind;
  stats: PlayerStats;
  /** Hardpoint fit — ids from PLAYER_WEAPONS; shown in the hangar. */
  weapons: string[];
  /** Seeker rack rate: 0 = no launcher, 1 = standard, 2 = double rate. */
  missileRate: number;
}

/** The hangar roster. Kestrel = balanced, Vanta = glass-cannon scout, Aegis = brawler. */
export const PLAYER_SHIPS: PlayerShipDef[] = [
  {
    id: 'vanta',
    name: 'SX-2 Vanta',
    role: 'Scout',
    description:
      'A courier hull refitted for war. Fastest thing in the Drift and turns like a thought — but the plating is honest about being thin.',
    kind: 'vanta',
    weapons: ['pulse', 'lance'],
    missileRate: 0,
    stats: {
      maxSpeed: 100, boostSpeed: 190, accel: 110, strafeAccel: 72,
      turnRate: 3.1, rollRate: 2.9,
      hullMax: 65, shieldMax: 60, shieldRegenRate: 11, shieldRegenDelay: 2.8,
      boostEnergyMax: 120, boostDrain: 28, boostRegen: 24,
      energyMult: 0.9, energyMax: 55,
    },
  },
  {
    id: 'kestrel',
    name: 'KV-7 Kestrel',
    role: 'Interceptor',
    description:
      'The stolen prototype that started all this. Balanced thrust, shields and firepower — a knife that does everything well.',
    kind: 'kestrel',
    weapons: ['pulse', 'lance'],
    missileRate: 1,
    stats: {
      maxSpeed: 85, boostSpeed: 160, accel: 90, strafeAccel: 60,
      turnRate: 2.6, rollRate: 2.4,
      hullMax: 100, shieldMax: 80, shieldRegenRate: 9, shieldRegenDelay: 3.5,
      boostEnergyMax: 100, boostDrain: 34, boostRegen: 18,
      energyMult: 1.0, energyMax: 100,
    },
  },
  {
    id: 'aegis',
    name: 'HG-9 Aegis',
    role: 'Gunship',
    description:
      'A mining escort built to sit in a crossfire and disagree with it. Slow, heavy, and carries enough capacitors to fire all day.',
    kind: 'aegis',
    weapons: ['autogun', 'scatter'],
    missileRate: 2,
    stats: {
      maxSpeed: 68, boostSpeed: 128, accel: 68, strafeAccel: 46,
      turnRate: 2.0, rollRate: 1.8,
      hullMax: 160, shieldMax: 120, shieldRegenRate: 8, shieldRegenDelay: 4.2,
      boostEnergyMax: 80, boostDrain: 40, boostRegen: 14,
      energyMult: 1.35, energyMax: 140,
    },
  },
];

export function getShipDef(id: string): PlayerShipDef {
  return PLAYER_SHIPS.find((s) => s.id === id) ?? PLAYER_SHIPS[0];
}
