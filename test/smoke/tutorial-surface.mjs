import { advanceGameTime } from './helpers.mjs';
import { setTutorialKey } from './tutorial-input.mjs';
import { runTutorialTravel } from './tutorial-travel.mjs';

export async function runTutorialSurface(page) {
  await setTutorialKey(page, 'KeyJ', true);
  await advanceGameTime(page, 5.2, 30);
  await setTutorialKey(page, 'KeyJ', false);
  const surfaceStart = await page.evaluate(() => {
    const game = window.game;
    game.__tutorialBase = game.navigation.current?.position.clone();
    return {
      step: game.tutorial.stepId, surface: game.surface !== null,
      enemies: game.enemies.length, turrets: game.turrets.length,
      passive: game.turrets[0]?.training === true,
      nav: game.navigation.current?.label ?? '',
      boostRelevant: document.querySelector('[data-touch-action="boost"]')
        ?.classList.contains('tutorial-relevant') ?? false,
    };
  });
  if (!surfaceStart.surface || surfaceStart.step !== 'surface-flight' || !surfaceStart.nav) throw new Error(
    `Tutorial planetfall did not complete: ${JSON.stringify(surfaceStart)}`,
  );
  await page.evaluate(() => {
    const game = window.game;
    game.player.position.copy(game.navigation.current.position);
    game.player.position.y += 35;
  });
  await advanceGameTime(page, 0.1);
  const baseReached = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    nav: window.game.navigation.current?.label ?? '',
    batteryInside: window.game.navigation.current?.position.distanceTo(window.game.__tutorialBase) ?? Infinity,
  }));
  await page.evaluate(() =>
    window.game.turrets.find((turret) => turret.training)?.takeDamage(1e6));
  await advanceGameTime(page, 0.1);
  const turretCleared = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    nav: window.game.navigation.current?.label ?? '',
    stashInside: window.game.navigation.current?.position.distanceTo(window.game.__tutorialBase) ?? Infinity,
  }));
  await page.evaluate(() => {
    const game = window.game;
    const nav = game.navigation.current;
    const stash = game.surface?.interactionBodies.find((body) => body.position === nav?.position);
    if (stash) stash.destroyed = true;
  });
  await advanceGameTime(page, 0.1);
  const stashReview = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    awaiting: window.game.tutorial.awaitingAction,
    live: !window.game.tutorial.frozen,
    objective: document.querySelector('.tutorial-objective')?.textContent ?? '',
  }));
  const travel = await runTutorialTravel(page);
  return {
    surfaceStart, baseReached, turretCleared, stashReview, ...travel,
  };
}
