// Code-drawn stand-ins used when a sheet in the manifest is missing, plus the three
// trial guardians (which are code-drawn in v0.1). Same recipe: ink outline, flat fills.
import { INK } from './config.js';
import { rr, inked, poly, flame } from './draw.js';

function limb(ctx, x0, y0, ang, len, col, lw, bend = 0) {
  const mx = x0 + Math.sin(ang + bend) * len * 0.5, my = y0 + Math.cos(ang + bend) * len * 0.5;
  const x1 = mx + Math.sin(ang - bend) * len * 0.5, y1 = my + Math.cos(ang - bend) * len * 0.5;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx, my); ctx.lineTo(x1, y1);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = lw + 8; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.stroke();
  return [x1, y1];
}

// Poses per animation: [lean, legA, legB, armFront, armBack, crouch, lift]
function pose(anim, f) {
  const k = f / 8 * Math.PI * 2;
  switch (anim) {
    case 'run': case 'walk': return { lean: 0.16, la: Math.sin(k) * 0.8, lb: -Math.sin(k) * 0.8, af: -Math.sin(k) * 0.9 - 0.3, ab: Math.sin(k) * 0.9 - 0.3, bob: Math.abs(Math.cos(k)) * 5 };
    case 'jump': return { lean: 0.05, la: f < 3 ? 0.5 : -0.2, lb: f < 3 ? -0.3 : 0.4, af: f < 4 ? -2.4 : -1.2, ab: f < 4 ? 2.2 : 1.4, bend: 0.5 };
    case 'attack': { const kick = f >= 4; return kick ? { lean: -0.2, la: 1.45, lb: -0.15, af: -0.6, ab: 1.0 } : { lean: 0.28, la: 0.5, lb: -0.5, af: -1.57, ab: 0.9 }; }
    case 'dash': return { lean: 0.7, la: -0.9, lb: -0.5, af: 1.2, ab: 1.5, streak: true };
    case 'hurt': return { lean: -0.35, la: 0.3, lb: -0.3, af: -2.2, ab: 2.0, down: f >= 6 };
    case 'glide': return { lean: 0.5, la: -0.7, lb: -0.9, af: 2.6, ab: 2.9, puff: true };
    case 'cast': return { lean: 0.2, la: 0.45, lb: -0.45, af: f < 4 ? -0.4 : -1.57, ab: f < 4 ? 0.6 : -1.3 };
    default: return { lean: 0, la: 0.25, lb: -0.25, af: -0.5 + Math.sin(k) * 0.05, ab: 0.5, bob: Math.sin(k) * 2 };
  }
}

function figure(ctx, c, p, t) {
  const H = c.H, hipY = -H * 0.44 + (p.bob || 0), bw = H * 0.2;
  ctx.save();
  if (p.down) { ctx.translate(0, -H * 0.1); ctx.rotate(-1.35); }
  if (p.streak) {
    ctx.strokeStyle = 'rgba(215,238,242,0.8)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-H * 0.5 - i * 20, -H * (0.3 + i * 0.2)); ctx.lineTo(-H * 0.9 - i * 30, -H * (0.3 + i * 0.2)); ctx.stroke(); }
  }
  limb(ctx, -bw * 0.25, hipY, p.lb, H * 0.44, c.legB || c.leg, H * 0.085, p.bend ? 0.4 : 0.12);
  ctx.save();
  ctx.translate(0, hipY); ctx.rotate(p.lean);
  limb(ctx, -bw * 0.1, -H * 0.3, p.ab, H * 0.3, c.arm, H * 0.065, -0.3);
  rr(ctx, -bw / 2, -H * 0.36, bw, H * 0.4, bw * 0.3); inked(ctx, c.body);
  ctx.fillStyle = c.sash; ctx.fillRect(-bw / 2 + 3, -H * 0.07, bw - 6, H * 0.06);
  // head
  ctx.beginPath(); ctx.arc(bw * 0.05, -H * 0.46, H * 0.105, 0, 7); inked(ctx, c.skin);
  if (c.helmet) {
    poly(ctx, [-H * 0.12, -H * 0.46, -H * 0.1, -H * 0.58, H * 0.02, -H * 0.66, H * 0.13, -H * 0.56, H * 0.16, -H * 0.46]); inked(ctx, c.helmet);
    ctx.fillStyle = INK; ctx.fillRect(bw * 0.05, -H * 0.49, H * 0.1, H * 0.035);
  } else {
    ctx.beginPath(); ctx.arc(bw * 0.02, -H * 0.5, H * 0.105, 3.3, 6.3); ctx.lineTo(bw * 0.05, -H * 0.46); ctx.closePath(); inked(ctx, c.hair, 4);
    ctx.beginPath(); ctx.ellipse(-H * 0.04, -H * 0.6, H * 0.035, H * 0.06, -0.5, 0, 7); inked(ctx, c.hair, 4);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(bw * 0.3, -H * 0.46, 3.5, 0, 7); ctx.fill();
  }
  const hand = limb(ctx, bw * 0.1, -H * 0.3, p.af, H * 0.3, c.arm, H * 0.065, -0.3);
  if (c.fist) flame(ctx, hand[0], hand[1], H * 0.09, t);
  if (p.puff) { ctx.fillStyle = 'rgba(215,238,242,0.7)'; ctx.beginPath(); ctx.arc(hand[0] - 6, hand[1] + 12, 12 + Math.sin(t * 20) * 4, 0, 7); ctx.fill(); }
  ctx.restore();
  limb(ctx, bw * 0.25, hipY, p.la, H * 0.44, c.leg, H * 0.085, p.bend ? 0.4 : 0.12);
  ctx.restore();
}

const HERO = { H: 188, body: '#4f7f86', sash: '#a8443c', skin: '#c98d62', hair: '#2a2028', arm: '#e9dcc0', leg: '#5a4a44', legB: '#4a3c38' };
const SOLDIER = { H: 204, body: '#7a2a2c', sash: '#c9a04e', skin: '#3a2e33', helmet: '#8a3032', arm: '#3a2e33', leg: '#2c2428', fist: true };

function withFlash(ctx, o, fn) {
  // flash is approximated on placeholders by drawing brighter
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  fn();
  ctx.restore();
}

export function phHero(ctx, anim, f, x, y, face, o = {}, t = 0) {
  withFlash(ctx, o, () => {
    ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); ctx.scale(face < 0 ? -1 : 1, 1);
    figure(ctx, o.flash > 0.3 ? whiteOf(HERO) : HERO, pose(anim, f), t);
  });
}
export function phSoldier(ctx, anim, f, x, y, face, o = {}, t = 0) {
  withFlash(ctx, o, () => {
    ctx.translate(x, y); ctx.scale((face < 0 ? -1 : 1) * (o.scale || 1), o.scale || 1);
    let c = SOLDIER;
    if (o.variant === 'slinger') c = { ...SOLDIER, body: '#4a3a7a', helmet: '#56448c' };
    if (o.variant === 'captain') c = { ...SOLDIER, body: '#2a2230', helmet: '#b08d3c', sash: '#d9692e' };
    figure(ctx, o.flash > 0.3 ? whiteOf(c) : c, pose(anim, f), t);
  });
}
function whiteOf(c) { const w = { ...c }; for (const k in w) if (typeof w[k] === 'string') w[k] = '#ffffff'; return w; }

// p = 0..1 progress. Same anchors as the sheets (see fx.js).
export function phFx(ctx, kind, p, x, y, size, face, t = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(face < 0 ? -1 : 1, 1);
  const s = size;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const fade = Math.min(1, (1 - p) * 2.5);
  switch (kind) {
    case 'gust': { // anchored left-middle, blows right
      ctx.globalAlpha *= fade;
      for (let i = -1; i <= 1; i++) {
        const len = s * (0.5 + 0.5 * p) * (1 - Math.abs(i) * 0.2), yy = i * s * 0.16;
        ctx.beginPath(); ctx.moveTo(s * 0.05 + p * s * 0.2, yy); ctx.quadraticCurveTo(len * 0.6, yy - s * 0.1, len, yy + i * s * 0.06);
        ctx.lineWidth = 20; ctx.strokeStyle = '#4f8c9c'; ctx.stroke(); ctx.lineWidth = 11; ctx.strokeStyle = '#eafcff'; ctx.stroke();
      }
      break; }
    case 'deflect': {
      ctx.globalAlpha *= fade; ctx.rotate(p * 5);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, s * 0.42, i * 2.1, i * 2.1 + 1.5); ctx.lineWidth = 18; ctx.strokeStyle = '#4f8c9c'; ctx.stroke(); ctx.lineWidth = 9; ctx.strokeStyle = '#eafcff'; ctx.stroke(); }
      break; }
    case 'whip': {
      ctx.globalAlpha *= fade;
      const a0 = 2.2 - p * 2.6;
      ctx.beginPath(); ctx.arc(-s * 0.1, s * 0.1, s * 0.42, a0 - 1.6, a0, false);
      ctx.lineWidth = 24; ctx.strokeStyle = '#1f5b84'; ctx.stroke(); ctx.lineWidth = 13; ctx.strokeStyle = '#6fc0ea'; ctx.stroke();
      break; }
    case 'slam': { // anchored bottom-centre
      ctx.globalAlpha *= fade;
      for (let i = -3; i <= 3; i++) {
        const h = s * (0.3 + 0.25 * Math.cos(i)) * Math.min(1, p * 4) * (1 - p * 0.5), xx = i * s * 0.13;
        poly(ctx, [xx - s * 0.06, 0, xx + i * 6, -h, xx + s * 0.06, 0]); inked(ctx, i % 2 ? '#a88356' : '#c39a5b');
      }
      break; }
    case 'fireblast': {
      ctx.rotate(Math.PI / 2); flame(ctx, 0, s * 0.2, s * 0.32, t); break; }
    case 'flamering': {
      for (let i = 0; i < 8; i++) { const a = i * 0.785 + t * 3; flame(ctx, Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4 + s * 0.08, s * 0.14, t + i); }
      break; }
    default: break;
  }
  ctx.restore();
}

// Ice / stone wall stand-ins, drawn on the pillar's own rectangle (rise = 0..1).
export function phPillar(ctx, kind, r, rise) {
  const h = r.h * rise, y = r.y + r.h - h;
  if (kind === 'ice') {
    poly(ctx, [r.x, r.y + r.h, r.x + 6, y + 18, r.x + r.w * 0.25, y, r.x + r.w * 0.5, y + 10, r.x + r.w * 0.75, y, r.x + r.w - 6, y + 16, r.x + r.w, r.y + r.h]);
    inked(ctx, '#8cc4ea', 5, '#2a5f86');
    ctx.strokeStyle = '#dff3ff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(r.x + r.w * 0.25, y + 12); ctx.lineTo(r.x + r.w * 0.18, y + h * 0.8); ctx.moveTo(r.x + r.w * 0.62, y + 16); ctx.lineTo(r.x + r.w * 0.5, y + h * 0.7); ctx.stroke();
  } else {
    rr(ctx, r.x, y, r.w, h + 6, 10); inked(ctx, '#8a7a72', 5);
    ctx.fillStyle = '#6f605b'; ctx.fillRect(r.x + 4, y + h * 0.3, r.w - 8, h * 0.18);
    ctx.fillStyle = '#5f524e'; ctx.fillRect(r.x + 4, y + h * 0.62, r.w - 8, h * 0.14);
  }
}

// --- trial guardians -----------------------------------------------------------------
// b: { x, y (feet), w, h, face, flash, t, state, st }
export function drawGuardian(ctx, b, time) {
  const fl = b.flash > 0.02;
  const C = (c) => (fl ? '#ffffff' : c);
  ctx.save();
  ctx.translate(b.x, b.y);
  const sq = b.squash || 0;
  ctx.scale((b.face < 0 ? -1 : 1) * (1 + sq * 0.5), 1 - sq);
  if (b.kind === 'tide') {
    const wob = Math.sin(time * 3) * 6, raise = b.state === 'wave_wind' || b.state === 'orb_wind' ? -70 : 0;
    // skirt of water
    ctx.beginPath(); ctx.moveTo(-95, 0);
    for (let i = 0; i <= 8; i++) ctx.lineTo(-95 + i * 23.75, i % 2 ? -14 - Math.sin(time * 6 + i) * 6 : 0);
    ctx.quadraticCurveTo(84 + wob, -130, 46, -206); ctx.quadraticCurveTo(0, -240, -46, -206); ctx.quadraticCurveTo(-84 + wob, -130, -95, 0);
    ctx.closePath(); inked(ctx, C('#3fa7b8'), 6, '#12414c');
    ctx.beginPath(); ctx.moveTo(-50, -30); ctx.quadraticCurveTo(-40 + wob, -120, -20, -190); ctx.lineWidth = 8; ctx.strokeStyle = C('#8fdcea'); ctx.stroke();
    // arms
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sx * 52, -160);
      ctx.quadraticCurveTo(sx * 120, -150 + raise * 0.5, sx * 118 + wob * sx, -90 + raise * 1.6);
      ctx.lineWidth = 34; ctx.strokeStyle = '#12414c'; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 22; ctx.strokeStyle = C('#3fa7b8'); ctx.stroke();
    }
    // stone mask
    ctx.beginPath(); ctx.ellipse(8, -176, 34, 44, 0, 0, 7); inked(ctx, C('#d8d2c2'), 5);
    ctx.fillStyle = b.enraged ? '#e2574c' : '#12414c';
    for (const ex of [-6, 22]) { ctx.beginPath(); ctx.ellipse(ex, -182, 6, 10, 0.2, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#8d8778'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, -216); ctx.lineTo(4, -196); ctx.lineTo(12, -188); ctx.stroke();
  } else if (b.kind === 'warden') {
    const stun = b.state === 'stun';
    // legs
    for (const sx of [-1, 1]) { rr(ctx, sx * 52 - 30, -64, 60, 64, 10); inked(ctx, C('#8a7558'), 6); }
    // torso boulder
    poly(ctx, [-96, -60, -104, -150, -60, -200, 50, -204, 104, -150, 92, -60]); inked(ctx, C('#b59a6e'), 6);
    ctx.strokeStyle = C('#8a7558'); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-60, -200); ctx.lineTo(-30, -150); ctx.lineTo(-70, -100); ctx.moveTo(-30, -150); ctx.lineTo(40, -140); ctx.lineTo(70, -90); ctx.stroke();
    // moss
    ctx.fillStyle = C('#7c9a52'); ctx.beginPath(); ctx.ellipse(-50, -192, 34, 10, -0.5, 0, 7); ctx.fill();
    // arms
    const sw = b.state === 'charge' ? -0.5 : b.state === 'spike_wind' || b.state === 'toss_wind' ? -1.4 : 0.1;
    for (const sx of [-1, 1]) {
      ctx.save(); ctx.translate(sx * 104, -150); ctx.rotate(sw * (sx > 0 ? 1 : 0.6));
      rr(ctx, -26, -10, 52, 120, 16); inked(ctx, C('#a48a62'), 6);
      rr(ctx, -34, 90, 68, 54, 14); inked(ctx, C('#8a7558'), 6);
      ctx.restore();
    }
    // head
    rr(ctx, 10, -196, 70, 54, 10); inked(ctx, C('#a48a62'), 6);
    ctx.fillStyle = stun ? '#5a4a3a' : (b.enraged ? '#ff7b3a' : '#ffe08a');
    ctx.fillRect(38, -176, 12, stun ? 4 : 12); ctx.fillRect(60, -176, 12, stun ? 4 : 12);
    if (stun) for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(40 + Math.cos(a) * 46, -226 + Math.sin(a) * 10, 7, 0, 7); ctx.fill(); }
  } else { // kiln
    const glow = 0.6 + Math.sin(time * 8) * 0.25, wind = /wind/.test(b.state);
    for (const sx of [-1, 1]) { rr(ctx, sx * 40 - 24, -60, 48, 60, 8); inked(ctx, C('#3a2a2c'), 6); }
    // kiln body
    ctx.beginPath(); ctx.moveTo(-84, -56); ctx.quadraticCurveTo(-100, -190, 0, -214); ctx.quadraticCurveTo(100, -190, 84, -56); ctx.closePath(); inked(ctx, C('#8c4638'), 6);
    ctx.strokeStyle = C('#6c3229'); ctx.lineWidth = 4;
    for (let yy = -88; yy > -190; yy -= 32) { ctx.beginPath(); ctx.moveTo(-84 + (-56 - yy) * 0.1, yy); ctx.lineTo(84 - (-56 - yy) * 0.1, yy); ctx.stroke(); }
    // furnace mouth
    ctx.beginPath(); ctx.arc(14, -108, 40, Math.PI, 0); ctx.lineTo(54, -82); ctx.lineTo(-26, -82); ctx.closePath(); inked(ctx, fl ? '#fff' : `rgba(255,${150 + glow * 80 | 0},60,1)`, 6);
    ctx.strokeStyle = INK; ctx.lineWidth = 6; for (const gx of [-6, 14, 34]) { ctx.beginPath(); ctx.moveTo(gx, -144); ctx.lineTo(gx, -82); ctx.stroke(); }
    // chimney + smoke
    rr(ctx, -44, -250, 40, 56, 6); inked(ctx, C('#5a3a34'), 6);
    for (let i = 0; i < 3; i++) { const k = (time * 0.7 + i / 3) % 1; ctx.fillStyle = `rgba(60,50,55,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(-24 - k * 30, -260 - k * 80, 14 + k * 20, 0, 7); ctx.fill(); }
    // arms
    for (const sx of [-1, 1]) {
      ctx.save(); ctx.translate(sx * 88, -160); ctx.rotate(wind ? -1.2 * sx : 0.15 * sx);
      rr(ctx, -20, -8, 40, 104, 14); inked(ctx, C('#5a3a34'), 6);
      ctx.beginPath(); ctx.arc(0, 104, 26, 0, 7); inked(ctx, C('#3a2a2c'), 6);
      if (wind || b.enraged) flame(ctx, 0, 96, 30, time + sx);
      ctx.restore();
    }
    // eyes
    ctx.fillStyle = b.enraged ? '#fff1a8' : '#ffb347'; ctx.fillRect(18, -186, 16, 8); ctx.fillRect(46, -186, 16, 8);
  }
  ctx.restore();
}
