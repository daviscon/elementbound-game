// The 8 element moves, the player's lingering hit zones, and ice / stone walls.
import { G, overlap, boxOf, shake, burst, addFx, banner, clamp, skill, later } from './game.js';
import { MOVES } from './config.js';
import { Input } from './input.js';
import { rayDown, rectFree, rebuildCol, igniteBranch, spinWheel, gustProps } from './world.js';
import { Sound } from './audio.js';
import { hitEnemy, spawnShot, douse } from './enemies.js';

const REL = { gust: 0.16, whip: 0.17, fireblast: 0.13 };   // v10: seconds from the start of a cast to its release frame
const ICE = { w: 170, h: 160, life: 10, ahead: 185 };
const STONE = { w: 170, h: 190, life: 9, ahead: 175 };

export const moveCost = (id) => {
  let c = MOVES[id].cost;
  if (id === 'flamering' && skill('emberring')) c -= 10;
  if (G.player && G.player.focusT > 0) c = Math.ceil(c / 2);
  if ((id === 'icewall' || id === 'stonewall') && atCrossing()) c = 0;
  return c;
};
// v12 (Connor's note 38, soft-locked out of Breath in the middle of an ice-bridge crossing): a wall raised to cross water
// costs nothing beside a water gap or deep water, outside a fight. The HUD slot shows it free (ui.js reads moveCost), so
// a crossing can always be finished, and walked back.
export function atCrossing() {
  const p = G.player, room = G.room; if (!p || !room) return false;
  if ((room.fight && room.fight.phase !== 'done') || G.boss) return false;
  const near = (r) => p.x > r.x - 420 && p.x < r.x + r.w + 420 && p.y > r.y - 500 && p.y < r.y + r.h + 300;
  return (room.def.wgaps || []).some((q) => near({ x: q.r[0], y: q.r[1], w: q.r[2], h: q.r[3] })) || room.hazards.some((h) => h.t === 'water' && !h.arena && near(h));
}

// Returns true when cast, 'busy' when it should stay buffered, false when it can't happen.
export function tryCast(id) {
  const p = G.player;
  if (!id || p.dead) return false;
  if (p.castT > 0.12 || p.castLock > 0 || p.slam || p.dashT > 0 || p.hurtT > 0 || p.ledge || p.healT > 0) return 'busy';
  // v10 (Connor's note 13): the same move can't be thrown again straight away
  const gap = (p.recast && p.recast[id]) || 0;
  if (G.time < gap) return 'busy';
  const cost = moveCost(id);
  if (p.breath < cost) { p.noBreathT = 0.5; Sound.sfx('no-breath', { gap: 0.4 }); return false; }   // v10 (note 15): the bar flashes; no text
  if (CAST[id](p) === false) return false;
  p.breath -= cost; p.atk = null; p.atkQueued = false; p.focusT = 0; p.castEl = MOVES[id] ? MOVES[id].el : 'air';
  if (p.wall) { p.wall = 0; }
  // v10 (note 13): commitment. Joon is rooted through the cast and a recovery after it (a dash may cancel the last
  // 30%); the same move is ready again RECAST s after the cast ends
  const lock = (p.castDur || 0.3) + (RECOVER[id] ?? 0.2);
  p.castLock = lock; p.castLockMax = lock;
  (p.recast || (p.recast = {}))[id] = G.time + lock + RECAST;
  // v10 (Connor's note 23): a cast in the air hangs Joon for a moment (once per jump) instead of falling through it
  if (!p.onGround && id !== 'slam' && !p.airCast && p.vy > -400) { p.airCast = true; p.vy = Math.min(p.vy, 0) * 0.2; p.hangT = 0.26; Sound.sfx('air-hang', { vol: 0.8 }); }   // v11: the held hush of the hang
  Sound.sfx(SFX[id]);
  return true;
}
const RECOVER = { gust: 0.22, deflect: 0, whip: 0.25, icewall: 0.15, slam: 0, stonewall: 0.2, fireblast: 0.24, flamering: 0.2 };
const RECAST = 0.35;

const SFX = { gust: 'gust', deflect: 'deflect', whip: 'whip', icewall: 'ice-wall', slam: 'slam-rise', stonewall: 'stone-wall', fireblast: 'fire-blast', flamering: 'flame-ring' };

// A hit zone. With `follow` it is re-placed on the caster every frame (ox / oy from the feet,
// mirrored by facing), so a move cast on the run hits where the hero is, not where he was.
function zone(z) { G.zones.push({ t: 0, delay: 0, life: 0.15, hit: new Set(), ...z }); }
function placeZone(z) {
  if (!z.follow) return;
  const f = z.follow;
  z.x = z.face > 0 ? f.x + z.ox : f.x - z.ox - z.w;
  z.y = f.y + z.oy;
}
function cast(p, dur = 0.3) { p.castT = dur; p.castDur = dur; }

// Find where a wall can stand in front of the player. Ice may stand on water.
let cramped = false;   // the last failed placement had footing but no room
function placeWall(p, spec, allowWater) {
  cramped = false;
  for (let ahead = spec.ahead; ahead >= 110; ahead -= 25) {
    const cx = p.x + p.face * ahead;
    const hit = rayDown(cx, p.y - 40, 330);
    if (!hit || (hit.water && !allowWater)) continue;
    cramped = true;
    // both edges need the same footing (no hanging over a ledge)
    const a = rayDown(cx - spec.w / 2 + 14, p.y - 40, 330), b = rayDown(cx + spec.w / 2 - 14, p.y - 40, 330);
    const base = Math.min(hit.y, a ? a.y : hit.y, b ? b.y : hit.y);
    const r = { x: cx - spec.w / 2, y: base - spec.h, w: spec.w, h: spec.h };
    if (!rectFree({ x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 6 })) continue;
    if (overlap(r, boxOf(p))) continue;
    const floor = hit.water ? hit.floor : base;
    return { x: r.x, y: r.y, w: r.w, h: floor - r.y, top: spec.h };
  }
  return null;
}

// v7: no wall on top of a meditation stone, a shrine or a door (they'd be hidden or unreachable)
function blockedSpot(r) {
  const room = G.room, cx = r.x + r.w / 2, near = (x, y) => Math.abs(cx - x) < 150 + r.w / 2 && Math.abs(r.y + r.h - y) < 200;
  return (room.stone && near(room.stone.x, room.stone.y)) || (room.shrine && near(room.shrine.x, room.shrine.y)) || room.doors.some((d) => near(d.x, d.y));
}
function raiseWall(kind, r, life, hp = 3) {
  const same = G.pillars.filter((q) => q.kind === kind);
  if (same.length >= 3) same[0].t = same[0].life; // the oldest crumbles
  const pl = { ...r, kind, pillar: true, t: 0, life, hp };
  G.pillars.push(pl);
  if (kind === 'ice') douse({ x: pl.x - 20, y: pl.y, w: pl.w + 40, h: pl.h + 20 });   // v10: ice puts burning ground out (and you can stand on it)
  rebuildCol();
  // anything standing there gets lifted (stone: launched)
  for (const e of G.enemies) {
    if (e.dead || e.boss || !overlap(pl, boxOf(e))) continue;
    e.y = pl.y; e.vy = kind === 'stone' ? -900 : -300;
    if (kind === 'stone') hitEnemy(e, 2, (e.x < pl.x + pl.w / 2 ? -1 : 1) * 260, -900, { heavy: true, launch: true });
  }
  return pl;
}

const CAST = {
  gust(p) {
    cast(p, 0.36);
    // v9 (Connor's note 10): the gust leaves the open palm on the push frame at about Joon's height, follows his
    // facing, and grows as it travels (it was a 400 px cloud planted in front of him)
    // v10 (review 10 #6): the body moves first; the push leaves the palm on frame 4 of the new 8-frame cast (0.16 s)
    // v15 (Connor's note 68: "air and water don't do much damage and you need to be in really close range"): the gust is
    // a mid-range shot now. The ball flies 640 px from the palm in 0.5 s and its hit box rides with it, dealing 3 (a
    // strike deals 1), once to each foe it passes through
    const GT = 0.5, GTRAVEL = 640;
    addFx('gustball', p.x + p.face * 58, p.y - 104, { dur: REL.gust + GT, face: p.face, size: 170, grow: 150, travel: GTRAVEL, delay: REL.gust });
    zone({ x0: p.x + p.face * 58, face: p.face, travel: GTRAVEL, tdur: GT, x: p.x + p.face * 58 - 110, y: p.y - 214, w: 220, h: 220, dmg: 3, kx: p.face * 1000, ky: -380, delay: REL.gust, life: GT, blow: true, gust: true });
    if (!p.onGround) p.vx -= p.face * 340;   // v10 (note 23): the push throws Joon back a little in the air
  },
  deflect(p) {
    // v10 (Connor's note 16): a short, precise turn of the palms, not a bubble. Only the window itself catches; a
    // deflect that catches nothing leaves Joon open for a moment (see updateMoves)
    cast(p, 0.2);
    p.deflect = deflectWindow(); p.deflectAge = 0; p.deflectHit = false;
    addFx('deflect', 0, 0, { dur: 0.22, size: 130, follow: p, ox: p.face * 50, oy: -110, behind: true, alpha: 0.7 });   // v11 (review 11 #7): a palm-sized swirl at the hand, not a 230 px ball over Joon
  },
  whip(p) {
    cast(p, 0.4);
    if (!p.onGround) p.vx -= p.face * 200;   // v11 (review 11 #7): the whip's lash kicks Joon back a little in the air too
    // v14 (Connor's note 62: the whip "comes out of nowhere rather than from the player's hands"): every frame of the strip
    // grows from the bottom-left of its cell (2% in, 78% down). That root is now placed on Joon's casting hand (40 px in
    // front of his middle, 112 px up), so the lash always starts AT the hand and reaches out from it. It was centred
    // 128 px ahead, which put the root behind his body at his feet.
    // v15 (note 68): a long reach (the lash is drawn 500 px, was 340) and 3 damage
    const WS = 500, hx = p.face * 40, hy = -112;
    addFx('whip', 0, 0, { follow: p, ox: hx + p.face * (0.5 - 0.02) * WS, oy: hy - (0.78 - 0.5) * WS, dur: 0.4, face: p.face, size: WS, delay: REL.whip });
    // the whip catches everything in its arc and drags it toward you
    zone({ follow: p, face: p.face, ox: 10, oy: -300, w: 540, h: 310, dmg: 3, kx: -p.face * 380, ky: -300, delay: REL.whip + 0.02, life: 0.2, whip: true });
  },
  icewall(p) {
    if (!p.onGround) { Sound.sfx('no-breath', { gap: 0.4 }); return false; }   // v10 (note 15): a soft no, not a sentence
    const r = placeWall(p, ICE, true);
    if (!r) { Sound.sfx('thud-wall', { vol: 0.35, rate: 1.3, gap: 0.3 }); return false; }   // v11 (note 15): a soft no, not a sentence
    if (blockedSpot(r)) { Sound.sfx('thud-wall', { vol: 0.35, rate: 1.3, gap: 0.3 }); return false; }
    cast(p, 0.3);
    raiseWall('ice', r, ICE.life * (skill('glacier') ? 1.5 : 1), skill('glacier') ? 5 : 3);
    burst(r.x + r.w / 2, r.y + r.top, 12, { color: ['#dff3ff', '#8cc4ea'], rx: r.w / 2, min: 60, max: 300, angle: -Math.PI / 2, spread: 1, life: 0.5, size: 10 });
  },
  slam(p) {
    p.slam = { phase: 'rise', t: 0 };
    p.vy = p.onGround ? -900 : -360; p.onGround = false; p.gliding = false;
  },
  stonewall(p) {
    if (!p.onGround) { Sound.sfx('no-breath', { gap: 0.4 }); return false; }
    // v10 (review 10 #11): holding down, a plain square quarry block punches up under Joon's feet and throws him high
    if (Input.held.down) {
      const r = { x: p.x - 80, y: p.y - 150, w: 160, h: 150, top: 150 };
      if (!rectFree({ x: r.x + 4, y: r.y - p.h, w: r.w - 8, h: p.h - 4 })) return false;   // no head room
      cast(p, 0.2);
      raiseWall('stone', r, STONE.life * 0.7, 3);
      p.y = r.y; p.vy = -1500; p.onGround = false; p.jumpCut = true; p.takeT = 0.1;
      shake(10); Sound.sfx('land-hard', { vol: 0.8 });
      addFx('dust', p.x, r.y + r.h + 8, { dur: 0.45, size: 260, anchor: 'bottom' });
      burst(p.x, r.y + r.h, 14, { color: ['#c9b9a0', '#8a7a72'], rx: 70, min: 80, max: 360, angle: -Math.PI / 2, spread: 1.2, life: 0.5, size: 12, shape: 'chunk', grav: 1800 });
      return;
    }
    const r = placeWall(p, STONE, false);
    if (!r) { Sound.sfx('thud-wall', { vol: 0.35, rate: 1.3, gap: 0.3 }); return false; }
    if (blockedSpot(r)) { Sound.sfx('thud-wall', { vol: 0.35, rate: 1.3, gap: 0.3 }); return false; }
    cast(p, 0.3);
    raiseWall('stone', r, STONE.life * (skill('bulwark') ? 1.5 : 1), skill('bulwark') ? 5 : 3);
    shake(8);
    burst(r.x + r.w / 2, r.y + r.top, 12, { color: ['#c9b9a0', '#8a7a72'], rx: r.w / 2, min: 60, max: 320, angle: -Math.PI / 2, spread: 1.2, life: 0.5, size: 12, shape: 'chunk', grav: 1800 });
  },
  fireblast(p) {
    // v10 (review 10 #11): in the air, holding down, a short burst from the heel of the hand straight down kicks Joon
    // up once per jump (a recovery and a reach for high ledges; no jets, just one push)
    if (!p.onGround && Input.held.down && !p.blastBoost) {
      cast(p, 0.22); p.blastBoost = true;
      p.vy = -760; p.hangT = 0;
      spawnShot({ kind: 'fireblast', from: 'player', x: p.x, y: p.y + 10, vx: 0, vy: 1300, r: 30, dmg: 3, life: 0.6, burn: true, hitSet: new Set() });
      burst(p.x, p.y + 10, 12, { color: ['#ffd36b', '#f0742a', '#ffffff'], min: 80, max: 360, angle: Math.PI / 2, spread: 0.8, life: 0.35, size: 11, grav: 0 });
      shake(5);
      return;
    }
    cast(p, 0.3);
    // the long straight punch lands on frame 4; the fire leaves the fist then (cancelled by a hit before it)
    later(REL.fireblast, () => {
      if (p.hurtT > 0 || p.dead) return;
      spawnShot({ kind: 'fireblast', from: 'player', x: p.x + p.face * 70, y: p.y - 88, vx: p.face * 1150, vy: 0, r: 30, dmg: 3, life: 1.3, burn: true, pierce: skill('kindling') ? 3 : 0, hitSet: new Set() });
      burst(p.x + p.face * 70, p.y - 88, 6, { color: ['#ffd36b', '#f0742a'], min: 60, max: 260, life: 0.3, size: 10 });
    });
    if (!p.onGround) p.vx -= p.face * 240;
  },
  flamering(p) {
    cast(p, 0.3);
    p.ring = 5; p.ringTick = 0;
    for (const f of G.fx) if (f.kind === 'flamering') f.t = f.dur;
    addFx('flamering', 0, 0, { dur: 5, size: 280, follow: p, oy: -78, loop: true, split: true });   // v6: back half behind Joon, front half see-through
  },
};

export function updateMoves(dt) {
  const p = G.player;
  // lingering hit zones (gust, whip)
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i];
    placeZone(z);
    if (z.delay > 0) { z.delay -= dt; continue; }
    z.t += dt;
    if (z.travel) { const u = Math.min(1, z.t / z.tdur), k = 1 - (1 - u) * (1 - u); z.x = z.x0 + z.face * z.travel * k - z.w / 2; }   // v15: the gust's box flies with the ball
    for (const e of G.enemies) {
      if (e.dead || z.hit.has(e) || !overlap(z, boxOf(e))) continue;
      z.hit.add(e); hitEnemy(e, z.dmg, z.kx, z.ky, { gust: z.gust, whip: z.whip, fromX: p.x });
      if (z.gust && !e.boss) e.blownT = 0.5;          // thrown: slamming into a wall or another enemy stuns
    }
    if (z.blow && !z.rang) { z.rang = true; gustProps(z); }
    if (z.whip) douse({ x: z.x, y: z.y, w: z.w, h: z.h + 120 });   // v10: water puts burning ground out
    if (z.blow) for (const w of G.room.wheels) if (w.x > z.x - 40 && w.x < z.x + z.w + 40 && w.y - 170 > z.y - 120 && w.y - 170 < z.y + z.h + 120) spinWheel(w);
    if (z.blow) for (const s of G.shots) {
      if (s.from === 'enemy' && !s.wave && s.x > z.x && s.x < z.x + z.w && s.y > z.y && s.y < z.y + z.h) { s.from = 'player'; s.vx = Math.sign(z.kx) * Math.max(600, Math.abs(s.vx)); s.vy = Math.min(s.vy, -40); s.dmg = Math.max(2, s.dmg); s.life = 1.5; Sound.sfx('deflect-release', { x: s.x, vol: 0.6, gap: 0.1 }); }   // v15: a shot blown back is heard
    }
    if (z.t >= z.life) G.zones.splice(i, 1);
  }
  // flame ring: burns what touches it and lights thornwood
  if (p.ring > 0 && !p.dead) {
    p.ringTick -= dt;
    const c = { x: p.x - 150, y: p.y - 230, w: 300, h: 260 };
    if (p.ringTick <= 0) {
      p.ringTick = 0.45;
      for (const e of G.enemies) if (!e.dead && overlap(c, boxOf(e))) hitEnemy(e, 1, Math.sign(e.x - p.x || 1) * 460, -260, { ring: true, fromX: p.x });
    }
    for (const g of G.room.gates) if (g.t === 'branch' && overlap({ x: c.x + 30, y: c.y, w: c.w - 60, h: c.h }, g)) igniteBranch(g);
  }
  // v10 (note 16): a deflect that caught nothing: a stumble and a short opening
  if (p.deflectWas > 0 && !(p.deflect > 0) && !p.deflectHit && !p.dead) { p.castLock = Math.max(p.castLock || 0, 0.32); p.castLockMax = 0.32; p.deflectMiss = 0.32; Sound.sfx('deflect-miss', { vol: 0.8 }); }
  p.deflectWas = p.deflect;
  // v10 (Connor's note 13): Breath no longer trickles back. It comes from defeated foes and from resting. The one
  // guard against a soft lock: in a room with no foes left and a way still closed by a gate, it creeps up to one
  // Gust's worth, slowly, so a player who spent it all can still open the way
  if (p.breath < 25 && !G.enemies.some((e) => !e.dead) && G.room.gates.some((g) => !g.open && (g.t === 'shutter' || g.t === 'crack' || g.t === 'branch'))) p.breath = clamp(p.breath + 3 * dt, 0, 25);
}
export const deflectWindow = () => (skill('echo') ? 0.2 : 0.15);
