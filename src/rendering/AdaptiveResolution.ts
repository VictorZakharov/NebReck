export interface ResolutionDiagnostics {
  pixelRatio: number;
  minPixelRatio: number;
  maxPixelRatio: number;
  bufferPixels: number;
  renderScale: number;
  estimatedFps: number;
}

const INITIAL_PIXEL_BUDGET = 1920 * 1080;
const MIN_PIXEL_BUDGET = 1280 * 720;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MIN_PIXEL_RATIO = 0.25;
const SLOW_FRAME = 1 / 52;
const FAST_FRAME = 1 / 58;
const DOWNSHIFT_HOLD = 0.8;
const RECOVERY_HOLD = 4;

export function initialRenderPixelRatio(width: number, height: number, dpr: number): number {
  const bounds = resolutionBounds(width, height, dpr);
  return roundRatio(clamp(
    Math.sqrt(INITIAL_PIXEL_BUDGET / bounds.cssPixels),
    bounds.min,
    bounds.max,
  ));
}

/** Adaptive framebuffer sizing; CSS HUD/layout remain at native resolution. */
export class AdaptiveResolution {
  private width = 1;
  private height = 1;
  private devicePixelRatio = 1;
  private minRatio = 1;
  private maxRatio = 1;
  private ratio = 1;
  private frameEma = 0;
  private slowFor = 0;
  private fastFor = 0;

  constructor(width: number, height: number, dpr: number) {
    this.reset(width, height, dpr);
  }

  get pixelRatio(): number {
    return this.ratio;
  }

  reset(width: number, height: number, dpr: number): boolean {
    const previous = this.ratio;
    this.setViewport(width, height, dpr);
    this.ratio = initialRenderPixelRatio(this.width, this.height, this.devicePixelRatio);
    this.clearTiming();
    return Math.abs(previous - this.ratio) > 1e-4;
  }

  /** Preserve current framebuffer workload across fullscreen/resize changes. */
  resize(width: number, height: number, dpr: number): boolean {
    const previous = this.ratio;
    const previousPixels = this.width * this.height * this.ratio * this.ratio;
    this.setViewport(width, height, dpr);
    this.ratio = roundRatio(clamp(
      Math.sqrt(previousPixels / (this.width * this.height)),
      this.minRatio,
      this.maxRatio,
    ));
    this.clearTiming();
    return Math.abs(previous - this.ratio) > 1e-4;
  }

  /** Returns true only when the renderer should reallocate at a new ratio. */
  sampleFrame(wallDt: number): boolean {
    if (!Number.isFinite(wallDt) || wallDt <= 0 || wallDt > 0.1) return false;
    const blend = 1 - Math.exp(-wallDt * 4);
    this.frameEma = this.frameEma === 0
      ? wallDt
      : this.frameEma + (wallDt - this.frameEma) * blend;

    if (this.frameEma > SLOW_FRAME) {
      this.slowFor += wallDt;
      this.fastFor = 0;
      if (this.slowFor < DOWNSHIFT_HOLD || this.ratio <= this.minRatio) return false;
      this.ratio = roundRatio(Math.max(this.minRatio, this.ratio * 0.85));
      this.slowFor = 0;
      return true;
    }
    if (this.frameEma < FAST_FRAME) {
      this.fastFor += wallDt;
      this.slowFor = 0;
      if (this.fastFor < RECOVERY_HOLD || this.ratio >= this.maxRatio) return false;
      this.ratio = roundRatio(Math.min(this.maxRatio, this.ratio * 1.08));
      this.fastFor = 0;
      return true;
    }
    this.slowFor = 0;
    this.fastFor = 0;
    return false;
  }

  diagnostics(): ResolutionDiagnostics {
    return {
      pixelRatio: this.ratio,
      minPixelRatio: this.minRatio,
      maxPixelRatio: this.maxRatio,
      bufferPixels: Math.round(this.width * this.height * this.ratio * this.ratio),
      renderScale: Number((this.ratio / this.devicePixelRatio).toFixed(3)),
      estimatedFps: this.frameEma > 0 ? Number((1 / this.frameEma).toFixed(1)) : 0,
    };
  }

  /** Non-mutating policy probe used by diagnostics and smoke coverage. */
  probe(width: number, height: number, dpr: number): {
    initial: ResolutionDiagnostics;
    resized: ResolutionDiagnostics;
    overloaded: ResolutionDiagnostics;
    recovered: ResolutionDiagnostics;
  } {
    const probe = new AdaptiveResolution(width, height, dpr);
    const initial = probe.diagnostics();
    const resizedProbe = new AdaptiveResolution(width, height, dpr);
    resizedProbe.resize(width * 0.75, height * 0.75, dpr);
    const resized = resizedProbe.diagnostics();
    for (let frame = 0; frame < 80; frame++) probe.sampleFrame(1 / 40);
    const overloaded = probe.diagnostics();
    for (let frame = 0; frame < 600; frame++) probe.sampleFrame(1 / 120);
    return { initial, resized, overloaded, recovered: probe.diagnostics() };
  }

  private setViewport(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.devicePixelRatio = Math.max(MIN_PIXEL_RATIO, Math.min(dpr || 1, MAX_DEVICE_PIXEL_RATIO));
    const bounds = resolutionBounds(this.width, this.height, this.devicePixelRatio);
    this.minRatio = bounds.min;
    this.maxRatio = bounds.max;
  }

  private clearTiming(): void {
    this.frameEma = 0;
    this.slowFor = 0;
    this.fastFor = 0;
  }
}

function resolutionBounds(width: number, height: number, dpr: number): {
  cssPixels: number;
  min: number;
  max: number;
} {
  const cssPixels = Math.max(1, width * height);
  const max = Math.max(MIN_PIXEL_RATIO, Math.min(dpr || 1, MAX_DEVICE_PIXEL_RATIO));
  const min = Math.min(max, Math.max(MIN_PIXEL_RATIO, Math.sqrt(MIN_PIXEL_BUDGET / cssPixels)));
  return { cssPixels, min, max };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}
