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

/** Thin bright ring with soft edges — explosion shockwave sprite. */
export function getRingTexture(): CanvasTexture {
  if (ringTexture) return ringTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.62, 'rgba(255,255,255,0)');
  grad.addColorStop(0.78, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.86, 'rgba(255,255,255,0.35)');
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
