import type { Group, Sprite, Vector3 } from 'three';

export type ShipKind =
  | 'kestrel' | 'vanta' | 'aegis'
  | 'raider' | 'brute' | 'bomber' | 'turret' | 'autogun-turret' | 'rocket-turret'
  | 'hauler' | 'capital';

export interface ShipHitBox {
  /** Ship-local center of a tight projectile/LOS volume. */
  center: Vector3;
  /** Ship-local half extents. */
  half: Vector3;
}

export interface ShipMesh {
  group: Group;
  /** Local-space muzzle positions. */
  gunpoints: Vector3[];
  /** Local-space engine nozzle positions. */
  enginePoints: Vector3[];
  /** Engine glow sprites — opacity is driven by throttle. */
  engineGlows: Sprite[];
  radius: number;
  /** Optional compound hull used instead of the broad collision sphere. */
  hitBoxes: ShipHitBox[];
}

export interface ShipStyle {
  hull: number;
  panel: number;
  accent: number;   // emissive stripe color
  engine: number;   // engine glow color
  canopy: number;
}

/** Tight central hit sphere for a stationary battery (barrel tips excluded). */
export const TURRET_COLLISION_RADIUS = 1.45;

export const STYLES: Record<ShipKind, ShipStyle> = {
  kestrel: { hull: 0x9aa7b8, panel: 0x5d6b7e, accent: 0x27e8ff, engine: 0x38c8ff, canopy: 0x1fd7d0 },
  vanta: { hull: 0xaeb9c6, panel: 0x525f6e, accent: 0x8cff5a, engine: 0x5affc8, canopy: 0x9fffe0 },
  aegis: { hull: 0xb9c2cc, panel: 0x6a7076, accent: 0xffd24a, engine: 0x4fa8ff, canopy: 0xffe9a8 },
  raider: { hull: 0x4a4348, panel: 0x2e2a30, accent: 0xff3b30, engine: 0xff5a2a, canopy: 0xff8080 },
  brute: { hull: 0x5a5f52, panel: 0x3a3e34, accent: 0xffa726, engine: 0xff7a1a, canopy: 0xffc060 },
  bomber: { hull: 0x555064, panel: 0x302d3d, accent: 0xff5f45, engine: 0xff9b38, canopy: 0xffb27d },
  turret: { hull: 0x565c64, panel: 0x33383e, accent: 0xff3b30, engine: 0xff5a2a, canopy: 0xff8080 },
  'autogun-turret': { hull: 0x555b63, panel: 0x30363d, accent: 0xffc85a, engine: 0xff6a2a, canopy: 0xffd98a },
  'rocket-turret': { hull: 0x59525f, panel: 0x302d36, accent: 0xff8a32, engine: 0xff5a2a, canopy: 0xffb070 },
  hauler: { hull: 0x8f8c80, panel: 0x55544b, accent: 0x9fdcff, engine: 0x7ac9ff, canopy: 0xbfe8ff },
  capital: { hull: 0x3f4652, panel: 0x282d36, accent: 0xff3b30, engine: 0xff6a2a, canopy: 0xff9090 },
};

/** Wingtip positions for nav lights, per player hull. */
export const NAV_LIGHTS: Partial<Record<ShipKind, [number, number, number]>> = {
  kestrel: [3.4, 0.29, 0.38],
  vanta: [2.48, 0.5, 1.0],
  aegis: [3.68, 0.05, 1.0],
};

/** Accent color per hull, exported for cockpit instrument tinting. */
export const STYLE_ACCENTS: Record<ShipKind, number> = Object.fromEntries(
  Object.entries(STYLES).map(([k, s]) => [k, s.accent]),
) as Record<ShipKind, number>;

/** Engine glow color per hull, exported for exhaust-trail particles. */
export const STYLE_ENGINES: Record<ShipKind, number> = Object.fromEntries(
  Object.entries(STYLES).map(([k, s]) => [k, s.engine]),
) as Record<ShipKind, number>;
