import { CanvasTexture, RepeatWrapping } from 'three';

/**
 * Central procedural surface textures — every previously flat-colored
 * material picks one up as map + bump. All drawing uses a FIXED-seed PRNG so
 * the visual baselines stay deterministic. Canvases are drawn once per kind;
 * textures are cached per (kind, repeat) so GPU uploads are shared.
 */
export type SurfaceKind = 'hull' | 'metal' | 'regolith' | 'rock';

const canvases = new Map<SurfaceKind, HTMLCanvasElement>();
const textures = new Map<string, CanvasTexture>();

export function getSurfaceTexture(kind: SurfaceKind, repeatX = 1, repeatY = 1): CanvasTexture {
  const key = `${kind}:${repeatX}x${repeatY}`;
  const hit = textures.get(key);
  if (hit) return hit;
  let canvas = canvases.get(kind);
  if (!canvas) {
    canvas = draw(kind);
    canvases.set(kind, canvas);
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  textures.set(key, tex);
  return tex;
}

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(kind: SurfaceKind): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const rnd = prng(kind === 'hull' ? 811 : kind === 'metal' ? 977 : kind === 'regolith' ? 1213 : 1337);

  if (kind === 'hull') {
    // Ship plating: panel grid with seams, rivets and faint brushed streaks.
    g.fillStyle = '#b7bdc5';
    g.fillRect(0, 0, 256, 256);
    const cells = 4;
    const cw = 256 / cells;
    for (let px = 0; px < cells; px++) {
      for (let py = 0; py < cells; py++) {
        const shade = (rnd() - 0.5) * 24;
        g.fillStyle = `rgba(${shade > 0 ? 255 : 0}, ${shade > 0 ? 255 : 0}, ${shade > 0 ? 255 : 0}, ${Math.abs(shade) / 255})`;
        g.fillRect(px * cw + 1, py * cw + 1, cw - 2, cw - 2);
      }
    }
    g.strokeStyle = 'rgba(46, 52, 60, 0.55)';
    g.lineWidth = 2;
    for (let i = 0; i <= cells; i++) {
      g.beginPath(); g.moveTo(i * cw, 0); g.lineTo(i * cw, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i * cw); g.lineTo(256, i * cw); g.stroke();
    }
    // Rivets at seam intersections.
    g.fillStyle = 'rgba(60, 66, 74, 0.8)';
    for (let i = 0; i <= cells; i++) {
      for (let j = 0; j <= cells; j++) {
        for (const [ox, oy] of [[6, 6], [-6, 6], [6, -6], [-6, -6]] as const) {
          g.beginPath();
          g.arc(((i * cw + ox) + 256) % 256, ((j * cw + oy) + 256) % 256, 1.6, 0, 6.28);
          g.fill();
        }
      }
    }
    // Brushed streaks.
    for (let i = 0; i < 46; i++) {
      g.strokeStyle = `rgba(255, 255, 255, ${0.02 + rnd() * 0.04})`;
      g.lineWidth = 1;
      const y = rnd() * 256;
      g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + (rnd() - 0.5) * 8); g.stroke();
    }
  } else if (kind === 'metal') {
    // Industrial wall/deck: big panels, scuffs, vent slats.
    g.fillStyle = '#aeb3ba';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      const w = 40 + rnd() * 90;
      const h = 30 + rnd() * 70;
      g.fillStyle = `rgba(0, 0, 0, ${0.04 + rnd() * 0.07})`;
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(40, 45, 52, 0.5)';
      g.lineWidth = 1.6;
      g.strokeRect(x, y, w, h);
    }
    g.strokeStyle = 'rgba(40, 45, 52, 0.6)';
    g.lineWidth = 2.2;
    for (const p of [64, 128, 192]) {
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(256, p); g.stroke();
    }
    // Scuffs + wear.
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${rnd() > 0.5 ? 255 : 20}, ${rnd() > 0.5 ? 255 : 24}, 28, ${0.03 + rnd() * 0.07})`;
      g.lineWidth = 1 + rnd() * 2;
      const x = rnd() * 256;
      const y = rnd() * 256;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 12); g.stroke();
    }
    // Vent slat clusters.
    for (let i = 0; i < 3; i++) {
      const x = rnd() * 200;
      const y = rnd() * 200;
      g.fillStyle = 'rgba(30, 34, 40, 0.6)';
      for (let s = 0; s < 4; s++) g.fillRect(x, y + s * 5, 26, 2.4);
    }
  } else if (kind === 'regolith') {
    // Planet soil: soft mottling, pebbles, broad tonal patches.
    g.fillStyle = '#b3ab99';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 12; i++) {
      const grad = g.createRadialGradient(rnd() * 256, rnd() * 256, 4, rnd() * 256, rnd() * 256, 40 + rnd() * 70);
      grad.addColorStop(0, `rgba(${rnd() > 0.5 ? 90 : 230}, ${rnd() > 0.5 ? 84 : 220}, 70, ${0.05 + rnd() * 0.06})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
    }
    for (let i = 0; i < 620; i++) {
      const shade = 100 + Math.floor(rnd() * 120);
      g.fillStyle = `rgba(${shade}, ${shade - 8}, ${shade - 22}, ${0.1 + rnd() * 0.16})`;
      g.beginPath();
      g.ellipse(rnd() * 256, rnd() * 256, 1 + rnd() * 4.5, 1 + rnd() * 4.5, rnd() * 3.14, 0, 6.28);
      g.fill();
    }
  } else {
    // Rock: speckles, micro-craters, cracks (asteroids, boulders, cave walls).
    g.fillStyle = '#a9a49c';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i++) {
      const shade = 110 + Math.floor(rnd() * 110);
      g.fillStyle = `rgba(${shade}, ${shade - 5}, ${shade - 11}, ${0.2 + rnd() * 0.22})`;
      g.beginPath();
      g.ellipse(rnd() * 256, rnd() * 256, 1 + rnd() * 6, 1 + rnd() * 6, rnd() * 3.14, 0, 6.28);
      g.fill();
    }
    for (let i = 0; i < 22; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      const r = 5 + rnd() * 13;
      g.fillStyle = 'rgba(52, 48, 43, 0.42)';
      g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
      g.strokeStyle = 'rgba(240, 235, 225, 0.5)';
      g.lineWidth = 1.8;
      g.beginPath(); g.arc(x, y, r, rnd() * 3, rnd() * 2 + 2.4); g.stroke();
    }
    g.strokeStyle = 'rgba(42, 38, 34, 0.55)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      let x = rnd() * 256;
      let y = rnd() * 256;
      g.beginPath();
      g.moveTo(x, y);
      for (let seg = 0; seg < 5; seg++) {
        x += (rnd() - 0.5) * 60;
        y += (rnd() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  return c;
}
