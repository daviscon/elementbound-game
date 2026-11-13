// Code-drawn art: platforms, props, gates, pickups, button glyphs and move icons.
// Everything uses the same recipe as the painted sheets: dark ink outline, flat fills.
import { INK, ELEMENTS, MOVES, MOVE_ORDER } from './config.js';
import { Kits } from './kits.js';

export const FONT = '"Avenir Next", "Futura", "Trebuchet MS", "Segoe UI", sans-serif';
export const font = (px, weight = 700) => `${weight} ${px}px ${FONT}`;

export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
export function inked(ctx, fill, lw = 5, ink = INK) {
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.lineJoin = 'round'; ctx.stroke();
}
export function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// --- terrain ---------------------------------------------------------------------
// Solids are drawn in passes so touching rectangles share one outline.
export function drawSolids(ctx, solids, pal, view) {
  const vis = solids.filter((s) => s.x < view.x + view.w + 20 && s.x + s.w > view.x - 20 && s.y < view.y + view.h + 20 && s.y + s.h > view.y - 20);
  ctx.fillStyle = pal.ink;
  for (const s of vis) ctx.fillRect(s.x - 5, s.y - 5, s.w + 10, s.h + 10);
  for (const s of vis) {
    ctx.fillStyle = pal.fill;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    // block courses
    ctx.save();
    ctx.beginPath(); ctx.rect(s.x, s.y, s.w, s.h); ctx.clip();
    ctx.strokeStyle = pal.line; ctx.lineWidth = 3;
    ctx.beginPath();
    const y0 = Math.ceil((s.y + 30) / 64) * 64;
    for (let y = y0, row = 0; y < s.y + s.h; y += 64, row++) {
      ctx.moveTo(s.x, y); ctx.lineTo(s.x + s.w, y);
      const off = (Math.round(y / 64) % 2) * 80;
      for (let x = Math.floor(s.x / 160) * 160 + off; x < s.x + s.w; x += 160) {
        if (hash(x, y) < 0.3) continue;
        ctx.moveTo(x, y - 64); ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.fillStyle = pal.shade;
    ctx.fillRect(s.x, s.y + s.h - 14, s.w, 14);
    ctx.restore();
  }
  // top caps (skip parts buried under another solid)
  for (const s of vis) {
    if (s.y <= 0) continue;
    let a = s.x, b = s.x + s.w;
    for (const o of vis) {
      if (o === s || !(o.y < s.y && o.y + o.h > s.y)) continue;
      if (o.x <= a && o.x + o.w > a) a = Math.min(b, o.x + o.w);
      if (o.x < b && o.x + o.w >= b) b = Math.max(a, o.x);
    }
    if (b - a < 4) continue;
    ctx.fillStyle = pal.top;
    ctx.fillRect(a, s.y, b - a, Math.min(16, s.h));
    ctx.fillStyle = pal.ink;
    ctx.fillRect(a, s.y + Math.min(16, s.h), b - a, 3);
  }
}

export function drawOneway(ctx, o, pal) {
  if (o.style === 'rope') {
    ctx.strokeStyle = pal.ink; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y - 70); ctx.quadraticCurveTo(o.x + o.w / 2, o.y - 30, o.x + o.w, o.y - 70);
    for (let x = o.x + 30; x < o.x + o.w; x += 55) {
      const k = (x - o.x) / o.w, sag = o.y - 70 + 40 * 4 * k * (1 - k);
      ctx.moveTo(x, sag); ctx.lineTo(x, o.y);
    }
    ctx.stroke();
    for (let x = o.x; x < o.x + o.w - 1; x += 50) {
      rr(ctx, x + 2, o.y, Math.min(46, o.x + o.w - x - 2), 16, 3);
      inked(ctx, hash(x, o.y) > 0.5 ? '#a7794e' : '#946a44', 4, pal.ink);
    }
    return;
  }
  rr(ctx, o.x, o.y, o.w, 20, 5); inked(ctx, '#a7794e', 5, pal.ink);
  ctx.fillStyle = '#c99a66'; ctx.fillRect(o.x + 6, o.y + 3, o.w - 12, 5);
  ctx.fillStyle = pal.ink;
  for (const x of [o.x + 18, o.x + o.w - 26]) { ctx.fillRect(x, o.y + 20, 8, 26); }
}

export function drawHazard(ctx, h, t, front) {
  if (h.t === 'water') {
    if (!front) {
      ctx.fillStyle = 'rgba(40,110,140,0.55)'; ctx.fillRect(h.x, h.y, h.w, h.h);
      return;
    }
    ctx.fillStyle = 'rgba(70,150,180,0.42)';
    ctx.beginPath(); ctx.moveTo(h.x, h.y + h.h); ctx.lineTo(h.x, h.y);
    for (let x = 0; x <= h.w; x += 20) ctx.lineTo(h.x + x, h.y + Math.sin(x * 0.045 + t * 2.4) * 5);
    ctx.lineTo(h.x + h.w, h.y + h.h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(225,250,250,0.9)'; ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = 0; x <= h.w; x += 20) { const y = h.y + Math.sin(x * 0.045 + t * 2.4) * 5; x ? ctx.lineTo(h.x + x, y) : ctx.moveTo(h.x + x, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(225,250,250,0.35)'; ctx.lineWidth = 3;
    for (let i = 0; i < h.w / 180; i++) {
      const x = h.x + ((i * 180 + t * 60) % h.w), y = h.y + 40 + (i % 3) * 38;
      if (y < h.y + h.h - 10) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.min(h.x + h.w, x + 60), y); ctx.stroke(); }
    }
  } else if (h.t === 'thorns' && !front) {
    for (let x = h.x; x < h.x + h.w - 10; x += 40) {
      const k = hash(x, h.y), top = h.y - 6 - k * 14;
      poly(ctx, [x, h.y + h.h, x + 20, top, x + 40, h.y + h.h]); inked(ctx, k > 0.5 ? '#5d3b4c' : '#70485a', 4);
    }
  } else if (h.t === 'fire' && !front) {
    ctx.fillStyle = '#5a1d14'; ctx.fillRect(h.x, h.y + h.h - 18, h.w, 18);
    for (let x = h.x + 4; x < h.x + h.w - 20; x += 34) {
      const k = hash(x, 3), fl = Math.sin(t * 9 + k * 20) * 10, top = h.y - 14 - k * 22 + fl;
      poly(ctx, [x, h.y + h.h, x + 6, h.y + 20, x + 17, top, x + 28, h.y + 18, x + 34, h.y + h.h]); inked(ctx, '#f0742a', 4, '#7a2412');
      poly(ctx, [x + 9, h.y + h.h, x + 17, top + 26, x + 25, h.y + h.h]); ctx.fillStyle = '#ffd36b'; ctx.fill();
    }
  }
}

// Cracked floor slab (Earth Slam) and thornwood wall (Fire Blast).
export function drawGate(ctx, g, pal, t) {
  if (g.t === 'crack') {
    if (g.open) return;
    ctx.save();
    const j = g.shakeT > 0 ? Math.sin(t * 90) * 4 : 0;
    ctx.translate(j, 0);
    rr(ctx, g.x, g.y, g.w, g.h, 4); inked(ctx, pal.top, 5, pal.ink);
    ctx.strokeStyle = pal.ink; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    const cx = g.x + g.w / 2;
    ctx.moveTo(cx - 70, g.y + 2); ctx.lineTo(cx - 48, g.y + 22); ctx.lineTo(cx - 62, g.y + g.h - 2);
    ctx.moveTo(cx - 48, g.y + 22); ctx.lineTo(cx - 10, g.y + 14); ctx.lineTo(cx + 8, g.y + 34); ctx.lineTo(cx - 4, g.y + g.h - 2);
    ctx.moveTo(cx + 8, g.y + 34); ctx.lineTo(cx + 52, g.y + 20); ctx.lineTo(cx + 44, g.y + 2);
    ctx.moveTo(cx + 52, g.y + 20); ctx.lineTo(cx + 84, g.y + 36); ctx.lineTo(cx + 78, g.y + g.h - 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  // branch wall: woven thornwood. burn: 0 (fresh) .. 1 (ash)
  if (g.open) return;
  const b = g.burn || 0;
  ctx.save();
  ctx.beginPath(); ctx.rect(g.x - 60, g.y, g.w + 120, g.h * (1 - b * 0.15)); ctx.clip();
  const char = (c1, c2) => (b > 0 ? mix(c1, c2, Math.min(1, b * 1.4)) : c1);
  const drop = b * b * 60;
  for (let i = 0; i < 5; i++) {
    const x = g.x + 8 + i * (g.w - 16) / 4, sway = Math.sin(i * 2.1) * 16;
    ctx.beginPath();
    ctx.moveTo(x, g.y + g.h);
    ctx.bezierCurveTo(x + sway, g.y + g.h * 0.66, x - sway, g.y + g.h * 0.33, x + sway * 0.5, g.y - 4 + drop);
    ctx.lineWidth = 22; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
    ctx.lineWidth = 13; ctx.strokeStyle = char(i % 2 ? '#7a5238' : '#8c6243', '#2b2023'); ctx.stroke();
  }
  for (let y = g.y + 30; y < g.y + g.h - 10; y += 56) {
    const k = hash(g.x, y), dir = k > 0.5 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(g.x - 14, y + dir * 14); ctx.quadraticCurveTo(g.x + g.w / 2, y - dir * 18, g.x + g.w + 14, y + dir * 10);
    ctx.lineWidth = 16; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 8; ctx.strokeStyle = char('#9b7450', '#3a2a2a'); ctx.stroke();
    // thorns
    for (const sx of [-1, 1]) {
      const tx = sx < 0 ? g.x - 10 : g.x + g.w + 10;
      poly(ctx, [tx, y - 10, tx + sx * 30, y - 2 + k * 10, tx, y + 10]); inked(ctx, char('#6b4a36', '#2b2023'), 4);
    }
  }
  ctx.restore();
  if (b > 0) {
    // flames climbing the wall, then embers
    const n = Math.ceil(g.h / 46);
    for (let i = 0; i < n; i++) {
      const k = hash(i, g.x), up = (i / n);
      if (up > b * 1.6 + 0.15) continue;
      const fx = g.x + g.w / 2 + (k - 0.5) * (g.w + 40), fy = g.y + g.h - up * g.h;
      const s = (34 + k * 30) * (1 - b * 0.5) * (0.8 + 0.3 * Math.sin(t * 14 + i * 1.7));
      flame(ctx, fx, fy, s, t + i);
    }
  }
}
export function flame(ctx, x, y, s, t = 0) {
  const w = Math.sin(t * 11) * s * 0.12;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.45, y);
  ctx.quadraticCurveTo(x - s * 0.55, y - s * 0.6, x + w, y - s * 1.25);
  ctx.quadraticCurveTo(x + s * 0.55, y - s * 0.6, x + s * 0.45, y);
  ctx.closePath();
  inked(ctx, '#f0742a', 4, '#7a2412');
  ctx.beginPath();
  ctx.moveTo(x - s * 0.22, y);
  ctx.quadraticCurveTo(x - s * 0.25, y - s * 0.4, x + w * 0.6, y - s * 0.75);
  ctx.quadraticCurveTo(x + s * 0.25, y - s * 0.4, x + s * 0.22, y);
  ctx.closePath(); ctx.fillStyle = '#ffd36b'; ctx.fill();
}
export function mix(c1, c2, k) {
  const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const a = p(c1), b = p(c2);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
}

// --- props -------------------------------------------------------------------------
export function drawStone(ctx, x, y, t, lit) {
  // meditation stone: a flat round boulder with a spiral, soft glow when near
  if (lit) {
    const g = ctx.createRadialGradient(x, y - 50, 10, x, y - 50, 150);
    g.addColorStop(0, 'rgba(255,240,190,0.5)'); g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 160, y - 210, 320, 220);
  }
  ctx.beginPath(); ctx.ellipse(x, y - 4, 86, 14, 0, 0, 7); ctx.fillStyle = 'rgba(20,10,25,0.3)'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 78, y); ctx.quadraticCurveTo(x - 86, y - 52, x - 30, y - 60);
  ctx.quadraticCurveTo(x + 40, y - 70, x + 76, y - 34); ctx.quadraticCurveTo(x + 90, y - 6, x + 70, y);
  ctx.closePath(); inked(ctx, '#b9b3c4');
  ctx.beginPath(); ctx.moveTo(x - 60, y - 6); ctx.quadraticCurveTo(x, y - 20, x + 66, y - 6); ctx.lineTo(x + 70, y); ctx.lineTo(x - 78, y); ctx.closePath();
  ctx.fillStyle = '#958ea4'; ctx.fill();
  ctx.strokeStyle = lit ? '#fff3c4' : '#6f6880'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let a = 0; a < 9.5; a += 0.3) { const r = 3 + a * 2.4; const px = x + Math.cos(a) * r * 1.3, py = y - 36 + Math.sin(a) * r * 0.75; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.stroke();
  // floating motes
  for (let i = 0; i < 4; i++) {
    const a = t * 0.8 + i * 1.57, px = x + Math.cos(a) * 70, py = y - 90 - Math.sin(a * 1.3) * 24 - i * 8;
    ctx.fillStyle = `rgba(255,243,196,${lit ? 0.9 : 0.45})`; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
  }
}

export function elementSigil(ctx, el, x, y, r, color, lw = 5) {
  // simple original marks: air = three breath lines, water = a drop, earth = stacked stones, fire = a flame
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (el === 'air') {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(x - r * 0.7, y + i * r * 0.42);
      ctx.quadraticCurveTo(x, y + i * r * 0.42 - r * 0.3, x + r * (0.7 - Math.abs(i) * 0.25), y + i * r * 0.42); ctx.stroke();
    }
  } else if (el === 'water') {
    ctx.beginPath(); ctx.moveTo(x, y - r * 0.8);
    ctx.bezierCurveTo(x + r * 0.9, y, x + r * 0.5, y + r * 0.8, x, y + r * 0.8);
    ctx.bezierCurveTo(x - r * 0.5, y + r * 0.8, x - r * 0.9, y, x, y - r * 0.8); ctx.stroke();
  } else if (el === 'earth') {
    rr(ctx, x - r * 0.7, y + r * 0.2, r * 1.4, r * 0.5, 4); ctx.stroke();
    rr(ctx, x - r * 0.45, y - r * 0.35, r * 0.9, r * 0.5, 4); ctx.stroke();
    rr(ctx, x - r * 0.22, y - r * 0.8, r * 0.44, r * 0.4, 4); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + r * 0.8);
    ctx.quadraticCurveTo(x - r * 0.8, y, x - r * 0.1, y - r * 0.9);
    ctx.quadraticCurveTo(x + r * 0.1, y - r * 0.2, x + r * 0.45, y - r * 0.3);
    ctx.quadraticCurveTo(x + r * 0.8, y + r * 0.3, x + r * 0.4, y + r * 0.8); ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}

export function drawShrine(ctx, x, y, el, t, lit, done) {
  const E = ELEMENTS[el];
  // two posts, a lintel and a hanging disc with the element mark
  if (lit || !done) {
    const g = ctx.createRadialGradient(x, y - 190, 10, x, y - 190, 210);
    g.addColorStop(0, hexA(E.color, done ? 0.25 : 0.5)); g.addColorStop(1, hexA(E.color, 0));
    ctx.fillStyle = g; ctx.fillRect(x - 220, y - 400, 440, 420);
  }
  rr(ctx, x - 120, y - 22, 240, 22, 5); inked(ctx, '#8d8798');
  for (const sx of [-1, 1]) { rr(ctx, x + sx * 86 - 14, y - 280, 28, 260, 5); inked(ctx, '#6d4a3f'); }
  poly(ctx, [x - 150, y - 284, x - 132, y - 322, x + 132, y - 322, x + 150, y - 284]); inked(ctx, '#5a3a34');
  rr(ctx, x - 110, y - 262, 220, 16, 4); inked(ctx, '#6d4a3f');
  const bob = Math.sin(t * 1.6) * 6;
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y - 246); ctx.lineTo(x, y - 210 + bob); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y - 160 + bob, 52, 0, 7); inked(ctx, done ? '#3b3442' : '#2c2533');
  ctx.beginPath(); ctx.arc(x, y - 160 + bob, 40, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = hexA(E.color, 0.6); ctx.stroke();
  elementSigil(ctx, el, x, y - 160 + bob, 30, E.color, 6);
  // ribbons
  for (const sx of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(x + sx * 86, y - 262);
    ctx.quadraticCurveTo(x + sx * (106 + Math.sin(t * 2 + sx) * 10), y - 220, x + sx * (96 + Math.sin(t * 2.4 + sx) * 16), y - 180);
    ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = E.color; ctx.stroke();
  }
}
export function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function drawDoor(ctx, d, pal, locked, t) {
  const x = d.x, y = d.y;
  rr(ctx, x - 62, y - 190, 124, 190, 60); inked(ctx, pal.shade, 6, pal.ink);
  rr(ctx, x - 46, y - 172, 92, 172, 46); inked(ctx, locked ? '#3a2b2b' : '#1b141d', 5, pal.ink);
  if (locked) {
    ctx.strokeStyle = '#6b5a4a'; ctx.lineWidth = 7;
    for (const yy of [y - 120, y - 70]) { ctx.beginPath(); ctx.moveTo(x - 44, yy); ctx.lineTo(x + 44, yy); ctx.stroke(); }
    rr(ctx, x - 13, y - 108, 26, 26, 5); inked(ctx, '#b08d3c', 4);
  } else {
    const g = ctx.createLinearGradient(0, y - 170, 0, y);
    g.addColorStop(0, 'rgba(255,220,150,0.0)'); g.addColorStop(1, `rgba(255,220,150,${0.22 + Math.sin(t * 2) * 0.06})`);
    rr(ctx, x - 44, y - 170, 88, 170, 44); ctx.fillStyle = g; ctx.fill();
  }
}

export function drawSign(ctx, x, y, pal) {
  rr(ctx, x - 6, y - 96, 12, 96, 3); inked(ctx, '#6d4a3f', 4);
  rr(ctx, x - 44, y - 122, 88, 50, 6); inked(ctx, '#c99a66', 5);
  ctx.strokeStyle = '#6d4a3f'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 28, y - 106); ctx.lineTo(x + 28, y - 106); ctx.moveTo(x - 28, y - 90); ctx.lineTo(x + 12, y - 90); ctx.stroke();
}

export function drawWisp(ctx, x, y, t, a = 1) {
  const bob = Math.sin(t * 3 + x * 0.01) * 6;
  ctx.save(); ctx.globalAlpha *= a;
  const g = ctx.createRadialGradient(x, y + bob, 2, x, y + bob, 34);
  g.addColorStop(0, 'rgba(215,238,242,0.9)'); g.addColorStop(1, 'rgba(215,238,242,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + bob, 34, 0, 7); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 12, y + bob + 6); ctx.quadraticCurveTo(x - 16, y + bob - 12, x + 2, y + bob - 20 + Math.sin(t * 6) * 3);
  ctx.quadraticCurveTo(x + 4, y + bob - 6, x + 12, y + bob + 2); ctx.quadraticCurveTo(x + 4, y + bob + 16, x - 12, y + bob + 6);
  inked(ctx, '#eafcff', 4, '#4f8c9c');
  ctx.restore();
}
export function drawHeart(ctx, x, y, t) {
  const bob = Math.sin(t * 2.2) * 7;
  const g = ctx.createRadialGradient(x, y + bob, 4, x, y + bob, 70);
  g.addColorStop(0, 'rgba(255,170,150,0.7)'); g.addColorStop(1, 'rgba(255,170,150,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + bob, 70, 0, 7); ctx.fill();
  pip(ctx, x, y + bob, 26, true);
}
// Wind Pearl (Breath capacity): a pale pearl in a ring of moving air.
export function drawPearl(ctx, x, y, t) {
  const bob = Math.sin(t * 2.4) * 7;
  const g = ctx.createRadialGradient(x, y + bob, 4, x, y + bob, 70);
  g.addColorStop(0, 'rgba(191,233,242,0.75)'); g.addColorStop(1, 'rgba(191,233,242,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + bob, 70, 0, 7); ctx.fill();
  ctx.save(); ctx.strokeStyle = '#eafcff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x, y + bob, 34, t * 3 + i * 2.1, t * 3 + i * 2.1 + 1.1); ctx.stroke(); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y + bob, 18, 0, 7); inked(ctx, '#dff3f7', 4, '#2f5d6b');
  ctx.beginPath(); ctx.arc(x - 6, y + bob - 6, 6, 0, 7); ctx.fillStyle = '#ffffff'; ctx.fill();
}
// Healing bloom dropped by soldiers: a small pink lotus.
export function drawBloom(ctx, x, y, t, a = 1) {
  ctx.save(); ctx.globalAlpha *= a;
  const bob = Math.sin(t * 3 + x) * 4;
  for (let i = -2; i <= 2; i++) {
    ctx.save(); ctx.translate(x, y + bob + 8); ctx.rotate(i * 0.45);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(10, -14, 0, -26); ctx.quadraticCurveTo(-10, -14, 0, 0);
    inked(ctx, i % 2 ? '#ffb3a6' : '#f08a8a', 3);
    ctx.restore();
  }
  ctx.restore();
}
// health pip: a lotus-petal diamond
export function pip(ctx, x, y, r, full) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * 0.95, y - r * 0.2, x, y + r); ctx.quadraticCurveTo(x - r * 0.95, y - r * 0.2, x, y - r);
  inked(ctx, full ? '#e2574c' : '#2a2030', Math.max(3, r * 0.2));
  if (full) { ctx.beginPath(); ctx.ellipse(x - r * 0.18, y - r * 0.3, r * 0.14, r * 0.26, -0.4, 0, 7); ctx.fillStyle = '#ffb3a6'; ctx.fill(); }
}

// --- UI bits -------------------------------------------------------------------------
const FACE = { '✕': '#8fb8ff', '○': '#ff7b7b', '□': '#f3a3d6', '△': '#66e3b4' };
// v15: touch prompt names (input.js LABELS.touch) and the rim colour of the matching on-screen button
export const TOUCH_GLYPH = { Jump: '#8fb8ff', Strike: '#f3a3d6', Dash: '#ff9b7b', Use: '#66e3b4', Heal: '#ffb3a6', Tap: '#ffe9a8', Back: '#c9bfae', Map: '#ffe9a8', Bag: '#ffe9a8', Pause: '#ffe9a8', Pin: '#ffe9a8',
  'Bend 1': '#bfe9f2', 'Bend 2': '#bfe9f2', 'Bend 3': '#bfe9f2', 'Bend 4': '#bfe9f2', Stick: '#c8ffd8', 'Stick ↑': '#c8ffd8', 'Stick ↓': '#c8ffd8', '◀': '#c8ffd8', '▶': '#c8ffd8' };
export function glyphWidth(ctx, label, s) {
  if (FACE[label]) return s;
  if (TOUCH_GLYPH[label]) { ctx.font = font(s * 0.46, 800); return Math.max(s, ctx.measureText(label).width + s * 0.75); }
  ctx.font = font(s * 0.52);
  return Math.max(s, ctx.measureText(label).width + s * 0.5);
}
// Button glyph centred vertically on y, left edge at x. Returns its width.
export function glyph(ctx, label, x, y, s, dim = false) {
  const w = glyphWidth(ctx, label, s);
  ctx.save();
  if (dim) ctx.globalAlpha *= 0.45;
  if (FACE[label]) {
    const cx = x + s / 2, r = s / 2 - 2;
    ctx.beginPath(); ctx.arc(cx, y, r, 0, 7); inked(ctx, '#2a2433', Math.max(3, s * 0.08));
    ctx.strokeStyle = FACE[label]; ctx.lineWidth = Math.max(3, s * 0.1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const k = r * 0.45;
    ctx.beginPath();
    if (label === '✕') { ctx.moveTo(cx - k, y - k); ctx.lineTo(cx + k, y + k); ctx.moveTo(cx + k, y - k); ctx.lineTo(cx - k, y + k); }
    else if (label === '○') ctx.arc(cx, y, k * 1.15, 0, 7);
    else if (label === '□') ctx.rect(cx - k, y - k, k * 2, k * 2);
    else { ctx.moveTo(cx, y - k * 1.2); ctx.lineTo(cx + k * 1.2, y + k * 0.85); ctx.lineTo(cx - k * 1.2, y + k * 0.85); ctx.closePath(); }
    ctx.stroke();
  } else {
    const tc = TOUCH_GLYPH[label];
    if (tc) {   // v15: a touch prompt: the on-screen button's name in a round dark pill with its coloured rim
      rr(ctx, x + 1, y - s / 2 + 2, w - 2, s - 4, s / 2);
      inked(ctx, 'rgba(29,20,32,0.92)', Math.max(3, s * 0.08));
      rr(ctx, x + 1 + s * 0.12, y - s / 2 + 2 + s * 0.12, w - 2 - s * 0.24, s - 4 - s * 0.24, s / 2); ctx.lineWidth = Math.max(2, s * 0.07); ctx.strokeStyle = tc; ctx.stroke();
      ctx.fillStyle = '#f3ecdf'; ctx.font = font(s * 0.46, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + 1);
      ctx.restore();
      return w;
    }
    const pad = /^(L1|L2|R1|R2|OPTIONS|SHARE|Stick)$/.test(label);
    rr(ctx, x + 1, y - s / 2 + 2, w - 2, s - 4, pad ? s * 0.32 : s * 0.2);
    inked(ctx, pad ? '#2a2433' : '#efe6d6', Math.max(3, s * 0.08));
    if (!pad) { ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(x + 5, y + s / 2 - 9, w - 10, 4); }
    ctx.fillStyle = pad ? '#f3ecdf' : INK; ctx.font = font(s * 0.52); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + 1);
  }
  ctx.restore();
  return w;
}

// Text with inline glyphs: "Jump [[✕]] then ..." . align: 'left' | 'center'
export function richWidth(ctx, str, px) {
  let w = 0;
  for (const part of str.split(/(\[\[.+?\]\])/)) {
    if (!part) continue;
    if (part.startsWith('[[')) w += glyphWidth(ctx, part.slice(2, -2), px * 1.25) + px * 0.2;
    else { ctx.font = font(px, 600); w += ctx.measureText(part).width; }
  }
  return w;
}
export function richText(ctx, str, x, y, px, color = '#f3ecdf', align = 'left') {
  if (align === 'center') x -= richWidth(ctx, str, px) / 2;
  for (const part of str.split(/(\[\[.+?\]\])/)) {
    if (!part) continue;
    if (part.startsWith('[[')) x += glyph(ctx, part.slice(2, -2), x, y, px * 1.25) + px * 0.2;
    else {
      ctx.font = font(px, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = color; ctx.fillText(part, x, y + 1);
      x += ctx.measureText(part).width;
    }
  }
}
export function wrapRich(ctx, str, px, maxW) {
  const words = str.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (cur && richWidth(ctx, test, px) > maxW) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Move icon: element-coloured disc with a little pictogram.
export function moveIcon(ctx, id, x, y, r, o = {}) {
  // painted icon from ui/ui-move-icons.png (8 round icons, in MOVE_ORDER)
  const sheet = Kits.ready && Kits.data['ui/icons'], img = Kits.imgs['ui/icons'];
  if (sheet && img && sheet.pieces.length === 8) {
    const pc = sheet.pieces[MOVE_ORDER.indexOf(id)], d = Math.min(pc.w, pc.h);
    ctx.save();
    if (o.dim) ctx.globalAlpha *= 0.4;
    ctx.drawImage(img, pc.x + (pc.w - d) / 2, pc.y + (pc.h - d) / 2, d, d, x - r * 1.08, y - r * 1.08, r * 2.16, r * 2.16);
    ctx.restore();
    return;
  }
  const m = MOVES[id], E = ELEMENTS[m.el];
  ctx.save();
  if (o.dim) ctx.globalAlpha *= 0.4;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); inked(ctx, E.dark, Math.max(4, r * 0.12));
  ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, 7); ctx.fillStyle = hexA(E.color, 0.28); ctx.fill();
  const c = '#fbf6ea';
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = Math.max(3, r * 0.13); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const k = r * 0.5;
  ctx.beginPath();
  switch (id) {
    case 'gust':
      for (let i = -1; i <= 1; i++) { ctx.moveTo(x - k, y + i * k * 0.6); ctx.lineTo(x + k * (1 - Math.abs(i) * 0.4), y + i * k * 0.6); }
      ctx.moveTo(x + k * 0.5, y - k * 0.35); ctx.lineTo(x + k, y); ctx.lineTo(x + k * 0.5, y + k * 0.35); ctx.stroke(); break;
    case 'deflect':
      ctx.arc(x, y, k * 0.95, 0.5, 5.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, k * 0.3, 0, 7); ctx.fill(); break;
    case 'whip':
      ctx.moveTo(x - k, y + k * 0.8); ctx.bezierCurveTo(x - k * 0.2, y + k * 0.9, x + k * 0.9, y + k * 0.3, x + k * 0.8, y - k * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + k * 0.8, y - k * 0.9, r * 0.09, 0, 7); ctx.fill(); break;
    case 'icewall':
      poly(ctx, [x - k * 0.8, y + k, x - k * 0.6, y - k * 0.6, x - k * 0.15, y - k, x + k * 0.1, y - k * 0.3, x + k * 0.5, y - k * 0.8, x + k * 0.8, y + k]); ctx.stroke(); break;
    case 'slam':
      ctx.moveTo(x, y - k); ctx.lineTo(x, y + k * 0.3); ctx.moveTo(x - k * 0.45, y - k * 0.15); ctx.lineTo(x, y + k * 0.35); ctx.lineTo(x + k * 0.45, y - k * 0.15);
      ctx.moveTo(x - k, y + k * 0.9); ctx.lineTo(x - k * 0.4, y + k * 0.6); ctx.lineTo(x, y + k * 0.9); ctx.lineTo(x + k * 0.4, y + k * 0.6); ctx.lineTo(x + k, y + k * 0.9); ctx.stroke(); break;
    case 'stonewall':
      rr(ctx, x - k * 0.6, y - k * 0.9, k * 1.2, k * 1.8, 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - k * 0.6, y - k * 0.1); ctx.lineTo(x + k * 0.6, y - k * 0.25); ctx.stroke(); break;
    case 'fireblast':
      ctx.arc(x + k * 0.35, y, k * 0.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - k, y - k * 0.4); ctx.lineTo(x - k * 0.2, y - k * 0.3); ctx.moveTo(x - k * 1.1, y); ctx.lineTo(x - k * 0.3, y); ctx.moveTo(x - k, y + k * 0.4); ctx.lineTo(x - k * 0.2, y + k * 0.3); ctx.stroke(); break;
    default: // flamering
      ctx.arc(x, y, k * 0.85, 0, 7); ctx.stroke();
      for (let a = 0; a < 6.2; a += 1.57) { ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * k * 0.85, y + Math.sin(a) * k * 0.85); ctx.lineTo(x + Math.cos(a + 0.3) * k * 1.3, y + Math.sin(a + 0.3) * k * 1.3); ctx.stroke(); }
  }
  ctx.restore();
}

// Painted panel frame (assets/ui/ui-panel-frame.png, 1024 square, 128 px corners) drawn
// as nine slices; every menu panel gets it once the file exists.
let frameAssets = null;
import('./assets.js').then((m) => { frameAssets = m.Assets; });
function nineSlice(ctx, img, x, y, w, h, c = 128, d = 64) {
  const iw = img.width, ih = img.height, sx = [0, c, iw - c, iw], sy = [0, c, ih - c, ih], dx = [x, x + d, x + w - d, x + w], dy = [y, y + d, y + h - d, y + h];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ctx.drawImage(img, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], dx[i + 1] - dx[i], dy[j + 1] - dy[j]);
}
export function panel(ctx, x, y, w, h, o = {}) {
  const fr = frameAssets && !o.plain && frameAssets.get(o.talk ? 'ui.talkframe' : 'ui.frame');
  // v6: the painted talk frame is one torn paper strip with wide transparent margins: crop to the
  // paper (fractions of the sheet) and stretch it over the box, rather than nine-slicing the margins
  if (fr && o.talk) {
    const iw = fr.img.width, ih = fr.img.height;
    rr(ctx, x + 6, y + 12, w - 12, h - 8, 18); ctx.fillStyle = 'rgba(10,6,14,0.4)'; ctx.fill();
    ctx.drawImage(fr.img, iw * 0.006, ih * 0.198, iw * 0.988, ih * 0.585, x, y, w, h);
    return;
  }
  if (fr) { rr(ctx, x, y + 8, w, h, o.r ?? 18); ctx.fillStyle = 'rgba(10,6,14,0.45)'; ctx.fill(); nineSlice(ctx, fr.img, x, y, w, h, fr.img.width / 8, Math.min(64, w / 4, h / 4)); return; }
  rr(ctx, x, y + 8, w, h, o.r ?? 18); ctx.fillStyle = 'rgba(10,6,14,0.45)'; ctx.fill();
  if (o.paper) {
    // v5: a paper sheet: warm paper, a dark ink outline, a thin gold line inside, corner ticks
    rr(ctx, x, y, w, h, o.r ?? 10); inked(ctx, 'rgba(239,227,200,0.96)', 3, INK);
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(255,250,235,0)'); g.addColorStop(1, 'rgba(150,110,60,0.18)');
    rr(ctx, x, y, w, h, o.r ?? 10); ctx.fillStyle = g; ctx.fill();
    rr(ctx, x + 10, y + 10, w - 20, h - 20, Math.max(2, (o.r ?? 10) - 4)); ctx.lineWidth = 2; ctx.strokeStyle = o.accent || '#b8903e'; ctx.stroke();
    ctx.fillStyle = '#b8903e';
    for (const [cx, cy] of [[x + 10, y + 10], [x + w - 10, y + 10], [x + 10, y + h - 10], [x + w - 10, y + h - 10]]) { ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.fill(); }
    return;
  }
  rr(ctx, x, y, w, h, o.r ?? 18); inked(ctx, o.fill || '#241c2b', o.lw ?? 6, o.ink || INK);
  if (o.accent) { rr(ctx, x + 8, y + 8, w - 16, h - 16, (o.r ?? 18) - 6); ctx.lineWidth = 3; ctx.strokeStyle = o.accent; ctx.stroke(); }
}

// Fallback backdrop when a region's painting is missing: sky bands, far ridges, haze.
export function fallbackBg(ctx, pal, W, H, sx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.sky[0]); g.addColorStop(0.55, pal.sky[1]); g.addColorStop(1, pal.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,240,210,0.5)'; ctx.beginPath(); ctx.arc(W * 0.72, H * 0.3, 90, 0, 7); ctx.fill();
  for (let layer = 0; layer < 3; layer++) {
    const off = sx * (0.08 + layer * 0.08), base = H * (0.6 + layer * 0.1);
    ctx.fillStyle = pal.far; ctx.globalAlpha = 0.35 + layer * 0.22;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = -200; x <= W + 200; x += 100) {
      const wx = x + off - (off % 100), k = hash(Math.floor((x + off) / 100), layer);
      ctx.lineTo(x - (off % 100), base - k * (150 - layer * 30) - Math.sin(wx * 0.004 + layer) * 50);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
