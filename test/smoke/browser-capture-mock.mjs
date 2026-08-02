/** Install the capture mock in the page realm when passed to page.evaluate(). */
export function exposeBrowserCaptureMock() {
  window.__installBrowserCaptureMock = (canvas) => {
    const calls = [];
    const locks = [];
    let unlocks = 0;
    let fullscreenElement = null;
    const originals = [];
    const define = (target, name, descriptor) => {
      originals.push([target, name, Object.getOwnPropertyDescriptor(target, name)]);
      Object.defineProperty(target, name, { configurable: true, ...descriptor });
    };

    define(canvas, 'requestPointerLock', {
      value: () => { calls.push('pointer'); return Promise.resolve(); },
    });
    define(document, 'fullscreenEnabled', { value: true });
    define(document, 'fullscreenElement', { get: () => fullscreenElement });
    define(document.documentElement, 'requestFullscreen', {
      value: async () => {
        calls.push('fullscreen');
        fullscreenElement = document.documentElement;
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    });
    define(document, 'exitFullscreen', {
      value: async () => {
        calls.push('exit-fullscreen');
        fullscreenElement = null;
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    });
    define(navigator, 'keyboard', {
      value: {
        lock: async (codes) => { locks.push(codes.join(',')); },
        unlock: () => { unlocks += 1; },
      },
    });

    return {
      calls,
      locks,
      get unlocks() { return unlocks; },
      restore() {
        for (const [target, name, descriptor] of originals.reverse()) {
          if (descriptor) Object.defineProperty(target, name, descriptor);
          else delete target[name];
        }
        delete window.__installBrowserCaptureMock;
      },
    };
  };
}
