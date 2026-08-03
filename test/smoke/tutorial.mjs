import { settleBrowserFrames, advanceGameTime } from './helpers.mjs';
import { runTutorialFlight } from './tutorial-flight.mjs';
import { runTutorialSystems } from './tutorial-systems.mjs';
import { runTutorialWorld } from './tutorial-world.mjs';
import {
  holdTutorialNarration,
  releaseTutorialNarration,
  setTutorialKey,
} from './tutorial-input.mjs';
export { collectTutorialFailures } from './tutorial-assertions.mjs';

/** Exercise every paced tutorial lesson through touch-equivalent input paths. */
export async function runTutorialSmoke(page) {
  await page.evaluate(() => {
    window.game.loop.stop();
    window.game.touchControls.enableForTest();
    window.game.showHangar();
  });
  await page.evaluate(() => {
    const vanta = [...document.querySelectorAll('.ship-card')]
      .find((card) => card.textContent.includes('SX-2 Vanta'));
    vanta?.click();
  });
  const hangarActionOrder = await page.evaluate(() =>
    [...document.querySelectorAll('.hangar-actions button')]
      .map((button) => button.textContent.trim()),
  );
  await page.evaluate(() => {
    window.game.warp.progress = 0.5;
    window.game.warp.update(0);
    const button = [...document.querySelectorAll('.hangar-actions button')]
      .find((candidate) => candidate.textContent.trim() === 'Tutorial');
    button?.click();
  });
  await advanceGameTime(page, 0.05);

  const intro = await page.evaluate(() => ({
    active: window.game.tutorial.active,
    step: window.game.tutorial.stepId,
    frozen: window.game.tutorial.frozen,
    state: window.game.state,
    ship: window.game.player.def.id,
    preference: window.game.selectedShipId,
    guide: document.querySelector('.tutorial-kicker span')?.textContent ?? '',
    objective: document.querySelector('.tutorial-objective')?.textContent ?? '',
    touchCopy: document.querySelector('.tutorial-controls')?.textContent.includes('Tap continue'),
    lessonBrowseCopy:
      document.querySelector('[data-el="narration"]')?.textContent?.includes('Left and Right Arrow') &&
      document.querySelector('.tutorial-controls')?.textContent.includes('‹ / › lessons'),
    progress: document.querySelector('[data-el="progress"]')?.textContent ?? '',
    collapsed: document.querySelector('.tutorial-panel')?.classList.contains('collapsed') ?? false,
    closeLabel: document.querySelector('.tutorial-exit')?.getAttribute('aria-label') ?? '',
    promptHidden: document.querySelector('.interact-prompt')?.textContent === '' &&
      document.querySelector('.interact-prompt')?.style.opacity === '0',
    jumpLocked: document.querySelector('[data-el="jumpText"]')?.textContent === 'Training lock',
    navLocked: window.game.navigation.locked,
    warpVisible: window.game.warp.group.visible,
    maxCaveMount: Math.max(0, ...window.game.sector.caves.map((cave) => cave.maxMountLength)),
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await settleBrowserFrames(page);
  const portrait = await page.evaluate(() => {
    const panel = document.querySelector('.tutorial-panel')?.getBoundingClientRect();
    const previous = document.querySelector('[data-el="previous"]')?.getBoundingClientRect();
    const progress = document.querySelector('[data-el="progress"]')?.getBoundingClientRect();
    const forward = document.querySelector('[data-el="forward"]')?.getBoundingClientRect();
    const buttons = [...document.querySelectorAll('.tutorial-actions button, .tutorial-progress button, .tutorial-window-controls button')]
      .map((button) => button.getBoundingClientRect());
    return {
      inBounds: !!panel && panel.left >= 0 && panel.right <= innerWidth &&
        panel.top >= 0 && panel.bottom <= innerHeight,
      touchTargets: buttons.every((rect) => rect.height >= 44),
      progressCentered: !!previous && !!progress && !!forward &&
        Math.abs((progress.left + progress.right) / 2 - (previous.left + forward.right) / 2) < 1,
    };
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await settleBrowserFrames(page);

  await holdTutorialNarration(page);
  await advanceGameTime(page, 0.05);
  const autoExpanded = await page.evaluate(() =>
    !document.querySelector('.tutorial-panel')?.classList.contains('collapsed'));
  await page.keyboard.press('Enter');
  await advanceGameTime(page, 0.05);
  const enterAdvanced = await page.evaluate(() => window.game.tutorial.stepId === 'flight');
  const enterNarrationInterrupted = await releaseTutorialNarration(page) > 0;
  await advanceGameTime(page, 0.05);
  const autoCollapsed = await page.evaluate(() =>
    document.querySelector('.tutorial-panel')?.classList.contains('collapsed') ?? false);
  await page.evaluate(() => window.game.tutorial.stageForTest('welcome'));

  await page.click('[data-el="collapse"]');
  await page.evaluate(() => window.game.tutorial.stageForTest('flight'));
  const manualExpanded = await page.evaluate(() =>
    !document.querySelector('.tutorial-panel')?.classList.contains('collapsed'));
  await page.click('[data-el="collapse"]');
  await page.evaluate(() => window.game.tutorial.stageForTest('target'));
  const manualCollapsed = await page.evaluate(() =>
    document.querySelector('.tutorial-panel')?.classList.contains('collapsed') ?? false);
  const copyAudit = await page.evaluate(() => {
    const ids = [
      'welcome', 'flight', 'boost', 'target', 'guns', 'seekers', 'shield', 'hull',
      'repair', 'missile-dodge', 'cloak', 'cloak-break', 'emp', 'mine', 'loadout-open',
      'craft', 'loadout-close', 'trade-open', 'trade', 'trade-close', 'planet',
      'surface-flight', 'surface-turret', 'surface-stash', 'lift', 'jump', 'complete',
    ];
    const forbidden = /real collision|hit volumes|procedural contracts|persistent surface dungeons|progression layer|physically docked/i;
    const violations = [];
    for (const id of ids) {
      window.game.tutorial.stageForTest(id);
      const text = document.querySelector('[data-el="narration"]')?.textContent?.trim() ?? '';
      if (!text || forbidden.test(text)) violations.push(`${id}: ${text}`);
    }
    window.game.tutorial.start();
    return { count: ids.length, violations };
  });

  const keyboardNavigation = await page.evaluate(() => {
    const game = window.game;
    const worldSignature = () => JSON.stringify({
      theme: game.sector.themeName,
      planets: game.sector.planets.map((planet) => [...planet.position.toArray(), planet.radius]),
      bodies: game.world.bodies.map((body) => [...body.position.toArray(), body.radius]),
    });
    const worldBefore = worldSignature();
    const root = document.documentElement;
    root.classList.remove('touch-layout');
    const mouseControlsDisabled = [
      ...document.querySelectorAll(
        '.tutorial-progress button, .tutorial-actions button, .tutorial-window-controls button',
      ),
    ].every((button) => getComputedStyle(button).pointerEvents === 'none');
    root.classList.add('touch-layout');
    const pressKey = (code) => {
      const down = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true });
      window.dispatchEvent(down);
      game.loop.stepManual(1 / 60);
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
      game.loop.stepManual(1 / 60);
    };
    pressKey('ArrowRight');
    const next = game.tutorial.stepId === 'flight';
    pressKey('ArrowLeft');
    const previous = game.tutorial.stepId === 'welcome';
    const canvas = game.renderer.domElement;
    const descriptor = Object.getOwnPropertyDescriptor(document, 'pointerLockElement');
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => canvas,
    });
    document.dispatchEvent(new Event('pointerlockchange'));
    const mousePress = new MouseEvent('mousedown', {
      bubbles: true, button: 0, cancelable: true,
    });
    canvas.dispatchEvent(mousePress);
    const result = {
      noSoftwareCursor: !document.querySelector('.tutorial-cursor'),
      mouseControlsDisabled,
      mouseDidNotAdvance: game.tutorial.stepId === 'welcome',
      next,
      previous,
      worldPreserved: worldSignature() === worldBefore,
    };
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    game.tutorial.stageForTest('target');
    const worldMove = new MouseEvent('mousemove', { bubbles: true });
    Object.defineProperties(worldMove, {
      movementX: { value: 36 },
      movementY: { value: -12 },
    });
    canvas.dispatchEvent(worldMove);
    const worldDelta = game.input.consumeMouseDelta();
    result.worldLookAllowed = Math.abs(worldDelta.dx) + Math.abs(worldDelta.dy) > 0;
    if (descriptor) Object.defineProperty(document, 'pointerLockElement', descriptor);
    else delete document.pointerLockElement;
    document.dispatchEvent(new Event('pointerlockchange'));
    game.pause();
    result.pauseMenu = game.state === 'paused' &&
      [...document.querySelectorAll('.pause-screen button')]
        .some((button) => button.textContent.trim() === 'Exit tutorial') &&
      getComputedStyle(document.querySelector('.tutorial-panel')).display === 'none';
    [...document.querySelectorAll('.pause-screen button')]
      .find((button) => button.textContent.trim() === 'Resume')?.click();
    result.focusSafe = game.state === 'playing' && game.tutorial.active;
    game.tutorial.stageForTest('welcome');
    return result;
  });

  await setTutorialKey(page, 'Escape', true);
  await advanceGameTime(page, 0.05);
  await setTutorialKey(page, 'Escape', false);
  const escapeMenu = await page.evaluate(() => ({
    paused: window.game.state === 'paused',
    exit: [...document.querySelectorAll('.pause-screen button')]
      .some((button) => button.textContent.trim() === 'Exit tutorial'),
  }));
  await page.click('.pause-screen button');

  await page.evaluate(() => window.game.tutorial.stageForTest('loadout-open'));
  const debugBefore = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    state: window.game.state,
    frozen: window.game.tutorial.frozen,
    loadRelevant: document.querySelector('[data-touch-action="loadout"]')
      ?.classList.contains('tutorial-relevant') ?? false,
    navDisabled: document.querySelector('[data-touch-action="nav"]')?.disabled ?? false,
  }));
  await setTutorialKey(page, 'Tab', true);
  await advanceGameTime(page, 0.08);
  await setTutorialKey(page, 'Tab', false);
  const debugAfter = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    state: window.game.state,
    awaiting: window.game.tutorial.awaitingAction,
    panelHidden: getComputedStyle(document.querySelector('.tutorial-panel')).display === 'none',
  }));

  await page.evaluate(() => window.game.tutorial.stageForTest('surface-turret'));
  await page.evaluate(() =>
    window.game.turrets.find((turret) => turret.training)?.takeDamage(1e6));
  await advanceGameTime(page, 0.1);
  await page.click('[data-el="previous"]');
  await advanceGameTime(page, 0.2);
  const browseReset = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    surface: window.game.surface !== null,
    liveBattery: window.game.turrets.some((turret) => turret.training && turret.alive),
    nav: window.game.navigation.current?.label ?? '',
  }));

  await page.evaluate(() => window.game.startTutorial());
  await advanceGameTime(page, 0.6);
  await page.click('.tutorial-next');
  await advanceGameTime(page, 0.6);

  const flight = await runTutorialFlight(page);
  const systems = await runTutorialSystems(page);
  const world = await runTutorialWorld(page);
  return { hangarActionOrder, intro, portrait, copyAudit, autoExpanded, autoCollapsed, manualExpanded, manualCollapsed, enterAdvanced, enterNarrationInterrupted, keyboardNavigation, escapeMenu, debugNavigation: { before: debugBefore, after: debugAfter }, browseReset, ...flight, ...systems, ...world };
}
