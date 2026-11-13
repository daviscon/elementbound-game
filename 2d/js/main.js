// Boot, the fixed-step loop, and rendering.
import { G, clamp } from './game.js';
import { W, H, DT, MOVE_ORDER } from './config.js';
import { Input } from './input.js';
import { Assets } from './assets.js';
import { ROOMS, drawBackground, drawWorld, drawWorldFront, drawForeground } from './world.js';
import { Kits } from './kits.js';
import { Sound } from './audio.js';
import { drawPlayer, nearInteract } from './player.js';
import { drawEnemies, drawHurts, drawShots, safeDraw } from './enemies.js';
import { drawFx, drawParts } from './fx.js';
import { step } from './sim.js';
import * as Flow from './flow.js';
import * as UI from './ui.js';
import * as D from './draw.js';
import { drawAttuneWorld, drawAttuneHud } from './attune.js';
import { Touch } from './touch.js';   // v15: touch controls (drawn last, in screen space)

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
G.debug = params.has('debug');
Input.noPad = params.has('nopad');

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = Math.floor(W * s) + 'px';
  canvas.style.height = Math.floor(H * s) + 'px';
}
window.addEventListener('resize', fit);
fit();

// Treasures use the painted skill icons (petal, pearl, lotus, jade charm) in a soft glow.
const ICON = { heart: 3, bead: 4, bloom: 2, mark: 9 };
const GLOW = { heart: '255,170,150', bead: '191,233,242', bloom: '255,200,190', mark: '155,224,168' };
function drawTreasure(c, k, t, a) {
  const bob = Math.sin(t * 2.3 + (k.seed || 0)) * 7, r = k.t === 'bloom' ? 26 : 34, y = k.y + bob;
  c.save(); c.globalAlpha *= a;
  const g = c.createRadialGradient(k.x, y, 4, k.x, y, r * 2.2);
  g.addColorStop(0, `rgba(${GLOW[k.t]},${0.55 + 0.15 * Math.sin(t * 4)})`); g.addColorStop(1, `rgba(${GLOW[k.t]},0)`);
  c.fillStyle = g; c.beginPath(); c.arc(k.x, y, r * 2.2, 0, 7); c.fill();
  if (Assets.has('ui.skills')) { UI.skillIcon(c, ICON[k.t], k.x, y, r); c.beginPath(); c.arc(k.x, y, r, 0, 7); c.lineWidth = 4; c.strokeStyle = '#1d1420'; c.stroke(); }
  else if (k.t === 'heart') D.drawHeart(c, k.x, k.y, t); else if (k.t === 'bead') D.drawPearl(c, k.x, k.y, t); else D.drawBloom(c, k.x, k.y, t, 1);
  if (k.t !== 'bloom' && Math.random() < 0.08) G.parts.push({ x: k.x + (Math.random() - 0.5) * 60, y: y + 20, vx: 0, vy: -60, life: 0.8, max: 0.8, size: 5, color: '#ffffff', grav: 0 });
  c.restore();
}
function drawPickups(c) {
  const t = G.time;
  for (const k of G.pickups) {
    if (k.respawn > 0) continue;
    const a = k.dropped ? clamp(k.life / 1.5, 0, 1) : 1;
    if (k.t === 'wisp') {
      if (!Assets.drawFx(c, 'fx.wisp', Math.floor((t + (k.seed || 0)) * 10) % 8, k.x, k.y + Math.sin(t * 3 + (k.seed || 0)) * 6, 120, 1, { alpha: a })) D.drawWisp(c, k.x, k.y, t + (k.seed || 0), a);
    } else if (k.t === 'jade') {
      c.save(); c.globalAlpha = a; c.beginPath(); c.arc(k.x, k.y, 11, 0, 7); D.inked(c, '#7fd19a', 4);
      c.beginPath(); c.arc(k.x - 3, k.y - 3, 3.5, 0, 7); c.fillStyle = '#e6fff0'; c.fill(); c.restore();
    } else drawTreasure(c, k, t, a);
  }
  // the satchel you dropped when you fell
  const sat = G.save && G.save.satchel;
  if (sat && G.room && sat.room === G.room.id) {
    const y = sat.y - 30 + Math.sin(t * 2) * 4;
    c.save(); const g = c.createRadialGradient(sat.x, y, 4, sat.x, y, 80); g.addColorStop(0, 'rgba(127,209,154,0.5)'); g.addColorStop(1, 'rgba(127,209,154,0)'); c.fillStyle = g; c.fillRect(sat.x - 80, y - 80, 160, 160);
    const art = Assets.get('prop.satchel');   // v7: Joon's painted satchel, spilled beads and all, when it exists
    if (art) { const h = 110, w = art.img.width * h / art.img.height; c.drawImage(art.img, sat.x - w / 2, sat.y + 8 - h, w, h); }
    else { D.rr(c, sat.x - 26, y - 20, 52, 44, 14); D.inked(c, '#8a6a45', 5); c.beginPath(); c.arc(sat.x, y - 2, 7, 0, 7); c.fillStyle = '#7fd19a'; c.fill(); }
    // v9 (Connor's note 3): how many beads are in it, readable from across the room
    const ty = sat.y - 150 + Math.sin(t * 2) * 4, str = String(sat.jade);
    c.font = D.font(34, 800); const tw = c.measureText(str).width + 74;
    D.rr(c, sat.x - tw / 2, ty - 26, tw, 52, 26); D.inked(c, 'rgba(29,20,32,0.86)', 4);
    UI.drawBead(c, sat.x - tw / 2 + 28, ty, 15);
    c.font = D.font(34, 800); c.fillStyle = '#c8ffd8'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(str, sat.x - tw / 2 + 52, ty + 2);
    c.restore();
  }
}
// Kesh in the world (once his sheet exists): at the Barracks until the betrayal is spoken,
// then he walks off and fades; at the Brass Gate from the moment he comes back.
function drawKesh(c) {
  if (!Assets.has('kesh.idle') || !G.room) return;
  const r = G.room, f = G.save.flags;
  let k = null;
  if (r.id === 'bg3' && (r.fight || !f['talk-betray'])) {
    k = r.kesh = r.kesh || { x: 1700, y: 970, a: 1 };
    if (f['talk-betray']) { k.x += 260 / 60; k.a = Math.max(0, k.a - 1 / 50); }
  } else if (r.id === 'bg5' && f['talk-keshReturns'] && !G.save.won) k = r.kesh = r.kesh || { x: 290, y: 800, a: 0 };
  if (!k || k.a <= 0 && r.id === 'bg3') return;
  if (r.id === 'bg5') k.a = Math.min(1, k.a + 1 / 30);
  const face = Math.sign(G.player.x - k.x) || -1;
  c.fillStyle = `rgba(20,10,25,${0.28 * k.a})`; c.beginPath(); c.ellipse(k.x, k.y + 2, 44, 9, 0, 0, 7); c.fill();
  Assets.drawChar(c, 'kesh.idle', Math.floor(G.time * 7) % 8, k.x, k.y + 4, face, { alpha: k.a });
}

function drawVillagers(c) {
  drawKesh(c);
  for (const v of G.villagers) {
    v.animT = (v.animT || 0) + 1 / 60;
    c.fillStyle = 'rgba(20,10,25,0.28)'; c.beginPath(); c.ellipse(v.x, v.y + 2, 42, 9, 0, 0, 7); c.fill();
    if (v.who === 'mapmaker') {
      // the Mapmaker at the painted stall when that art exists; else the older signboard stall
      const stall = Assets.get('prop.stall');
      if (stall && Assets.has('mapmaker.idle')) {
        const h = 300, w = stall.img.width * h / stall.img.height;
        c.drawImage(stall.img, v.x + 40 - w / 2, v.y + 6 - h, w, h);
        Assets.drawChar(c, 'mapmaker.idle', Math.floor(v.animT * 5) % 8, v.x - 140, v.y + 4, 1);
      } else if (Kits.ready && Kits.drawRect) drawStall(c, v);
      continue;
    }
    const bob = Math.sin(v.animT * 2) * 0.012;
    Assets.drawChar(c, 'villager.lineup', v.def.frame, v.x, v.y + 4, v.face, { sy: 1 + bob });
  }
}
function drawStall(c, v) {
  const piece = (n) => Kits.piece(n.includes(':') ? n.split(':') : n, 'kite');
  const draw = (n, x, h) => { const pc = piece(n); if (pc) { const w = pc.w * h / pc.h; Kits.drawRect(c, pc, x - w / 2, v.y - h + 4, w, h); } };
  draw('lantern', v.x + 200, 200); draw('baskets', v.x + 150, 110);
  // v5: the Mapmaker stands beside the stall as a person; the sign and the table are the stall
  const sw = 150, sh = 70, sy = v.y - 250 + Math.sin(G.time * 1.5) * 2;
  c.fillStyle = '#6d4a3f'; c.fillRect(v.x + 46, sy + sh, 8, v.y - 96 - sy - sh);
  D.rr(c, v.x + 50 - sw / 2, sy, sw, sh, 8); D.inked(c, '#e8d9b5', 5);
  c.fillStyle = '#3a2a30'; c.font = D.font(24, 800); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('MAPS', v.x + 50, sy + sh / 2 + 1);
  D.rr(c, v.x - 40, v.y - 96, 180, 96, 8); D.inked(c, '#8a5d3b', 5);
  // a couple of rolled maps on the table
  for (const [dx, col] of [[-10, '#efe3c8'], [30, '#e4d3ad'], [80, '#efe3c8']]) { D.rr(c, v.x + dx, v.y - 116, 44, 20, 9); D.inked(c, col, 4); }
  if (!drawStander(c, 'mapmaker', v.x - 120, v.y, Math.sign(G.player.x - (v.x - 120)) || 1, v.animT)) {
    const por = Assets.get('portrait.mapmaker');
    if (por) { c.save(); D.rr(c, v.x - 200, v.y - 290, 150, 190, 6); c.clip(); c.drawImage(por.img, por.img.width * 0.1, 0, por.img.width * 0.8, por.img.height, v.x - 200, v.y - 290, 150, 190); c.restore(); }
  }
}
// v9 (Connor's note 8): the wind-wisp that shows the way on after a minute without progress
function drawGuide(c) {
  const w = G.guide; if (!w) return;
  const a = Math.min(1, w.t / 0.5) * (w.arrivedT ? Math.max(0, 1 - w.arrivedT / 5) : 1);
  c.save(); c.globalAlpha = a;
  const g = c.createRadialGradient(w.x, w.y, 4, w.x, w.y, 110); g.addColorStop(0, 'rgba(234,252,255,0.6)'); g.addColorStop(1, 'rgba(234,252,255,0)');
  c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(w.x - 110, w.y - 110, 220, 220); c.globalCompositeOperation = 'source-over';
  if (!Assets.drawFx(c, 'fx.wisp', Math.floor(G.time * 10) % 8, w.x, w.y, 130, Math.sign(w.tx - w.x) || 1, { alpha: a })) D.drawWisp(c, w.x, w.y, G.time, a);
  c.restore();
}
function drawPops(c) {
  for (const p of G.pops) {
    const k = p.t / 0.9;
    c.save(); c.globalAlpha = Math.min(1, (1 - k) * 2.5);
    c.font = D.font(34 + (1 - Math.min(1, p.t / 0.12)) * 16, 800); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 8; c.strokeStyle = '#1d1420'; c.lineJoin = 'round'; c.strokeText(p.text, p.x, p.y - k * 60);
    c.fillStyle = p.color; c.fillText(p.text, p.x, p.y - k * 60);
    c.restore();
  }
}

// v5: the three masters stand at their shrines as themselves; the Elder waits a step behind them.
const MASTER = { water: 'ren', earth: 'tamsin', fire: 'kesh' };
function masterOf(n) { for (const [, key] of n.def.talks || []) if (MASTER[key]) return MASTER[key]; return null; }
// A standing figure one step behind the play lane: 12 px up, 92% scale, a breathing bob, a soft shadow.
export function drawStander(c, who, x, y, face, animT, alpha = 1) {
  const idle = Assets.has(who + '.idle') ? who + '.idle' : who + '.stand';   // v8: the portraits are busts now, so a figure never stands as one when its idle sheet exists
  if (!Assets.has(idle)) return false;
  c.fillStyle = `rgba(20,10,25,${0.26 * alpha})`; c.beginPath(); c.ellipse(x, y - 10, 42, 8, 0, 0, 7); c.fill();
  const f = idle.endsWith('.idle') ? Math.floor(animT * 6) % 8 : 0, bob = Math.sin(animT * 2.2) * 0.012;
  return Assets.drawChar(c, idle, f, x, y - 8, face, { alpha, scale: 0.92, sy: 1 + bob });
}
function drawNpc(c) {
  const n = G.npc;
  if (!n) return;
  if (n.fadeIn != null && n.fadeIn < 1) n.fadeIn = Math.min(1, n.fadeIn + 1 / 24);
  const m = masterOf(n);
  if (m && (Assets.has(m + '.idle') || Assets.has(m + '.stand'))) {
    // the Elder a pace further back, then the master in front, both facing Joon
    const ex = n.x + (G.player.x < n.x ? 150 : -150);
    Assets.drawChar(c, 'elder.idle', Math.floor(n.animT * 6) % 8, ex, n.y - 14, Math.sign(G.player.x - ex) || -1, { scale: 0.86, alpha: 0.95 });
    if (drawStander(c, m, n.x, n.y, n.face, n.animT)) return;
  }
  c.fillStyle = 'rgba(20,10,25,0.28)'; c.beginPath(); c.ellipse(n.x, n.y + 2, 46, 9, 0, 0, 7); c.fill();
  // v7: walking in, a slow step bob and a slight lean over the idle sheet (she has no walk sheet)
  const wb = n.walking ? Math.abs(Math.sin(n.animT * 5.5)) * 7 : 0;
  if (!Assets.drawChar(c, 'elder.idle', Math.floor(n.animT * 6) % 8, n.x, n.y + 4 - wb, n.face, { alpha: n.fadeIn ?? 1, rot: n.walking ? n.face * 0.035 : 0 })) {
    c.fillStyle = '#5b5f73'; D.rr(c, n.x - 34, n.y - 190, 68, 190, 26); D.inked(c, '#5b5f73', 5);
    c.beginPath(); c.arc(n.x, n.y - 205, 26, 0, 7); D.inked(c, '#e9d6c0', 5);
  }
}

// v13: the impact frame (see impact() in game.js): a cream page, radial speed lines from the blow in gold or the
// element's colour with ink edges, and the fighters redrawn over it as flat black ink. World coordinates.
function drawImpact(c) {
  const im = G.impact, k = (performance.now() - im.t0) / im.dur;
  if (k >= 1) { G.impact = null; return; }
  if (!im.sounded) { im.sounded = true; Sound.sfx('impact-frame', { x: im.x }); if (im.stopDown && G.state === 'play') Sound.stopDown(); }
  const x0 = G.cam.x - 200, y0 = G.cam.y - 200, w = W + 400, h = H + 400;
  c.save();
  // three beats: cream page, then the middle frame inverted (an ink page, cream figures), then cream again
  const inv = k > 0.34 && k < 0.67;
  c.fillStyle = inv ? '#1d1620' : '#f6ecd2'; c.fillRect(x0, y0, w, h);
  let s = im.seed; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const R = Math.hypot(W, H);
  for (let i = 0; i < 46; i++) {
    const a = i / 46 * Math.PI * 2 + r() * 0.12, wd = 0.018 + r() * 0.05, r0 = 90 + r() * 260;
    c.beginPath();
    c.moveTo(im.x + Math.cos(a) * r0, im.y + Math.sin(a) * r0);
    c.lineTo(im.x + Math.cos(a - wd) * R, im.y + Math.sin(a - wd) * R);
    c.lineTo(im.x + Math.cos(a + wd) * R, im.y + Math.sin(a + wd) * R);
    c.closePath();
    c.fillStyle = i % 3 === 0 ? (inv ? '#f6ecd2' : '#1d1620') : im.col; c.fill();
  }
  // a hard-edged star at the point of contact
  c.beginPath();
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? 46 : 120 + r() * 40; c.lineTo(im.x + Math.cos(a) * rr, im.y + Math.sin(a) * rr); }
  c.closePath(); c.fillStyle = '#fff8e4'; c.fill(); c.lineWidth = 6; c.strokeStyle = inv ? im.col : '#1d1620'; c.stroke();
  c.restore();
  Assets.inkMode = inv ? 'light' : true;
  try { drawEnemies(c); drawPlayer(c); } finally { Assets.inkMode = false; }
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (G.state === 'loading') {
    ctx.fillStyle = '#1d1420'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f3ecdf'; ctx.font = D.font(40); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Elementbound', W / 2, H / 2 - 30);
    D.rr(ctx, W / 2 - 200, H / 2 + 20, 400, 16, 8); ctx.fillStyle = '#32283a'; ctx.fill();
    D.rr(ctx, W / 2 - 200, H / 2 + 20, 400 * Assets.progress, 16, 8); ctx.fillStyle = '#bfe9f2'; ctx.fill();
    return;
  }
  if (G.state === 'title') UI.drawTitle(ctx);
  else if (G.state === 'ending') UI.drawEnding(ctx);
  else if (G.state === 'cutscene' && !G.cut.overlay) UI.drawCutscene(ctx);
  else if (G.room) {
    const near = G.state === 'play' && !G.player.dead ? nearInteract() : null;
    drawBackground(ctx);
    const sx = G.shake ? (Math.random() * 2 - 1) * G.shake : 0, sy = G.shake ? (Math.random() * 2 - 1) * G.shake : 0;
    ctx.save();
    // camera zoom (boss intros) scales around the player's screen position
    const z = G.zoom || 1;
    if (z !== 1) { const fx = G.zoomAt ? G.zoomAt.x - G.cam.x : W / 2, fy = G.zoomAt ? G.zoomAt.y - G.cam.y : H / 2; ctx.translate(fx, fy); ctx.scale(z, z); ctx.translate(-fx, -fy); }
    ctx.translate(Math.round(-G.cam.x + sx), Math.round(-G.cam.y + sy));
    drawWorld(ctx, near);
    safeDraw(ctx, 'pickups', () => drawPickups(ctx));
    safeDraw(ctx, 'guide', () => drawGuide(ctx));
    safeDraw(ctx, 'npc', () => drawNpc(ctx));
    safeDraw(ctx, 'villagers', () => drawVillagers(ctx));
    drawEnemies(ctx);
    safeDraw(ctx, 'fxbehind', () => drawFx(ctx, 'behind'));
    safeDraw(ctx, 'player', () => drawPlayer(ctx));
    safeDraw(ctx, 'shots', () => drawShots(ctx));
    safeDraw(ctx, 'fx', () => drawFx(ctx));
    safeDraw(ctx, 'attune', () => drawAttuneWorld(ctx));   // v10 (note 11)
    safeDraw(ctx, 'hurts', () => drawHurts(ctx));          // telegraphs over the effects, so a big gust never hides what to dodge
    safeDraw(ctx, 'parts', () => drawParts(ctx));
    safeDraw(ctx, 'front', () => drawWorldFront(ctx));
    safeDraw(ctx, 'pops', () => drawPops(ctx));
    if (G.impact) safeDraw(ctx, 'impact', () => drawImpact(ctx));
    ctx.restore();
    drawForeground(ctx);
    safeDraw(ctx, 'hud', () => UI.drawHud(ctx, near));
    safeDraw(ctx, 'attunehud', () => drawAttuneHud(ctx));
    if (G.state === 'lesson') UI.drawLesson(ctx);
    else if (G.state === 'equip') UI.drawEquip(ctx);
    else if (G.state === 'pause') UI.drawPause(ctx);
    else if (G.state === 'map') UI.drawMap(ctx);
    else if (G.state === 'talk') UI.drawTalk(ctx);
    else if (G.state === 'recall') UI.drawRecall(ctx);
    else if (G.state === 'shop') UI.drawShop(ctx);
  }
  if (G.fade) {
    const k = G.fade.t / G.fade.dur, a = clamp(1 - Math.abs(k * 2 - 1), 0, 1) * 1.15;
    if (G.fade.wipe) {
      // side exits: a dark band sweeps across in the direction of travel
      const d = G.fade.wipe, x = d > 0 ? W - k * 2 * W : -W + k * 2 * W;
      const g = ctx.createLinearGradient(x, 0, x + W, 0);
      const e0 = d > 0 ? 0 : 1;
      g.addColorStop(e0, 'rgba(14,8,18,0)'); g.addColorStop(0.5, 'rgba(14,8,18,1)'); g.addColorStop(1 - e0, 'rgba(14,8,18,0)');
      ctx.fillStyle = `rgba(14,8,18,${a * 0.8})`; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = g; ctx.fillRect(x, 0, W, H);
    } else { ctx.fillStyle = `rgba(14,8,18,${a})`; ctx.fillRect(0, 0, W, H); }
    // v15: a door into a region whose art is still on its way holds on a small loading card
    if (G.fade.region && G.fade.t >= G.fade.dur / 2 - 0.001 && G.fade.hold && G.fade.hold()) {
      const pr = Assets.regionProgress(G.fade.region);
      ctx.fillStyle = 'rgba(14,8,18,1)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f3ecdf'; ctx.font = D.font(30, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Unrolling the road ahead...', W / 2, H / 2 - 30);
      D.rr(ctx, W / 2 - 200, H / 2 + 10, 400, 12, 6); ctx.fillStyle = '#32283a'; ctx.fill();
      D.rr(ctx, W / 2 - 200, H / 2 + 10, 400 * pr, 12, 6); ctx.fillStyle = '#bfe9f2'; ctx.fill();
    }
  }
  safeDraw(ctx, 'touch', () => Touch.draw(ctx));
}

let last = 0, acc = 0, manual = false;
function frame(ts) {
  const dt = Math.min(0.1, (ts - last) / 1000 || 0);
  last = ts;
  Input.poll();
  if (Input.anyPressed) Sound.nudge();
  if (!manual) {
    acc += dt;
    while (acc >= DT) { step(DT); Input.consume(); acc -= DT; }
  }
  const r0 = performance.now();
  render();
  // v8 (review 8 #12): ?fps=1 shows frame time and render cost (check kh1, nq1 and km5 in a real browser)
  if (SHOW_FPS) {
    const ms = performance.now() - r0; fpsHist.push(dt * 1000); if (fpsHist.length > 60) fpsHist.shift();
    const avg = fpsHist.reduce((a, b) => a + b, 0) / fpsHist.length, worst = Math.max(...fpsHist);
    ctx.save(); ctx.fillStyle = 'rgba(14,8,18,0.7)'; ctx.fillRect(W - 330, H - 120, 310, 64); ctx.fillStyle = worst > 20 ? '#ffb38a' : '#c8ffd8'; ctx.font = '600 20px monospace';
    ctx.fillText(`${(1000 / avg).toFixed(0)} fps  worst ${worst.toFixed(1)} ms`, W - 316, H - 94); ctx.fillText(`draw ${ms.toFixed(1)} ms  ${G.room ? G.room.id : ''}`, W - 316, H - 68); ctx.restore();
  }
  requestAnimationFrame(frame);
}
const SHOW_FPS = params.has('fps'), fpsHist = [];

// Debug / playtest handle (also used by the automated checks).
window.__game = {
  G, Input, Assets, Kits, Sound, ROOMS, Flow, UI,
  get Enemies() { return import('./enemies.js'); },
  manual(on = true) { manual = on; acc = 0; },
  step(n = 1) { for (let i = 0; i < n; i++) { step(DT); Input.consume(); } },
  sim(n = 1) { this.step(n); },
  hold(action, on = true) { Input.set(action, on); },
  tap(action, frames = 2) { Input.set(action, true); this.step(frames); Input.set(action, false); this.step(1); },
  newGame() { Flow.startGame(true); },
  warp(room, x, y) { const d = ROOMS[room]; Flow.enterRoom(room, x ?? (d.start ? d.start[0] : 200), y ?? (d.start ? d.start[1] : 900)); G.state = 'play'; },
  grant(what = 'all') {
    const s = G.save;
    if (what === 'all') { s.moves = MOVE_ORDER.slice(); s.abil.dash = true; s.abil.doubleJump = true; s.abil.glide = true; s.abil.grip = true; }
    else if (what in s.abil) s.abil[what] = true;
    else if (!s.moves.includes(what)) s.moves.push(what);
  },
  equip(...ids) { ids.forEach((id, i) => { G.save.slots[i] = id; }); },
  render,
};

async function boot() {
  Input.init(canvas);
  Touch.init(canvas);
  Sound.init();
  G.shakeScale = Sound.prefs.shake === 0 ? 0.15 : 1;
  requestAnimationFrame(frame);
  if (!params.has('noart')) await Promise.all([Assets.load(), Kits.load()]);   // ?noart=1 shows the code-drawn placeholders
  if (!params.has('noart')) Assets.startRescan();
  if (!params.has('noart')) { Assets.warmInk(true); Assets.lateDone && Assets.lateDone.then(() => Assets.warmInk()); }   // v13 (?ink=1 only): outlines baked behind the loading screen, late sheets in idle time
  UI.openTitle();
}
boot();
