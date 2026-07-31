/**
 * Keyboard + mouse input with pointer lock. Mouse movement accumulates into
 * a per-frame delta that gameplay consumes once per tick, which keeps aim
 * behavior identical at any frame rate.
 */
export class Input {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;
  private buttons = new Set<number>();
  private buttonsPressedThisFrame = new Set<number>();
  private pointerLocked = false;
  private wheelDelta = 0;
  private flightKeysActive = false;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressedThisFrame.add(e.code);
      this.keys.add(e.code);
      if (
        e.code === 'Tab' || e.code === 'Space' ||
        (this.flightKeysActive && e.code === 'KeyW' && (e.ctrlKey || e.metaKey))
      ) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });
    element.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDx += e.movementX;
        this.mouseDy += e.movementY;
      }
    });
    element.addEventListener('mousedown', (e) => {
      if (!this.buttons.has(e.button)) this.buttonsPressedThisFrame.add(e.button);
      this.buttons.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    element.addEventListener('wheel', (e) => {
      this.wheelDelta += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.element;
    });
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement && this.flightKeysActive) void this.lockFlightKeys();
      else this.unlockFlightKeys();
    });
  }

  /**
   * Enter browser-game fullscreen and capture KeyW with every modifier, making
   * Left Ctrl + W available as descend + forward instead of Chrome's close-tab
   * accelerator. Unsupported browsers still retain ordinary pointer lock.
   */
  enterFlightMode(): void {
    this.flightKeysActive = true;
    void (async () => {
      if (!document.fullscreenElement && document.fullscreenEnabled) {
        try {
          const options = {
            navigationUI: 'hide',
            keyboardLock: 'browser',
          } as FullscreenOptions & { keyboardLock: 'browser' };
          await document.documentElement.requestFullscreen(options);
        } catch { /* fullscreen rejected or unsupported */ }
      }
      await this.lockFlightKeys();
      this.requestPointerLock();
    })();
  }

  /** Stop capturing browser accelerators; optionally leave app fullscreen. */
  leaveFlightMode(exitFullscreen = true): void {
    this.flightKeysActive = false;
    this.exitPointerLock();
    this.unlockFlightKeys();
    if (exitFullscreen && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }

  requestPointerLock(): void {
    if (this.pointerLocked) return;
    // Chrome rejects requests made within ~1.3 s of the user Esc-exiting the
    // lock ("Pointer lock cannot be acquired immediately after..."). Swallow
    // the rejection and retry once after the cooldown.
    const attempt = (): void => {
      try {
        const result = this.element.requestPointerLock() as unknown as
          | Promise<void>
          | undefined;
        result?.catch?.(() => {
          window.setTimeout(() => {
            if (!this.pointerLocked) {
              try {
                (this.element.requestPointerLock() as unknown as Promise<void> | undefined)
                  ?.catch?.(() => {});
              } catch { /* unsupported */ }
            }
          }, 1400);
        });
      } catch { /* unsupported */ }
    };
    attempt();
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  /** Test hook for the synthetic Ctrl+W regression; no allocation. */
  get capturesFlightKeys(): boolean {
    return this.flightKeysActive;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  isButtonDown(button: number): boolean {
    return this.buttons.has(button);
  }

  wasButtonPressed(button: number): boolean {
    return this.buttonsPressedThisFrame.has(button);
  }

  /** Mouse delta accumulated since the last consume. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.mouseDx, dy: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return d;
  }

  consumeWheel(): number {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  /** Call at the end of each frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.buttonsPressedThisFrame.clear();
  }

  private async lockFlightKeys(): Promise<void> {
    const keyboard = (navigator as Navigator & {
      keyboard?: { lock(codes?: string[]): Promise<void> };
    }).keyboard;
    if (!keyboard || !document.fullscreenElement || !this.flightKeysActive) return;
    try {
      await keyboard.lock(['KeyW']);
    } catch { /* progressive enhancement */ }
  }

  private unlockFlightKeys(): void {
    const keyboard = (navigator as Navigator & {
      keyboard?: { unlock(): void };
    }).keyboard;
    keyboard?.unlock();
  }
}
