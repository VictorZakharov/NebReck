import { advanceGameTime } from './helpers.mjs';
import {
  holdTutorialNarration,
  releaseTutorialNarration,
  selectTutorialTargetDuringNarration,
  setTutorialButton,
  setTutorialKey,
  touchGate,
  tutorialRouteBlocked,
} from './tutorial-input.mjs';
export async function runTutorialFlight(page) {
  const flightControl = await touchGate(page, '.touch-move-stick', '.touch-aim-stick');
  await page.click('[data-el="collapse"]');
  await page.setViewportSize({ width: 1876, height: 837 });
  await advanceGameTime(page, 0.05);
  const flightGate = await page.evaluate(() => {
    const game = window.game;
    const nav = game.navigation.current;
    const toGate = nav?.position.clone().sub(game.player.position).normalize();
    const facing = game.player.forward(game.player.position.clone()).normalize();
    game.input.setVirtualLook(1, 0);
    const delta = game.input.consumeMouseDelta();
    game.input.setVirtualLook(0, 0);
    const markerRect = document.querySelector('.nav-marker')?.getBoundingClientRect();
    const panelRect = document.querySelector('.tutorial-panel')?.getBoundingClientRect();
    const midpoint = game.player.position.clone().add(nav.position).multiplyScalar(0.5);
    const rollUnlocked = ['KeyQ', 'KeyE'].every((code) => {
      game.input.setVirtualKey(code, true);
      const allowed = game.input.isDown(code);
      game.input.setVirtualKey(code, false);
      return allowed;
    });
    return {
      move: document.querySelector('.touch-move-stick')?.classList.contains('tutorial-relevant') ?? false,
      aimDisabled: document.querySelector('.touch-aim-stick')?.classList.contains('tutorial-disabled') ?? false,
      navDisabled: document.querySelector('[data-touch-action="nav"]')?.disabled ?? false,
      navLocked: game.navigation.locked && game.toggleNavigationPoint() === false,
      navLabel: nav?.label ?? '',
      navDistance: nav ? game.player.position.distanceTo(nav.position) : 0,
      fieldBodies: game.world.bodies.filter((body) => !body.destroyed &&
        body.position.distanceTo(midpoint) < 330).length,
      offsetAngle: toGate ? Math.acos(Math.max(-1, Math.min(1, toGate.dot(facing)))) : 0,
      marker: document.querySelector('.nav-marker')?.classList.contains('show') ?? false,
      markerClear: !!markerRect && !!panelRect && (markerRect.bottom < panelRect.top || markerRect.top > panelRect.bottom || markerRect.right < panelRect.left || markerRect.left > panelRect.right),
      compact: !!panelRect && panelRect.height < 210,
      turnBlocked: delta.dx === 0 && delta.dy === 0,
      rollUnlocked,
    };
  }); flightGate.blockedRoute = await tutorialRouteBlocked(page);
  await page.click('[data-el="collapse"]');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.game.player.position.copy(window.game.navigation.current.position));
  await advanceGameTime(page, 0.05);
  const flightAdvanced = await page.evaluate(() =>
    window.game.tutorial.stepId === 'boost' && !window.game.tutorial.awaitingAction);
  const boostControl = await touchGate(page, '[data-touch-action="boost"]', '[data-touch-action="fire"]');
  await holdTutorialNarration(page);
  await page.evaluate(() => window.game.input.setVirtualMove(1, 0));
  await setTutorialKey(page, 'ShiftLeft', true);
  await advanceGameTime(page, 0.15);
  await setTutorialKey(page, 'ShiftLeft', false);
  await page.evaluate(() => window.game.input.setVirtualMove(0, 0));
  const boostReview = await page.evaluate(() =>
    window.game.tutorial.stepId === 'boost' && window.game.tutorial.awaitingAction);

  const boostOrigin = await page.evaluate(() => window.game.player.position.toArray());
  await page.evaluate(() => window.game.input.setVirtualMove(1, 0));
  await setTutorialKey(page, 'ShiftLeft', true);
  await advanceGameTime(page, 0.35);
  await setTutorialKey(page, 'ShiftLeft', false);
  await page.evaluate(() => window.game.input.setVirtualMove(0, 0));
  await page.evaluate(() => window.game.input.setVirtualLook(0.8, 0));
  await advanceGameTime(page, 0.08);
  const boostLingering = await page.evaluate((origin) => ({
    step: window.game.tutorial.stepId,
    awaiting: window.game.tutorial.awaitingAction,
    live: !window.game.tutorial.frozen,
    moved: window.game.player.position.distanceTo({ x: origin[0], y: origin[1], z: origin[2] }) > 1,
    offered: document.querySelector('.tutorial-next')?.textContent?.includes('Begin targeting') ?? false,
    continueEnabled: document.querySelector('.tutorial-next')?.disabled === false,
  }), boostOrigin);
  await page.evaluate(() => window.game.input.setVirtualLook(0, 0));
  await page.keyboard.press('Enter');
  await advanceGameTime(page, 0.05);
  const boostNarrationInterruptions = await releaseTutorialNarration(page);
  const aimControl = await touchGate(page, '.touch-aim-stick', '.touch-move-stick');
  const targetNarration = await selectTutorialTargetDuringNarration(page);

  const fireControl = await touchGate(page, '[data-touch-action="fire"]', '[data-touch-action="seeker"]');
  await holdTutorialNarration(page);
  await setTutorialButton(page, 0, true);
  await advanceGameTime(page, 0.85);
  await setTutorialButton(page, 0, false);
  const weaponReview = await page.evaluate(() =>
    window.game.tutorial.stepId === 'guns' && window.game.tutorial.awaitingAction);

  const seekerControl = await touchGate(page, '[data-touch-action="seeker"]', '[data-touch-action="fire"]');
  const missileBefore = await page.evaluate(() => window.game.inventory.missiles);
  await setTutorialButton(page, 2, true);
  await advanceGameTime(page, 0.12);
  await setTutorialButton(page, 2, false);
  const weaponNarrationInterruptions = await releaseTutorialNarration(page);
  const seekerInFlight = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    awaiting: window.game.tutorial.awaitingAction,
    active: window.game.projectiles.debugSnapshot()
      .some((shot) => shot.faction === 'player' && shot.kind === 'missile'),
  }));
  await advanceGameTime(page, 2.2);
  const missileReview = await page.evaluate(() => {
    const game = window.game;
    const target = game.enemies.find((enemy) => enemy.training);
    return {
      step: game.tutorial.stepId,
      awaiting: game.tutorial.awaitingAction,
      shieldUntouched: game.player.shield === game.player.shieldMax,
      impactConfirmed: !!target && target.hull + target.shield < target.hullMax + target.shieldMax,
      actualImpacts: target ? game.combat.playerSeekerImpacts(target) : 0,
      ammo: game.inventory.missiles,
    };
  });
  await page.click('.tutorial-next');
  return {
    flightGate,
    touchHighlights: flightControl && boostControl && aimControl && fireControl && seekerControl,
    flightAdvanced, boostReview, boostLingering, boostNarrationInterruptions,
    targetNarration, weaponReview, weaponNarrationInterruptions,
    missileBefore, seekerInFlight, missileReview,
  };
}
