const cache = new Map<string, string>();

/**
 * Canvas-drawn 64px line-art icons for the crafting recipes — glowing sci-fi
 * glyphs matching the HUD language. Returned as data URLs, cached per id.
 */
export function getRecipeIcon(recipeId: string): string {
  const hit = cache.get(recipeId);
  if (hit) return hit;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;

  const color =
    recipeId === 'nanobot-kit' ? '#35e88a'
    : recipeId === 'shield-cell' || recipeId === 'shield-matrix' ? '#27e8ff'
    : recipeId === 'weapon-amp' ? '#ff6a3d'
    : recipeId === 'missile-rack' ? '#ffb347'
    : '#c26aff';

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';

  switch (recipeId) {
    case 'nanobot-kit': {
      // Med-cross in a capsule with swarm dots.
      ctx.strokeRect(16, 20, 32, 24);
      ctx.beginPath();
      ctx.moveTo(26, 32); ctx.lineTo(38, 32);
      ctx.moveTo(32, 26); ctx.lineTo(32, 38);
      ctx.stroke();
      for (const [dx, dy] of [[12, 14], [52, 16], [50, 50], [14, 48]] as const) {
        ctx.beginPath();
        ctx.arc(dx, dy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'missile-rack': {
      // Twin missiles, side by side.
      for (const ox of [-9, 9]) {
        ctx.beginPath();
        ctx.moveTo(c + ox, 12);
        ctx.lineTo(c + ox + 4, 20);
        ctx.lineTo(c + ox + 4, 42);
        ctx.lineTo(c + ox + 8, 50);
        ctx.moveTo(c + ox, 12);
        ctx.lineTo(c + ox - 4, 20);
        ctx.lineTo(c + ox - 4, 42);
        ctx.lineTo(c + ox - 8, 50);
        ctx.moveTo(c + ox - 4, 42); ctx.lineTo(c + ox + 4, 42);
        ctx.stroke();
      }
      break;
    }
    case 'shield-cell': {
      // Shield chevron with an energy bolt.
      ctx.beginPath();
      ctx.moveTo(c, 10);
      ctx.lineTo(50, 20); ctx.lineTo(50, 36);
      ctx.quadraticCurveTo(50, 50, c, 56);
      ctx.quadraticCurveTo(14, 50, 14, 36);
      ctx.lineTo(14, 20); ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(36, 22); ctx.lineTo(28, 34); ctx.lineTo(34, 34); ctx.lineTo(27, 45);
      ctx.stroke();
      break;
    }
    case 'weapon-amp': {
      // Crosshair with power chevrons.
      ctx.beginPath();
      ctx.arc(c, c, 15, 0, Math.PI * 2);
      ctx.moveTo(c, 8); ctx.lineTo(c, 20);
      ctx.moveTo(c, 44); ctx.lineTo(c, 56);
      ctx.moveTo(8, c); ctx.lineTo(20, c);
      ctx.moveTo(44, c); ctx.lineTo(56, c);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(27, 29); ctx.lineTo(32, 24); ctx.lineTo(37, 29);
      ctx.moveTo(27, 37); ctx.lineTo(32, 32); ctx.lineTo(37, 37);
      ctx.stroke();
      break;
    }
    case 'engine-tune': {
      // Thruster bell with flame.
      ctx.beginPath();
      ctx.moveTo(24, 12); ctx.lineTo(40, 12);
      ctx.lineTo(44, 30); ctx.lineTo(20, 30); ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(26, 34); ctx.quadraticCurveTo(32, 50, 32, 54);
      ctx.quadraticCurveTo(32, 50, 38, 34);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(29, 34); ctx.quadraticCurveTo(32, 42, 32, 45);
      ctx.quadraticCurveTo(32, 42, 35, 34);
      ctx.stroke();
      break;
    }
    case 'shield-matrix': {
      // Hex lattice.
      const hex = (x: number, y: number, r: number): void => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const px = x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      };
      hex(c, c, 16);
      hex(c - 14, c - 9, 8);
      hex(c + 14, c + 9, 8);
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(c, c, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const url = canvas.toDataURL('image/png');
  cache.set(recipeId, url);
  return url;
}
