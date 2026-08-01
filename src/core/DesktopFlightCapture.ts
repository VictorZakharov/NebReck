/** Browser-level desktop flight capture: pointer lock, fullscreen, and KeyW lock. */
export class DesktopFlightCapture {
  private pointerLocked = false;
  private flightModeActive = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly usesTouchControls: boolean,
  ) {
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.element;
    });
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement && this.flightModeActive) void this.lockFlightKeys();
      else this.unlockFlightKeys();
    });
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  get capturesFlightKeys(): boolean {
    return this.flightModeActive;
  }

  /**
   * Pointer lock must be requested before fullscreen: fullscreen consumes the
   * transient activation Safari/WebKit requires for the lock request.
   */
  enter(): void {
    this.flightModeActive = true;
    if (!this.usesTouchControls) this.requestPointerLock();
    void this.enterFullscreenAndLockKeys();
  }

  leave(exitFullscreen = true): void {
    this.flightModeActive = false;
    this.exitPointerLock();
    this.unlockFlightKeys();
    if (exitFullscreen && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }

  /** Consume the first in-game click as a user-activated lock retry. */
  captureMouseDown(event: MouseEvent): boolean {
    if (this.usesTouchControls || !this.flightModeActive || this.pointerLocked) return false;
    event.preventDefault();
    this.requestPointerLock();
    return true;
  }

  requestPointerLock(): void {
    if (this.pointerLocked) return;
    // Chrome rejects requests made within ~1.3 s of the user Esc-exiting the
    // lock. Swallow the rejection and retry once after that cooldown; a direct
    // canvas click also provides a fresh user-activation retry on Safari.
    try {
      const result = this.element.requestPointerLock() as unknown as
        | Promise<void>
        | undefined;
      result?.catch?.(() => {
        window.setTimeout(() => {
          if (this.pointerLocked || !this.flightModeActive) return;
          try {
            (this.element.requestPointerLock() as unknown as Promise<void> | undefined)
              ?.catch?.(() => {});
          } catch { /* unsupported */ }
        }, 1400);
      });
    } catch { /* unsupported */ }
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  private async enterFullscreenAndLockKeys(): Promise<void> {
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
  }

  private async lockFlightKeys(): Promise<void> {
    const keyboard = (navigator as Navigator & {
      keyboard?: { lock(codes?: string[]): Promise<void> };
    }).keyboard;
    if (!keyboard || !document.fullscreenElement || !this.flightModeActive) return;
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
