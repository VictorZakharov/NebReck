import { Color } from 'three';

export interface WeaponDef {
  id: string;
  name: string;
  /** Seconds between shots. */
  cooldown: number;
  damage: number;
  projectileSpeed: number;
  /** Energy cost per trigger pull. */
  energyCost: number;
  /** Bolts per shot. */
  pellets: number;
  /** Max random spread half-angle in radians. */
  spread: number;
  color: Color;
  /** Projectile visual scale. */
  boltLength: number;
  boltWidth: number;
  life: number;
}

/** Player primary weapons, cycled with 1/2/3 or the mouse wheel. */
export const PLAYER_WEAPONS: WeaponDef[] = [
  {
    id: 'pulse',
    name: 'Pulse Cannons',
    cooldown: 0.13,
    damage: 7,
    projectileSpeed: 340,
    energyCost: 2.6,
    pellets: 1,
    spread: 0.004,
    color: new Color(0.25, 0.9, 1.0),
    boltLength: 4.2,
    boltWidth: 0.16,
    life: 1.6,
  },
  {
    id: 'autogun',
    name: 'Rotary Autogun',
    cooldown: 0.055,
    damage: 2.6,
    projectileSpeed: 390,
    energyCost: 1.0,
    pellets: 1,
    spread: 0.014,
    color: new Color(1.0, 0.9, 0.55),
    boltLength: 2.6,
    boltWidth: 0.1,
    life: 1.2,
  },
  {
    id: 'scatter',
    name: 'Fragment Storm',
    cooldown: 0.72,
    damage: 5,
    projectileSpeed: 270,
    energyCost: 14,
    pellets: 7,
    spread: 0.055,
    color: new Color(1.0, 0.62, 0.18),
    boltLength: 2.0,
    boltWidth: 0.14,
    life: 0.9,
  },
  {
    id: 'lance',
    name: 'Ion Lance',
    // Fast but thirsty: burst of ~6 shots drains the bank dry, then the
    // energy gate (energy >= cost) silences it until regen catches up.
    cooldown: 0.28,
    damage: 26,
    projectileSpeed: 430,
    energyCost: 16,
    pellets: 1,
    spread: 0,
    color: new Color(0.72, 0.4, 1.0),
    boltLength: 7.0,
    boltWidth: 0.22,
    life: 1.8,
  },
];

export const MISSILE = {
  name: 'Seeker Missiles',
  cooldown: 1.35,
  damage: 34,
  speed: 130,
  accel: 160,
  maxSpeed: 260,
  turnRate: 2.6,
  life: 6,
  color: new Color(1.0, 0.85, 0.3),
} as const;

export type EnemyRocketMode = 'homing' | 'fast';

/** Vigil rotary cannon: low per-bolt damage, player-autogun cadence. */
export const ENEMY_AUTOGUN = {
  fireCooldown: 0.055,
  damage: 2.6,
  projectileSpeed: 390,
  range: 468,
  life: 1.2,
  boltLength: 2.2,
  boltWidth: 0.1,
  color: new Color(1.0, 0.78, 0.28),
} as const;

/** Enemy ordnance deliberately trades tracking for speed between variants. */
export const ENEMY_ROCKETS = {
  homing: {
    name: 'Vigil Seeker',
    damage: 28,
    speed: 92,
    accel: 105,
    maxSpeed: 205,
    turnRate: 1.55,
    life: 8,
    attackRange: 1200,
    color: new Color(1.0, 0.22, 0.08),
  },
  fast: {
    name: 'Vigil Lance Rocket',
    damage: 24,
    speed: 285,
    accel: 0,
    maxSpeed: 285,
    turnRate: 0,
    life: 4.6,
    attackRange: 320,
    color: new Color(1.0, 0.58, 0.1),
  },
} as const;

export const ENEMY_BOLT_COLOR = new Color(1.0, 0.28, 0.2);
