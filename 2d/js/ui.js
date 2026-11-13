// HUD and every screen: title, pause, map, equip (meditation), lesson popup, ending.
import { G, loadSave, persist, clamp, flag } from './game.js';
import { W, H, DT, INK, REGIONS, ELEMENTS, MOVES, MOVE_ORDER, SLOT_ACTIONS, LESSONS, SKILLS } from './config.js';
import { SPEAKERS, TALKS, OLD_STORY_ART } from './story.js';
import { moveCost } from './moves.js';
import { Input } from './input.js';
import { Assets } from './assets.js';
import { ROOMS, drawMark } from './world.js';
import * as D from './draw.js';
import * as Flow from './flow.js';
import { phHero } from './placeholders.js';
import { Sound } from './audio.js';
import { drawWorldMap } from './map.js';
import { healCost, fighting } from './player.js';
import { noticeHead } from './sim.js';
const blip = () => Sound.sfx('ui-move', { pitch: 0.02 });
const ok = () => Sound.sfx('ui-confirm', { pitch: 0.02 });

const CREAM = '#f3ecdf', DIM = '#a79fb0';
// v6: text written straight onto the parchment panels is ink, not cream (review 6 #3). Cream stays
// inside the dark inset cards and pills.
const INKT = '#2c2334', INK_DIM = '#6b5a4a', GOLD_INK = '#8a5a12', TEAL_INK = '#2f6f7a', GREEN_INK = '#2f7a45';
const elInk = (el) => (el === 'air' ? '#3d6f7d' : ELEMENTS[el].dark);

function text(ctx, str, x, y, px, color = CREAM, align = 'left', weight = 700, outline = 0) {
  ctx.font = D.font(px, weight); ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (outline) { ctx.lineWidth = outline; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

// "{jump}" -> the jump glyph, "{m:icewall}" -> the slot that move sits in.
const NOT_CARRIED = '(not carried)';
export function expand(str) {
  return str.replace(/\{(\w+)(?::(\w+))?\}/g, (_, a, b) => {
    if (a !== 'm') return `[[${Input.label(a)}]]`;
    const i = G.save.slots.indexOf(b);
    return i >= 0 ? `[[${Input.label(SLOT_ACTIONS[i])}]]` : NOT_CARRIED;
  });
}
const slotGlyph = (i) => Input.label(SLOT_ACTIONS[i]);
const pressedConfirm = () => Input.pressed.confirm || Input.pressed.interact;

// --- v9 HUD pieces: hearts, the jade bead, things flying into the HUD ---------------------
// Heart outline as a path, centred at (x, y), half-width r.
function heartPath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.95);
  ctx.bezierCurveTo(x - r * 0.35, y + r * 0.65, x - r * 1.05, y + r * 0.2, x - r * 1.0, y - r * 0.32);
  ctx.bezierCurveTo(x - r * 0.95, y - r * 0.95, x - r * 0.15, y - r * 1.0, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.15, y - r * 1.0, x + r * 0.95, y - r * 0.95, x + r * 1.0, y - r * 0.32);
  ctx.bezierCurveTo(x + r * 1.05, y + r * 0.2, x + r * 0.35, y + r * 0.65, x, y + r * 0.95);
  ctx.closePath();
}
// fill: 0 (empty) to 1 (full), filled from the bottom up. flash: a white gain/lose flash over it.
export function drawHeart(ctx, x, y, r, fill = 1, flash = 0, small = false) {
  if (Assets.has('ui.hearts')) {
    // the painted sheet: full, half, empty (and a flash cell, whose glow runs into its frame, so the flash is drawn here)
    const cs = Assets.cells('ui.hearts', 4, { dropRing: true }), d = r * 2.25;
    const cell = (i, clipK = 1) => { const c = cs[i], dh = d * c.sh / c.sw; ctx.save(); if (clipK < 1) { ctx.beginPath(); ctx.rect(x - d, y + dh / 2 - dh * clipK, d * 2, dh * clipK); ctx.clip(); } ctx.drawImage(Assets.get('ui.hearts').img, c.sx, c.sy, c.sw, c.sh, x - d / 2, y - dh / 2, d, dh); ctx.restore(); };
    ctx.save(); if (small) ctx.globalAlpha *= 0.85;
    heartPath(ctx, x, y, r * 0.95); ctx.fillStyle = 'rgba(20,10,25,0.6)'; ctx.fill();   // empties read as holes, not glass
    cell(2);
    if (fill > 0) cell(0, fill >= 0.99 ? 1 : fill);
    ctx.restore();
    if (flash > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = flash; const g = ctx.createRadialGradient(x, y, 2, x, y, r * 1.8); g.addColorStop(0, 'rgba(255,240,200,0.95)'); g.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = g; ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4); ctx.restore(); }
    return;
  }
  heartPath(ctx, x, y + 2, r); ctx.fillStyle = 'rgba(20,10,25,0.55)'; ctx.fill();
  heartPath(ctx, x, y, r); ctx.fillStyle = small ? 'rgba(243,236,223,0.12)' : '#3a2632'; ctx.fill();
  if (fill > 0) {
    ctx.save(); heartPath(ctx, x, y, r); ctx.clip();
    const top = y + r * 0.95 - r * 1.95 * fill;
    const g = ctx.createLinearGradient(0, y - r, 0, y + r); g.addColorStop(0, '#ff8a7a'); g.addColorStop(1, '#c8323a');
    ctx.fillStyle = g; ctx.fillRect(x - r * 1.2, top, r * 2.4, y + r - top + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(x - r * 0.45, y - r * 0.38, r * 0.26, r * 0.16, -0.6, 0, 7); ctx.fill();
    ctx.restore();
  }
  heartPath(ctx, x, y, r); ctx.lineWidth = small ? 3 : 4.5; ctx.strokeStyle = INK; ctx.stroke();
  if (flash > 0) { heartPath(ctx, x, y, r); ctx.fillStyle = `rgba(255,250,240,${flash})`; ctx.fill(); }
}
export function drawBead(ctx, x, y, r) {
  const art = Assets.get('ui.bead');
  if (art) { const d = r * 2.4, dh = d * art.img.height / art.img.width; ctx.drawImage(art.img, x - d / 2, y - dh / 2, d, dh); return; }
  // a polished jade bead on a red cord
  ctx.strokeStyle = '#b8322c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - r * 1.25, y - r * 0.2); ctx.lineTo(x + r * 1.25, y + r * 0.2); ctx.stroke();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#d8ffe4'); g.addColorStop(0.45, '#6fcf8e'); g.addColorStop(1, '#2c7a4a');
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, 7); ctx.fillStyle = '#1d4a30'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(x - r * 0.42, y - r * 0.45, r * 0.24, r * 0.14, -0.7, 0, 7); ctx.fill();
}
// Watches health and beads and runs the HUD's little animations.
function updateHudAnim(p, s) {
  const hu = G.hud = G.hud || { hp: p.hp, max: s.maxHp, hearts: [], shakeT: 0, jadeShown: s.jade || 0, tick: 0, bounce: 0, fly: [] };
  const dt = DT;
  if (p.hp < hu.hp) { for (let i = p.hp; i < hu.hp; i++) hu.hearts[i] = { lose: 0.45 }; hu.shakeT = 0.35; Sound.sfx('heart-break', { gap: 0.1, delay: 0.15 }); }   // v15: the heart breaks as the hurt flash ends, not on top of the hit
  else if (p.hp > hu.hp && !p.dead && hu.hp > 0) { for (let i = hu.hp; i < p.hp; i++) hu.hearts[i] = { gain: 0.5 }; Sound.sfx('heart-fill', { gap: 0.15 }); }
  hu.hp = p.hp;
  for (const h of hu.hearts) if (h) { if (h.lose > 0) h.lose -= dt; if (h.gain > 0) h.gain -= dt; }
  if (hu.shakeT > 0) hu.shakeT -= dt;
  if (hu.bounce > 0) hu.bounce -= dt;
  // the number walks to the real count one bead at a time (faster for big jumps)
  const want = s.jade || 0, inFlight = hu.fly.filter((f) => f.kind === 'bead').length;
  const target = Math.max(0, want - inFlight);
  if (hu.jadeShown !== target && (hu.tick -= dt) <= 0) {
    const gap = Math.abs(target - hu.jadeShown), stepN = Math.max(1, Math.round(gap / 12));
    hu.jadeShown += Math.sign(target - hu.jadeShown) * Math.min(gap, stepN);
    hu.tick = 0.035; hu.bounce = 0.22;
  }
  for (let i = hu.fly.length - 1; i >= 0; i--) { const f = hu.fly[i]; f.t += dt; if (f.t >= f.dur) { hu.fly.splice(i, 1); if (f.kind === 'bead') hu.bounce = 0.22; if (f.done) f.done(); } }
}
// Something flies from a screen point into the HUD: a jade bead to the bead counter, a bought item to its place.
export function hudFly(kind, sx, sy, o = {}) {
  const hu = G.hud; if (!hu) return;
  const to = o.to || (kind === 'bead' ? (G.hudBead || { x: 62, y: 168 }) : { x: 70, y: 64 });
  hu.fly.push({ kind, x0: sx, y0: sy, x1: to.x, y1: to.y, t: 0, dur: o.dur || 0.45 + Math.random() * 0.12, draw: o.draw, done: o.done, arc: o.arc ?? -160 });
}
export function drawHudFly(ctx) {
  const hu = G.hud; if (!hu) return;
  for (const f of hu.fly) {
    const u = Math.min(1, f.t / f.dur), e = u * u * (3 - 2 * u);
    const x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e + f.arc * Math.sin(Math.PI * u);
    if (f.draw) f.draw(ctx, x, y, u);
    else if (f.kind === 'bead') {   // v10 (review 10 #3): 24 px with a short pale trail, so they read crossing the screen
      for (let k = 1; k <= 3; k++) { const uu = Math.max(0, u - k * 0.05), ee = uu * uu * (3 - 2 * uu); ctx.save(); ctx.globalAlpha = 0.35 - k * 0.09; drawBead(ctx, f.x0 + (f.x1 - f.x0) * ee, f.y0 + (f.y1 - f.y0) * ee + f.arc * Math.sin(Math.PI * uu), 12); ctx.restore(); }
      drawBead(ctx, x, y, 12 + 2 * u);
    }
    else drawHeart(ctx, x, y, 18, 1);
  }
}

// --- HUD -----------------------------------------------------------------------------
export function drawHud(ctx, near) {
  const p = G.player, s = G.save, room = G.room, cam = G.cam;
  if (G.state === 'shop') return;   // v10 (review 10 #3): the shop is its own scene; no play HUD through it
  // hurt: a brief red edge after a hit (max 30%, gone in 0.4 s); at 1 health a slow, thin
  // pulse in the outer 12% of the screen only. Never a steady full-screen tint.
  const edge = (a) => {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.62, W / 2, H / 2, H * 1.02);
    g.addColorStop(0, 'rgba(160,20,30,0)'); g.addColorStop(1, `rgba(160,20,30,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  // v8 (review 8 #7): the first 0.15 s of a hit flashes the edge hard, then it eases off
  if (G.hurtGlow > 0) edge(G.hurtGlow > 0.62 ? 0.55 : 0.3 * Math.min(1, G.hurtGlow / 0.62));
  else if (p.hp === 1 && !p.dead) edge(0.1 + 0.08 * Math.sin(G.time * 2.2));
  // where the hero is on screen (to get the HUD out of his way)
  const hx = p.x - cam.x, hy = p.y - cam.y;

  // v9 (Connor's note 2): health is a row of hearts. Losing one pops and shakes it, gaining one fills it from the bottom.
  // v9 (Connor's note 3): the jade bead count is a big bead and a big number that ticks up with a bounce.
  updateHudAnim(p, s);
  const hu = G.hud, rowShake = hu.shakeT > 0 ? Math.sin(G.time * 70) * 7 * (hu.shakeT / 0.35) : 0;
  const HS = Math.min(58, 320 / Math.max(1, s.maxHp - 1)), HR = Math.min(25, HS * 0.45), HX = 44 + HR, HY = 64;   // v9: the row tightens as hearts are added, clear of the boss bar
  const plateW = HX - 30 + (s.maxHp - 1) * HS + HR + 56;
  D.rr(ctx, 30, 26, plateW, 76, 32); ctx.fillStyle = 'rgba(20,12,26,0.55)'; ctx.fill();
  for (let i = 0; i < s.maxHp; i++) {
    const fx = hu.hearts[i] || {}, x = HX + i * HS + rowShake, low = p.hp === 1 && i === 0 ? 1 + 0.1 * Math.max(0, Math.sin(G.time * 6)) : 1;
    let k = 1, fill = i < p.hp ? 1 : 0, flash = 0;
    if (fx.lose > 0) { const u = 1 - fx.lose / 0.45; k = u < 0.25 ? 1 + u * 1.6 : 1.4 - (u - 0.25) * 0.55; fill = u < 0.2 ? 1 : 0; flash = u < 0.2 ? 1 - u / 0.2 : 0; }
    if (fx.gain > 0) { const u = 1 - fx.gain / 0.5; fill = Math.min(1, u * 1.4); k = 1 + Math.sin(Math.min(1, u) * Math.PI) * 0.25; flash = u > 0.7 ? (1 - u) / 0.3 : 0; }
    drawHeart(ctx, x, HY, HR * k * low, fill, flash);
  }
  // the pieces of the next heart: a small heart that fills a quarter at a time
  const pcs = (s.pieces || 0) % 4, px0 = HX + (s.maxHp - 1) * HS + HR + 22;
  drawHeart(ctx, px0, HY + 6, 14, pcs / 4, 0, true);
  // jade beads
  if ((s.jade || 0) > 0 || G.jadeT > 0 || s.satchel || hu.jadeShown > 0 || hu.fly.length) {
    const jx = 70, jy = 176, b =   // v10 (review 10 #3): a 56 px bead and a 52 px number
      hu.bounce > 0 ? Math.sin((1 - hu.bounce / 0.22) * Math.PI) * 0.28 : 0;
    G.hudBead = { x: jx, y: jy };
    ctx.save(); ctx.translate(jx, jy); ctx.scale(1 + b, 1 + b);
    drawBead(ctx, 0, 0, 28);
    ctx.restore();
    text(ctx, String(hu.jadeShown), jx + 42, jy + 2, 52 * (1 + b * 0.6), hu.bounce > 0 || G.jadeT > 0 ? '#c8ffd8' : CREAM, 'left', 800, 7);
    // v8: the full note for 4 s after a fall, then only a small satchel mark (it no longer sits under the HUD all fight)
    if (s.satchel) {
      ctx.font = D.font(52, 800); const nx = jx + 58 + ctx.measureText(String(hu.jadeShown)).width;
      if (G.time - (G.satchelAt || -99) < 4) text(ctx, `${s.satchel.jade} beads left in ` + (ROOMS[s.satchel.room] ? ROOMS[s.satchel.room].name : '?'), nx, jy + 2, 22, '#ffe9a8', 'left', 700, 5);
      else {
        const sat = Assets.get('prop.satchel');
        if (sat) ctx.drawImage(sat.img, nx, jy - 20, 38, 38 * sat.img.height / sat.img.width); else { ctx.beginPath(); ctx.arc(nx + 16, jy, 11, 0, 7); D.inked(ctx, '#a07850', 3); }
        text(ctx, '+' + s.satchel.jade, nx + 44, jy + 2, 24, '#9be0a8', 'left', 800, 5);
      }
    }
  }
  drawHudFly(ctx);
  // Breath bar
  const mb = Flow.maxBreath(), bx = 46, by = 112, bw = 380 * mb / 100, bh = 26, low = p.noBreathT > 0 && Math.floor(G.time * 16) % 2 === 0;
  D.rr(ctx, bx, by, bw, bh, 13); D.inked(ctx, low ? '#6b2a2a' : '#2a2030', 5);
  ctx.save(); D.rr(ctx, bx + 3, by + 3, bw - 6, bh - 6, 10); ctx.clip();
  // Still Breath: the Breath it costs drains out of the bar as the heal fills
  const spend = p.healT > 0 && !p.bindDone ? healCost() * Math.min(1, p.healT / 0.24) : 0, keep = Math.max(0, p.breath - spend);
  ctx.fillStyle = '#bfe9f2'; ctx.fillRect(bx, by, bw * keep / mb, bh);
  if (spend > 0) { ctx.fillStyle = `rgba(255,179,166,${0.75 + 0.25 * Math.sin(G.time * 18)})`; ctx.fillRect(bx + bw * keep / mb, by, bw * (p.breath - keep) / mb, bh); }
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(bx, by + 4, bw * keep / mb, 5);
  // notches every 25 Breath so costs are easy to read
  ctx.fillStyle = 'rgba(29,20,32,0.5)';
  for (let v = 25; v < mb; v += 25) ctx.fillRect(bx + bw * v / mb - 1, by + 4, 3, bh - 8);
  ctx.restore();
  text(ctx, 'BREATH', bx + bw + 14, by + bh / 2 + 1, 18, 'rgba(243,236,223,0.85)', 'left', 700, 4);

  // the four carried moves (hidden until the first lesson); they fade back while the hero stands behind them
  const slotsOver = hx < 500 && hy > H - 220 && hy - 200 < H;
  G.slotA = (G.slotA ?? 1) + ((slotsOver ? 0.15 : 1) - (G.slotA ?? 1)) * 0.2;
  ctx.save(); ctx.globalAlpha = G.slotA;
  ctx.translate(0, H); ctx.scale(0.85, 0.85); ctx.translate(0, -H);   // v5: the row is 15% smaller
  if (s.moves.length && !Input.touchUI) for (let i = 0; i < 4; i++) {   // v15: on touch the bending arc shows them
    const cx = 92 + i * 116, cy = H - 96, id = s.slots[i];
    ctx.beginPath(); ctx.arc(cx, cy, 48, 0, 7); D.inked(ctx, 'rgba(29,20,32,0.82)', 5);
    if (id) {
      const cost = moveCost(id), ok = p.breath >= cost, half = p.focusT > 0;
      D.moveIcon(ctx, id, cx, cy, 38, { dim: !ok });
      if (half && ok) { ctx.beginPath(); ctx.arc(cx, cy, 46, 0, 7); ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,210,140,${0.5 + 0.4 * Math.sin(G.time * 16)})`; ctx.stroke(); }
      D.rr(ctx, cx - 24, cy + 36, 48, 26, 10); D.inked(ctx, ok ? (half ? '#ffd38a' : '#f3ecdf') : '#5a4a55', 4);
      text(ctx, String(cost), cx, cy + 50, 18, ok ? INK : '#c9b9c0', 'center', 800);
    } else {
      ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.arc(cx, cy, 34, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(243,236,223,0.3)'; ctx.stroke(); ctx.setLineDash([]);
    }
    const lab = slotGlyph(i), gw = D.glyphWidth(ctx, lab, 32);
    D.glyph(ctx, lab, cx - gw / 2, cy - 56, 32);
  }
  ctx.restore();

  // room name
  ctx.beginPath(); ctx.arc(W - 54, 58, 10, 0, 7); D.inked(ctx, room.reg.color, 4);
  text(ctx, room.name, W - 76, 59, 24, CREAM, 'right', 700, 5);

  // boss bar
  if (G.boss) {
    const e = G.boss.enemy, w = 820, x = (W - w) / 2, y = 96;
    const por = Assets.get('portrait.' + e.kind);
    if (por) {
      ctx.save(); ctx.beginPath(); ctx.arc(x - 56, y + 4, 50, 0, 7); ctx.fillStyle = '#241c2b'; ctx.fill(); ctx.clip();
      ctx.drawImage(por.img, x - 106, y - 46, 100, 100); ctx.restore();
      ctx.beginPath(); ctx.arc(x - 56, y + 4, 50, 0, 7); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
    }
    text(ctx, G.boss.name, W / 2, 62, 30, CREAM, 'center', 800, 6);
    D.rr(ctx, x, y, w, 24, 12); D.inked(ctx, '#2a2030', 5);
    ctx.save(); D.rr(ctx, x + 3, y + 3, w - 6, 18, 9); ctx.clip();
    ctx.fillStyle = e.phase >= 3 ? '#ffd36b' : e.phase === 2 ? '#f0742a' : '#e2574c'; ctx.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), 24);
    for (const th of e.phases || []) { ctx.fillStyle = INK; ctx.fillRect(x + w * th - 2, y, 4, 24); }
    if (e.poise != null && e.poiseMax) { ctx.fillStyle = '#e6cc94'; ctx.fillRect(x, y + 17, w * clamp(e.poise / e.poiseMax, 0, 1), 4); }
    ctx.restore();
  }

  if (G.state !== 'play') return;
  // v5: one message at a time at the top (see noticeHead in sim.js); nothing else during a boss's entrance or card
  const head = noticeHead(), bossMoment = !!(G.bossIntro || G.bossCard);
  if (G.boss && G.boss.line && !bossMoment) {   // a phase change: a short line under the boss bar
    const l = G.boss.line, a = clamp(Math.min(l.t / 0.25, (2.6 - l.t) / 0.5), 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    text(ctx, l.text, W / 2, 158, 38, '#ffe9a8', 'center', 800, 8);
    text(ctx, l.sub, W / 2, 198, 22, CREAM, 'center', 700, 5);
    ctx.restore();
  }
  // region name card
  const bigCard = head === 'card' && !G.card.small && !bossMoment;
  if (head !== 'card' || bossMoment) { /* waits its turn */ }
  else if (G.card && G.card.small) {
    const c = G.card, a = clamp(Math.min((c.t - 1.4) / 0.3, (3.6 - c.t) / 0.6), 0, 1);
    if (a > 0) { ctx.save(); ctx.globalAlpha = a; text(ctx, c.room, W / 2, 150, 40, CREAM, 'center', 800, 9); ctx.fillStyle = c.color; ctx.fillRect(W / 2 - 80, 180, 160, 4); ctx.restore(); }
  } else if (G.card) {
    const c = G.card, a = clamp(Math.min(c.t / 0.6, (3.6 - c.t) / 0.8), 0, 1);
    if (a > 0) {
      ctx.save(); ctx.globalAlpha = a;
      const y = 300, wob = (1 - Math.min(1, c.t / 0.6)) * 30;
      const g = ctx.createLinearGradient(W / 2 - 600, 0, W / 2 + 600, 0);
      g.addColorStop(0, 'rgba(14,8,18,0)'); g.addColorStop(0.5, 'rgba(14,8,18,0.55)'); g.addColorStop(1, 'rgba(14,8,18,0)');
      ctx.fillStyle = g; ctx.fillRect(W / 2 - 600, y - 90, 1200, 180);
      ctx.fillStyle = c.color; ctx.fillRect(W / 2 - 260 * Math.min(1, c.t * 2), y + 46, 520 * Math.min(1, c.t * 2), 5);
      text(ctx, c.region, W / 2, y - 8 - wob, 76, CREAM, 'center', 800, 12);
      if (c.room !== c.region) text(ctx, c.room, W / 2, y + 82, 30, '#ffe9a8', 'center', 700, 7);
      ctx.restore();
    }
  }


  // interact prompt above the thing (not while a boss is alive: its doors are shut anyway)
  // v8 (review 8 #9): also not during a defeat sequence (slow motion, victory breath, the lesson): only once control is back
  const want = near && !G.fade && !bossMoment && !G.attune && !G.teachHeal && !G.boss && !(G.time < (G.bossQuietUntil || 0)) && !(G.player.victoryT > 0 || G.player.victoryWant) && !fighting();
  // v9 (review 9 #7): the prompt fades in over 0.15 s once Joon has been beside the thing for 0.25 s, and out over 0.1 s
  const key = want ? near.type + ':' + near.label : null;
  if (key && key === G.promptKey) G.promptHold = (G.promptHold || 0) + DT; else { G.promptHold = 0; if (key) G.promptKey = key; }
  G.promptA = clamp((G.promptA || 0) + (key && G.promptHold > 0.25 ? DT / 0.15 : -DT / 0.1), 0, 1);
  if (key) G.promptLast = near;
  const prompting = G.promptA > 0 && G.promptLast;
  if (prompting) {
    near = G.promptLast; ctx.save(); ctx.globalAlpha = G.promptA;
    const str = `[[${Input.label(near.glyph || 'interact')}]] ${near.label}`, px = 26, bub = Assets.get('prop.bubble');   // v9: a passage shows the push that takes you through
    const w = D.richWidth(ctx, str, px) + 36, x = clamp(near.x - cam.x, w / 2 + 20, W - w / 2 - 20), y = clamp(near.y - cam.y + Math.sin(G.time * 4) * 4, 150, H - 200);
    // v6: the painted paper tag when it exists (dark ink on it), else the dark pill
    if (bub) { ctx.drawImage(bub.img, x - w / 2 - 14, y - 40, w + 28, 92); D.richText(ctx, str, x, y, px, INKT, 'center'); }
    else { D.rr(ctx, x - w / 2, y - 26, w, 52, 26); D.inked(ctx, 'rgba(29,20,32,0.88)', 4); D.richText(ctx, str, x, y, px, CREAM, 'center'); }
    ctx.restore();
  }

  // v11 (note 24/15): no prompt bar for the Still Breath lesson; the Elder's one line is enough
  // v10 (note 16): a caught shot: time crawls, the edges go cold and blue while you aim
  if (G.aim) {
    const k = Math.min(1, G.aim.t / 0.08), g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(120,190,230,0)'); g.addColorStop(1, `rgba(40,80,120,${0.45 * k})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // hint for where you stand. v6: never at the same time as an interact prompt (one message per
  // thing), and the "not carried" note is a second, smaller line instead of a long sentence
  const hint = bossMoment || prompting || G.attune || G.teachHeal ? null : Flow.activeHint();
  if (hint) {
    const raw = expand(hint.text), missing = raw.includes(NOT_CARRIED);
    const px = 28, lines = D.wrapRich(ctx, raw.replace(' ' + NOT_CARRIED, '').replace(NOT_CARRIED, ''), px, 980);
    const note = missing ? 'Not carried: meditate at a stone to equip it.' : null;
    const w = Math.max(...lines.map((l) => D.richWidth(ctx, l, px)), note ? D.richWidth(ctx, note, 22) : 0) + 64, h = lines.length * 46 + 26 + (note ? 32 : 0);
    const x = Input.touchUI ? (W - w) / 2 : Math.max((W - w) / 2, 520), y = Input.touchUI ? 196 : H - 30 - h;   // sits in the ground strip, clear of the move slots (v15: on touch, under the top bar, clear of the thumbs)
    D.rr(ctx, x, y, w, h, 18); ctx.fillStyle = 'rgba(29,20,32,0.8)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    lines.forEach((l, i) => D.richText(ctx, l, x + w / 2, y + 36 + i * 46, px, CREAM, 'center'));
    if (note) D.richText(ctx, note, x + w / 2, y + 36 + lines.length * 46 - 6, 22, '#bfe9f2', 'center');
  }

  if (!hint && !prompting && !bossMoment && !G.attune) drawTeach(ctx);   // v15 (owner note 71): one key at a time, as it's needed

  // messages share the top of the screen in separate bands: card, then toast, then banner
  let band = 178;
  if (head === 'toast') {
    const t = G.toast, a = clamp(Math.min(t.t / 0.5, (t.max - t.t) / 0.4), 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    const big = !!t.sub;
    text(ctx, t.text, W / 2, band, big ? 64 : 38, CREAM, 'center', 800, big ? 12 : 8);
    if (t.sub) text(ctx, t.sub, W / 2, band + 58, 30, '#ffe9a8', 'center', 700, 7);
    ctx.restore();
    band += big ? 120 : 64;
  } else band = 250;
  if (head === 'banner' && !bossMoment) {
    const b = G.banner, a = clamp(Math.min(b.t / 0.3, (b.max - b.t) / 0.15), 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = D.font(28); const w = ctx.measureText(b.text).width + 60;
    D.rr(ctx, (W - w) / 2, band, w, 54, 27); D.inked(ctx, 'rgba(29,20,32,0.9)', 4);
    text(ctx, b.text, W / 2, band + 28, 28, '#ffe9a8', 'center');
    ctx.restore();
  }
  // boss name card (intro): big, centred, under a pair of rules
  if (head === 'boss') {
    const c = G.bossCard;
    const a = clamp(Math.min(c.t / 0.4, (2.8 - c.t) / 0.6), 0, 1);
    if (a <= 0 && c.t > 1) G.bossCard = null;
    else {
      ctx.save(); ctx.globalAlpha = a;
      const y = H * 0.3, wob = (1 - Math.min(1, c.t / 0.4)) * 40;
      const g = ctx.createLinearGradient(W / 2 - 700, 0, W / 2 + 700, 0);
      g.addColorStop(0, 'rgba(14,8,18,0)'); g.addColorStop(0.5, 'rgba(14,8,18,0.62)'); g.addColorStop(1, 'rgba(14,8,18,0)');
      ctx.fillStyle = g; ctx.fillRect(W / 2 - 700, y - 100, 1400, 190);
      ctx.fillStyle = '#e2574c'; ctx.fillRect(W / 2 - 300 * Math.min(1, c.t * 2), y - 78, 600 * Math.min(1, c.t * 2), 4); ctx.fillRect(W / 2 - 300 * Math.min(1, c.t * 2), y + 66, 600 * Math.min(1, c.t * 2), 4);
      text(ctx, c.sub, W / 2, y - 44, 28, '#ffe9a8', 'center', 700, 7);
      text(ctx, c.name, W / 2 + wob, y + 14, 84, CREAM, 'center', 800, 14);
      ctx.restore();
    }
  }
  // the first time health is low: teach Still Breath
  if (p.hp <= 2 && p.hp < s.maxHp && !flag('tip-heal') && !flag('taught-heal') && G.state === 'play' && p.breath >= healCost() && !G.boss && !G.enemies.some((e) => !e.dead && Math.abs(e.x - p.x) < 900)) {
    // shown once: after 6 s on screen (or the first heal) it never comes back
    G.healTipT = (G.healTipT || 0) + DT;
    if (G.healTipT > 6) G.save.flags['tip-heal'] = 1;
    const str = Input.device() === 'pad' ? `[[${Input.label('heal')}]] with nothing near: heal` : `[[${Input.label('heal')}]] Heal: Breath mends your hearts`;   // v15: heal is a press now
    D.rr(ctx, W / 2 - 520, H - 190, 1040, 56, 28); ctx.fillStyle = 'rgba(29,20,32,0.85)'; ctx.fill();
    D.richText(ctx, str, W / 2, H - 162, 26, '#bfe9f2', 'center');
    if (p.healT > 0) G.save.flags['tip-heal'] = 1;
  }
}

function dimScreen(ctx, a = 0.62) { ctx.fillStyle = `rgba(14,8,18,${a})`; ctx.fillRect(0, 0, W, H); }

// --- title ---------------------------------------------------------------------------
export function openTitle() {
  G.save = loadSave();
  G.menu = { type: 'title', sel: 0, armed: false, t: 0 };
  G.state = 'title'; G.card = null;
  Sound.play('title');
}
const titleItems = () => (G.save && G.save.started ? ['Continue', 'New Game', 'Controls'] : ['New Game', 'Controls']);   // v15: the Controls page

export function updateTitle() {
  const m = G.menu, items = titleItems(), I = Input.pressed;
  m.t += DT;
  if (G.controls) { updateControls(); return; }
  if (I.up || I.down) { m.sel = (m.sel + (I.up ? items.length - 1 : 1)) % items.length; m.armed = false; blip(); }
  if (Input.anyPressed) Sound.nudge();
  if (m.waitLoad) { if (Assets.regionReady(ROOMS[G.save.room].region)) { m.waitLoad = false; Flow.startGame(false); } return; }
  if (pressedConfirm() && m.t > 0.2) {
    const it = items[m.sel];
    ok();
    if (it === 'Controls') openControls('title');
    else if (it === 'Continue' && ROOMS[G.save.room] && (Assets.want(ROOMS[G.save.room].region), !Assets.regionReady(ROOMS[G.save.room].region))) m.waitLoad = true;   // v9: wait for the far regions
    else if (it === 'Continue') Flow.startGame(false);
    else if (G.save && G.save.started && !m.armed) m.armed = true;
    else Flow.startGame(true);
  }
}

export function drawTitle(ctx) {
  const m = G.menu, t = G.uiTime, bg = Assets.get('ui.title') || Assets.get('bg.kite');
  if (bg) {
    const img = bg.img, sc = Math.max(W / img.width, H / img.height) * 1.03;
    ctx.drawImage(img, (W - img.width * sc) / 2 + Math.sin(t * 0.12) * 14, (H - img.height * sc) / 2 + Math.cos(t * 0.1) * 6, img.width * sc, img.height * sc);
  } else D.fallbackBg(ctx, REGIONS.kite.pal, W, H, t * 20, t);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(20,10,30,0.35)'); g.addColorStop(0.4, 'rgba(20,10,30,0.0)'); g.addColorStop(0.75, 'rgba(20,10,30,0.15)'); g.addColorStop(1, 'rgba(20,10,30,0.7)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (!Assets.get('ui.title')) {
    const f = Math.floor(t * 7) % 8;
    if (!Assets.drawChar(ctx, 'hero.idle', f, 380, 965, 1, { scale: 1.9 })) phHero(ctx, 'idle', f, 380, 960, 1, {}, t);
  }

  // logo in the open sky of the upper third
  const lx = W * 0.62, ly = 170;
  ctx.save();
  ctx.font = D.font(150, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 24; ctx.strokeStyle = INK; ctx.strokeText('Elementbound', lx, ly);
  ctx.fillStyle = '#2f6f7a'; ctx.fillText('Elementbound', lx, ly + 8);
  ctx.fillStyle = CREAM; ctx.fillText('Elementbound', lx, ly);
  ctx.restore();
  ['air', 'water', 'earth', 'fire'].forEach((el, i) => {
    const x = lx - 165 + i * 110, y = 300 + Math.sin(t * 2 + i) * 5;
    ctx.beginPath(); ctx.arc(x, y, 34, 0, 7); D.inked(ctx, '#241c2b', 5);
    D.elementSigil(ctx, el, x, y, 20, ELEMENTS[el].color, 5);
  });
  text(ctx, 'Four elements. One breath.', lx, 372, 32, '#ffe9a8', 'center', 600, 7);

  const items = titleItems(), mx = W - 380;
  items.forEach((it, i) => {
    const y = 700 + i * 84, sel = i === m.sel;
    const label = it === 'New Game' && m.armed && sel ? 'Erase the old journey?' : it;
    ctx.font = D.font(38);
    const w = Math.max(380, ctx.measureText(label).width + 90);
    D.rr(ctx, mx - w / 2, y - 34, w, 68, 34); D.inked(ctx, sel ? '#f3ecdf' : 'rgba(29,20,32,0.82)', 5);
    text(ctx, label, mx, y + 1, 34, sel ? INK : CREAM, 'center', 800);
  });
  D.richText(ctx, `[[${Input.label('confirm')}]] ${m.armed ? 'Press again to start over' : 'Begin'}`, mx, 700 + items.length * 84 + 6, 26, CREAM, 'center');
  // v8 (review 8 #12): a short keyboard line, and the sound line on its own row so the two never run together
  const dv = Input.device(), dev = dv === 'touch' ? 'Thumbstick on the left to move · Jump, Strike and Dash on the right · tap a choice' : dv === 'pad' ? 'Controller connected' : '← → move · Space jump · Z strike · X dash · A S D F bend · Q heal · Tab map · a controller works too';
  text(ctx, dev, W / 2, H - 36, 22, 'rgba(243,236,223,0.92)', 'center', 600, 5);
  if (G.controls) drawControls(ctx);
  if (Sound.locked && !G.controls) text(ctx, Input.device() === 'touch' ? 'Tap for sound' : 'Press any key or click for sound', W / 2, H - 70, 22, '#ffe9a8', 'center', 700, 5);
  if (G.menu && G.menu.waitLoad) text(ctx, `Unrolling the far regions... ${Math.round(Assets.regionProgress(ROOMS[G.save.room] ? ROOMS[G.save.room].region : 'misc') * 100)}%`, W / 2, H - 110, 24, CREAM, 'center', 700, 5);
  text(ctx, 'v0.14', W - 40, H - 36, 20, 'rgba(243,236,223,0.7)', 'right', 600, 4);
}

// --- pause ---------------------------------------------------------------------------
const PAUSE_ITEMS = ['Resume', 'Moves and lessons', 'Map', 'Controls', 'Music', 'Effects', 'Screen shake', 'Rumble', 'Quit to title'];   // v15: + Controls
const P_MUSIC = 4, P_SFX = 5, P_SHAKE = 6, P_RUMBLE = 7, P_QUIT = 8, P_Y0 = 284, P_DY = 66;
// v8 (review 8 #11): three voices instead of one pitched sample: young, elder, and a man inside a helmet
const TALK_VOICE = { joon: 'talk-young', child: 'talk-young', kesh: 'talk-young', elder: 'talk-elder', ren: 'talk-elder', tamsin: 'talk-elder', mapmaker: 'talk-elder', captain: 'talk-armor', soldier: 'talk-armor', shield: 'talk-armor', fisher: 'talk-elder', carrier: 'talk-elder', potter: 'talk-young', villager: 'talk-elder' };
export function openPause() { G.menu = { type: 'pause', sel: 0 }; G.state = 'pause'; Sound.sfx('pause-open'); }
const busOf = (i) => (i === P_MUSIC ? 'music' : i === P_SFX ? 'sfx' : null);
export function updatePause() {
  const m = G.menu, I = Input.pressed;
  if (G.controls) { updateControls(); return; }
  if (I.up) { m.sel = (m.sel + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length; blip(); m.armed = false; }
  if (I.down) { m.sel = (m.sel + 1) % PAUSE_ITEMS.length; blip(); m.armed = false; }
  if (I.pause || I.back) { G.state = 'play'; G.menu = null; Sound.sfx('pause-close'); return; }
  if (I.map) { openMap('pause'); return; }
  const bus = busOf(m.sel);
  if (bus && (I.left || I.right)) { Sound.setVolume(bus, Sound.prefs[bus] + (I.right ? 0.1 : -0.1)); Sound.sfx('ui-move'); return; }
  if ((m.sel === P_SHAKE || m.sel === P_RUMBLE) && (I.left || I.right)) { toggleOpt(m.sel); return; }
  if (pressedConfirm()) {
    ok();
    if (m.sel === 0) { G.state = 'play'; G.menu = null; Sound.sfx('pause-close'); }
    else if (m.sel === 1) openRecall('pause');
    else if (m.sel === 2) openMap('pause');
    else if (m.sel === 3) openControls('pause');
    else if (bus) Sound.setVolume(bus, Sound.prefs[bus] >= 1 ? 0 : Sound.prefs[bus] + 0.1);
    else if (m.sel === P_SHAKE || m.sel === P_RUMBLE) toggleOpt(m.sel);
    else if (!m.armed) m.armed = true;
    else { persist(); openTitle(); }
  }
}
function toggleOpt(i) {
  const k = i === P_SHAKE ? 'shake' : 'rumble';
  Sound.prefs[k] = Sound.prefs[k] ? 0 : 1; Sound.savePrefs(); G.shakeScale = Sound.prefs.shake ? 1 : 0.15; blip();
  if (k === 'rumble' && Sound.prefs.rumble) Sound.rumble(0.4, 0.4, 150);
}
export function drawPause(ctx) {
  const m = G.menu;
  dimScreen(ctx);
  D.panel(ctx, 260, 120, 1400, 840, { accent: 'rgba(243,236,223,0.25)' });
  text(ctx, 'Paused', 340, 200, 60, INKT, 'left', 800);
  PAUSE_ITEMS.forEach((it, i) => {
    const y = P_Y0 + i * P_DY, sel = i === m.sel, bus = busOf(i);
    D.rr(ctx, 340, y - 29, 460, 58, 29); D.inked(ctx, sel ? '#f3ecdf' : '#32283a', 5);
    if (bus) {
      text(ctx, it, 372, y + 1, 28, sel ? INK : CREAM, 'left', 800);
      const v = Sound.prefs[bus], sx = 560, sw = 200;
      D.rr(ctx, sx, y - 7, sw, 14, 7); ctx.fillStyle = sel ? '#c9bfae' : '#4a3f52'; ctx.fill();
      D.rr(ctx, sx, y - 7, sw * v, 14, 7); ctx.fillStyle = sel ? '#2f6f7a' : '#bfe9f2'; ctx.fill();
      ctx.beginPath(); ctx.arc(sx + sw * v, y, 13, 0, 7); D.inked(ctx, sel ? '#ffffff' : CREAM, 4);
    } else if (i === P_SHAKE || i === P_RUMBLE) {
      text(ctx, it, 372, y + 1, 28, sel ? INK : CREAM, 'left', 800);
      const on = !!Sound.prefs[i === P_SHAKE ? 'shake' : 'rumble'];
      text(ctx, on ? 'On' : 'Off', 770, y + 1, 26, sel ? INK : on ? '#bfe9f2' : DIM, 'right', 800);
    } else text(ctx, i === P_QUIT && m.armed && sel ? 'Leave? Unsaved steps are lost' : it, 570, y + 1, i === P_QUIT && m.armed && sel ? 22 : 30, sel ? INK : CREAM, 'center', 800);
  });
  // v9 (Connor's note 8): the Elder's counsel, always here when you are lost
  const goal = Flow.currentGoal();
  if (goal) {
    drawSpeaker(ctx, 'elder', 880, 770, 96);
    text(ctx, 'Elder Sora-Lin\'s counsel', 996, 790, 22, GOLD_INK, 'left', 800);
    D.wrapRich(ctx, goal.text, 26, 560).forEach((l, i) => D.richText(ctx, l, 996, 826 + i * 32, 26, INKT));
    text(ctx, goal.near, 996, 826 + D.wrapRich(ctx, goal.text, 26, 560).length * 32 + 4, 20, INK_DIM, 'left', 600);
  }
  text(ctx, 'Progress is kept at meditation stones.', 340, 878, 22, INK_DIM, 'left', 600);
  if (Input.device() === 'touch') D.richText(ctx, 'Tap a line to choose · tap a slider to set it · [[Back]] resumes', 340, 916, 22, INKT);
  else D.richText(ctx, `[[${Input.label('confirm')}]] Choose   [[${Input.label('move')}]] Adjust   [[${Input.label('back')}]] Resume`, 340, 916, 22, INKT);

  text(ctx, 'Controls', 880, 200, 34, GOLD_INK, 'left', 800);
  const L = (a) => `[[${Input.label(a)}]]`, s = G.save;
  const rows = [
    ['Move', L('move')], ['Jump (hold for height)', L('jump')], ['Strike (3-hit combo)', L('attack')],
    ['Down-strike (bounces)', `${L('down')} + ${L('attack')}`], ['Dash / sprint', `${L('dash')} / hold ${L('dash')}`], ['Interact', Input.device() === 'kb' ? `${L('interact')} / ${L('up')}` : L('interact')],
    ['Heal (Breath to hearts)', Input.device() === 'pad' ? `${L('heal')} with nothing near` : L('heal')],
    ['Carried moves', `${L('m0')} ${L('m1')} ${L('m2')} ${L('m3')}`], ['Drop through a plank', `${L('down')} + ${L('jump')}`],
    ['Ledge: climb / let go', `${L('up')} or ${L('jump')} / ${L('down')}`], ['Map', L('map')],
  ];
  if (s.abil.doubleJump) rows.splice(2, 0, ['Double jump', `${L('jump')} in the air`]);
  if (s.abil.glide) rows.splice(3, 0, ['Glide', `press and hold ${L('jump')} in the air`]);
  if (s.abil.grip) rows.splice(4, 0, ['Wall cling / wall jump', `hold toward a wall, ${L('jump')}`]);
  if (G.controls) { drawControls(ctx); return; }
  rows.forEach((r, i) => {
    const y = 252 + i * 34;   // v9: tighter, so the Elder's counsel fits below
    text(ctx, r[0], 880, y, 23, INKT, 'left', 600);
    D.richText(ctx, r[1], 1250, y, 21, INKT);
  });
}

// --- map -----------------------------------------------------------------------------
export function openMap(from) { G.menu = { type: 'map', from, t: 0, zoom: 1, pan: 0 }; G.state = 'map'; Sound.sfx('map-open'); }
export function updateMap() {
  const m = G.menu, I = Input.pressed, H2 = Input.held;
  m.t += DT;
  // up / down zoom in and out around where you are; left / right pan
  if (H2.up) m.zoom = Math.min(3, m.zoom * (1 + DT * 1.8));
  if (H2.down) m.zoom = Math.max(1, m.zoom / (1 + DT * 1.8));
  if (H2.left) m.pan -= DT * 1.2 / m.zoom;
  if (H2.right) m.pan += DT * 1.2 / m.zoom;
  if (m.zoom <= 1.001) m.pan = 0;
  if ((I.pin || I.attack) && !flag('shop-pins') && !(G.save.pins || []).length) { m.note = 'No pins yet. The Mapmaker at Chime Crossroads gives them away.'; m.noteT = 2.5; Sound.sfx('shop-deny'); }
  else if (I.pin || I.attack) {
    const id = G.room && G.room.id, pins = G.save.pins || (G.save.pins = []);
    const j = pins.indexOf(id);
    if (j >= 0) pins.splice(j, 1); else if (id) pins.push(id);
    persist(); Sound.sfx(j >= 0 ? 'map-close' : 'pin', j >= 0 ? { rate: 1.8, vol: 0.4 } : {});
  }
  if (m.t > 0.15 && (I.back || I.map || I.pause || pressedConfirm())) {
    Sound.sfx('map-close');
    if (m.from === 'pause') openPause(); else { G.state = 'play'; G.menu = null; }
  }
}
const GATE_COL = { crack: '#c39a5b', branch: '#f0742a', shutter: '#d7eef2', brass: '#b08d3c' };
export function drawMap(ctx) {
  const s = G.save, t = G.uiTime;
  dimScreen(ctx, 0.7);
  D.panel(ctx, 100, 90, 1720, 900, { accent: 'rgba(243,236,223,0.25)' });
  text(ctx, 'Map', 170, 170, 56, INKT, 'left', 800);
  if (drawWorldMap(ctx, G.menu || { zoom: 1, pan: 0 })) return;   // v15 (note 70): the illustrated map, once its art is in
  const ids = Object.keys(ROOMS).filter((id) => ROOMS[id].map), seen = ids.filter((id) => s.visited[id]);   // v8: rooms with no map cell (test rooms) never break the map
  const charted = (id) => !!(s.scrolls && s.scrolls[ROOMS[id].region]);
  // v9 (review 9 #11): where you are sits in the top bar beside the count
  text(ctx, `${seen.length} of ${ids.length} rooms found`, 1750, 150, 24, INK_DIM, 'right', 600);
  if (G.room) text(ctx, `You are in ${G.room.name}, ${G.room.reg.name}`, 1750, 184, 24, INKT, 'right', 700);
  const goal = Flow.currentGoal();

  const hinted = new Set();
  for (const id of seen) {
    for (const e of ROOMS[id].exits || []) if (!s.visited[e.to] && ROOMS[e.to] && ROOMS[e.to].map) hinted.add(e.to);
    for (const d of ROOMS[id].doors || []) if (!s.visited[d.to] && ROOMS[d.to] && ROOMS[d.to].map) hinted.add(d.to);
  }
  for (const id of ids) if (!s.visited[id] && charted(id)) hinted.add(id);
  // fit what you know of the world (not all of it) into the band, then zoom / pan
  const m = G.menu || { zoom: 1, pan: 0 }, known = [...seen, ...hinted];
  let mx0 = 1e9, my0 = 1e9, mx1 = -1e9, my1 = -1e9;
  for (const id of known.length ? known : ids) { const c = ROOMS[id].map; mx0 = Math.min(mx0, c[0]); my0 = Math.min(my0, c[1]); mx1 = Math.max(mx1, c[0] + c[2]); my1 = Math.max(my1, c[1] + c[3]); }
  const BAND_Y = 210, BAND_H = 530;   // v9: room under the parchment for the Elder's goal line
  const cell = Math.min(1560 / (mx1 - mx0), BAND_H / (my1 - my0), 150) * (m.zoom || 1), cw = cell, ch = cell;
  let gx = (W - (mx1 - mx0) * cw) / 2 - mx0 * cw, gy = BAND_Y - my0 * ch + (BAND_H - (my1 - my0) * ch) / 2;
  if ((m.zoom || 1) > 1 && G.room) {   // zoomed: centre on where you are
    const c = ROOMS[G.room.id].map, z = (m.zoom - 1) / 2;
    gx += ((W / 2 - (gx + (c[0] + c[2] / 2) * cw)) * Math.min(1, z)) - (m.pan || 0) * 1560;
    gy += (BAND_Y + BAND_H / 2 - (gy + (c[1] + c[3] / 2) * ch)) * Math.min(1, z);
  }
  const pad = Math.max(3, cell * 0.08);
  const rect = (id) => { const c = ROOMS[id].map; return { x: gx + c[0] * cw + pad, y: gy + c[1] * ch + pad, w: c[2] * cw - pad * 2, h: c[3] * ch - pad * 2 }; };
  // v8 (review 8 #10): the rooms are inked on parchment (the painted sheet when it exists, else a warm paper wash)
  const parch = Assets.get('ui.parchment');
  ctx.save(); D.rr(ctx, 130, BAND_Y - 6, 1660, BAND_H + 46, 16); ctx.clip();
  if (parch) ctx.drawImage(parch.img, 130, BAND_Y - 6, 1660, BAND_H + 46);
  else {
    const pg = ctx.createRadialGradient(W / 2, BAND_Y + BAND_H / 2, 200, W / 2, BAND_Y + BAND_H / 2, 950);
    pg.addColorStop(0, 'rgba(236,222,190,0.55)'); pg.addColorStop(1, 'rgba(170,140,100,0.45)'); ctx.fillStyle = pg; ctx.fillRect(130, BAND_Y - 30, 1660, BAND_H + 70);
    ctx.strokeStyle = 'rgba(120,90,60,0.12)'; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(130 + i * 415, BAND_Y - 30); ctx.lineTo(130 + i * 415, BAND_Y + BAND_H + 40); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(130, BAND_Y + BAND_H / 2); ctx.lineTo(1790, BAND_Y + BAND_H / 2); ctx.stroke();
  }
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(120, BAND_Y - 20, 1680, BAND_H + 50); ctx.clip();
  const icons = Assets.get('ui.mapicons');
  // painted map icons (stone, shrine, boss, mapmaker, door, pin, satchel, petal) once the sheet exists
  // v7: the delivered sheet is 8 tall cells (2688x1152); each icon is the square at the middle of its cell
  const icon = (i, x, y, sz) => { if (!icons) return false; const cw = icons.img.width / 8, sy = (icons.img.height - cw) / 2; ctx.drawImage(icons.img, i * cw, sy, cw, cw, x - sz / 2, y - sz / 2, sz, sz); return true; };
  // v9 (review 9 #11): a room not yet walked is a faint ink smudge (a charted one is pale wash with a dashed edge), never a box with a "?"
  const smudge = (r) => { ctx.save(); const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 2, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.6); g.addColorStop(0, 'rgba(44,30,24,0.32)'); g.addColorStop(1, 'rgba(44,30,24,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.6, r.h * 0.6, 0, 0, 7); ctx.fill(); ctx.restore(); };
  for (const id of hinted) {
    const r = rect(id);
    if (charted(id)) { D.rr(ctx, r.x, r.y, r.w, r.h, 8); ctx.fillStyle = D.hexA(REGIONS[ROOMS[id].region].color, 0.16); ctx.fill(); ctx.setLineDash([7, 7]); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(70,44,28,0.5)'; ctx.stroke(); ctx.setLineDash([]); }
    else smudge(r);
  }
  // the goal room, even before you have found it, and (with the Wayfinder's chart) every meditation stone
  if (goal && !s.visited[goal.room] && !hinted.has(goal.room)) smudge(rect(goal.room));
  if (s.flags['shop-wayfinder']) for (const id of ids) if (ROOMS[id].stone && !s.visited[id]) { const r = rect(id); if (!hinted.has(id)) smudge(r); ctx.save(); ctx.globalAlpha = 0.7; icon(0, r.x + r.w / 2, r.y + r.h * 0.62, Math.max(26, Math.min(44, cell * 0.4))); ctx.restore(); }
  // corridors between rooms you have seen
  // v6: door links between rooms are short ink strokes
  ctx.fillStyle = 'rgba(44,35,52,0.8)';
  for (const id of seen) {
    const def = ROOMS[id], r = rect(id);
    for (const e of def.exits || []) {
      const k = e.side === 'bottom' ? (e.range[0] + e.range[1]) / 2 / def.w : clamp((Math.max(0, e.range[0]) + Math.min(def.h, e.range[1])) / 2 / def.h, 0.1, 0.9);
      if (e.side === 'left') ctx.fillRect(r.x - pad - 2, r.y + r.h * k - 5, pad + 4, 10);
      else if (e.side === 'right') ctx.fillRect(r.x + r.w - 2, r.y + r.h * k - 5, pad + 4, 10);
      else ctx.fillRect(r.x + r.w * k - 5, r.y + r.h - 2, 10, pad + 4);
    }
  }
  for (const id of seen) {
    const def = ROOMS[id], r = rect(id), reg = REGIONS[def.region], here = G.room && G.room.id === id, full = charted(id);
    // v9 (review 9 #11): the region's colour washed straight onto the parchment, inked twice so the edge reads as brushed
    // v10 (Connor's note 21, review 10 #10): a room is inked only once Joon has rested at a stone since walking it;
    // until then it is a light pencil sketch (old saves without the record count as inked)
    const inked = !s.charted || s.charted[id] || here;
    if (!inked) {
      D.rr(ctx, r.x, r.y, r.w, r.h, 8); ctx.fillStyle = 'rgba(90,80,70,0.08)'; ctx.fill();
      ctx.setLineDash([10, 4, 3, 4]); D.rr(ctx, r.x, r.y, r.w, r.h, 8); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(80,70,64,0.55)'; ctx.stroke(); ctx.setLineDash([]);
    } else {
    D.rr(ctx, r.x, r.y, r.w, r.h, 8); ctx.fillStyle = D.hexA(reg.color, full ? 0.45 : 0.28); ctx.fill();
    D.rr(ctx, r.x, r.y, r.w, r.h, 8); ctx.lineWidth = 3; ctx.strokeStyle = full ? 'rgba(70,40,24,0.95)' : 'rgba(70,40,24,0.7)'; ctx.stroke();
    D.rr(ctx, r.x + 1, r.y + 1.5, r.w - 1, r.h - 1, 8); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(70,40,24,0.45)'; ctx.stroke();
    }
    const ks = Math.min(1, cell / 100);
    const at = (fx, fy) => [r.x + clamp(fx, 0.06, 0.94) * r.w, r.y + clamp(fy, 0.15, 0.9) * r.h];
    // doors and gates you have seen (colour = what opens them)
    if (full) for (const d of def.doors || []) { const [x, y] = at(d.x / def.w, d.y / def.h); const locked = d.lock && !s.flags[d.lock]; D.rr(ctx, x - 6 * ks, y - 14 * ks, 12 * ks, 14 * ks, 5 * ks); D.inked(ctx, locked ? '#6b5a4a' : '#ffe9a8', 2); }
    if (full) for (const g of def.gates || []) { if (!s.seen[g.id] || s.flags[g.id]) continue; const [x, y] = at((g.r[0] + g.r[2] / 2) / def.w, (g.r[1] + g.r[3] / 2) / def.h); ctx.beginPath(); ctx.moveTo(x, y - 9 * ks); ctx.lineTo(x + 9 * ks, y); ctx.lineTo(x, y + 9 * ks); ctx.lineTo(x - 9 * ks, y); ctx.closePath(); D.inked(ctx, GATE_COL[g.t] || '#fff', 2); }
    if (full) for (const k of def.pickups || []) { if (!k.id || s.flags[k.id]) continue; const [x, y] = at(k.x / def.w, k.y / def.h); ctx.beginPath(); ctx.arc(x, y, 6 * ks, 0, 7); D.inked(ctx, k.t === 'heart' ? '#e2574c' : k.t === 'mark' ? '#9be0a8' : '#bfe9f2', 2); }
    // v11 (Connor's note 25, review 11 #12): a barrier met and not yet opened keeps its painted mark on the map too
    for (const g of [...(def.gates || []), ...(def.wgaps || [])]) { if (!s.flags['seen-' + g.id] || s.flags[g.id] || (g.t === 'water' && s.moves.includes('icewall'))) continue; const kind = Flow.GATE_MARK[g.t]; if (!kind) continue; const [x, y] = at((g.r[0] + g.r[2] / 2) / def.w, (g.r[1] + g.r[3] / 2) / def.h); drawMark(ctx, kind, x, y, Math.max(28, 40 * ks)); }
    {   // v9 (review 9 #11): landmarks show for every room walked, charted or not
      if (def.stone && icon(0, ...at(def.stone.x / def.w, 0.72), Math.max(30, 44 * ks))) { /* painted */ }
      else if (def.stone) { const [x, y] = at(def.stone.x / def.w, 0.8); D.poly(ctx, [x, y - 12 * ks, x + 9 * ks, y, x, y + 12 * ks, x - 9 * ks, y]); D.inked(ctx, '#f3ecdf', 2); }
      if (def.shrine && icon(1, ...at(def.shrine.x / def.w, 0.68), Math.max(30, 44 * ks))) { /* painted */ }
      else if (def.shrine) { const [x, y] = at(def.shrine.x / def.w, 0.75); ctx.beginPath(); ctx.arc(x, y, 12 * ks, 0, 7); D.inked(ctx, '#241c2b', 2); D.elementSigil(ctx, def.shrine.el, x, y, 7 * ks, ELEMENTS[def.shrine.el].color, 2); }
      if (def.boss && def.boss.t !== 'ambush' && icons) { ctx.save(); ctx.globalAlpha = s.flags['boss-' + def.boss.t] ? 0.4 : 1; icon(2, ...at(0.5, 0.6), Math.max(34, 50 * ks)); ctx.restore(); }
      else if (def.boss && def.boss.t !== 'ambush') { const dead = s.flags['boss-' + def.boss.t]; const [x, y] = at(0.5, 0.7); D.poly(ctx, [x - 10 * ks, y + 10 * ks, x, y - 14 * ks, x + 10 * ks, y + 10 * ks]); D.inked(ctx, dead ? '#6b6470' : '#e2574c', 2); }
      if (full && cell >= 80) text(ctx, def.name, r.x + r.w / 2, r.y + r.h + 13, Math.max(20, Math.min(24, cell * 0.18)), 'rgba(243,236,223,0.85)', 'center', 700, 4);
    }
    if ((s.pins || []).includes(id) && icon(5, r.x + r.w - 12, r.y + 14, 30)) { /* painted */ }
    else if ((s.pins || []).includes(id)) { const x = r.x + r.w - 10, y = r.y + 12; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); D.inked(ctx, '#e2574c', 2); ctx.fillStyle = INK; ctx.fillRect(x - 1, y + 6, 3, 10); }
    if (here) {
      const k = 0.5 + 0.5 * Math.sin(t * 6);
      D.rr(ctx, r.x - 5, r.y - 5, r.w + 10, r.h + 10, 13); ctx.lineWidth = 5; ctx.strokeStyle = `rgba(192,57,43,${0.55 + 0.45 * k})`; ctx.stroke();
      const px = r.x + clamp(G.player.x / def.w, 0.08, 0.92) * r.w, py = r.y + clamp((G.player.y - 60) / def.h, 0.25, 0.8) * r.h;
      ctx.beginPath(); ctx.arc(px, py, 8 + k * 3, 0, 7); D.inked(ctx, '#ffffff', 3);
    }
  }
  // v9 (Connor's note 8): the Elder's goal, a pulsing gold ring on its room with the shrine or boss mark in it
  if (goal && ROOMS[goal.room].map) {
    const r = rect(goal.room), k = 0.5 + 0.5 * Math.sin(t * 4), gd = ROOMS[goal.room];
    D.rr(ctx, r.x - 8, r.y - 8, r.w + 16, r.h + 16, 14); ctx.lineWidth = 6; ctx.strokeStyle = `rgba(214,160,40,${0.55 + 0.45 * k})`; ctx.stroke();
    if (!s.visited[goal.room]) { const ix = r.x + r.w / 2, iy = r.y + r.h / 2, sz = Math.max(30, Math.min(50, cell * 0.45)); if (!(gd.shrine ? icon(1, ix, iy, sz) : gd.boss && gd.boss.t !== 'ambush' ? icon(2, ix, iy, sz) : false)) { ctx.beginPath(); ctx.arc(ix, iy, 9, 0, 7); D.inked(ctx, '#ffd36b', 3); } }
    text(ctx, 'Goal', r.x + r.w / 2, r.y - 22, 20, '#8a5a12', 'center', 800, 4);
  }
  if (s.satchel && s.visited[s.satchel.room]) { const r = rect(s.satchel.room); if (!icon(6, r.x + r.w / 2, r.y + r.h / 2, 36)) { ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 9, 0, 7); D.inked(ctx, '#7fd19a', 3); } }
  // v9 (review 9 #11): each region's name once, across its rooms
  for (const k of Object.keys(REGIONS)) {
    const mine = seen.filter((id) => ROOMS[id].region === k); if (!mine.length) continue;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const id of mine) { const r = rect(id); x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + r.h); }
    ctx.save(); ctx.globalAlpha = 0.5; text(ctx, REGIONS[k].name, (x0 + x1) / 2, y1 + 26, Math.max(22, Math.min(34, cell * 0.3)), '#3a2418', 'center', 800); ctx.restore();
  }
  ctx.restore();
  if (goal) text(ctx, 'Elder Sora-Lin: ' + goal.text, W / 2, 810, 24, '#8a5a12', 'center', 700);
  if (m.note && (m.noteT -= DT) > 0) text(ctx, m.note, W / 2, 800, 22, '#9a2e2a', 'center', 700);

  const regs = Object.keys(REGIONS);
  const cnt = (k, tp, got) => ids.filter((id) => ROOMS[id].region === k).reduce((n, id) => n + (ROOMS[id].pickups || []).filter((q) => q.t === tp && (!got || s.flags[q.id])).length, 0);
  // v7: each region's counters are measured before they are drawn and shrink to fit their column, so nothing clips
  const colW = 1640 / regs.length;
  regs.forEach((k, i) => {
    const x = 140 + i * colW, y = 862, total = ids.filter((id) => ROOMS[id].region === k).length, got = seen.filter((id) => ROOMS[id].region === k).length;
    D.rr(ctx, x, y - 16, 32, 32, 8); D.inked(ctx, REGIONS[k].color, 4);
    text(ctx, REGIONS[k].name, x + 44, y - 10, 22, s.scrolls && s.scrolls[k] ? INKT : INK_DIM, 'left', 700);
    const line = `Rooms ${got}/${total}  Petal ${cnt(k, 'heart', 1)}/${cnt(k, 'heart')}  Pearl ${cnt(k, 'bead', 1)}/${cnt(k, 'bead')}`;
    let fs = 20; for (; fs > 14; fs--) { ctx.font = D.font(fs, 600); if (ctx.measureText(line).width <= colW - 54) break; }
    text(ctx, line, x + 44, y + 18, fs, INK_DIM, 'left', 600);
  });
  let kx = 160; const ky = 940;
  for (const [g, label] of [['crack', 'Cracked floor'], ['branch', 'Thornwood'], ['shutter', 'Wind shutter'], ['brass', 'Brass gate']]) {
    ctx.beginPath(); ctx.moveTo(kx, ky - 9); ctx.lineTo(kx + 9, ky); ctx.lineTo(kx, ky + 9); ctx.lineTo(kx - 9, ky); ctx.closePath(); D.inked(ctx, GATE_COL[g], 2);
    text(ctx, label, kx + 18, ky, 19, INK_DIM, 'left', 600); kx += 186;
  }
  D.rr(ctx, kx - 6, ky - 14, 12, 14, 5); D.inked(ctx, '#ffe9a8', 2); text(ctx, 'Passage', kx + 16, ky, 19, INK_DIM, 'left', 600); kx += 120;
  const foot = `[[${Input.label('up')}]][[${Input.label('down')}]] Zoom  [[${Input.label('left')}]][[${Input.label('right')}]] Pan  [[${Input.label('pin')}]] Pin  [[${Input.label('back')}]] Close`;
  D.richText(ctx, foot, 1770 - D.richWidth(ctx, foot, 22), ky, 22, INKT);
}

// --- equip (meditation): carried moves and the Fourfold Path ---------------------------
function assign(i, id) {
  const sl = G.save.slots, j = sl.indexOf(id);
  if (j >= 0) sl[j] = sl[i];
  sl[i] = id;
  persist();
  Sound.sfx('equip-set');
}
const PATH_COLS = ['air', 'water', 'earth', 'fire'];
const pathCol = (el) => SKILLS.filter((k) => k.el === el);
// v15 (Connor's note 69): the earth and fire steps stay shut until that element is learned (at its shrine)
const EL_MOVES = { earth: ['slam', 'stonewall'], fire: ['fireblast', 'flamering'] };
const SHRINE_OF = { earth: 'Old Tamsin\'s shrine in Ninefold Quarry', fire: 'Kesh\'s Ember Shrine in Kilnmouth' };
export const pathLocked = (el) => !!EL_MOVES[el] && !EL_MOVES[el].some((id) => G.save.moves.includes(id));
export function updateEquip() {
  const m = G.menu, s = G.save, I = Input.pressed;
  m.t += DT;
  const tabs = travelOpen() ? ['moves', 'path', 'travel'] : ['moves', 'path'];
  if (I.tab) { m.tab = tabs[(tabs.indexOf(m.tab || 'moves') + 1) % tabs.length]; m.mode = 'grid'; m.note = m.view ? m.note : ''; Sound.sfx('tab-switch'); return; }
  if (m.view) {   // v14: the inventory is read-only away from a stone
    if (I.confirm || SLOT_ACTIONS.some((a) => I[a])) { m.note = 'Look only: change moves and walk the Path at a meditation stone.'; Sound.sfx('no-breath', { gap: 0.3 }); return; }
    if (m.t > 0.2 && (I.back || I.pause || I.interact)) { G.state = 'play'; G.menu = null; return; }
  }
  if (m.tab === 'travel') {
    const list = stoneRooms();
    m.tsel = clamp(m.tsel || 0, 0, list.length - 1);
    if (I.up) m.tsel = (m.tsel + list.length - 1) % list.length;
    if (I.down) m.tsel = (m.tsel + 1) % list.length;
    if (I.confirm && list.length) {
      const id = list[m.tsel], st = ROOMS[id].stone;
      if (G.room.id === id) { m.note = 'You are here.'; return; }
      ok(); G.state = 'play'; G.menu = null;
      Sound.sfx('wind-road');
      Flow.transition(id, st.x, st.y);
    } else if (m.t > 0.2 && (I.back || I.pause || I.interact)) { persist(); G.state = 'play'; G.menu = null; }
    return;
  }
  if (I.left || I.right || I.up || I.down) blip();
  if (m.tab === 'path') {
    m.col = m.col || 0; m.row = m.row || 0;
    if (I.left) m.col = (m.col + 3) % 4;
    if (I.right) m.col = (m.col + 1) % 4;
    const list = pathCol(PATH_COLS[m.col]);
    if (I.up) m.row = (m.row + list.length - 1) % list.length;
    if (I.down) m.row = (m.row + 1) % list.length;
    m.row = Math.min(m.row, list.length - 1);
    const k = list[m.row];
    if (I.confirm) {
      s.skills = s.skills || {};
      if (s.skills[k.id]) { m.note = 'Already walked.'; Sound.sfx('no-breath'); }
      else if (pathLocked(k.el)) { m.note = `Learn ${ELEMENTS[k.el].name} first.`; Sound.sfx('no-breath'); }
      else if (k.needs && !s.skills[k.needs]) { m.note = 'Walk the step above it first.'; Sound.sfx('no-breath'); }
      else if ((s.marks || 0) < k.cost) { m.note = `Needs ${k.cost} Spirit Mark${k.cost > 1 ? 's' : ''}.`; Sound.sfx('no-breath'); }
      else { s.marks -= k.cost; s.skills[k.id] = 1; persist(); m.note = k.name + ': learned.'; Sound.sfx('skill-learn'); m.pulseT = 0.5; }
    } else if (m.t > 0.2 && (I.back || I.pause || I.interact)) { persist(); G.state = 'play'; G.menu = null; }
    if (m.pulseT > 0) m.pulseT -= DT;
    return;
  }
  const id = MOVE_ORDER[m.sel], have = s.moves.includes(id);
  if (I.confirm) ok();
  if (m.mode === 'grid') {
    if (I.left) m.sel = m.sel % 4 === 0 ? m.sel + 3 : m.sel - 1;
    if (I.right) m.sel = m.sel % 4 === 3 ? m.sel - 3 : m.sel + 1;
    if (I.up || I.down) m.sel = (m.sel + 4) % 8;
    for (let i = 0; i < 4; i++) if (I[SLOT_ACTIONS[i]] && have) { assign(i, id); m.pulse = i; m.pulseT = 0.3; }
    if (I.confirm && have) { m.mode = 'slot'; m.slot = Math.max(0, s.slots.indexOf(id)); }
    else if (m.t > 0.2 && (I.back || I.pause || I.interact)) { persist(); G.state = 'play'; G.menu = null; }
  } else {
    if (I.left) m.slot = (m.slot + 3) % 4;
    if (I.right) m.slot = (m.slot + 1) % 4;
    if (I.confirm) { assign(m.slot, id); m.pulse = m.slot; m.pulseT = 0.3; m.mode = 'grid'; }
    else if (I.back || I.pause) m.mode = 'grid';
  }
  if (m.pulseT > 0) m.pulseT -= DT;
}
export function skillIcon(ctx, i, x, y, r, dim = false) {
  const it = Assets.get('ui.skills');
  ctx.save(); if (dim) ctx.globalAlpha *= 0.35;
  if (it) { const img = it.img, w = img.width / 10; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip(); ctx.drawImage(img, i * w + w * 0.04, (img.height - w) / 2 + w * 0.04, w * 0.92, w * 0.92, x - r, y - r, r * 2, r * 2); }
  else { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); D.inked(ctx, '#4f8c9c', 4); }
  ctx.restore();
}
// Fast travel between meditation stones you have rested at, once the wind can carry you (Glide).
const travelOpen = () => !!G.save.abil.glide;
const stoneRooms = () => Object.keys(ROOMS).filter((id) => ROOMS[id].stone && G.save.visited[id]);
function drawTabs(ctx, m) {
  const tabs = [['moves', 'Carried moves'], ['path', 'Fourfold Path']];
  if (travelOpen()) tabs.push(['travel', 'Wind road']);
  const tw = 250;
  tabs.forEach(([k, label], i) => {
    const x = 700 + i * (tw + 16), on = (m.tab || 'moves') === k;
    D.rr(ctx, x, 150, tw, 56, 28); D.inked(ctx, on ? '#f3ecdf' : '#32283a', 4);
    text(ctx, label, x + tw / 2, 179, 22, on ? INK : CREAM, 'center', 800);
  });
  D.richText(ctx, `[[${Input.label('tab')}]] switch`, 700 + tabs.length * (tw + 16), 179, 20, INK_DIM);
}
// v8 (review 8 #10): the wind road is a picture of the five regions joined by one road, with a marker on every rest
// stone (the painted map when it exists, else an inked road), and the list of stones beside it.
const ROAD = { kite: [0.12, 0.76], drowned: [0.27, 0.68], quarry: [0.45, 0.56], kiln: [0.68, 0.42], brass: [0.9, 0.2] };   // on the painted landmarks
function drawTravel(ctx, m) {
  text(ctx, 'The wind road: rest at one stone, rise at another.', 280, 250, 26, TEAL_INK, 'left', 600);
  if (m.note) text(ctx, m.note, 1640, 250, 22, GOLD_INK, 'right', 600);
  const mx = 280, my = 290, mw = 760, mh = 560, art = Assets.get('ui.windroad');
  ctx.save(); D.rr(ctx, mx, my, mw, mh, 18); ctx.clip();
  if (art) ctx.drawImage(art.img, mx, my, mw, mh);
  else {
    ctx.fillStyle = '#e9dcbc'; ctx.fillRect(mx, my, mw, mh);
    const P = (r) => [mx + ROAD[r][0] * mw, my + ROAD[r][1] * mh], order = ['kite', 'drowned', 'quarry', 'kiln', 'brass'];
    ctx.beginPath(); ctx.moveTo(...P('kite'));
    for (let i = 1; i < order.length; i++) { const [ax, ay] = P(order[i - 1]), [bx, by] = P(order[i]); ctx.bezierCurveTo(ax + 90, ay, bx - 90, by, bx, by); }
    ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(120,88,52,0.35)'; ctx.stroke(); ctx.lineWidth = 4; ctx.setLineDash([14, 10]); ctx.strokeStyle = 'rgba(80,56,36,0.8)'; ctx.stroke(); ctx.setLineDash([]);
    for (const r of order) { const [x, y] = P(r); ctx.beginPath(); ctx.ellipse(x, y + 8, 58, 26, 0, 0, 7); ctx.fillStyle = D.hexA(REGIONS[r].color, 0.35); ctx.fill(); text(ctx, REGIONS[r].name, x, y + 52, 20, 'rgba(60,40,30,0.85)', 'center', 800); }
  }
  ctx.restore();
  D.rr(ctx, mx, my, mw, mh, 18); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
  const list = stoneRooms(), per = {};
  list.forEach((id, i) => {
    const def = ROOMS[id], n = per[def.region] = (per[def.region] || 0) + 1, sel = i === (m.tsel || 0), here = G.room.id === id;
    const [rx, ry] = ROAD[def.region] || [0.5, 0.5], x = mx + rx * mw + (n - 1) * 30 - 10, y = my + ry * mh - 10 - (n - 1) * 18;
    ctx.beginPath(); ctx.arc(x, y, sel ? 15 + Math.sin(G.uiTime * 6) * 2 : 11, 0, 7); D.inked(ctx, sel ? '#fff3c4' : here ? '#9be0a8' : REGIONS[def.region].color, 4);
    const ly = 320 + i * 54;
    D.rr(ctx, 1070, ly - 23, 570, 46, 18); D.inked(ctx, sel ? '#f3ecdf' : '#32283a', 4);
    ctx.beginPath(); ctx.arc(1100, ly, 9, 0, 7); D.inked(ctx, REGIONS[def.region].color, 3);
    text(ctx, def.name, 1124, ly + 1, 24, sel ? INK : CREAM, 'left', 800);
    text(ctx, here ? 'You are here' : REGIONS[def.region].name, 1620, ly + 1, 19, sel ? INK : DIM, 'right', 700);
  });
  D.richText(ctx, `[[${Input.label('move')}]] Choose   [[${Input.label('confirm')}]] Travel   [[${Input.label('back')}]] Rise`, W / 2, 920, 24, INKT, 'center');
}
export function drawEquip(ctx) {
  const m = G.menu, s = G.save, t = G.uiTime;
  dimScreen(ctx);
  D.panel(ctx, 210, 110, 1500, 860, { accent: 'rgba(191,233,242,0.3)' });
  text(ctx, 'Meditation', 280, 190, 56, INKT, 'left', 800);
  drawTabs(ctx, m);
  if (m.tab === 'path') { drawPath(ctx, m, s, t); return; }
  if (m.tab === 'travel') { drawTravel(ctx, m); return; }
  if (m.note) text(ctx, m.note, 280, 246, 26, TEAL_INK, 'left', 600);

  if (m.mode !== 'slot') text(ctx, 'CARRIED', 280, 292, 22, INK_DIM, 'left', 800);
  for (let i = 0; i < 4; i++) {
    const cx = 350 + i * 190, cy = 410, id = s.slots[i], pick = m.mode === 'slot' && m.slot === i;
    const pulse = m.pulse === i && m.pulseT > 0 ? m.pulseT / 0.3 : 0;
    ctx.beginPath(); ctx.arc(cx, cy, 66 + pulse * 10, 0, 7); D.inked(ctx, pick ? '#f3ecdf' : '#32283a', 5);
    if (id) D.moveIcon(ctx, id, cx, cy, 52);
    const lab = slotGlyph(i), gw = D.glyphWidth(ctx, lab, 36);
    D.glyph(ctx, lab, cx - gw / 2, cy - 74, 36);
    text(ctx, id ? MOVES[id].name : 'Empty', cx, cy + 92, 22, id ? INKT : INK_DIM, 'center', 700);
    if (pick) { const yy = cy - 118 + Math.sin(t * 8) * 6; D.poly(ctx, [cx - 16, yy - 14, cx + 16, yy - 14, cx, yy + 8]); D.inked(ctx, '#ffe9a8', 4); }
  }
  text(ctx, 'KNOWN MOVES', 280, 560, 22, INK_DIM, 'left', 800);
  MOVE_ORDER.forEach((id, n) => {
    const cx = 350 + (n % 4) * 190, cy = 660 + Math.floor(n / 4) * 170, have = s.moves.includes(id), sel = n === m.sel;
    if (sel) { ctx.beginPath(); ctx.arc(cx, cy, 70 + Math.sin(t * 6) * 3, 0, 7); ctx.lineWidth = 7; ctx.strokeStyle = m.mode === 'grid' ? INKT : 'rgba(44,35,52,0.4)'; ctx.stroke(); }
    if (have) {
      D.moveIcon(ctx, id, cx, cy, 54);
      const j = s.slots.indexOf(id);
      if (j >= 0) { const lab = slotGlyph(j), gw = D.glyphWidth(ctx, lab, 28); D.glyph(ctx, lab, cx + 50 - gw / 2, cy + 44, 28); }
    } else {
      ctx.beginPath(); ctx.arc(cx, cy, 54, 0, 7); D.inked(ctx, '#2a2231', 5);
      text(ctx, '?', cx, cy + 2, 46, '#5a5063', 'center', 800);
    }
  });
  const id = MOVE_ORDER[m.sel], mv = MOVES[id], E = ELEMENTS[mv.el], have = s.moves.includes(id);
  D.panel(ctx, 1110, 290, 540, 560, { plain: true, fill: '#2c2334', accent: D.hexA(E.color, 0.5), lw: 5 });
  if (have) {
    D.moveIcon(ctx, id, 1200, 390, 58);
    text(ctx, mv.name, 1280, 372, 38, CREAM, 'left', 800);
    text(ctx, `${E.name}  ·  ${moveCost(id)} Breath`, 1280, 418, 24, E.color, 'left', 700);
    D.wrapRich(ctx, mv.desc, 26, 460).forEach((l, i) => D.richText(ctx, l, 1150, 500 + i * 40, 26, CREAM));
    const j = s.slots.indexOf(id);
    D.richText(ctx, j >= 0 ? `Carried on [[${slotGlyph(j)}]]` : 'Not carried', 1150, 790, 24, j >= 0 ? '#bfe9f2' : DIM);
  } else {
    ctx.beginPath(); ctx.arc(1200, 390, 58, 0, 7); D.inked(ctx, '#2a2231', 5);
    D.elementSigil(ctx, mv.el, 1200, 390, 30, D.hexA(E.color, 0.6), 5);
    text(ctx, 'Not yet learned', 1280, 372, 34, DIM, 'left', 800);
    text(ctx, `${/^[aeiou]/i.test(E.name) ? 'An' : 'A'} ${E.name.toLowerCase()} technique`, 1280, 418, 24, E.color, 'left', 700);
    const where = { water: 'Mother Ren\'s shrine, below the West Gate', earth: 'Old Tamsin\'s shrine, deep in the quarry', fire: 'the Ember Shrine in Kilnmouth', air: 'the Shrine of Wind' }[mv.el];
    D.wrapRich(ctx, `Learned at ${where}.`, 26, 460).forEach((l, i) => D.richText(ctx, l, 1150, 500 + i * 40, 26, DIM));
  }
  const L = (a) => `[[${Input.label(a)}]]`;
  const foot = Input.device() === 'touch' ? (m.view ? 'Look only: change moves at a meditation stone    [[Back]] Close' : 'Tap a move, then tap a slot above to carry it there    [[Back]] Rise')
    : m.mode === 'grid'
    ? `${L('m0')} ${L('m1')} ${L('m2')} ${L('m3')} Put it on that button    ${L('confirm')} Pick a slot    ${L('back')} Rise`
    : `${L('move')} Pick a slot    ${L('confirm')} Place it    ${L('back')} Cancel`;
  D.richText(ctx, foot, W / 2, 920, 24, INKT, 'center');
}
function drawPath(ctx, m, s, t) {
  text(ctx, `Spirit Marks: ${s.marks || 0}`, 280, 250, 30, GREEN_INK, 'left', 800);
  if (m.note) text(ctx, m.note, 620, 250, 24, TEAL_INK, 'left', 600);
  const names = { air: 'Air (the core)', water: 'Water', earth: 'Earth', fire: 'Fire' };
  // v8 (review 8 #10): the Path sits on a board: the painted one when it exists, else four lacquered panels, each
  // washed in its element's colour, so the columns read as four roads
  const board = Assets.get('ui.pathboard'), bx = 228, by = 282, bw = 980, bh = 620;
  if (board) { ctx.save(); D.rr(ctx, bx, by, bw, bh, 18); ctx.clip(); ctx.drawImage(board.img, bx, by, bw, bh); ctx.restore(); }
  else PATH_COLS.forEach((el, c) => {
    const x = 350 + c * 245, g = ctx.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, D.hexA(ELEMENTS[el].color, 0.28)); g.addColorStop(0.5, D.hexA(ELEMENTS[el].color, 0.1)); g.addColorStop(1, D.hexA(ELEMENTS[el].color, 0.04));
    D.rr(ctx, x - 112, by, 224, bh, 16); ctx.fillStyle = '#2a2131'; ctx.fill(); ctx.fillStyle = g; ctx.fill();
    D.rr(ctx, x - 112, by, 224, bh, 16); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(214,176,104,0.55)'; ctx.stroke();
  });
  // a brushed stroke from each step to the one it needs: bright and solid once walked, a dim dotted trail before
  const pos = {};
  PATH_COLS.forEach((el, c) => pathCol(el).forEach((k, r) => { pos[k.id] = [350 + c * 245, 452 + r * 126]; }));
  const brush = (x1, y1, x2, y2, w, col) => {
    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12, my = (y1 + y2) / 2;
    for (const [lw, a] of [[w * 1.9, 0.25], [w, 1], [w * 0.4, 0.6]]) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.strokeStyle = a === 0.6 ? 'rgba(255,248,230,0.45)' : D.hexA(col, a); ctx.stroke();
    }
  };
  for (const k of SKILLS) if (k.needs && pos[k.id] && pos[k.needs]) {
    const [x1, y1] = pos[k.needs], [x2, y2] = pos[k.id], walked = s.skills && s.skills[k.needs] && s.skills[k.id];
    if (walked) brush(x1, y1 + 60, x2, y2 - 60, 8, ELEMENTS[k.el].color);
    else { ctx.beginPath(); ctx.moveTo(x1, y1 + 60); ctx.lineTo(x2, y2 - 60); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(214,200,180,0.35)'; ctx.setLineDash([2, 12]); ctx.stroke(); ctx.setLineDash([]); }
  }
  PATH_COLS.forEach((el, c) => {
    // v4: bigger nodes, four columns across the panel
    const x = 350 + c * 245, E = ELEMENTS[el];
    ctx.beginPath(); ctx.arc(x, 318, 30, 0, 7); D.inked(ctx, '#241c2b', 4); D.elementSigil(ctx, el, x, 318, 18, E.color, 4);
    text(ctx, names[el], x, 370, 24, elInk(el), 'center', 800);
    pathCol(el).forEach((k, r) => {
      const y = 452 + r * 126, owned = s.skills && s.skills[k.id], avail = !owned && !pathLocked(el) && (!k.needs || (s.skills && s.skills[k.needs]));
      const sel = m.col === c && m.row === r;
      if (sel) { ctx.beginPath(); ctx.arc(x, y, 64 + Math.sin(t * 6) * 3, 0, 7); ctx.lineWidth = 6; ctx.strokeStyle = INKT; ctx.stroke(); }
      skillIcon(ctx, k.icon, x, y, 56, !owned && !avail);
      if (owned) { ctx.beginPath(); ctx.arc(x, y, 58, 0, 7); ctx.lineWidth = 5; ctx.strokeStyle = E.color; ctx.stroke(); }
      if (!owned && !pathLocked(el)) { D.rr(ctx, x + 30, y + 22, 40, 32, 10); D.inked(ctx, '#2a2030', 3); text(ctx, String(k.cost), x + 50, y + 39, 22, '#9be0a8', 'center', 800); }
    });
    if (pathLocked(el)) text(ctx, 'Sealed: learn ' + ELEMENTS[el].name, x, 404, 19, DIM, 'center', 700);
  });
  const k = pathCol(PATH_COLS[m.col || 0])[m.row || 0], owned = s.skills && s.skills[k.id];
  D.panel(ctx, 1250, 290, 430, 580, { plain: true, fill: '#2c2334', accent: D.hexA(ELEMENTS[k.el].color, 0.5), lw: 5 });
  skillIcon(ctx, k.icon, 1325, 370, 48);
  text(ctx, k.name, 1390, 358, 30, CREAM, 'left', 800);
  text(ctx, owned ? 'Walked' : pathLocked(k.el) ? 'Sealed' : `${k.cost} Spirit Mark${k.cost > 1 ? 's' : ''}`, 1390, 398, 22, owned ? '#9be0a8' : '#ffe9a8', 'left', 700);
  D.wrapRich(ctx, k.desc, 26, 370).forEach((l, i) => D.richText(ctx, l, 1282, 470 + i * 40, 26, CREAM));
  if (pathLocked(k.el)) D.wrapRich(ctx, `Sealed until you learn ${ELEMENTS[k.el].name}, at ${SHRINE_OF[k.el]}.`, 22, 370).forEach((l, i) => text(ctx, l, 1282, 680 + i * 30, 22, '#ffb38a', 'left', 700));
  else if (k.needs && !(s.skills && s.skills[k.needs])) text(ctx, 'Needs: ' + SKILLS.find((q) => q.id === k.needs).name, 1282, 680, 22, DIM, 'left', 600);
  D.wrapRich(ctx, 'Bosses and hidden places give Spirit Marks.', 20, 370).forEach((l, i) => text(ctx, l, 1282, 800 + i * 28, 20, DIM, 'left', 600));
  D.richText(ctx, `[[${Input.label('move')}]] Choose   [[${Input.label('confirm')}]] Walk this step   [[${Input.label('back')}]] Rise`, W / 2, 920, 24, INKT, 'center');
}

// --- lesson popup ----------------------------------------------------------------------
export function updateLesson(dt) {
  const l = G.lesson;
  l.t += dt;
  if (l.t > 0.6 && (pressedConfirm() || Input.pressed.back)) {
    ok();
    G.state = 'play'; G.lesson = null;
    if (l.then) l.then();
  }
}
export function drawLesson(ctx, lesson = G.lesson, o = {}) {
  const l = lesson, E = ELEMENTS[l.el], s = G.save;
  if (!o.noDim) dimScreen(ctx, 0.55);
  const w = 1080, h = 230 + l.items.length * 160 + 70, x = (W - w) / 2, y = (H - h) / 2 + (o.dy || 0);
  const k = clamp(l.t / 0.25, 0, 1);
  const INKT = '#2a2030', BODY = '#4a3d4c', KEYC = '#7a4a1a';
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(0.92 + 0.08 * k, 0.92 + 0.08 * k); ctx.translate(-W / 2, -H / 2); ctx.globalAlpha = k;
  // v5: lessons are written on paper, not a settings panel; a new move shows big, with its effect playing
  D.panel(ctx, x, y, w, h, { paper: true });
  const hero = l.items.length && l.items[0].move;
  if (hero) {
    const fxKey = 'fx.' + hero, f = Math.floor(G.uiTime * 12) % 8;
    ctx.save(); ctx.beginPath(); ctx.arc(x + w - 150, y + 118, 96, 0, 7); ctx.fillStyle = 'rgba(42,32,48,0.88)'; ctx.fill(); ctx.clip();
    Assets.drawFx(ctx, fxKey, f, x + w - 150, y + 118, 230, 1);
    ctx.restore();
    ctx.beginPath(); ctx.arc(x + w - 150, y + 118, 96, 0, 7); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    D.moveIcon(ctx, hero, x + 120, y + 118, 80);
  } else {
    ctx.beginPath(); ctx.arc(x + 110, y + 112, 60, 0, 7); D.inked(ctx, '#2c2334', 5);
    D.elementSigil(ctx, l.el, x + 110, y + 112, 34, E.color, 6);
  }
  text(ctx, l.title, x + 230, y + 92, 52, INKT, 'left', 800);
  text(ctx, l.sub || 'A lesson of ' + E.name.toLowerCase(), x + 230, y + 146, 26, l.el === 'air' ? '#3d6f7d' : E.dark, 'left', 700);
  l.items.forEach((it, i) => {
    const iy = y + 270 + i * 160;
    D.rr(ctx, x + 50, iy - 66, w - 100, 136, 12); ctx.fillStyle = 'rgba(120,90,50,0.10)'; ctx.fill();
    if (it.move) D.moveIcon(ctx, it.move, x + 120, iy, 46);
    else if (it.icon != null) skillIcon(ctx, it.icon, x + 120, iy, 46);
    else { ctx.beginPath(); ctx.arc(x + 120, iy, 46, 0, 7); D.inked(ctx, E.dark, 5); D.elementSigil(ctx, l.el, x + 120, iy, 24, '#fbf6ea', 5); }
    text(ctx, it.name, x + 194, iy - 28, 34, INKT, 'left', 800);
    let btn = '';
    if (it.move) { const j = s.slots.indexOf(it.move); btn = j >= 0 ? `[[${slotGlyph(j)}]]   ${moveCost(it.move)} Breath` : `Not carried   ${MOVES[it.move].cost} Breath`; }
    else if (it.keys) btn = expand(it.keys);
    else if (it.action) btn = `[[${Input.label(it.action)}]]${it.hold ? '  hold in the air' : ''}`;
    if (btn) D.richText(ctx, btn, x + w - 80 - D.richWidth(ctx, btn, 26), iy - 28, 26, KEYC);
    const body = it.move ? MOVES[it.move].desc : it.text || '';
    D.wrapRich(ctx, expand(body), 24, w - 300).slice(0, 2).forEach((ln, n) => D.richText(ctx, ln, x + 194, iy + 18 + n * 32, 24, BODY));
  });
  if (!o.noFoot && l.t > 0.6) D.richText(ctx, `[[${Input.label('confirm')}]] Continue`, W / 2, y + h - 48, 26, INKT, 'center');
  ctx.restore();
}

// --- hold △: recall every lesson learned, the body's skills, and the carried moves -------
function recallPages() {
  const s = G.save, pages = [];
  const L = (s.lessons || []).slice().reverse();
  for (const id of L) if (LESSONS[id]) pages.push({ ...LESSONS[id], t: 1 });
  const body = [
    { name: 'Down-strike', keys: '{down} + {attack}', text: 'Strike down in the air. Bounce off foes, spikes, thorns and fire.' },
    { name: 'Ledges', keys: '{up} / {down}', text: 'Reach for an edge and you catch it. Climb with up or jump, let go with down.' },
    { name: 'Heal', keys: '{heal}', text: 'A quick breath binds your wounds: a full Breath bar mends three hearts at once, on the ground or in the air. Strikes build Breath. A blow before it closes breaks it.' },
  ];
  if (s.moves.includes('deflect')) body.push({ name: 'Parry', keys: 'Deflect, just in time', text: 'Deflect a moment before a blow lands: it is turned back, and your Breath fills.' });
  if (s.abil.grip) body.push({ name: 'Stone Grip', keys: 'toward a wall, {jump}', text: 'Cling to walls and slide slowly. Jump to kick off the wall.' });
  pages.push({ title: 'What the body knows', sub: 'Movement and combat', el: 'air', items: body.slice(0, 4), t: 1 });
  if (body.length > 4) pages.push({ title: 'What the body knows', sub: 'Movement and combat (2)', el: 'air', items: body.slice(4), t: 1 });
  const carried = s.slots.filter(Boolean).map((id) => ({ name: MOVES[id].name, move: id }));
  if (carried.length) pages.push({ title: 'Moves carried', sub: 'Change these at any meditation stone', el: 'air', items: carried, t: 1 });
  return pages;
}
export function openRecall(from = 'play') {
  const pages = recallPages();
  G.menu = { type: 'recall', pages, page: 0, from, t: 0 };
  G.state = 'recall';
  Sound.sfx('map-open');
}
export function updateRecall() {
  const m = G.menu, I = Input.pressed;
  m.t += DT;
  if (I.left && m.page > 0) { m.page--; blip(); m.t = 0.3; }
  if (I.right && m.page < m.pages.length - 1) { m.page++; blip(); m.t = 0.3; }
  if (m.t > 0.25 && (I.back || I.pause || I.interact || pressedConfirm())) {
    Sound.sfx('map-close');
    if (m.from === 'pause') openPause(); else { G.state = 'play'; G.menu = null; }
  }
}
export function drawRecall(ctx) {
  const m = G.menu, pg = m.pages[m.page];
  dimScreen(ctx, 0.6);
  drawLesson(ctx, { ...pg, t: Math.max(0.25, m.t) }, { noDim: true, noFoot: true, dy: -30 });
  const foot = `[[${Input.label('left')}]] [[${Input.label('right')}]] Page ${m.page + 1} of ${m.pages.length}      [[${Input.label('back')}]] Close`;
  D.richText(ctx, foot, W / 2, H - 70, 26, CREAM, 'center');
  for (let i = 0; i < m.pages.length; i++) { ctx.beginPath(); ctx.arc(W / 2 - (m.pages.length - 1) * 14 + i * 28, H - 120, i === m.page ? 8 : 5, 0, 7); ctx.fillStyle = i === m.page ? CREAM : 'rgba(243,236,223,0.35)'; ctx.fill(); }
}

// --- talk -------------------------------------------------------------------------------
const lineOf = (tk) => { const l = tk.lines[tk.i] || ''; return typeof l === 'string' ? { who: tk.who, text: expand(l) } : { who: l[0], text: expand(l[1]) }; };   // v10: {interact} etc. show as the button glyph
export function updateTalk(dt) {
  const tk = G.talk;
  const before = Math.floor(tk.t * 55);
  tk.t += dt;
  const L = lineOf(tk), shown = Math.floor(tk.t * 55);
  if (shown < L.text.length && Math.floor(shown / 3) !== Math.floor(before / 3) && L.text[shown] !== ' ') Sound.sfx(TALK_VOICE[L.who] || 'talk', { rate: { joon: 1.05, kesh: 0.88, tamsin: 0.85, captain: 0.9, child: 1.25, mapmaker: 1.1, ren: 1.05, elder: 0.95, fisher: 1.12, carrier: 1.0, potter: 0.92, villager: 1.15 }[L.who] || 1, gap: 0.05, pitch: 0.08 });
  if (tk.t > 0.25 && (pressedConfirm() || Input.pressed.attack || Input.pressed.back)) {
    if (shown < L.text.length) { tk.t = L.text.length / 55 + 0.01; return; }
    tk.i++; tk.t = 0;
    if (tk.i >= tk.lines.length) Flow.closeTalk(); else blip();
  }
}
function drawSpeaker(ctx, who, px, py, ps) {
  const sp = SPEAKERS[who] || SPEAKERS.elder;
  ctx.save(); D.rr(ctx, px, py, ps, ps, 26); ctx.fillStyle = '#2c2334'; ctx.fill(); ctx.clip();
  const por = sp.portrait && Assets.get(sp.portrait);
  if (por) ctx.drawImage(por.img, px, py, ps, ps);
  else if (sp.villager != null) Assets.drawChar(ctx, 'villager.lineup', sp.villager, px + ps / 2, py + ps * 2.05, 1, { scale: 2.6 });
  ctx.restore();
  D.rr(ctx, px, py, ps, ps, 26); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
}
export function drawTalk(ctx) {
  const tk = G.talk, L = lineOf(tk), sp = SPEAKERS[L.who] || SPEAKERS.elder;
  const w = 1500, h = 250, x = (W - w) / 2, y = H - h - 50;
  const k = clamp((tk.i === 0 ? tk.t : 1) / 0.2, 0, 1);
  ctx.save(); ctx.globalAlpha = k;
  ctx.fillStyle = 'rgba(14,8,18,0.35)'; ctx.fillRect(0, 0, W, H);
  // v6: the talk box is paper with ink text (the painted talk frame takes over when it arrives)
  const framed = Assets.has('ui.talkframe');
  D.panel(ctx, x, y, w, h, framed ? { talk: true } : { paper: true, plain: true, accent: D.hexA(sp.color, 0.9) });
  const ps = 300, px = x + 30, py = y - 70;
  drawSpeaker(ctx, L.who, px, py, ps);
  const tx = px + ps + 40;
  text(ctx, sp.name, tx, y + 46, 32, INKT, 'left', 800);
  ctx.font = D.font(32, 800); ctx.fillStyle = sp.color; D.rr(ctx, tx, y + 68, ctx.measureText(sp.name).width, 5, 2.5); ctx.fill();
  let shown = L.text.slice(0, Math.floor(tk.t * 55));
  if (shown.lastIndexOf('[[') > shown.lastIndexOf(']]')) shown = L.text.slice(0, L.text.indexOf(']]', shown.lastIndexOf('[[')) + 2);   // a glyph shows whole
  D.wrapRich(ctx, shown, 32, w - (tx - x) - 60).slice(0, 4).forEach((l, i) => D.richText(ctx, l, tx, y + 102 + i * 44, 32, INKT));
  if (shown.length >= L.text.length) {
    const more = tk.i < tk.lines.length - 1 ? 'Next' : 'Close';
    D.richText(ctx, `[[${Input.label('confirm')}]] ${more}`, x + w - 40 - D.richWidth(ctx, `[[${Input.label('confirm')}]] ${more}`, 24), y + h - 34 + Math.sin(G.uiTime * 5) * 2, 24, GOLD_INK);
  }
  text(ctx, `${tk.i + 1} / ${tk.lines.length}`, tx, y + h - 34, 20, INK_DIM, 'left', 600);
  ctx.restore();
}

// --- the Mapmaker's stall ------------------------------------------------------------------
// v9 (Connor's note 1): a shop scene, not a list. The Mapmaker's bust and a line of talk on the left, the wares laid
// out on the painted cloth (ui-shop-cloth.png: six tied scrolls, a tray of brass pins), each with its bead price on a
// paper tag. The stick or D-pad walks between them by where they lie. A scroll shows its region's map on the left;
// buying counts the beads down, plays the sale, and the ware flies into Joon's satchel.
// fx, fy: where the ware lies on the cloth painting (0..1). tie: the colour of the scroll's cord.
// v15 (Connor's note 70): the map reveals itself as you explore, so the Mapmaker no longer sells region scrolls
const SHOP = [
  { id: 'shop-wayfinder', price: 12, name: 'Wayfinder\'s chart', fx: 0.745, fy: 0.665, stones: true, desc: 'Marks every meditation stone in the land on your map, found or not.', say: 'Every rest stone I ever sat at. A tired traveller is a careless one.' },
  { id: 'shop-pins', price: 0, name: 'Brass map pins', fx: 0.2, fy: 0.3, pins: true, desc: 'Pin a room on your map to remember it. Press {pin} on the map.', say: 'Pins. Free. Mark what you can\'t reach yet, and come back for it.' },
  { id: 'shop-piece', price: 60, name: 'Lotus Petal piece', fx: 0.885, fy: 0.43, piece: true, desc: 'Found in a ditch by the road. Four pieces make a heart.', say: 'Found it in a ditch. Four of those and your heart grows.' },
  { id: 'shop-mark', price: 90, name: 'Spirit Mark', fx: 0.885, fy: 0.69, mark: true, desc: 'A charm carved by a master who never came back for it. Spend it on the Fourfold Path.', say: 'A master carved that charm and never came back for it. Use it well.' },
];
const SHOP_HI = ['Ah, the traveller with mud on his boots. Have a look at the cloth.', 'Back again? The cloth hasn\'t changed, but the prices are fair.'];
const CLOTH = { x: 440, y: 150, w: 1400, h: 792 };
const owned = (it) => (it.region ? !!(G.save.scrolls && G.save.scrolls[it.region]) : !!G.save.flags[it.id]);
const shopAt = (it) => ({ x: CLOTH.x + it.fx * CLOTH.w, y: CLOTH.y + it.fy * CLOTH.h });
function shopMove(m, dx, dy) {
  const a = SHOP[m.sel];
  let best = -1, bd = 1e9;
  SHOP.forEach((it, i) => {
    if (i === m.sel) return;
    const vx = it.fx - a.fx, vy = (it.fy - a.fy) * 0.56, along = vx * dx + vy * dy, side = Math.abs(vx * dy - vy * dx);
    if (along <= 0.02) return;
    const d = along + side * 2.2;
    if (d < bd) { bd = d; best = i; }
  });
  if (best >= 0) { m.sel = best; m.selT = 0; blip(); m.line = null; if (SHOP[best].region) Sound.sfx('scroll-unroll', { gap: 0.15 }); }
  else Sound.sfx('ui-move', { rate: 0.7, vol: 0.5 });
}
export function updateShop() {
  const m = G.menu, s = G.save, I = Input.pressed;
  m.t += DT; m.selT = (m.selT || 0) + DT; if (m.lineT != null) m.lineT += DT;
  if (m.hi == null) { m.hi = flag('shop-visited') ? 1 : 0; s.flags['shop-visited'] = 1; }
  if (I.up) shopMove(m, 0, -1);
  if (I.down) shopMove(m, 0, 1);
  if (I.left) shopMove(m, -1, 0);
  if (I.right) shopMove(m, 1, 0);
  if (m.t > 0.2 && (I.back || I.pause)) { G.state = 'play'; G.menu = null; Sound.sfx('map-close'); return; }
  if (I.confirm && m.t > 0.2) {
    const it = SHOP[m.sel];
    if (owned(it)) { m.line = 'That one\'s already in your satchel.'; m.lineT = 0; Sound.sfx('shop-deny'); m.deny = 0.3; }
    else if ((s.jade || 0) < it.price) { m.line = `Not enough beads, friend. ${it.price - (s.jade || 0)} more.`; m.lineT = 0; Sound.sfx('shop-deny'); m.deny = 0.3; }
    else {
      s.jade -= it.price; s.flags[it.id] = 1;
      if (it.region) { s.scrolls = s.scrolls || {}; s.scrolls[it.region] = 1; }
      if (it.piece) { s.pieces = (s.pieces || 0) + 1; if (s.pieces % 4 === 0) { s.maxHp += 1; G.player.hp = s.maxHp; } }
      if (it.mark) s.marks = (s.marks || 0) + 1;
      persist();
      Sound.sfx('shop-buy'); if (it.price) Sound.sfx('bead-count', { delay: 0.05 }); Sound.sfx('shop-fly', { delay: 0.12 });
      m.line = it.price ? 'Thank you kindly. Walk safe.' : 'Go on, take them.'; m.lineT = 0;
      const at = shopAt(it), bag = { x: 230, y: 92 };
      hudFly('ware', at.x, at.y, { to: bag, dur: 0.6, arc: -220, draw: (c, x, y, u) => drawWare(c, it, x, y, 1 - u * 0.55), done: () => { m.bagT = 0.3; } });
    }
  }
  if (m.deny > 0) m.deny -= DT;
  if (m.bagT > 0) m.bagT -= DT;
}
// A ware drawn on its own (in flight, or where the cloth painting has nothing for it).
function drawWare(ctx, it, x, y, k = 1) {
  if (it.piece) { drawHeart(ctx, x, y, 30 * k, 1); drawHeart(ctx, x, y, 30 * k, 0, 0, true); ctx.save(); ctx.globalAlpha = 0.65; ctx.fillStyle = '#1d1420'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 40 * k, -Math.PI / 2, Math.PI); ctx.closePath(); ctx.fill(); ctx.restore(); return; }   // one quarter of a heart
  if (it.mark) { if (Assets.has('ui.skills')) { skillIcon(ctx, 9, x, y, 34 * k); ctx.beginPath(); ctx.arc(x, y, 34 * k, 0, 7); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(); } else { ctx.beginPath(); ctx.arc(x, y, 30 * k, 0, 7); D.inked(ctx, '#9be0a8', 4); } return; }
  if (it.pins) { for (const [dx, col] of [[-12, '#e2574c'], [0, '#ffd36b'], [12, '#bfe9f2']]) { ctx.fillStyle = INK; ctx.fillRect(x + dx * k - 1.5, y - 6 * k, 3, 26 * k); ctx.beginPath(); ctx.arc(x + dx * k, y - 8 * k, 7 * k, 0, 7); D.inked(ctx, col, 3); } return; }
  // a tied scroll
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.18); ctx.scale(k, k);
  D.rr(ctx, -62, -16, 124, 32, 14); D.inked(ctx, '#efe3c8', 4);
  ctx.beginPath(); ctx.ellipse(-60, 0, 10, 16, 0, 0, 7); D.inked(ctx, '#d8c8a2', 3);
  ctx.fillStyle = it.region ? REGIONS[it.region].color : '#3fa7a0'; ctx.fillRect(4, -17, 12, 34);
  ctx.restore();
}
// The region's rooms inked small, the way the scroll would show them.
function drawRegionPreview(ctx, region, x, y, w, h, k) {
  const ids = Object.keys(ROOMS).filter((id) => ROOMS[id].region === region && ROOMS[id].map);
  if (!ids.length) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const id of ids) { const c = ROOMS[id].map; x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0] + c[2]); y1 = Math.max(y1, c[1] + c[3]); }
  const cell = Math.min((w - 40) / (x1 - x0), (h - 70) / (y1 - y0), 60), ox = x + (w - (x1 - x0) * cell) / 2, oy = y + 48 + (h - 60 - (y1 - y0) * cell) / 2;
  const col = REGIONS[region].color, have = !!(G.save.scrolls && G.save.scrolls[region]);
  ctx.save(); ctx.globalAlpha *= k;
  for (const id of ids) {
    const c = ROOMS[id].map, r = { x: ox + (c[0] - x0) * cell + 3, y: oy + (c[1] - y0) * cell + 3, w: c[2] * cell - 6, h: c[3] * cell - 6 };
    const seen = G.save.visited[id];
    D.rr(ctx, r.x, r.y, r.w, r.h, 5); ctx.fillStyle = D.hexA(col, have || seen ? 0.55 : 0.28); ctx.fill();
    D.rr(ctx, r.x, r.y, r.w, r.h, 5); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(70,44,28,0.85)'; ctx.stroke();
    const d = ROOMS[id];
    if (d.stone) { ctx.beginPath(); ctx.arc(r.x + r.w * (d.stone.x / d.w), r.y + r.h * 0.7, 4, 0, 7); ctx.fillStyle = '#f3ecdf'; ctx.fill(); }
    if (d.shrine) { ctx.beginPath(); ctx.arc(r.x + r.w * (d.shrine.x / d.w), r.y + r.h * 0.6, 5, 0, 7); ctx.fillStyle = '#ffe9a8'; ctx.fill(); ctx.stroke(); }
    if (d.boss && d.boss.t !== 'ambush') { const bx = r.x + r.w / 2, by = r.y + r.h / 2; D.poly(ctx, [bx - 7, by + 6, bx, by - 9, bx + 7, by + 6]); D.inked(ctx, '#e2574c', 2); }
  }
  ctx.restore();
}
export function drawShop(ctx) {
  const m = G.menu, s = G.save, it = SHOP[m.sel], cloth = Assets.get('ui.shopcloth');
  dimScreen(ctx, 0.78);
  const intro = clamp(m.t / 0.25, 0, 1);
  ctx.save(); ctx.globalAlpha = intro;
  // the cloth
  ctx.save(); ctx.translate(0, (1 - intro) * 40);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; D.rr(ctx, CLOTH.x + 10, CLOTH.y + 16, CLOTH.w, CLOTH.h, 18); ctx.fill();
  if (cloth) { ctx.save(); D.rr(ctx, CLOTH.x, CLOTH.y, CLOTH.w, CLOTH.h, 18); ctx.clip(); ctx.drawImage(cloth.img, CLOTH.x, CLOTH.y, CLOTH.w, CLOTH.h); ctx.restore(); }
  else { D.rr(ctx, CLOTH.x, CLOTH.y, CLOTH.w, CLOTH.h, 18); D.inked(ctx, '#3a2f63', 6); }
  D.rr(ctx, CLOTH.x, CLOTH.y, CLOTH.w, CLOTH.h, 18); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
  // wares: the painting holds the scrolls and the pins; the petal piece and the mark are set down beside them
  SHOP.forEach((w, i) => {
    const at = shopAt(w), sel = i === m.sel, have = owned(w), bob = sel ? Math.sin(G.uiTime * 4) * 3 : 0;
    if (sel) {
      const g = ctx.createRadialGradient(at.x, at.y, 10, at.x, at.y, 150);
      g.addColorStop(0, `rgba(255,233,168,${0.45 + 0.12 * Math.sin(G.uiTime * 5)})`); g.addColorStop(1, 'rgba(255,233,168,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(at.x - 160, at.y - 160, 320, 320); ctx.restore();
    }
    if (!cloth || w.piece || w.mark) drawWare(ctx, w, at.x, at.y + bob, sel ? 1.12 : 1);
    if (have) { ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = '#1d1420'; ctx.beginPath(); ctx.ellipse(at.x, at.y, 92, 48, -0.15, 0, 7); ctx.fill(); ctx.restore(); }
    // the paper price tag on a string
    const tx = at.x + (w.fx > 0.8 ? -6 : 0), ty = at.y + 66 + bob, label = have ? 'Yours' : w.price ? String(w.price) : 'Free';
    ctx.font = D.font(sel ? 30 : 26, 800); const tw = ctx.measureText(label).width + (have || !w.price ? 34 : 64);
    ctx.strokeStyle = 'rgba(243,236,223,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(at.x, at.y + 20); ctx.lineTo(tx, ty - 18); ctx.stroke();
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(sel ? 0 : -0.04 + (i % 3) * 0.04);
    D.rr(ctx, -tw / 2, -20, tw, 40, 8); D.inked(ctx, have ? '#6f6478' : sel ? '#fff6e0' : '#e8dcc0', 3);
    if (!have && w.price) { drawBead(ctx, -tw / 2 + 22, 0, 11); text(ctx, label, -tw / 2 + 40, 2, sel ? 30 : 26, (s.jade || 0) >= w.price ? INKT : '#9a2e2a', 'left', 800); }
    else text(ctx, label, 0, 2, sel ? 28 : 24, have ? '#f3ecdf' : GREEN_INK, 'center', 800);
    ctx.restore();
  });
  ctx.restore();
  // left: the Mapmaker and what she says
  const deny = m.deny > 0 ? Math.sin(m.deny * 60) * 6 : 0;
  drawSpeaker(ctx, 'mapmaker', 60 + deny, 150, 340);
  const line = m.line || (m.selT > 0.6 || m.moved ? it.say : SHOP_HI[m.hi || 0]);
  if (m.selT > 0.6) m.moved = true;
  const lines = D.wrapRich(ctx, line, 24, 330);
  const bh = 34 + lines.length * 32;
  D.rr(ctx, 50, 506, 360, bh, 18); D.inked(ctx, '#f3ecdf', 4);
  D.poly(ctx, [120, 508, 150, 480, 165, 508]); ctx.fillStyle = '#f3ecdf'; ctx.fill();
  lines.forEach((l, i) => D.richText(ctx, l, 70, 528 + i * 32, 24, INKT));
  // a scroll shows its region; anything else shows what it is
  const py = 506 + bh + 22, ph = 942 - py;
  if (ph > 140) {
    const parch = Assets.get('ui.parchment'), un = Math.min(1, m.selT / 0.22);
    ctx.save(); ctx.translate(230, py + ph / 2); ctx.scale(1, it.region ? 0.15 + 0.85 * un : 1); ctx.translate(-230, -(py + ph / 2));
    D.rr(ctx, 50, py, 360, ph, 14); ctx.save(); ctx.clip();
    if (parch) ctx.drawImage(parch.img, 50, py, 360, ph); else { ctx.fillStyle = '#e9dcbc'; ctx.fillRect(50, py, 360, ph); }
    ctx.restore(); D.rr(ctx, 50, py, 360, ph, 14); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    if (it.region) {
      text(ctx, REGIONS[it.region].name, 230, py + 28, 24, INKT, 'center', 800);
      drawRegionPreview(ctx, it.region, 50, py, 360, ph, un);
    } else {
      const dl = D.wrapRich(ctx, expand(it.desc || ''), 22, 310);
      text(ctx, it.name, 230, py + 30, 26, INKT, 'center', 800);
      dl.forEach((l, i) => D.richText(ctx, l, 230, py + 74 + i * 30, 22, INK_DIM, 'center'));
    }
    ctx.restore();
  }
  // top bar: the stall's name, Joon's beads and his satchel
  text(ctx, 'The Mapmaker\'s cloth', CLOTH.x, 96, 46, CREAM, 'left', 800, 8);
  const sat = Assets.get('prop.satchel'), sb = m.bagT > 0 ? 1 + Math.sin(m.bagT / 0.3 * Math.PI) * 0.18 : 1;
  ctx.save(); ctx.translate(230, 92); ctx.scale(sb, sb);
  if (sat) { const h = 70, w = sat.img.width * h / sat.img.height; ctx.drawImage(sat.img, -w / 2, -h / 2, w, h); } else { D.rr(ctx, -30, -24, 60, 48, 14); D.inked(ctx, '#8a6a45', 4); }
  ctx.restore();
  const hu = G.hud || { jadeShown: s.jade || 0, bounce: 0 }, bb = hu.bounce > 0 ? Math.sin((1 - hu.bounce / 0.22) * Math.PI) * 0.2 : 0;
  ctx.save(); ctx.translate(CLOTH.x + CLOTH.w - 170, 92); ctx.scale(1 + bb, 1 + bb); drawBead(ctx, 0, 0, 26); ctx.restore();
  text(ctx, String(hu.jadeShown), CLOTH.x + CLOTH.w - 130, 94, 46, '#c8ffd8', 'left', 800, 8);
  // bottom: the ware's name and what it does
  D.rr(ctx, CLOTH.x, 958, CLOTH.w, 96, 20); D.inked(ctx, 'rgba(29,20,32,0.92)', 4);
  text(ctx, it.name, CLOTH.x + 30, 990, 30, '#ffe9a8', 'left', 800);
  D.richText(ctx, expand(it.desc || 'Shows every room of the region, its shrines, stones and treasures, and names each place.'), CLOTH.x + 30, 1028, 22, CREAM);
  const keys = `[[${Input.label('move')}]] Browse   [[${Input.label('confirm')}]] Buy   [[${Input.label('back')}]] Leave`;
  D.richText(ctx, keys, CLOTH.x + CLOTH.w - 30 - D.richWidth(ctx, keys, 22), 990, 22, CREAM);
  ctx.restore();
  drawHudFly(ctx);
}

// --- cutscenes: painted stills with a slow pan and zoom -----------------------------------
export function updateCutscene(dt) {
  const c = G.cut; c.t += dt;
  const sl = c.slides[c.i], typed = Math.floor(c.t * 40) >= sl.caption.length;
  // a soft tick every few letters while the caption types
  const n = Math.floor(c.t * 40);
  if (!typed && n !== c.lastN && n % 3 === 0 && sl.caption[n] && sl.caption[n] !== ' ') Sound.sfx('text-tick', { pitch: 0.12, gap: 0.05 });
  c.lastN = n;
  if ((c.t > 0.5 && (pressedConfirm() || Input.pressed.attack)) || c.t > 7) {
    if (!typed && c.t < 7) { c.t = sl.caption.length / 40 + 0.01; return; }
    c.i++; c.t = 0; Sound.sfx('cutscene-page');
    if (c.i >= c.slides.length) { G.cut = null; G.state = c.after || 'play'; if (c.then) c.then(); }
  }
}
export function drawCutscene(ctx) {
  const c = G.cut; if (!c) return;
  const sl = c.slides[c.i], it = Assets.get(sl.img), k = clamp(c.t / 7, 0, 1), e = k * k * (3 - 2 * k);
  ctx.fillStyle = '#0e0812'; ctx.fillRect(0, 0, W, H);
  // v7 (review 7 #7): the still is fitted to the window between the bars and clipped to it, so a pan value
  // means the same on every slide and a face can't slide under the top bar
  const top = 90, wh = H - 90 - 170;
  if (it) {
    const img = it.img, ih = img.height * (sl.crop || 1), p = sl.panOld && OLD_STORY_ART.has(sl.img) ? sl.panOld : sl.pan;
    const z = p[2] + (p[5] - p[2]) * e, fx = p[0] + (p[3] - p[0]) * e, fy = p[1] + (p[4] - p[1]) * e;
    const s2 = Math.max(W / img.width, wh / ih) * z, dw = img.width * s2, dh = ih * s2;
    ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, wh); ctx.clip();
    ctx.drawImage(img, 0, 0, img.width, ih, -(dw - W) * fx, top - (dh - wh) * fy, dw, dh);
    ctx.restore();
  }
  const fade = clamp(Math.min(c.t / 0.6, (7 - c.t) / 0.6), 0, 1);
  ctx.fillStyle = `rgba(14,8,18,${1 - fade})`; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0e0812'; ctx.fillRect(0, 0, W, 90); ctx.fillRect(0, H - 170, W, 170);
  const shown = sl.caption.slice(0, Math.floor(c.t * 40));
  D.wrapRich(ctx, shown, 34, 1500).forEach((l, i) => D.richText(ctx, l, W / 2, H - 120 + i * 46, 34, CREAM, 'center'));
  D.richText(ctx, `[[${Input.label('confirm')}]]`, W - 80, H - 50, 22, DIM);
}

// --- ending ------------------------------------------------------------------------------
export function updateEnding(dt) {
  const m = G.menu;
  m.t += dt;
  if (m.t > 4 && pressedConfirm()) { ok(); openTitle(); }
}
export function drawEnding(ctx) {
  const m = G.menu, s = G.save, t = m.t, bg = Assets.get('story.kites') || Assets.get('bg.kite');
  if (bg) { const img = bg.img, sc = Math.max(W / img.width, H / img.height) * (1.02 + t * 0.002); ctx.drawImage(img, (W - img.width * sc) / 2, (H - img.height * sc) * 0.4, img.width * sc, img.height * sc); }
  else D.fallbackBg(ctx, REGIONS.brass.pal, W, H, 0, t);
  // text sits along the bottom, over a band of shade
  const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
  g.addColorStop(0, 'rgba(20,10,30,0)'); g.addColorStop(0.45, 'rgba(20,10,30,0.72)'); g.addColorStop(1, 'rgba(20,10,30,0.92)');
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.55, W, H * 0.45);
  ctx.fillStyle = `rgba(14,8,18,${clamp(1 - t / 1.2, 0, 1)})`; ctx.fillRect(0, 0, W, H);
  const a = (t0) => clamp((t - t0) / 0.8, 0, 1);
  ctx.save(); ctx.globalAlpha = a(0.6);
  text(ctx, 'The Brass Gate stands open', W / 2, H - 300, 70, CREAM, 'center', 800, 14);
  ctx.restore();
  const lines = ['The river runs again, and the kites go up over Kite Hill.', 'Air, water, earth and fire answer one breath.'];
  lines.forEach((ln, i) => { ctx.save(); ctx.globalAlpha = a(1.4 + i * 0.6); text(ctx, ln, W / 2, H - 220 + i * 46, 32, '#ffe9a8', 'center', 600, 7); ctx.restore(); });
  ctx.save(); ctx.globalAlpha = a(2.8);
  const ids = Object.keys(ROOMS), secs = Math.floor(s.time || 0);
  const count = (tp) => ids.reduce((n, id) => n + (ROOMS[id].pickups || []).filter((q) => q.t === tp).length, 0);
  const got = (pre) => Object.keys(s.flags).filter((f) => f.startsWith(pre)).length;
  const stats = `Rooms ${ids.filter((id) => s.visited[id]).length} / ${ids.length}     Petal pieces ${got('heart-')} / ${count('heart')}     Wind pearls ${got('bead-')} / ${count('bead')}     Spirit Marks ${got('mark-')} / ${count('mark')}     Falls ${s.deaths || 0}     Time ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  text(ctx, stats, W / 2, H - 112, 26, CREAM, 'center', 700, 6);
  text(ctx, 'Elementbound v0.14. Thank you for playing.', W / 2, H - 66, 24, DIM, 'center', 700, 5);
  if (t > 4) D.richText(ctx, `[[${Input.label('confirm')}]] Title`, W - 60 - D.richWidth(ctx, `[[${Input.label('confirm')}]] Title`, 24), H - 66, 24, CREAM);
  ctx.restore();
}

// --- v15 (owner note 71): the first steps teach one key at a time, as each is needed -------------------------------
// Move, then Jump, then Strike once a foe (or the first signpost) is near, Dash once you have it. Heal is taught by
// the heal tip and the Elder's line when first hurt (above). Each prompt goes the moment that action is done, and
// uses Input.label, so the keyboard, the pad and touch each show their own button.
function teachStep() {
  const p = G.player, s = G.save, f = s.flags;
  if (!G.room || G.talk || G.fade || p.dead || G.cut || G.npc && G.npc.walkTo != null) return null;
  const early = !f['shrine-air'];
  if (G.teachRoom !== G.room.id) { G.teachRoom = G.room.id; G.teachX = p.x; }
  if (early && !f['learn-move']) { if (Math.abs(p.x - G.teachX) > 240) f['learn-move'] = 1; else return ['move', 'Move']; }
  if (early && !f['learn-jump']) { if (!p.onGround && p.vy < -300) f['learn-jump'] = 1; else return ['jump', 'Jump']; }
  if (!f['learn-strike']) {
    if (p.atk) f['learn-strike'] = 1;
    else {
      const foe = G.enemies.some((e) => !e.dead && Math.abs(e.x - p.x) < 800 && Math.abs(e.y - p.y) < 450);
      const post = (G.room.hints || []).some((h) => h.post && Math.abs(h.post[0] - p.x) < 380);
      if (foe || post || (early && G.room.id !== 'kh1')) return ['attack', 'Strike'];
    }
  }
  if (s.abil.dash && !f['learn-dash']) { if (p.dashT > 0) f['learn-dash'] = 1; else return ['dash', 'Dash']; }
  return null;
}
function drawTeach(ctx) {
  const st = teachStep();
  if (!st) { G.teachA = Math.max(0, (G.teachA || 0) - DT * 6); if (G.teachA <= 0) return; }
  else { if (G.teachKey !== st[0]) { G.teachKey = st[0]; G.teachA = 0; G.teachShown = st; } G.teachA = Math.min(1, (G.teachA || 0) + DT * 4); }
  const sh = st || G.teachShown; if (!sh) return;
  const p = G.player, str = `[[${Input.label(sh[0])}]]  ${sh[1]}`, px = 34;
  const w = D.richWidth(ctx, str, px) + 56, x = clamp(p.x - G.cam.x, w / 2 + 30, W - w / 2 - 30), y = clamp(p.y - G.cam.y - 300 + Math.sin(G.uiTime * 3) * 5, 230, H - 140);
  ctx.save(); ctx.globalAlpha = G.teachA;
  D.rr(ctx, x - w / 2, y - 34, w, 68, 34); D.inked(ctx, 'rgba(29,20,32,0.88)', 5);
  D.richText(ctx, str, x, y, px, CREAM, 'center');
  ctx.restore();
}

// --- v15: the Controls page (pause menu and title screen): keyboard, controller and touch side by side ---------
export function openControls(from) { G.controls = { from, t: 0 }; Sound.sfx('map-open'); }
export function updateControls() {
  const c = G.controls, I = Input.pressed;
  c.t += DT;
  if (c.t > 0.2 && (I.back || I.pause || I.confirm || I.interact)) { G.controls = null; Sound.sfx('map-close'); }
}
const CTRL_DEVS = [['kb', 'Keyboard'], ['pad', 'Controller'], ['touch', 'Touch']];
function ctrlRows() {
  const g = (a, d) => `[[${Input.label(a, d)}]]`;
  const per = (kb, pad, touch) => (d) => (d === 'kb' ? kb : d === 'pad' ? pad : touch);
  const both = (a) => (d) => g(a, d);
  return [
    ['Move', per('[[←]] [[→]]', '[[Stick]] or the D-pad', '[[Stick]] left thumb, anywhere')],
    ['Look and aim up / down', per('[[↑]] [[↓]]', '[[↑]] [[↓]]', '[[Stick ↑]] [[Stick ↓]]')],
    ['Jump (hold for height)', both('jump')],
    ['Strike', both('attack')],
    ['Up-strike', (d) => `${g('up', d)} + ${g('attack', d)}`],
    ['Down-strike, pogo (in the air)', (d) => `${g('down', d)} + ${g('attack', d)}`],
    ['Dash (hold to sprint)', per('[[X]] or [[Shift]]', '[[○]]', '[[Dash]]')],
    ['Bending, slots 1 to 4', per('[[A]] [[S]] [[D]] [[F]]', '[[L1]] [[L2]] [[R1]] [[R2]]', '[[Bend 1]] to [[Bend 4]] (the arc)')],
    ['Heal (Breath to hearts)', per('[[Q]]', '[[△]] with nothing near', '[[Heal]]')],
    ['Talk, meditate, open', per('[[E]] or [[↑]]', '[[△]]', '[[Use]] (shows when near)')],
    ['Drop through a plank', (d) => `${g('down', d)} + ${g('jump', d)}`],
    ['Map', both('map')], ['Inventory', both('tab')], ['Pause', both('pause')],
    ['Menus: choose / back', per('[[Z]] [[Enter]] / [[X]] [[Esc]]', '[[✕]] / [[○]]', 'tap it / [[Back]]')],
  ];
}
export function drawControls(ctx) {
  dimScreen(ctx, 0.55);
  const X = 110, Y = 60, PW = 1700, PH = 960;
  D.panel(ctx, X, Y, PW, PH, { accent: 'rgba(243,236,223,0.25)' });
  text(ctx, 'Controls', X + 70, Y + 72, 56, INKT, 'left', 800);
  text(ctx, 'Keyboard, controller or touch: use whichever you like, the prompts follow the last one used.', X + 330, Y + 76, 22, INK_DIM, 'left', 600);
  const cols = [X + 70, X + 520, X + 930, X + 1290], now = Input.device();
  CTRL_DEVS.forEach(([d, name], i) => {
    const cx = cols[i + 1], on = d === now;
    D.rr(ctx, cx - 14, Y + 118, 340, 54, 27); D.inked(ctx, on ? '#f3ecdf' : '#32283a', 4);
    text(ctx, name, cx + 12, Y + 146, 28, on ? INK : CREAM, 'left', 800);
    if (on) text(ctx, 'in use', cx + 310, Y + 147, 18, GREEN_INK, 'right', 800);
  });
  const rows = ctrlRows(), RY = Y + 214, RH = 46;
  rows.forEach((r, j) => {
    const y = RY + j * RH;
    if (j % 2 === 0) { D.rr(ctx, X + 50, y - RH / 2 + 2, PW - 100, RH - 4, 12); ctx.fillStyle = 'rgba(70,44,28,0.08)'; ctx.fill(); }
    text(ctx, r[0], cols[0], y, 24, INKT, 'left', 700);
    CTRL_DEVS.forEach(([d], i) => D.richText(ctx, r[1](d), cols[i + 1], y, 22, INKT));
  });
  const fy = RY + rows.length * RH + 10;
  text(ctx, 'Touch: the stick appears wherever your left thumb lands; Use appears beside the right thumb when there is something to use.', X + 70, fy, 20, INK_DIM, 'left', 600);
  if (now === 'touch') D.richText(ctx, '[[Back]] Close', X + PW - 70 - D.richWidth(ctx, '[[Back]] Close', 24), fy + 2, 24, INKT);
  else { const f = `[[${Input.label('back')}]] Close`; D.richText(ctx, f, X + PW - 70 - D.richWidth(ctx, f, 24), fy + 2, 24, INKT); }
}

// --- v15: taps on menus (touch.js asks first; false means "not mine", and a tap then counts as confirm) ------------
export function touchTap(x, y) {
  if (G.controls) return true;   // only its Back button closes it
  const m = G.menu;
  if (G.state === 'title' && m) {
    const items = titleItems(), mx = W - 380;
    for (let i = 0; i < items.length; i++) {
      if (Math.abs(y - (700 + i * 84)) < 40 && Math.abs(x - mx) < 270) {
        if (m.sel !== i) { m.sel = i; m.armed = false; blip(); }
        Input.tap('confirm');
        return true;
      }
    }
    return false;
  }
  if (G.state === 'equip' && m && (m.tab || 'moves') === 'moves') {   // tap a carried slot or a known move
    for (let i = 0; i < 4; i++) if (Math.hypot(x - (350 + i * 190), y - 410) < 74) {
      if (m.mode === 'slot') { m.slot = i; Input.tap('confirm'); } else Input.tap(SLOT_ACTIONS[i]);
      return true;
    }
    for (let n = 0; n < MOVE_ORDER.length; n++) if (Math.hypot(x - (350 + (n % 4) * 190), y - (660 + Math.floor(n / 4) * 170)) < 74) {
      if (m.mode === 'slot') m.mode = 'grid';
      if (m.sel === n) Input.tap('confirm'); else { m.sel = n; blip(); }
      return true;
    }
    return false;
  }
  if (G.state === 'pause' && m) {
    const i = Math.round((y - P_Y0) / P_DY);
    if (x < 330 || x > 810 || i < 0 || i >= PAUSE_ITEMS.length || Math.abs(y - (P_Y0 + i * P_DY)) > 32) return true;
    if (m.sel !== i) { m.sel = i; m.armed = false; blip(); }
    const bus = busOf(i);
    if (bus && x > 540) { Sound.setVolume(bus, clamp((x - 560) / 200, 0, 1)); Sound.sfx('ui-move'); return true; }
    Input.tap('confirm');
    return true;
  }
  return false;
}
