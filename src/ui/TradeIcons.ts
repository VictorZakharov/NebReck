const cache = new Map<string, string>();

/**
 * Painterly 96px canvas icons for merchant stock — gradients, glow and
 * highlights so the trade UI reads as ITEMS, not glyphs. Data-URLs, cached.
 */
export function getTradeIcon(offerId: string): string {
  const key = itemOf(offerId);
  const hit = cache.get(key);
  if (hit) return hit;

  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Dark vignette backplate.
  const bg = ctx.createRadialGradient(48, 44, 8, 48, 48, 52);
  bg.addColorStop(0, '#0d1b24');
  bg.addColorStop(1, '#040a10');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  if (key === 'flux') drawFluxCore(ctx);
  else if (key === 'nano') drawNanoKit(ctx);
  else if (key === 'missile') drawMissile(ctx);
  else drawCrystals(ctx);

  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

function itemOf(offerId: string): 'flux' | 'nano' | 'crystal' | 'missile' {
  if (offerId.includes('flux')) return 'flux';
  if (offerId.includes('nano')) return 'nano';
  if (offerId.includes('missile')) return 'missile';
  return 'crystal';
}

/** A seeker missile at a rakish angle: amber warhead, finned tail, exhaust. */
function drawMissile(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(48, 48);
  ctx.rotate(-0.7);
  // Exhaust glow.
  const exhaust = ctx.createRadialGradient(0, 34, 2, 0, 34, 16);
  exhaust.addColorStop(0, 'rgba(255, 200, 110, 0.95)');
  exhaust.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = exhaust;
  ctx.fillRect(-16, 18, 32, 32);
  // Body.
  const body = ctx.createLinearGradient(-6, 0, 7, 0);
  body.addColorStop(0, '#9fb0c2');
  body.addColorStop(0.5, '#e6eef6');
  body.addColorStop(1, '#7c8c9e');
  ctx.fillStyle = body;
  ctx.fillRect(-5, -18, 10, 44);
  // Warhead.
  const head = ctx.createLinearGradient(-5, -30, 5, -14);
  head.addColorStop(0, '#ffd27a');
  head.addColorStop(1, '#e08a2a');
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(5, -16);
  ctx.lineTo(-5, -16);
  ctx.closePath();
  ctx.fill();
  // Fins.
  ctx.fillStyle = '#5d6b7e';
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(s * 5, 14);
    ctx.lineTo(s * 13, 26);
    ctx.lineTo(s * 5, 26);
    ctx.closePath();
    ctx.fill();
  }
  // Accent band + highlight.
  ctx.fillStyle = '#27e8ff';
  ctx.fillRect(-5, -12, 10, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(-4, -16, 2, 38);
  ctx.restore();
}

/** A violet energy orb suspended in a containment ring. */
function drawFluxCore(ctx: CanvasRenderingContext2D): void {
  // Outer glow.
  const glow = ctx.createRadialGradient(48, 46, 4, 48, 46, 34);
  glow.addColorStop(0, 'rgba(194, 106, 255, 0.9)');
  glow.addColorStop(0.5, 'rgba(140, 60, 220, 0.35)');
  glow.addColorStop(1, 'rgba(120, 40, 200, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 96, 96);
  // Core orb.
  const orb = ctx.createRadialGradient(43, 40, 2, 48, 46, 16);
  orb.addColorStop(0, '#ffffff');
  orb.addColorStop(0.35, '#e0b0ff');
  orb.addColorStop(1, '#7a2ac0');
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(48, 46, 16, 0, Math.PI * 2);
  ctx.fill();
  // Containment ring (elliptical, in front/behind illusion).
  ctx.strokeStyle = '#9aa7b8';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.ellipse(48, 46, 27, 9, -0.5, 0.35, Math.PI + 0.9);
  ctx.stroke();
  ctx.strokeStyle = '#5d6b7e';
  ctx.beginPath();
  ctx.ellipse(48, 46, 27, 9, -0.5, Math.PI + 1.15, 0.1);
  ctx.stroke();
  // Ring end-caps.
  ctx.fillStyle = '#c8d4e2';
  for (const [x, y] of [[24, 58], [73, 35]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sparkle.
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(41, 33); ctx.lineTo(41, 41);
  ctx.moveTo(37, 37); ctx.lineTo(45, 37);
  ctx.stroke();
}

/** A stubby med-canister with a green cross and status lights. */
function drawNanoKit(ctx: CanvasRenderingContext2D): void {
  // Soft green ambience.
  const glow = ctx.createRadialGradient(48, 50, 6, 48, 50, 40);
  glow.addColorStop(0, 'rgba(53, 232, 138, 0.28)');
  glow.addColorStop(1, 'rgba(53, 232, 138, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 96, 96);
  // Canister body.
  const body = ctx.createLinearGradient(30, 0, 68, 0);
  body.addColorStop(0, '#5a6570');
  body.addColorStop(0.35, '#aab6c2');
  body.addColorStop(0.6, '#77828e');
  body.addColorStop(1, '#4a545e');
  ctx.fillStyle = body;
  roundRect(ctx, 30, 26, 36, 48, 7);
  ctx.fill();
  // Cap + base.
  ctx.fillStyle = '#39424d';
  roundRect(ctx, 33, 18, 30, 12, 4);
  ctx.fill();
  roundRect(ctx, 33, 70, 30, 8, 3);
  ctx.fill();
  // Green cross panel.
  ctx.fillStyle = '#0d2418';
  roundRect(ctx, 38, 36, 20, 20, 3);
  ctx.fill();
  ctx.fillStyle = '#35e88a';
  ctx.shadowColor = '#35e88a';
  ctx.shadowBlur = 7;
  ctx.fillRect(45, 38, 6, 16);
  ctx.fillRect(40, 43, 16, 6);
  ctx.shadowBlur = 0;
  // Status LEDs.
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i === 0 ? '#35e88a' : '#1d3a2b';
    ctx.beginPath();
    ctx.arc(40 + i * 8, 63, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Specular streak.
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(ctx, 34, 27, 5, 45, 2);
  ctx.fill();
}

/** A teal crystal cluster with inner light and facet highlights. */
function drawCrystals(ctx: CanvasRenderingContext2D): void {
  const glow = ctx.createRadialGradient(48, 58, 4, 48, 56, 40);
  glow.addColorStop(0, 'rgba(46, 230, 200, 0.5)');
  glow.addColorStop(1, 'rgba(46, 230, 200, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 96, 96);
  // Rock base.
  ctx.fillStyle = '#233038';
  ctx.beginPath();
  ctx.moveTo(20, 78); ctx.lineTo(34, 68); ctx.lineTo(62, 66);
  ctx.lineTo(78, 76); ctx.lineTo(72, 84) ; ctx.lineTo(26, 84);
  ctx.closePath();
  ctx.fill();
  // Crystal shards (each: two-tone facets).
  const shard = (x: number, base: number, w: number, h: number, lean: number): void => {
    const tipX = x + lean;
    const tipY = base - h;
    // Dark facet.
    ctx.fillStyle = '#0f6e60';
    ctx.beginPath();
    ctx.moveTo(x - w, base); ctx.lineTo(tipX, tipY); ctx.lineTo(x, base);
    ctx.closePath();
    ctx.fill();
    // Lit facet.
    ctx.fillStyle = '#4df0d4';
    ctx.beginPath();
    ctx.moveTo(x, base); ctx.lineTo(tipX, tipY); ctx.lineTo(x + w, base);
    ctx.closePath();
    ctx.fill();
    // Tip sparkle.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(tipX, tipY + 2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  };
  shard(38, 72, 8, 34, -4);
  shard(52, 70, 10, 46, 3);
  shard(64, 74, 7, 26, 7);
  shard(30, 76, 6, 20, -7);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
