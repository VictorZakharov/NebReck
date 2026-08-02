import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

export async function startDistServer(distRoot, port, mountPath = '') {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const assetPath =
      mountPath && (pathname === mountPath || pathname.startsWith(`${mountPath}/`))
        ? pathname.slice(mountPath.length) || '/'
        : pathname;
    const filePath = join(distRoot, assetPath === '/' ? 'index.html' : assetPath);
    try {
      const data = readFileSync(filePath);
      response.writeHead(200, {
        'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      });
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return server;
}

export function capturePageErrors(page, errors, label) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('crash', () => errors.push(`${label} crashed`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

/** Open an isolated desktop scenario and stop rendering before DOM settling. */
export async function openSmokePage(browser, baseUrl, errors) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  capturePageErrors(page, errors, 'game page');
  await page.goto(`${baseUrl}/?seed=99&headless=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.game));
  await page.evaluate(() => window.game.loop.stop());
  await settleBrowserFrames(page);
  return page;
}

/** Wait for browser layout/font work without pretending wall time is game time. */
export async function settleBrowserFrames(page, frameCount = 2) {
  await page.evaluate(async (frames) => {
    await document.fonts.ready;
    for (let frame = 0; frame < frames; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, frameCount);
}

/** Advance the complete game by an exact amount, independent of renderer FPS. */
export async function advanceGameTime(page, seconds, hz = 60) {
  await page.evaluate(({ frameCount, dt }) => {
    const game = window.game;
    game.loop.stop();
    const render = game.postFx.render;
    game.postFx.render = () => {};
    try {
      for (let frame = 0; frame < frameCount; frame++) game.loop.stepManual(dt);
    } finally {
      game.postFx.render = render;
    }
  }, { frameCount: Math.ceil(seconds * hz), dt: 1 / hz });
}

/** Advance projectile collision only, keeping unrelated actors frozen. */
export async function advanceProjectileTime(page, seconds, hz = 60) {
  await page.evaluate(({ frameCount, dt }) => {
    const game = window.game;
    game.loop.stop();
    const targets = [...game.enemies, ...game.turrets, ...game.neutrals];
    if (game.capital?.alive) targets.push(game.capital);
    for (let frame = 0; frame < frameCount; frame++) {
      game.projectiles.update(
        dt,
        targets,
        game.player.alive ? game.player : null,
        game.world.bodies,
        (hit) => game.combat.resolveHit(hit),
        game.surface ? game.terrainProjectileHit : undefined,
        (target) => target !== game.player || !game.devices.cloaked,
      );
    }
  }, { frameCount: Math.ceil(seconds * hz), dt: 1 / hz });
}
