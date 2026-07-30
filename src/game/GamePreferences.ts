import { DIFFICULTIES } from './Difficulty';
import { PLAYER_SHIPS } from './Ships';

const SHIP_COOKIE = 'cleverspace_ship';
const DIFFICULTY_COOKIE = 'cleverspace_difficulty';
const ONE_YEAR_SECONDS = 31_536_000;
const ONE_YEAR_MS = ONE_YEAR_SECONDS * 1_000;

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(';')) {
    const value = part.trim();
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  const expires = new Date(Date.now() + ONE_YEAR_MS).toUTCString();
  document.cookie =
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ` +
    `Max-Age=${ONE_YEAR_SECONDS}; Expires=${expires}; Path=/; SameSite=Lax`;
}

export interface GamePreferences {
  shipId: string;
  difficultyId: string;
}

export function loadGamePreferences(defaults: GamePreferences): GamePreferences {
  const savedShip = readCookie(SHIP_COOKIE);
  const savedDifficulty = readCookie(DIFFICULTY_COOKIE);
  return {
    shipId:
      savedShip && PLAYER_SHIPS.some((ship) => ship.id === savedShip)
        ? savedShip
        : defaults.shipId,
    difficultyId:
      savedDifficulty && DIFFICULTIES.some((difficulty) => difficulty.id === savedDifficulty)
        ? savedDifficulty
        : defaults.difficultyId,
  };
}

export function saveShipPreference(shipId: string): void {
  writeCookie(SHIP_COOKIE, shipId);
}

export function saveDifficultyPreference(difficultyId: string): void {
  writeCookie(DIFFICULTY_COOKIE, difficultyId);
}
