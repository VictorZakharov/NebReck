export const JUMP_FLUX_COST = 2;
export const JUMP_SPOOL_TIME = 5;
export const JUMP_SUPPRESS_RANGE = 600;

const TARGET_NAMES: Record<string, string> = {
  raider: 'Vigil Raider',
  brute: 'Vigil Warden',
  turret: 'Vigil Battery',
  capital: 'Warden-class Carrier',
};

export function targetDisplayName(kind: string): string {
  return TARGET_NAMES[kind] ?? 'Vigil Raider';
}
