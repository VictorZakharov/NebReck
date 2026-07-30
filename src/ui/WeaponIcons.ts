const cache = new Map<string, string>();

/**
 * Canvas-drawn 56px line-art weapon glyphs for the hangar hardpoint chips —
 * colors match each weapon's bolt color in flight. Data URLs, cached.
 */
export function getWeaponIcon(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;

  const size = 96; // drawn large, displayed at ~42px — crisp and detailed
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(size / 56, size / 56); // glyphs authored in 56-unit space
  const c = 28;

  const color =
    id === 'pulse' ? '#40e6ff'
    : id === 'autogun' ? '#ffe68c'
    : id === 'scatter' ? '#ff9e2e'
    : id === 'lance' ? '#b866ff'
    : '#ffb347'; // seeker

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';

  switch (id) {
    case 'pulse': {
      // Twin staggered bolts leaving barrel housings.
      for (const [ox, oy] of [[-7, 4], [7, -4]] as const) {
        ctx.strokeRect(c + ox - 3, c + oy + 12, 6, 8); // housing
        ctx.beginPath();
        ctx.moveTo(c + ox, c + oy + 10);
        ctx.lineTo(c + ox, c + oy - 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(c + ox, c + oy - 16, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'autogun': {
      // Rotary barrel cluster, front view.
      ctx.beginPath();
      ctx.arc(c, c, 16, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * 9, c + Math.sin(a) * 9, 3.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(c, c, 2, 0, Math.PI * 2);
      ctx.fill();
      // Spin-up motion arc + hub bolts.
      ctx.beginPath();
      ctx.arc(c, c, 21, -0.6, 1.1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * 4.5, c + Math.sin(a) * 4.5, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'scatter': {
      // Fan of pellets from a flared throat.
      ctx.beginPath();
      ctx.moveTo(c - 6, c + 24);
      ctx.lineTo(c - 4, c + 14);
      ctx.lineTo(c + 4, c + 14);
      ctx.lineTo(c + 6, c + 24);
      ctx.stroke();
      for (let i = -2; i <= 2; i++) {
        const a = -Math.PI / 2 + i * 0.34;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * 6, c + 14 + Math.sin(a) * 6);
        ctx.lineTo(c + Math.cos(a) * 22, c + 14 + Math.sin(a) * 22);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * 25, c + 14 + Math.sin(a) * 25, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'lance': {
      // One long charged beam with capacitor rings.
      ctx.beginPath();
      ctx.moveTo(c, c + 20);
      ctx.lineTo(c, c - 20);
      ctx.stroke();
      for (const ry of [12, 17]) {
        ctx.beginPath();
        ctx.ellipse(c, c + ry, 6, 2.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(c, c - 10);
      ctx.lineTo(c + 4.5, c);
      ctx.lineTo(c, c + 10);
      ctx.lineTo(c - 4.5, c);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default: {
      // Seeker missile silhouette.
      ctx.beginPath();
      ctx.moveTo(c, c - 20);
      ctx.lineTo(c + 5, c - 8);
      ctx.lineTo(c + 5, c + 10);
      ctx.lineTo(c + 11, c + 19);
      ctx.moveTo(c, c - 20);
      ctx.lineTo(c - 5, c - 8);
      ctx.lineTo(c - 5, c + 10);
      ctx.lineTo(c - 11, c + 19);
      ctx.moveTo(c - 5, c + 10);
      ctx.lineTo(c + 5, c + 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c, c + 16, 2.4, 0, Math.PI * 2);
      ctx.fill();
      // Exhaust plume.
      for (const [px, len] of [[-2.2, 5], [0, 8], [2.2, 5]] as const) {
        ctx.beginPath();
        ctx.moveTo(c + px, c + 21);
        ctx.lineTo(c + px, c + 21 + len);
        ctx.stroke();
      }
      break;
    }
  }

  const url = canvas.toDataURL('image/png');
  cache.set(id, url);
  return url;
}
