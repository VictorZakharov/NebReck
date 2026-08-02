import { advanceGameTime } from './helpers.mjs';
import {
  holdTutorialNarration,
  releaseTutorialNarration,
  setTutorialKey,
} from './tutorial-input.mjs';

export async function runTutorialTravel(page) {
  const skywardSetup = await page.evaluate(() => {
    const game = window.game;
    const rollUnlocked = ['KeyQ', 'KeyE'].every((code) => {
      game.input.setVirtualKey(code, true);
      const allowed = game.input.isDown(code);
      game.input.setVirtualKey(code, false);
      return allowed;
    });
    const sky = game.player.position.clone();
    sky.x += 100;
    sky.y += 125;
    game.player.faceToward(sky);
    game.chaseCam.snapTo(game.player.object);
    game.__tutorialSkyQuaternion = game.player.object.quaternion.clone();
    return { rollUnlocked };
  });
  await advanceGameTime(page, 0.15);
  const stashCleared = await page.evaluate((rollUnlocked) => ({
    step: window.game.tutorial.stepId,
    nav: window.game.navigation.current?.label ?? '',
    viewHeld: window.game.player.object.quaternion
      .angleTo(window.game.__tutorialSkyQuaternion) < 0.001,
    rollUnlocked,
  }), skywardSetup.rollUnlocked);

  await holdTutorialNarration(page);
  await setTutorialKey(page, 'KeyJ', true);
  await advanceGameTime(page, 5.2, 30);
  await setTutorialKey(page, 'KeyJ', false);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {
    code: 'KeyJ', repeat: true, bubbles: true,
  })));
  await advanceGameTime(page, 0.1);
  const orbitNarration = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    title: document.querySelector('[data-el="title"]')?.textContent ?? '',
    speaking: window.game.voice.guideSpeaking,
  }));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', {
    code: 'KeyJ', bubbles: true,
  })));
  orbitNarration.interruptions = await releaseTutorialNarration(page);

  await setTutorialKey(page, 'KeyJ', true);
  await advanceGameTime(page, 5.2, 30);
  await setTutorialKey(page, 'KeyJ', false);
  const debrief = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    awaiting: window.game.tutorial.awaitingAction,
    frozen: window.game.tutorial.frozen,
    sector: window.game.sectorIndex,
    surface: window.game.surface !== null,
  }));
  await page.click('.tutorial-next');
  const completion = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    progress: document.querySelector('[data-el="progress"]')?.textContent ?? '',
  }));
  await page.click('.tutorial-next');
  const returned = await page.evaluate(() => ({
    state: window.game.state,
    active: window.game.tutorial.active,
    ship: window.game.player.def.id,
    preference: window.game.selectedShipId,
    selectedCard: document.querySelector('.ship-card.selected .ship-card-name')?.textContent ?? '',
    actors: window.game.enemies.length + window.game.turrets.length + window.game.neutrals.length,
    warpVisible: window.game.warp.group.visible,
  }));
  const manualNav = await testManualNavigation(page);
  return { stashCleared, orbitNarration, debrief, completion, returned, manualNav };
}

async function testManualNavigation(page) {
  await page.evaluate(() => {
    const game = window.game;
    game.startMission();
    game.lootAimed = false;
    game.lootAimBody = null;
    const target = game.enemies[0] ?? game.neutrals[0];
    game.targeting.current = target
      ? { ship: target, leadPoint: target.position.clone(), distance: 1, aimAssist: false }
      : null;
    game.__navSmokeTarget = target;
    game.__navAssigned = game.toggleNavigationPoint();
    game.loop.stepManual(1 / 60);
  });
  return page.evaluate(() => {
    const game = window.game;
    const current = game.navigation.current;
    const result = {
      assigned: game.__navAssigned, locked: game.navigation.locked,
      label: current?.label ?? '',
      marker: document.querySelector('.nav-marker')?.classList.contains('show') ?? false,
    };
    const target = game.__navSmokeTarget;
    game.targeting.current = target
      ? { ship: target, leadPoint: target.position.clone(), distance: 1, aimAssist: false }
      : null;
    game.toggleNavigationPoint();
    result.cleared = game.navigation.current === null;
    return result;
  });
}
