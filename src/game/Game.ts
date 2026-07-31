import type { GameOptions, GameState } from './GameFoundation';
import { GameRuntime } from './GameRuntime';

export type { GameOptions, GameState };

/**
 * Public game facade.
 *
 * The implementation is split by responsibility:
 * GameFoundation -> GameScreens -> GameInteractions -> GameRuntime.
 * Keeping this entry point deliberately small makes the ownership boundary
 * obvious while preserving the public API used by the app and smoke harness.
 */
export class Game extends GameRuntime {
  constructor(
    canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    options: GameOptions,
  ) {
    super(canvas, uiRoot, options);
    this.initializeRuntime();
  }
}
