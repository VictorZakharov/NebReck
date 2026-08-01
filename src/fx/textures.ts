import { CanvasTexture } from 'three';

const blobCache = new Map<number, CanvasTexture>();

/**
 * Cloudy nebula-blob sprite for fog banks: dozens of soft overlapping puffs
 * instead of one radial gradient, so banks read as volume, not billboards.
 * Deterministic per seed.
 */
export function getNebulaBlobTexture(seed: number): CanvasTexture {
  const cached = blobCache.get(seed);
  if (cached) return cached;
  let state = (seed * 2654435761) >>> 0;
  const rand = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 46; i++) {
    // Cluster puffs toward the center with jitter.
    const a = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 1.6) * size * 0.34;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r * 0.8;
    const pr = 14 + rand() * 46;
    const alpha = 0.05 + rand() * 0.09;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, pr);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new CanvasTexture(canvas);
  blobCache.set(seed, tex);
  return tex;
}

let glowTexture: CanvasTexture | null = null;
let ringTexture: CanvasTexture | null = null;
let smokeTexture: CanvasTexture | null = null;

/**
 * Irregular cloudy alpha used by both hot fireball lobes and normal-blended
 * smoke. The fixed value-noise field keeps visual captures deterministic.
 */
export function getSmokeTexture(): CanvasTexture {
  if (smokeTexture) return smokeTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) / size) * 2 - 1;
      const py = ((y + 0.5) / size) * 2 - 1;
      const radius = Math.hypot(px, py);
      const angle = Math.atan2(py, px);
      const curl = Math.sin(angle * 3 + radius * 8) * 0.12;
      const nx = (px + curl * py) * 2.2 + 5.7;
      const ny = (py - curl * px) * 2.2 + 9.3;
      let noise = 0;
      let amplitude = 0.58;
      let frequency = 1;
      for (let octave = 0; octave < 4; octave++) {
        noise += valueNoise(nx * frequency, ny * frequency) * amplitude;
        amplitude *= 0.5;
        frequency *= 2.03;
      }
      const brokenRadius = radius + (noise - 0.55) * 0.3;
      const edge = 1 - smoothstep(0.36, 1.02, brokenRadius);
      const alpha = Math.max(0, Math.min(1, edge * (0.42 + noise * 0.82)));
      const offset = (y * size + x) * 4;
      image.data[offset] = 255;
      image.data[offset + 1] = 255;
      image.data[offset + 2] = 255;
      image.data[offset + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  smokeTexture = new CanvasTexture(canvas);
  return smokeTexture;
}

/** Thin bright ring with soft edges — explosion shockwave sprite. */
export function getRingTexture(): CanvasTexture {
  if (ringTexture) return ringTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.68, 'rgba(255,255,255,0)');
  grad.addColorStop(0.77, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.83, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ringTexture = new CanvasTexture(canvas);
  return ringTexture;
}

/** Shared soft radial glow sprite texture (white core → transparent edge). */
export function getGlowTexture(): CanvasTexture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new CanvasTexture(canvas);
  return glowTexture;
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = noiseHash(x0, y0);
  const b = noiseHash(x0 + 1, y0);
  const c = noiseHash(x0, y0 + 1);
  const d = noiseHash(x0 + 1, y0 + 1);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

function noiseHash(x: number, y: number): number {
  let value = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ 0x68bc21eb;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967295;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
