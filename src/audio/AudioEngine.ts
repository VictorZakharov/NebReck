/**
 * Fully procedural WebAudio: every sound is synthesized (oscillators + noise
 * buffers), so the game ships with zero audio assets. Instantiated lazily on
 * the first user gesture; every public method is safe to call before init.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineOsc: OscillatorNode | null = null;

  private musicNodes: AudioNode[] = [];
  private musicPlaying = false;
  private activeOneShots = 0;
  private readonly maxOneShots = 48;
  private lastEnemyAutogun = -Infinity;

  /** Call from a click/keydown handler; idempotent. */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    // Shared white-noise buffer.
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.startEngineHum();
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Diagnostics used by the dense-combat smoke regression. */
  get debugActiveOneShots(): number {
    return this.activeOneShots;
  }

  get debugMaxOneShots(): number {
    return this.maxOneShots;
  }

  // ---- continuous engine hum ------------------------------------------------

  private startEngineHum(): void {
    const ctx = this.ctx!;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.master!);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 120;
    this.engineFilter.connect(this.engineGain);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    noise.connect(this.engineFilter);
    noise.start();

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 42;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.35;
    this.engineOsc.connect(oscGain).connect(this.engineFilter);
    this.engineOsc.start();
  }

  /** throttle 0..1, boosting adds growl. */
  setEngine(throttle: number, boosting: boolean): void {
    if (!this.ctx || !this.engineGain || !this.engineFilter || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const vol = 0.03 + throttle * 0.1 + (boosting ? 0.08 : 0);
    this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(120 + throttle * 480 + (boosting ? 400 : 0), t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(42 + throttle * 30 + (boosting ? 18 : 0), t, 0.1);
  }

  /** Fade the continuous flight loop fully out while physically docked. */
  silenceEngine(): void {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.cancelScheduledValues(t);
    this.engineGain.gain.setTargetAtTime(0, t, 0.035);
  }

  // ---- one-shots ------------------------------------------------------------

  laser(pitch = 1): void {
    this.zap(880 * pitch, 140 * pitch, 0.14, 0.16, 'square');
  }

  /** Globally rate-limited chatter for dense rotary-fire encounters. */
  enemyAutogun(): void {
    if (!this.ctx || this.ctx.currentTime - this.lastEnemyAutogun < 0.045) return;
    this.lastEnemyAutogun = this.ctx.currentTime;
    this.zap(520, 170, 0.045, 0.055, 'square');
  }

  scatter(): void {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => this.zap(520, 90, 0.12, 0.1, 'sawtooth'), i * 12);
    }
    this.noiseBurst(0.18, 2600, 0.14);
  }

  lance(): void {
    this.zap(220, 40, 0.4, 0.22, 'sawtooth');
    this.zap(1400, 300, 0.2, 0.1, 'sine');
  }

  missileLaunch(): void {
    this.noiseBurst(0.7, 900, 0.2, 0.35);
    this.zap(300, 90, 0.5, 0.08, 'triangle');
  }

  enemyMissileLaunch(): void {
    this.noiseBurst(0.48, 720, 0.12, 0.03);
    this.zap(210, 72, 0.42, 0.07, 'sawtooth');
  }

  missileWarning(imminent: boolean): void {
    const pitch = imminent ? 1280 : 760;
    const interval = imminent ? 78 : 150;
    this.zap(pitch, pitch, 0.07, imminent ? 0.2 : 0.13, 'square');
    setTimeout(() => this.zap(pitch, pitch, 0.07, imminent ? 0.2 : 0.13, 'square'), interval);
  }

  capitalCharge(): void {
    this.zap(52, 1450, 1.95, 0.2, 'sawtooth');
    this.zap(110, 2400, 1.95, 0.09, 'sine');
  }

  capitalBeam(): void {
    this.noiseBurst(1.15, 3200, 0.55, 0.003);
    this.zap(180, 28, 1.2, 0.62, 'sawtooth');
    this.zap(2200, 120, 0.72, 0.28, 'square');
  }

  explosion(big = false): void {
    const dur = big ? 1.4 : 0.8;
    this.noiseBurst(dur, big ? 420 : 700, big ? 0.5 : 0.32);
    // Sub thump.
    this.zap(big ? 90 : 120, 30, dur * 0.7, big ? 0.5 : 0.3, 'sine');
  }

  hitShield(): void {
    this.zap(1600, 700, 0.12, 0.12, 'sine');
  }

  hitHull(): void {
    this.noiseBurst(0.16, 1800, 0.2);
    this.zap(180, 70, 0.14, 0.16, 'square');
  }

  pickup(): void {
    this.zap(660, 1320, 0.16, 0.14, 'sine');
  }

  warning(): void {
    this.zap(840, 840, 0.09, 0.14, 'square');
    setTimeout(() => this.zap(840, 840, 0.09, 0.14, 'square'), 140);
  }

  /** Rising whine while the jump drive charges. */
  jumpSpool(): void {
    this.zap(120, 900, 4.6, 0.1, 'sawtooth');
    this.zap(240, 1800, 4.6, 0.05, 'sine');
  }

  /** Arrival crack + afterglow in the new sector. */
  jumpArrive(): void {
    this.noiseBurst(0.9, 2400, 0.35);
    this.zap(1400, 90, 1.2, 0.25, 'sine');
  }

  uiHover(): void {
    this.zap(1200, 1500, 0.05, 0.05, 'sine');
  }

  uiClick(): void {
    this.zap(700, 1050, 0.09, 0.1, 'triangle');
  }

  // ---- ambient music --------------------------------------------------------

  startMusic(): void {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    const ctx = this.ctx;

    const musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.gain.setTargetAtTime(0.11, ctx.currentTime, 2.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(musicGain).connect(this.master!);

    // Slow filter sweep gives the pad motion.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 420;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    // Dm add9-ish stack, detuned saws.
    const freqs = [73.42, 110, 146.83, 220, 329.63];
    const oscs: AudioNode[] = [lfo, lfoGain, filter, musicGain];
    for (const f of freqs) {
      for (const detune of [-6, 5]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = 0.05;
        osc.connect(g).connect(filter);
        osc.start();
        oscs.push(osc, g);
      }
    }
    this.musicNodes = oscs;
  }

  stopMusic(): void {
    if (!this.musicPlaying) return;
    this.musicPlaying = false;
    for (const n of this.musicNodes) {
      if (n instanceof OscillatorNode) {
        try { n.stop(); } catch { /* already stopped */ }
      }
      n.disconnect();
    }
    this.musicNodes = [];
  }

  // ---- synth primitives -----------------------------------------------------

  private zap(
    fromHz: number,
    toHz: number,
    duration: number,
    volume: number,
    type: OscillatorType,
  ): void {
    if (!this.ctx || !this.master) return;
    const release = this.reserveOneShot();
    if (!release) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, toHz), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.master);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
      release();
    };
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private noiseBurst(duration: number, filterHz: number, volume: number, attack = 0.005): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const release = this.reserveOneShot();
    if (!release) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterHz, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterHz * 0.15), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
      release();
    };
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  private reserveOneShot(): (() => void) | null {
    if (this.activeOneShots >= this.maxOneShots) return null;
    this.activeOneShots++;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.activeOneShots--;
    };
  }
}
