import { Game } from '../Game';
import { steps } from './TestSceneShared';

/** Adaptive phone flight deck over a live, deterministic mission frame. */
export function stageMobileControls(game: Game): void {
  game.startMission();
  steps(game, 3);
  game.state = 'test';
  game.hud.clearComms();
  game.renderHudOnce();
  game.touchControls.enableForTest();
  game.touchControls.setVisible(true);
}

/** Touch tutorial lesson with irrelevant controls gated and EMP called out. */
export function stageMobileTutorial(game: Game): void {
  game.touchControls.enableForTest();
  game.startTutorial();
  game.tutorial.stageForTest('emp');
  steps(game, 30);
}

/** Touch-native hangar: real DOM cards and buttons, never a rasterized visor. */
export function stageMobileHangar(game: Game): void {
  game.touchControls.enableForTest();
  game.showMenu();
  game.showHangar();
  steps(game, 3);
}

export function stageMobileLoadout(game: Game): void {
  game.touchControls.enableForTest();
  game.startMission();
  game.inventory.add('scrap', 9);
  game.inventory.add('crystal', 6);
  game.inventory.add('flux', 2);
  game.openLoadout();
  steps(game, 3);
}

export function stageMobileTrade(game: Game): void {
  game.touchControls.enableForTest();
  game.startMission();
  game.inventory.add('scrap', 14);
  game.inventory.add('crystal', 7);
  game.inventory.add('flux', 2);
  game.openTrade();
  steps(game, 3);
}
