import { Game } from '../Game';
import { TEST_STEP, steps } from './TestSceneShared';

/** Full HUD over a live mission frame, jump drive mid-spool. */
export function stageHud(game: Game): void {
  game.startMission();
  game.inventory.add('flux', 2);
  game.startJump(true);
  game.jumpSpool = 2.5;
  game.quests.accept(game.quests.generateOffer(1, game.player.position));
  game.pendingOffer = game.quests.generateOffer(1, game.player.position);
  game.hud.showBanner('Vigil hunters inbound');
  steps(game, 10);
}

export function stageMenu(game: Game): void {
  game.showMenu();
  steps(game, 3);
}

export function stageCockpit(game: Game): void {
  game.startMission();
  game.chaseCam.mode = 'first';
  game.chaseCam.snapTo(game.player.object);
  steps(game, 8);
}

export function stageHangar(game: Game): void {
  game.showMenu();
  game.showHangar();
  steps(game, 3);
}

export function stageLoadout(game: Game): void {
  game.startMission();
  game.inventory.add('scrap', 9);
  game.inventory.add('crystal', 6);
  game.inventory.add('flux', 1);
  game.openLoadout();
  steps(game, 3);
}

export function stageBoost(game: Game): void {
  game.startMission();
  game.state = 'test';
  game.player.throttle = 1;
  for (let index = 0; index < 90; index++) {
    game.chaseCam.update(TEST_STEP, game.player.object, 1, true);
  }
  game.renderHudOnce();
  steps(game, 2);
}

export function stageControls(game: Game): void {
  game.showMenu();
  game.menu!.showControls();
  steps(game, 3);
}

export function stageCloak(game: Game): void {
  game.startMission();
  game.hud.clearComms();
  game.activateCloak();
  steps(game, 30);
}

export function stageTrade(game: Game): void {
  game.startMission();
  game.inventory.add('scrap', 14);
  game.inventory.add('crystal', 7);
  game.inventory.add('flux', 2);
  game.openTrade();
  steps(game, 3);
}

/** Paused shield lesson: live HUD highlight, impact hemisphere, and LYRA card. */
export function stageTutorial(game: Game): void {
  game.startTutorial();
  game.tutorial.stageForTest('shield');
  steps(game, 3);
}
