import { exposeBrowserCaptureMock } from './browser-capture-mock.mjs';

export async function runDesktopInputSmoke(page) {
  await page.evaluate(exposeBrowserCaptureMock);
  const result = await page.evaluate(async () => {
    const input = window.game.input;
    const canvas = window.game.renderer.domElement;
    const mock = window.__installBrowserCaptureMock(canvas);

    try {
      input.leaveFlightMode();
      input.endFrame();
      input.enterFlightMode();
      const activationCalls = [...mock.calls];
      mock.calls.length = 0;
      await input.toggleFullscreen();
      const fullscreenEntryCalls = [...mock.calls];
      mock.calls.length = 0;
      const active = input.capturesFlightKeys;
      const controlDown = new KeyboardEvent('keydown', {
        code: 'ControlLeft', ctrlKey: true, cancelable: true,
      });
      const forwardDown = new KeyboardEvent('keydown', {
        code: 'KeyW', ctrlKey: true, cancelable: true,
      });
      window.dispatchEvent(controlDown);
      window.dispatchEvent(forwardDown);
      const flightKeyChord = {
        consumed: forwardDown.defaultPrevented,
        forward: input.isDown('KeyW'),
        descend: input.isDown('ControlLeft'),
      };
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlLeft' }));
      await input.toggleFullscreen();
      const fullscreenExitCalls = [...mock.calls];
      mock.calls.length = 0;
      const captureClick = new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        cancelable: true,
      });
      canvas.dispatchEvent(captureClick);
      const recaptureCalls = [...mock.calls];
      const captureClickConsumed = captureClick.defaultPrevented;
      const captureClickDidNotFire = !input.isButtonDown(0) && !input.wasButtonPressed(0);
      await Promise.resolve();
      return {
        activationCalls,
        fullscreenEntryCalls,
        fullscreenExitCalls,
        keyboardLocks: [...mock.locks],
        keyboardUnlocks: mock.unlocks,
        active,
        flightKeyChord,
        recaptureCalls,
        captureClickConsumed,
        captureClickDidNotFire,
      };
    } finally {
      input.leaveFlightMode();
      mock.restore();
    }
  });
  console.log('desktop flight capture:', JSON.stringify(result));
  return result;
}

export function collectDesktopInputFailures(result) {
  const entersWithoutFullscreen = result.activationCalls.join(',') === 'pointer';
  const explicitEntry = result.fullscreenEntryCalls.join(',') === 'fullscreen';
  const explicitExit = result.fullscreenExitCalls.join(',') === 'exit-fullscreen';
  const keyboardLock = result.keyboardLocks.includes('KeyW') && result.keyboardUnlocks > 0;
  const recaptures = result.recaptureCalls.join(',') === 'pointer';
  const chord = result.flightKeyChord;
  if (
    !entersWithoutFullscreen || !explicitEntry || !explicitExit || !keyboardLock ||
    !result.active || !recaptures ||
    !result.captureClickConsumed || !result.captureClickDidNotFire ||
    !chord.consumed || !chord.forward || !chord.descend
  ) return ['desktop pointer capture'];
  return [];
}
