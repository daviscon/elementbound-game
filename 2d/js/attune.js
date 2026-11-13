// v10 (Connor's note 11): getting a power is a ceremony, not a menu.
// At an element shrine Joon kneels and the prompt reads "Hold △ to attune". While it is held the camera closes in,
// the music sinks to a low drone and the room darkens to a vignette; the element is drawn in from the whole room in
// spirals (wind streaks, water drops, stone dust, embers) into his palms, building in three pulses with a rising
// sound each. Let go early and it ebbs back. At full: a burst, a white flash, a still frame, and a big title card with
// the power's name and one line, on a deep gong. Then the lesson, the master's words, and a trial post in the shrine
// that only the new power can move (taught by the situation, not by text).
// The boss rewards (Second Step, Glide, Stone Grip) get a smaller version that gathers by itself.
import { G, shake, hitstop, impact, burst, clamp, rnd, flag } from './game.js';
import { W, H, ELEMENTS } from './config.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Assets } from './assets.js';
import * as D from './draw.js';
import { SPEAKERS } from './story.js';

// Original names and lines. `el` picks the colours and the motes.
export const POWERS = {
  air: { el: 'air', title: 'GUST', line: 'The first breath of Air', also: 'with Deflect and the Dash' },
  water: { el: 'water', title: 'WATER WHIP', line: 'The river bends, and does not break', also: 'with Ice Wall' },
  earth: { el: 'earth', title: 'EARTH SLAM', line: 'Root yourself, and the mountain answers', also: 'with Stone Wall' },
  fire: { el: 'fire', title: 'FIRE BLAST', line: 'A flame held, not hurled', also: 'with Flame Ring' },
  doublejump: { el: 'air', title: 'SECOND STEP', line: 'The wind lends you a stair', minor: true },
  glide: { el: 'air', title: 'GLIDE', line: 'Lie on the warm air and trust it', minor: true },
  heart: { el: 'earth', title: 'STONE GRIP', line: 'Rock holds those who hold it', minor: true },
};
const FULL = 2.4, MINOR = 1.3, EBB = 0.9;   // seconds to fill (held), to fill (boss reward), to ebb when let go

// Start the ceremony. o: { power, x, y (the palms' anchor: the shrine), then }
export function startAttune(o) {
  const p = G.player, P = POWERS[o.power];
  if (!P || G.attune) { if (o.then) o.then(); return; }
  p.vx = 0; p.atk = null; p.sprint = false; p.castLock = 0; p.meditT = 1.4;   // sits down first
  if (o.x != null) { p.face = o.x > p.x ? 1 : -1; }
  G.attune = { ...o, P, minor: !!P.minor, phase: 'kneel', t: 0, charge: 0, pulses: 0, motes: [], flash: 0, cardT: 0, still: 0, heldOnce: false };
  Sound.sfx('meditation', { vol: 0.6 });
}

const palms = () => { const p = G.player; return { x: p.x + p.face * 34, y: p.y - 92 }; };

// Runs every real step while G.attune is set (sim.js), before hit-stop and slow motion.
export function updateAttune(dt) {
  const A = G.attune, p = G.player;
  if (!A || !p) return;
  A.t += dt;
  if (A.flash > 0) A.flash = Math.max(0, A.flash - dt / 0.45);
  const hand = palms();
  if (A.phase === 'kneel') {
    p.meditT = Math.max(p.meditT, 0.5);
    if (A.t > (A.minor ? 0.35 : 0.6)) { A.phase = 'gather'; A.t = 0; }
  } else if (A.phase === 'gather') {
    p.meditT = Math.max(p.meditT, 0.5);
    const held = A.minor || Input.held.interact;
    if (held) A.heldOnce = true;
    A.charge = clamp(A.charge + (held ? dt / (A.minor ? MINOR : FULL) : -dt / EBB), 0, 1);
    // walking away with nothing gathered stands him back up
    if (!A.minor && A.charge === 0 && (Input.held.left || Input.held.right) && A.t > 0.4) { endAttune(false); return; }
    // three pulses, each a rising swell
    const want = Math.floor(A.charge * 3 + 1e-6);
    if (want > A.pulses && A.pulses < 3) {
      A.pulses = want;
      Sound.sfx('attune-pulse', { rate: 0.9 + A.pulses * 0.12, vol: 0.55 + A.pulses * 0.15 });
      shake(2 + A.pulses * 2); Sound.rumble(0.15 * A.pulses, 0.3, 120);
      A.ring = 1;
    } else if (want < A.pulses) A.pulses = want;
    if (A.ring > 0) A.ring = Math.max(0, A.ring - dt / 0.5);
    // the camera closes in and the music sinks to the drone
    G.zoomAt = hand; G.zoomTarget = 1 + 0.35 * A.charge;   // v11 (review 11 #11): 1.35 at full, was 1.24 G.zoomHold = 0.2;
    Sound.duck(1 - 0.85 * A.charge, 0.15);
    Sound.loop('attune-drone-loop', A.charge > 0.02, 0.2 + 0.8 * A.charge);
    // motes drawn in from the whole room, in spirals
    const rate = 30 + 120 * A.charge;
    for (let n = Math.floor(rate * dt + Math.random()); n > 0; n--) spawnMote(A);
    if (A.charge >= 1) burstAttune(A);
  } else if (A.phase === 'card') {
    A.cardT += dt;
    p.meditT = Math.max(p.meditT, 0.3);
    if (A.cardT > (A.minor ? 2.4 : 3.4) && (A.cardT > (A.minor ? 3.4 : 4.6) || Input.pressed.confirm || Input.pressed.interact || Input.pressed.attack)) endAttune(true);
  }
  for (let i = A.motes.length - 1; i >= 0; i--) {
    const m = A.motes[i];
    m.r -= m.vr * dt * (1 + (A.phase === 'card' ? 3 : 0)); m.a += m.va * dt * (300 / Math.max(60, m.r));
    if (m.r < 16) A.motes.splice(i, 1);
  }
}

function spawnMote(A) {
  const el = A.P.el;
  A.motes.push({ r: rnd(520, 980), a: rnd(Math.PI * 2), vr: rnd(380, 620) * (0.8 + A.charge * 0.7), va: rnd(0.9, 1.5) * (Math.random() < 0.5 ? -1 : 1), s: rnd(0.7, 1.3), el, k: Math.random() });
}

function burstAttune(A) {
  const p = G.player, hand = palms(), C = ELEMENTS[A.P.el];
  A.phase = 'card'; A.cardT = 0; A.flash = 1; A.charge = 1;
  hitstop(0.14); shake(16); impact(hand.x, hand.y, { force: true, col: C.color }); Sound.rumble(0.9, 0.7, 260);
  Sound.loop('attune-drone-loop', false);
  Sound.sfx('attune-burst'); Sound.sfx('power-gong', { delay: 0.35 });
  Sound.duck(0.35, 0.3);
  burst(hand.x, hand.y, 46, { color: ['#ffffff', C.color, C.dark], min: 200, max: 900, life: 0.9, size: 14, grav: 0 });
  burst(p.x, p.y - 6, 18, { color: ['#ffffff', C.color], min: 120, max: 480, angle: -Math.PI / 2, spread: 1.4, life: 0.6, size: 10, grav: 400 });
}

function endAttune(done) {
  const A = G.attune, p = G.player;
  G.attune = null; G.zoomTarget = 1; G.zoomHold = 0;
  Sound.loop('attune-drone-loop', false); Sound.duck(1, 1.2);
  p.meditT = 0;
  if (done && A.then) A.then();
}

// --- drawing ---------------------------------------------------------------------------------
const MOTE_COL = { air: ['#ffffff', '#eafcff', '#bfe9f2'], water: ['#bfe9f2', '#4aa3d8', '#ffffff'], earth: ['#c39a5b', '#e9dcc0', '#7d5a2c'], fire: ['#ffd36b', '#f0742a', '#fff3c4'] };
// World space: the motes, the gather spiral at the palms (fx-attune-<el>.png when it exists), the pulse rings.
export function drawAttuneWorld(ctx) {
  const A = G.attune; if (!A) return;
  const hand = palms(), cols = MOTE_COL[A.P.el];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of A.motes) {
    const x = hand.x + Math.cos(m.a) * m.r, y = hand.y + Math.sin(m.a) * m.r * 0.7, a = clamp((980 - m.r) / 300, 0, 1) * clamp(m.r / 60, 0, 1);
    ctx.globalAlpha = a * 0.9; ctx.fillStyle = ctx.strokeStyle = cols[(m.k * 3) | 0];
    if (m.el === 'air') { const t = m.a + Math.PI / 2 * Math.sign(m.va); ctx.lineWidth = 4 * m.s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(t) * 34 * m.s, y - Math.sin(t) * 24 * m.s); ctx.stroke(); }
    else if (m.el === 'earth') { ctx.globalCompositeOperation = 'source-over'; ctx.fillRect(x - 5 * m.s, y - 5 * m.s, 10 * m.s, 10 * m.s); ctx.globalCompositeOperation = 'lighter'; }
    else { ctx.beginPath(); ctx.arc(x, y, (m.el === 'water' ? 6 : 5) * m.s, 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  const key = 'fx.attune-' + A.P.el, k = A.phase === 'card' ? 1 : A.charge;
  if (k > 0.02) {
    if (!Assets.drawFx(ctx, key, Math.floor(G.time * 12) % 8, hand.x, hand.y, 120 + 260 * k, G.player.face, { alpha: 0.4 + 0.6 * k })) {
      const g = ctx.createRadialGradient(hand.x, hand.y, 2, hand.x, hand.y, 40 + 120 * k);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`); g.addColorStop(0.4, D.hexA(ELEMENTS[A.P.el].color, 0.55 * k)); g.addColorStop(1, D.hexA(ELEMENTS[A.P.el].color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hand.x, hand.y, 40 + 120 * k, 0, 7); ctx.fill();
    }
  }
  // v11 (review 11 #11, C1): each pulse is the painted ring of breath spreading over the floor from the kneeling figure,
  // not a hard white circle
  if (A.ring > 0) {
    // v14 (Connor's note 41: "a random woman shows up in the overlay"): she was the pulse sheet (fx-attune-pulse.png),
    // which paints the OLD Joon (long hair, topknot) kneeling in every frame; drawn additively she read as a ghostly
    // woman over the bald monk. The sheet is no longer used.
    // v14 (note 57): the rings are a sprite, fx/attune-ring.png once it lands, until then the air-ring strip laid flat,
    // tinted in the element's colour
    ctx.globalCompositeOperation = 'source-over';
    const e = 1 - A.ring, f = Math.min(7, Math.floor(e * 8)), tint = D.hexA(ELEMENTS[A.P.el].color, 0.55);
    ctx.globalAlpha = Math.min(1, A.ring * 1.8);
    if (!Assets.drawFx(ctx, 'fx.attunering', f, G.player.x, G.player.y + 4, 520 + A.pulses * 60, 1, { tint })) Assets.drawFx(ctx, 'fx.airring', f, G.player.x, G.player.y + 4, 520 + A.pulses * 60, 1, { sy: 0.28, tint });
  }
  ctx.restore();
}
// Screen space: the darkening vignette, the prompt, the white flash and the title card.
export function drawAttuneHud(ctx) {
  const A = G.attune; if (!A) return;
  const p = G.player, sx = (p.x - G.cam.x), sy = (p.y - 100 - G.cam.y);
  const dark = A.phase === 'card' ? 0.82 : 0.82 * Math.min(1, A.charge * 1.7);
  if (dark > 0.01) {
    const g = ctx.createRadialGradient(sx, sy, 120, sx, sy, 1100);
    g.addColorStop(0, 'rgba(10,6,14,0)'); g.addColorStop(0.45, `rgba(10,6,14,${dark * 0.55})`); g.addColorStop(1, `rgba(10,6,14,${dark})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (A.phase === 'gather' && !A.minor && A.charge < 0.98) {
    const str = `Hold [[${Input.label('heal')}]] to attune`, w = D.richWidth(ctx, str, 32) + 70, a = A.charge > 0.05 ? 0.5 : 0.85 + 0.15 * Math.sin(G.time * 4);
    ctx.save(); ctx.globalAlpha = a;
    D.rr(ctx, (W - w) / 2, 230, w, 64, 32); D.inked(ctx, 'rgba(29,20,32,0.88)', 4); D.richText(ctx, str, W / 2, 262, 32, '#ffe9a8', 'center');
    // three beads for the three pulses
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(W / 2 - 40 + i * 40, 326, 11, 0, 7); D.inked(ctx, i < A.pulses ? ELEMENTS[A.P.el].color : 'rgba(255,255,255,0.15)', 3); }
    ctx.restore();
  }
  drawWitness(ctx, A, dark);
  if (A.phase === 'card') drawCard(ctx, A);
  if (A.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${A.flash})`; ctx.fillRect(0, 0, W, H); }
}
// v14 (Connor's note 41: "a random woman shows up in the overlay"): the vignette left whoever keeps the shrine standing
// in the light (Mother Ren at the water shrine, the Elder behind her; the Elder alone at the Shrine of Wind) with no
// word on who she was. Now the one keeping the shrine speaks: a small paper plate over her head in the dialogue's own
// style (her name in ink, underlined in her colour, one short line), and she is lit, so she reads as part of the rite.
const WITNESS = {
  air: ['elder', 'Let the wind find you, Joon. Breathe.'],
  water: ['ren', 'Breathe with the water. It answers you.'],
  earth: ['tamsin', 'Feel the hill\'s weight. Hold it.'],
  fire: ['kesh', 'Hold the heat. Don\'t let it hold you.'],
};
const MASTER_X = 0;
function drawWitness(ctx, A, dark) {
  const n = G.npc, w = WITNESS[A.P.el];
  if (!n || !w || A.minor) return;
  const k = A.phase === 'card' ? clamp(1 - (A.cardT - 0.2) / 0.4, 0, 1) : clamp((A.charge - 0.08) / 0.15, 0, 1);
  if (k <= 0) return;
  const sp = SPEAKERS[w[0]] || SPEAKERS.elder, sx = n.x - G.cam.x + MASTER_X, sy = n.y - G.cam.y;
  ctx.save(); ctx.globalAlpha = k;
  // a soft pool of light on her, through the vignette
  const g = ctx.createRadialGradient(sx, sy - 110, 20, sx, sy - 110, 220); g.addColorStop(0, `rgba(255,240,214,${0.22 * dark})`); g.addColorStop(1, 'rgba(255,240,214,0)');
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(sx - 240, sy - 340, 480, 360); ctx.globalCompositeOperation = 'source-over';
  ctx.font = D.font(26, 600); const tw = Math.max(ctx.measureText(w[1]).width, 160) + 48, bw = tw, bh = 104;
  const bx = clamp(sx - bw / 2, 20, W - bw - 20), by = sy - 330;
  D.panel(ctx, bx, by, bw, bh, { paper: true, plain: true, accent: D.hexA(sp.color, 0.9) });
  ctx.beginPath(); ctx.moveTo(sx - 14, by + bh - 2); ctx.lineTo(sx, by + bh + 22); ctx.lineTo(sx + 14, by + bh - 2); ctx.closePath(); ctx.fillStyle = '#f3e6c8'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#1d1420'; ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = D.font(26, 800); ctx.fillStyle = '#2a1d26'; ctx.fillText(sp.name, bx + 24, by + 38);
  ctx.fillStyle = sp.color; D.rr(ctx, bx + 24, by + 46, ctx.measureText(sp.name).width, 4, 2); ctx.fill();
  ctx.font = D.font(26, 600); ctx.fillStyle = '#2a1d26'; ctx.fillText(w[1], bx + 24, by + 84);
  ctx.restore();
}
function drawCard(ctx, A) {
  const t = A.cardT, a = clamp((t - 0.25) / 0.35, 0, 1) * clamp(((A.minor ? 3.4 : 4.6) - t) / 0.4 + (A.done ? 0 : 1), 0, 1);
  if (a <= 0) return;
  const P = A.P, C = ELEMENTS[P.el], cy = A.minor ? 330 : 380, scale = A.minor ? 0.78 : 1, grow = 1 + 0.04 * Math.min(1, t / 3);
  ctx.save(); ctx.globalAlpha = a;
  const art = Assets.get('ui.powercard');
  const bw = 1500 * scale, bh = 360 * scale;
  if (art) { const ih = bh * 1.25, iw = art.img.width * ih / art.img.height; ctx.drawImage(art.img, W / 2 - iw / 2, cy - ih / 2, iw, ih); }
  else {
    const g = ctx.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
    g.addColorStop(0, 'rgba(14,8,18,0)'); g.addColorStop(0.25, 'rgba(14,8,18,0.82)'); g.addColorStop(0.75, 'rgba(14,8,18,0.82)'); g.addColorStop(1, 'rgba(14,8,18,0)');
    ctx.fillStyle = g; ctx.fillRect(0, cy - bh / 2, W, bh);
    for (const dy of [-bh * 0.3, bh * 0.3]) { const lg = ctx.createLinearGradient(W / 2 - bw / 2, 0, W / 2 + bw / 2, 0); lg.addColorStop(0, 'rgba(255,233,168,0)'); lg.addColorStop(0.5, 'rgba(255,233,168,0.9)'); lg.addColorStop(1, 'rgba(255,233,168,0)'); ctx.fillStyle = lg; ctx.fillRect(W / 2 - bw / 2, cy + dy - 1.5, bw, 3); }
  }
  ctx.translate(W / 2, cy); ctx.scale(grow, grow);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = D.font(124 * scale, 900); ctx.lineJoin = 'round'; ctx.lineWidth = 16; ctx.strokeStyle = '#1d1420'; ctx.strokeText(P.title, 0, -24 * scale);
  const tg = ctx.createLinearGradient(0, -90 * scale, 0, 40 * scale); tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, C.color);
  ctx.fillStyle = tg; ctx.fillText(P.title, 0, -24 * scale);
  ctx.font = D.font(40 * scale, 600); ctx.lineWidth = 8; ctx.strokeText(P.line, 0, 78 * scale); ctx.fillStyle = '#ffe9a8'; ctx.fillText(P.line, 0, 78 * scale);
  if (P.also) { ctx.font = D.font(26 * scale, 600); ctx.fillStyle = 'rgba(243,236,223,0.75)'; ctx.fillText(P.also, 0, 128 * scale); }
  ctx.restore();
}
export { flag };
