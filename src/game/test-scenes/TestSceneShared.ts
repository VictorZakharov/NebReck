import { Game } from '../Game';

export const TEST_STEP = 1 / 60;

export function steps(game: Game, count: number): void {
  for (let index = 0; index < count; index++) game.loop.stepManual(TEST_STEP);
}

/** Instant jump into sector 2 (sector 1 is intentionally peaceful). */
export function jumpToSector2(game: Game): void {
  game.inventory.add('flux', 2);
  game.startJump(true);
  game.jumpSpool = 0.0001;
  steps(game, 2);
  game.settleWarpFx();
}

/** Freeze CSS-driven UI at one deterministic animation frame. */
export function freezeCssAnimations(): void {
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after {
      animation-delay: -1s !important;
      animation-play-state: paused !important;
      transition: none !important;
    }
  `;
  document.head.appendChild(style);
}
