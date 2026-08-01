import { DIFFICULTIES } from './Difficulty';
import { PLAYER_SHIPS } from './Ships';

const SHIP_COOKIE = 'nebreck_hangar_ship';
const DIFFICULTY_COOKIE = 'nebreck_hangar_difficulty';
const ONE_YEAR_SECONDS = 31_536_000;

export interface HangarPreferences {
  shipId: string;
  difficultyId: string;
}

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  const entry = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}

function writeCookie(name: string, value: string): void {
  document.cookie =
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ` +
    `Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
}

export function loadHangarPreferences(defaults: HangarPreferences): HangarPreferences {
  const shipId = readCookie(SHIP_COOKIE);
  const difficultyId = readCookie(DIFFICULTY_COOKIE);
  return {
    shipId: PLAYER_SHIPS.some((ship) => ship.id === shipId) ? shipId! : defaults.shipId,
    difficultyId: DIFFICULTIES.some((difficulty) => difficulty.id === difficultyId)
      ? difficultyId!
      : defaults.difficultyId,
  };
}

export function saveHangarShip(shipId: string): void {
  writeCookie(SHIP_COOKIE, shipId);
}

export function saveHangarDifficulty(difficultyId: string): void {
  writeCookie(DIFFICULTY_COOKIE, difficultyId);
}
