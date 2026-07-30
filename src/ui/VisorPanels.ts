import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';

export interface VisorAnchor {
  ax: 'left' | 'right' | 'center';
  ay: 'top' | 'bottom';
  mx: number;
  my: number;
}

interface Panel {
  el: HTMLElement;
  mesh: Mesh;
  material: MeshBasicMaterial;
  wPx: number;
  hPx: number;
  /** Transparent texture space reserved for content that protrudes left. */
  bleedLeft: number;
  anchor: VisorAnchor;
  curveKey: string;
  rasterEpoch: number;
}

interface RasterImage {
  el: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  objectFit: string;
}

const dir = new Vector3();
const ndc = new Vector2();
const HARDPOINT_TOOLTIP_BLEED = 260;

function reportVisor(stage: string, details: Record<string, string | number> = {}): void {
  if (window.location.hostname !== '127.0.0.1') return;
  const query = new URLSearchParams(
    Object.entries(details).map(([key, value]) => [key, String(value)]),
  );
  void fetch(`http://127.0.0.1:8124/${stage}?${query}`, {
    cache: 'no-store',
    mode: 'no-cors',
  }).catch(() => undefined);
}

/**
 * The REAL helmet visor: hangar UI panels are painted into clean canvas
 * textures on CONVEX meshes — edges genuinely curve, because the surface does —
 * head-locked and projected by the game camera. The source DOM stays alive
 * (invisible) for layout + interactivity; clicks are raycast from the curved
 * surface back into it.
 */
export class VisorPanels {
  readonly scene = new Scene();
  private panels: Panel[] = [];
  private readonly raycaster = new Raycaster();
  private readonly imageCache = new Map<string, HTMLImageElement>();
  private mountEpoch = 0;
  private hovered: HTMLElement | null = null;

  constructor(private readonly onTextureReady: () => void = () => undefined) {}

  /** Shared helmet depth as a fraction of the shorter viewport dimension. */
  private readonly visorSag = 0.06;

  mount(specs: { el: HTMLElement; anchor: VisorAnchor }[]): void {
    this.unmount();
    this.mountEpoch++;
    reportVisor('mount', { panels: specs.length, epoch: this.mountEpoch });
    for (const spec of specs) {
      const el = spec.el;
      el.classList.add('visor-src'); // kept in DOM, invisible, hit-testable
      // Flex columns can visibly overflow their assigned box. Capture the
      // complete content bounds so bottom controls and their labels are not
      // cut off at offsetHeight.
      const contentWidth = Math.ceil(Math.max(el.offsetWidth, el.scrollWidth));
      const hPx = Math.ceil(Math.max(el.offsetHeight, el.scrollHeight));
      // Hardpoint help belongs in the open space to the left of slot 1. Give
      // the right visor sheet a transparent gutter so that help can protrude
      // beyond the DOM panel without being clipped by its canvas texture.
      const bleedLeft = el.matches('.hangar-right') ? HARDPOINT_TOOLTIP_BLEED : 0;
      const wPx = contentWidth + bleedLeft;
      reportVisor('panel', {
        name: [...el.classList].filter((name) => name !== 'visor-src').join('.'),
        width: wPx,
        height: hPx,
      });
      // This is one tessellated patch of the shared viewport-wide visor.
      const geo = new PlaneGeometry(wPx, hPx, 24, 10);
      const material = new MeshBasicMaterial({
        transparent: true,
        toneMapped: false,
        depthTest: false,
        depthWrite: false,
      });
      material.visible = false; // until the raster lands
      const mesh = new Mesh(geo, material);
      mesh.renderOrder = 100;
      this.scene.add(mesh);
      const panel: Panel = {
        el,
        mesh,
        material,
        wPx,
        hPx,
        bleedLeft,
        anchor: spec.anchor,
        curveKey: '',
        rasterEpoch: 0,
      };
      this.panels.push(panel);
      void this.rasterize(panel);
    }
  }

  unmount(): void {
    this.hovered?.classList.remove('visor-hover');
    this.hovered = null;
    for (const p of this.panels) {
      p.rasterEpoch++;
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.material.map?.dispose();
      p.material.dispose();
      p.el.classList.remove('visor-src');
    }
    this.panels = [];
  }

  get active(): boolean {
    return this.panels.length > 0;
  }

  /** Head-lock the curved sheets each frame: margin-based anchors (so every
   *  viewport fits), rigid to the camera — world rotation never moves them. */
  place(cam: PerspectiveCamera, viewportW: number, viewportH: number): void {
    const tanV = Math.tan((cam.fov * Math.PI) / 360);
    const tanH = tanV * cam.aspect;
    const d = viewportH / 2 / tanV;
    for (const p of this.panels) {
      const a = p.anchor;
      const cx =
        a.ax === 'left' ? a.mx + p.wPx / 2
        : a.ax === 'right' ? viewportW - a.mx - p.wPx / 2
        : viewportW / 2 + a.mx;
      const cy = a.ay === 'top' ? a.my + p.hPx / 2 : viewportH - a.my - p.hPx / 2;
      this.curvePanelOnSharedVisor(p, cx, cy, viewportW, viewportH);
      const ndcX = (cx / viewportW) * 2 - 1;
      const ndcY = -((cy / viewportH) * 2 - 1);
      // Plane units are CSS pixels. Keeping the base sheet exactly `d` from
      // the eye makes one geometry unit project to one screen pixel at the
      // viewport center. Do not normalize this vector: doing so brings side
      // panels closer to the eye and makes them balloon on wide screens.
      dir.set(ndcX * tanH * d, ndcY * tanV * d, -d);
      dir.applyQuaternion(cam.quaternion);
      p.mesh.position.copy(cam.position).add(dir);
      p.mesh.quaternion.copy(cam.quaternion); // screen-aligned; the GEOMETRY curves
      p.mesh.updateMatrixWorld(true);
    }
  }

  /**
   * Sample one screen-centred, outward-bulging visor for every panel. Vertex
   * depth is based on viewport position, never on an individual panel centre.
   */
  private curvePanelOnSharedVisor(
    panel: Panel,
    centerX: number,
    centerY: number,
    viewportW: number,
    viewportH: number,
  ): void {
    const curveKey = `${viewportW}:${viewportH}:${centerX}:${centerY}`;
    if (curveKey === panel.curveKey) return;

    const position = panel.mesh.geometry.attributes.position;
    const halfW = viewportW / 2;
    const halfH = viewportH / 2;
    const sag = Math.min(viewportW, viewportH) * this.visorSag;
    for (let i = 0; i < position.count; i++) {
      const screenX = centerX + position.getX(i);
      const screenY = centerY - position.getY(i);
      const nx = (screenX - halfW) / halfW;
      const ny = (screenY - halfH) / halfH;

      // From inside a helmet, the outward dome's centre is farthest from the
      // eye while the perimeter wraps closer. Clamp the rim so no corner
      // crosses back through the base surface.
      // A helmet visor wraps much more across the face than forehead-to-chin.
      // Keeping the vertical term restrained prevents a tall side stack from
      // appearing to reverse its twist above and below the screen midpoint.
      const dome = Math.max(0, 1 - 0.88 * nx * nx - 0.12 * ny * ny);
      position.setZ(i, -sag * dome);
    }
    position.needsUpdate = true;
    panel.mesh.geometry.computeBoundingBox();
    panel.mesh.geometry.computeBoundingSphere();
    panel.curveKey = curveKey;
  }

  /** Raycast a client-space pointer into the source DOM; returns the hit
   *  interactive element (button/card), or null. */
  hitTest(clientX: number, clientY: number, cam: PerspectiveCamera): HTMLElement | null {
    cam.updateMatrixWorld();
    this.place(cam, window.innerWidth, window.innerHeight);
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, cam);
    const hits = this.raycaster.intersectObjects(this.panels.map((p) => p.mesh), false);
    for (const hit of hits) {
      if (!hit.uv) continue;
      const panel = this.panels.find((p) => p.mesh === hit.object);
      if (!panel) continue;
      const px = hit.uv.x * panel.wPx - panel.bleedLeft;
      const py = (1 - hit.uv.y) * panel.hPx;
      // Manual hit-test against the (invisible) source DOM's layout. Iterate
      // through every mesh hit because a transparent bleed may sit in front
      // of another interactive visor sheet.
      const rootRect = panel.el.getBoundingClientRect();
      const clickables = panel.el.querySelectorAll<HTMLElement>('button, .ship-card, [data-tip]');
      let best: HTMLElement | null = null;
      for (const c of clickables) {
        const r = c.getBoundingClientRect();
        const lx = r.left - rootRect.left;
        const ly = r.top - rootRect.top;
        if (px >= lx && px <= lx + r.width && py >= ly && py <= ly + r.height) best = c;
      }
      if (best) return best;
    }
    return null;
  }

  /** Update the interactive point on the curved surface and refresh the
   * texture only when hover changes. */
  updatePointer(clientX: number, clientY: number, cam: PerspectiveCamera): HTMLElement | null {
    const next = this.hitTest(clientX, clientY, cam);
    if (next === this.hovered) return next;
    const previous = this.hovered;
    previous?.classList.remove('visor-hover');
    this.hovered = next;
    if (next) {
      next.classList.add('visor-hover');
      next.dispatchEvent(new MouseEvent('mouseenter'));
    }
    const affected = this.panels.filter(
      (panel) =>
        (previous !== null && panel.el.contains(previous)) ||
        (next !== null && panel.el.contains(next)),
    );
    this.refresh(affected);
    return next;
  }

  /** Forward a screen-space click to the live DOM control behind the texture. */
  click(clientX: number, clientY: number, cam: PerspectiveCamera): boolean {
    const target = this.hitTest(clientX, clientY, cam);
    if (!target) return false;
    target.click();
    return true;
  }

  private refresh(panels: Panel[]): void {
    for (const panel of panels) void this.rasterize(panel);
  }

  /**
   * Paint only when UI state changes. This direct renderer stays
   * origin-clean and avoids any multi-second DOM-clone work.
   */
  private async rasterize(panel: Panel): Promise<void> {
    const epoch = ++panel.rasterEpoch;
    const panelName = [...panel.el.classList].filter((name) => name !== 'visor-src').join('.');
    reportVisor('raster-start', { name: panelName, epoch });
    const rootRect = panel.el.getBoundingClientRect();
    const sourceImages = [...panel.el.querySelectorAll<HTMLImageElement>('img')];
    await Promise.all(sourceImages.map((img) => this.decodeImage(img)));
    if (epoch !== panel.rasterEpoch || !this.panels.includes(panel)) return;

    const scale = 2; // supersample for crisp text on the curved sheet
    const canvas = document.createElement('canvas');
    canvas.width = panel.wPx * scale;
    canvas.height = panel.hPx * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    this.paintElement(ctx, panel.el, rootRect, true, panel.bleedLeft);
    reportVisor('canvas-painted', { name: panelName, images: sourceImages.length });

    panel.material.map?.dispose();
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    panel.material.map = texture;
    panel.material.needsUpdate = true;
    panel.material.visible = true;
    reportVisor('texture-ready', { name: panelName, images: sourceImages.length });
    this.onTextureReady();
  }

  private paintElement(
    ctx: CanvasRenderingContext2D,
    el: HTMLElement,
    rootRect: DOMRect,
    isRoot = false,
    originX = 0,
  ): void {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = rect.left - rootRect.left + originX;
    const y = rect.top - rootRect.top;
    const showTooltip = el.matches('.hardpoint-chip[data-tip].visor-hover');

    ctx.save();
    if (!isRoot) ctx.globalAlpha *= Number(style.opacity);
    this.clipElement(ctx, style, x, y, rect.width, rect.height);
    this.paintElementBox(ctx, style, x, y, rect.width, rect.height);

    if (el instanceof HTMLImageElement) {
      this.drawRasterImage(ctx, {
        el,
        x,
        y,
        width: rect.width,
        height: rect.height,
        objectFit: style.objectFit,
      });
    } else {
      for (const child of el.childNodes) {
        if (child instanceof HTMLElement) this.paintElement(ctx, child, rootRect, false, originX);
        else if (child.nodeType === Node.TEXT_NODE) {
          this.paintText(ctx, child, el, rootRect, originX);
        }
      }
    }

    ctx.restore();
    // Draw outside the chip's opacity/clip context. In particular, the
    // intentionally muted "No rack" label must not fade its help plate.
    if (showTooltip) this.paintTooltip(ctx, el, rootRect, originX);
  }

  private paintElementBox(
    ctx: CanvasRenderingContext2D,
    style: CSSStyleDeclaration,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    if (!this.isTransparent(style.backgroundColor)) {
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(x, y, width, height);
    }
    this.paintBackgroundImage(ctx, style.backgroundImage, x, y, width, height);

    const top = Number.parseFloat(style.borderTopWidth);
    const right = Number.parseFloat(style.borderRightWidth);
    const bottom = Number.parseFloat(style.borderBottomWidth);
    const left = Number.parseFloat(style.borderLeftWidth);
    if (top > 0 && !this.isTransparent(style.borderTopColor)) {
      ctx.fillStyle = style.borderTopColor;
      ctx.fillRect(x, y, width, top);
    }
    if (right > 0 && !this.isTransparent(style.borderRightColor)) {
      ctx.fillStyle = style.borderRightColor;
      ctx.fillRect(x + width - right, y, right, height);
    }
    if (bottom > 0 && !this.isTransparent(style.borderBottomColor)) {
      ctx.fillStyle = style.borderBottomColor;
      ctx.fillRect(x, y + height - bottom, width, bottom);
    }
    if (left > 0 && !this.isTransparent(style.borderLeftColor)) {
      ctx.fillStyle = style.borderLeftColor;
      ctx.fillRect(x, y, left, height);
    }
  }

  private paintBackgroundImage(
    ctx: CanvasRenderingContext2D,
    background: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    if (background === 'none') return;
    const colors = background.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}|transparent/gi);
    if (!colors || colors.length < 2) return;

    let gradient: CanvasGradient;
    if (background.startsWith('radial-gradient')) {
      gradient = ctx.createRadialGradient(
        x + width / 2,
        y + height / 2,
        0,
        x + width / 2,
        y + height / 2,
        Math.max(width, height) / 2,
      );
    } else {
      const angle = Number.parseFloat(/linear-gradient\(([-\d.]+)deg/.exec(background)?.[1] ?? '180');
      const radians = (angle * Math.PI) / 180;
      const dx = Math.sin(radians);
      const dy = -Math.cos(radians);
      const extent = Math.abs(dx) * width + Math.abs(dy) * height;
      gradient = ctx.createLinearGradient(
        x + width / 2 - (dx * extent) / 2,
        y + height / 2 - (dy * extent) / 2,
        x + width / 2 + (dx * extent) / 2,
        y + height / 2 + (dy * extent) / 2,
      );
    }
    colors.forEach((color, index) => gradient.addColorStop(index / (colors.length - 1), color));
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
  }

  private paintText(
    ctx: CanvasRenderingContext2D,
    node: Node,
    parent: HTMLElement,
    rootRect: DOMRect,
    originX: number,
  ): void {
    const text = node.textContent ?? '';
    if (!text.trim()) return;
    const style = getComputedStyle(parent);
    const fontSize = Number.parseFloat(style.fontSize);
    if (fontSize <= 0 || this.isTransparent(style.color)) return;

    ctx.fillStyle = style.color;
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    const range = document.createRange();
    const letterSpacing = Number.parseFloat(style.letterSpacing);
    for (const match of text.matchAll(/\S+/g)) {
      const raw = match[0];
      const start = match.index;
      range.setStart(node, start);
      range.setEnd(node, start + raw.length);
      const rect = range.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const word =
        style.textTransform === 'uppercase'
          ? raw.toUpperCase()
          : style.textTransform === 'lowercase'
            ? raw.toLowerCase()
            : raw;
      const baseline = rect.top - rootRect.top + (rect.height - fontSize) / 2 + fontSize * 0.82;
      let x = rect.left - rootRect.left + originX;
      if (!Number.isFinite(letterSpacing) || letterSpacing === 0) {
        ctx.fillText(word, x, baseline);
        continue;
      }
      for (const char of word) {
        ctx.fillText(char, x, baseline);
        x += ctx.measureText(char).width + letterSpacing;
      }
    }
    range.detach();
  }

  private clipElement(
    ctx: CanvasRenderingContext2D,
    style: CSSStyleDeclaration,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const clip = style.clipPath;
    if (clip.startsWith('polygon(')) {
      const points = clip.slice(8, -1).split(',');
      ctx.beginPath();
      points.forEach((point, index) => {
        const match =
          /^\s*(calc\([^)]+\)|[-\d.]+(?:px|%|))\s+(calc\([^)]+\)|[-\d.]+(?:px|%|))\s*$/.exec(
            point,
          );
        if (!match) return;
        const px = x + this.resolveCssCoordinate(match[1], width);
        const py = y + this.resolveCssCoordinate(match[2], height);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.clip();
      return;
    }
    if (
      style.overflowX === 'hidden' ||
      style.overflowX === 'clip' ||
      style.overflowY === 'hidden' ||
      style.overflowY === 'clip'
    ) {
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();
    }
  }

  private resolveCssCoordinate(value: string, size: number): number {
    const calc = /^calc\(([-\d.]+)%\s*([+-])\s*([-\d.]+)px\)$/.exec(value);
    if (calc) {
      const base = (Number(calc[1]) / 100) * size;
      const offset = Number(calc[3]);
      return calc[2] === '-' ? base - offset : base + offset;
    }
    if (value.endsWith('%')) return (Number.parseFloat(value) / 100) * size;
    return Number.parseFloat(value);
  }

  private paintTooltip(
    ctx: CanvasRenderingContext2D,
    el: HTMLElement,
    rootRect: DOMRect,
    originX: number,
  ): void {
    const text = el.dataset.tip;
    if (!text) return;
    const row = el.closest<HTMLElement>('.hardpoint-row');
    const firstChip = row?.querySelector<HTMLElement>('.hardpoint-chip');
    const rect = (firstChip ?? el).getBoundingClientRect();
    const contentWidth = 250;
    const paddingX = 13;
    const paddingY = 10;
    const lineHeight = 20.5;
    ctx.font = `500 14px ${getComputedStyle(el).fontFamily}`;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    for (const word of words) {
      const candidate = lines.length > 0 ? `${lines[lines.length - 1]} ${word}` : word;
      if (lines.length > 0 && ctx.measureText(candidate).width > contentWidth) lines.push(word);
      else if (lines.length > 0) lines[lines.length - 1] = candidate;
      else lines.push(word);
    }
    const boxWidth = contentWidth + paddingX * 2;
    const boxHeight = lines.length * lineHeight + paddingY * 2;
    // Every chip uses one stable help position: immediately left of slot 1.
    // This keeps the description clear and avoids a tooltip that jumps as the
    // pointer crosses the hardpoint row.
    const anchorLeft = rect.left - rootRect.left + originX;
    const x = Math.max(4, anchorLeft - 12 - boxWidth);
    const centerY = rect.top - rootRect.top + rect.height / 2;
    const y = Math.max(4, Math.min(rootRect.height - boxHeight - 4, centerY - boxHeight / 2));
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(2, 8, 14, 0.995)';
    ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(39, 232, 255, 0.72)';
    ctx.strokeRect(x + 0.5, y + 0.5, boxWidth - 1, boxHeight - 1);
    // Match the secondary copy in the ship cards instead of reading as a
    // bright-white foreign overlay.
    ctx.fillStyle = 'rgba(215, 244, 255, 0.8)';
    ctx.textBaseline = 'top';
    lines.forEach((line, index) => ctx.fillText(line, x + paddingX, y + paddingY + index * lineHeight));
    ctx.restore();
  }

  private isTransparent(color: string): boolean {
    return color === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(color);
  }

  private async decodeImage(img: HTMLImageElement): Promise<void> {
    const src = img.currentSrc || img.src;
    const cached = this.imageCache.get(src);
    if (cached?.complete && cached.naturalWidth > 0) return;
    if (img.complete && img.naturalWidth > 0) {
      this.imageCache.set(src, img);
      return;
    }
    try {
      await img.decode();
      if (img.naturalWidth > 0) this.imageCache.set(src, img);
    } catch (error) {
      console.warn('[VisorPanels] Panel image could not be decoded', {
        alt: img.alt,
        error,
      });
    }
  }

  private drawRasterImage(ctx: CanvasRenderingContext2D, image: RasterImage): void {
    const { el, x, y, width, height, objectFit } = image;
    const source = this.imageCache.get(el.currentSrc || el.src) ?? el;
    const naturalWidth = source.naturalWidth;
    const naturalHeight = source.naturalHeight;
    if (naturalWidth <= 0 || naturalHeight <= 0 || width <= 0 || height <= 0) return;

    let drawX = x;
    let drawY = y;
    let drawWidth = width;
    let drawHeight = height;
    if (objectFit === 'cover' || objectFit === 'contain') {
      const scale =
        objectFit === 'cover'
          ? Math.max(width / naturalWidth, height / naturalHeight)
          : Math.min(width / naturalWidth, height / naturalHeight);
      drawWidth = naturalWidth * scale;
      drawHeight = naturalHeight * scale;
      drawX += (width - drawWidth) / 2;
      drawY += (height - drawHeight) / 2;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  }
}
