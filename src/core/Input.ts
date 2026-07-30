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

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressedThisFrame.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
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
}
