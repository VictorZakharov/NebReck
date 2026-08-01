import './ui/styles.css';
import { auditShipConnectivity, ShipAudit } from './entities/ShipMesh';
import { Game } from './game/Game';
import { runTestScene } from './game/TestScenes';

declare global {
  interface Window {
    game?: Game;
    auditShips?: () => ShipAudit[];
  }
}

const params = new URLSearchParams(window.location.search);
const testScene = params.get('testScene');
// Explicit ?seed= pins the world (used by the test harness); otherwise every
// session rolls a fresh sector so themes and layouts stay surprising.
const seedParam = params.get('seed');
const launchEntropy = new Uint32Array(1);
crypto.getRandomValues(launchEntropy);
const seed =
  seedParam !== null
    ? Number(seedParam)
    : (launchEntropy[0] ^ (Date.now() >>> 0)) >>> 0;

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

// headless=1 lets automation (the smoke test) opt out of pointer lock and
// meta persistence without staging a test scene.
const headless = testScene !== null || params.get('headless') === '1';
const game = new Game(canvas, uiRoot, { seed, headless });
window.game = game; // debugging + test harness access
window.auditShips = auditShipConnectivity; // structural QA hook (smoke test)

if (testScene === 'hangar-live') {
  // Visual-review route: stage the real hangar directly, but keep the normal
  // requestAnimationFrame loop running for camera orbit, drag, zoom and FPS.
  game.showMenu();
  game.showHangar();
  game.loop.start();
} else if (testScene) {
  runTestScene(game, testScene);
} else {
  game.showMenu();
  game.loop.start();
}
