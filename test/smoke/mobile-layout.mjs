/** Dispatch a browser-native swipe; synthetic PointerEvents cannot trigger
 * Chromium's default touch scrolling behavior. */
export async function swipeFrom(page, selector, distanceY) {
  const rect = await page.locator(selector).boundingBox();
  if (!rect) throw new Error(`Cannot swipe from missing element: ${selector}`);
  const session = await page.context().newCDPSession(page);
  const x = rect.x + rect.width * 0.5;
  const startY = rect.y + rect.height * 0.5;
  const touch = (y) => ({ x, y, radiusX: 6, radiusY: 6, force: 1, id: 1 });
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touch(startY)],
    });
    for (let step = 1; step <= 6; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [touch(startY + distanceY * step / 6)],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

/** Wait only while the browser's native touch inertia is changing scrollTop. */
export async function waitForScrollEnd(page, selector) {
  await page.locator(selector).evaluate(async (element) => {
    let previous = element.scrollTop;
    let stableFrames = 0;
    for (let frame = 0; frame < 30 && stableFrames < 3; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const current = element.scrollTop;
      stableFrames = Math.abs(current - previous) < 0.5 ? stableFrames + 1 : 0;
      previous = current;
    }
  });
}

export async function inspectTouchLayout(page) {
  return page.evaluate(() => {
    const intersectionArea = (a, b) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const root = document.querySelector('.touch-controls');
    const controls = [...root.querySelectorAll('button, .touch-stick')]
      .filter((element) => getComputedStyle(element).display !== 'none')
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const atCenter = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return {
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          width: rect.width,
          height: rect.height,
          tappable: atCenter === element || element.contains(atCenter),
        };
      });
    let overlaps = 0;
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        if (intersectionArea(controls[i].rect, controls[j].rect) > 16) overlaps++;
      }
    }
    const hudRects = [...document.querySelectorAll(
      '.hud-score, .hud-weapons, .radar-wrap, .hud-vitals, .hud-drive, .target-preview',
    )]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map((element) => element.getBoundingClientRect());
    const hudOverlap = controls.some((control) =>
      hudRects.some((rect) => intersectionArea(control.rect, rect) > 16));
    const deckTop = Math.min(...controls.map((control) => control.rect.top));
    const centerElement = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    const radarRect = document.querySelector('.radar-wrap').getBoundingClientRect();
    return {
      touchDetected: window.game.input.usesTouchControls,
      layoutClass: document.documentElement.classList.contains('touch-layout'),
      visible: root.classList.contains('visible'),
      portrait: innerHeight > innerWidth,
      sticks: root.querySelectorAll('.touch-stick').length,
      buttons: root.querySelectorAll('button').length,
      minTarget: Math.min(...controls.map((control) =>
        Math.min(control.width, control.height))),
      inBounds: controls.every(({ rect }) =>
        rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight),
      tappable: controls.every((control) => control.tappable),
      overlaps,
      hudOverlap,
      deckTop,
      radarSize: { width: radarRect.width, height: radarRect.height },
      clearCenter: !centerElement?.closest('.touch-controls'),
    };
  });
}

export async function inspectPortraitHangar(page) {
  return page.locator('.screen.hangar').evaluate(async (screen) => {
    const maxScroll = screen.scrollHeight - screen.clientHeight;
    screen.scrollTop = maxScroll;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const threats = [...screen.querySelectorAll('.diff-btn')];
    const actions = screen.querySelector('.hangar-actions');
    const actionButtons = [...actions.querySelectorAll('button')];
    const lastThreat = threats.at(-1).getBoundingClientRect();
    const actionRect = actions.getBoundingClientRect();
    return {
      overflowY: getComputedStyle(screen).overflowY,
      touchAction: getComputedStyle(screen).touchAction,
      maxScroll,
      scrolled: screen.scrollTop > 0,
      threatButtons: threats.length,
      lastThreatVisible: lastThreat.top >= 0 && lastThreat.bottom <= innerHeight,
      actionsVisible: actionRect.top >= 0 && actionRect.bottom <= innerHeight,
      actionsFollowThreats: actionRect.top >= lastThreat.bottom,
      actionTargets: actionButtons.every((button) => button.getBoundingClientRect().height >= 44),
    };
  });
}
