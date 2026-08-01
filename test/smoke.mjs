/**
 * End-to-end live-gameplay smoke runner.
 *
 * Scenario implementation lives in test/smoke/ by feature area so this file
 * only owns browser lifecycle, execution order, and final result aggregation.
 */
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { collectSmokeFailures } from './smoke/assertions.mjs';
import { runCapitalSmoke } from './smoke/capital.mjs';
import {
  capturePageErrors,
  settleBrowserFrames,
  startDistServer,
} from './smoke/helpers.mjs';
import { runHangarSmoke } from './smoke/hangar.mjs';
import { runMobileSmoke } from './smoke/mobile.mjs';
import { runPreferenceSmoke } from './smoke/preferences.mjs';
import { runRuntimeSmoke } from './smoke/runtime.mjs';
import { runTargetingSmoke } from './smoke/targeting.mjs';
import { runWorldSmoke } from './smoke/world.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = 8127;
const BASE_URL = `http://localhost:${PORT}`;
const errors = [];
const server = await startDistServer(DIST, PORT, '/NebReck');
let browser;

try {
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--mute-audio'],
  });

  const hangarPreferences = await runPreferenceSmoke(browser, BASE_URL, errors);
  const mobile = await runMobileSmoke(browser, BASE_URL, errors);

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  capturePageErrors(page, errors, 'game page');
  await page.goto(`${BASE_URL}/?seed=99&headless=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.game));
  await settleBrowserFrames(page);

  // Ordering is intentional: later probes reuse world state staged by earlier
  // feature groups, while all gameplay time remains deterministic.
  const hangar = await runHangarSmoke(page);
  const world = await runWorldSmoke(page);
  const targeting = await runTargetingSmoke(page);
  const capitalSystems = await runCapitalSmoke(page);
  const runtime = await runRuntimeSmoke(page);

  console.log('page errors:', errors.length === 0 ? 'none' : errors.join('\n'));
  const failures = collectSmokeFailures({
    errors,
    hangarPreferences,
    mobile,
    hangar,
    world,
    targeting,
    capitalSystems,
    runtime,
  });
  console.log(
    'smoke result:',
    failures.length === 0 ? 'PASS' : `FAIL: ${failures.join(', ')}`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
