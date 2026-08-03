import { advanceGameTime } from './helpers.mjs';
import { setTutorialKey } from './tutorial-input.mjs';
export async function runTutorialSurvival(page) {
  await page.evaluate(() => {
    window.__tutorialNarrationHeld = true;
    Object.defineProperty(window.game.voice, 'guideSpeaking', {
      configurable: true,
      get: () => window.__tutorialNarrationHeld,
    });
  });
  const shieldUndamaged = await page.evaluate(() => ({ shield: window.game.player.shield,
    hull: window.game.player.hull }));
  await advanceGameTime(page, 0.4);
  const narrationGuard = await page.evaluate((before) => ({
    noShot: !window.game.projectiles.debugSnapshot()
      .some((shot) => shot.faction === 'enemy' && shot.kind === 'bolt'),
    undamaged: window.game.player.shield === before.shield && window.game.player.hull === before.hull,
  }), shieldUndamaged);
  await page.evaluate(() => { window.__tutorialNarrationHeld = false; });
  await advanceGameTime(page, 0.05);
  const shieldStart = await page.evaluate(() => ({
    position: window.game.player.position.toArray(),
    bolts: window.game.projectiles.debugSnapshot()
      .filter((shot) => shot.faction === 'enemy' && shot.kind === 'bolt').length,
    shield: window.game.player.shield,
  }));
  await page.evaluate(() => { delete window.game.voice.guideSpeaking; });
  await advanceGameTime(page, 1.5);
  const shieldLesson = await page.evaluate((start) => {
    const game = window.game;
    return {
      step: game.tutorial.stepId, frozen: game.tutorial.frozen,
      shieldReduced: game.player.shield < start.shield,
      safe: game.player.alive && game.player.hull === game.player.hullMax,
      visibleShot: start.bolts > 0,
      positionHeld: game.player.position.distanceTo({
        x: start.position[0], y: start.position[1], z: start.position[2],
      }) < 0.1,
    };
  }, shieldStart);
  await page.evaluate(() => {
    window.__tutorialNarrationHeld = true;
    Object.defineProperty(window.game.voice, 'guideSpeaking', {
      configurable: true,
      get: () => window.__tutorialNarrationHeld,
    });
  });
  await advanceGameTime(page, 0.05);
  const lowerShieldGuard = await page.evaluate(() => {
    const button = document.querySelector('.tutorial-next');
    const enabled = button?.disabled === false;
    button?.click();
    return {
      enabled,
      advanced: window.game.tutorial.stepId === 'hull',
      hullSafe: window.game.player.hull === window.game.player.hullMax,
    };
  });
  await page.evaluate(() => { window.__tutorialNarrationHeld = false; });
  await advanceGameTime(page, 0.05);
  await page.evaluate(() => { delete window.game.voice.guideSpeaking; });
  await page.evaluate(() => { window.game.chaseCam.trauma = 0; window.game.chaseCam.damageKick = 0; });
  await advanceGameTime(page, 1.5);
  const hullLesson = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    review: window.game.tutorial.awaitingAction,
    hullReduced: window.game.player.hull < window.game.player.hullMax,
    shieldEmpty: window.game.player.shield === 0,
    impactShake: window.game.chaseCam.trauma > 0.1,
    repairKey: /H|Repair/.test(document.querySelector('.tutorial-controls')?.textContent ?? ''),
  }));
  await page.evaluate(() => { window.game.chaseCam.trauma = 0; window.game.chaseCam.damageKick = 0; });
  await setTutorialKey(page, 'KeyH', true);
  await advanceGameTime(page, 0.12);
  await setTutorialKey(page, 'KeyH', false);
  const repairReview = await page.evaluate(() => ({
    ready: window.game.tutorial.stepId === 'repair' && window.game.tutorial.awaitingAction,
    noNewShake: window.game.chaseCam.trauma === 0,
  }));
  await setTutorialKey(page, 'KeyA', true);
  await advanceGameTime(page, 0.05);
  await setTutorialKey(page, 'KeyA', false);
  const missileLock = await page.evaluate(() => {
    const game = window.game;
    const threat = game.projectiles.incomingThreat(game.player);
    return {
      step: game.tutorial.stepId,
      locked: threat.locked && threat.count === 1,
      warning: document.querySelector('.missile-warning')?.classList.contains('show') ?? false,
      navLocked: game.navigation.locked,
      safeHull: game.player.hull,
      safeShield: game.player.shield,
    };
  });
  await advanceGameTime(page, 0.9);
  const assistedHold = await page.evaluate(() => ({
    held: window.game.tutorial.maneuverHold,
    imminent: document.querySelector('.missile-warning')?.classList.contains('imminent') ?? false,
    title: document.querySelector('[data-el="missileWarningTitle"]')?.textContent ?? '',
    objective: document.querySelector('.tutorial-objective')?.textContent ?? '',
  }));
  const dodgeOrigin = await page.evaluate(() => window.game.player.position.toArray());
  await setTutorialKey(page, 'KeyA', true);
  await advanceGameTime(page, 3);
  await setTutorialKey(page, 'KeyA', false);
  await advanceGameTime(page, 1);
  const assistedDodge = await page.evaluate(({ origin, safeHull, safeShield }) => ({
    released: !window.game.tutorial.maneuverHold,
    review: window.game.tutorial.stepId === 'missile-dodge' && window.game.tutorial.awaitingAction,
    moved: window.game.player.position.distanceTo({ x: origin[0], y: origin[1], z: origin[2] }) >= 24,
    warningCleared: !document.querySelector('.missile-warning')?.classList.contains('show'),
    unharmed: window.game.player.hull >= safeHull && window.game.player.shield >= safeShield,
  }), { origin: dodgeOrigin, safeHull: missileLock.safeHull, safeShield: missileLock.safeShield });
  await page.evaluate(() => {
    const game = window.game;
    game.tutorial.stageForTest('missile-dodge');
    const side = game.player.position.clone().set(1, 0, 0).applyQuaternion(game.player.object.quaternion);
    game.player.position.addScaledVector(side, 30);
  });
  await advanceGameTime(page, 0.05);
  const smartDodge = await page.evaluate(() => ({
    held: window.game.tutorial.maneuverHold,
    acknowledged: document.querySelector('[data-el="narration"]')?.textContent?.includes('Clean evade') ?? false,
    lockCleared: !window.game.projectiles.incomingThreat(window.game.player).locked,
  }));
  await advanceGameTime(page, 2.4);
  smartDodge.review = await page.evaluate(() =>
    window.game.tutorial.stepId === 'missile-dodge' && window.game.tutorial.awaitingAction);
  return { narrationGuard, lowerShieldGuard, shieldLesson, hullLesson, repairReview, missileLock, assistedHold, assistedDodge, smartDodge };
}
