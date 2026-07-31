import { CanvasTexture, Color } from 'three';

export interface CockpitInfo {
  weaponName: string;
  energyFrac: number;
  seekersReadyFrac: number; // 1 = ready
  targetName: string | null;
  targetDistance: number;
  shield: number;
  shieldMax: number;
  hull: number;
  hullMax: number;
  speed: number;
  boostFrac: number;
  alert: number;
  sector: number;
  scrap: number;
  crystal: number;
  flux: number;
}

/**
 * The cockpit's three console displays, drawn from LIVE game state — target
 * data in the middle, armament on the left, ship systems on the right (the
 * Everspace signature: cockpit UI that is actually useful). Redraws are
 * throttled by simulated time so they're cheap in play and deterministic in
 * the test harness.
 */
export class CockpitDisplays {
  readonly center: CanvasTexture;
  readonly left: CanvasTexture;
  readonly right: CanvasTexture;

  private readonly centerCtx: CanvasRenderingContext2D;
  private readonly leftCtx: CanvasRenderingContext2D;
  private readonly rightCtx: CanvasRenderingContext2D;
  private readonly accentCss: string;
  private redrawTimer = 0;

  constructor(accent: number) {
    this.accentCss = `#${new Color(accent).getHexString()}`;
    const make = (w: number, h: number): [CanvasTexture, CanvasRenderingContext2D] => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      return [new CanvasTexture(canvas), ctx];
    };
    [this.center, this.centerCtx] = make(320, 180);
    [this.left, this.leftCtx] = make(256, 144);
    [this.right, this.rightCtx] = make(256, 144);
  }

  /** Call each frame with sim dt; redraws at ~8 Hz. `force` for scene setup. */
  update(dt: number, info: CockpitInfo, force = false): void {
    this.redrawTimer -= dt;
    if (!force && this.redrawTimer > 0) return;
    this.redrawTimer = 0.12;
    this.drawCenter(info);
    this.drawLeft(info);
    this.drawRight(info);
    this.center.needsUpdate = true;
    this.left.needsUpdate = true;
    this.right.needsUpdate = true;
  }

  /** The three canvases are unique to one player hull, not shared caches. */
  dispose(): void {
    this.center.dispose();
    this.left.dispose();
    this.right.dispose();
  }

  // ---- painters -------------------------------------------------------------

  private frame(ctx: CanvasRenderingContext2D, title: string): void {
    const { width: w, height: h } = ctx.canvas;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#030709');
    grad.addColorStop(1, '#061019');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = this.accentCss;
    ctx.shadowColor = this.accentCss;
    ctx.shadowBlur = 5;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = this.accentCss;
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, 20);
    ctx.globalAlpha = 1;
  }

  private bar(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number,
    frac: number, color: string,
  ): void {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 9);
    ctx.globalAlpha = 0.95;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 9);
    ctx.globalAlpha = 1;
  }

  private drawCenter(info: CockpitInfo): void {
    const ctx = this.centerCtx;
    this.frame(ctx, 'TARGET DATA · SHIP STATUS');
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px monospace';
    ctx.shadowBlur = 6;
    if (info.targetName) {
      ctx.fillStyle = '#ffb347';
      ctx.shadowColor = '#ffb347';
      ctx.fillText(info.targetName.toUpperCase(), 160, 48);
      ctx.font = '13px monospace';
      ctx.fillText(`${Math.round(info.targetDistance)} m`, 160, 68);
    } else {
      ctx.fillStyle = 'rgba(200,230,255,0.5)';
      ctx.shadowBlur = 0;
      ctx.fillText('— NO TARGET —', 160, 56);
    }
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.font = '11px monospace';
    ctx.fillStyle = '#9fdcff';
    ctx.fillText(`SHD ${Math.ceil(info.shield)}`, 22, 100);
    this.bar(ctx, 90, 92, 200, info.shield / info.shieldMax, '#27e8ff');
    ctx.fillStyle = '#a8f5c9';
    ctx.fillText(`HUL ${Math.ceil(info.hull)}`, 22, 124);
    this.bar(ctx, 90, 116, 200, info.hull / info.hullMax, '#35e88a');
    ctx.fillStyle = '#e8d8ff';
    ctx.fillText(`SPD ${Math.round(info.speed)}`, 22, 148);
    this.bar(ctx, 90, 140, 200, info.boostFrac, '#c26aff');
    // Scanline pass.
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#000';
    for (let y = 0; y < 180; y += 4) ctx.fillRect(0, y, 320, 1);
    ctx.globalAlpha = 1;
  }

  private drawLeft(info: CockpitInfo): void {
    const ctx = this.leftCtx;
    this.frame(ctx, 'ARMAMENT');
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(info.weaponName.toUpperCase(), 18, 52);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#ffcf8a';
    ctx.fillText('ENERGY', 18, 78);
    this.bar(ctx, 84, 70, 150, info.energyFrac, '#ffa73d');
    const ready = info.seekersReadyFrac >= 1;
    ctx.fillStyle = ready ? '#8aff9f' : 'rgba(255,255,255,0.4)';
    ctx.fillText(ready ? 'SEEKERS  OK' : `SEEKERS  ${Math.round(info.seekersReadyFrac * 100)}%`, 18, 106);
    ctx.fillStyle = '#9fdcff';
    ctx.fillText(`SECTOR ${info.sector}   ALERT ${info.alert}`, 18, 128);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#000';
    for (let y = 0; y < 144; y += 4) ctx.fillRect(0, y, 256, 1);
    ctx.globalAlpha = 1;
  }

  private drawRight(info: CockpitInfo): void {
    const ctx = this.rightCtx;
    this.frame(ctx, 'HOLD · SYSTEMS');
    ctx.textAlign = 'left';
    ctx.font = '11px monospace';
    ctx.fillStyle = '#ffa040';
    ctx.fillText(`▲ SCRAP    ${info.scrap}`, 20, 52);
    ctx.fillStyle = '#2ee6c8';
    ctx.fillText(`◆ CRYSTAL  ${info.crystal}`, 20, 74);
    ctx.fillStyle = '#c26aff';
    ctx.fillText(`✦ FLUX     ${info.flux}`, 20, 96);
    ctx.fillStyle = '#e8d8ff';
    ctx.fillText('BOOST', 20, 124);
    this.bar(ctx, 84, 116, 150, info.boostFrac, '#c26aff');
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#000';
    for (let y = 0; y < 144; y += 4) ctx.fillRect(0, y, 256, 1);
    ctx.globalAlpha = 1;
  }
}
