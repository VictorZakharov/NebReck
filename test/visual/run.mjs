/**
 * Visual regression harness.
 *
 *   npm run test:visual          — capture all scenes, compare against local baselines
 *   npm run test:visual:update   — capture and overwrite local baselines
 *
 * Flags: --scene=<name> to run a single scene, --no-build to reuse dist/,
 *        --port=<number> to coexist with a running review server.
 *
 * Renders run in headless Chromium on SwiftShader (software GL) so results
 * are stable across GPUs/driver updates on the same OS. Scenes are staged
 * deterministically in-app (seeded RNG + fixed-step simulation + frozen CSS
 * animations); see src/game/TestScenes.ts.
 */
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DIST = join(ROOT, 'dist');
const BASELINE_DIR = join(__dirname, 'baselines');
const OUTPUT_DIR = join(__dirname, 'output');
const DIFF_DIR = join(__dirname, 'diff');

const SCENES = [
  'nebula', 'ship', 'asteroids', 'combat', 'hud', 'menu', 'cockpit', 'hangar', 'loadout',
  'boost', 'tutorial', 'targeting', 'distant-targeting', 'turret-targeting', 'capital-targeting', 'friendly-targeting', 'resource-targeting', 'fx', 'fx-volume', 'smoke-volume', 'shield-impact', 'damage-shake', 'asteroid-impact', 'ship-breakup', 'cave', 'split', 'level', 'wreck', 'planet', 'base', 'trade', 'fleet',
  'cloak', 'controls',
  'enemy-variety', 'missile-warning', 'capital-superweapon', 'capital-charge-guide',
  'mobile-controls', 'mobile-controls-portrait',
  'mobile-tutorial', 'mobile-tutorial-portrait',
  'mobile-hangar', 'mobile-hangar-portrait', 'mobile-loadout', 'mobile-trade',
];
const SEED = 7;
const VIEWPORT = { width: 1280, height: 720 };
const SCENE_VIEWPORTS = {
  'mobile-controls': { width: 844, height: 390 },
  'mobile-controls-portrait': { width: 390, height: 844 },
  'mobile-tutorial': { width: 844, height: 390 },
  'mobile-tutorial-portrait': { width: 390, height: 844 },
  'mobile-hangar': { width: 844, height: 390 },
  'mobile-hangar-portrait': { width: 390, height: 844 },
  'mobile-loadout': { width: 844, height: 390 },
  'mobile-trade': { width: 844, height: 390 },
};

const args = process.argv.slice(2);
const portArg = args.find((argument) => argument.startsWith('--port='))?.split('=')[1];
const PORT = portArg === undefined ? 8123 : Number(portArg);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`Invalid visual harness port "${portArg}".`);
  process.exit(2);
}

// Pixelmatch sensitivity + how many differing pixels we tolerate before
// failing (anti-aliasing wobble across Chromium updates stays under this).
const PIXEL_THRESHOLD = 0.16;
const MAX_DIFF_RATIO = 0.015;

const update = args.includes('--update');
const noBuild = args.includes('--no-build');
const only = args.find((a) => a.startsWith('--scene='))?.split('=')[1];
const scenes = only ? SCENES.filter((s) => s === only) : SCENES;

if (only && scenes.length === 0) {
  console.error(`Unknown scene "${only}". Available: ${SCENES.join(', ')}`);
  process.exit(2);
}

// ---- build ------------------------------------------------------------------

if (!noBuild || !existsSync(join(DIST, 'index.html'))) {
  console.log('Building production bundle…');
  execSync('npx webpack --mode production', { cwd: ROOT, stdio: 'inherit' });
}

// ---- static server ----------------------------------------------------------

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.png': 'image/png',
};

const server = createServer((req, res) => {
  const urlPath = new URL(req.url, `http://localhost:${PORT}`).pathname;
  const filePath = join(DIST, urlPath === '/' ? 'index.html' : urlPath);
  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));

// ---- capture ----------------------------------------------------------------

for (const dir of [BASELINE_DIR, OUTPUT_DIR, DIFF_DIR]) {
  mkdirSync(dir, { recursive: true });
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--disable-gpu-vsync', '--force-device-scale-factor=1', '--mute-audio'],
});
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

page.on('pageerror', (err) => console.error('  [page error]', err.message));

const failures = [];
const results = [];

for (const scene of scenes) {
  await page.setViewportSize(SCENE_VIEWPORTS[scene] ?? VIEWPORT);
  const url = `http://localhost:${PORT}/?testScene=${scene}&seed=${SEED}`;
  process.stdout.write(`Scene "${scene}" … `);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__RENDER_DONE__ === true, { timeout: 30000 });
  // Wait for actual browser work rather than an arbitrary wall-clock delay.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  const outputPath = join(OUTPUT_DIR, `${scene}.png`);
  await page.screenshot({ path: outputPath });

  const baselinePath = join(BASELINE_DIR, `${scene}.png`);
  if (update || !existsSync(baselinePath)) {
    copyFileSync(outputPath, baselinePath);
    console.log(existsSync(baselinePath) && !update ? 'baseline created' : 'baseline updated');
    results.push({ scene, status: 'baseline' });
    continue;
  }

  const baseline = PNG.sync.read(readFileSync(baselinePath));
  const actual = PNG.sync.read(readFileSync(outputPath));
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    console.log('FAIL (size mismatch)');
    failures.push(scene);
    results.push({ scene, status: 'fail', reason: 'size mismatch' });
    continue;
  }

  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const diffPixels = pixelmatch(baseline.data, actual.data, diff.data, baseline.width, baseline.height, {
    threshold: PIXEL_THRESHOLD,
  });
  const ratio = diffPixels / (baseline.width * baseline.height);
  const pct = (ratio * 100).toFixed(3);

  if (ratio > MAX_DIFF_RATIO) {
    writeFileSync(join(DIFF_DIR, `${scene}.png`), PNG.sync.write(diff));
    console.log(`FAIL (${pct}% pixels differ, diff image written)`);
    failures.push(scene);
    results.push({ scene, status: 'fail', diffPct: pct });
  } else {
    console.log(`ok (${pct}% diff)`);
    results.push({ scene, status: 'pass', diffPct: pct });
  }
}

await browser.close();
server.close();

// ---- report -----------------------------------------------------------------

console.log('\n— Visual test summary —');
for (const r of results) {
  const label = r.status === 'pass' ? 'PASS' : r.status === 'baseline' ? 'BASE' : 'FAIL';
  console.log(`  ${label}  ${r.scene}${r.diffPct ? ` (${r.diffPct}%)` : ''}${r.reason ? ` — ${r.reason}` : ''}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} scene(s) failed. Diffs in test/visual/diff/.`);
  process.exit(1);
}
const baselineCount = results.filter((result) => result.status === 'baseline').length;
if (baselineCount > 0) {
  console.log(`\n${baselineCount} local baseline(s) written; rerun to compare against them.`);
} else {
  console.log(`\nAll ${results.length} scene(s) passed.`);
}
