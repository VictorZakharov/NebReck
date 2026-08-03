import { advanceGameTime } from './helpers.mjs';
import { holdTutorialNarration, releaseTutorialNarration, setTutorialKey } from './tutorial-input.mjs';
import { runTutorialSurface } from './tutorial-surface.mjs';

export async function runTutorialWorld(page) {
  await setTutorialKey(page, 'Tab', true);
  await advanceGameTime(page, 0.1);
  await setTutorialKey(page, 'Tab', false);
  const engineering = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    state: window.game.state,
    panelHidden: getComputedStyle(document.querySelector('.tutorial-panel')).display === 'none',
  }));
  await holdTutorialNarration(page);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.recipe-row')]
      .find((candidate) => candidate.textContent.includes('Nanobot Kit'));
    row?.querySelector('button')?.click();
  });
  const craftNarrationGuard = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    awaiting: window.game.tutorial.awaitingAction,
  }));
  await advanceGameTime(page, 0.1);
  const craftReview = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    awaiting: window.game.tutorial.awaitingAction,
  }));
  const craftNarrationInterruptions = await releaseTutorialNarration(page);
  await setTutorialKey(page, 'Tab', true);
  await advanceGameTime(page, 0.1);
  await setTutorialKey(page, 'Tab', false);
  const engineeringReturn = await page.evaluate(() => ({
    step: window.game.tutorial.stepId, state: window.game.state,
  }));
  await setTutorialKey(page, 'KeyR', true);
  await advanceGameTime(page, 0.1);
  await setTutorialKey(page, 'KeyR', false);
  const tradeApproach = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    state: window.game.state,
    panelHidden: getComputedStyle(document.querySelector('.tutorial-panel')).display === 'none',
  }));
  if (tradeApproach.state !== 'trade') throw new Error(
    `Tutorial merchant did not open: ${JSON.stringify({ engineeringReturn, tradeApproach })}`,
  );
  await page.click('.trade-panel .close-x');
  await advanceGameTime(page, 0.1);
  const tradeAborted = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    state: window.game.state,
    frozen: window.game.tutorial.frozen,
    nav: window.game.navigation.current?.label ?? '',
    prompt: document.querySelector('.interact-prompt')?.textContent ?? '',
  }));
  await setTutorialKey(page, 'KeyR', true);
  await advanceGameTime(page, 0.1);
  await setTutorialKey(page, 'KeyR', false);
  const tradeReopened = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    state: window.game.state,
    panel: document.querySelector('.trade-panel') !== null,
  }));
  await holdTutorialNarration(page);
  const tradeExecuted = await page.evaluate(() => ({
    completed: window.game.executeTrade('buy-flux'),
    scrap: window.game.inventory.counts.scrap,
    step: window.game.tutorial.stepId,
  }));
  if (!tradeExecuted.completed || tradeExecuted.step !== 'trade-open') throw new Error(
    `Tutorial trade unavailable: ${JSON.stringify({ tradeApproach, tradeExecuted })}`,
  );
  await advanceGameTime(page, 0.1);
  const tradeReview = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    awaiting: window.game.tutorial.awaitingAction,
  }));
  const tradeNarrationInterruptions = await releaseTutorialNarration(page);
  await setTutorialKey(page, 'KeyR', true);
  await advanceGameTime(page, 0.1);
  await setTutorialKey(page, 'KeyR', false);
  const tradeReturn = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    state: window.game.state,
    frozen: window.game.tutorial.frozen,
  }));
  if (tradeReturn.step !== 'planet' || tradeReturn.state !== 'playing') throw new Error(
    `Tutorial merchant did not undock: ${JSON.stringify(tradeReturn)}`,
  );
  const surface = await runTutorialSurface(page);
  return {
    engineering, craftNarrationGuard, craftReview, craftNarrationInterruptions, engineeringReturn,
    tradeApproach, tradeAborted, tradeReopened,
    tradeReview, tradeNarrationInterruptions, tradeReturn, ...surface,
  };
}
