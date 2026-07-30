export interface DifficultyDef {
  id: string;
  name: string;
  description: string;
  /** Multipliers applied to the base tuning. */
  enemyDamage: number;
  enemyToughness: number;
  waveSize: number;
  aggression: number;
  scoreMult: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'rookie',
    name: 'Rookie',
    description: 'The Vigil is still waking up. Fewer, softer, slower to shoot.',
    enemyDamage: 0.6, enemyToughness: 0.8, waveSize: 0.7, aggression: 0.75, scoreMult: 0.75,
  },
  {
    id: 'veteran',
    name: 'Veteran',
    description: 'The fight as it was meant to be flown.',
    enemyDamage: 1.0, enemyToughness: 1.0, waveSize: 1.0, aggression: 1.0, scoreMult: 1.0,
  },
  {
    id: 'reckoning',
    name: 'Reckoning',
    description: 'The Drift keeps no graves. Bigger waves, harder hulls, merciless aim.',
    enemyDamage: 1.45, enemyToughness: 1.3, waveSize: 1.35, aggression: 1.3, scoreMult: 1.6,
  },
];

export function getDifficulty(id: string): DifficultyDef {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1];
}
