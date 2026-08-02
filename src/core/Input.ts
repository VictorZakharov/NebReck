import { DesktopFlightCapture } from './DesktopFlightCapture';

/**
 * Unified physical and virtual input. Mouse and touch-look movement accumulate
 * into per-frame deltas that gameplay consumes once per tick, keeping aim
 * behavior identical at any frame rate.
 */
export class Input {
  private keys = new Set<string>();
  private virtualKeys = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;
  private buttons = new Set<number>();
  private virtualButtons = new Set<number>();
  private buttonsPressedThisFrame = new Set<number>();
  private wheelDelta = 0;
  private readonly desktopCapture: DesktopFlightCapture;
  private virtualThrust = 0;
  private virtualStrafeX = 0;
  private virtualStrafeY = 0;
  private virtualRoll = 0;
  private virtualLookX = 0;
  private virtualLookY = 0;
  private virtualLookTargetX = 0;
  private virtualLookTargetY = 0;
  readonly usesTouchControls: boolean;

  constructor(element: HTMLElement) {
    const compactTouchViewport =
      navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) <= 900;
    this.usesTouchControls =
      window.matchMedia('(pointer: coarse)').matches || compactTouchViewport;
    this.desktopCapture = new DesktopFlightCapture(element, this.usesTouchControls);
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressedThisFrame.add(e.code);
      this.keys.add(e.code);
      if (
        e.code === 'Tab' || e.code === 'Space' ||
        (this.desktopCapture.capturesFlightKeys && e.code === 'KeyW' && (e.ctrlKey || e.metaKey))
      ) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
      this.resetVirtualControls();
    });
    element.addEventListener('mousemove', (e) => {
      if (this.desktopCapture.isPointerLocked) {
        this.mouseDx += e.movementX;
        this.mouseDy += e.movementY;
      }
    });
    element.addEventListener('mousedown', (e) => {
      if (this.desktopCapture.captureMouseDown(e)) return;
      if (!this.buttons.has(e.button)) this.buttonsPressedThisFrame.add(e.button);
      this.buttons.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    element.addEventListener('wheel', (e) => {
      this.wheelDelta += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Capture the desktop pointer without forcing a fullscreen transition. */
  enterFlightMode(): void {
    this.desktopCapture.enter();
  }

  /** Stop capturing flight input without changing the fullscreen preference. */
  leaveFlightMode(): void {
    this.desktopCapture.leave();
  }

  /** User-invoked app fullscreen toggle; enables Keyboard Lock when available. */
  toggleFullscreen(): Promise<void> {
    return this.desktopCapture.toggleFullscreen();
  }

  requestPointerLock(): void {
    this.desktopCapture.requestPointerLock();
  }

  exitPointerLock(): void {
    this.desktopCapture.exitPointerLock();
  }

  get isPointerLocked(): boolean {
    return this.desktopCapture.isPointerLocked;
  }

  /** Test hook for the synthetic Ctrl+W regression; no allocation. */
  get capturesFlightKeys(): boolean {
    return this.desktopCapture.capturesFlightKeys;
  }

  isDown(code: string): boolean {
    return this.keys.has(code) || this.virtualKeys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  isButtonDown(button: number): boolean {
    return this.buttons.has(button) || this.virtualButtons.has(button);
  }

  wasButtonPressed(button: number): boolean {
    return this.buttonsPressedThisFrame.has(button);
  }

  /** Physical mouse delta plus a gradually accelerated touch-stick delta. */
  consumeMouseDelta(dt = 1 / 60): { dx: number; dy: number } {
    const response = 1 - Math.exp(-6 * dt);
    this.virtualLookX += (this.virtualLookTargetX - this.virtualLookX) * response;
    this.virtualLookY += (this.virtualLookTargetY - this.virtualLookY) * response;
    const d = {
      dx: this.mouseDx + curvedStick(this.virtualLookX) * 8,
      dy: this.mouseDy + curvedStick(this.virtualLookY) * 8,
    };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return d;
  }

  consumeWheel(): number {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  /** Hold/release a keyboard-equivalent action from an on-screen control. */
  setVirtualKey(code: string, down: boolean): void {
    if (down) {
      if (!this.virtualKeys.has(code) && !this.keys.has(code)) {
        this.pressedThisFrame.add(code);
      }
      this.virtualKeys.add(code);
    } else {
      this.virtualKeys.delete(code);
    }
  }

  /** Hold/release a mouse-equivalent weapon button from an on-screen control. */
  setVirtualButton(button: number, down: boolean): void {
    if (down) {
      if (!this.virtualButtons.has(button) && !this.buttons.has(button)) {
        this.buttonsPressedThisFrame.add(button);
      }
      this.virtualButtons.add(button);
    } else {
      this.virtualButtons.delete(button);
    }
  }

  /** Cycle weapons without synthesizing a browser wheel event. */
  addVirtualWheel(direction: number): void {
    this.wheelDelta += Math.sign(direction);
  }

  setVirtualMove(thrust: number, strafeX: number): void {
    this.virtualThrust = clampUnit(thrust);
    this.virtualStrafeX = clampUnit(strafeX);
  }

  setVirtualLook(x: number, y: number): void {
    this.virtualLookTargetX = clampUnit(x);
    this.virtualLookTargetY = clampUnit(y);
  }

  setVirtualVertical(value: number): void {
    this.virtualStrafeY = clampUnit(value);
  }

  setVirtualRoll(value: number): void {
    this.virtualRoll = clampUnit(value);
  }

  flightAxis(axis: 'thrust' | 'strafeX' | 'strafeY' | 'roll'): number {
    if (axis === 'thrust') return this.virtualThrust;
    if (axis === 'strafeX') return this.virtualStrafeX;
    if (axis === 'strafeY') return this.virtualStrafeY;
    return this.virtualRoll;
  }

  resetVirtualControls(): void {
    this.virtualKeys.clear();
    this.virtualButtons.clear();
    this.virtualThrust = 0;
    this.virtualStrafeX = 0;
    this.virtualStrafeY = 0;
    this.virtualRoll = 0;
    this.virtualLookX = 0;
    this.virtualLookY = 0;
    this.virtualLookTargetX = 0;
    this.virtualLookTargetY = 0;
  }

  /** Call at the end of each frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.buttonsPressedThisFrame.clear();
  }

}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function curvedStick(value: number): number {
  return Math.sign(value) * Math.pow(Math.abs(value), 1.35);
}
