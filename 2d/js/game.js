// The one shared game-state object, plus tiny helpers used everywhere.
import { SAVE_KEY } from './config.js';
import { Sound } from './audio.js';

export const G = {
  state: 'loading',     // loading | title | play | lesson | equip | pause | map | ending
  time: 0,
  room: null,           // runtime room (see world.js)
  player: null,
  enemies: [],
  shots: [],            // projectiles (both sides)
  hurts: [],            // short-lived enemy attack boxes
  pillars: [],          // ice / stone walls (dynamic solids)
  pickups: [],
  fx: [],               // sheet / placeholder effects
  parts: [],            // particles
  zones: [],            // the player's lingering hit zones (see moves.js)
  later: [],            // delayed callbacks { t, fn }, cleared on room change
  cam: { x: 0, y: 0 },
  shake: 0,
  hitstop: 0,
  fade: null,           // { t, dur, mid, done }
  toast: null,          // { text, sub, t }
  banner: null,         // short message near the bottom
  lesson: null,
  talk: null,           // Elder Sora-Lin's speech box
  npc: null,            // the Elder, when she is in this room
  villagers: [],        // townsfolk and the Mapmaker in this room
  pops: [],             // floating text ('Parry!', '+1')
  zoom: 1,              // camera zoom (boss intros)
  card: null,           // region name card
  menu: null,
  boss: null,           // active boss fight { enemy, name, def }
  save: null,
  debug: false,
};

export function newSave() {
  return {
    room: 'kh1', x: 620, y: 900,           // last meditation stone (respawn point)
    maxHp: 5, maxBreath: 100,
    moves: [],                             // unlocked element moves (the Shrine of Wind teaches the first two)
    slots: [null, null, null, null],       // L1 L2 R1 R2
    abil: { dash: false, doubleJump: false, glide: false, grip: false },
    pieces: 0,                             // Lotus Petal pieces (4 make a petal)
    marks: 0, skills: {},                  // Spirit Marks and the Fourfold Path
    jade: 0, satchel: null,                // jade beads; the satchel dropped on death
    scrolls: {}, pins: [], seen: {},       // map scrolls bought, map pins, gates seen
    lessons: [], deaths: 0,
    flags: {},                             // gates opened, bosses beaten, pickups taken, doors unlocked
    visited: {}, charted: {},              // v10: rooms inked on the map at a rest (note 21)
    started: false,
    won: false,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.room) return null;
    const d = newSave();
    return Object.assign(d, s, { abil: { ...d.abil, ...s.abil } });
  } catch { return null; }
}
export function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch { /* private mode: play without saving */ }
}
export function setFlag(name) {
  if (!G.save.flags[name]) { G.save.flags[name] = 1; persist(); G.progressAt = G.playT || 0; if (/^(shrine|boss|ambush|shutter)-/.test(name)) G.wispAt = (G.playT || 0) + 2.5; }   // v11 (review 11 #2): after a shrine, a boss or a gate, the wisp shows the way on at once   // v9: any new flag is progress (the guide wisp waits)
}
export const flag = (name) => !!G.save.flags[name];
export const skill = (id) => !!(G.save && G.save.skills && G.save.skills[id]);
export function popText(text, x, y, color = '#ffffff') { G.pops.push({ text, x, y, color, t: 0 }); }

// --- geometry ---------------------------------------------------------------
export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : 1);
export const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

// Entities keep x = centre, y = feet. This is their collision box.
export const boxOf = (e) => ({ x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h });

// --- juice ------------------------------------------------------------------
export function shake(amount) { G.shake = Math.max(G.shake, amount * (G.shakeScale ?? 1)); }
export function hitstop(sec) { G.hitstop = Math.max(G.hitstop, sec); }
// v13 (the 2D style pass): a cartoon impact frame, like the 3D game's. For ~3 frames (50 ms, wall clock, so hit-stop
// holds it) the fighters become black ink over a cream burst of radial speed lines in gold or the element's colour,
// then the picture snaps back. Kept rare: at most one every 0.7 s unless forced (boss defeat, the attune release).
let lastImpact = -1e9;
export function impact(x, y, o = {}) {
  if (typeof performance === 'undefined') return;
  const t = performance.now();
  if (!o.force && t - lastImpact < 700) return;
  lastImpact = t;
  G.impact = { x, y, t0: t, dur: o.dur || 50, col: o.col || '#e2a93b', seed: Math.random() * 1000, stopDown: !o.force };
  hitstop(o.hold || 0.07);
}

export function burst(x, y, n, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = o.angle != null ? o.angle + rnd(-(o.spread ?? Math.PI), o.spread ?? Math.PI) : rnd(Math.PI * 2);
    const sp = rnd(o.min ?? 80, o.max ?? 420);
    G.parts.push({
      x: x + rnd(-(o.rx || 0), o.rx || 0), y: y + rnd(-(o.ry || 0), o.ry || 0),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0),
      life: rnd(o.lifeMin ?? 0.25, o.life ?? 0.6), max: o.life ?? 0.6,
      size: rnd(o.sizeMin ?? 4, o.size ?? 10), color: Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : (o.color || '#fff'),
      grav: o.grav ?? 900, shape: o.shape || 'dot',
    });
  }
}

// Sheet-or-placeholder effect. kind matches MOVES ids / fx manifest keys ('fx.' + kind).
export function addFx(kind, x, y, o = {}) {
  const f = { kind, x, y, t: 0, dur: o.dur || 0.4, face: o.face || 1, size: o.size || 300, follow: o.follow || null, ox: o.ox || 0, oy: o.oy || 0, anchor: o.anchor || 'center', loop: !!o.loop, frames: o.frames || null };
  for (const k in o) if (f[k] === undefined) f[k] = o[k];   // v6: extra options (behind, alpha, blend, fadeOut, el, tint...) carry through
  G.fx.push(f);
  return f;
}

// Run fn after sec seconds of play time.
export function later(sec, fn) { G.later.push({ t: sec, fn }); }

// v7: a toast and a banner each have a quiet chime of their own (the banner softer and higher)
export function toast(text, sub = '', t = 3.2) { G.toast = { text, sub, t, max: t }; Sound.sfx('toast', { delay: 0.05, gap: 0.4 }); }
// v8 (review 8): the banner has its own brush stroke, so it no longer blurs into the toast's chime
export function banner(text, t = 2.6) { if (!G.banner || G.banner.text !== text) Sound.sfx('banner', { gap: 0.6 }); G.banner = { text, t, max: t }; }
