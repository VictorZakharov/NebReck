export async function runDesktopInputSmoke(page) {
  const result = await page.evaluate(async () => {
    const input = window.game.input;
    const canvas = window.game.renderer.domElement;
    const calls = [];
    const pointerDescriptor = Object.getOwnPropertyDescriptor(canvas, 'requestPointerLock');
    const fullscreenDescriptor = Object.getOwnPropertyDescriptor(
      document.documentElement, 'requestFullscreen',
    );
    const enabledDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled');

    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(canvas, 'requestPointerLock', {
      configurable: true,
      value: () => { calls.push('pointer'); return Promise.resolve(); },
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: () => { calls.push('fullscreen'); return Promise.resolve(); },
    });

    try {
      input.leaveFlightMode(false);
      input.endFrame();
      input.enterFlightMode();
      const activationOrder = [...calls];
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
      calls.length = 0;
      const captureClick = new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        cancelable: true,
      });
      canvas.dispatchEvent(captureClick);
      const recaptureCalls = [...calls];
      const captureClickConsumed = captureClick.defaultPrevented;
      const captureClickDidNotFire = !input.isButtonDown(0) && !input.wasButtonPressed(0);
      await Promise.resolve();
      return {
        activationOrder,
        active,
        flightKeyChord,
        recaptureCalls,
        captureClickConsumed,
        captureClickDidNotFire,
      };
    } finally {
      input.leaveFlightMode(false);
      restoreProperty(canvas, 'requestPointerLock', pointerDescriptor);
      restoreProperty(document.documentElement, 'requestFullscreen', fullscreenDescriptor);
      restoreProperty(document, 'fullscreenEnabled', enabledDescriptor);
    }

    function restoreProperty(target, name, descriptor) {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete target[name];
    }
  });
  console.log('desktop flight capture:', JSON.stringify(result));
  return result;
}

export function collectDesktopInputFailures(result) {
  const ordered = result.activationOrder.join(',') === 'pointer,fullscreen';
  const recaptures = result.recaptureCalls.join(',') === 'pointer';
  const chord = result.flightKeyChord;
  if (
    !ordered || !result.active || !recaptures ||
    !result.captureClickConsumed || !result.captureClickDidNotFire ||
    !chord.consumed || !chord.forward || !chord.descend
  ) return ['desktop pointer capture'];
  return [];
}
