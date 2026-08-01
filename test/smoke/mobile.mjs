import { advanceGameTime, capturePageErrors, settleBrowserFrames } from './helpers.mjs';
import {
  inspectPortraitHangar,
  inspectTouchLayout,
  swipeFrom,
  waitForScrollEnd,
} from './mobile-layout.mjs';

const VIEWPORT = { width: 844, height: 390 };

async function pointer(page, selector, type, xRatio, yRatio, pointerId) {
  await page.locator(selector).evaluate((element, event) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent(event.type, {
      bubbles: true,
      cancelable: true,
      pointerId: event.pointerId,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: event.type === 'pointerup' ? 0 : 1,
      clientX: rect.left + rect.width * event.xRatio,
      clientY: rect.top + rect.height * event.yRatio,
    }));
  }, { type, xRatio, yRatio, pointerId });
}

async function tapAction(page, action, pointerId) {
  const selector = `[data-touch-action="${action}"]`;
  await pointer(page, selector, 'pointerdown', 0.5, 0.5, pointerId);
  await pointer(page, selector, 'pointerup', 0.5, 0.5, pointerId);
}

/** Real coarse-pointer browser context plus gesture-driven flight assertions. */
export async function runMobileSmoke(browser, baseUrl, errors) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  capturePageErrors(page, errors, 'mobile page');

  try {
    await page.goto(`${baseUrl}/?seed=121&headless=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.game));
    await page.evaluate(() => {
      const game = window.game;
      game.startMission();
      game.loop.stop();
      game.loop.stepManual(1 / 60);
    });
    await settleBrowserFrames(page);

    const layout = await inspectTouchLayout(page);

    await pointer(page, '[data-touch-stick="aim"]', 'pointerdown', 0.5, 0.5, 10);
    await pointer(page, '[data-touch-stick="aim"]', 'pointermove', 0.9, 0.5, 10);
    const aimRamp = await page.evaluate(() => {
      const first = Math.abs(window.game.input.consumeMouseDelta(1 / 60).dx);
      let settled = first;
      for (let i = 0; i < 24; i++) {
        settled = Math.abs(window.game.input.consumeMouseDelta(1 / 60).dx);
      }
      return { first, settled, gradual: first < settled * 0.45, limited: settled <= 8.01 };
    });
    await pointer(page, '[data-touch-stick="aim"]', 'pointerup', 0.9, 0.5, 10);
    await page.evaluate(() => window.game.input.resetVirtualControls());

    const beforeMove = await page.evaluate(() => window.game.player.position.clone());
    await pointer(page, '[data-touch-stick="move"]', 'pointerdown', 0.5, 0.5, 11);
    await pointer(page, '[data-touch-stick="move"]', 'pointermove', 0.72, 0.15, 11);
    const moveAxis = await page.evaluate(() => ({
      thrust: window.game.input.flightAxis('thrust'),
      strafe: window.game.input.flightAxis('strafeX'),
    }));
    await advanceGameTime(page, 0.35);
    const moved = await page.evaluate((before) =>
      window.game.player.position.distanceTo(before) > 0.3,
    beforeMove);

    await pointer(page, '[data-touch-action="boost"]', 'pointerdown', 0.5, 0.5, 12);
    await advanceGameTime(page, 0.05);
    const boosted = await page.evaluate(() => window.game.player.boosting);
    await pointer(page, '[data-touch-action="boost"]', 'pointerup', 0.5, 0.5, 12);
    await pointer(page, '[data-touch-stick="move"]', 'pointerup', 0.72, 0.15, 11);

    const beforeAim = await page.evaluate(() => window.game.player.object.quaternion.toArray());
    await pointer(page, '[data-touch-stick="aim"]', 'pointerdown', 0.5, 0.5, 13);
    await pointer(page, '[data-touch-stick="aim"]', 'pointermove', 0.82, 0.26, 13);
    await advanceGameTime(page, 0.2);
    await pointer(page, '[data-touch-stick="aim"]', 'pointerup', 0.82, 0.26, 13);
    const aimChanged = await page.evaluate((before) => {
      const after = window.game.player.object.quaternion;
      const dot = Math.abs(
        before[0] * after.x + before[1] * after.y +
        before[2] * after.z + before[3] * after.w
      );
      return 2 * Math.acos(Math.min(1, dot)) > 0.01;
    }, beforeAim);

    const shotsBefore = await page.evaluate(() => window.game.projectiles.debugSnapshot().length);
    await pointer(page, '[data-touch-action="fire"]', 'pointerdown', 0.5, 0.5, 14);
    await advanceGameTime(page, 0.2);
    await pointer(page, '[data-touch-action="fire"]', 'pointerup', 0.5, 0.5, 14);
    const fired = await page.evaluate((before) =>
      window.game.projectiles.debugSnapshot().length > before,
    shotsBefore);

    const weaponBefore = await page.evaluate(() => window.game.weapons.weaponIndex);
    await tapAction(page, 'weapon', 15);
    await advanceGameTime(page, 1 / 60);
    const weaponSwitched = await page.evaluate((before) =>
      window.game.weapons.weaponIndex !== before,
    weaponBefore);
    const viewBefore = await page.evaluate(() => window.game.chaseCam.mode);
    await tapAction(page, 'view', 16);
    await advanceGameTime(page, 1 / 60);
    const viewToggled = await page.evaluate((before) => window.game.chaseCam.mode !== before, viewBefore);

    await tapAction(page, 'loadout', 17);
    await advanceGameTime(page, 1 / 60);
    const loadout = await page.evaluate(() => ({
      opened: window.game.state === 'loadout',
      hidden: !document.querySelector('.touch-controls').classList.contains('visible'),
    }));
    if (loadout.opened) {
      await page.locator('.close-x').tap();
      await advanceGameTime(page, 1 / 60);
    }
    const returned = loadout.opened && await page.evaluate(() =>
      window.game.state === 'playing' &&
      document.querySelector('.touch-controls').classList.contains('visible'));

    await page.evaluate(() => {
      window.game.showMenu();
      window.game.showHangar();
      window.game.loop.stepManual(1 / 60);
    });
    await settleBrowserFrames(page);
    const vantaCard = page.locator('.ship-card').filter({ hasText: 'SX-2 Vanta' });
    await vantaCard.tap();
    await page.locator('.diff-btn').filter({ hasText: 'Rookie' }).tap();
    const hangar = await page.evaluate(() => ({
      native: !window.game.hangarVisor.active,
      selected: window.game.selectedShipId === 'vanta',
      difficultySelected: window.game.selectedDifficultyId === 'rookie',
      cards: document.querySelectorAll('.ship-card').length,
      actionsVisible: [...document.querySelectorAll('.hangar-actions button')]
        .every((button) => button.getBoundingClientRect().height >= 44),
    }));
    await page.locator('.hangar-actions button').filter({ hasText: 'Engage' }).tap();
    await advanceGameTime(page, 1 / 60);
    hangar.engaged = await page.evaluate(() =>
      window.game.state === 'playing' &&
      document.querySelector('.touch-controls').classList.contains('visible'));

    await page.setViewportSize({ width: 390, height: 844 });
    await settleBrowserFrames(page);
    const portrait = await inspectTouchLayout(page);
    await page.evaluate(() => {
      window.game.showMenu();
      window.game.showHangar();
      window.game.loop.stepManual(1 / 60);
    });
    await settleBrowserFrames(page);
    await page.locator('.diff-btn').filter({ hasText: 'Reckoning' }).tap();
    const portraitDifficultySelected = await page.evaluate(() =>
      window.game.selectedDifficultyId === 'reckoning');
    await page.locator('.screen.hangar').evaluate((screen) => { screen.scrollTop = 0; });
    const hardpointStartTarget = await page.locator('.hardpoint-row').evaluate((row) =>
      document.elementFromPoint(
        row.getBoundingClientRect().left + row.getBoundingClientRect().width * 0.5,
        row.getBoundingClientRect().top + row.getBoundingClientRect().height * 0.5,
      )?.closest('.ship-detail') !== null);
    await swipeFrom(page, '.hardpoint-row', -280);
    await waitForScrollEnd(page, '.screen.hangar');
    const hardpointSwipeScrolled = await page.locator('.screen.hangar').evaluate(
      (screen) => screen.scrollTop > 40,
    );
    const portraitHangar = await inspectPortraitHangar(page);
    portraitHangar.hardpointStartTarget = hardpointStartTarget;
    portraitHangar.hardpointSwipeScrolled = hardpointSwipeScrolled;
    portraitHangar.selected = portraitDifficultySelected;

    const result = {
      ...layout,
      aimRamp,
      moveAxis,
      moved,
      boosted,
      aimChanged,
      fired,
      weaponSwitched,
      viewToggled,
      loadout,
      returned,
      hangar,
      portrait,
      portraitHangar,
    };
    result.passed =
      result.touchDetected &&
      result.layoutClass &&
      result.visible &&
      result.sticks === 2 &&
      result.buttons >= 15 &&
      result.minTarget >= 44 &&
      result.inBounds &&
      result.tappable &&
      result.overlaps === 0 &&
      result.aimRamp.gradual &&
      result.aimRamp.limited &&
      result.moveAxis.thrust >= 0.5 &&
      result.moveAxis.strafe >= 0.1 &&
      result.moved &&
      result.boosted &&
      result.aimChanged &&
      result.fired &&
      result.weaponSwitched &&
      result.viewToggled &&
      result.loadout.opened &&
      result.loadout.hidden &&
      result.returned &&
      result.hangar.native &&
      result.hangar.selected &&
      result.hangar.difficultySelected &&
      result.hangar.cards === 3 &&
      result.hangar.actionsVisible &&
      result.hangar.engaged &&
      result.portrait.portrait &&
      result.portrait.minTarget >= 44 &&
      result.portrait.inBounds &&
      result.portrait.tappable &&
      result.portrait.overlaps === 0 &&
      !result.portrait.hudOverlap &&
      result.portrait.deckTop >= 0.58 * 844 &&
      result.portrait.radarSize.width <= 90 &&
      result.portrait.radarSize.height <= 90 &&
      result.portrait.clearCenter &&
      ['auto', 'scroll'].includes(result.portraitHangar.overflowY) &&
      result.portraitHangar.touchAction.includes('pan-y') &&
      result.portraitHangar.maxScroll > 40 &&
      result.portraitHangar.hardpointStartTarget &&
      result.portraitHangar.hardpointSwipeScrolled &&
      result.portraitHangar.scrolled &&
      result.portraitHangar.threatButtons === 3 &&
      result.portraitHangar.lastThreatVisible &&
      result.portraitHangar.actionsVisible &&
      result.portraitHangar.actionsFollowThreats &&
      result.portraitHangar.actionTargets &&
      result.portraitHangar.selected;
    console.log('mobile controls:', JSON.stringify(result));
    return result;
  } finally {
    await context.close();
  }
}
