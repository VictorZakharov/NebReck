/**
 * Repeatable local renderer benchmark. Times production WebGL with an explicit
 * GPU finish at 1080p and 4K. Frame timings remain diagnostic because they
 * are machine-specific; draw-call count has a deterministic scene budget.
 */
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { sampleWorld } from './performance/sample.mjs';
import { startDistServer } from './smoke/helpers.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = 8134;
const server = await startDistServer(DIST, PORT, '/NebReck');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const allProfiles = [
  { name: '1080p', width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: '4K', width: 3840, height: 2160, deviceScaleFactor: 1 },
  { name: 'Retina 4K', width: 1920, height: 1080, deviceScaleFactor: 2 },
];
const allWorlds = ['space', 'planet'];
const args = process.argv.slice(2);
const profileName = args.find((argument) => argument.startsWith('--profile='))?.split('=')[1];
const worldName = args.find((argument) => argument.startsWith('--world='))?.split('=')[1];
const profiles = profileName
  ? allProfiles.filter((profile) => profile.name === profileName)
  : allProfiles;
const worlds = worldName ? allWorlds.filter((world) => world === worldName) : allWorlds;
if (profiles.length === 0 || worlds.length === 0) {
  console.error('Unknown performance profile or world.');
  process.exit(2);
}
const results = [];

try {
  for (const profile of profiles) {
    for (const world of worlds) {
      results.push(await sampleWorld(browser, PORT, profile, world));
    }
  }
  console.table(results);
  const drawCallRegression = results.some((result) =>
    result.calls > (result.world === 'planet' ? 90 : 330));
  const surfaceOptimizationRegression = results.some((result) =>
    result.world === 'planet' && (
      result.surfaceLights > 4 ||
      result.batchedMeshes < 100 ||
      result.surfaceBatches < 1 ||
      result.collisionCells < 1
    ));
  if (drawCallRegression) console.error('Render draw-call budget exceeded.');
  if (surfaceOptimizationRegression) {
    console.error('Planet surface batching, light budget, or collision index regressed.');
  }
  if (
    drawCallRegression || surfaceOptimizationRegression ||
    results.some((result) => result.errors.length > 0)
  ) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
