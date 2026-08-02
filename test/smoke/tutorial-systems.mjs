import { advanceGameTime } from './helpers.mjs';
import { setTutorialButton, setTutorialKey, touchGate } from './tutorial-input.mjs';
import { runTutorialSurvival } from './tutorial-survival.mjs';

export async function runTutorialSystems(page) {
  const survival = await runTutorialSurvival(page);
  await page.evaluate(() => window.game.input.setVirtualLook(0.8, 0));
  await advanceGameTime(page, 0.08);
  await page.evaluate(() => window.game.input.setVirtualLook(0, 0));
  await advanceGameTime(page, 0.75);
  const cloakStart = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    sentryFiring: window.game.projectiles.debugSnapshot()
      .some((shot) => shot.faction === 'enemy' && shot.kind === 'bolt'),
  }));
  const cloakControl = await touchGate(page, '[data-touch-action="cloak"]', '[data-touch-action="emp"]');
  await setTutorialKey(page, 'KeyF', true);
  await advanceGameTime(page, 0.08);
  await setTutorialKey(page, 'KeyF', false);
  await page.evaluate(() => {
    const game = window.game;
    const target = game.enemies.find((enemy) => enemy.training);
    if (!target) return;
    const away = game.player.position.clone().sub(target.position).normalize();
    game.player.position.copy(target.position).addScaledVector(away, 52);
    game.player.velocity.set(0, 0, 0);
    game.player.faceToward(target.position);
    game.chaseCam.snapTo(game.player.object);
  });
  await advanceGameTime(page, 0.2);
  const cloakReview = await page.evaluate(() => {
    const game = window.game;
    const target = game.enemies.find((enemy) => enemy.training);
    return {
      ready: game.tutorial.stepId === 'cloak' && game.tutorial.awaitingAction,
      live: !game.tutorial.frozen,
      cloaked: game.devices.cloaked,
      close: !!target && game.player.position.distanceTo(target.position) <= 65,
      unlimited: game.weapons.energy === game.weapons.energyMax,
    };
  });
  await setTutorialButton(page, 0, true);
  await advanceGameTime(page, 1.2);
  await setTutorialButton(page, 0, false);
  const cloakBreakReview = await page.evaluate(() => ({
    ready: window.game.tutorial.stepId === 'cloak-break' && window.game.tutorial.awaitingAction,
    reacquired: window.game.projectiles.debugSnapshot()
      .some((shot) => shot.faction === 'enemy' && shot.kind === 'bolt'),
  }));
  await page.click('.tutorial-next');

  const empControl = await touchGate(page, '[data-touch-action="emp"]', '[data-touch-action="fire"]');
  await advanceGameTime(page, 0.9);
  const empBefore = await page.evaluate(() => ({ hull: window.game.player.hull, shield: window.game.player.shield }));
  await setTutorialKey(page, 'KeyG', true);
  await advanceGameTime(page, 0.08);
  await setTutorialKey(page, 'KeyG', false);
  const empFirst = await page.evaluate(() => ({
    live: window.game.tutorial.awaitingAction && !window.game.tutorial.frozen,
    stunned: (window.game.enemies.find((enemy) => enemy.training)?.stunTimer ?? 0) > 3,
    cooldown: window.game.devices.empCooldown,
  }));
  await advanceGameTime(page, 4.5);
  const empResumed = await page.evaluate((before) => ({
    bolts: window.game.projectiles.debugSnapshot()
      .some((shot) => shot.faction === 'enemy' && shot.kind === 'bolt'),
    safe: window.game.player.hull === before.hull && window.game.player.shield === before.shield,
    cooldown: window.game.devices.empCooldown,
  }), empBefore);
  await setTutorialKey(page, 'KeyG', true);
  await advanceGameTime(page, 0.08);
  await setTutorialKey(page, 'KeyG', false);
  empResumed.repeatStun = await page.evaluate(() =>
    (window.game.enemies.find((enemy) => enemy.training)?.stunTimer ?? 0) > 3);
  await setTutorialButton(page, 0, true);
  await advanceGameTime(page, 0.08);
  await setTutorialButton(page, 0, false);
  await setTutorialButton(page, 0, true);
  await advanceGameTime(page, 1.8);
  await setTutorialButton(page, 0, false);
  const mining = await page.evaluate(() => ({
    step: window.game.tutorial.stepId, review: window.game.tutorial.awaitingAction,
  }));
  return {
    ...survival, cloakStart, cloakControl, cloakReview, cloakBreakReview,
    empControl, empFirst, empResumed, mining,
  };
}
