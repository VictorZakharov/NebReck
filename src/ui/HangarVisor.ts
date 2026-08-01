import { PerspectiveCamera, WebGLRenderer } from 'three';
import { initialRenderPixelRatio } from '../rendering/AdaptiveResolution';
import { VisorAnchor, VisorPanels } from './VisorPanels';

/**
 * Owns the hangar's curved visor renderer and all pointer/orbit interaction.
 * Game only decides when the hangar is active; this class handles presentation.
 */
export class HangarVisor {
  private readonly renderer: WebGLRenderer;
  private readonly panels: VisorPanels;
  private renderQueued = false;
  private drag = false;
  private panelPress = false;
  private yaw = 0;
  private lift = 0;
  private zoom = 10.5;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
    private readonly camera: PerspectiveCamera,
    private readonly isHangarActive: () => boolean,
  ) {
    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(initialRenderPixelRatio(
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio,
    ));
    this.panels = new VisorPanels(() => this.scheduleRender());

    const element = this.renderer.domElement;
    element.style.position = 'absolute';
    element.style.inset = '0';
    element.style.pointerEvents = 'none';
    element.style.zIndex = '5';
    element.setAttribute('aria-hidden', 'true');
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    uiRoot.parentElement?.insertBefore(element, uiRoot);

    this.bindPointerControls();
  }

  get active(): boolean {
    return this.panels.active;
  }

  get orbitYaw(): number {
    return this.yaw;
  }

  get orbitLift(): number {
    return this.lift;
  }

  get orbitRadius(): number {
    return this.zoom;
  }

  private bindPointerControls(): void {
    document.addEventListener('mousedown', (event) => {
      this.panelPress = false;
      if (!this.isHangarActive()) return;
      if (this.panels.hitTest(event.clientX, event.clientY, this.camera)) {
        this.panelPress = true;
        return;
      }
      if ((event.target as HTMLElement).closest?.('button, .ship-card, .ns-panel')) return;
      this.drag = true;
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.isHangarActive()) return;
      const hit = this.panels.updatePointer(event.clientX, event.clientY, this.camera);
      this.canvas.style.cursor = hit ? 'pointer' : this.drag ? 'grabbing' : 'grab';
      if (!this.drag) return;
      this.yaw -= event.movementX * 0.007;
      this.lift = Math.max(-2.5, Math.min(5, this.lift + event.movementY * 0.02));
    });
    document.addEventListener('mouseup', () => {
      this.drag = false;
    });
    document.addEventListener('click', (event) => {
      const forwardPanelClick = this.panelPress;
      this.panelPress = false;
      if (!this.isHangarActive()) return;
      // The menu's Hangar click changes state before it finishes bubbling to
      // document. Only forward a click whose own mousedown began on an already
      // active visor panel, never the transition click that opened the screen.
      if (!forwardPanelClick) return;
      // Synthetic clicks forwarded by VisorPanels bubble through document.
      if (event.composedPath().some(
        (node) => node instanceof HTMLElement && node.classList.contains('visor-src'),
      )) return;
      if (this.panels.click(event.clientX, event.clientY, this.camera)) event.preventDefault();
    });
    document.addEventListener('contextmenu', (event) => {
      if (this.isHangarActive()) event.preventDefault();
    });
    document.addEventListener(
      'wheel',
      (event) => {
        if (!this.isHangarActive()) return;
        this.zoom = Math.max(6.5, Math.min(19, this.zoom + Math.sign(event.deltaY) * 1.1));
      },
      { passive: true },
    );
  }

  /** Capture responsive DOM anchors before hiding/rasterizing the sources. */
  mount(): void {
    this.unmount();
    const definitions: [string, VisorAnchor['ax'], VisorAnchor['ay'], number][] = [
      ['.hangar-stats', 'left', 'top', 0],
      ['.hangar-right', 'right', 'top', -36],
      ['.hangar-ships', 'left', 'bottom', 0],
      ['.hangar-actions', 'right', 'bottom', 0],
    ];
    const specs: { el: HTMLElement; anchor: VisorAnchor }[] = [];
    for (const [selector, ax, ay, offsetY] of definitions) {
      const element = this.uiRoot.querySelector<HTMLElement>(selector);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      specs.push({
        el: element,
        anchor: {
          ax,
          ay,
          mx:
            ax === 'left'
              ? rect.left
              : ax === 'right'
                ? window.innerWidth - rect.right
                : rect.left + rect.width / 2 - window.innerWidth / 2,
          my: (ay === 'top' ? rect.top : window.innerHeight - rect.bottom) + offsetY,
        },
      });
    }
    this.panels.mount(specs);
    this.place();
  }

  unmount(): void {
    this.panels.unmount();
    this.renderer.clear();
    this.canvas.style.cursor = '';
  }

  place(): void {
    if (!this.panels.active) return;
    this.panels.place(this.camera, window.innerWidth, window.innerHeight);
  }

  render(): void {
    if (!this.isHangarActive() || !this.panels.active) return;
    this.camera.updateMatrixWorld();
    this.place();
    this.renderer.render(this.panels.scene, this.camera);
  }

  scheduleRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  resize(
    width: number,
    height: number,
    pixelRatio: number,
    layoutChanged: boolean,
    ratioChanged: boolean,
  ): void {
    if (ratioChanged) this.renderer.setPixelRatio(pixelRatio);
    if (layoutChanged) this.renderer.setSize(width, height);
  }
}
