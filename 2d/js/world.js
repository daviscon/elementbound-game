// Rooms: registry, runtime state, collision, gates, and drawing of everything static.
//
// ROOM FORMAT (see js/data/*.js, one file per region):
//   name, w, h            room size in px (one screen = 1920x1080)
//   map: [cx, cy, cw, ch] cell on the world map
//   bg: { ox, oy, zoom, dim }  crop of the region painting (ox/oy 0..1), dim darkens it
//   solids:  [[x, y, w, h]]            solid rectangles
//   oneways: [[x, y, w, style?]]       jump-through platforms ('rope' = rope bridge)
//   hazards: [{ t: 'water'|'thorns'|'fire', r: [x, y, w, h] }]
//   gates:   [{ id, t: 'crack'|'branch', r }]   crack = Earth Slam, branch = Fire Blast
//   pickups: [{ t: 'wisp', x, y }, { id, t: 'heart', x, y }]
//   enemies: [{ t: 'brawler'|'slinger', x, y }]
//   exits:   [{ side: 'left'|'right'|'bottom', range: [a, b], to, at: [x, feetY], keepX? }]
//   doors:   [{ id, x, y, to, lock?, label }]   pairs with the door of the same id in `to`
//   stone: { x, y }   shrine: { x, y, el }
//   hints:   [{ r, text, post?: [x, y], need?: moveOrAbility }]
//   boss:    { t, x, y, trigger: [x0, x1], barriers: [[x, y, w, h]], arena?, waves? }
// v2 additions:
//   bg: { kind: 'out' | 'in' | 'shaft', mid?: false, ... }   which backdrop and whether the midground strip shows
//   solids[i][4]  skin: 'ground' | 'wall' | 'ceil' | 'none' | a kit piece name ('rock', 'chained', ...)
//   oneways[i][3] skin: a kit piece name, or 'rope'
//   gates:   also { t: 'shutter', id } opened by a wind wheel; { t: 'brass', id } opened by a flag
//   wheels:  [{ x, y, gate }]   a wind wheel: Gust spins it and lifts the shutter `gate`
//   props:   [[name, x, groundY, height, flip?]]      kit props behind the action ('kiln:banner' borrows)
//   fg:      [[name, x, groundY, height, flip?]]      dark foreground props, parallax above 1
//   npc:     { x, y, talk }    Elder Sora-Lin; talk = a key in js/story.js
//   music:   override track id
import { G, flag, setFlag, burst, shake, rnd, banner, addFx, clamp } from './game.js';
import { W, H, REGIONS, INK } from './config.js';
import { Assets } from './assets.js';
import * as D from './draw.js';
import { phPillar } from './placeholders.js';
import { Kits } from './kits.js';
import { Sound } from './audio.js';
import * as Flow from './flow.js';
import kite from './data/kite-hill.js';
import drowned from './data/drowned-steps.js';
import quarry from './data/ninefold-quarry.js';
import kiln from './data/kilnmouth.js';
import brass from './data/brass-gate.js';

export const ROOMS = {};
for (const pack of [kite, drowned, quarry, kiln, brass]) {
  for (const id in pack.rooms) ROOMS[id] = { id, region: pack.region, ...pack.rooms[id] };
}

const R = (a) => ({ x: a[0], y: a[1], w: a[2], h: a[3] });

// More than one painting per region (cycle 4): outdoor rooms take turns between the
// region's paintings in room order, so neighbours don't repeat. A variant is only used
// once its file exists (assets/bg/<region>-2.png, -3.png); boss rooms use their arena painting.
{
  const n = {};
  for (const id in ROOMS) {
    const d = ROOMS[id], kind = (d.bg && d.bg.kind) || 'out';
    if (kind !== 'out') continue;
    const i = n[d.region] = (n[d.region] ?? -1) + 1;
    d.bgAlt = ['', '2', '3'][i % 3];
    d.viewIdx = i;
  }
}
// Readability: a soft haze of the region's light over the painting (behind the play
// layer), and a rim of light around enemies in the region's complementary colour.
const LANE = { kite: [255, 236, 220, 0.10], drowned: [226, 242, 236, 0.10], quarry: [236, 226, 206, 0.10], kiln: [196, 214, 230, 0.2], brass: [226, 220, 236, 0.12] };
const RIM = { kite: ['#fff1d6', 0.35], drowned: ['#ffd9a0', 0.5], quarry: ['#cfe6ff', 0.45], kiln: ['#bfe9ff', 0.7], brass: ['#cfe0ff', 0.6] };   // v5: cool rims on the red regions

// v8 (review 8 #5): one platform piece per region made every room look the same. A platform left at its region's
// default gets a piece that fits the room: inside buildings an indoor piece (the painted interior shelf once it
// exists, else the region's most indoor-looking kit piece), outdoors two pieces alternating so neighbours differ.
// Platforms given their own style in the room data keep it.
const VARIETY = {
  kite: { def: 'rock', out: ['rock', 'ledge'], in: ['walkway'] },
  drowned: { def: 'bridge', out: ['bridge', 'stone'], in: [['kite', 'walkway'], 'bridge'] },
  // v14 (Connor's note 46: one platform style per area): the quarry and the Brass Gate hang chained platforms, Kilnmouth
  // its drying racks; the floating wooden scaffolds, brick ovens and brass lift frames are retired as free platforms
  quarry: { def: 'chained', out: ['chained'], in: ['chained'] },
  kiln: { def: 'rack', out: ['rack'], in: ['rack'] },
  brass: { def: 'chained', out: ['chained'], in: ['chained'] },
};
const pieceName = (p) => (Array.isArray(p) ? p.join(':') : p);
// v12 (Connor's note 29, MAP-PROGRESSION rule 9): every platform is held by something. In the Drowned Steps a free
// platform becomes a stone ledge out of the wall it touches, a mossy shelf out of a cliff, a plank walkway on posts
// that reach the floor below, or a plank slung on chains from the ceiling. No more rocks sitting in rings of water.
export const HELD = { wallL: 0, wallR: 1, posts: 2, chains: 3, balcony: 4, cliff: 5, pillar: 0 };
// v12 (note 39): the same idea for the Rime Warden's arena (props/platform-kit-ice-arena.png): an ice shelf frozen onto
// the left or right wall, an ice ledge on a carved pillar, a ledge under a frozen waterfall, a stone stair on chains.
// [kit, piece, how it is held]: 'L'/'R' = a column on that side carried down to the floor, 'chains' = up to the ceiling.
const HOLDS = {
  wallL: ['drowned-steps/grounded', 0, 'L', 0.24], wallR: ['drowned-steps/grounded', 1, 'R', 0.24], posts: ['drowned-steps/grounded', 2, 'posts'],
  chains: ['drowned-steps/grounded', 3, 'chains'], pillar: ['drowned-steps/grounded', 0, 'pillar'], balcony: ['drowned-steps/grounded', 4, 'L', 0.2], cliff: ['drowned-steps/grounded', 5, 'L', 0.3],
  iceL: ['ice/arena', 0, 'L', 0.22], iceR: ['ice/arena', 1, 'R', 0.22], icePillar: ['ice/arena', 2, 'L', 0.38], iceFall: ['ice/arena', 3, 'L', 0.55],
  iceChain: ['ice/arena', 4, 'chains'],
};
function holdOneways(def, list, solids) {
  const below = (o) => {
    const cx = o.x + o.w / 2, ys = solids.filter((s) => cx > s.x && cx < s.x + s.w && s.y > o.y + 10).map((s) => s.y);
    for (const q of list) if (q !== o && q.x < cx && q.x + q.w > cx && q.y > o.y + 10) ys.push(q.y);
    return ys.length ? Math.min(...ys) : def.h;
  };
  let n = 0;
  for (const o of list) {
    if (o.hold === 'float') { o.held = 'float'; o.groundY = def.h; continue; }   // v14 (note 51): a floating ice slab, held by nothing
    if (o.hold) { o.held = o.hold; o.groundY = below(o); o.wallX = o.hold === 'iceR' || o.hold === 'wallR' ? def.w : o.hold === 'iceL' || o.hold === 'wallL' || o.hold === 'cliff' ? 0 : null; o.ceilY = 0; continue; }   // set by the room data
    // v14 (Connor's notes 44, 48: nothing floats): a hung platform (chained, a drying rack, a lift frame, a scaffold)
    // carries its chains or ropes up to the ceiling or the ledge or block above it, whatever region it is in
    const hangUp = () => { const cx = o.x + o.w / 2, up = solids.filter((s) => s.x < o.x + o.w - 20 && s.x + s.w > o.x + 20 && s.y + s.h <= o.y - 20).map((s) => s.y + s.h);
      for (const q of list) if (q !== o && q.x < cx && q.x + q.w > cx && q.y < o.y - 60) up.push(q.y + 30);
      o.ceilY = up.length ? Math.max(...up) : -200; o.hang = true; };
    if (['chained', 'rack', 'elevator', 'scaffold', 'kilntop'].includes(o.style.split(':').pop()) && def.region !== 'drowned' && def.region !== 'kite') { hangUp(); continue; }
    if (o.style === 'rope' || o.style === 'walkway' || o.style.startsWith('in:') || (def.region !== 'drowned' && def.region !== 'kite') || (def.bg && (def.bg.kind === 'in' || def.bg.interior))) continue;   // Kite Hill's floating rocks too (note 29)
    const wallAt = (x) => solids.find((s) => s.y < o.y - 40 && s.y + s.h > o.y + 60 && Math.abs((x < o.x + o.w / 2 ? s.x + s.w : s.x) - x) < 70);
    // v14 (Connor's notes 40, 47, 54): a ledge at the room's side never grows a wall out of that side when the side is
    // an exit at the ledge's height: the column would read as a dead end. It stands on its own pillar instead.
    const exitAt = (side) => (def.exits || []).some((e) => e.side === side && o.y > e.range[0] - 40 && o.y - 330 < e.range[1]);
    const L = o.x <= 90 ? (exitAt('left') ? null : { x: 0 }) : wallAt(o.x) && { x: wallAt(o.x).x + wallAt(o.x).w };
    const Rw = o.x + o.w >= def.w - 90 ? (exitAt('right') ? null : { x: def.w }) : wallAt(o.x + o.w) && { x: wallAt(o.x + o.w).x };
    const gy = below(o);
    // v14 (Connor's note 46): one platform style per area: the mossy stone ledge out of a wall, or the same ledge on a
    // stone-and-moss pillar (the wooden scaffold posts and the slung planks are retired)
    o.held = o.hold || (L ? (n++ % 2 ? 'cliff' : 'wallL') : Rw ? 'wallR' : 'pillar');
    o.wallX = L ? L.x : Rw ? Rw.x : null; o.groundY = gy;
    // v14 (Connor's note 47): the room's side wall a ledge grows out of stops above an exit lower down that side, so the
    // way out (Paddy Falls' bottom-left arch to the Sunken Shrine) is an opening, not a wall
    const side = L && L.x === 0 ? 'left' : Rw && Rw.x === def.w ? 'right' : null;
    if (side) for (const e of def.exits || []) if (e.side === side && e.range[0] > o.y && e.range[0] < gy) o.colY = Math.min(o.colY ?? gy, e.range[0], gy - 320);
    // a chain hangs from the ceiling or the solid above, else from the top of the room
    const cx = o.x + o.w / 2, up = solids.filter((s) => cx > s.x && cx < s.x + s.w && s.y + s.h <= o.y - 20).map((s) => s.y + s.h);
    for (const q of list) if (q !== o && q.x < cx && q.x + q.w > cx && q.y < o.y - 60) up.push(q.y + 30);   // or from the beam of the walkway above
    o.ceilY = up.length ? Math.max(...up) : 0;
  }
  return list;
}
function varyOneways(def, list) {
  const v = VARIETY[def.region], bg = def.bg || {};
  if (!v) return list;
  const inside = bg.kind === 'in' || bg.interior;
  const free = list.filter((o) => o.style === 'plank' || o.style === v.def || (inside && o.style === 'walkway')).sort((a, b) => a.y - b.y || a.x - b.x);
  free.forEach((o, i) => {
    if (inside) { o.style = 'in:' + def.region; o.fb = pieceName(v.in[i % v.in.length]); }
    else o.style = pieceName(v.out[i % v.out.length]);
  });
  return list;
}

// v9 (Connor's note 9): no invisible walls. Wherever a floor runs into the room's side and that side is not an exit,
// something physical closes it: rubble, a fallen beam, a boulder, thornwood, chained crates (prop-blockages.png),
// and it is solid, so Joon stops against it, not against the screen edge.
// v12 (Connor's note 28): a plain dead end never looks like a lock. The thorn thicket (cell 4) read as "needs fire" and the
// padlocked portcullis (cell 2) as "needs a key", so neither is used as a blockage: rubble, a fallen beam, a boulder, crates.
const BLOCK_CELLS = { kite: [3, 0, 1], drowned: [3, 1, 0], quarry: [0, 3, 1], kiln: [0, 5, 1], brass: [5, 1, 0] };
const BLOCK_IN = [1, 5, 0];
function findBlockages(def, solids, exits) {
  const out = [], inside = def.bg && (def.bg.kind === 'in' || def.bg.interior);
  if (def.noBlock) return out;
  for (const side of ['left', 'right']) {
    const atEdge = (s) => (side === 'left' ? s.x <= 2 : s.x + s.w >= def.w - 2);
    const floors = solids.filter((s) => atEdge(s) && s.y > 80 && s.w >= 100).sort((a, b) => a.y - b.y);
    for (const f of floors) {
      // the open air above this floor at the edge, up to the next solid touching the edge
      const above = solids.filter((s) => atEdge(s) && s !== f && s.y + s.h <= f.y + 1).reduce((m, s) => Math.max(m, s.y + s.h), 0);
      const open = f.y - above;
      if (open < 120) continue;
      // planner hotfix 12:16 (Connor stuck at the bottom of Paddy Falls): measure exit cover only in the band a person
      // could walk through above this floor (330 px), not the whole open height. In a 2,700 px shaft the old test
      // treated the real bottom-left exit to the Sunken Shrine as a dead end and sealed it with a thorn thicket.
      const lo = Math.max(above, f.y - 330);
      const cover = exits.filter((e) => e.side === side).reduce((n, e) => n + Math.max(0, Math.min(f.y, e.range[1]) - Math.max(lo, e.range[0])), 0);
      if (cover > (f.y - lo) * 0.25) continue;
      const list = inside ? BLOCK_IN : BLOCK_CELLS[def.region] || BLOCK_IN, cell = list[(out.length + (side === 'right' ? 1 : 0)) % list.length];
      const h = Math.min(330, open + 10);
      out.push({ side, x: side === 'left' ? 70 : def.w - 70, y: f.y, h, cell, solid: { x: side === 'left' ? 0 : def.w - 110, y: f.y - Math.min(h, open) + 20, w: 110, h: Math.min(h, open) - 20, skin: 'none', lift: 0, blockage: true } });
    }
    // an unpainted wall standing on the room's side (skin 'none') is an invisible wall too: dress its foot
    for (const s of solids) {
      if (!atEdge(s) || s.skin !== 'none' || s.w > 80 || s.h < 120) continue;
      const fy = s.y + s.h, floor = solids.find((q) => q !== s && q.y >= fy - 2 && q.y <= fy + 4 && (side === 'left' ? q.x <= 2 : q.x + q.w >= def.w - 2));
      if (!floor || out.some((b) => b.side === side && Math.abs(b.y - fy) < 10)) continue;
      const list = inside ? BLOCK_IN : BLOCK_CELLS[def.region] || BLOCK_IN;
      out.push({ side, x: side === 'left' ? 60 : def.w - 60, y: fy, h: Math.min(320, s.h), cell: list[(out.length + 1) % list.length], solid: null });
    }
  }
  return out;
}
// v12 (Connor's note 28, MAP-PROGRESSION rule 1): a blockage is a wall to the route solver and the guide. An exit whose
// whole walkable band is covered by a blockage's solid can't be used (it would fail the solver in tools/c12/solver.mjs).
const BLOCKS = new Map();
export function exitBlocked(id, e) {
  if (e.side === 'bottom' || !ROOMS[id]) return false;
  let blocks = BLOCKS.get(id);
  if (!blocks) { const def = ROOMS[id]; blocks = findBlockages(def, (def.solids || []).map((a) => ({ x: a[0], y: a[1], w: a[2], h: a[3], skin: a[4] || null })), def.exits || []); BLOCKS.set(id, blocks); }
  const def = ROOMS[id];
  // the exit's usable part: from the floor at the edge up 330 px, wherever a floor meets this side inside the range
  const atEdge = (q) => (e.side === 'left' ? q[0] <= 2 : q[0] + q[2] >= def.w - 2);
  const floors = (def.solids || []).filter((q) => atEdge(q) && q[1] > e.range[0] && q[1] <= e.range[1] + 4).map((q) => q[1]);
  if (!floors.length) return false;   // an open side (a drop or a ledge in the air) is not a floor exit
  return floors.every((fy) => blocks.some((b) => b.solid && b.side === e.side && b.solid.y < fy - 60 && b.solid.y + b.solid.h >= fy - 30));
}
export function buildRoom(id) {
  const def = ROOMS[id];
  if (!def) throw new Error('unknown room ' + id);
  const solids0 = (def.solids || []).map((a) => ({ x: a[0], y: a[1], w: a[2], h: a[3], skin: a[4] || null, lift: a[5] || 0 }));
  const blocks = findBlockages(def, solids0, def.exits || []);
  return {
    blocks,
    id, def, region: def.region, reg: REGIONS[def.region], pal: REGIONS[def.region].pal,
    name: def.name, w: def.w, h: def.h, time: 0,
    solids: [...solids0, ...blocks.filter((b) => b.solid).map((b) => b.solid)],
    oneways: holdOneways(def, varyOneways(def, (def.oneways || []).map((a) => ({ x: a[0], y: a[1], w: a[2], h: 20, style: a[3] || 'plank', oneway: true, ...(a[4] || {}) }))), solids0),
    wheels: (def.wheels || []).map((w) => ({ ...w, spin: 0, ang: 0, done: flag(w.gate) })),
    hazards: (def.hazards || []).map((h) => ({ t: h.t, ...R(h.r), every: h.every || null })),   // v12: every = [period, on for, phase] (a timed vent)
    gates: (def.gates || []).map((g) => ({ id: g.id, t: g.t, gate: true, ...R(g.r), open: flag(g.id), lift: flag(g.id) ? 1 : 0, burn: 0, burning: false, shakeT: 0 })),
    doors: def.doors || [], stone: def.stone || null, shrine: def.shrine || null,
    hints: (def.hints || []).map((h) => ({ ...h, r: R(h.r) })),
    updrafts: (def.updrafts || []).map(R),
    exits: def.exits || [],
    barriers: [], col: [], fight: null,
    rim: RIM[def.region][0], rimA: def.rimA ?? RIM[def.region][1],   // v8: a room can ask for a stronger rim (the Powder Store)
  };
}

// --- collision -------------------------------------------------------------------
export function rebuildCol() {
  const r = G.room, col = r.col;
  col.length = 0;
  for (const s of r.solids) col.push(s);
  for (const g of r.gates) if (!g.open) col.push(g);
  for (const b of r.barriers) col.push(b);
  for (const p of G.pillars) col.push(p);
}

// Move an entity (x = centre, y = feet) by its velocity against solids and one-ways.
// Sets e.onGround, e.ground, e.hitX (-1/0/1), e.hitCeil.
export function moveBody(e, dt, o = {}) {
  const room = G.room, col = room.col, hw = e.w / 2;
  e.hitX = 0; e.hitCeil = false;
  let nx = e.x + e.vx * dt;
  const top = e.y - e.h;
  for (const s of col) {
    if (o.noPillars && s.pillar) continue;
    if (nx - hw < s.x + s.w && nx + hw > s.x && top < s.y + s.h && e.y > s.y) {
      if (e.vx > 0) { nx = s.x - hw; e.hitX = 1; e.hitObj = s; }
      else if (e.vx < 0) { nx = s.x + s.w + hw; e.hitX = -1; e.hitObj = s; }
      else nx = e.x < s.x + s.w / 2 ? s.x - hw : s.x + s.w + hw;
    }
  }
  e.x = nx;
  const prevFeet = e.y;
  let ny = e.y + e.vy * dt, landed = false;
  e.ground = null;
  for (const s of col) {
    if (o.noPillars && s.pillar) continue;
    if (nx - hw < s.x + s.w && nx + hw > s.x && ny - e.h < s.y + s.h && ny > s.y) {
      if (e.vy >= 0 && prevFeet <= s.y + 24) { ny = s.y; landed = true; e.ground = s; }
      else if (e.vy < 0) { ny = s.y + s.h + e.h; e.hitCeil = true; }
      else { ny = s.y; landed = true; e.ground = s; }
    }
  }
  if (e.vy >= 0 && !(e.dropT > 0) && !o.noOneways) {
    for (const p of room.oneways) {
      if (p.gone) continue;   // v12: a melted ice shelf
      if (nx - hw < p.x + p.w && nx + hw > p.x && prevFeet <= p.y + 0.5 && ny >= p.y) { ny = p.y; landed = true; e.ground = p; }
    }
  }
  e.y = ny;
  e.onGround = landed;
  if (landed && e.vy > 0) e.vy = 0;
  if (e.hitCeil && e.vy < 0) e.vy = 0;
}

// Is there something to stand on just below (x, y)?
export function groundAt(x, y, depth = 16) {
  const room = G.room;
  for (const s of room.col) if (x > s.x && x < s.x + s.w && s.y >= y - 4 && s.y <= y + depth) return true;
  for (const p of room.oneways) if (!p.gone && x > p.x && x < p.x + p.w && p.y >= y - 4 && p.y <= y + depth) return true;
  return false;
}

// First surface below (x, y0): static ground or a water surface. Pillars are ignored.
export function rayDown(x, y0, maxDist) {
  const room = G.room;
  let best = null;
  for (const s of room.col) {
    if (s.pillar || s.barrier) continue;
    if (x >= s.x && x <= s.x + s.w && s.y >= y0 - 2 && s.y - y0 <= maxDist && (!best || s.y < best.y)) best = { y: s.y, water: false };
  }
  for (const h of room.hazards) {
    if (h.t !== 'water') continue;
    if (x >= h.x && x <= h.x + h.w && h.y >= y0 - 2 && h.y - y0 <= maxDist && (!best || h.y < best.y)) best = { y: h.y, water: true, floor: h.y + h.h };
  }
  for (const h of room.hazards) {
    if (h.t === 'water' || !best) continue;
    if (x >= h.x && x <= h.x + h.w && Math.abs(h.y + h.h - best.y) < 80) return null; // not on thorns / fire
  }
  return best;
}

export function pointSolid(x, y, pad = 0) {
  for (const s of G.room.col) if (x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad) return s;
  return null;
}
export function rectFree(r, ignorePillars = false) {
  for (const s of G.room.col) {
    if (ignorePillars && s.pillar) continue;
    if (r.x < s.x + s.w && r.x + r.w > s.x && r.y < s.y + s.h && r.y + r.h > s.y) return false;
  }
  return true;
}

// Hazard touching this box? Water only bites once you are properly in it.
// v12 (Connor's note 35): a timed vent burns only in its window: [period, on for, phase] in seconds of room time
export const ventOn = (h, t = G.room.time) => !h.every || ((t + h.every[2]) % h.every[0]) < h.every[1];
export const ventWarn = (h, t = G.room.time) => h.every && !ventOn(h, t) && ((t + h.every[2]) % h.every[0]) > h.every[0] - 0.55;
export function hazardAt(b) {
  for (const h of G.room.hazards) {
    if (!ventOn(h)) continue;
    const top = h.t === 'water' ? h.y + 46 : h.y + 6, inset = h.t === 'water' ? 0 : 10;
    if (b.x < h.x + h.w - inset && b.x + b.w > h.x + inset && b.y < h.y + h.h && b.y + b.h > top) return h;
  }
  return null;
}

// --- gates -------------------------------------------------------------------------
export function breakCrack(g) {
  if (g.open) return;
  g.open = true; setFlag(g.id);
  G.fx.push({ kind: 'floorbreak', x: g.x + g.w / 2, y: g.y + g.h * 0.5, t: 0, dur: 0.6, face: 1, size: g.w * 1.5, anchor: 'center', ox: 0, oy: 0 });
  Sound.sfx('floor-break');
  burst(g.x + g.w / 2, g.y + 20, 26, { color: [G.room.pal.top, G.room.pal.fill, G.room.pal.shade], rx: g.w / 2, min: 120, max: 520, up: 260, size: 22, sizeMin: 8, life: 0.9, shape: 'chunk', grav: 2200 });
  shake(18);
  rebuildCol();
}
export function igniteBranch(g) {
  if (g.open || g.burning) return;
  g.burning = true;
  Sound.sfx('branch-burn');
}
// A wind wheel caught by Gust: it spins up and hauls its shutter open.
export function spinWheel(w) {
  if (w.spin < 0.5) Sound.sfx(w.kind === 'chime' ? 'chimes-spin' : 'wheel', { x: w.x, gap: 0.3 });
  w.spin = Math.min(1.6, w.spin + 1);
  if (w.done) return;
  if (w.hold) {
    // a set of wheels on one rope: each keeps turning a while; all of them together lift the gate
    w.spinT = w.hold;
    const set = G.room.wheels.filter((q) => q.gate === w.gate);
    if (!set.every((q) => q.spinT > 0)) { return; }   // v11 (note 15): no '1 of 3' counter banner; each rig rings and swings on its own
    for (const q of set) q.done = true;
  }
  w.done = true;
  const g = G.room.gates.find((q) => q.id === w.gate);
  setFlag(w.gate);
  if (g) { g.open = true; g.lifting = true; shake(5); Sound.sfx(sideExitArt(G.room) ? 'side-gate' : 'shutter', { delay: 0.3 }); Sound.rumble(0.3, 0.3, 600); }   // v16: the edge-on gate's own soft slide
  // v9: in the Bell Loft the three rigs together wake the great bell
  if (w.hold) { const b = (G.room.def.props || []).find((a) => a[0] === 'bellshrine'); if (b) ringBell(b, 0.2); }
  rebuildCol();
}
// v9 (Connor's note 4): Gust rings a bell. The bell shrine sways, rings, and sends rings of sound out.
export function ringBell(a, delay = 0) {
  if ((a.rungT || 0) > G.time) return;
  a.rungT = G.time + 1.2; a.swing = 1;
  Sound.sfx('bell-ring', { x: a[1], delay }); shake(3); Sound.rumble(0.2, 0.3, 300);
  for (let i = 0; i < 3; i++) G.fx.push({ kind: 'bellring', x: a[1], y: a[2] - (a[3] || 260) * 0.62, t: -i * 0.18 - delay, dur: 0.9, size: (a[3] || 260) * 1.6, face: 1, anchor: 'center', ox: 0, oy: 0 });
}
export function gustProps(z) {
  for (const a of G.room.def.props || []) if (a[0] === 'bellshrine' && a[1] > z.x - 60 && a[1] < z.x + z.w + 60 && a[2] - (a[3] || 260) < z.y + z.h + 60 && a[2] > z.y - 60) ringBell(a);
}
// Drifting atmosphere per region: kite ribbons and petals, mist and dragonflies, stone dust,
// embers, sparks and ash. Spawned just off-screen so it is always there, never popping in.
const ATMOS = {
  kite: { rate: 3, color: ['#f7d8e2', '#ffffff', '#f0a8b8'], vx: [-90, -30], vy: [10, 50], size: [5, 9], life: 9, grav: 6, sway: 1 },
  drowned: { rate: 2.2, color: ['rgba(220,240,240,0.5)', 'rgba(190,230,225,0.45)'], vx: [-25, 25], vy: [-10, 5], size: [26, 50], life: 8, grav: 0, sway: 0.4 },
  quarry: { rate: 4, color: ['#e6cc94', '#c9b28a', '#f2e2bc'], vx: [30, 90], vy: [-6, 14], size: [3, 6], life: 8, grav: 4, sway: 0.6 },
  kiln: { rate: 6, color: ['#ffd36b', '#f0742a', '#ff9a4a'], vx: [-30, 30], vy: [-90, -40], size: [3, 6], life: 6, grav: -8, sway: 1.2, from: 'bottom' },
  brass: { rate: 4, color: ['#ffb347', '#6a6070', '#8a8090'], vx: [-60, -10], vy: [10, 40], size: [3, 7], life: 8, grav: 0, sway: 0.8 },
};
function updateAtmos(room, dt) {
  const a = ATMOS[room.region];
  if (!a || (room.def.bg && room.def.bg.kind === 'in' && room.region !== 'kiln')) return;
  const shaft = room.def.bg && room.def.bg.kind === 'shaft';
  room.atT = (room.atT || 0) - dt;
  while (room.atT <= 0) {
    room.atT += 1 / (a.rate * (shaft ? 1.8 : 1));   // v5: thicker air in the shafts
    const fromBottom = a.from === 'bottom', side = a.vx[0] < 0 ? 1 : a.vx[1] > 0 && a.vx[0] > 0 ? -1 : 0;
    const x = fromBottom ? G.cam.x + rnd(W) : side > 0 ? G.cam.x + W + 20 : side < 0 ? G.cam.x - 20 : G.cam.x + rnd(W);
    const y = fromBottom ? G.cam.y + H + 10 : G.cam.y + rnd(H * 0.85);
    G.parts.push({ x: side === 0 && !fromBottom ? x : x, y, vx: rnd(a.vx[0], a.vx[1]), vy: rnd(a.vy[0], a.vy[1]), life: a.life, max: a.life, size: rnd(a.size[0], a.size[1]), color: a.color[(Math.random() * a.color.length) | 0], grav: a.grav, atmos: a.sway, ph: rnd(6) });
  }
}

// Sounds that belong to places: rising air while you're in an updraft, and waterfalls,
// furnaces and fire beds getting louder as you near them.
function updateRoomSound(room) {
  const p = G.player;
  if (!p || p.dead) return;
  const inDraft = room.updrafts.some((u) => p.x > u.x && p.x < u.x + u.w && p.y > u.y && p.y - 60 < u.y + u.h);
  const nearDraft = room.updrafts.reduce((m, u) => Math.min(m, Math.max(0, Math.abs(p.x - (u.x + u.w / 2)) - u.w / 2)), 1e9);
  Sound.loop('updraft-loop', nearDraft < 700, inDraft ? 1 : Math.max(0.15, 1 - nearDraft / 700));
  let fire = 1e9, water = 1e9;
  for (const h of room.hazards) {
    const d = Math.hypot(Math.max(0, Math.abs(p.x - (h.x + h.w / 2)) - h.w / 2), Math.max(0, Math.abs(p.y - (h.y + h.h / 2)) - h.h / 2));
    if (h.t === 'fire') fire = Math.min(fire, d);
    if (h.t === 'water') water = Math.min(water, d);
  }
  const near = (d, r) => Math.max(0, 1 - d / r);
  Sound.loop('fire-hazard-loop', fire < 800, Math.max(0.1, near(fire, 800)));
  // the falls: full in the Drowned Steps shafts (Paddy Falls), a soft rush near any open water
  const falls = room.region === 'drowned' && room.def.bg && room.def.bg.kind === 'shaft';
  Sound.loop('waterfall-loop', falls || water < 900, falls ? 0.9 : Math.max(0.1, 0.45 * near(water, 900)));
  Sound.loop('furnace-loop', room.region === 'kiln' && room.def.bg && room.def.bg.kind === 'in', 0.6);
}

// v12 (Connor's note 39): melting ice shelves. Joon lands: it cracks (a sound, white cracks, a shiver and meltwater) and
// breaks 1.2 s later (0.85 s once the Warden is angry); it re-forms 3.5 s after that, never on top of him. It never
// melts out from under a dash or a dodge: the break waits until he is out of it.
function updateMelt(room, dt) {
  const p = G.player;
  for (const o of room.oneways) {
    if (!o.melt && !o.crumble) continue;
    const crumble = !!o.crumble;
    if (o.reformT > 0) o.reformT -= dt;
    if (o.gone) {
      o.goneT += dt;
      const over = p.x + 40 > o.x && p.x - 40 < o.x + o.w && p.y > o.y - 20 && p.y - 190 < o.y + 20;
      if (o.goneT > (crumble ? 3.5 : 4) && !over) { o.gone = false; o.crackT = 0; o.reformT = 0.4; Sound.sfx(crumble ? 'stone-crumble' : 'ice-reform', { x: o.x + o.w / 2, vol: crumble ? 0.3 : 0.8 }); }
      continue;
    }
    const on = p.onGround && p.ground === o;
    if (on && !o.crackT) { o.crackT = 0.0001; o.meltAt = crumble ? 0.55 : 1.2 * (G.meltK || 1); Sound.sfx(crumble ? 'tile-crumble' : 'ice-crack', { x: o.x + o.w / 2 }); }
    if (o.crackT > 0) {
      o.crackT += dt;
      if (o.crackT >= o.meltAt && !(on && p.dashT > 0)) {
        o.gone = true; o.goneT = 0;
        Sound.sfx(crumble ? 'stone-crumble' : 'slab-melt', { x: o.x + o.w / 2, vol: crumble ? 0.6 : 1 }); shake(4);
        burst(o.x + o.w / 2, o.y + 10, 16, { color: crumble ? ['#c96a4a', '#8a4a3a', '#d8c8a8'] : ['#ffffff', '#d8f2ff', '#9fd2ee'], rx: o.w * 0.45, min: 60, max: 300, angle: Math.PI / 2, spread: 1.2, life: 0.7, size: 14, sizeMin: 6, shape: 'chunk', grav: 1800 });
        if (p.ground === o) { p.onGround = false; p.ground = null; }
      }
    }
  }
}
export function updateRoom(dt) {
  const room = G.room;
  room.time += dt;
  updateMelt(room, dt);
  for (const h of room.hazards) if (h.every) {   // v12 (note 35): a vent's roar as it fires (only the ones on screen)
    const on = ventOn(h);
    if (on && !h.wasOn && Math.abs(h.x + h.w / 2 - G.player.x) < 1100) Sound.sfx('vent-burst', { x: h.x + h.w / 2, gap: 0.1 });
    h.wasOn = on;
  }
  updateAtmos(room, dt);
  updateRoomSound(room);
  for (const g of room.gates) {
    if (g.shakeT > 0) g.shakeT -= dt;
    if (g.burning && !g.open) {
      g.burn += dt / 1.3;
      if (Math.random() < 0.6) burst(g.x + g.w / 2, g.y + g.h * (1 - Math.min(1, g.burn * 1.5) * rnd()), 1, { color: ['#ffd36b', '#f0742a', '#3a2a2a'], rx: g.w / 2 + 10, min: 20, max: 120, up: 160, grav: -300, life: 0.8, size: 9 });
      if (g.burn >= 1) {
        g.open = true; g.burning = false; setFlag(g.id); Sound.sfx('burn', { rate: 0.7 });
        burst(g.x + g.w / 2, g.y + g.h / 2, 30, { color: ['#3a2a2a', '#5a4a44', '#f0742a'], rx: g.w / 2, ry: g.h / 2, min: 40, max: 260, grav: 500, life: 1.1, size: 12 });
        burst(g.x + g.w / 2, g.y + g.h - 20, 16, { color: ['#ffd36b', '#f0742a'], rx: g.w / 2 + 20, min: 30, max: 140, up: 220, grav: -120, life: 1.4, size: 6 });   // embers drift up
        rebuildCol();
      }
    }
  }
  for (const g of room.gates) if (g.lifting) { g.lift = Math.min(1, g.lift + dt * 1.4); if (g.lift >= 1) g.lifting = false; }
  for (const w of room.wheels) {
    if (w.spinT > 0) { w.spinT -= dt; if (!w.done) w.spin = Math.max(w.spin, 0.8); if (w.spinT <= 0 && !w.done) Sound.sfx('wheel', { rate: 0.6, vol: 0.5 }); }
    w.ang += (0.4 + w.spin * 14) * dt; w.spin = Math.max(0, w.spin - dt * 0.5);
  }
  let changed = false;
  for (let i = G.pillars.length - 1; i >= 0; i--) {
    const p = G.pillars[i];
    p.t += dt;
    if (p.t >= p.life) {
      Sound.sfx(p.kind === 'ice' ? 'ice-shatter' : 'stone-crumble', { vol: 0.8 });
      // v6: ice breaks into painted shards (or a frosted rubble burst), not flat blue squares
      if (p.kind === 'ice') { addFx('iceshatter', p.x + p.w / 2, p.y + p.top * 0.55, { dur: 0.55, size: Math.max(260, p.top * 1.3) }); burst(p.x + p.w / 2, p.y + p.top / 2, 10, { color: ['#ffffff', '#dff3ff', '#bfe9f2'], rx: p.w / 2, ry: p.top / 2, min: 80, max: 380, life: 0.5, size: 8, grav: 1400 }); }
      else burst(p.x + p.w / 2, p.y + p.top / 2, 14, { color: ['#8a7a72', '#6f605b', '#c9b9a0'], rx: p.w / 2, ry: p.top / 2, min: 60, max: 360, life: 0.7, size: 16, sizeMin: 6, shape: 'chunk', grav: 1800 });
      G.pillars.splice(i, 1); changed = true;
    }
  }
  if (changed) rebuildCol();
}

// --- drawing -------------------------------------------------------------------------
// Back to front: sky backdrop (region painting, interior or shaft), midground strip
// (parallax 0.5), then the room itself, then dark foreground props (parallax 1.25).

function coverDraw(ctx, img, px, py, zoom = 1) {
  const s = Math.max(W / img.width, H / img.height) * zoom;
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, -(dw - W) * px, -(dh - H) * py, dw, dh);
}

export function drawBackground(ctx) {
  const room = G.room, bg = room.def.bg || {}, kind = bg.kind || 'out';
  const tx = room.w > W ? G.cam.x / (room.w - W) : 0.5, ty = room.h > H ? G.cam.y / (room.h - H) : 0.5;
  const key = (kind === 'in' ? 'in.' : kind === 'shaft' ? 'shaft.' : 'bg.') + room.region;
  const arena = room.def.boss && room.def.boss.t !== 'ambush' && Assets.get('arena.' + room.def.boss.t);
  // v7 (review 7 #5): a room can name its own painting (bg.art), for any kind of room, once the file exists.
  // A tall painting is drawn the shaft way whatever the room's kind, so the footsteps and air stay as they were.
  const own = !arena && bg.art && Assets.get(bg.art);
  const it = arena || own || (kind === 'out' && room.def.bgAlt && Assets.get(key + room.def.bgAlt)) || Assets.get(key) || Assets.get(room.reg.bg);
  // v9 (Connor's note 7): a tall room's wall is a painted tile repeated top to bottom (room-tile-*.png), moving at one
  // slow speed (0.55 of the camera) on both axes; never one huge stretched painting scrolling faster than the floor.
  const tile = room.h > H && (bg.tile ? Assets.get(bg.tile) : null);
  if (tile) {
    const ts = bg.tileSize || 720, k = 0.55, img = tile.img;
    let ox = -((G.cam.x * k) % ts), oy = -((G.cam.y * k) % ts);
    if (ox > 0) ox -= ts; if (oy > 0) oy -= ts;
    for (let y = oy; y < H; y += ts - 1) for (let x = ox; x < W; x += ts - 1) ctx.drawImage(img, x, y, ts, ts);
    // depth: darker toward the bottom of the room and at the sides, a cool wash for the water below
    const depth = clamp((G.cam.y + H / 2) / room.h, 0, 1), vg = ctx.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, `rgba(14,10,22,${0.18 + depth * 0.25})`); vg.addColorStop(1, `rgba(10,20,30,${0.35 + depth * 0.3})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    const sg = ctx.createLinearGradient(0, 0, W, 0); sg.addColorStop(0, 'rgba(10,6,14,0.45)'); sg.addColorStop(0.2, 'rgba(10,6,14,0)'); sg.addColorStop(0.8, 'rgba(10,6,14,0)'); sg.addColorStop(1, 'rgba(10,6,14,0.45)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
  } else if (it) {
    const img = it.img;
    if (kind === 'shaft' || (own && img.height > img.width)) {
      // tall painting: fit the width, scroll down it as the camera descends
      const s = (W / img.width) * (bg.zoom || 1.06), dw = img.width * s, dh = img.height * s;
      // v9 (Connor's note 7): never faster than 0.55 of the camera (a tall painting used to run up to twice the floor's speed)
      const kv = room.h > H && dh > H ? Math.min(1, 0.55 * (room.h - H) / (dh - H)) : 1;
      ctx.drawImage(img, -(dw - W) * (0.5 + (tx - 0.5) * 0.4), -(dh - H) * (room.h > H ? 0.5 + (ty - 0.5) * kv : (bg.oy ?? 0.5)), dw, dh);
    } else {
      const ox = bg.ox ?? 0.5, oy = bg.oy ?? 0.5;
      const px = room.w > W ? ox * 0.4 + tx * 0.6 : ox, py = room.h > H ? oy * 0.4 + ty * 0.6 : oy;
      // v5: while a region has one painting, each outdoor room frames it its own way: every other
      // room is mirrored and zoomed a little differently, so two rooms never show the same picture
      const idx = room.def.viewIdx ?? 0, shared = kind === 'out' && !arena && !own && !(room.def.bgAlt && Assets.get(key + room.def.bgAlt));
      const mirror = shared && idx % 2 === 1, zoom = (bg.zoom || (kind === 'in' ? 1.04 : 1.1)) * (shared ? [1, 1.08, 1.03, 1.14][idx % 4] : 1);
      if (mirror) { ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); coverDraw(ctx, img, 1 - px, py, zoom); ctx.restore(); }
      else coverDraw(ctx, img, px, py, zoom);
      if (shared) {   // a per-room grade: cooler and darker for some, warmer for others
        const gr = [null, 'rgba(30,40,80,0.12)', 'rgba(255,170,90,0.07)', 'rgba(20,20,40,0.16)'][idx % 4];
        if (gr) { ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); }
      }
    }
  } else {
    D.fallbackBg(ctx, room.pal, W, H, G.cam.x, room.time);
  }
  // midground strip: tiled, half-speed parallax, sits on the room's floor line
  // v6: never over an arena painting (the busy strip hid the Reed Warden on its own backdrop)
  const mid = kind === 'out' && bg.mid !== false && !arena && Assets.get('mid.' + room.region);
  if (mid) {
    const img = mid.img, s = (W / img.width) * 1.15 * (bg.midScale || 1), dw = img.width * s, dh = img.height * s;
    const floorY = bg.midY ?? room.h;                                   // room-space line the strip stands on
    const yy = H / 2 + (floorY - G.cam.y - H / 2) * 0.5 + 80 + (bg.midOff || 0) - dh;
    let x = -((G.cam.x * 0.5 + (bg.midX || 0)) % dw);
    if (x > 0) x -= dw;
    ctx.save(); ctx.globalAlpha = bg.midAlpha ?? 0.95;
    // v14 (Connor's note 42): where a floor sits lower than the strip's line (the West Gate's sunken left end) the strip's
    // hard bottom edge showed above it. Its lowest rows now carry on down to the bottom of the view
    const ext = H - (yy + dh) + 4, rows = Math.max(4, Math.round(img.height * 0.04));
    for (; x < W; x += dw - 1) { ctx.drawImage(img, x, yy, dw, dh); if (ext > 0) ctx.drawImage(img, 0, img.height - rows, img.width, rows, x, yy + dh - 2, dw, ext); }
    ctx.restore();
    if (room.def.pit) {
      // the quarry pit below the bridges: the far terraces again, smaller and lower, sinking into haze
      const s2 = s * 0.8, dw2 = img.width * s2, dh2 = img.height * s2, y2 = H / 2 + (room.h - G.cam.y - H / 2) * 0.7 + 260 - dh2;
      let x2 = -((G.cam.x * 0.35 + 300) % dw2); if (x2 > 0) x2 -= dw2;
      ctx.save(); ctx.globalAlpha = 0.9;
      for (; x2 < W; x2 += dw2 - 1) ctx.drawImage(img, x2, y2, dw2, dh2);
      ctx.restore();
      const top = 900 - G.cam.y - 40, hz2 = ctx.createLinearGradient(0, top, 0, H);
      hz2.addColorStop(0, 'rgba(120,90,70,0)'); hz2.addColorStop(0.5, 'rgba(90,64,52,0.45)'); hz2.addColorStop(1, 'rgba(40,26,30,0.85)');
      ctx.fillStyle = hz2; ctx.fillRect(0, top, W, H - top);
    }
  }
  // v6: in the quarry and Kilnmouth a cool, dark wash sits over the painting and strip, so tan
  // mites on tan rock and red soldiers on red brick stand forward (review 6 #10)
  if (kind === 'out' && !arena && (room.region === 'quarry' || room.region === 'kiln')) {
    ctx.fillStyle = room.region === 'quarry' ? 'rgba(28,36,64,0.16)' : 'rgba(24,20,56,0.14)'; ctx.fillRect(0, 0, W, H);
  }
  // v6: a pale mist band at the Reed Warden's floor, so the green guardian reads against its teal arena
  if (arena && room.def.boss.t === 'reed') {
    const fy = room.def.boss.y - G.cam.y, g = ctx.createLinearGradient(0, fy - 420, 0, fy);
    g.addColorStop(0, 'rgba(226,240,232,0)'); g.addColorStop(0.55, 'rgba(226,240,232,0.26)'); g.addColorStop(1, 'rgba(226,240,232,0.12)');
    ctx.fillStyle = g; ctx.fillRect(0, fy - 420, W, 420);
  }
  // v7: the Overseer is dark red on dark brick: a warm backlight lifts the wall behind the fight line about 15%
  if (arena && room.def.boss.t === 'overseer') {
    const fy = room.def.boss.y - G.cam.y, g = ctx.createRadialGradient(W / 2, fy - 200, 60, W / 2, fy - 200, 900);
    g.addColorStop(0, 'rgba(255,214,160,0.2)'); g.addColorStop(0.6, 'rgba(255,190,130,0.1)'); g.addColorStop(1, 'rgba(255,190,130,0)');
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(0, fy - 1100, W, 1100); ctx.restore();
  }
  if (kind === 'shaft') {   // a warm lantern pool so shafts aren't flat and dark
    const lx = W * 0.5 + Math.sin(room.time * 0.3) * 6, ly = H * 0.42 - (G.cam.y % 600) * 0.1;
    const g = ctx.createRadialGradient(lx, ly, 20, lx, ly, 560);
    g.addColorStop(0, 'rgba(255,214,150,0.22)'); g.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = room.pal.wash; ctx.fillRect(0, 0, W, H);
  // lane haze: strongest across the middle band where the fighting happens
  const [lr, lg, lb, la] = LANE[room.region];
  const hz = ctx.createLinearGradient(0, 0, 0, H);
  hz.addColorStop(0, `rgba(${lr},${lg},${lb},${la * 0.3})`); hz.addColorStop(0.55, `rgba(${lr},${lg},${lb},${la})`); hz.addColorStop(1, `rgba(${lr},${lg},${lb},${la * 0.6})`);
  ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);
  const dim = tile ? 0.2 : own ? (bg.artDim ?? 0.12) : bg.dim;   // v7: a room's own painting is already lit for the room
  if (dim) { ctx.fillStyle = `rgba(14,8,18,${dim})`; ctx.fillRect(0, 0, W, H); }
  // v8: a painting that is too dark for its room is lifted (the Flooded Stairwell)
  if (own && bg.lift && !tile) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,240,222,${bg.lift})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}

const GROUND_SCALE = { kite: 0.5, drowned: 0.5, quarry: 0.62, kiln: 0.62, brass: 0.6 };

function solidSkin(r, room) {
  if (r.skin) return r.skin;
  if (r.y <= 0 && r.y + r.h < room.h * 0.6) return 'ceil';
  if (r.h > r.w * 1.25 && r.w <= 460) return 'wall';
  return 'ground';
}
const covered = (solids, s, x, y) => solids.some((o) => o !== s && x > o.x - 2 && x < o.x + o.w + 2 && y > o.y - 2 && y < o.y + o.h);

function drawSolidsKit(ctx, room, view) {
  const reg = room.region;
  const vis = room.solids.filter((s) => s.x < view.x + view.w + 200 && s.x + s.w > view.x - 200 && s.y < view.y + view.h + 200 && s.y + s.h > view.y - 260);
  // walls and ceilings first, ground over them so tops read cleanly
  const order = (s) => ({ ceil: 0, wall: 1, ground: 2 }[solidSkin(s, room)] ?? 3);
  vis.sort((a, b) => order(a) - order(b));
  // v14 (note 45): one darkening for every block in view, from the highest floor, so neighbours match at the join
  const fadeTop = Math.min(...vis.filter((s) => solidSkin(s, room) === 'ground').map((s) => s.y + 40), 1e9);
  for (const s of vis) {
    const skin = solidSkin(s, room);
    if (skin === 'none') continue;
    if (skin === 'planks' && Assets.get('prop.plankwall')) {   // v14 (note 57): props/plank-wall.png tiled sideways
      const pw = Assets.get('prop.plankwall').img, tw = pw.width * s.h / pw.height;
      ctx.save(); ctx.beginPath(); ctx.rect(s.x, s.y, s.w, s.h); ctx.clip(); for (let x = s.x; x < s.x + s.w; x += tw - 1) ctx.drawImage(pw, x, s.y, tw, s.h); ctx.restore(); continue;
    }
    if (skin === 'planks') {   // v9: a timber partition of upright boards (the Foreman's Hut)
      ctx.save(); ctx.beginPath(); ctx.rect(s.x, s.y, s.w, s.h); ctx.clip();
      for (let x = s.x, i = 0; x < s.x + s.w; x += 44, i++) { ctx.fillStyle = ['#7a5238', '#6c4830', '#82593c'][i % 3]; ctx.fillRect(x, s.y, 44, s.h); ctx.strokeStyle = 'rgba(30,18,14,0.85)'; ctx.lineWidth = 3; ctx.strokeRect(x, s.y - 4, 44, s.h + 8);
        for (let y = s.y + 40 + (i % 2) * 60; y < s.y + s.h; y += 140) { ctx.fillStyle = 'rgba(30,18,14,0.6)'; ctx.beginPath(); ctx.arc(x + 22, y, 3, 0, 7); ctx.fill(); } }
      ctx.fillStyle = '#5a3a26'; ctx.fillRect(s.x - 8, s.y + s.h - 26, s.w + 16, 26); ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.strokeRect(s.x - 8, s.y + s.h - 26, s.w + 16, 26);
      ctx.restore(); continue;
    }
    if (skin === 'ground') {
      const pc = Kits.role(reg, 'ground');
      const capL = !(s.x <= 0 || covered(room.solids, s, s.x - 4, s.y + 6));
      const capR = !(s.x + s.w >= room.w || covered(room.solids, s, s.x + s.w + 4, s.y + 6));
      Kits.drawGround(ctx, pc, s, GROUND_SCALE[reg] || 0.55, { capL, capR, body: Kits.role(reg, 'wall'), bodyScale: 0.6, fadeTop: fadeTop < 1e9 ? fadeTop : null });
    } else if (skin === 'wall') {
      const pc = Kits.role(reg, 'wall');
      Kits.drawWall(ctx, pc, s, { capTop: !covered(room.solids, s, s.x + s.w / 2, s.y - 4) && s.y > 0 });
    } else if (skin === 'ceil') {
      const pc = Kits.role(reg, 'wall');
      Kits._fillBody(ctx, pc, s, 0.7, false);
      // v14 (note 57): props/ceiling-<region>.png tiled along the block (top edge at its top; roots and braces hang below)
      const ce = Assets.get('prop.ceiling-' + reg);
      if (ce) { const sc = Math.max(1, (s.h + 40) / ce.img.height), tw = ce.img.width * sc, th = ce.img.height * sc; ctx.save(); ctx.beginPath(); ctx.rect(s.x, s.y, s.w, th + 4); ctx.clip(); for (let x = s.x; x < s.x + s.w; x += tw - 1) ctx.drawImage(ce.img, x, s.y, tw, th); ctx.restore(); }
    } else {
      const pc = Kits.piece(skin.includes(':') ? skin.split(':') : skin, reg);
      if (pc) drawOnTop(ctx, pc, s);
    }
    // v8 (review 8 #6): a block that reads as a hole against a dark sky is lifted (the Battlements' raised block)
    if (s.lift) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,236,214,${s.lift})`; ctx.fillRect(s.x, s.y, s.w, s.h); ctx.restore(); }
  }
}

// A piece whose solid span covers [r.x, r.x + r.w] with its flat top on r.y; tiled if long.
function drawOnTop(ctx, pc, r) {
  let n = 1, s = r.w / pc.sw;
  const max = pc.h > pc.w ? 0.9 : 1.15;
  if (s > max) { n = Math.ceil(r.w / (pc.sw * max * 0.85)); s = r.w / (n * pc.sw); }
  for (let i = 0; i < n; i++) {
    const x0 = r.x + (r.w / n) * i;
    Kits.drawAtTop(ctx, pc, x0 - pc.sx * s + pc.w * s / 2, r.y, s);
  }
}

// The painted indoor shelf for a region (review 8 A14 to A18): its top opaque row is measured once and sits on the platform top.
const SHELF_TOP = new Map();
function drawShelf(ctx, it, o) {
  let top = SHELF_TOP.get(it.img);
  if (top == null) {
    try {
      const c = document.createElement('canvas'), w = c.width = Math.min(512, it.img.width), h = c.height = Math.round(it.img.height * w / it.img.width);
      const x = c.getContext('2d'); x.drawImage(it.img, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data; top = 0;
      outer: for (let y = 0; y < h; y++) { let n = 0; for (let i = 0; i < w; i++) if (d[(y * w + i) * 4 + 3] > 128 && ++n > w * 0.4) { top = y / h; break outer; } }
    } catch { top = 0; }
    SHELF_TOP.set(it.img, top);
  }
  const dw = o.w * 1.08, dh = dw * it.img.height / it.img.width;
  ctx.drawImage(it.img, o.x + o.w / 2 - dw / 2, o.y - top * dh, dw, dh);
}
// v12 (note 29): a held platform. The piece's walk span sits on the platform; its wall, posts or chains are carried on
// to whatever holds them (the room's side or a wall, the floor below, the ceiling above) by repeating their end rows.
function drawHeld(ctx, o, room) {
  const H = HOLDS[o.held]; if (!H) return false;
  // a melting ice shelf shows its cracked piece (the ice kit's sixth) while it cracks, and is gone while it is melted
  if (o.gone) { drawMeltStub(ctx, o); return true; }
  const cracked = o.crackT > 0 && H[0] === 'ice/arena' && (o.held === 'iceL');
  const pc = Kits.extra(H[0], cracked ? 5 : H[1]);
  if (!pc) return false;
  const how = H[2], left = how === 'L', right = how === 'R';
  ctx.save();
  if (how === 'pillar') { ctx.restore(); return drawPillarLedge(ctx, o); }
  if (o.reformT > 0) ctx.globalAlpha = 1 - o.reformT / 0.4;
  if (o.crackT > 0) { const k = o.crackT / (o.meltAt || 1.2); ctx.translate(Math.sin(G.time * 60) * 3 * k, 0); }
  // stretch the span so the wall end meets the wall
  const x0 = left && o.wallX != null ? Math.min(o.x, o.wallX) : o.x, x1 = right && o.wallX != null ? Math.max(o.x + o.w, o.wallX) : o.x + o.w;
  const s = (x1 - x0) / pc.sw, dx = x0 - pc.sx * s, dy = o.y - pc.top * s, w = pc.w * s, h = pc.h * s;
  ctx.drawImage(pc.img, pc.x, pc.y, pc.w, pc.h, dx, dy, w, h);
  if (how === 'posts' && o.groundY > dy + h) {
    // the two legs carry on down to the floor: repeat the bottom 30 rows of the piece
    const rows = 30, sy = pc.y + pc.h - rows;
    for (let y = dy + h - 1; y < o.groundY + 10; y += rows * s - 1) { const hh = Math.min(rows * s, o.groundY + 10 - y); ctx.drawImage(pc.img, pc.x, sy, pc.w, hh / s, dx, y, w, hh); }
  }
  if (how === 'chains' && dy > o.ceilY) {
    // the chains run up to the ceiling: repeat one link's worth of the top rows (a link is about 70 px tall in the piece)
    const rows = 70, sy = pc.y + 4;
    for (let y = dy + 4; y > o.ceilY - rows * s; y -= rows * s - 1) ctx.drawImage(pc.img, pc.x, sy, pc.w, rows, dx, y - rows * s, w, rows * s);
  }
  if (o.held === 'iceFall' && dy > 0) {
    // the frozen waterfall comes down from the top of the room: repeat the fall's upper rows above the piece
    const colW = Math.round(pc.w * H[3]), rows = 80, sy = pc.y + 6;
    for (let y = dy + 6; y > -rows * s; y -= rows * s - 1) ctx.drawImage(pc.img, pc.x, sy, colW, rows, dx, y - rows * s, colW * s, rows * s);
  }
  const gY = o.colY ?? o.groundY;
  if ((left || right) && gY > dy + h) {
    // the wall, pillar or frozen fall it juts from carries on below: repeat that column's lowest rows down to the floor
    const colW = Math.round(pc.w * H[3]), sx = right ? pc.x + pc.w - colW : pc.x, rows = 60, sy = pc.y + pc.h - rows;
    const cx = right ? dx + w - colW * s : dx;
    for (let y = dy + h - 1; y < gY + 10; y += rows * s - 1) { const hh = Math.min(rows * s, gY + 10 - y); ctx.drawImage(pc.img, sx, sy, colW, hh / s, cx, y, colW * s, hh); }
  }
  if (o.crackT > 0) {
    // the warning: white cracks spread across the top and meltwater drips from the underside
    const k = Math.min(1, o.crackT / (o.meltAt || 1.2));
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const cx = o.x + o.w * (0.25 + i * 0.25); ctx.beginPath(); ctx.moveTo(cx, o.y + 2); ctx.lineTo(cx + 18 * k * (i - 1), o.y + 20 + 30 * k); ctx.lineTo(cx - 10 * k, o.y + 40 + 40 * k); ctx.stroke(); }
    ctx.fillStyle = '#bfe9f2'; for (let i = 0; i < 4; i++) { const yy = o.y + 50 + ((G.time * 260 + i * 37) % 120); ctx.fillRect(o.x + o.w * (0.15 + i * 0.22), yy, 5, 10); }
  }
  ctx.restore();
  return true;
}
// v14 (Connor's note 46): a mossy stone ledge on a stone-and-moss pillar, from the same kit as the wall ledges Connor
// liked: the right-wall ledge (mirrored half) and the left-wall ledge meet over one shared column at the middle, the
// column cut flush with the walking surface, and carried down to the floor below by repeating its lowest rows.
function drawPillarLedge(ctx, o) {
  const A = Kits.extra('drowned-steps/grounded', 1), B = Kits.extra('drowned-steps/grounded', 0);
  if (!A || !B) return false;
  const col = 0.24, s = (o.w / 2) / ((1 - col / 2) * B.w), cw = B.w * col * s * 1.6, cx = o.x + o.w / 2, top = o.y - 6;
  ctx.save();
  if (o.reformT > 0) ctx.globalAlpha = 1 - o.reformT / 0.4;
  if (o.crackT > 0 && !o.crumble) ctx.translate(Math.sin(G.time * 60) * 3, 0);
  // the column first, from under the slab to the floor
  const rows = 60, sy = B.y + B.h - rows, cy0 = o.y - B.top * s + B.h * s - 1;
  for (let y = cy0; y < o.groundY + 10; y += rows * s - 1) { const hh = Math.min(rows * s, o.groundY + 10 - y); ctx.drawImage(B.img, B.x, sy, B.w * col, hh / s, cx - cw / 2, y, cw, hh); }
  ctx.beginPath(); ctx.rect(o.x - 40, top, o.w + 80, 4000); ctx.clip();
  ctx.drawImage(A.img, A.x, A.y, A.w, A.h, cx + cw / 2 - A.w * s, o.y - A.top * s, A.w * s, A.h * s);
  ctx.drawImage(B.img, B.x, B.y, B.w, B.h, cx - cw / 2, o.y - B.top * s, B.w * s, B.h * s);
  ctx.restore();
  return true;
}
// v14 (Connor's notes 51, 57): a floating slab of ice, from props/ice-slab-melt.png when it lands (whole 1, cracking 2-3,
// breaking and falling 4-6, re-forming 7-8). Until then the ice-arena kit's own ledge piece, cut to its slab (no column
// under it); it shivers while it cracks, breaks into the ice-shatter strip and fades back in when it re-forms.
function drawIceSlab(ctx, o) {
  const w = o.w, sheet = Assets.has('prop.iceslab');
  const k = o.crackT > 0 ? Math.min(1, o.crackT / (o.meltAt || 1.2)) : 0;
  if (sheet) {
    // frames: 1 whole, 2-3 cracking, 4-5 breaking up, 6 the last bits falling, 7 a frost ghost while it waits to re-form,
    // 8 a pale forming slab as it comes back
    const tg = o.gone ? (o.goneT || 0) : 0;
    const f = o.gone ? (tg < 0.6 ? Math.min(5, 3 + Math.floor(tg / 0.2)) : tg > 3 ? 6 : -1) : o.reformT > 0 ? 7 : k > 0 ? 1 + Math.min(1, Math.floor(k * 2)) : 0;
    if (f >= 0) {
      const it = Assets.items['prop.iceslab'], rb = it.frames[0], b = it.frames[f], sc = (w * 1.1) / (rb.x1 - rb.x0 + 1);
      ctx.save(); if (o.reformT > 0) ctx.globalAlpha = 1 - o.reformT / 0.4; if (tg > 3) ctx.globalAlpha = 0.35 + 0.25 * Math.sin(G.time * 10); if (k) ctx.translate(Math.sin(G.time * 60) * 3 * k, 0);
      ctx.drawImage(it.canvas, f * it.fw, 0, it.fw, it.fh, o.x + w / 2 - ((rb.x0 + rb.x1 + 1) / 2) * sc, o.y - 10 - rb.y0 * sc, it.fw * sc, it.fh * sc);
      ctx.restore();
    }
    return;
  }
  if (o.gone) { const tg = o.goneT || 0; if (tg < 0.5) Assets.drawFx(ctx, 'fx.iceshatter', Math.min(7, Math.floor(tg / 0.5 * 8)), o.x + w / 2, o.y + 30, w * 0.9, 1); return; }
  const pc = Kits.extra('ice/arena', 2);   // the ice ledge on a carved pillar: only its slab is drawn
  if (!pc) return;
  ctx.save();
  if (o.reformT > 0) ctx.globalAlpha = 1 - o.reformT / 0.4;
  if (k) { ctx.translate(Math.sin(G.time * 60) * 3 * k, k * 4); ctx.globalAlpha *= 1 - 0.25 * k; }
  const col = 0.38, s = w / (pc.w * (1 - col)), dx = o.x - pc.w * col * s, dy = o.y - pc.top * s;
  ctx.beginPath(); ctx.rect(o.x - 6, o.y - 30, w + 12, 90); ctx.clip();
  ctx.drawImage(pc.img, pc.x, pc.y, pc.w, pc.h, dx, dy, pc.w * s, pc.h * s);
  ctx.restore();
}
// a melted shelf: only a stump of ice is left on its wall or pillar, dripping, until it re-forms
function drawMeltStub(ctx, o) {
  const x = o.held === 'iceR' ? o.x + o.w - 40 : o.held === 'iceChain' ? o.x + o.w / 2 - 20 : o.x;
  ctx.save(); ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(x, o.y - 6); ctx.lineTo(x + 46, o.y + 4); ctx.lineTo(x + 20, o.y + 40); ctx.lineTo(x, o.y + 30); ctx.closePath();
  ctx.fillStyle = '#a9d6ef'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#1b2a3a'; ctx.stroke();
  ctx.fillStyle = '#bfe9f2'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 10 + i * 12, o.y + 44 + ((G.time * 200 + i * 40) % 90), 4, 9);
  ctx.restore();
}
// v12 (Connor's note 39): the sluice is frozen: a cold wash over the painting, a pale floor of packed ice and slow snow.
// After the Warden's roar (phase two) the wash deepens.
function drawFrost(ctx, room, view, t) {
  ctx.save();
  ctx.fillStyle = `rgba(196,226,250,${room.frost ? 0.3 : 0.2})`; ctx.fillRect(view.x, view.y, view.w, view.h);
  const fy = room.def.boss ? room.def.boss.y : room.h - 180;
  const g = ctx.createLinearGradient(0, fy - 70, 0, fy + 10); g.addColorStop(0, 'rgba(234,247,255,0)'); g.addColorStop(1, 'rgba(234,247,255,0.55)');
  ctx.fillStyle = g; ctx.fillRect(view.x, fy - 70, view.w, 80);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 70; i++) { const x = view.x + ((i * 173.3 + t * (14 + (i % 5) * 6)) % view.w), y = view.y + ((i * 97.1 + t * (40 + (i % 7) * 9)) % view.h); ctx.fillRect(x, y, 3 + (i % 3), 3 + (i % 3)); }
  ctx.restore();
}
// v12 (Connor's note 31 update): light spills out of the way to a shrine, so the opening reads from far above.
// { x, y, side }: a warm-cool glow at the opening, slow shafts of light leaning out of it and a carved arch over it.
function drawShrineLight(ctx, L, t) {
  const dir = L.side === 'left' ? 1 : -1, x = L.x, y = L.y;
  if (Assets.get('prop.shrineopening') && !sideExitArt(G.room)) { const so = Assets.get('prop.shrineopening'), h = 460, w = so.img.width * h / so.img.height, ax = x + 150 * dir; ctx.save(); ctx.globalAlpha = 0.92 + 0.08 * Math.sin(t * 1.3); if (dir < 0) { ctx.translate(ax, 0); ctx.scale(-1, 1); ctx.translate(-ax, 0); } ctx.drawImage(so.img, ax - w / 2, y + 4 - h, w, h); ctx.restore(); return; }   // v14 (note 57)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y - 160, 20, x, y - 160, 520);
  g.addColorStop(0, `rgba(150,235,230,${0.42 + 0.06 * Math.sin(t * 1.3)})`); g.addColorStop(0.4, 'rgba(90,190,200,0.16)'); g.addColorStop(1, 'rgba(60,140,170,0)');
  ctx.fillStyle = g; ctx.fillRect(x - 560, y - 700, 1120, 760);
  for (let i = 0; i < 4; i++) {
    const a = 0.08 + 0.04 * Math.sin(t * 0.9 + i * 1.7), y0 = y - 330 + i * 70;
    ctx.fillStyle = `rgba(190,250,245,${a})`;
    ctx.beginPath(); ctx.moveTo(x - 20 * dir, y0); ctx.lineTo(x + 640 * dir, y0 - 260 - i * 40); ctx.lineTo(x + 640 * dir, y0 - 160 - i * 40); ctx.lineTo(x - 20 * dir, y0 + 50); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // the carved arch: props/shrine-opening.png (a mossy carved arch with light rays) once it lands, else code posts
  const so = Assets.get('prop.shrineopening');
  if (so && !sideExitArt(G.room)) { const h = 460, w = so.img.width * h / so.img.height, ax = x + 150 * dir; ctx.save(); if (dir < 0) { ctx.translate(ax, 0); ctx.scale(-1, 1); ctx.translate(-ax, 0); } ctx.drawImage(so.img, ax - w / 2, y + 4 - h, w, h); ctx.restore(); return; }
  if (sideExitArt(G.room)) return;   // v16 (note 73): the post is drawn with the exits
  ctx.save();
  const ax = x + 150 * dir, w = 220, h = 360;
  ctx.fillStyle = '#5d6f6c'; ctx.strokeStyle = '#1b1416'; ctx.lineWidth = 5;
  for (const px of [ax - w / 2, ax + w / 2 - 34]) { ctx.fillRect(px, y - h, 34, h); ctx.strokeRect(px, y - h, 34, h); }
  ctx.beginPath(); ctx.moveTo(ax - w / 2 - 40, y - h - 6); ctx.quadraticCurveTo(ax, y - h - 46, ax + w / 2 + 40, y - h - 6); ctx.lineTo(ax + w / 2 + 30, y - h + 26); ctx.lineTo(ax - w / 2 - 30, y - h + 26); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7fd3cf'; ctx.beginPath(); ctx.arc(ax, y - h + 4, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawOnewayKit(ctx, o, room) {
  // v12 (note 35): a crumbling ledge: shakes while it cracks, gone (a few falling bits) until it re-forms
  if (o.crumble) {
    if (o.gone) return;
    if (o.crackT > 0 || o.reformT > 0) {
      ctx.save(); if (o.reformT > 0) ctx.globalAlpha = 1 - o.reformT / 0.4;
      ctx.translate(o.crackT > 0 ? Math.sin(G.time * 70) * 4 : 0, o.crackT > 0 ? o.crackT * 10 : 0);
      drawOnewayKitPlain(ctx, o, room); ctx.restore(); return;
    }
    // a crumbling ledge is marked: loose clay tiles, a darker underside and two cracks, so it is read before it is trusted
    drawOnewayKitPlain(ctx, o, room);
    // v14 (note 57): props/ledge-cracks.png laid over the ledge top once it lands, instead of the code cracks
    const lc = Assets.items['prop.ledgecracks']; if (lc) { const k7 = Assets.items['prop.kit7-' + room.region] ? 6 : -6; ctx.drawImage(lc.canvas, 0, 0, lc.fw, lc.fh, o.x + (k7 > 0 ? o.w * 0.06 : 0), o.y + k7, o.w * (k7 > 0 ? 0.88 : 1), o.w * lc.fh / lc.fw); return; }   // v16: inside the r7 slab's top
    ctx.save(); ctx.strokeStyle = 'rgba(30,16,20,0.75)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (const k of [0.3, 0.68]) { const cx = o.x + o.w * k; ctx.beginPath(); ctx.moveTo(cx, o.y + 2); ctx.lineTo(cx + 10, o.y + 18); ctx.lineTo(cx - 4, o.y + 32); ctx.stroke(); }
    ctx.restore(); return;
  }
  drawOnewayKitPlain(ctx, o, room);
}
// v16 (Connor's note 72: the mossy stone pillars "don't fit the vibe"): every platform outside is drawn from its region's
// own kit (props/platform-kit-<region>-r7.png: 1 a ledge out of a left wall, 2 out of a right wall, 3 a slab, 4 a long
// slab, 5 a small slab, 6 a thin beam; walk line 448 px down each 1152 px cell). The art is fitted to the SAME collision
// box: the walk line on the platform top, the slab across its width. No pillar, chain or rack under or over it; a slab
// floats, as in the Warden's arena. Interior shelves, rope bridges and the ice arena keep their own art.
const KIT7_WALK = 448 / 1152;
function drawKit7(ctx, o, room) {
  if (o.held === 'float' || (o.held && o.held.startsWith('ice')) || o.style === 'rope' || (o.style.startsWith('in:') && !/^wall[LR]$/.test(o.held || '')) || room.def.frost) return false;
  const it = Assets.items['prop.kit7-' + room.region]; if (!it || !it.frames) return false;
  const wall = o.held === 'wallL' || o.held === 'cliff' ? 'L' : o.held === 'wallR' ? 'R' : null;
  const f = wall === 'L' ? 0 : wall === 'R' ? 1 : o.w < 190 ? 4 : o.w < 330 ? 2 : 3, b = it.frames[f]; if (!b) return false;
  const x0 = wall === 'L' && o.wallX != null ? Math.min(o.x, o.wallX) : o.x - (wall ? 0 : o.w * 0.03), x1 = wall === 'R' && o.wallX != null ? Math.max(o.x + o.w, o.wallX) : o.x + o.w + (wall ? 0 : o.w * 0.03);
  const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, sx = (x1 - x0) / bw, sy = Math.min(sx, 1.3), walk = KIT7_WALK * it.fh;
  ctx.drawImage(it.canvas, f * it.fw + b.x0, b.y0, bw, bh, x0, o.y - (walk - b.y0) * sy, x1 - x0, bh * sy);
  return true;
}
function drawOnewayKitPlain(ctx, o, room) {
  if (o.held === 'float') { drawIceSlab(ctx, o); return; }
  if (drawKit7(ctx, o, room)) return;
  if (o.held && drawHeld(ctx, o, room)) return;
  if (o.style === 'rope') { D.drawOneway(ctx, o, room.pal); return; }
  if (o.style.startsWith('in:')) {
    const shelf = Assets.get('plat.' + o.style.slice(3) + '.in');
    if (shelf) { drawShelf(ctx, shelf, o); return; }
    const pc = Kits.piece(o.fb.includes(':') ? o.fb.split(':') : o.fb, room.region);
    if (pc) { drawOnTop(ctx, pc, o); return; }
    D.drawOneway(ctx, o, room.pal); return;
  }
  const pc = o.style === 'plank' ? Kits.role(room.region, 'oneway') : Kits.piece(o.style.includes(':') ? o.style.split(':') : o.style, room.region);
  if (!pc) { D.drawOneway(ctx, o, room.pal); return; }
  if (o.hang) drawHangers(ctx, pc, o);
  drawOnTop(ctx, pc, o);
}
// v14 (notes 44, 48, 57): the chains or ropes a hung platform hangs by, carried up from the piece's top corners to what
// holds them (the ceiling, the block or ledge above, or out of the top of the room), drawn behind the piece from art:
// props/hang-chain.png / hang-rope.png tiled when they land, until then the grounded kit's chain piece (its links)
// repeated up from each corner.
function drawHangers(ctx, pc, o) {
  const s = Math.min(o.w / pc.sw, pc.h > pc.w ? 0.9 : 1.15), top = o.y - pc.top * s + 10;
  if (!(top > o.ceilY + 10)) return;
  const rope = o.style.split(':').pop() === 'rack', art = Assets.get(rope ? 'prop.hangrope' : 'prop.hangchain');
  for (const f of [0.16, 0.84]) {
    const x = o.x + o.w * f;
    if (art) { const iw = 26, ih = art.img.height * iw / art.img.width; for (let y = top; y > o.ceilY - ih; y -= ih - 1) ctx.drawImage(art.img, x - iw / 2, y - ih, iw, ih); continue; }
    const ch = Kits.extra('drowned-steps/grounded', 3); if (!ch) return;
    const cw = Math.round(ch.w * 0.16), sx = ch.x + Math.round(ch.w * 0.07), rows = 70, sy = ch.y + 4, sc = 0.55;
    for (let y = top; y > o.ceilY - rows * sc; y -= rows * sc - 1) ctx.drawImage(ch.img, sx, sy, cw, rows, x - cw * sc / 2, y - rows * sc, cw * sc, rows * sc);
  }
}

// v6: painted water. A body that is lighter at the surface and deepens downward, slow light streaks
// inside it, two surface strips scrolling at different speeds and directions, and a thin bright line.
// `top` lets the Reed Warden's flood rise in.
export function drawWater(ctx, h, room, t, top = h.y) {
  const surf = Assets.get('fx.watersurface'), bodyTop = top + 24, bottom = h.y + h.h;
  if (bottom <= bodyTop) return;
  ctx.save();
  const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + Math.min(420, bottom - bodyTop));
  g.addColorStop(0, 'rgba(92,176,184,0.9)'); g.addColorStop(0.35, 'rgba(34,104,118,0.93)'); g.addColorStop(1, 'rgba(12,46,58,0.96)');
  ctx.fillStyle = g;
  // v9 (review 9 #4): where the pool doesn't meet stone its side fades out over 40 px instead of ending in a hard edge
  const openL = !pointSolid(h.x - 6, bodyTop + 30), openR = !pointSolid(h.x + h.w + 6, bodyTop + 30), F = 40;
  const x0 = h.x + (openL ? F : 0), x1 = h.x + h.w - (openR ? F : 0);
  ctx.fillRect(x0, bodyTop, x1 - x0, bottom - bodyTop);
  for (let i = 0; i < 8; i++) {
    ctx.globalAlpha = (i + 0.5) / 8;
    if (openL) ctx.fillRect(h.x + i * 5, bodyTop, 5, bottom - bodyTop);
    if (openR) ctx.fillRect(h.x + h.w - (i + 1) * 5, bodyTop, 5, bottom - bodyTop);
  }
  ctx.globalAlpha = 1;
  if (!openL) ctx.fillRect(h.x, bodyTop, 0, 0);
  // a darker band low down, and two slow pale bands drifting across
  ctx.fillStyle = 'rgba(6,24,34,0.22)'; ctx.fillRect(x0, bottom - (bottom - bodyTop) * 0.3, x1 - x0, (bottom - bodyTop) * 0.3);
  for (let i = 0; i < 2; i++) { const bx = h.x + ((t * (18 + i * 9) + i * 330) % (h.w + 300)) - 150; ctx.fillStyle = 'rgba(210,245,245,0.08)'; ctx.fillRect(Math.max(x0, bx), bodyTop + 20 + i * 40, Math.max(0, Math.min(x1, bx + 220) - Math.max(x0, bx)), 16); }
  // slow light streaks drifting through the body
  ctx.beginPath(); ctx.rect(h.x, bodyTop, h.w, bottom - bodyTop); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < Math.ceil(h.w / 260); i++) {
    const x = h.x + ((i * 260 + t * (14 + (i % 3) * 6)) % (h.w + 200)) - 100, a = 0.05 + 0.04 * Math.sin(t * 0.8 + i * 1.7);
    ctx.fillStyle = `rgba(190,240,240,${a})`;
    ctx.beginPath(); ctx.moveTo(x, bodyTop); ctx.lineTo(x + 40, bodyTop); ctx.lineTo(x - 30, bodyTop + 200); ctx.lineTo(x - 60, bodyTop + 200); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  if (surf) {
    // the painted surface: two layers, the back one slower and the other way, the front one brighter
    const c = 112, s = c / surf.fh, lineY = top - c * 0.36;
    for (const [dir, sp, a, fr] of [[-1, 9, 0.55, 3], [1, 18, 0.95, 0]]) {
      ctx.save(); ctx.beginPath(); ctx.rect(h.x, top - c, h.w, c * 2); ctx.clip(); ctx.globalAlpha = a;
      const f = (Math.floor(t * 6) + fr) % surf.n, off = ((t * sp * dir) % c + c) % c;
      for (let x = h.x - c + off; x < h.x + h.w; x += c - 1) ctx.drawImage(surf.canvas, f * surf.fw, 0, surf.fw, surf.fh, x, lineY + (dir < 0 ? -6 : 0), surf.fw * s, surf.fh * s);
      ctx.restore();
    }
  } else {
    const pc = Kits.ready && Kits.role(room.region, 'water');
    if (pc) Kits.drawStrip(ctx, pc, h.x, h.w, top - 6, 96, { scroll: t * 22 });
  }
  ctx.fillStyle = 'rgba(236,252,250,0.7)'; ctx.fillRect(h.x, top + 2, h.w, 2);
}

function drawHazardKit(ctx, h, room, t) {
  if (h.t === 'water') { drawWater(ctx, h, room, t); return true; }
  if (h.t === 'fire') {
    const pc = Kits.role(room.region, 'fire');
    if (h.every && !ventOn(h)) {
      // a cold vent: the coal bed dull, and in the half second before it fires, glowing, shaking and spitting sparks
      ctx.save(); ctx.globalAlpha = ventWarn(h) ? 0.7 + 0.3 * Math.sin(t * 40) : 0.45; Kits.drawStrip(ctx, pc, h.x, h.w, h.y + h.h - 52, 58); ctx.restore();
      if (ventWarn(h) && Math.random() < 0.5) burst(h.x + Math.random() * h.w, h.y + h.h - 20, 1, { color: ['#ffd36b', '#f0742a'], min: 80, max: 260, angle: -Math.PI / 2, spread: 0.4, life: 0.35, size: 7, grav: 300 });
      return true;
    }
    Kits.drawStrip(ctx, pc, h.x, h.w, h.y + h.h - 52, 58);
    D.drawHazard(ctx, h.every ? { ...h, y: h.y - 140, h: h.h + 120 } : { ...h, y: h.y + 14, h: h.h - 30 }, t, false);   // a vent's burst stands tall
    return true;
  }
  if ((h.t === 'spikes' || h.t === 'thorns') && Assets.has('spikes.' + room.region)) {
    // v9 (review 9 #4, A4 to A8): the region's painted strip, tiled along the hazard, its dark base sunk into the floor
    const key = 'spikes.' + room.region, c = Assets.cells(key, 1)[0], sh = Math.max(110, h.h + 64), s = sh / c.sh, tw = c.sw * s, img = Assets.get(key).img;
    ctx.save(); ctx.beginPath(); ctx.rect(h.x - 6, h.y - sh, h.w + 12, sh * 2); ctx.clip();
    const base = h.y + h.h + sh * 0.1;
    for (let x = h.x - ((h.x * 0.37) % tw); x < h.x + h.w; x += tw - 2) ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, x, base - sh, tw, sh);
    ctx.restore();
    return true;
  }
  if (h.t === 'spikes') {
    const pc = Kits.role(room.region, 'spikes');
    Kits.drawStrip(ctx, pc, h.x, h.w, h.y, h.h + 8);
    return true;
  }
  return false;
}

function thornShape(g) {
  for (const [k, foot] of [['prop.thornwood-tall', 0.97], ['prop.thornwood-mid', 0.97], ['prop.thornwood-low', 0.97]]) {
    const a = Assets.get(k); if (!a) continue;
    const r = a.img.width / a.img.height, h = Math.max((g.h + 70) / 0.9, k.endsWith('low') ? (g.w + 20) / (0.4 * r) : 0), w = h * r;
    if (w * 0.4 >= g.w + 10 || k.endsWith('low')) return { img: a.img, w, h, foot };
  }
  const img = Assets.get('prop.thornwoodgate').img, r = img.width / img.height, h = Math.max((g.h + 70) / 0.56, (g.w + 20) / (0.4 * r));
  return { img, w: h * r, h, foot: 0.885 };
}
function drawGateKit(ctx, g, room, t) {
  if (g.t === 'crack') {
    // the shaft under the slab, dark whether or not it has been broken
    const gr = ctx.createLinearGradient(0, g.y, 0, room.h);
    gr.addColorStop(0, 'rgba(18,10,22,0.85)'); gr.addColorStop(1, 'rgba(10,6,14,1)');
    ctx.fillStyle = gr; ctx.fillRect(g.x, g.y + 10, g.w, room.h - g.y);
    if (g.open) return;
    const pc = Kits.role(room.region, 'crack');
    const j = g.shakeT > 0 ? Math.sin(t * 90) * 4 : 0;
    const s = (g.w + 24) / pc.sw;
    // v9 (review 9, rest): the pale slab takes the region's floor tone (it was the brightest thing in the quarry and the fort)
    const CRACK_TONE = { quarry: 'brightness(0.8) saturate(0.85)', brass: 'brightness(0.72) saturate(0.7) hue-rotate(-10deg)', kiln: 'brightness(0.82) sepia(0.35)', drowned: 'brightness(0.86) hue-rotate(40deg) saturate(0.8)' };
    if (CRACK_TONE[room.region]) ctx.filter = CRACK_TONE[room.region];
    Kits.drawAtTop(ctx, pc, g.x + g.w / 2 + j, g.y, s);
    ctx.filter = 'none';
    return;
  }
  if (g.t === 'branch' && Assets.get('prop.thornwoodgate')) {
    // v10 (Connor's note 18): the bramble grows out of the world: two rock outcrops either side, roots in the ground and
    // up the rock, the tangle spanning the gap between them. Burnt, the outcrops keep their charred roots.
    // v11 (Connor's note 27, review 11 #4): never stretched. Three shapes (tall 1:1.77, mid 4:5, low 1:1); the tallest one
    // whose middle 40% still spans the gap is drawn at its own proportions (taller than the gap if it must be).
    const pick = thornShape(g), img = pick.img, b = g.burn || 0;
    const h = pick.h, w = pick.w, x0 = g.x + g.w / 2 - w / 2, y0 = g.y + g.h + 14 - h * pick.foot;
    const mid = g.open && !g.burning ? 0 : g.burning ? Math.max(0, 1 - b / 0.35) : 1;
    ctx.save();
    if (g.open || g.burning) ctx.filter = `brightness(${g.open ? 0.55 : 1 - 0.4 * Math.min(1, b)}) saturate(${g.open ? 0.5 : 1})`;
    ctx.beginPath(); ctx.rect(x0 - 4, y0, w * 0.3 + 4, h); ctx.rect(x0 + w * 0.7, y0, w * 0.3 + 4, h); ctx.clip();
    ctx.drawImage(img, x0, y0, w, h);
    ctx.restore();
    if (mid > 0) { ctx.save(); ctx.globalAlpha = mid; ctx.beginPath(); ctx.rect(x0 + w * 0.3, y0, w * 0.4, h); ctx.clip(); ctx.drawImage(img, x0, y0, w, h); ctx.restore(); }
    if (g.burning) {
      const f = Math.min(7, Math.floor(b * 8)), size = g.h + 120;
      Assets.drawFx(ctx, 'fx.burn', f, g.x + g.w / 2, g.y + g.h + 12, size, 1, { anchor: 'bottom', sx: Math.max(1, w * 0.5 / (size * 0.62)) });
      const lg = ctx.createRadialGradient(g.x + g.w / 2, g.y + g.h * 0.5, 10, g.x + g.w / 2, g.y + g.h * 0.5, size);
      lg.addColorStop(0, `rgba(255,170,80,${0.3 * Math.sin(Math.PI * Math.min(1, b))})`); lg.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lg; ctx.fillRect(g.x + g.w / 2 - size, g.y + g.h * 0.5 - size, size * 2, size * 2); ctx.restore();
    }
    return;
  }
  if (g.t === 'branch') {
    if (g.open && !g.burning) return;
    const pc = Kits.role(room.region, 'branch'), b = g.burn || 0;
    const h = g.h + 70, w = Math.max(g.w * 1.7, h * pc.w / pc.h * 0.55);
    // v7 (review 7 A18): the burn sheet paints the tangle itself catching, burning and collapsing, so it plays once,
    // scaled to the whole gate, and the kit tangle hands over to it in the first moment (no more rows of tiled flames)
    const kitA = g.burning ? Math.max(0, 1 - b / 0.12) : 1;
    if (kitA > 0) Kits.drawRect(ctx, pc, g.x + g.w / 2 - w / 2, g.y + g.h - h + 10, w, h, { alpha: kitA });
    if (g.burning) {
      const f = Math.min(7, Math.floor(b * 8)), size = h * 1.05;
      Assets.drawFx(ctx, 'fx.burn', f, g.x + g.w / 2, g.y + g.h + 12, size, 1, { anchor: 'bottom', sx: Math.max(1, w / (size * 0.62)) });
      // a warm light on everything near the fire while it burns
      const lg = ctx.createRadialGradient(g.x + g.w / 2, g.y + g.h * 0.5, 10, g.x + g.w / 2, g.y + g.h * 0.5, h);
      lg.addColorStop(0, `rgba(255,170,80,${0.3 * Math.sin(Math.PI * Math.min(1, b))})`); lg.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lg; ctx.fillRect(g.x + g.w / 2 - h, g.y + g.h * 0.5 - h, h * 2, h * 2); ctx.restore();
    }
    return;
  }
  // v16 (Connor's note 73): a shutter in a side wall is seen side-on: the door post in profile with the gate edge-on beside
  // it (props/side-exit-<region>.png frame 1), the gate sliding up out of the way as it lifts
  if (g.t === 'shutter' && sideExitArt(room)) { drawSideExit(ctx, room, g.x + g.w / 2, g.y + g.h + 4, g.h + 150, g.x < room.w / 2 ? 'left' : 'right', 1 - g.lift); return; }
  if (g.t === 'shutter' || g.t === 'brass') {
    if (g.lift >= 1) return;
    const lift = g.lift * g.h, door = Assets.get('prop.gatedoortall'), fr = gateFrameBox(g, room);
    ctx.save();
    const j = g.lifting ? Math.sin(t * 60) * 2 : 0;
    if (door && fr) {
      // v11 (note 27): the planner's tall door, at its own proportions, sliding up inside the opening of the tall frame
      ctx.beginPath(); ctx.rect(fr.ox, fr.oy, fr.ow, g.y + g.h - fr.oy + 4); ctx.clip();
      const dw = fr.ow + 16, dh = dw * door.img.height / door.img.width;
      ctx.drawImage(door.img, g.x + g.w / 2 - dw / 2 + j, g.y + g.h + 4 - dh - lift, dw, dh);
    } else {
      // a studded timber door (kit art) hauled up into its frame, scaled uniformly from the piece's own shape
      ctx.beginPath(); ctx.rect(g.x - 60, g.y - 400, g.w + 120, g.h + 400); ctx.clip();
      const pc = Kits.piece(['brass', 'gate']), dh = g.h + 30, dw = dh * pc.w / pc.h;
      Kits.drawRect(ctx, pc, g.x + g.w / 2 - dw / 2 + j, g.y - lift - 30, dw, dh);
    }
    ctx.restore();
    if (fr) ctx.drawImage(fr.img, fr.x, fr.y, fr.w, fr.h);   // the posts stand in front of the door's edges
  }
}
// v11 (Connor's note 27): the west gate's frame is the planner's tall gatehouse (1:1.77), sized so its opening (56% of
// its width, 62% of its height) holds the door; never a walkway piece stood on end and pulled 3x too tall.
function gateFrameBox(g, room) {
  if (g.t !== 'shutter' || room.region === 'brass') return null;
  const a = Assets.get('prop.gateframetall'); if (!a) return null;
  const h = (g.h + 20) / 0.62, w = h * a.img.width / a.img.height, x = g.x + g.w / 2 - w / 2, y = g.y + g.h + 34 - h;
  return { img: a.img, x, y, w, h, ox: x + w * 0.22, oy: y + h * 0.31, ow: w * 0.56 };
}
// The frame stays standing once the door is up (drawn behind Joon; the door branch above draws it while shut)
function drawGateFrame(ctx, g, room) {
  if (g.t === 'shutter' && sideExitArt(room)) { if (g.lift >= 1) drawSideExit(ctx, room, g.x + g.w / 2, g.y + g.h + 4, g.h + 150, g.x < room.w / 2 ? 'left' : 'right', 0); return; }   // v16
  const fr = g.lift >= 1 ? gateFrameBox(g, room) : null;
  if (fr) ctx.drawImage(fr.img, fr.x, fr.y, fr.w, fr.h);
}

// v11 (Connor's note 25, review 11 #2 and #4): a barrier Joon has met and can't open yet keeps a small painted mark of
// what opens it. The planner's brush marks when they exist; until then a few painted strokes in code.
export function drawMark(ctx, kind, x, y, size = 64, alpha = 1) {
  const art = Assets.get('mark.' + kind);
  ctx.save(); ctx.globalAlpha *= alpha;
  if (art) { const im = art.img, k = size / Math.max(im.width, im.height); ctx.drawImage(im, x - im.width * k / 2, y - im.height * k / 2, im.width * k, im.height * k); ctx.restore(); return; }
  const s = size / 64; ctx.translate(x, y); ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const stroke = (col, w, pts) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 4) ctx.quadraticCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]); ctx.stroke(); };
  if (kind === 'fire') {
    ctx.fillStyle = '#e8742c'; ctx.beginPath(); ctx.moveTo(0, 26); ctx.quadraticCurveTo(-24, 20, -16, -2); ctx.quadraticCurveTo(-10, -14, 2, -30); ctx.quadraticCurveTo(0, -12, 12, -8); ctx.quadraticCurveTo(24, 10, 0, 26); ctx.fill();
    ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.moveTo(1, 22); ctx.quadraticCurveTo(-10, 16, -6, 4); ctx.quadraticCurveTo(-2, -4, 2, -12); ctx.quadraticCurveTo(4, 0, 9, 4); ctx.quadraticCurveTo(12, 16, 1, 22); ctx.fill();
    stroke('rgba(232,116,44,0.7)', 3, [-6, 26, -6, 34, -5, 38]);
  } else if (kind === 'earth') {
    ctx.fillStyle = '#b07a3a'; ctx.beginPath(); ctx.ellipse(0, 4, 26, 21, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d29a52'; ctx.beginPath(); ctx.ellipse(-7, -4, 13, 9, -0.3, 0, Math.PI * 2); ctx.fill();
    stroke('#5a3a20', 4, [4, -16, 0, -4, 6, 4, 10, 12, 4, 22]);
    stroke('rgba(176,122,58,0.7)', 3, [14, 24, 14, 31, 15, 35]);
  } else if (kind === 'water') {
    stroke('#3f8fc0', 10, [-28, 14, -14, -4, 0, 4, 10, 10, 14, -6]);
    stroke('#3f8fc0', 10, [14, -6, 10, -20, 24, -16]);
    stroke('#bfe6f5', 3, [-20, 8, -10, -2, 0, 2]);
    ctx.fillStyle = '#3f8fc0'; for (const [dx, dy, r] of [[-12, 24, 5], [6, 28, 4]]) { ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill(); }
  } else {
    stroke('#f2ede0', 7, [-26, 10, -10, -18, 10, -10, 26, -2, 10, 8, -2, 14, 2, 0]);
    stroke('#f2ede0', 5, [-24, 22, -4, 28, 18, 18]);
    ctx.fillStyle = '#8fb460'; ctx.beginPath(); ctx.ellipse(20, 18, 7, 4, -0.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawBarrierMarks(ctx, room) {
  for (const g of Flow.closedBarriers(room)) {
    if (!flag('seen-' + g.id)) continue;
    const kind = Flow.GATE_MARK[g.t]; if (!kind) continue;
    const fresh = G.flagMarkT && G.flagMarkT.id === g.id ? Math.min(1, (G.flagMarkT.t += 1 / 60) / 0.6) : 1;
    const cx = g.x + g.w / 2, cy = g.t === 'crack' ? g.y - 70 : g.t === 'water' ? g.y - 90 : g.y + Math.min(g.h * 0.45, 200);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(0.6 + 0.4 * fresh, 0.6 + 0.4 * fresh);
    if (!Assets.get('mark.' + kind)) { ctx.fillStyle = 'rgba(20,12,18,0.35)'; ctx.beginPath(); ctx.ellipse(0, 2, 50, 46, 0, 0, Math.PI * 2); ctx.fill(); }
    drawMark(ctx, kind, 0, 0, 84, fresh);
    ctx.restore();
  }
}
// v11 (review 11 #2, #4, #5): signposts are pictures, not sentences: one board per way, each painted with what lies
// there (a wave, a wind curl, a stone, a flame). Drawn at the piece's own proportions (it was squashed to 56%).
function drawSignpost(ctx, h, room, kit, pal) {
  const [x, y] = h.post, boards = h.boards || [];
  const own = Assets.get('prop.signpost'), pc = kit && Kits.piece(['kite', 'sign']);
  if (!own && !pc) { D.drawSign(ctx, x, y, pal); return; }
  const H = 270;
  const drawPiece = (flip, clipTop, clipH, dy) => {
    ctx.save();
    if (own) { const im = own.img, w = im.width * H / im.height; ctx.translate(x, y + dy); if (flip) ctx.scale(-1, 1); if (clipH) { ctx.beginPath(); ctx.rect(-w, -H + clipTop * H, w * 2, clipH * H); ctx.clip(); } ctx.drawImage(im, -w / 2, -H, w, H); }
    else { const w = pc.w * H / pc.h; ctx.translate(x, y + dy); if (flip) ctx.scale(-1, 1); if (clipH) { ctx.beginPath(); ctx.rect(-w, -H + clipTop * H, w * 2, clipH * H); ctx.clip(); } Kits.drawRect(ctx, pc, -w / 2, -H, w, H); }
    ctx.restore();
  };
  if (own) {
    // the planner's signpost has its own two boards: the upper points left, the lower points right
    const im = own.img, w = im.width * H / im.height;
    ctx.drawImage(im, x - w / 2, y - H, w, H);
    const slots = [{ x: x - w * 0.15, y: y - H * 0.84 }, { x: x + w * 0.18, y: y - H * 0.68 }];
    const used = [false, false];
    const slotOf = (bd) => { let i = bd[1] < 0 ? 0 : bd[1] > 0 ? 1 : used[0] ? 1 : 0; if (used[i]) i = 1 - i; used[i] = true; return i; };
    boards.filter((bd) => bd[1] !== 0).concat(boards.filter((bd) => bd[1] === 0)).forEach((bd) => {
      const sl = slots[slotOf(bd)];
      drawMark(ctx, bd[0], sl.x, sl.y, 50);
      if (bd[1] === 0) { ctx.save(); ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sl.x + 30, sl.y + 10); ctx.lineTo(sl.x + 30, sl.y - 12); ctx.moveTo(sl.x + 23, sl.y - 5); ctx.lineTo(sl.x + 30, sl.y - 13); ctx.lineTo(sl.x + 37, sl.y - 5); ctx.stroke(); ctx.restore(); }
      // v12 (note 31): 2 = down (Paddy Falls' top board: down to the water shrine)
      if (bd[1] === 2) { ctx.save(); ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sl.x + 34, sl.y - 14); ctx.lineTo(sl.x + 34, sl.y + 14); ctx.moveTo(sl.x + 25, sl.y + 5); ctx.lineTo(sl.x + 34, sl.y + 15); ctx.lineTo(sl.x + 43, sl.y + 5); ctx.stroke(); ctx.restore(); }
    });
    return;
  }
  const b0 = boards[0], b1 = boards[1];
  drawPiece(b0 && b0[1] < 0, 0, 0, 0);
  if (b1) drawPiece(b1[1] < 0, 0.05, 0.28, H * 0.27);
  const bw = (own ? own.img.width / own.img.height : pc.w / pc.h) * H;
  boards.forEach((b, i) => {
    const dir = b[1], up = dir === 0;
    const bx = x + (up ? -bw * 0.04 : dir * bw * 0.06), by = y - H + H * (0.17 + i * 0.27);
    drawMark(ctx, b[0], bx, by, 62);
    if (up) { ctx.save(); ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx + 34, by + 12); ctx.lineTo(bx + 34, by - 14); ctx.moveTo(bx + 26, by - 6); ctx.lineTo(bx + 34, by - 15); ctx.lineTo(bx + 42, by - 6); ctx.stroke(); ctx.restore(); }
    if (dir === 2) { ctx.save(); ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx + 34, by - 14); ctx.lineTo(bx + 34, by + 14); ctx.moveTo(bx + 26, by + 6); ctx.lineTo(bx + 34, by + 15); ctx.lineTo(bx + 42, by + 6); ctx.stroke(); ctx.restore(); }
  });
}
// The wind wheel is the Drowned Steps kit's old wheel: the base stands still, the wheel
// itself (a clipped circle of the same art) turns.
const WHEEL = { cx: 0.5, cy: 0.43, r: 0.4 };
// v9 (Connor's note 4): Kite Hill's rigs are wind chimes on a post (prop-wind-chime-gong.png): the bracket stays put, the
// chimes and their paper streamers swing on the rope while they ring.
function drawChimeRig(ctx, w, room) {
  const art = Assets.get('prop.windchime'), S = 270, x0 = w.x - 0.53 * S, y0 = w.y - 70 - 0.97 * S, t = room.time;
  const amp = Math.min(1, w.spin) * 0.32 + (w.spinT > 0 ? 0.12 : 0) + 0.025, ang = Math.sin(t * (w.spin > 0.3 ? 9 : 1.6) + w.x) * amp;
  // the post the bracket is bolted to
  ctx.fillStyle = '#5a3a2c'; ctx.fillRect(x0 + 0.035 * S, y0 + 0.4 * S, 0.075 * S, w.y - (y0 + 0.4 * S) + 4);
  ctx.strokeStyle = '#2c1d22'; ctx.lineWidth = 4; ctx.strokeRect(x0 + 0.035 * S, y0 + 0.4 * S, 0.075 * S, w.y - (y0 + 0.4 * S) + 4);
  if (art) {
    const img = art.img, px = x0 + 0.53 * S, py = y0 + 0.1 * S;
    ctx.save(); ctx.beginPath(); ctx.rect(x0 - 10, y0 - 10, S + 20, 0.17 * S + 10); ctx.rect(x0 - 10, y0 + 0.17 * S, 0.13 * S + 10, S); ctx.clip();
    ctx.drawImage(img, x0, y0, S, S); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(x0 + 0.13 * S, y0 + 0.17 * S, S, S); ctx.clip();
    ctx.translate(px, py); ctx.rotate(ang); ctx.translate(-px, -py);
    ctx.drawImage(img, x0, y0, S, S); ctx.restore();
  } else {
    ctx.fillStyle = '#7a4a34'; ctx.fillRect(x0 + 0.035 * S, y0 + 0.08 * S, 0.8 * S, 0.06 * S);
    ctx.save(); ctx.translate(x0 + 0.53 * S, y0 + 0.12 * S); ctx.rotate(ang);
    for (const dx of [-80, -40, 0, 40, 80]) { ctx.fillStyle = '#c9a24a'; ctx.fillRect(dx - 9, 0.35 * S, 18, dx ? 0.36 * S : 0.2 * S); ctx.strokeRect(dx - 9, 0.35 * S, 18, dx ? 0.36 * S : 0.2 * S); }
    ctx.restore();
  }
  w.hub = { x: w.x, y: y0 + 0.62 * S, r: 0.4 * S };
}
function drawWheel(ctx, w, room) {
  if (w.kind === 'chime') { drawChimeRig(ctx, w, room); return drawWheelHint(ctx, w, room); }
  const pc = Kits.ready && Kits.piece(['drowned', 'wheel']);
  const h = 260;
  if (pc) {
    const ww = pc.w * h / pc.h, x0 = w.x - ww / 2, y0 = w.y - h + 8;
    Kits.drawRect(ctx, pc, x0, y0, ww, h);
    const cx = x0 + ww * WHEEL.cx, cy = y0 + h * WHEEL.cy, r = ww * WHEEL.r;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(w.ang); ctx.translate(-cx, -cy);
    Kits.drawRect(ctx, pc, x0, y0, ww, h);
    ctx.restore();
    w.hub = { x: cx, y: cy, r };
  }
  drawWheelHint(ctx, w, room);
}
function drawWheelHint(ctx, w, room) {
  if (!w.done) {   // a ribbon of air to say "blow on me"
    const c = w.hub || { x: w.x, y: w.y - 170, r: 90 };
    ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * Math.sin(room.time * 4);
    ctx.strokeStyle = '#eafcff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 18, -0.6 + room.time, 0.4 + room.time); ctx.stroke();
    ctx.restore();
  }
}
// v9 (Connor's note 5): interiors join through open passages, never doors. An arch into the back wall, a stairwell
// going down (or up), or a timbered mine passage; push up or down to go through. While locked, a grate, chains or
// thornwood fill the opening. Only boss arenas keep a real door (the furnace gate, the sluice gate).
// v15: every region has its painted passage now (props/passage-<region>.png: open, locked; foot on the bottom edge), so
// the code arch, steps, frame and bars are gone.
function drawPassage(ctx, d, room, locked, t) {
  Assets.drawFxBox(ctx, 'prop.passage-' + room.region, locked ? 1 : 0, d.x, d.y + 6, 260, 1, { anchor: 'bottom', refF: 0 });
}
// Boss doors: the furnace gate (painted) and the sluice gate, made to feel like a threshold.
function drawBossDoor(ctx, d, room, locked, t) {
  const glow = d.art === 'furnace' ? '255,150,70' : '150,220,230';
  const g = ctx.createRadialGradient(d.x, d.y - 130, 20, d.x, d.y - 130, 260);
  g.addColorStop(0, `rgba(${glow},${(locked ? 0.12 : 0.3) + Math.sin(t * 2) * 0.05})`); g.addColorStop(1, `rgba(${glow},0)`);
  ctx.fillStyle = g; ctx.fillRect(d.x - 260, d.y - 390, 520, 390);
  const img = d.art === 'furnace' && Assets.get('prop.furnacedoor');
  if (img) { const h = 300, w = img.img.width * h / img.img.height; ctx.drawImage(img.img, d.x - w / 2, d.y + 6 - h, w, h); return true; }
  // the sluice (v15): the drowned passage sheet, its locked frame (the grate) fading to the open one over 0.5 s as it winds up
  const ru = locked ? 0 : d.raiseAt != null ? clamp((G.time - d.raiseAt) / 0.5, 0, 1) : 1, key = 'prop.passage-' + room.region;
  if (ru < 1) Assets.drawFxBox(ctx, key, 1, d.x, d.y + 6, 260, 1, { anchor: 'bottom', refF: 0, alpha: 1 - ru });
  if (ru > 0) Assets.drawFxBox(ctx, key, 0, d.x, d.y + 6, 260, 1, { anchor: 'bottom', refF: 0, alpha: ru });
  return true;
}
export const isPassage = (d) => d.kind === 'arch' || d.kind === 'stair' || d.kind === 'mine';
// Shortcut doors: the kit's studded arched door, barred while locked.
function drawDoorKit(ctx, d, room, locked, t) {
  if (isPassage(d)) { drawPassage(ctx, d, room, locked, t); return true; }
  if (d.kind === 'boss') return drawBossDoor(ctx, d, room, locked, t);
  const pc = Kits.piece(['brass', 'gate']);
  if (!pc) return false;
  const h = 230, w = pc.w * h / pc.h;
  if (!locked) {
    const g = ctx.createRadialGradient(d.x, d.y - 90, 10, d.x, d.y - 90, 160);
    g.addColorStop(0, `rgba(255,220,150,${0.25 + Math.sin(t * 2) * 0.06})`); g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g; ctx.fillRect(d.x - 160, d.y - 250, 320, 250);
  }
  Kits.drawRect(ctx, pc, d.x - w / 2, d.y - h + 6, w, h, { dark: locked ? 0.35 : 0 });
  if (locked) {
    ctx.save(); ctx.strokeStyle = '#3a2b2b'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(d.x - w * 0.42, d.y - 140); ctx.lineTo(d.x + w * 0.42, d.y - 80); ctx.moveTo(d.x + w * 0.42, d.y - 140); ctx.lineTo(d.x - w * 0.42, d.y - 80); ctx.stroke();
    ctx.restore();
  }
  return true;
}

export function drawProps(ctx, list, region, o = {}) {
  for (const a of list || []) {
    const [name, x, y, h, flip] = a;
    const pc = Kits.piece(name.includes(':') ? name.split(':') : name, region);
    if (!pc) continue;
    const hh = h || pc.h * 0.5, w = pc.w * hh / pc.h;
    const sw = a.rungT && G.time < a.rungT + 0.8 ? Math.sin(G.time * 13) * 0.06 * (a.rungT + 0.8 - G.time) : 0;   // v9: a rung bell sways
    if (sw) { ctx.save(); ctx.translate(x, y - hh); ctx.rotate(sw); ctx.translate(-x, -(y - hh)); }
    Kits.drawRect(ctx, pc, x - w / 2, y - hh, w, hh, { flip, dark: o.dark });
    if (sw) ctx.restore();
  }
}

// v16 (Connor's note 73: "the doors on the side of each section should be to the side rather than facing the player"):
// a way out through a side wall is seen side-on. The wall stops short and its end stands in profile at the threshold
// (props/side-exit-<region>.png frame 0: the post, its cap or lintel reaching into the room); a locked one has its gate
// edge-on beside the post (frame 1), which slides up out of the way as it opens. Front-facing doors and passages stay
// only where Joon walks INTO the background (cellar stairs, mine passages, the boss doors).
const sideExitArt = (room) => Assets.items['prop.sideexit-' + room.region] ? 'prop.sideexit-' + room.region : null;
function drawSideExit(ctx, room, x, floorY, h, side, lock = 0) {
  const key = sideExitArt(room), it = key && Assets.items[key]; if (!it || !it.frames) return false;
  const b = it.frames[0], w = h * (b.x1 - b.x0 + 1) / (b.y1 - b.y0 + 1), face = side === 'left' ? 1 : -1;
  if (x == null) x = side === 'left' ? w / 2 - 6 : room.w - w / 2 + 6;   // at the room's edge: the post stands just inside it
  Assets.drawFxBox(ctx, key, 0, x, floorY, w, face, { anchor: 'bottom', refF: 0 });
  if (lock > 0) {
    // the gate: frame 1's bars only (the part of the cell beside the post), raised by (1 - lock) of its height
    const s = w / (b.x1 - b.x0 + 1), cut = b.x0 + (b.x1 - b.x0 + 1) * 0.47, lift = (1 - lock) * h * 0.95;
    ctx.save(); ctx.beginPath();
    const ex = x + face * ((cut - (b.x0 + b.x1 + 1) / 2) * s);
    ctx.rect(face > 0 ? ex : ex - w, floorY - h * 1.2, w, h * 1.2 + 10); ctx.clip();
    Assets.drawFxBox(ctx, key, 1, x, floorY - lift, w, face, { anchor: 'bottom', refF: 0, alpha: Math.min(1, lock * 4) });
    ctx.restore();
  }
  return true;
}
// the post for each side exit of an interior or shaft room, at the floor where you walk out
function drawSideJambs(ctx, room) {
  const bg = room.def.bg || {}; if (!(bg.kind === 'in' || bg.kind === 'shaft' || bg.interior) || !sideExitArt(room)) return;
  for (const e of room.exits) {
    if (e.side === 'bottom') continue;
    const left = e.side === 'left', y0 = Math.max(0, e.range[0]), y1 = Math.min(room.h, e.range[1]);
    if (room.gates.some((g) => g.t === 'shutter' && (left ? g.x < 400 : g.x + g.w > room.w - 400))) continue;
    const floors = room.solids.filter((s) => !s.blockage && (left ? s.x <= 2 : s.x + s.w >= room.w - 2) && s.y > y0 && s.y <= y1 + 4).map((s) => s.y);
    for (const fy of new Set(floors)) drawSideExit(ctx, room, null, fy + 4, Math.min(560, fy - y0 + 40), e.side, 0);
  }
}
// v9 (Connor's note 8): every exit reads as a way out: a soft light from the next room along the edge, and when Joon
// is near, three pale chevrons at the height you walk out at.
function drawExits(ctx, room, t) {
  drawSideJambs(ctx, room);
  if (room.barriers.length || G.boss) return;
  const p = G.player;
  for (const e of room.exits) {
    if (e.side === 'bottom') {
      if (room.gates.some((g) => !g.open && g.x < e.range[1] && g.x + g.w > e.range[0] && g.y > room.h - 400)) continue;
      const cx = (e.range[0] + e.range[1]) / 2, near = Math.abs(p.x - cx) < 700 && room.h - p.y < 500;
      if (near) chevrons(ctx, cx, room.h - 150, 0, 1, t);
      continue;
    }
    const left = e.side === 'left', x0 = left ? 0 : room.w, y0 = Math.max(0, e.range[0]), y1 = Math.min(room.h, e.range[1]);
    const g = ctx.createLinearGradient(x0, 0, x0 + (left ? 170 : -170), 0);
    g.addColorStop(0, `rgba(255,240,214,${0.16 + 0.04 * Math.sin(t * 1.5)})`); g.addColorStop(1, 'rgba(255,240,214,0)');
    ctx.fillStyle = g; ctx.fillRect(left ? 0 : room.w - 170, y0, 170, y1 - y0);
    // the floor you walk out on
    const floors = room.solids.filter((s) => !s.blockage && (left ? s.x <= 2 : s.x + s.w >= room.w - 2) && s.y > y0 && s.y <= y1 + 4).map((s) => s.y)
      .concat(room.oneways.filter((o) => (left ? o.x <= 60 : o.x + o.w >= room.w - 60) && o.y > y0 && o.y <= y1).map((o) => o.y));
    if (!floors.length) continue;
    const fy = floors.reduce((m, y) => (Math.abs(y - p.y) < Math.abs(m - p.y) ? y : m));
    // v11 (review 11 #11): the white >>> only while the guide wisp is out; otherwise the lit edge and the open floor say it
    if (G.guide && Math.abs(p.x - x0) < 900 && Math.abs(p.y - fy) < 500) chevrons(ctx, left ? 90 : room.w - 90, fy - 70, left ? -1 : 1, 0, t);
  }
}
// v14 (Connor's notes 54, 40, 47, 57): an exit out of an arena reads as a way out: an arch at the room's side, sealed
// while the guardian stands and opening when it falls. Drawn from props/ice-sealed-arch.png (sealed 1-2, the ice cracking
// and sliding away 3-6, open 7-8) when it lands; until then the arena's own sluice-gate art (the arch and iron grate the
// east door uses), wound shut during the fight and raised when he falls. Cracks and melt sound when it opens.
function drawExitArch(ctx, room, a, t) {
  const left = a.side === 'left', open = flag(a.seal);
  if (open && room.archOpenAt == null) { room.archOpenAt = room.seenSealed ? room.time : -99; if (room.seenSealed) { Sound.sfx('arch-open', { x: left ? 120 : room.w - 120 }); shake(4); } }
  if (!open) room.seenSealed = true;
  const k = open ? clamp((room.time - room.archOpenAt) / 1.4, 0, 1) : 0, x = left ? 120 : room.w - 120;
  if (sideExitArt(room)) {
    // v16 (note 73): the sealed way out is side-on: the post in profile, its gate edge-on, sliding up as the seal breaks
    drawSideExit(ctx, room, null, a.y + 4, 520, a.side, 1 - k);
  } else if (Assets.has('prop.icearch')) {
    const f = !open ? Math.floor(t * 3) % 2 : Math.min(7, 2 + Math.floor(k * 6)), aw = 290;
    Assets.drawFxBox(ctx, 'prop.icearch', f, left ? aw / 2 - 6 : room.w - aw / 2 + 6, a.y + 6, aw, left ? 1 : -1, { anchor: 'bottom', refF: 0 });
  } else {
    const d = { id: 'arch-' + room.id, kind: 'boss', art: 'sluice', x, y: a.y, raiseAt: open && room.archOpenAt > 0 ? G.time - (room.time - room.archOpenAt) : null };
    drawBossDoor(ctx, d, room, !open, t);
  }
  if (open && k >= 1 && !room.barriers.length && G.guide) chevrons(ctx, left ? 90 : room.w - 90, a.y - 70, left ? -1 : 1, 0, t);
}
function chevrons(ctx, x, y, dx, dy, t) {
  // v14 (note 57): ui/exit-chevron.png, three painted chevrons pulsing in turn, once it lands
  if (Assets.has('fx.exitchevron')) { for (let i = 0; i < 3; i++) Assets.drawFx(ctx, 'fx.exitchevron', (Math.floor(t * 10) + i * 2) % 8, x - dx * (2 - i) * 26, y - dy * (2 - i) * 26, 64, dx < 0 ? -1 : 1, { rot: dx ? 0 : (dy > 0 ? Math.PI / 2 : -Math.PI / 2) }); return; }
  ctx.save(); ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const k = (Math.sin(t * 4 - i * 0.9) + 1) / 2, px = x - dx * (2 - i) * 26, py = y - dy * (2 - i) * 26;
    ctx.globalAlpha = 0.25 + 0.5 * k; ctx.strokeStyle = '#fff4dc';
    ctx.beginPath();
    if (dx) { ctx.moveTo(px - dx * 12, py - 16); ctx.lineTo(px + dx * 6, py); ctx.lineTo(px - dx * 12, py + 16); }
    else { ctx.moveTo(px - 16, py - dy * 12); ctx.lineTo(px, py + dy * 6); ctx.lineTo(px + 16, py - dy * 12); }
    ctx.stroke();
  }
  ctx.restore();
}
function drawBlockage(ctx, b, room) {
  if (Assets.drawCell(ctx, 'prop.blockages', 6, b.cell, b.side === 'left' ? b.x - 6 : b.x + 6, b.y + 14, b.h, { flip: b.side === 'right' })) return;
  // without the art: a heap of inked boulders
  ctx.save();
  for (const [dx, dy, r] of [[-30, -40, 60], [30, -30, 50], [0, -95, 52], [-20, -150, 40], [25, -140, 34]]) {
    ctx.beginPath(); ctx.ellipse(b.x + dx * (b.side === 'left' ? 1 : -1), b.y + dy, r, r * 0.82, 0, 0, 7); ctx.fillStyle = room.pal.fill || '#7d705c'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  }
  ctx.restore();
}
export function drawWorld(ctx, near) {
  const room = G.room, t = room.time, pal = room.pal;
  const view = { x: G.cam.x, y: G.cam.y, w: W, h: H };
  const kit = Kits.ready;
  if (room.def.frost) drawFrost(ctx, room, view, t);
  if (kit) drawProps(ctx, room.def.props, room.region);
  drawExits(ctx, room, t);
  if (room.def.exitArch) drawExitArch(ctx, room, room.def.exitArch, t);
  if (room.def.shrineLight) drawShrineLight(ctx, room.def.shrineLight, t);
  for (const h of room.hazards) if (!h.arena && !(kit && drawHazardKit(ctx, h, room, t))) D.drawHazard(ctx, h, t, false);
  for (const d of room.doors) if (!(kit && drawDoorKit(ctx, d, room, d.lock && !flag(d.lock), t))) D.drawDoor(ctx, d, pal, d.lock && !flag(d.lock), t);
  if (kit) for (const g of room.gates) drawGateFrame(ctx, g, room);
  for (const u of room.updrafts) drawUpdraft(ctx, u, t);
  for (const h of room.hints) if (h.post) drawSignpost(ctx, h, room, kit, pal);
  for (const w of room.wheels) drawWheel(ctx, w, room);
  if (kit) drawSolidsKit(ctx, room, view); else D.drawSolids(ctx, room.solids, pal, view);
  if (room.def.frost) for (const q of room.solids) if (q.w > 300 && !q.blockage) {   // v12: packed snow and ice over the frozen sluice's floor
    ctx.save(); ctx.fillStyle = '#eef8ff'; ctx.strokeStyle = '#1b2a3a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(q.x, q.y + 16);
    for (let x = q.x; x <= q.x + q.w; x += 40) ctx.lineTo(x, q.y - 6 - 5 * Math.sin(x * 0.07)); ctx.lineTo(q.x + q.w, q.y + 16);
    for (let x = q.x + q.w; x >= q.x; x -= 46) ctx.lineTo(x, q.y + 16 + ((x / 46) % 3 === 0 ? 22 : 6));
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  for (const b of room.blocks) if (b.x > view.x - 400 && b.x < view.x + view.w + 400) drawBlockage(ctx, b, room);
  if (room.shrine) drawShrineKit(ctx, room, near, t);
  if (room.stone) drawStoneKit(ctx, room, near, t);
  for (const g of room.gates) { if (kit) drawGateKit(ctx, g, room, t); else D.drawGate(ctx, g, pal, t); }
  for (const o of room.oneways) { if (kit) drawOnewayKit(ctx, o, room); else D.drawOneway(ctx, o, pal); }
  for (const p of G.pillars) drawPillar(ctx, p);
  drawBarrierMarks(ctx, room);
}

// Shrines: the region's own sacred piece, with the element sigil glowing above it.
const SHRINE_PIECE = { air: ['kite', 'bellshrine', 330], water: ['drowned', 'spiritstone', 300], earth: ['quarry', 'facestone', 300], fire: ['brass', 'brazier', 260] };
function drawShrineKit(ctx, room, near, t) {
  const sh = room.shrine, lit = near && near.type === 'shrine', done = flag('shrine-' + sh.el);
  const sp = SHRINE_PIECE[sh.el], pc = Kits.ready && Kits.piece([sp[0], sp[1]]);
  if (!pc) { D.drawShrine(ctx, sh.x, sh.y, sh.el, t, lit, done); return; }
  const h = sp[2], w = pc.w * h / pc.h;
  ctx.save();
  const glow = ctx.createRadialGradient(sh.x, sh.y - h * 0.6, 10, sh.x, sh.y - h * 0.6, h * 0.9);
  glow.addColorStop(0, D.hexA('#fff3c4', lit ? 0.45 : 0.22)); glow.addColorStop(1, 'rgba(255,243,196,0)');
  ctx.fillStyle = glow; ctx.fillRect(sh.x - h, sh.y - h * 1.6, h * 2, h * 1.6);
  ctx.restore();
  Kits.drawRect(ctx, pc, sh.x - w / 2, sh.y - h + 6, w, h);
  const y = sh.y - h - 50 + Math.sin(t * 2) * 6;
  if (lit) return;   // v5: the interact pill takes the badge's place, never on top of it
  // v6: no dark badge floating on screen: a soft glowing sigil, only when Joon is within reach of it
  const d = Math.abs(G.player.x - sh.x), a = Math.max(0, Math.min(1, (700 - d) / 300)) * (done ? 0.5 : 1);
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  const sg = ctx.createRadialGradient(sh.x, y, 4, sh.x, y, 46); sg.addColorStop(0, 'rgba(255,243,196,0.55)'); sg.addColorStop(1, 'rgba(255,243,196,0)');
  ctx.fillStyle = sg; ctx.fillRect(sh.x - 50, y - 50, 100, 100);
  D.elementSigil(ctx, sh.el, sh.x, y, 20, done ? '#d8d0dc' : '#fff3c4', 5);
  ctx.restore();
}
function drawStoneKit(ctx, room, near, t) {
  const st = room.stone, lit = near && near.type === 'stone';
  const pc = Kits.ready && Kits.piece(['kite', 'stone']);
  if (!pc) { D.drawStone(ctx, st.x, st.y, t, lit); return; }
  const h = 170, w = pc.w * h / pc.h;
  if (lit) {
    ctx.save();
    const glow = ctx.createRadialGradient(st.x, st.y - 90, 10, st.x, st.y - 90, 170);
    glow.addColorStop(0, 'rgba(191,233,242,0.55)'); glow.addColorStop(1, 'rgba(191,233,242,0)');
    ctx.fillStyle = glow; ctx.fillRect(st.x - 180, st.y - 260, 360, 260);
    ctx.restore();
  }
  Kits.drawRect(ctx, pc, st.x - w / 2, st.y - h + 8, w, h);
  // a slow breath of light over the carved spiral
  ctx.save(); ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 1.6);
  ctx.fillStyle = '#d7f4ff'; ctx.beginPath(); ctx.arc(st.x + 4, st.y - 92, 26, 0, 7); ctx.fill();
  ctx.restore();
}

function drawPillar(ctx, p) {
  const rise = Math.min(1, p.t / 0.28), left = p.life - p.t;
  ctx.save();
  if (left < 1.2) ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(left * 14));
  const key = p.kind === 'ice' ? 'fx.icewall' : 'fx.stonewall';
  if (p.h > p.top + 4) { // column standing in water
    ctx.fillStyle = 'rgba(140,196,234,0.75)'; ctx.fillRect(p.x + 14, p.y + p.top - 10, p.w - 28, p.h - p.top + 10);
    ctx.strokeStyle = '#2a5f86'; ctx.lineWidth = 4; ctx.strokeRect(p.x + 14, p.y + p.top - 10, p.w - 28, p.h - p.top + 10);
  }
  const r = { x: p.x, y: p.y, w: p.w, h: p.top };
  if (!Assets.drawFxFit(ctx, key, rise * 7, 7, r, { over: 1.08, h: p.top, sink: 6 })) phPillar(ctx, p.kind, r, rise);
  ctx.restore();
}

export function drawWorldFront(ctx) {
  const room = G.room, t = room.time;
  // risen arena water (Reed Warden phase two) sits on top of the floor, painted water strip
  // v6: it rises in over 0.6 s from below the floor as painted water, not a flat slab
  for (const h of room.hazards) if (h.arena) {
    h.rise = Math.min(1, (h.rise || 0) + 1 / 36);
    const e = 1 - (1 - h.rise) * (1 - h.rise);
    // v8 (review 8 #6): the strip is drawn off-screen and its inner end (toward the middle of the arena) fades over
    // 150 px, with the water-rise sheet's last frame as a soft foam lip there, so it no longer ends in a square slab
    const inner = h.x + h.w / 2 < room.w / 2 ? 1 : -1, pad = 160;
    const oc = h._oc || (h._oc = document.createElement('canvas'));
    if (oc.width !== Math.ceil(h.w) || oc.height !== Math.ceil(h.h + 30 + pad)) { oc.width = Math.ceil(h.w); oc.height = Math.ceil(h.h + 30 + pad); }
    const ox = oc.getContext('2d');
    ox.setTransform(1, 0, 0, 1, 0, 0); ox.globalCompositeOperation = 'source-over'; ox.clearRect(0, 0, oc.width, oc.height);
    ox.translate(-h.x, -(h.y - pad)); drawWater(ox, { ...h, h: h.h + 30 }, room, t, h.y + 60 * (1 - e)); ox.setTransform(1, 0, 0, 1, 0, 0);
    ox.globalCompositeOperation = 'destination-in';
    const mg = ox.createLinearGradient(inner > 0 ? oc.width : 0, 0, inner > 0 ? oc.width - 150 : 150, 0);
    mg.addColorStop(0, 'rgba(0,0,0,0)'); mg.addColorStop(0.45, 'rgba(0,0,0,0.55)'); mg.addColorStop(1, 'rgba(0,0,0,1)');
    ox.fillStyle = mg; ox.fillRect(0, 0, oc.width, oc.height); ox.globalCompositeOperation = 'source-over';
    ctx.drawImage(oc, h.x, h.y - pad);
    const lip = Assets.get('fx.waterrise');
    if (lip && h.rise >= 1) {
      const c = 130, sc = c / lip.fh, lx = inner > 0 ? h.x + h.w - 95 : h.x + 95;
      ctx.save(); ctx.globalAlpha = 0.55; ctx.translate(lx, 0); ctx.scale(inner, 1);
      ctx.drawImage(lip.canvas, 7 * lip.fw, 0, lip.fw, lip.fh, -c / 2, h.y + 34 - c + Math.sin(t * 2) * 3, lip.fw * sc, lip.fh * sc); ctx.restore();
    }
    // the painted rolling front while it floods in, rolling toward the middle of the arena
    const wr = Assets.get('fx.waterrise');
    if (wr && h.rise < 1) {
      const c = 200, s = c / wr.fh, f = Math.min(7, Math.floor(h.rise * 8)), face = h.x < room.w / 2 ? 1 : -1;
      ctx.save(); ctx.globalAlpha = Math.min(1, (1 - h.rise) * 3); ctx.beginPath(); ctx.rect(h.x, h.y - c, h.w, c + 80); ctx.clip();
      for (let x = h.x; x < h.x + h.w; x += c - 1) {
        ctx.save(); ctx.translate(x + c / 2, 0); ctx.scale(face, 1);
        ctx.drawImage(wr.canvas, f * wr.fw, 0, wr.fw, wr.fh, -c / 2, h.y + 60 * (1 - e) + 34 - c, wr.fw * s, wr.fh * s); ctx.restore();
      }
      ctx.restore();
    }
  }
  for (const h of room.hazards) if (h.t === 'water' && !h.arena) {
    // the surface again over anyone wading in it, fading in with depth so legs near the top stay visible
    const g = ctx.createLinearGradient(0, h.y + 30, 0, h.y + 150);
    g.addColorStop(0, 'rgba(40,120,140,0)'); g.addColorStop(1, 'rgba(30,96,114,0.45)');
    ctx.fillStyle = g; ctx.fillRect(h.x, h.y + 30, h.w, h.h - 30);
  } else if (!h.arena) D.drawHazard(ctx, h, t, true);
  // arena barriers: the fire army's iron cage panels, slammed down, with a glow at the foot
  const cage = Kits.ready && Kits.piece(['brass', 'cage']);
  for (const b of room.barriers) {
    ctx.save();
    if (cage) {
      // v5: one cage panel slammed down to the floor, hung from two chains that run up out of frame
      const w = 120, seg = cage.h * w / cage.w, cx = b.x + b.w / 2, top = b.y + b.h - seg;
      b.drop = Math.min(1, (b.drop || 0) + 1 / 12);
      const yOff = (1 - b.drop) * -seg * 1.5;
      for (const dx of [-38, 38]) {
        ctx.fillStyle = '#2a2430'; ctx.strokeStyle = '#6d6470'; ctx.lineWidth = 3;
        for (let y = top + yOff + 6; y > G.cam.y - 40; y -= 22) { ctx.beginPath(); ctx.ellipse(cx + dx, y, 6, 12, 0, 0, 7); ctx.stroke(); }
      }
      Kits.drawRect(ctx, cage, cx - w / 2, top + yOff, w, seg);
    } else { ctx.fillStyle = D.hexA(room.reg.color, 0.5); ctx.fillRect(b.x, b.y, b.w, b.h); }
    const g = ctx.createLinearGradient(0, b.y + b.h - 160, 0, b.y + b.h);
    g.addColorStop(0, 'rgba(255,140,60,0)'); g.addColorStop(1, `rgba(255,140,60,${0.35 + 0.1 * Math.sin(t * 6)})`);
    ctx.fillStyle = g; ctx.fillRect(b.x - 40, b.y + b.h - 160, b.w + 80, 160);
    ctx.restore();
  }
}

// Rising air: faint gust frames turned upward, and motes drifting up.
function drawUpdraft(ctx, u, t) {
  // v7 (review 7 #3): readable from across the room: a soft pale column, two staggered lanes of streaks at
  // twice the count and opacity, and leaves riding up it
  const cg = ctx.createLinearGradient(u.x, 0, u.x + u.w, 0);
  cg.addColorStop(0, 'rgba(234,252,255,0)'); cg.addColorStop(0.5, `rgba(234,252,255,${0.12 + 0.03 * Math.sin(t * 3)})`); cg.addColorStop(1, 'rgba(234,252,255,0)');
  ctx.fillStyle = cg; ctx.fillRect(u.x, u.y, u.w, u.h);
  // v9 (review 9 #3, A3): the painted column of rising air, tiled up the shaft at 2.2x Joon's width
  const col = Assets.get('fx.updraft');
  if (col) {
    const cw = G.player.w * 2.2 * 1.6, ch = cw, f = Math.floor(t * 10) % 8, off = (t * 160) % ch;
    ctx.save(); ctx.beginPath(); ctx.rect(u.x - 40, u.y, u.w + 80, u.h); ctx.clip(); ctx.globalAlpha = 0.32; ctx.globalCompositeOperation = 'screen';
    for (let y = u.y + u.h - off; y > u.y - ch; y -= ch * 0.9) Assets.drawFx(ctx, 'fx.updraft', (f + Math.floor(y / ch)) & 7, u.x + u.w / 2, y, ch, 1, { anchor: 'center' });
    ctx.restore();
  }
  else {
  ctx.save(); ctx.globalAlpha = 0.55;
  for (const [lane, off] of [[-0.22, 0], [0.22, 130]]) {
    for (let y = u.y + u.h - off; y > u.y; y -= 260) {
      const f = (Math.floor(t * 12) + Math.floor(y / 260) + (off ? 3 : 0)) % 8;
      ctx.save(); ctx.translate(u.x + u.w * (0.5 + lane), y - 130); ctx.rotate(-Math.PI / 2);
      Assets.drawFx(ctx, 'fx.gust', f, -130, 0, Math.min(260, u.w * 1.2), 1, { anchor: 'left' });
      ctx.restore();
    }
  }
  ctx.restore();
  }
  if (Math.random() < 0.6) G.parts.push({ x: u.x + Math.random() * u.w, y: u.y + u.h, vx: 0, vy: -420 - Math.random() * 240, life: u.h / 520, max: u.h / 520, size: 6, color: '#eafcff', grav: 0 });
  if (Math.random() < 0.07) G.parts.push({ x: u.x + u.w * (0.2 + Math.random() * 0.6), y: u.y + u.h, vx: 0, vy: -300 - Math.random() * 160, life: u.h / 380, max: u.h / 380, size: 11, color: ['#d9a441', '#8fb35a', '#c9673a'][(Math.random() * 3) | 0], grav: 0, shape: 'leaf' });
}

// Foreground silhouettes: drawn with their own parallax (1.25) after the world transform.
const FG_SHRINK = { drowned: 0.7, quarry: 0.7, kiln: 0.85, kite: 0.6, brass: 0.75 };   // v9 (review 9 #8): Kite Hill and the Brass Gate too
export function drawForeground(ctx) {
  const room = G.room;
  if (!Kits.ready || !room.def.fg) return;
  ctx.save();
  const ox = Math.round(-G.cam.x * 1.25), oy = Math.round(-G.cam.y * 1.1);
  ctx.translate(ox, oy);
  // where the player and enemies are on screen, in the foreground layer's own space
  const who = [G.player, ...G.enemies.filter((e) => !e.dead)].map((e) => ({ x: e.x - G.cam.x - ox, y: e.y - G.cam.y - oy, w: e.w, h: e.h }));
  for (const a of room.def.fg) {
    const [name, x, y, h] = a, pc = Kits.piece(name.includes(':') ? name.split(':') : name, room.region);
    if (!pc) continue;
    // v4: tall silhouettes sit lower in the fighting regions so they stay out of the lane
    let hh = (h || pc.h * 0.5) * (FG_SHRINK[room.region] || 1);
    // v9 (review 9 #8): near a door, a rest stone, a person or the start, a piece's top never rises above the floor
    // line minus 150 on screen (this layer moves at 1.25 / 1.1 of the camera, so its world x shifts as you walk)
    const worldX = x + ox + G.cam.x, halfW = pc.w * hh / pc.h / 2;
    const keep = [...room.doors, room.stone, room.shrine, G.npc, ...(G.villagers || []), room.def.start && { x: room.def.start[0], y: room.def.start[1] }].filter(Boolean);
    for (const k of keep) if (Math.abs(k.x - worldX) < 200 + halfW) hh = Math.min(hh, Math.max(40, y + oy - (k.y - G.cam.y) + 150));
    const w = pc.w * hh / pc.h, r = { x: x - w / 2, y: y - hh, w, h: hh };
    const cover = who.some((e) => e.x + e.w / 2 > r.x && e.x - e.w / 2 < r.x + r.w && e.y > r.y && e.y - e.h < r.y + r.h);
    a.fade = (a.fade ?? 1) + ((cover ? 0.2 : 1) - (a.fade ?? 1)) * 0.15;   // v9: 0.2 (was 0.35) while someone is behind it
    ctx.save(); ctx.globalAlpha = a.fade;
    drawProps(ctx, [[name, x, y, hh, a[4]]], room.region, { dark: 0.78 });
    ctx.restore();
  }
  ctx.restore();
}
