import { Input } from '../core/Input';

type StickSetter = (x: number, y: number) => void;

/**
 * Dual-stick mobile flight deck. It translates pointer gestures into the same
 * Input actions used by keyboard/mouse, keeping simulation and weapon logic
 * device-agnostic. All controls use pointer capture so thumbs may slide beyond
 * a button without dropping a held action.
 */
export class TouchControls {
  readonly root: HTMLElement;
  private readonly nativeEnabled: boolean;
  private forced = false;
  private shown = false;

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.nativeEnabled = input.usesTouchControls;
    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.setAttribute('aria-label', 'Touch flight controls');
    this.root.innerHTML = `
      <div class="touch-utility" aria-label="Flight menu controls">
        <button data-touch-action="loadout" aria-label="Open engineering loadout">Load</button>
        <button data-touch-action="view" aria-label="Toggle cockpit view">View</button>
        <button data-touch-action="pause" aria-label="Pause game">Pause</button>
      </div>

      <div class="touch-left-deck">
        <div class="touch-stick touch-move-stick" data-touch-stick="move" aria-label="Thrust and strafe stick">
          <i class="touch-stick-rings"></i><b class="touch-stick-knob"></b><span>Move</span>
        </div>
        <div class="touch-maneuver" aria-label="Maneuver controls">
          <button data-touch-action="roll-left" aria-label="Roll left">Roll L</button>
          <button data-touch-action="up" aria-label="Strafe up">Up</button>
          <button data-touch-action="down" aria-label="Strafe down">Down</button>
          <button data-touch-action="roll-right" aria-label="Roll right">Roll R</button>
        </div>
        <button class="touch-boost" data-touch-action="boost" aria-label="Hold to boost">Boost</button>
      </div>

      <div class="touch-system-tray" aria-label="Ship systems">
        <button data-touch-action="cloak" aria-label="Toggle cloak">Cloak</button>
        <button data-touch-action="emp" aria-label="Fire EMP">EMP</button>
        <button data-touch-action="nano" aria-label="Use nanobot repair">Repair</button>
        <button class="touch-jump" data-touch-action="jump" aria-label="Hold to jump, land, or lift off">Hold J</button>
      </div>

      <div class="touch-right-deck">
        <div class="touch-stick touch-aim-stick" data-touch-stick="aim" aria-label="Pitch and yaw stick">
          <i class="touch-stick-rings"></i><b class="touch-stick-knob"></b><span>Aim</span>
        </div>
        <div class="touch-actions" aria-label="Weapon and interaction controls">
          <button class="touch-fire" data-touch-action="fire" aria-label="Hold to fire primary weapon">Fire</button>
          <button class="touch-seeker" data-touch-action="seeker" aria-label="Launch seeker missile">Seek</button>
          <button data-touch-action="weapon" aria-label="Cycle primary weapon">Weapon</button>
          <button data-touch-action="interact" aria-label="Hail, dock, trade, or accept">Use</button>
          <button data-touch-action="decline" aria-label="Decline contract">No</button>
        </div>
      </div>
    `;
    parent.appendChild(this.root);

    this.bindStick('move', (x, y) => this.input.setVirtualMove(-y, x));
    this.bindStick('aim', (x, y) => this.input.setVirtualLook(x, y));
    this.bindKey('roll-left', 'KeyQ');
    this.bindKey('roll-right', 'KeyE');
    this.bindKey('up', 'Space');
    this.bindKey('down', 'ControlLeft');
    this.bindKey('boost', 'ShiftLeft');
    this.bindKey('jump', 'KeyJ');
    this.bindKey('cloak', 'KeyF');
    this.bindKey('emp', 'KeyG');
    this.bindKey('nano', 'KeyH');
    this.bindKey('interact', 'KeyR');
    this.bindKey('decline', 'KeyX');
    this.bindKey('loadout', 'Tab');
    this.bindKey('view', 'KeyV');
    this.bindKey('pause', 'Escape');
    this.bindButton('fire', 0);
    this.bindButton('seeker', 2);
    this.bindWeaponCycle();

    if (this.nativeEnabled) document.documentElement.classList.add('touch-layout');
  }

  get enabled(): boolean {
    return this.nativeEnabled || this.forced;
  }

  /** Test-scene hook for deterministic desktop Chromium captures. */
  enableForTest(): void {
    this.forced = true;
    document.documentElement.classList.add('touch-layout');
  }

  setVisible(visible: boolean): void {
    const show = visible && this.enabled;
    if (show === this.shown) return;
    this.shown = show;
    this.root.classList.toggle('visible', show);
    if (!show) {
      this.input.resetVirtualControls();
      this.root.querySelectorAll('.active').forEach((element) => element.classList.remove('active'));
      this.root.querySelectorAll<HTMLElement>('.touch-stick-knob').forEach((knob) => {
        knob.style.setProperty('--stick-x', '0px');
        knob.style.setProperty('--stick-y', '0px');
      });
    }
  }

  private bindStick(name: string, set: StickSetter): void {
    const base = this.root.querySelector<HTMLElement>(`[data-touch-stick="${name}"]`)!;
    const knob = base.querySelector<HTMLElement>('.touch-stick-knob')!;
    let pointerId = -1;

    const update = (event: PointerEvent): void => {
      const rect = base.getBoundingClientRect();
      const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.34);
      let x = (event.clientX - (rect.left + rect.width * 0.5)) / radius;
      let y = (event.clientY - (rect.top + rect.height * 0.5)) / radius;
      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }
      knob.style.setProperty('--stick-x', `${x * radius}px`);
      knob.style.setProperty('--stick-y', `${y * radius}px`);
      set(x, y);
    };
    const release = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      pointerId = -1;
      base.classList.remove('active');
      knob.style.setProperty('--stick-x', '0px');
      knob.style.setProperty('--stick-y', '0px');
      set(0, 0);
      event.preventDefault();
    };
    base.addEventListener('pointerdown', (event) => {
      if (pointerId !== -1) return;
      pointerId = event.pointerId;
      base.classList.add('active');
      try { base.setPointerCapture(pointerId); } catch { /* synthetic test pointer */ }
      update(event);
      event.preventDefault();
    });
    base.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointerId) return;
      update(event);
      event.preventDefault();
    });
    base.addEventListener('pointerup', release);
    base.addEventListener('pointercancel', release);
    base.addEventListener('lostpointercapture', release);
  }

  private bindKey(action: string, code: string): void {
    this.bindHeldAction(action, (down) => this.input.setVirtualKey(code, down));
  }

  private bindButton(action: string, button: number): void {
    this.bindHeldAction(action, (down) => this.input.setVirtualButton(button, down));
  }

  private bindHeldAction(action: string, set: (down: boolean) => void): void {
    const button = this.root.querySelector<HTMLButtonElement>(`[data-touch-action="${action}"]`)!;
    let pointerId = -1;
    const release = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      pointerId = -1;
      set(false);
      button.classList.remove('active');
      event.preventDefault();
    };
    button.addEventListener('pointerdown', (event) => {
      if (pointerId !== -1) return;
      pointerId = event.pointerId;
      try { button.setPointerCapture(pointerId); } catch { /* synthetic test pointer */ }
      set(true);
      button.classList.add('active');
      event.preventDefault();
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  }

  private bindWeaponCycle(): void {
    const button = this.root.querySelector<HTMLButtonElement>('[data-touch-action="weapon"]')!;
    button.addEventListener('pointerdown', (event) => {
      this.input.addVirtualWheel(1);
      button.classList.add('active');
      event.preventDefault();
    });
    const release = (): void => button.classList.remove('active');
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
  }
}
