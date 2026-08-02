import { DesktopFlightCapture } from './DesktopFlightCapture';

export interface InputControlGate {
  keys?: readonly string[];
  buttons?: readonly number[];
  move?: boolean;
  look?: boolean;
  wheel?: boolean;
}

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
  private carriedKeyPresses = new Set<string>();
  private carriedButtonPresses = new Set<number>();
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
  private lookIntentThisFrame = false;
  private controlGate: InputControlGate | null = null;
  readonly usesTouchControls: boolean;

  constructor(element: HTMLElement) {
    const compactTouchViewport =
      navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) <= 900;
    this.usesTouchControls =
      window.matchMedia('(pointer: coarse)').matches || compactTouchViewport;
    this.desktopCapture = new DesktopFlightCapture(element, this.usesTouchControls);
    window.addEventListener('keydown', (e) => {
      if (!e.repeat && !this.keys.has(e.code)) this.pressedThisFrame.add(e.code); // autorepeat is not a fresh action
      this.keys.add(e.code);
      if (
        e.code === 'Tab' || e.code === 'Space' ||
        (this.desktopCapture.capturesFlightKeys &&
          (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) ||
        (this.desktopCapture.capturesFlightKeys && e.code === 'KeyW' && (e.ctrlKey || e.metaKey))
      ) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
      this.carriedKeyPresses.clear();
      this.carriedButtonPresses.clear();
      this.resetVirtualControls();
    });
    element.addEventListener('mousemove', (e) => {
      if (this.desktopCapture.isPointerLocked) {
        this.mouseDx += e.movementX;
        this.mouseDy += e.movementY;
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 0.5) {
          this.lookIntentThisFrame = true;
        }
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
    if (!this.keyAllowed(code)) return false;
    return this.keys.has(code) || this.virtualKeys.has(code);
  }

  wasPressed(code: string): boolean {
    if (!this.keyAllowed(code)) return false;
    return this.pressedThisFrame.has(code);
  }

  isButtonDown(button: number): boolean {
    if (!this.buttonAllowed(button)) return false;
    return this.buttons.has(button) || this.virtualButtons.has(button);
  }

  wasButtonPressed(button: number): boolean {
    if (!this.buttonAllowed(button)) return false;
    return this.buttonsPressedThisFrame.has(button);
  }

  /** Physical mouse delta plus a gradually accelerated touch-stick delta. */
  consumeMouseDelta(dt = 1 / 60): { dx: number; dy: number } {
    if (this.controlGate && !this.controlGate.look) {
      this.mouseDx = 0;
      this.mouseDy = 0;
      return { dx: 0, dy: 0 };
    }
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
    if (this.controlGate && !this.controlGate.wheel) {
      this.wheelDelta = 0;
      return 0;
    }
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
    if (Math.abs(x) + Math.abs(y) > 0.08) this.lookIntentThisFrame = true;
  }

  setVirtualVertical(value: number): void {
    this.virtualStrafeY = clampUnit(value);
  }

  setVirtualRoll(value: number): void {
    this.virtualRoll = clampUnit(value);
  }

  flightAxis(axis: 'thrust' | 'strafeX' | 'strafeY' | 'roll'): number {
    if (this.controlGate && !this.controlGate.move) return 0;
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

  /** Whether a mouse or touch-stick gesture is waiting to turn the ship. */
  hasLookIntent(): boolean {
    if (this.controlGate && !this.controlGate.look) return false;
    return this.lookIntentThisFrame ||
      Math.abs(this.mouseDx) + Math.abs(this.mouseDy) > 0.5 ||
      Math.abs(this.virtualLookTargetX) + Math.abs(this.virtualLookTargetY) > 0.08;
  }

  /** Restrict the live tutorial to only the controls taught by its current lesson. */
  setControlGate(gate: InputControlGate | null, preserveHeld = false): void {
    this.controlGate = gate;
    if (!preserveHeld) {
      this.keys.clear();
      this.buttons.clear();
      this.pressedThisFrame.clear();
      this.buttonsPressedThisFrame.clear();
      this.carriedKeyPresses.clear();
      this.carriedButtonPresses.clear();
      this.mouseDx = 0;
      this.mouseDy = 0;
      this.lookIntentThisFrame = false;
      this.wheelDelta = 0;
      this.resetVirtualControls();
      return;
    }
    this.keys = filtered(this.keys, (code) => this.keyAllowed(code));
    this.virtualKeys = filtered(this.virtualKeys, (code) => this.keyAllowed(code));
    this.buttons = filtered(this.buttons, (button) => this.buttonAllowed(button));
    this.virtualButtons = filtered(this.virtualButtons, (button) => this.buttonAllowed(button));
    this.pressedThisFrame = filtered(this.pressedThisFrame, (code) => this.keyAllowed(code));
    this.buttonsPressedThisFrame = filtered(
      this.buttonsPressedThisFrame,
      (button) => this.buttonAllowed(button),
    );
    this.carriedKeyPresses = new Set([...this.keys, ...this.virtualKeys, ...this.pressedThisFrame]);
    this.carriedButtonPresses = new Set([
      ...this.buttons,
      ...this.virtualButtons,
      ...this.buttonsPressedThisFrame,
    ]);
    if (!gate?.look) {
      this.mouseDx = 0;
      this.mouseDy = 0;
      this.virtualLookX = 0;
      this.virtualLookY = 0;
      this.virtualLookTargetX = 0;
      this.virtualLookTargetY = 0;
    }
    if (!gate?.move) {
      this.virtualThrust = 0;
      this.virtualStrafeX = 0;
      this.virtualStrafeY = 0;
      this.virtualRoll = 0;
    }
    if (!gate?.wheel) this.wheelDelta = 0;
  }

  /** Call at the end of each frame. */
  endFrame(): void {
    this.pressedThisFrame = this.carriedKeyPresses;
    this.buttonsPressedThisFrame = this.carriedButtonPresses;
    this.carriedKeyPresses = new Set<string>();
    this.carriedButtonPresses = new Set<number>();
    this.lookIntentThisFrame = false;
  }

  private keyAllowed(code: string): boolean {
    return !this.controlGate || this.controlGate.keys?.includes(code) === true;
  }

  private buttonAllowed(button: number): boolean {
    return !this.controlGate || this.controlGate.buttons?.includes(button) === true;
  }

}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function curvedStick(value: number): number {
  return Math.sign(value) * Math.pow(Math.abs(value), 1.35);
}

function filtered<T>(values: Set<T>, predicate: (value: T) => boolean): Set<T> {
  return new Set([...values].filter(predicate));
}
