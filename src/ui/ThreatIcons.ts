const cache = new Map<string, string>();

/**
 * Canvas-drawn 48px threat-tier glyphs for the hangar difficulty buttons:
 * rookie = training shield, veteran = crossed blades, reckoning = skull.
 */
export function getThreatIcon(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;

  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;

  const color = id === 'rookie' ? '#35e88a' : id === 'veteran' ? '#ffb347' : '#ff3b30';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (id === 'rookie') {
    // Training shield with a single pip.
    ctx.beginPath();
    ctx.moveTo(c, 7);
    ctx.lineTo(38, 14);
    ctx.lineTo(38, 26);
    ctx.quadraticCurveTo(38, 36, c, 42);
    ctx.quadraticCurveTo(10, 36, 10, 26);
    ctx.lineTo(10, 14);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, 24, 3.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === 'veteran') {
    // Crossed blades.
    for (const s of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(c - s * 14, 8);
      ctx.lineTo(c + s * 12, 36);
      ctx.stroke();
      // Hilt.
      ctx.beginPath();
      ctx.moveTo(c + s * 7, 33);
      ctx.lineTo(c + s * 15, 27);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c + s * 15, 39, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Skull.
    ctx.beginPath();
    ctx.arc(c, 21, 13, Math.PI * 0.95, Math.PI * 0.05);
    ctx.lineTo(31, 34);
    ctx.lineTo(17, 34);
    ctx.closePath();
    ctx.stroke();
    for (const ex of [-5.5, 5.5]) {
      ctx.beginPath();
      ctx.arc(c + ex, 21, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const tx of [-4.5, 0, 4.5]) {
      ctx.beginPath();
      ctx.moveTo(c + tx, 34);
      ctx.lineTo(c + tx, 40);
      ctx.stroke();
    }
  }

  const url = canvas.toDataURL('image/png');
  cache.set(id, url);
  return url;
}
