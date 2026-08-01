/**
 * Repeatable local renderer benchmark. Times production WebGL with an explicit
 * GPU finish at 1080p and 4K. Frame timings remain diagnostic because they
 * are machine-specific; draw-call count has a deterministic scene budget.
 */
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startDistServer } from './smoke/helpers.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = 8134;
const server = await startDistServer(DIST, PORT, '/NebReck');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const profiles = [
  { name: '1080p', width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: '4K', width: 3840, height: 2160, deviceScaleFactor: 1 },
  { name: 'Retina 4K', width: 1920, height: 1080, deviceScaleFactor: 2 },
];
const results = [];

try {
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.deviceScaleFactor,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://localhost:${PORT}/?seed=99&headless=1`, {
      waitUntil: 'commit',
    });
    await page.waitForFunction(() => Boolean(window.game), undefined, { timeout: 120_000 });
    const sample = await page.evaluate(({ name, width, height }) => {
      const game = window.game;
      const gl = game.renderer.getContext();
      game.loop.stop();
      game.showHangar();
      game.startMission();
      game.inventory.add('flux', 2);
      game.startJump(true);
      game.jumpSpool = 0.0001;
      game.loop.stepManual(1 / 60);
      game.loop.stepManual(1 / 60);
      game.settleWarpFx();
      for (let frame = 0; frame < 3; frame++) game.loop.stepManual(1 / 60);
      gl.finish();
      game.renderer.info.autoReset = false;
      game.renderer.info.reset();
      game.loop.stepManual(1 / 60);
      gl.finish();
      const calls = game.renderer.info.render.calls;
      const triangles = game.renderer.info.render.triangles;
      game.renderer.info.autoReset = true;
      const frames = 8;
      const frameStart = performance.now();
      for (let frame = 0; frame < frames; frame++) game.loop.stepManual(1 / 60);
      gl.finish();
      const frameMs = (performance.now() - frameStart) / frames;
      const renderStart = performance.now();
      for (let frame = 0; frame < frames; frame++) game.postFx.render(1 / 60);
      gl.finish();
      const renderMs = (performance.now() - renderStart) / frames;
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        name,
        css: `${width}x${height}`,
        buffer: `${game.renderer.domElement.width}x${game.renderer.domElement.height}`,
        pixelRatio: game.renderer.getPixelRatio(),
        megapixels: Number((game.renderer.domElement.width *
          game.renderer.domElement.height / 1e6).toFixed(2)),
        frameMs: Number(frameMs.toFixed(2)),
        measuredFps: Number((1000 / frameMs).toFixed(1)),
        renderMs: Number(renderMs.toFixed(2)),
        calls,
        triangles,
        gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'masked',
      };
    }, profile);
    results.push({ ...sample, errors });
    await context.close();
  }
  console.table(results);
  const drawCallRegression = results.some((result) => result.calls > 330);
  if (drawCallRegression) console.error('Render draw-call budget exceeded (330).');
  if (drawCallRegression || results.some((result) => result.errors.length > 0)) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
