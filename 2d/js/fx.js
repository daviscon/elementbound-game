// Effects (sheet-backed with code-drawn fallbacks) and particles.
import { G } from './game.js';
import { Assets } from './assets.js';
import { phFx } from './placeholders.js';
import { INK } from './config.js';

const SHEET = { gust: 1, deflect: 1, whip: 1, slam: 1, flamering: 1, spark: 1, dust: 1, poof: 1, floorbreak: 1 };
const NO_FALLBACK = { spark: 1, dust: 1, poof: 1, floorbreak: 1 };   // particles already cover these without art

// Painted effects added in cycle 4. Each uses its own sheet when it exists (assets/fx/),
// and until then a painted stand-in cut from a sheet we already have; nothing is
// drawn with code shapes. fb: [sheet, opts] where opts can squash (sy), stretch (sx),
// pick a frame range (f0..f1), tint, or fade.
const PAINTED = {
  strikearc: { key: 'fx.strikearc', fb: ['fx.gust', { f0: 1, f1: 7, sy: 0.55, alpha: 0.85, rot: -0.25 }] },
  // v11 (review 11 #11, art C4): three strike arcs: a short flat one for side strikes, a rising one, a falling one
  arcside: { key: 'fx.arcside', fb: ['fx.strikearc', {}] },
  arcup: { key: 'fx.arcup', fb: ['fx.strikearc', { rot: -1.2 }] },
  arcdown: { key: 'fx.arcdown', fb: ['fx.strikearc', { rot: 1.2 }] },
  strikeheavy: { key: 'fx.strikearcheavy', fb: ['fx.deflect', { f0: 2, f1: 7, sx: 1.15, sy: 0.8, alpha: 0.9 }] },
  airring: { key: 'fx.airring', fb: ['fx.deflect', { f0: 1, f1: 7, sy: 0.24, alpha: 0.9 }] },
  dashstreak: { key: 'fx.dashstreak', fb: ['fx.gust', { f0: 2, f1: 7, sy: 0.5, alpha: 0.8, flip: true }] },
  dustsmall: { key: 'fx.dustsmall', fb: ['fx.dust', { f0: 1, f1: 7, sy: 0.7, alpha: 0.8 }] },
  skid: { key: 'fx.skid', fb: ['fx.dust', { f0: 2, f1: 7, sx: 0.6, sy: 0.6, alpha: 0.75 }] },
  splash: { key: 'fx.splash', fb: null, code: 'splash' },   // v6: painted low crown (or code droplets and a ring), not the tall whip arcs
  downtrail: { key: 'fx.downtrail', fb: ['fx.gust', { f0: 1, f1: 6, rot: Math.PI / 2, sy: 0.5, alpha: 0.75, flip: true }] },
  bounce: { key: 'fx.airring', fb: ['fx.deflect', { f0: 2, f1: 7, sy: 0.3, alpha: 0.9 }] },
  respawn: { key: 'fx.respawn', fb: ['fx.deflect', { f0: 1, f1: 7, sy: 1.8, alpha: 0.6, tint: 'rgba(255,240,215,0.55)' }] },
  blockspark: { key: 'fx.blockspark', fb: ['fx.spark', { f0: 1, f1: 7, tint: 'rgba(255,233,168,0.6)', alpha: 0.95 }] },
  guardbreak: { key: 'fx.guardbreak', fb: ['fx.floorbreak', { f0: 0, f1: 7, alpha: 1 }] },
  steam: { key: 'fx.steam', fb: ['fx.poof', { f0: 0, f1: 7, tint: 'rgba(243,236,223,0.85)', alpha: 0.8 }] },
  shatter: { key: 'fx.shatter', fb: ['fx.floorbreak', { f0: 1, f1: 7, alpha: 1 }] },
  // v5: a boss's phase change rings out in its colour
  phaseattune: { key: 'fx.attunering', fb: ['fx.airring', { f0: 0, f1: 7, sy: 0.28, alpha: 0.9 }] },   // v15 (note 68)
  phasering: { key: 'fx.deflect', fb: ['fx.deflect', { f0: 0, f1: 7, alpha: 0.95 }] },
  // v10 (review 10 #9, A9-A11): each boss's phase change bursts in its own element
  phaseburstwater: { key: 'fx.phaseburst-water', fb: ['fx.deflect', { f0: 0, f1: 7, alpha: 0.8 }] },
  phaseburstearth: { key: 'fx.phaseburst-earth', fb: ['fx.deflect', { f0: 0, f1: 7, alpha: 0.8 }] },
  phaseburstfire: { key: 'fx.phaseburst-fire', fb: ['fx.deflect', { f0: 0, f1: 7, alpha: 0.8 }] },
  phaseburstbrass: { key: 'fx.phaseburst-brass', fb: ['fx.deflect', { f0: 0, f1: 7, alpha: 0.8 }] },   // v11 (C5)
  attunepulse: { key: 'fx.attunepulse', fb: ['fx.deflect', { f0: 0, f1: 7, sy: 0.4, alpha: 0.8 }] },   // v11 (C1)
  sprintdust: { key: 'fx.sprintdust', fb: ['fx.dust', { f0: 1, f1: 7, sy: 0.6, alpha: 0.8 }] },   // v11 (C2)
  // v6 requests (review-6/ASSET-REQUESTS.md), with stand-ins until they arrive
  iceshatter: { key: 'fx.iceshatter', fb: ['fx.floorbreak', { f0: 1, f1: 7, tint: 'rgba(190,232,250,0.75)', alpha: 0.95 }] },
  collapsedust: { key: 'fx.collapsedust', fb: ['fx.dust', { f0: 0, f1: 7, sx: 1.25, sy: 0.75, alpha: 0.9 }] },
  // v7 (review 7 A21): the double jump's own puff of wind under the feet; the move's air ring stands in until it arrives
  jumpring: { key: 'fx.jumpring', fb: ['fx.airring', { f0: 0, f1: 7, alpha: 0.9 }] },
  // v8 (review 8 #1, A25): an ordinary defeat leaves a low see-through puff at the feet, never a cloud over both fighters
  poofsmall: { key: 'fx.defeatpoofsmall', fb: ['fx.poof', { f0: 1, f1: 7, sx: 1.2, sy: 0.6, alpha: 0.6 }] },
  // v8 (review 8 #2, A24): thin air lines under the palms while gliding
  glidestreak: { key: 'fx.glidestreaks', fb: ['fx.gust', { f0: 2, f1: 7, rot: Math.PI / 2, sy: 0.35, alpha: 0.45, flip: true }] },
  steamfx: { key: 'fx.steam', fb: ['fx.poof', { f0: 0, f1: 7, tint: 'rgba(243,236,223,0.85)', alpha: 0.8 }] },
};
// Hit sparks by element: the element's own sheet, else the shared spark washed in its colour.
const SPARK_TINT = { air: 'rgba(214,246,255,0.75)', water: 'rgba(70,170,235,0.6)', earth: 'rgba(205,160,100,0.65)', fire: 'rgba(255,120,40,0.45)' };

// Code fallback for the splash: a low crown of droplets and a flat ring on the surface.
function codeSplash(ctx, k, x, y, size) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - k);
  ctx.strokeStyle = 'rgba(214,242,244,0.9)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(x, y - 4, size * (0.25 + 0.3 * k), size * 0.05, 0, 0, 7); ctx.stroke();
  ctx.fillStyle = '#d8f2f4';
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i / 11 - 0.5) * 2.2, v = size * (0.55 + 0.25 * ((i * 7) % 5) / 5);
    const px = x + Math.cos(a) * v * k, py = y - 6 + Math.sin(a) * v * k * 0.9 + 1.4 * size * k * k;
    ctx.beginPath(); ctx.arc(px, py, Math.max(1, 5 * (1 - k)), 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawPainted(ctx, f, k, x, y) {
  const P = PAINTED[f.kind];
  const own = Assets.has(P.key);
  if (!own && P.code === 'splash') { codeSplash(ctx, k, x, y, f.size); return; }
  const [key, o] = own ? [P.key, {}] : P.fb;
  const f0 = o.f0 ?? 0, f1 = o.f1 ?? 7;
  const frame = f.loop ? f0 + Math.floor(f.t * 12) % (f1 - f0 + 1) : Math.min(f1, f0 + Math.floor(k * (f1 - f0 + 1)));
  const alpha = (o.alpha ?? 1) * (f.alpha ?? 1) * (f.loop ? Math.max(0, Math.min(1, (f.dur - f.t) / 0.4, f.t / 0.15)) : 1)
    * (f.fadeOut ? Math.max(0, Math.min(1, (f.dur - f.t) / f.fadeOut)) : 1);
  const face = (f.face || 1) * (o.flip ? -1 : 1);
  const opts = { anchor: f.anchor, alpha, sx: o.sx ?? f.sx, sy: o.sy ?? f.sy, rot: (o.rot || 0) * (f.face || 1) + (f.rot || 0), tint: f.tint || o.tint };
  if (f.blend) { ctx.save(); ctx.globalCompositeOperation = f.blend; }
  Assets.drawFx(ctx, key, frame, x, y, f.size, face, opts);
  if (f.blend) ctx.restore();
  if (o.mirror && !own) Assets.drawFx(ctx, key, frame, x, y, f.size, -face, { ...opts, rot: -opts.rot });
}

export function updateFx(dt) {
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i];
    f.t += dt;
    if (f.t >= f.dur || (f.follow && f.follow.dead)) G.fx.splice(i, 1);
  }
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.life -= dt;
    if (p.life <= 0) { G.parts.splice(i, 1); continue; }
    p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.atmos) { p.x += Math.sin(G.time * 1.7 + p.ph) * 20 * p.atmos * dt; continue; }
    p.vx *= 0.985;
  }
  if (G.parts.length > 600) G.parts.splice(0, G.parts.length - 600);
}

// layer 'behind' draws the effects marked behind (under the hero); the default pass draws the rest.
export function drawFx(ctx, layer) {
  for (const f of G.fx) {
    if (!f.split && !!f.behind !== (layer === 'behind')) continue;
    // a ring around the body: drawn whole behind the hero, then its near (lower) half over him at 0.75
    if (f.split && layer !== 'behind') {
      const x = f.follow ? f.follow.x + f.ox : f.x, y = f.follow ? f.follow.y + f.oy : f.y;
      ctx.save(); ctx.beginPath(); ctx.rect(x - f.size, y + f.size * 0.08, f.size * 2, f.size); ctx.clip(); ctx.globalAlpha = 0.4;   // v8: 0.4 so Joon stays readable inside his ring
    }
    const k = Math.min(1, f.t / f.dur);
    const x = f.follow ? f.follow.x + f.ox : f.x, y = f.follow ? f.follow.y + f.oy : f.y;
    if (f.kind === 'gustball') {   // v9: a gust that leaves the hand and grows as it travels
      const d = f.delay || 0; if (f.t < d) continue;
      const u = Math.min(1, (f.t - d) / (f.dur - d)), e = 1 - (1 - u) * (1 - u);
      const gx = x + f.face * f.travel * e, sz = f.size + f.grow * e, a = u < 0.75 ? 1 : (1 - u) / 0.25;
      if (!Assets.drawFx(ctx, 'fx.gust', Math.min(7, Math.floor(u * 8)), gx, y, sz, f.face, { anchor: 'center', alpha: a })) { ctx.save(); ctx.globalAlpha = a * 0.7; phFx(ctx, 'gust', u, gx, y, sz, f.face, G.time); ctx.restore(); }
      continue;
    }
    if (f.kind === 'bellring') {   // v9: a struck bell sends rings of sound out (code-drawn, soft gold)
      if (f.t < 0) continue;
      ctx.save(); ctx.globalAlpha = 0.55 * (1 - k); ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(x, y, f.size * (0.2 + 0.5 * k), f.size * (0.12 + 0.3 * k), 0, 0, 7); ctx.stroke(); ctx.restore();
      continue;
    }
    if (PAINTED[f.kind]) { drawPainted(ctx, f, k, x, y); continue; }
    if (f.kind === 'spark' && f.el) {
      const frame = Math.min(7, Math.floor(k * 8)), own = 'fx.hitspark-' + f.el;
      if (Assets.has(own)) Assets.drawFx(ctx, own, frame, x, y, f.size, f.face, { rot: f.rot });
      else Assets.drawFx(ctx, 'fx.spark', frame, x, y, f.size, f.face, { tint: SPARK_TINT[f.el], rot: f.rot });
      continue;
    }
    if (f.kind === 'icicleshatter') {   // v13: the icicle strip's impact frames (4-8) where an icicle lands
      Assets.drawFx(ctx, 'fx.icicle', 3 + Math.min(4, Math.floor(k * 5)), x, y, f.size, 1, { anchor: 'bottom' });
      continue;
    }
    if (SHEET[f.kind]) {
      const frame = f.loop ? Math.floor(f.t * 12) % 8 : Math.min(7, Math.floor(k * 8));
      const alpha = f.loop ? Math.max(0, Math.min(1, (f.dur - f.t) / 0.5, f.t / 0.15)) : 1;
      const ring = f.kind === 'flamering';   // v9 (review 9 #10): the ring lies flat round the waist at 0.55, so it never hides the fight
      if (!Assets.drawFx(ctx, 'fx.' + f.kind, frame, x, y, f.size, f.face, { anchor: f.anchor, alpha: alpha * (ring ? 0.55 : 1), sy: ring ? 0.45 : undefined }) && !NO_FALLBACK[f.kind]) {
        ctx.save(); ctx.globalAlpha = alpha;
        phFx(ctx, f.kind, f.loop ? 0.2 : k, x, y, f.size, f.face, G.time);
        ctx.restore();
      }
      if (f.split && layer !== 'behind') ctx.restore();
      continue;
    }
  }
}

// Eight inked shard outlines (unit radius) for the code fallback of debris chips.
const SHARDS = [...Array(8)].map((_, i) => { const n = 4 + (i % 3), pts = []; for (let j = 0; j < n; j++) { const a = (j / n) * 6.28 + Math.sin(i * 3.1 + j) * 0.4, r = 0.65 + 0.35 * Math.abs(Math.sin(i * 1.7 + j * 2.3)); pts.push([Math.cos(a) * r, Math.sin(a) * r * (0.6 + (i % 4) * 0.12)]); } return pts; });
export function drawParts(ctx) {
  for (const p of G.parts) {
    const a = p.atmos ? Math.min(1, p.life / 1.5, (p.max - p.life) / 1.0) * 0.8 : Math.min(1, p.life / (p.max * 0.5));
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.seed == null) { p.seed = Math.random(); p.rot = p.seed * 6.28; p.spin = (p.seed - 0.5) * 14; }
    p.rot += p.spin / 60;   // v7: real tumbling, not an angle read off the x position
    // v14 (Connor's note 57): fx/particles.png (8 painted particles: spark, ember, drop, ice chip, stone chunk, clay chip,
    // dust puff, leaf) replaces every code-drawn particle once it lands; the cell is picked from the shape and colour
    if (Assets.has('fx.particles')) {
      const c = String(p.color || '#ffffff'), hx = c[0] === '#' && c.length >= 7 ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : [255, 255, 255];
      const [r, g, b] = hx;
      const cell = p.shape === 'leaf' ? 7 : p.shape === 'chunk' ? (r > b + 40 && r > 150 ? 5 : 4)
        : b > r + 30 ? (r > 170 ? 3 : 2)                       // pale blue: ice chip; deep blue: water drop
        : r > 200 && g < 150 ? 1                                // red-orange: ember
        : r > 200 && g > 160 && b < 160 ? 0                     // gold: spark
        : r > 200 && g > 200 && b > 200 ? 3                     // white (snow, frost): ice chip
        : 6;                                                    // grey and brown: dust
      Assets.drawFx(ctx, 'fx.particles', cell, p.x, p.y, Math.max(8, p.size * (p.atmos ? 1.1 : cell === 3 ? 1.8 : 2.4)), 1, { rot: p.rot });
      continue;
    }
    if (p.shape === 'chunk') {
      // v7 (review 7 #8): painted chips when the sheet exists (8 different pieces), else an inked shard, never a square
      const k = Math.floor(p.seed * 8), sz = p.size * 3;
      const chips = Assets.get('ui.chips');
      if (chips) {   // the delivered sheet is 8 tall cells (2688x1152): each chip sits in the square at the middle of its cell
        const cw = chips.img.width / 8, sy = (chips.img.height - cw) / 2 + cw * 0.06;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.drawImage(chips.img, k * cw, sy, cw, cw, -sz / 2, -sz / 2, sz, sz); ctx.restore(); continue;
      }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      const r = p.size / 2, q = SHARDS[k];
      ctx.beginPath(); ctx.moveTo(q[0][0] * r, q[0][1] * r); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i][0] * r, q[i][1] * r); ctx.closePath();
      ctx.fill(); ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(q[0][0] * r * 0.8, q[0][1] * r * 0.8); ctx.lineTo(q[1][0] * r * 0.8, q[1][1] * r * 0.8);   // one lit edge
      ctx.strokeStyle = 'rgba(255,248,230,0.7)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    } else if (p.shape === 'leaf') {
      ctx.save(); ctx.translate(p.x + Math.sin(p.life * 7 + p.seed * 9) * 10, p.y); ctx.rotate(p.rot);
      ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, 7); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(p.size * 0.8, 0); ctx.strokeStyle = 'rgba(29,20,32,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    } else if (p.size >= 7 && !p.atmos && Assets.has('fx.sparksmall') && /^#(f|e)/i.test(p.color)) {
      // v7: bright round sparks use the small painted spark when it exists
      Assets.drawFx(ctx, 'fx.sparksmall', Math.min(7, Math.floor((1 - p.life / p.max) * 8)), p.x, p.y, p.size * 5, 1, { alpha: a });
    } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}
