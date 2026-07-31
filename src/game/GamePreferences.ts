import { DIFFICULTIES } from './Difficulty';
import { PLAYER_SHIPS } from './Ships';

const SHIP_COOKIE = 'nebreck_ship';
const DIFFICULTY_COOKIE = 'nebreck_difficulty';
const LEGACY_SHIP_COOKIE = 'cleverspace_ship';
const LEGACY_DIFFICULTY_COOKIE = 'cleverspace_difficulty';
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

function readPreferenceCookie(
  name: string,
  legacyName: string,
  isValid: (value: string) => boolean,
): string | null {
  const current = readCookie(name);
  if (current && isValid(current)) return current;

  const legacy = readCookie(legacyName);
  if (!legacy || !isValid(legacy)) return null;
  writeCookie(name, legacy);
  return legacy;
}

export interface GamePreferences {
  shipId: string;
  difficultyId: string;
}

export function loadGamePreferences(defaults: GamePreferences): GamePreferences {
  const savedShip = readPreferenceCookie(
    SHIP_COOKIE,
    LEGACY_SHIP_COOKIE,
    (value) => PLAYER_SHIPS.some((ship) => ship.id === value),
  );
  const savedDifficulty = readPreferenceCookie(
    DIFFICULTY_COOKIE,
    LEGACY_DIFFICULTY_COOKIE,
    (value) => DIFFICULTIES.some((difficulty) => difficulty.id === value),
  );
  return {
    shipId: savedShip ?? defaults.shipId,
    difficultyId: savedDifficulty ?? defaults.difficultyId,
  };
}

export function saveShipPreference(shipId: string): void {
  writeCookie(SHIP_COOKIE, shipId);
}

export function saveDifficultyPreference(difficultyId: string): void {
  writeCookie(DIFFICULTY_COOKIE, difficultyId);
}
