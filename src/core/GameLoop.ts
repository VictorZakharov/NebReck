/**
 * Frame loop driven by requestAnimationFrame, so it runs at the display's
 * native refresh rate (144 Hz on a 144 Hz monitor). All simulation is
 * dt-based; dt is clamped so tab-switches or hitches never explode physics.
 *
 * Supports a deterministic manual-stepping mode used by the visual test
 * harness: `loop.stepManual(dt)` advances simulation + render by an exact,
 * fixed amount with no wall-clock involvement.
 */
export type TickFn = (dt: number, elapsed: number, wallDt?: number) => void;

const MAX_DT = 1 / 20;

export class GameLoop {
  /** Smoothed frames-per-second, for the HUD performance readout. */
  fps = 0;
  /** Total simulated time in seconds (wall-clock in play, exact in tests). */
  elapsed = 0;

  private running = false;
  private lastTime = 0;
  private rafId = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;

  constructor(private readonly tick: TickFn) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const frame = (now: number): void => {
      if (!this.running) return;
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(rawDt, MAX_DT);
      this.elapsed += dt;

      this.fpsAccum += rawDt;
      this.fpsFrames++;
      if (this.fpsAccum >= 0.5) {
        this.fps = this.fpsFrames / this.fpsAccum;
        this.fpsAccum = 0;
        this.fpsFrames = 0;
      }

      this.tick(dt, this.elapsed, rawDt);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Deterministic step for the test harness. Never mix with start(). */
  stepManual(dt: number): void {
    this.elapsed += dt;
    this.tick(dt, this.elapsed);
  }
}
