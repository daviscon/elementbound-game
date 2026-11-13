// Trial guardians, the Captain, and the arena logic (barriers, soldier waves, rewards).
// Every boss runs a fixed attack cycle with a clear tell before each attack, so the
// fights can be learned:
//   Reed Warden (Drowned Steps)   wave slam (jump the waves), water spout pillars (move off
//                                 the bubbling marks), and drifts across the arena.
//   Quarry Colossus (Ninefold)    ground-slam shockwaves and boulders. Its stone hide shrugs
//                                 off most damage; only an Earth Slam landing next to it
//                                 staggers it, and a staggered Colossus takes full damage.
//   Kiln Overseer (Kilnmouth)     flame cone, charging punch, fireball fan. After the cone
//                                 it has to vent steam: that is the moment to hit it.
//   The Captain (Brass Gate)      phase 1: slash combo and fireball volleys. Phase 2 (half
//                                 health): adds a flame dash that leaves fire on the floor,
//                                 bigger volleys and faster combos.
import { startAttune } from './attune.js';
import { G, flag, setFlag, persist, overlap, clamp, boxOf, shake, hitstop, impact, burst, sign, banner, later, toast, addFx, rnd } from './game.js';
export const BOSS_PHASES = null;
import { PHYS, INK } from './config.js';
import { moveBody, rebuildCol, rectFree } from './world.js';
import { hurtPlayer } from './player.js';
import { spawnEnemy, spawnShot, drawSoldier, hitPose, groundFire } from './enemies.js';
import { aaPose } from './pogo.js';
import { drawGuardian } from './placeholders.js';
import { Assets } from './assets.js';
import { Sound } from './audio.js';
import { flame, hexA } from './draw.js';
import * as Flow from './flow.js';

// v12 (Connor's note 39): the Reed Warden is replaced by the Rime Warden, an ice temple guardian. Its kind stays 'reed'
// inside the code and the save ('boss-reed'), so old saves keep their progress; every name the player sees is new.
const NAMES = { reed: 'The Rime Warden', colossus: 'The Quarry Colossus', overseer: 'The Kiln Overseer', captain: 'The Captain' };
const SUBS = { reed: 'Ice guardian of the frozen sluice', colossus: 'Trial guardian of the deep pit', overseer: 'Master of the furnace yard', captain: 'Captain of the Brass Gate' };
const STATS = {
  // v4: health up about half so the later phases are actually seen (were 36 / 56 / 58 / 48)
  reed: { w: 150, h: 290, hp: 54 }, colossus: { w: 220, h: 320, hp: 120 },   // v16 (note 75, bot-tuned): Colossus 84 -> 120, Overseer 80 -> 46, Captain 80 -> 46
  overseer: { w: 170, h: 290, hp: 46 }, captain: { w: 90, h: 225, hp: 46 },
};
const CYCLE = {
  reed: ['slam', 'pillars', 'sweep', 'slam', 'icicles'],
  colossus: ['walk', 'slam', 'walk', 'toss', 'slam'],
  overseer: ['cone', 'punch', 'fan', 'cone', 'punch'],
  captain: ['combo', 'volley', 'combo', 'leap'],
  captain2: ['combo', 'dash', 'volley', 'combo', 'dash', 'leap'],
};
const PLACEHOLDER = { reed: 'tide', colossus: 'warden', overseer: 'kiln' };
// Health fractions where each boss changes phase (2 or 3 phases each).
// v16 (Connor's note 75: "give them the full Rime Warden treatment"): two phases each, the line at half health. The
// Captain keeps his third (Kesh's return takes his fire, a story beat, not a harder fight).
const PHASES = { reed: [0.5], colossus: [0.5], overseer: [0.5], captain: [0.5, 0.25] };
// how much faster phase two comes (timings are multiplied by this); tuned on the fight bots
export const PHASE2_K = { reed: 0.635, colossus: 0.55, overseer: 0.92, captain: 0.8 };
// What each phase adds to the cycle.
export const PHASE_CYCLE = {
  // v12 (note 39): the Rime Warden. Phase one: the ice slam (spikes race along the floor), the three rising pillars, the
  // sweeping push, falling icicles. Phase two adds the frozen wave and strings the spikes both ways.
  // v14 (Connor's note 60): the frozen wave is out of the Warden's moves; phase two leans on the spikes, pillars, rush and icicles
  // v15 (Connor's note 68, "the boss should take a couple of tries"): phase one is two moves only, the slam (its spikes
  // race along the floor) and the crystal rush, so it can be learned. Phase two adds the third, the ground pillars, and
  // everything comes faster (k 0.62). The icicles are the phase change itself: the roar brings them down on the arena.
  reed: [['slam', 'sweep', 'slam', 'sweep'], ['pillars', 'slam', 'sweep', 'pillars', 'sweep', 'slam']],
  // v16 (Connor's note 75): the same shape for the other three. Phase one is two moves, learned in order; phase two adds
  // the rest and everything comes faster (PHASE2_K), its blows costing 2 hearts (player.js)
  colossus: [['walk', 'slam', 'walk', 'toss'], ['walk', 'slam', 'quake', 'toss', 'walk', 'quake', 'slam']],
  overseer: [['cone', 'punch', 'cone', 'punch'], ['cone', 'fan', 'punch', 'vents', 'fan', 'cone', 'vents', 'punch']],
  captain: [['combo', 'volley', 'combo', 'volley'], ['combo', 'dash', 'leap', 'volley', 'dash', 'combo', 'leap'], ['combo', 'leap', 'combo', 'combo', 'leap']],
};

// An ambush (soldiers only) is remembered per room; a boss by its kind.
export const fightFlag = (room) => (room.def.boss.t === 'ambush' ? 'ambush-' + room.id : 'boss-' + room.def.boss.t);

// --- arena ---------------------------------------------------------------------------
export function updateFight(dt) {
  const room = G.room, def = room.def.boss, p = G.player;
  if (!def || flag(fightFlag(room))) return;
  if (!room.fight) {
    if (p.dead || p.x < def.trigger[0] || p.x > def.trigger[1]) return;
    const skipWaves = def.t === 'captain' && flag('waves-captain');
    room.fight = { phase: def.waves && !skipWaves ? 'waves' : 'boss', wave: -1, timer: 0.8 };
    // every cage wall is as thick as the cage is drawn (120 px), centred where the data puts it,
    // so a shove can never carry anyone through it
    for (const b of def.barriers) { const cx = b[0] + b[2] / 2; room.barriers.push({ x: cx - 60, y: b[1], w: 120, h: b[3], barrier: true }); }
    for (const b of room.barriers) {
      for (const q of [p, ...G.enemies]) if (q.x + q.w / 2 > b.x && q.x - q.w / 2 < b.x + b.w) q.x = q.x < b.x + b.w / 2 && b.x > 0 ? b.x - q.w / 2 - 2 : b.x + b.w + q.w / 2 + 2;
    }
    rebuildCol();
    shake(10); Sound.sfx('barrier'); Sound.sfx('gate-slam', { delay: 0.19 });   /* v15: the slam lands with the cage (a 12-frame drop) */ Sound.rumble(0.5, 0.3, 200);   // v6: the cage slams shut
    Flow.roomMusic();
    if (def.talk && !flag('talk-' + def.talk)) later(0.4, () => Flow.openTalk(def.talk));
    // v11 (note 15): no 'Ambush!' banner; the barriers slam and the soldiers drop in
    if (room.fight.phase !== 'waves') spawnBoss(def);
    return;
  }
  const f = room.fight;
  // soldiers left outside the barriers don't hold the next wave back
  const { lo, hi } = arena();
  if (f.phase !== 'waves' || G.enemies.some((e) => !e.dead && e.x > lo && e.x < hi)) return;
  f.timer -= dt;
  if (f.timer > 0) return;
  f.wave++; f.timer = 1.1;
  if (f.wave < def.waves.length) {
    // v9 (review 9 #10): soldiers drop in from above the screen one after another (0.25 s apart) and land hard,
    // instead of appearing out of the air in a burst
    def.waves[f.wave].forEach((s, i) => later(i * 0.25, () => {
      if (G.room !== room) return;
      const fy = s.y ?? def.y, roof = G.room.col.filter((c) => !c.barrier && c.x < s.x + 40 && c.x + c.w > s.x - 40 && c.y + c.h <= fy - 100).reduce((m, c) => Math.max(m, c.y + c.h), -1e9);
      const e = spawnEnemy(s.t, s.x, Math.max(roof + 210, Math.min(fy - 60, G.cam.y - 40)), { alert: true });
      e.face = sign(p.x - e.x); e.vy = 600; e.onGround = false; e.dropIn = fy;
    }));
    // v11 (note 15): no 'Wave 1 of 2' banner; the drop-in says it
    Sound.sfx('wave-spawn', { delay: 0.15 });
  } else if (def.t === 'ambush') {
    // a soldier fight with no boss at the end: open up and carry on
    f.phase = 'done'; room.barriers.length = 0; rebuildCol(); setFlag(fightFlag(room));
    if (def.opens) setFlag(def.opens);
    // v11 (note 15): no banner when the fight ends; the barriers lift and the wave-clear sting plays
    Sound.sfx('wave-clear'); Sound.sfx('gate-open');   // v6: the cage winches up
    if (def.after && !flag('talk-' + def.after)) later(0.8, () => Flow.openTalk(def.after));
    Flow.roomMusic();
  } else {
    // a breather before the Captain: a bloom to pick up. Dying now won't bring the waves back.
    setFlag('waves-captain'); Sound.sfx('wave-clear');
    G.pickups.push({ t: 'bloom', x: 700, y: def.y - 120, vx: 0, vy: -200, dropped: true, life: 30 });   // on the open floor, clear of the gate
    f.phase = 'boss'; spawnBoss(def);
  }
}

export function spawnBoss(def) {
  const st = STATS[def.t];
  const e = {
    boss: true, kind: def.t, type: def.t, name: NAMES[def.t], x: def.x, y: def.y, w: st.w, h: st.h, vx: 0, vy: 0,
    face: sign(G.player.x - def.x), hp: st.hp, maxHp: st.hp, state: 'intro', t: 0, animT: 0, flash: 0, hurtT: 0,
    dead: false, deadT: 0, cycle: 0, enraged: false, squash: 0, invuln: true, onGround: true, hitT: 0, phase: 1,
    phases: PHASES[def.t] || [], staggerLock: 0, last: null,
  };
  G.enemies.push(e);
  G.boss = { enemy: e, name: e.name };
  // v5: every boss gets a staged entrance that belongs to it (see enterStep). Joon is held,
  // the camera leans in on the boss, nothing else is on screen, and the name card comes after.
  // The second time it plays at 2.5x speed.
  const quick = flag('seen-' + def.t);
  setFlag('seen-' + def.t);
  e.quick = quick;   // v8 (review 8 #9): on a retry the name card is skipped
  e.state = 'enter'; e.et = 0; e.enterSpeed = quick ? 2.5 : 1; e.home = def.x; e.floorY = def.y;
  if (def.t === 'reed') e.rise = 0;
  if (def.t === 'colossus') e.y = def.y - 900;
  if (def.t === 'overseer') { e.x = def.x - e.face * 200; e.doorX = e.x; e.doorK = 0; }
  if (def.t === 'captain') { e.x = Math.min(G.room.w - 160, def.x + 340); e.face = -1; }
  G.bossIntro = { e };
  G.card = null; G.banner = null; if (G.toast && !G.toast.keep) G.toast = null;
  G.zoomTarget = 1.12; G.zoomHold = ENTER[def.t] / e.enterSpeed + 0.3; G.zoomAt = { x: def.x, y: def.y - e.h * 0.5 };
  Sound.sfx('sting'); Sound.rumble(0.6, 0.4, 400);
  return e;
}

// --- entrances (v5) --------------------------------------------------------------------
const ENTER = { reed: 2.7, colossus: 1.9, overseer: 3.0, captain: 2.5 };
const once = (e, k) => (e['_' + k] ? false : (e['_' + k] = true));
function enterStep(e, dt) {
  const t = (e.et += dt * e.enterSpeed), y0 = e.floorY;
  if (e.kind === 'reed') {
    // the pool bulges, the Warden rises out of the water, then shakes the water off
    // v12 (note 39): the frozen floor cracks, then the Rime Warden breaks up through it in a spray of ice
    if (once(e, 'a')) Sound.sfx('ice-crack');
    if (t < 0.8 && Math.random() < 0.6) burst(e.x + rnd(-80, 80), y0 - 4, 1, { color: ['#ffffff', '#d8f2ff'], min: 60, max: 260, angle: -Math.PI / 2, spread: 0.5, life: 0.5, size: 9, shape: 'chunk', grav: 1400 });
    if (t > 0.8 && once(e, 'b')) { Sound.sfx('rime-rise'); shake(8); burst(e.x, y0, 26, { color: ['#ffffff', '#d8f2ff', '#9fd2ee'], rx: 90, min: 160, max: 620, angle: -Math.PI / 2, spread: 0.6, life: 0.8, size: 14, shape: 'chunk', grav: 2000 }); }
    e.rise = clamp((t - 0.8) / 1.1, 0, 1); e.rise = 1 - (1 - e.rise) * (1 - e.rise);
    if (t > 2.0 && once(e, 'c')) { Sound.sfx('rime-cry'); shake(8); Sound.rumble(0.5, 0.4, 300); burst(e.x, e.y - e.h * 0.6, 22, { color: ['#ffffff', '#bfe9f2'], rx: e.w * 0.5, min: 200, max: 560, life: 0.6, size: 9, grav: 1200 }); }
  } else if (e.kind === 'colossus') {
    // it drops in from above the frame and lands like a rockfall, then roars
    if (e.y < y0) {
      e.y = Math.min(y0, e.y + 2400 * dt * e.enterSpeed);
      if (e.y >= y0) {
        e.landT = t; shake(18); hitstop(0.08); Sound.rumble(1, 0.8, 400);
        Sound.sfx('boulder-impact', { rate: 0.7 }); Sound.sfx('land-hard', { rate: 0.6 });
        addFx('dust', e.x, y0 + 8, { dur: 0.6, size: 620, anchor: 'bottom' });
        burst(e.x, y0, 22, { color: [G.room.pal.top, G.room.pal.fill, '#e9dcc0'], rx: 120, min: 160, max: 640, angle: -Math.PI / 2, spread: 1.2, life: 0.8, size: 18, sizeMin: 6, shape: 'chunk', grav: 2200 });
      }
    } else if (t > (e.landT || 0) + 0.4 && once(e, 'roar')) { Sound.sfx('colossus-roar'); shake(10); Sound.rumble(0.7, 0.6, 500); }
  } else if (e.kind === 'overseer') {
    // the furnace door behind it slides open, it walks out three steps and vents once
    if (once(e, 'a')) Sound.sfx('furnace-door', { x: e.x });   // v8: a heavy iron furnace door, not the generic slide
    e.doorK = clamp(t / 0.7, 0, 1);
    if (t > 0.7 && t < 1.9) { const k = (t - 0.7) / 1.2; e.x = e.doorX + (e.home - e.doorX) * k; e.vx = 1; if (once(e, 'step1') || (t > 1.1 && once(e, 'step2')) || (t > 1.5 && once(e, 'step3'))) { shake(3); Sound.sfx('thud-wall', { rate: 0.6, vol: 0.5 }); } }
    else { e.vx = 0; if (t >= 1.9) e.x = e.home; }
    if (t > 1.95 && once(e, 'vent')) { Sound.sfx('overseer-vent'); for (const d of [-1, 1]) addFx('steam', e.x + d * 60, e.y - e.h * 0.8, { dur: 0.9, size: 260, face: d }); }
    if (t > 2.5 && once(e, 'roar')) { Sound.sfx('overseer-roar'); shake(8); }
  } else if (e.kind === 'captain') {
    // he walks in from the gate, stops, and his lantern flares
    if (t < 1.5) { const k = t / 1.5; e.x = e.home + 340 * (1 - k); e.vx = -260; if (Math.floor(t * 2.6) !== Math.floor((t - dt * e.enterSpeed) * 2.6)) Sound.sfx('soldier-step', { rate: 0.85, vol: 1.4 }); }
    else { e.x = e.home; e.vx = 0; }
    if (t > 1.6 && once(e, 'flare')) { e.flareT = 0.6; Sound.sfx('fire-blast', { rate: 1.2, vol: 0.7 }); Sound.sfx('captain-intro', { delay: 0.15 }); shake(6); }
  }
  if (e.flareT > 0) e.flareT -= dt;
  if (t >= ENTER[e.kind]) finishEntrance(e);
}
function finishEntrance(e) {
  G.bossIntro = null; e.y = e.floorY; e.x = e.home; e.rise = 1; e.vx = 0;
  go(e, 'intro');
  const card = () => { e.carded = true; G.bossCard = { name: e.name, sub: SUBS[e.kind], t: 0 }; G.card = null; G.banner = null; Sound.sfx('boss-card'); };
  // the card shows once: after the entrance, and after the Captain's words
  if (e.kind === 'captain' && !flag('talk-captain')) Flow.openTalk('captain', card); else if (e.quick) e.carded = true; else card();
}

// Damage modifier (called from hitEnemy). o.slam = an Earth Slam landing.
// v4 caps on top: at most 20% of max health inside one stagger or vent window, a phase
// line is never crossed in one blow (the blow stops on the line and the phase change plays),
// and a phase has to show two full attack cycles before its line can be reached.
function bossWisps(e, n) {
  for (let i = 0; i < n; i++) G.pickups.push({ t: 'wisp', x: e.x, y: e.y - e.h * 0.5, vx: rnd(-260, 260), vy: rnd(-560, -300), dropped: true, life: 9, homeT: 0.35 + i * 0.1 });
}
export function bossHit(e, dmg, o = {}) {
  let d = bossDamage(e, dmg, o);
  if (e.state === 'stagger' || e.state === 'vent') {
    e.windowDmg = (e.windowDmg || 0);
    d = Math.max(0, Math.min(d, e.maxHp * 0.2 - e.windowDmg));
    e.windowDmg += d;
    if (d <= 0 && !e.capHint) { e.capHint = true; }
  }
  const th = e.phases[e.phase - 1];
  if (th != null) {
    const line = e.maxHp * th, list = PHASE_CYCLE[e.kind][Math.min(e.phase, PHASE_CYCLE[e.kind].length) - 1];
    // v16 (note 75): the Warden shows two cycles before his line; the others, whose phase lists are longer, one
    const need = list.length * (e.kind === 'reed' ? 2 : 1);
    const floor = e.cycle < need ? line + 0.5 : line;
    if (e.hp - d < floor) d = Math.max(e.hp > floor ? e.hp - floor : 0, e.cycle < need ? 0 : e.hp - line);
  }
  if (d > 0) {
    e.hurtA = 0.3;
    // v11 (review 11 #6): Breath still comes only from fighting, but a boss sheds it: every third landed blow drops a wisp
    e.landed = (e.landed || 0) + 1;
    if (e.landed % 3 === 0) bossWisps(e, 1);
    // v11 (review 11 #8): bosses react: a 6 px shove along the blow every hit, and a real flinch every 10th
    e.shove = Math.sign(e.x - (o.fromX ?? G.player.x)) * 6;
    if (e.landed % 10 === 0) { e.flinchT = 0.28; Sound.sfx('boss-flinch', { x: e.x }); }
  }
  return d;
}
function bossDamage(e, dmg, o) {
  if (e.kind === 'colossus') {
    if (o.slam && e.state !== 'stagger' && e.staggerLock <= 0) {
      go(e, 'stagger'); e.vx = 0; e.staggerDur = 1.5; e.staggerLock = e.phase >= 2 ? 9 : 7; bossWisps(e, 3);   // v11: a stagger sheds three wisps
      Sound.sfx('colossus-stagger');   // v9 (review 9 sound 2): its own crack and lurch, not the roar sped up
      shake(22); hitstop(0.12); impact(e.x, e.y - e.h * 0.5, { force: true });   // v11 (note 15): no 'Staggered!' word
      return dmg * 1.5;
    }
    if (e.state === 'stagger') return dmg * 1.5;
    if (o.slam) return dmg;                       // still recovering its guard: full damage, no stagger
    // stone hide: glancing blows
    burst(e.x, e.y - e.h * 0.6, 6, { color: ['#e6cc94', '#9c7c4d'], min: 120, max: 360, life: 0.3, size: 8, shape: 'chunk', grav: 1400 });
    if (e.hp > dmg * 0.45) { burst(e.x + rnd(-60, 60), e.y - e.h * rnd(0.3, 0.7), 6, { color: ['#fff3c4', '#d8c8a8'], min: 80, max: 260, life: 0.25, size: 7 }); Sound.sfx('clank', { x: e.x, rate: 0.7, vol: 0.5, gap: 0.15 }); }   // v11 (note 15): the hide sparks and clanks instead of a banner   // v6: not on the killing blow
    return dmg * 0.45;   // v5: was 0.25 (the fight ran two minutes)
  }
  if (e.kind === 'overseer') return e.state === 'vent' ? dmg * 2 : dmg * 0.8;   // v5: was 0.6
  return e.state === 'stun' || e.state === 'stagger' ? dmg * 1.5 : dmg;
}

export function bossDefeated(e) {
  const room = G.room, s = G.save, p = G.player;
  for (const sh of G.shots) if (sh.from === 'enemy') sh.life = 0;
  G.hurts.length = 0;
  setFlag('boss-' + e.kind);
  room.hazards = room.hazards.filter((h) => !h.arena);   // the river settles
  // v5: the final blow plays 0.5 s at quarter speed with the camera pushed in and the music cut
  hitstop(0.18); shake(24); impact(e.x, e.y - e.h * 0.5, { force: true, dur: 80 }); G.slowT = 0.5; G.slowK = 0.25; Sound.duck(0, 0.25);
  Sound.sfx(e.kind === 'colossus' ? 'colossus-roar' : e.kind === 'reed' ? 'rime-cry' : e.kind === 'overseer' ? 'overseer-roar' : 'soldier-defeat', { rate: 0.8 });
  Sound.sfx('boss-defeat'); Sound.rumble(1, 1, 500);
  G.zoomTarget = 1.18; G.zoomHold = 2.4; G.zoomAt = { x: e.x, y: e.y - e.h * 0.5 };
  G.boss.defeated = true;
  G.bossQuietUntil = G.time + (e.kind === 'captain' ? 3.2 : 4.6);   // v8 (review 8 #9): no door prompt over the defeat, the breath or the lesson
  burst(e.x, e.y - e.h / 2, 40, { color: ['#ffffff', room.reg.color, '#ffd36b'], min: 120, max: 700, life: 0.9, size: 18 });
  // v9 (review 9 #2): part them before the talk: Joon slides out to the side with room over 0.3 s and faces the guardian
  if (e.kind === 'captain' || e.kind === 'overseer') {
    const need = e.kind === 'captain' ? 130 : bodyHalf(e) + 6;
    if (Math.abs(p.x - e.x) < need) {
      let d = Math.sign(p.x - e.x) || -e.face; const { lo, hi } = arena();
      const room2 = (dd) => { const x = e.x + dd * need; return x < hi - 60 && x > lo + 60 && rectFree({ x: x - p.w / 2, y: p.y - p.h + 4, w: p.w, h: p.h - 8 }, true) && rectFree({ x: Math.min(x, p.x) - p.w / 2, y: p.y - p.h + 4, w: Math.abs(x - p.x) + p.w, h: p.h - 8 }, true); };
      if (!room2(d)) d = -d;
      G.talkSlide = { from: p.x, to: e.x + d * need, t: -0.05, dur: 0.3 }; p.face = -d;
    }
  }
  if (e.kind === 'reed') s.abil.doubleJump = true;
  if (e.kind === 'overseer') s.abil.glide = true;
  if (e.kind === 'colossus') { s.maxHp += 1; s.abil.grip = true; }
  if (e.kind === 'captain') s.won = true;
  if (e.kind !== 'captain') s.marks = (s.marks || 0) + 2;
  p.hp = s.maxHp;
  persist();
  // v7 (review 7 #4): 0.6 s after the collapse ends, Joon drops his guard and breathes out (see updatePlayer)
  later(DEFEAT_DUR + 0.6, () => { if (G.room === room && !p.dead) { p.victoryWant = true; if (Math.abs(e.x - p.x) > 20) p.face = Math.sign(e.x - p.x); } });
  later(e.kind === 'captain' ? 2.6 : 3.2, () => {   // v6: the Captain holds his kneel 0.8 s longer before the words
    if (G.room !== room) return;
    Sound.duck(1, 1.5);
    room.barriers.length = 0; rebuildCol(); Sound.sfx('gate-open', { vol: 0.8 });
    room.fight.phase = 'done'; G.boss = null;
    if (e.kind === 'captain') Sound.sfx('brass-gate-open');
    Flow.roomMusic();
    if (e.kind === 'captain') {
      // Elder Sora-Lin climbs the last stair and walks in from the left to stand with Joon (v7: she arrives, she doesn't fade in).
      // Her mark is on the far side of Joon from the kneeling Captain.
      const side = e.x > p.x ? -1 : 1, mark = clamp(p.x + side * 300, 160, room.w - 160);
      const from = side < 0 ? G.cam.x - 140 : G.cam.x + 1920 + 140;
      G.npc = { x: from, y: room.def.boss.y, face: -side, animT: 0, walkTo: mark, walkSpeed: 250, def: { talks: [[null, 'ending']] },
        onArrive: () => later(0.35, () => { Flow.faceSpeaker(G.npc); Flow.openTalk('ending', () => Flow.openCutscene('sunrise', () => Flow.startEnding())); }) };
    }
    else later(1.2, () => {   // v7: after the victory breath. v10 (note 11): a small attunement and its card first
      const id = e.kind === 'reed' ? 'doublejump' : e.kind === 'overseer' ? 'glide' : 'heart';
      startAttune({ power: id, then: () => Flow.openLesson(id, () => {
        const marks = () => toast('Two Spirit Marks', '', 2.6);
        if (e.kind === 'overseer') Flow.openCutscene('windroad', marks); else marks();
      }) });
    });
  });
}

const PHASE_TINT = { reed: 'rgba(150,215,225,0.7)', colossus: 'rgba(230,204,148,0.7)', overseer: 'rgba(255,150,70,0.7)', captain: 'rgba(255,190,90,0.7)' };
// The Colossus at half health: two blocks of rubble fall and stay, steps up to its head.
function dropRubble(e) {
  const room = G.room, { lo, hi } = arena(), y = room.def.boss.y;
  for (const [i, x] of [[0, lo + 330], [1, hi - 450]].map(([i, x]) => [i, x])) {
    later(0.5 + i * 0.35, () => {
      if (G.room !== room) return;
      const blk = { x, y: y - 120, w: 120, h: 120, rubble: true, t: 'rock' };
      const p = G.player;
      if (p.x + p.w / 2 > x && p.x - p.w / 2 < x + 120) p.x = p.x < x + 60 ? x - p.w / 2 - 4 : x + 120 + p.w / 2 + 4;
      room.solids.push(blk); rebuildCol();
      shake(12); Sound.sfx('boulder-impact'); Sound.sfx('stone-crumble', { vol: 0.6 });
      addFx('dust', x + 60, y + 8, { dur: 0.5, size: 340, anchor: 'bottom' });
      burst(x + 60, y - 60, 14, { color: [room.pal.top, room.pal.fill, '#e9dcc0'], rx: 50, min: 120, max: 420, angle: -Math.PI / 2, spread: 1.2, life: 0.6, size: 14, sizeMin: 6, shape: 'chunk', grav: 2000 });
    });
  }
  // v10 (note 15): the fallen rubble shows the way up by itself
}

// --- brains --------------------------------------------------------------------------
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
function go(e, state) { e.state = state; e.t = 0; e.windowDmg = 0; }
// The first loop of a phase plays in order (so it can be learned); after that the
// order is shuffled, never the same attack twice in a row.
function startAttack(e) {
  const list = PHASE_CYCLE[e.kind][Math.min(e.phase, PHASE_CYCLE[e.kind].length) - 1];
  let a;
  if (e.cycle < list.length) a = list[e.cycle];
  else { const opts = list.filter((x) => x !== e.last); a = opts[(Math.random() * opts.length) | 0]; }
  e.cycle++; e.last = a;
  e.face = sign(G.player.x - e.x); e.hits = 0; e.fired = 0;
  go(e, a + '_wind');
  windSound(e, a);
}
// v6: every wind-up is heard as well as seen (review 6 silent events)
const WIND_SFX = {
  reed: { slam: ['warden-cast-ground', 1], pillars: ['warden-cast-ground', 1.12], sweep: ['warden-cast-rush', 1], icicles: ['warden-cast-sky', 1], wave: ['boss-windup-heavy', 0.75] },   // v15: the cast tells' own sounds
  colossus: { slam: ['boss-windup-heavy', 0.85], toss: ['boss-windup-heavy', 1.1], quake: ['quake-warning', 1] },
  overseer: { cone: ['boss-windup-fire', 1], punch: ['boss-windup-heavy', 1.25], vents: ['boss-windup-fire', 0.85], fan: ['boss-windup-fire', 1.15] },
  captain: { combo: ['boss-windup-blade', 1], volley: ['boss-windup-fire', 1.2], dash: ['boss-windup-fire', 0.9], leap: ['boss-windup-blade', 0.8] },
};
function windSound(e, a) { const w = WIND_SFX[e.kind] && WIND_SFX[e.kind][a]; if (w) Sound.sfx(w[0], { rate: w[1] }); }
// footsteps keyed to the walk cycle (two plants per 8-frame loop)
function stepSound(e, fps, name, o = {}) {
  const a = Math.floor(e.animT * fps), b = Math.floor((e.animT - 1 / 60) * fps);
  if (a !== b && (a % 8 === 1 || a % 8 === 5)) { Sound.sfx(name, { pitch: 0.08, ...o }); return true; }
  return false;
}
function rest(e, dur) { e.recDur = dur; go(e, 'rec'); }
function crush(pl) { pl.t = pl.life; }
function shock(e, half, color) {
  G.hurts.push({ x: e.x - half, y: e.y - 70, w: half * 2, h: 70, t: 0.22, delay: 0, dmg: 1, kind: 'shock', color, fromX: e.x });   // v16 (note 75): every guardian blow is 1 in phase one; phase two doubles it (player.js)
  shake(14);
  addFx('dust', e.x, e.y + 8, { dur: 0.45, size: half * 2.2, anchor: 'bottom' });
  burst(e.x, e.y, 14, { color: [G.room.pal.top, '#ffffff'], rx: half * 0.6, min: 100, max: 420, angle: -Math.PI / 2, spread: 1.2, life: 0.5, size: 14 });
}
function leapAt(e, p, hang = 0.84) {
  e.vy = -(PHYS.gravity * hang) / 2; e.vx = clamp((p.x - e.x) / hang, -950, 950); e.onGround = false;
}
function fireAt(e, p, speed, spreadAng = 0, o = {}) {
  const sx = e.x + e.face * e.w * 0.45, sy = e.y - e.h * 0.62;
  const ang = Math.atan2((p.y - 80) - sy, p.x - sx) + spreadAng;
  spawnShot({ kind: 'fireball', x: sx, y: sy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 22, dmg: 1, life: 3.4, ...o });
}
// The Overseer's floor grates (drawn in the room, see drawGrates): where the vents fire.
const gratesX = (i, n, lo, hi) => lo + (hi - lo) / n * (i + 0.5);
// Drawn as the kiln kit's painted bed of coals let into the floor: dull until a vent is
// about to fire there, then glowing.
let Kits = null;
import('./kits.js').then((m) => { Kits = m.Kits; });
function drawGrates(ctx, e) {
  const pc = Kits && Kits.ready && Kits.piece(['kiln', 'coals']);
  const { lo, hi } = arena(), n = 6, y = G.room.def.boss.y;
  for (let i = 0; i < n; i++) {
    const x = gratesX(i, n, lo, hi);
    const h = G.hurts.find((q) => q.vent && Math.abs(q.fromX - x) < 5), heat = h ? (h.delay > 0 ? 0.6 + 0.4 * Math.sin(G.time * 24) : 1) : 0;
    ctx.save();
    if (pc) {
      const s = 150 / pc.w;
      ctx.globalAlpha = 0.45 + 0.55 * heat;
      ctx.drawImage(pc.img, pc.x, pc.y, pc.w, pc.h, x - 75, y - pc.h * s * 0.45, 150, pc.h * s);
    }
    if (heat) { const g = ctx.createRadialGradient(x, y, 4, x, y, 110); g.addColorStop(0, `rgba(255,150,60,${0.5 * heat})`); g.addColorStop(1, 'rgba(255,150,60,0)'); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(x - 110, y - 110, 220, 120); }
    ctx.restore();
  }
}
const arena = () => {
  const b = G.room.barriers;
  const lo = b.length ? Math.min(...b.map((q) => q.x + q.w)) : 40, hi = b.length >= 2 ? Math.max(...b.map((q) => q.x)) : G.room.w - 40;
  return { lo: Math.min(lo, hi - 400), hi };
};
const groundWave = (e, d, o) => spawnShot({ kind: o.kind || 'wave', wave: true, x: e.x + d * (e.w * 0.5 + 30), y: e.y, w: o.w || 110, h: o.h || 105, vx: d * (o.speed || 640), vy: 0, dmg: 1, life: o.life || 3.2 });

const BRAIN = {
  // v12 (Connor's note 39): the Rime Warden. Every attack is big and clear: a two-handed slam that sends a line of ice
  // spikes racing along the floor (jump them), three ice pillars that burst up where Joon stands and stay as cover and
  // footholds for a moment (move off the frost marks), a sweeping push of freezing wind (dash through it or get off the
  // floor), icicles falling with shadows showing where, and in phase two a frozen wave that crashes forward (jump it from
  // a ledge, or block it with an ice wall). Its opening is after the slam and after the wave: it stays bent over.
  reed(e, dt, p, dx, k) {
    switch (e.state) {
      case 'idle':
        e.face = sign(dx);
        e.vx = approach(e.vx, Math.abs(dx) > 420 ? e.face * 150 : Math.abs(dx) < 160 ? -e.face * 90 : 0, 700 * dt);
        if (Math.abs(e.vx) > 40 && stepSound(e, 5, 'boss-step-heavy', { rate: 0.9, vol: 0.8 })) shake(2);
        if (e.t > 0.75 * k) startAttack(e);
        break;
      case 'slam_wind':   // windup frames 0-3: both fists rise, frost gathers under it
        e.vx = approach(e.vx, 0, 2000 * dt); e.windDur = 0.8 * k;
        if (Math.random() < 0.5) burst(e.x + rnd(-120, 120), e.y - 4, 1, { color: ['#ffffff', '#d8f2ff'], min: 30, max: 140, angle: -Math.PI / 2, spread: 0.6, life: 0.5, size: 8, grav: -100 });
        if (e.t > e.windDur) {
          shock(e, 210, '#d8f2ff'); hitstop(0.05); Sound.sfx('rime-slam'); Sound.rumble(0.8, 0.5, 300);
          const spikes = (d, delay) => later(delay, () => { if (!e.dead) { groundWave(e, d, { kind: 'icespikes', w: 110, h: 95, speed: e.enraged ? 760 : 660 })   /* drawn 1.3x taller than it bites: a clean jump clears it */; Sound.sfx('ice-spike-wave', { x: e.x + d * 200, gap: 0.05 }); } });
          spikes(e.face, 0.05);
          if (e.enraged) spikes(-e.face, 0.35);
          // v15 (note 68): in phase two the slam has a follow-up: a frost crack opens where Joon will come down from
          // jumping the spikes and a pillar bursts up there 0.8 s later (its own tell, so a reader steps on through it)
          if (e.enraged) {
            const { lo, hi } = arena(), x = clamp(p.x + (p.vx || 0) * 0.35 + sign(e.x - p.x) * 60, lo + 80, hi - 80);
            Sound.sfx('ice-crack', { x, rate: 0.7, vol: 0.5, delay: 0.15, gap: 0.03 });
            G.hurts.push({ x: x - 64, y: e.y - 360, w: 128, h: 360, t: 0.45, delay: 0.8, tell0: 0.8, dmg: 1, kind: 'icepillar', fromX: x,
              onStart: () => { shake(6); Sound.sfx('ice-reform', { x, vol: 0.85, gap: 0.05 }); burst(x, e.y - 20, 10, { color: ['#ffffff', '#d8f2ff', '#9fd2ee'], rx: 50, min: 160, max: 520, angle: -Math.PI / 2, spread: 0.5, life: 0.6, size: 11, shape: 'chunk', grav: 1800 }); } });
          }
          go(e, 'slam');
        }
        break;
      case 'slam':
        if (e.t > 0.4) rest(e, 1.2);   // the opening: it stays bent over its fists
        break;
      case 'pillars_wind': {   // the three pillars: frost marks spread on the floor, then the ice bursts up
        e.vx = approach(e.vx, 0, 2000 * dt); e.windDur = 0.45 * k;
        if (e.t > e.windDur) {
          // the first rises under Joon, the others either side of him; none right against the Warden's own body, so a
          // player pinned against it is never trapped (he gets out by stepping past it or jumping)
          const { lo, hi } = arena(), away = (x) => (Math.abs(x - e.x) < 230 ? e.x + (sign(x - e.x) || 1) * 230 : x);
          const xs = [clamp(away(p.x), lo + 80, hi - 80)];
          for (const o of [-1, 1]) xs.push(clamp(away(p.x + o * (300 + rnd(0, 80))), lo + 80, hi - 80));
          // v15 (note 68): phase two calls five, closer together, faster
          if (e.enraged) for (const o of [-1, 1]) xs.push(clamp(away(p.x + o * (560 + rnd(0, 80))), lo + 80, hi - 80));
          // v14 (Connor's note 64): they always rise in a fixed readable order, left, then middle, then right
          xs.sort((a, b) => a - b);
          // v14 (note 52): each pillar's tell starts with a frost crackle and a low rumble; the timing of the hit is unchanged
          xs.forEach((x, i) => { Sound.sfx('frost-crack', { x, delay: i * 0.14, gap: 0.03 }); if (i === 0) { Sound.rumble(0.35, 0.25, 600); shake(2); } });
          const pd = e.enraged ? 0.7 : 0.85, pg = e.enraged ? 0.11 : 0.14;
          xs.forEach((x, i) => G.hurts.push({ x: x - 64, y: e.y - 360, w: 128, h: 360, t: 0.5, delay: pd + i * pg, tell0: pd + i * pg, dmg: 1, kind: 'icepillar', fromX: x,
            onStart: () => { shake(6); Sound.sfx('ice-reform', { x, vol: 0.9, gap: 0.05 }); Sound.sfx('ice-crack', { x, vol: 0.6, gap: 0.05 }); burst(x, e.y - 20, 12, { color: ['#ffffff', '#d8f2ff', '#9fd2ee'], rx: 50, min: 160, max: 520, angle: -Math.PI / 2, spread: 0.5, life: 0.6, size: 11, shape: 'chunk', grav: 1800 }); } }));
          Sound.sfx('rime-cry', { rate: 1.15, vol: 0.5 });
          go(e, 'pillars');
        }
        break; }
      case 'pillars':
        if (e.t > 1.3) rest(e, 0.7);
        break;
      case 'sweep_wind':   // windup frames 4-7: it sinks low and draws both arms back
        e.vx = approach(e.vx, 0, 2000 * dt); e.windDur = 0.6 * k;
        if (e.t > e.windDur) {
          // a wall of freezing wind and ice crystals rolls out along the floor: low enough to jump, wide enough to need it
          spawnShot({ kind: 'frostsweep', wave: true, x: e.x + e.face * 120, y: e.y, w: 150, h: 105, vx: e.face * (e.enraged ? 980 : 860), vy: 0, dmg: 1, life: 1.4, push: e.face * 900 });
          Sound.sfx('crystal-rush'); shake(6);
          // v15 (note 68): phase two throws a second rush 0.62 s behind the first (inside a dash's cooldown: dash one, jump
          // the other), his arms still out on the throw
          if (e.enraged) later(0.62, () => { if (!e.dead && (e.state === 'sweep' || e.state === 'rec')) { spawnShot({ kind: 'frostsweep', wave: true, x: e.x + e.face * 120, y: e.y, w: 150, h: 105, vx: e.face * 980, vy: 0, dmg: 1, life: 1.4, push: e.face * 900 }); Sound.sfx('rime-sweep', { rate: 1.1, vol: 0.85 }); shake(4); } });
          go(e, 'sweep');
        }
        break;
      case 'sweep':
        if (e.t > (e.enraged ? 0.75 : 0.5)) rest(e, 0.6);
        break;
      case 'icicles_wind': {   // it looks up and roars: icicles crack loose over the arena, their shadows grow where they will land
        e.vx = approach(e.vx, 0, 2000 * dt); e.windDur = 0.5;
        if (e.t > e.windDur) {
          const { lo, hi } = arena(), n = e.enraged ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const x = clamp(p.x + (i - (n - 1) / 2) * 230 + rnd(-40, 40), lo + 50, hi - 50), delay = 0.7 + i * 0.12;
            later(delay - 0.55, () => Sound.sfx('icicle-warn', { x, vol: 0.5, gap: 0.08 }));
            later(delay, () => { if (!e.dead) spawnShot({ kind: 'icicle', x, y: G.cam.y - 60, vx: 0, vy: 700, grav: 1700, r: 26, dmg: 1, life: 2.5, shadow: { x, y: e.y }, onLand: 'icicle-fall' }); });
          }
          Sound.sfx('rime-cry', { rate: 1.3, vol: 0.55 }); go(e, 'icicles');
        }
        break; }
      case 'icicles':
        if (e.t > 1.6) rest(e, 0.6);
        break;
      case 'wave_wind':   // phase two: it raises both arms, water swells behind it
        e.vx = approach(e.vx, 0, 2000 * dt); e.windDur = 0.9;
        if (e.t > e.windDur) {
          spawnShot({ kind: 'frozenwave', wave: true, x: e.x + e.face * 140, y: e.y, w: 200, h: 230, vx: e.face * 520, vy: 0, dmg: 2, life: 3.2 });
          Sound.sfx('frozen-wave'); shake(12); Sound.rumble(0.7, 0.5, 400);
          go(e, 'wave');
        }
        break;
      case 'wave':
        if (e.t > 0.5) rest(e, 1.4);   // the long opening after its biggest blow
        break;
      // old saves can arrive mid-cycle with the Reed Warden's moves: treat them as a rest
      default: rest(e, 0.5);
    }
  },

  colossus(e, dt, p, dx, k) {
    switch (e.state) {
      case 'idle':
        e.face = sign(dx); e.vx = approach(e.vx, 0, 2000 * dt);
        if (e.t > 0.6 * k) startAttack(e);
        break;
      case 'walk_wind': go(e, 'walk'); break;
      case 'walk':
        e.face = sign(dx);
        { const { lo, hi } = arena(), cornered = Math.min(p.x - lo, hi - p.x) < 200;
          // with you in a corner it steps back to give the fight room
          const want = cornered && Math.abs(dx) < 320 ? -e.face * 160 : Math.abs(dx) > 220 ? e.face * (e.enraged ? 230 : 180) : 0;
          e.vx = approach(e.vx, want, 900 * dt); }
        if (e.onGround && Math.abs(e.vx) > 20 && stepSound(e, 6, 'boss-step-heavy', { rate: 0.8 })) shake(3);
        if (e.t > 1.6 || (Math.abs(dx) < 240 && e.t > 0.6)) { startAttack(e); }
        break;
      case 'slam_wind':   // fists up, ground glowing under it
        e.vx = approach(e.vx, 0, 2400 * dt); e.windDur = 1.0 * k;
        if (e.t > e.windDur) {
          shock(e, 230, '#e6cc94');
          const w = { kind: 'rockwave', w: 120, h: 90, speed: e.enraged ? 700 : 600 };
          groundWave(e, 1, w); groundWave(e, -1, w);
          if (e.phase >= 2) later(0.5, () => { if (!e.dead) { groundWave(e, 1, w); groundWave(e, -1, w); shake(10); Sound.sfx('earth-slam', { rate: 0.8, vol: 0.7 }); } });
          Sound.sfx('earth-slam', { rate: 0.7 }); hitstop(0.05); Sound.rumble(0.7, 0.4, 250);
          go(e, 'slam');
        }
        break;
      case 'slam':
        if (e.t > 0.5) rest(e, 1.2);
        break;
      case 'toss_wind':
        e.vx = approach(e.vx, 0, 2000 * dt); e.windDur = 0.7 * k;
        if (e.t > e.windDur) {
          const n = e.enraged ? 3 : 2;
          for (let i = 0; i < n; i++) spawnShot({ kind: 'boulder', x: e.x + e.face * 70, y: e.y - 280, vx: e.face * (330 + i * 240), vy: -760, grav: 2200, r: 36, dmg: 1, bounce: 2, life: 5 });
          Sound.sfx('boulder-throw');
          go(e, 'toss');
        }
        break;
      case 'toss':
        if (e.t > 0.4) rest(e, 0.9);
        break;
      case 'quake_wind':   // beats its chest: rocks shake loose from above
        e.vx = approach(e.vx, 0, 2400 * dt); e.windDur = 0.8 * k;
        if (Math.floor(e.t * 6) !== Math.floor((e.t - dt) * 6)) shake(4);
        if (e.t > e.windDur) {
          const { lo, hi } = arena();
          for (let i = 0; i < 5; i++) {
            const x = clamp(p.x + (i - 2) * 260 + rnd(-60, 60), lo + 60, hi - 60);
            G.hurts.push({ x: x - 50, y: e.y - 30, w: 100, h: 30, t: 0.01, delay: 0.55 + i * 0.12, dmg: 0, kind: 'mark' });
            later(0.5 + i * 0.12, () => spawnShot({ kind: 'boulder', x, y: G.cam.y - 60, vx: 0, vy: 700, grav: 2200, r: 34, dmg: 1, bounce: 0, life: 3, shadow: { x, y: e.y } }));
          }
          Sound.sfx('colossus-roar', { rate: 1.2, vol: 0.6 }); Sound.rumble(0.8, 0.5, 600); go(e, 'toss');
        }
        break;
      case 'stagger':
        e.vx = approach(e.vx, 0, 3000 * dt);
        if (e.t > e.staggerDur) { go(e, 'idle'); Sound.sfx('colossus-roar', { rate: 1.1, vol: 0.6 }); }
        break;
    }
  },

  overseer(e, dt, p, dx, k) {
    switch (e.state) {
      case 'idle':
        e.face = sign(dx);
        e.vx = approach(e.vx, Math.abs(dx) > 380 ? e.face * 160 : 0, 800 * dt);
        if (Math.abs(e.vx) > 20 && stepSound(e, 8, 'boss-step-heavy', { vol: 0.8 })) shake(2);
        if (e.t > 0.8 * k) startAttack(e);
        break;
      case 'cone_wind':   // furnace arms glow; it plants its feet
        e.vx = approach(e.vx, 0, 2400 * dt); e.windDur = 0.75 * k;
        if (e.t > e.windDur) { go(e, 'cone'); Sound.sfx('fire-blast', { rate: 0.7 }); }
        break;
      case 'cone': {
        const len = e.enraged ? 560 : 480;
        // from phase two the jet sweeps upward: get under it, don't jump it
        const lift = e.phase >= 2 ? Math.min(1, e.t / 0.9) * 200 : 0;
        if (Math.floor(e.t / 0.12) !== Math.floor((e.t - dt) / 0.12) && e.t < 0.9) {
          G.hurts.push({ x: e.face > 0 ? e.x + 40 : e.x - 40 - len, y: e.y - 230 - lift, w: len, h: 170, t: 0.13, delay: 0, dmg: 1, kind: 'cone', fromX: e.x });   // v16: 1 in phase one; phase two doubles it
          groundFire(e.x + e.face * (40 + len * 0.75), e.y - 20, 150, 2.4);   // v16 (note 75): narrow enough to jump into the vent window   // v10 (note 14): the breath leaves the floor burning, like the Ember Slingers' flasks
        }
        if (Math.random() < 0.9) burst(e.x + e.face * rnd(80, len), e.y - rnd(110, 210), 1, { color: ['#ffd36b', '#f0742a', '#ffffff'], min: 20, max: 120, life: 0.35, size: 16, grav: -200 });
        if (e.t > 1.0) {
          go(e, 'vent'); Sound.sfx('overseer-vent');
          // v11 (note 15): no 'Venting!' word; the vents flare and hiss
          for (const d of [-1, 1]) addFx('steam', e.x + d * 60, e.y - e.h * 0.8, { dur: 0.9, size: 260, face: d });
        }
        break; }
      case 'vent':   // the weak moment
        e.vx = approach(e.vx, 0, 3000 * dt);
        if (Math.random() < 0.6) burst(e.x - e.face * 40, e.y - e.h + 20, 1, { color: ['#f3ecdf', '#cfc6c0'], min: 40, max: 160, angle: -Math.PI / 2, spread: 0.6, life: 0.9, size: 22, grav: -260 });
        if (e.t > (e.enraged ? 1.4 : 1.9)) go(e, 'idle');
        break;
      case 'punch_wind':
        e.vx = approach(e.vx, -e.face * 90, 900 * dt); e.windDur = 0.6 * k;
        if (e.t > e.windDur) { go(e, 'punch'); Sound.sfx('dash', { rate: 0.7 }); }
        break;
      case 'punch':
        e.vx = e.face * (e.enraged ? 1150 : 1000);
        if (Math.random() < 0.6) burst(e.x - e.face * 60, e.y - 60, 1, { color: ['#ffd36b', '#f0742a'], min: 20, max: 140, life: 0.4, size: 12, grav: -200 });
        G.hurts.push({ x: e.face > 0 ? e.x + 20 : e.x - 140, y: e.y - 220, w: 120, h: 160, t: dt * 1.5, delay: 0, dmg: 1, kind: 'melee', fromX: e.x });   // v16 (note 75): 1 in phase one (phase two doubles every blow)
        if (e.t > 0.62 || e.hitX === e.face) { e.vx = 0; if (e.hitX) { shake(12); Sound.sfx('punch-hit', { rate: 0.6 }); } rest(e, 0.9); }
        break;
      case 'vents_wind': {   // stamps: the floor grates blow fire in turn
        e.vx = approach(e.vx, 0, 2000 * dt); e.windDur = 0.5 * k;
        if (e.t > e.windDur) {
          const { lo, hi } = arena(), n = 6, gap = (hi - lo) / n;
          for (let i = 0; i < n; i++) { const x = gratesX(i, n, lo, hi), first = (i % 2) === (Math.random() < 0.5 ? 0 : 1); G.hurts.push({ x: x - 70, y: e.y - 220, w: 140, h: 220, t: 0.6, delay: first ? 0.7 : 1.6, dmg: 1, kind: 'flame', vent: true, fromX: x, onStart: () => Sound.sfx('floor-vent-fire', { gap: 0.1 }) }); }
          Sound.sfx('clank', { rate: 0.6 }); shake(8); go(e, 'fan');
        }
        break; }
      case 'fan_wind':
        e.vx = approach(e.vx, 0, 2000 * dt); e.windDur = 0.55 * k;
        if (e.t > e.windDur) {
          const n = e.enraged ? 5 : 3;
          for (let i = 0; i < n; i++) fireAt(e, p, 620, (i - (n - 1) / 2) * 0.24);
          Sound.sfx('enemy-fireball'); go(e, 'fan');
        }
        break;
      case 'fan':
        if (e.t > (e.state === 'fan' && e.last === 'vents' ? 1.6 : 0.3)) rest(e, 0.8);
        break;
    }
  },

  captain(e, dt, p, dx, k) {
    const ady = Math.abs(p.y - e.y);
    switch (e.state) {
      case 'idle': go(e, 'approach'); break;
      case 'approach':
        e.face = sign(dx);
        if (Math.abs(e.vx) > 30 && e.onGround) stepSound(e, 9, 'boss-step-armor');
        // v6: never pace on a ledge above Joon: after 1.2 s up there he leaps down at him
        if (e.onGround && e.y < p.y - 100) { e.highT = (e.highT || 0) + dt; if (e.highT > 1.2) { e.highT = 0; e.hits = 0; e.last = 'leap'; go(e, 'leap_wind'); windSound(e, 'leap'); break; } } else e.highT = 0;
        e.vx = approach(e.vx, Math.abs(dx) > 150 ? e.face * (e.phase >= 3 ? 400 : e.phase === 2 ? 330 : 260) : 0, 1800 * dt);
        if ((Math.abs(dx) < 185 && ady < 150 && e.t > 0.25) || e.t > 1.3 * k) startAttack(e);
        break;
      case 'combo_wind':
        e.windDur = (e.hits === 0 ? 0.4 : 0.22) * k;
        e.vx = approach(e.vx, 0, 3000 * dt);
        if (e.t > e.windDur) {
          go(e, 'combo_strike'); e.vx = e.face * (e.enraged ? 480 : 380);   // v16: a shorter step in phase one
          G.hurts.push({ x: e.face > 0 ? e.x : e.x - 210, y: e.y - 200, w: 210, h: 190, t: 0.14, delay: 0, dmg: 1, kind: 'melee', fromX: e.x });
          Sound.sfx('captain-slash', { rate: 1 + e.hits * 0.06 });
          burst(e.x + e.face * 110, e.y - 120, 5, { color: ['#ffd36b', '#f0742a'], min: 60, max: 260, life: 0.3, size: 12 });
        }
        break;
      case 'combo_strike':
        e.vx = approach(e.vx, 0, 1700 * dt);
        if (e.t > 0.2) {
          if (++e.hits < 3) { e.face = sign(dx); go(e, 'combo_wind'); } else rest(e, 0.8);
        }
        break;
      case 'volley_wind':
        e.windDur = 0.5 * k; e.vx = approach(e.vx, 0, 3000 * dt);
        if (e.t > e.windDur) go(e, 'volley');
        break;
      case 'volley': {
        const n = e.phase === 2 ? 5 : 3;
        e.face = sign(dx);
        if (e.t >= e.fired * 0.17) { fireAt(e, p, 720, e.phase === 2 ? (e.fired - 2) * 0.09 : 0); e.fired++; Sound.sfx('enemy-fireball'); }
        if (e.fired >= n) rest(e, 0.6);
        break; }
      case 'leap_wind':
        e.windDur = 0.42 * k; e.vx = 0;
        if (e.t > e.windDur) { leapAt(e, p, 0.74); go(e, 'leap'); Sound.sfx('captain-leap'); }
        break;
      case 'leap':
        if (e.onGround && e.t > 0.15) {
          e.vx = 0; shock(e, 170, '#ffb347'); Sound.sfx('captain-land'); Sound.rumble(0.6, 0.4, 200);
          for (const d of [-1, 1]) spawnShot({ kind: 'firewave', wave: true, x: e.x + d * 90, y: e.y, w: 100, h: 115, vx: d * 580, vy: 0, dmg: 1, life: 2.6 });
          rest(e, 0.85);
        }
        break;
      case 'dash_wind': {   // crouches, flames gathering; the dash crosses the whole arena
        e.windDur = 0.6; e.vx = approach(e.vx, 0, 3000 * dt);
        if (Math.random() < 0.7) burst(e.x - e.face * 20, e.y - 20, 1, { color: ['#ffd36b', '#f0742a'], min: 30, max: 160, angle: -Math.PI / 2, spread: 0.8, life: 0.4, size: 12, grav: -100 });
        if (e.t > e.windDur) { const { lo, hi } = arena(); e.target = e.face > 0 ? hi - 90 : lo + 90; go(e, 'dash'); e.dashHit = false; Sound.sfx('captain-dash'); }
        break; }
      case 'dash':
        e.vx = e.face * 1500;
        // v9 (review 9 #1): one blow per dash (Joon's 1.1 s of safety does the rest), and the melee box stops once it lands
        if (!e.dashHit) G.hurts.push({ x: e.x - 60, y: e.y - 200, w: 120, h: 190, t: dt * 1.5, delay: 0, dmg: 1, kind: 'melee', fromX: e.x - e.face * 40, onHit: () => { e.dashHit = true; } });
        // fire left burning on the floor behind it
        if (Math.floor(e.t / 0.06) !== Math.floor((e.t - dt) / 0.06)) G.hurts.push({ x: e.x - 50, y: e.y - 90, w: 100, h: 90, t: 1.4, delay: 0.12, dmg: 1, kind: 'flame', fromX: e.x });
        // v9 (review 9 #1): the dash always ends: past its mark, at a wall, or after 1.3 s (a full crossing takes 1.2 s)
        if ((e.target - e.x) * e.face <= 0 || e.hitX || e.t > 1.3) { e.vx = 0; rest(e, 0.9); Sound.sfx('captain-skid', { x: e.x }); burst(e.x + e.face * 40, e.y - 6, 8, { color: ['#d8c8a8', '#ffd36b'], min: 60, max: 240, angle: -Math.PI / 2 - e.face * 0.6, spread: 0.6, life: 0.35, size: 9, grav: 900 }); }
        break;
    }
  },
};
// v16 (Connor's note 75): each guardian's phase change is a real beat like the Warden's icicles: it roars on its own
// cast sheet for 1.7 s while the arena answers, with every danger marked before it lands.
//   Colossus: the pit shakes, rocks fall in two waves on marked spots (and the rubble steps fall, dropRubble).
//   Overseer: every floor grate blows, left to right, one after another (Every vent opens).
//   Captain: he throws his fire up and it comes down as two fans of fireballs at Joon.
function phaseBeat(e) {
  const room = G.room, { lo, hi } = arena(), y = room.def.boss.y;
  Sound.sfx(e.kind + '-phase', { delay: 0.3 });   // v16: the beat's own sound (rocks loosening, the vents rolling open, the fire thrown up)
  if (e.kind === 'colossus') {
    Sound.rumble(0.9, 0.8, 900);
    for (let i = 0; i < 7; i++) {
      const x = lo + 100 + (hi - lo - 200) * (i + 0.5) / 7 + rnd(-30, 30), delay = 0.6 + (i % 2) * 0.5 + rnd(0, 0.1);
      G.hurts.push({ x: x - 50, y: y - 30, w: 100, h: 30, t: 0.01, delay: delay - 0.05, dmg: 0, kind: 'mark' });
      later(delay - 0.5, () => { if (!e.dead && G.room === room) spawnShot({ kind: 'boulder', x, y: G.cam.y - 60, vx: 0, vy: 700, grav: 2200, r: 30, dmg: 1, bounce: 0, life: 3, shadow: { x, y } }); });
    }
  }
  if (e.kind === 'overseer') {
    const n = 6;
    for (let i = 0; i < n; i++) { const x = gratesX(i, n, lo, hi); G.hurts.push({ x: x - 70, y: y - 220, w: 140, h: 220, t: 0.45, delay: 0.55 + i * 0.16, dmg: 1, kind: 'flame', vent: true, fromX: x, onStart: () => Sound.sfx('floor-vent-fire', { gap: 0.08 }) }); }
    shake(10);
  }
  if (e.kind === 'captain') {
    for (const [d, n] of [[0.7, 5], [1.25, 4]]) later(d, () => { if (e.dead || G.room !== room) return; for (let i = 0; i < n; i++) fireAt(e, G.player, 560, (i - (n - 1) / 2) * 0.3); Sound.sfx('enemy-fireball'); shake(4); });
  }
}
// Between phases: the boss roars, can't be hurt, then comes back with its new moves.
function phaseState(e, dt) {
  e.vx = approach(e.vx, 0, 3000 * dt);
  if (Math.random() < 0.8) burst(e.x + rnd(-80, 80), e.y - rnd(0, e.h), 1, { color: ['#ffffff', G.room.reg.color, '#ffd36b'], min: 40, max: 260, life: 0.6, size: 14, grav: -300 });
  if (e.t > 1.7) { e.invuln = false; go(e, 'idle'); }   // v16: every guardian's phase change is the Warden's 1.7 s beat
}

export function updateBoss(e, dt) {
  const p = G.player;
  e.t += dt; e.animT += dt;
  if (e.hurtA > 0) e.hurtA -= dt;
  if (e.squash > 0 && e.state !== 'leap_wind') e.squash = Math.max(0, e.squash - dt * 1.4);
  if (e.hitT > 0) e.hitT -= dt;
  if (e.dead) { defeatStep(e, dt); bodyBlock(e, p, dt); return; }
  if (e.state === 'enter') { enterStep(e, dt); return; }
  if (e.staggerLock > 0 && e.state !== 'stagger') e.staggerLock -= dt;
  e.enraged = e.phase >= 2;
  const th = e.phases[e.phase - 1];
  if (th != null && e.hp <= e.maxHp * th && e.state !== 'phase' && e.state !== 'stagger') {
    e.phase++; e.invuln = true; e.cycle = 0; e.last = null; G.hurts = G.hurts.filter((h) => h.kind === 'flame' && !h.delay); go(e, 'phase');
    // v5: every phase change gets the same beat: a 0.3 s freeze, the roar, a ring in the boss's colour, a line on the boss bar
    // v10 (review 10 #5, #9): a shorter freeze (0.18 s), the element's own burst drawn behind the fighters at 1.4x the
    // boss's height for 0.45 s (no more pale ring over everyone), and a phase sound per element
    const EL = { reed: 'water', colossus: 'earth', overseer: 'fire', captain: 'brass' }[e.kind] || 'brass';
    shake(16); hitstop(0.18); impact(e.x, e.y - e.h * 0.5, { force: true }); Sound.sfx('phase-' + EL); Sound.rumble(0.7, 0.5, 300);
    G.zoomTarget = 1.08; G.zoomHold = 0.8; G.zoomAt = { x: e.x, y: e.y - e.h * 0.5 };
    // v15 (note 68, the "weird PNG square"): the phase-burst strips are retired; even cleaned, their cells read as a
    // square over the boss. The burst is now the attune ring (a clean ring of light on the floor) spreading out from the
    // guardian's feet in its colour, under the impact frame above
    addFx('phaseattune', e.x, e.y + 4, { dur: 0.9, size: Math.max(520, e.h * 2.6), behind: true }).tint = PHASE_TINT[e.kind];
    const lines = { reed: ['The cold deepens', 'The sluice freezes'], colossus: ['The hill wakes', 'The pit gives way'], overseer: ['The furnace roars', 'Every vent opens'], captain: ['The Captain burns brighter', 'Kesh!'] };
    G.boss.line = { text: lines[e.kind][e.phase - 2] || 'It changes', sub: '', t: 0 };   // v11 (note 15): no 'Phase two' caption; the burst says it
    if (e.kind === 'colossus' && e.phase === 2) dropRubble(e);
    if (e.kind === 'reed') {
      // v12 (note 39): phase two: it roars and the whole arena frosts over; the ice ledges melt faster from now on
      Sound.sfx('rime-cry', { rate: 0.9 }); Sound.sfx('warden-cast-sky', { delay: 0.25, vol: 0.8 });   // v15: the roar up that brings the icicles down
      const room = G.room, y = room.def.boss.y, { lo, hi } = arena();
      room.frost = 1; G.meltK = 0.7;
      // v15 (note 68): a real beat. He roars on the cast-sky sheet for 1.6 s (invulnerable, phaseState), the arena
      // answers: icicles crack loose across the whole floor, falling in two waves with their shadows, and the slabs melt
      for (let i = 0; i < 9; i++) {
        const x = lo + 80 + (hi - lo - 160) * (i + 0.5) / 9 + rnd(-30, 30), delay = 0.55 + (i % 2) * 0.45 + rnd(0, 0.12);
        later(delay - 0.5, () => Sound.sfx('icicle-warn', { x, vol: 0.4, gap: 0.08 }));
        later(delay, () => { if (!e.dead && G.room === room) spawnShot({ kind: 'icicle', x, y: G.cam.y - 60, vx: 0, vy: 700, grav: 1700, r: 26, dmg: 1, life: 2.5, shadow: { x, y }, onLand: 'icicle-fall' }); });
      }
      Sound.sfx('ice-reform', { rate: 0.8, delay: 0.2 });
      burst((lo + hi) / 2, y, 30, { color: ['#ffffff', '#d8f2ff', '#9fd2ee'], rx: 900, min: 80, max: 420, angle: -Math.PI / 2, spread: 0.8, life: 0.7, size: 12 });
    }
    if (e.kind === 'colossus') Sound.sfx('colossus-roar', { rate: 0.9 });
    if (e.kind === 'overseer') Sound.sfx('overseer-roar', { rate: 1.05 });
    if (e.kind === 'captain') Sound.sfx('captain-intro', { rate: 1.1, vol: 0.8 });
    if (e.phase === 2) phaseBeat(e);
    if (e.kind === 'captain' && e.phase === 3) {
      // Kesh comes back and takes the Captain's fire: no more fire dash or volleys, but faster blades
      later(0.6, () => Flow.openTalk('keshReturns'));
      later(0.7, () => { const room = G.room; room.oneways = []; burst(room.w / 2, 600, 30, { color: ['#ffd36b', '#f0742a'], rx: 700, min: 60, max: 300, life: 0.8, size: 12 }); });
    }
  }
  // v7 (review 7 #12): Joon is down: the guardian stops, lowers its guard and waits, it doesn't keep hitting the body
  if (p.dead && e.state !== 'intro') {
    if (e.state !== 'idle') go(e, 'idle');
    e.vx = approach(e.vx, 0, 2600 * dt); e.vy = Math.min(e.vy + PHYS.gravity * dt, PHYS.maxFall);
    moveBody(e, dt, { noOneways: true });
    return;
  }
  const k = e.enraged ? (e.phase >= 3 ? 1 : PHASE2_K[e.kind] || 0.75) : 1;   // v15/v16 (notes 68, 75): phase two comes much faster
  // the entrance is watched: the boss waits until its name card has had its moment
  if (e.state === 'intro') { e.face = sign(p.x - e.x); if (e.carded && e.t > 0.3 && !(G.bossCard && G.bossCard.t < 2.4)) { e.invuln = false; go(e, 'idle'); } }
  else if (e.state === 'rec') { e.vx = approach(e.vx, 0, 2600 * dt); if (e.t > e.recDur * k) go(e, 'idle'); }
  else if (e.state === 'phase') phaseState(e, dt);
  else BRAIN[e.kind](e, dt, p, p.x - e.x, k);

  e.vy = Math.min(e.vy + PHYS.gravity * dt, PHYS.maxFall);
  moveBody(e, dt, { noOneways: true });   // too heavy for planks and ropes
  // heavy guardians hop over the arena's own walls and kiln tops
  if (e.hitX && e.hitObj && !e.hitObj.barrier && !e.hitObj.pillar && e.onGround && e.kind !== 'reed' && e.state !== 'punch') { e.vy = -1250; e.onGround = false; Sound.sfx('land-hard', { rate: 0.7 }); }
  // guardians smash through walls you raise
  if (e.hitX && e.hitObj && e.hitObj.pillar) crush(e.hitObj);
  if (e.ground && e.ground.pillar) crush(e.ground);
  // v9 (review 9 #2): a guardian on its own feet never walks into Joon: it stops at arm's length
  if (e.onGround && !['dash', 'drift', 'leap', 'slam'].includes(e.state) && !p.dead && Math.abs(p.y - e.y) < 120) {
    const h = bodyHalf(e), dx2 = e.x - p.x;
    if (Math.abs(dx2) < h && e.vx * Math.sign(-dx2 || 1) > 0) { const nx = p.x + Math.sign(dx2 || -p.face) * h; if (rectFree({ x: nx - e.w / 2, y: e.y - e.h + 4, w: e.w, h: e.h - 8 }, true)) { e.x = nx; e.vx = 0; } }
  }
  const { lo, hi } = arena();
  e.x = clamp(e.x, lo + e.w / 2, hi - e.w / 2);

  // touching a guardian hurts only when it is attacking or charging (v7: walking up to it no longer bleeds health every 1.2 s)
  const calm = ['stagger', 'intro', 'enter', 'vent', 'phase', 'idle', 'rec', 'approach', 'walk'].includes(e.state) || e.state.endsWith('_wind');
  if ((!calm || Math.abs(e.vx) > 260) && !p.dead) {
    const b = boxOf(e);
    if (overlap({ x: b.x + 18, y: b.y + 30, w: b.w - 36, h: b.h - 30 }, boxOf(p))) hurtPlayer(1, e.x);
  }
  bodyBlock(e, p, dt);
}

// v7 (review 7 #2): bodies block bodies. Joon can't walk into a guardian and punch from inside it: he is eased
// out sideways and his inward speed is cut. The dash still passes through, and a guardian in the air doesn't block.
// v9 (review 9 #2): bodies block at the painted width, not the hit box: centre to the torso's edge in the idle frame
// (read off the recordings), plus Joon's own 30. A charge (the Captain's dash, the Warden's drift) passes through.
export const BODY_HALF = { brawler: 55, slinger: 55, shield: 70, archer: 50, reed: 95, colossus: 150, overseer: 120, captain: 85 };
export const bodyHalf = (e) => (e.dead && e.kind === 'captain' ? 100 : BODY_HALF[e.kind || e.type] ?? e.w * 0.42) + 30;
export function bodyBlock(e, p, dt, o = {}) {
  if (p.dead || p.dashT > 0 || p.ledge || (!e.onGround && !e.dead) || e.state === 'enter' || e.remove) return false;
  if (!e.dead && (e.state === 'dash' || e.state === 'drift')) return false;
  if (e.dead && (e.kind === 'reed' || e.sink > 0.3)) return false;    // the Warden goes under the water
  const top = e.dead ? e.y - e.h * 0.45 : e.y - e.h * 0.7;
  if (p.y < top || p.y - p.h > e.y) return false;                      // above its shoulders (a down-strike) or below it
  // v8 (review 8 #9): the Overseer and the kneeling Captain block at their painted width, so Joon is never drawn inside them
  const half = e.dead && !e.boss ? e.w * 0.36 + p.w / 2 : bodyHalf(e), dx = p.x - e.x;
  if (Math.abs(dx) >= half) return false;
  const d = dx === 0 ? (-e.face || 1) : Math.sign(dx), want = e.x + d * half;
  const deep = half - Math.abs(dx), step = deep < 40 ? deep : Math.max(40, 600 * dt);
  const mv = Math.min(step, Math.abs(want - p.x)), nx = p.x + d * mv;
  if (rectFree({ x: nx - p.w / 2, y: p.y - p.h + 4, w: p.w, h: p.h - 8 }, true)) p.x = nx;
  else if (o.soft) return false;                                        // v8: a soldier never pins Joon against a wall: he just passes
  else if (!e.dead) {
    // v8 (review 8 #9): Joon is against a wall, so the guardian gives ground instead (there is always room to fight)
    const bx = e.x - d * mv;
    if (rectFree({ x: bx - e.w / 2, y: e.y - e.h + 4, w: e.w, h: e.h - 8 }, true)) e.x = bx;
  }
  if (p.vx * d < 0) p.vx = 0;
  return true;
}

// --- defeat (v5): one shared sequence, never the small enemies' puff -----------------------
// With its own defeat sheet a boss plays that. Without one it holds its last pose and shakes
// for 0.8 s while small bursts of its element pop along its body, then leaves its own way:
// the Warden sinks back into the pool, the Colossus breaks apart and drops, the Overseer
// slumps, darkens and steams.
const DEFEAT_EL = { reed: 'water', colossus: 'earth', overseer: 'fire', captain: 'fire' };
// v6: the painted collapse runs 1.8 s and every beat of it is heard and felt: sounds, dust, shake and
// rumble keyed to the frame on screen (review 6 #1: the collapses were silent and still).
export const DEFEAT_DUR = 1.8;
// v9 (review 9 #10): the Warden holds its hurt frame 0.5 s before the sink starts (its defeat was over in under a second)
const HOLD = { reed: 0.4 };
const defeatFrame = (e) => Math.min(7, Math.floor(Math.max(0, e.deadT - (HOLD[e.kind] || 0)) / DEFEAT_DUR * 8));
function collapseBeats(e) {
  const f = defeatFrame(e), at = (n, k) => f >= n && once(e, 'cb' + k), y = e.floorY ?? e.y, room = G.room;
  const chunks = (n, hk, col) => burst(e.x, y - e.h * hk, n, { color: col, rx: e.w * 0.4, min: 120, max: 520, angle: -Math.PI / 2, spread: 1.2, life: 0.8, size: 20, sizeMin: 7, shape: 'chunk', grav: 2200 });
  const water = (n, big) => burst(e.x, y - 4, n, { color: ['#ffffff', '#bfe9f2', '#7cc4cf'], rx: e.w * 0.5, min: 160, max: big ? 720 : 480, angle: -Math.PI / 2, spread: 0.6, life: 0.8, size: 12, grav: 1500 });
  if (e.kind === 'reed') {
    // v12 (note 39): the Rime Warden crumbles into blocks of ice; the mask comes down last
    const ice = (n, hk) => burst(e.x, y - e.h * hk, n, { color: ['#ffffff', '#d8f2ff', '#9fd2ee'], rx: e.w * 0.4, min: 120, max: 480, angle: -Math.PI / 2, spread: 1.2, life: 0.8, size: 18, sizeMin: 6, shape: 'chunk', grav: 2200 });
    if (at(1, 'crack')) { Sound.sfx('rime-defeat'); shake(5); ice(8, 0.7); }
    if (at(4, 'kneel')) { shake(10); Sound.rumble(0.6, 0.4, 250); ice(14, 0.4); addFx('collapsedust', e.x, y + 8, { dur: 0.9, size: 420, anchor: 'bottom', fadeOut: 0.5 }); }
    if (at(7, 'mask')) { shake(6); Sound.sfx('land-hard', { rate: 0.8, vol: 0.6 }); ice(10, 0.15); }
  } else if (e.kind === 'colossus') {
    if (at(1, 'crumble')) { Sound.sfx('colossus-crumble'); chunks(10, 0.7, [room.pal.top, '#9c7c4d']); }
    if (at(3, 'knee')) { shake(10); Sound.sfx('boulder-impact', { rate: 0.8 }); Sound.rumble(0.6, 0.4, 250); chunks(12, 0.4, [room.pal.top, room.pal.fill, '#9c7c4d']); addFx('collapsedust', e.x, y + 8, { dur: 0.9, size: 420, anchor: 'bottom', fadeOut: 0.5 }); }
    if (at(6, 'fall')) {
      Sound.sfx('floor-break'); Sound.sfx('land-hard', { rate: 0.5 }); shake(18); hitstop(0.05); Sound.rumble(1, 0.8, 500);
      addFx('collapsedust', e.x, y + 10, { dur: 0.9, size: 720, anchor: 'bottom', fadeOut: 0.5 });   // v9 (review 9 #10): gone 0.3 s after the body stops
      chunks(18, 0.15, [room.pal.top, room.pal.fill, '#e9dcc0']);
    }
  } else if (e.kind === 'overseer') {
    if (at(1, 'vent')) { Sound.sfx('overseer-vent'); for (const d of [-1, 1]) addFx('steam', e.x + d * 70, e.y - e.h * 0.8, { dur: 1.2, size: 300, face: d }); }
    if (at(4, 'fall')) { Sound.sfx('armor-fall'); shake(6); }
    if (at(6, 'knees')) { shake(12); Sound.sfx('land-hard', { rate: 0.6 }); Sound.rumble(0.7, 0.5, 300); addFx('collapsedust', e.x, y + 8, { dur: 1.0, size: 460, anchor: 'bottom', fadeOut: 0.5 }); chunks(8, 0.05, ['#3a2a2a', '#7a5a4a']); }
    if (f >= 3 && Math.random() < 0.4) burst(e.x + rnd(-50, 50), e.y - e.h * rnd(0.5, 0.85), 1, { color: ['#f3ecdf', '#cfc6c0'], min: 30, max: 120, angle: -Math.PI / 2, spread: 0.5, life: 1.0, size: 18, grav: -200 });
  } else if (e.kind === 'captain') {
    if (at(3, 'kneel')) { Sound.sfx('armor-kneel'); shake(5); addFx('dustsmall', e.x, y + 8, { dur: 0.4, size: 160, anchor: 'bottom' }); Sound.rumble(0.3, 0.3, 150); }
  }
}
const ownDefeat = (e) => Assets.has(e.kind + '.defeat') || (e.kind === 'captain' && Assets.has('captain2.defeat'));
function defeatStep(e, dt) {
  e.deadT += dt; e.state = 'dead';
  const t = e.deadT;
  e.vx = approach(e.vx, 0, 1600 * dt);
  if (e.kind === 'captain' || ownDefeat(e)) {
    e.vy = Math.min(e.vy + PHYS.gravity * dt, PHYS.maxFall); moveBody(e, dt, { noPillars: true });
    collapseBeats(e);
    // v12: the Rime Warden stays down as a heap of ice like the others
    return;
  }
  e.y = e.floorY ?? e.y;
  if (t < 0.9 && Math.floor(t * 10) !== Math.floor((t - dt) * 10)) {
    const px = e.x + rnd(-e.w * 0.45, e.w * 0.45), py = e.y - rnd(e.h * 0.15, e.h * 0.9);
    addFx('spark', px, py, { dur: 0.22, size: 90, face: Math.random() < 0.5 ? 1 : -1, el: DEFEAT_EL[e.kind] });
    Sound.sfx(e.kind === 'colossus' ? 'stone-crumble' : e.kind === 'reed' ? 'splash' : 'burn', { vol: 0.35, gap: 0.12, rate: rnd(0.9, 1.15) });
  }
  if (e.kind === 'reed') {
    e.sink = clamp((t - 0.9) / 1.3, 0, 1);
    if (t > 0.9 && once(e, 'sinkfx')) { Sound.sfx('wave-slam', { rate: 0.7, vol: 0.7 }); Sound.sfx('splash', { delay: 0.3 }); }
    if (e.sink > 0 && Math.random() < 0.7) burst(e.x + rnd(-e.w / 2, e.w / 2), e.y - 4, 1, { color: ['#ffffff', '#bfe9f2', '#7cc4cf'], min: 80, max: 340, angle: -Math.PI / 2, spread: 0.5, life: 0.6, size: 11, grav: 1300 });
  } else if (e.kind === 'colossus') {
    for (const [at, hk] of [[0.9, 0.75], [1.15, 0.45], [1.4, 0.15]]) if (t > at && once(e, 'brk' + at)) {
      addFx('floorbreak', e.x + rnd(-40, 40), e.y - e.h * hk, { dur: 0.6, size: 360 });
      Sound.sfx('boulder-impact', { rate: rnd(0.75, 0.95) }); shake(10);
      burst(e.x, e.y - e.h * hk, 14, { color: [G.room.pal.top, G.room.pal.fill, '#9c7c4d'], rx: e.w * 0.4, min: 120, max: 520, life: 0.8, size: 22, sizeMin: 8, shape: 'chunk', grav: 2200 });
    }
    e.sink = clamp((t - 1.4) / 0.9, 0, 1);
    if (t > 1.4 && once(e, 'fall')) { Sound.sfx('stone-crumble'); Sound.sfx('land-hard', { rate: 0.5, delay: 0.4 }); shake(16); }
  } else {
    e.sink = 0; e.dark = clamp((t - 0.9) / 1.2, 0, 1);
    if (t > 0.9 && once(e, 'slump')) { Sound.sfx('overseer-vent', { rate: 0.7 }); for (const d of [-1, 1]) addFx('steam', e.x + d * 70, e.y - e.h * 0.7, { dur: 1.4, size: 320, face: d }); }
    if (t > 0.9 && Math.random() < 0.5) burst(e.x + rnd(-60, 60), e.y - e.h * rnd(0.4, 0.9), 1, { color: ['#f3ecdf', '#cfc6c0'], min: 30, max: 120, angle: -Math.PI / 2, spread: 0.5, life: 1.0, size: 20, grav: -200 });
  }
  if (t > 2.9) e.remove = true;
}

// --- drawing ---------------------------------------------------------------------------
// [sheet, frame] for what each boss is doing.
function bossFrame(e) {
  const loop = (fps) => Math.floor(e.animT * fps) % 8;
  const w = (a, b) => a + Math.min(b - a, Math.floor((e.t / (e.windDur || 0.6)) * (b - a + 1)));
  const has = (a) => Assets.has(e.kind + '.' + a);
  // v14 (Connor's notes 61, 63): the Warden's uppercut (the pogo answer) and a cast animation of its own for each move,
  // played as the move's tell (fists into the floor for the spikes and pillars, a roar up for the icicles, a two-handed
  // throw for the crystal rush) whenever those sheets exist
  if (e.kind === 'reed' && !e.dead) {
    const ov = aaPose(e); if (ov) return [ov[0].split('.')[1], ov[1]];
    const CAST = { slam: 'castground', pillars: 'castground', icicles: 'castsky', sweep: 'castrush' };
    if (e.state === 'phase' && has('castsky')) return ['castsky', Math.min(7, Math.floor(e.t / 1.2 * 8))];   // v15: the phase roar
    const mv = e.state.replace('_wind', ''), cs = CAST[mv];
    if (cs && has(cs)) return [cs, e.state.endsWith('_wind') ? Math.min(4, Math.floor((e.t / (e.windDur || 0.6)) * 5)) : Math.min(7, 5 + Math.floor(e.t * 8))];
  }
  // v16 (Connor's note 75): the Warden treatment for the Colossus and the Overseer: each move plays its OWN cast sheet as
  // its tell (frames 0-4 across the wind-up, 5-7 on the release), the pogo answer its antiair sheet, the phase roar a
  // cast sheet, whenever those sheets exist (boss-<name>-cast-<move>.png, -antiair.png)
  if ((e.kind === 'colossus' || e.kind === 'overseer') && !e.dead) {
    const ov = aaPose(e); if (ov) return [ov[0].split('.')[1], ov[1]];
    const CAST = e.kind === 'colossus' ? { slam: 'castslam', toss: 'casttoss', quake: 'castquake' } : { cone: 'castcone', punch: 'castpunch', fan: 'castfan', vents: 'castvents' };
    const roar = e.kind === 'colossus' ? 'castquake' : 'castvents';
    if (e.state === 'phase' && has(roar)) return [roar, Math.min(7, Math.floor(e.t / 1.2 * 8))];
    const mv = e.state.replace('_wind', ''), cs = CAST[mv === 'fan' && e.last === 'vents' ? 'vents' : mv];
    if (cs && has(cs) && (e.state.endsWith('_wind') || ['slam', 'toss', 'cone', 'punch', 'fan'].includes(e.state))) return [cs, e.state.endsWith('_wind') ? Math.min(4, Math.floor((e.t / (e.windDur || 0.6)) * 5)) : Math.min(7, 5 + Math.floor(e.t * 8))];
  }
  // painted defeat and hurt sheets when they exist (cycle 4 requests)
  if (e.dead && e.deadT < (HOLD[e.kind] || 0) && has('hurt')) return ['hurt', 1];
  if (e.dead && has('defeat')) return ['defeat', defeatFrame(e)];
  // no defeat sheet: hold a pained pose (the Overseer slumps over its vent frames)
  if (e.dead) return e.kind === 'reed' ? (has('hurt') ? ['hurt', 3] : ['attack', 6]) : e.kind === 'colossus' ? (has('stagger') ? ['stagger', 2] : ['attack', 6]) : has('vent') ? ['vent', e.deadT < 0.9 ? 6 : 1 + Math.min(1, Math.floor((e.deadT - 0.9) * 3))] : ['attack', 7];
  if (e.state === 'enter') {
    const t = e.et;
    // v7: the painted rise (reeds and water lift, the Warden breaks the surface, stands), then the shake-off
    if (e.kind === 'reed' && has('rise') && t < 2.0) return ['rise', t < 0.8 ? 0 : Math.min(7, 1 + Math.floor((t - 0.8) / 1.2 * 7))];
    if (e.kind === 'reed') return t > 2.0 && has('hurt') ? ['hurt', 7 - Math.min(3, Math.floor((t - 2.0) / 0.15))] : ['idle', loop(7)];
    if (e.kind === 'colossus') return e.y < e.floorY ? ['attack', 7] : t < (e.landT || 0) + 0.4 ? ['attack', 0] : ['attack', 3];
    if (e.kind === 'overseer') return e.vx ? ['walk', loop(8)] : t > 1.95 && t < 2.5 && has('vent') ? ['vent', 3 + Math.min(3, Math.floor((t - 1.95) / 0.14))] : ['walk', 0];
  }
  // standing still: a slow ping-pong over the two calmest frames, not a frozen picture
  const calm = () => Math.floor(e.animT * 2) % 2;
  // v6: the delivered idle sheets for standing still (the walk-frame ping-pong stays as the fallback)
  const idle = () => (has('idle') ? ['idle', Math.floor(e.animT * 6) % 8] : ['walk', calm()]);
  if (e.kind === 'reed' && e.hurtA > 0 && has('hurt') && ['idle', 'rec', 'drift'].includes(e.state)) return ['hurt', Math.min(3, Math.floor((0.3 - e.hurtA) / 0.075))];
  if (e.kind === 'colossus' && e.state === 'stagger' && has('stagger')) return ['stagger', e.t < 0.25 ? Math.floor(e.t / 0.125) : 2 + Math.floor(e.t * 6) % 6];
  if (e.kind === 'overseer' && e.state === 'vent' && has('vent')) return ['vent', e.t < 0.25 ? Math.floor(e.t / 0.125) : e.t > (e.enraged ? 1.4 : 1.9) - 0.25 ? 6 + Math.min(1, Math.floor((e.t - ((e.enraged ? 1.4 : 1.9) - 0.25)) / 0.125)) : 2 + Math.floor(e.t * 7) % 4];
  if (e.kind === 'reed') {
    // v12 (note 39): windup frames 0-3 lift the fists for the slam (attack 4-7, the impact on 4), 4-7 coil for the sweep
    const wu = has('windup') ? 'windup' : 'attack';
    switch (e.state) {
      case 'slam_wind': case 'wave_wind': return [wu, w(0, 3)];
      case 'slam': case 'wave': return ['attack', 4 + Math.min(3, Math.floor(e.t * 10))];
      case 'sweep_wind': return [wu, w(4, 7)];
      case 'sweep': return ['attack', 5 + Math.min(2, Math.floor(e.t * 8))];
      case 'pillars_wind': case 'icicles_wind': return [wu, w(0, 2)];
      case 'pillars': case 'icicles': return [wu, 3];
      case 'rec': return e.t < 0.3 ? ['attack', 7] : ['idle', loop(7)];
      default: return ['idle', loop(7)];
    }
  }
  if (e.kind === 'colossus') {
    switch (e.state) {
      case 'walk': return Math.abs(e.vx) > 20 ? ['walk', loop(6)] : idle();
      case 'slam_wind': return ['attack', w(0, 3)];
      case 'slam': return ['attack', 4 + Math.min(2, Math.floor(e.t * 6))];
      case 'toss_wind': return ['attack', w(1, 3)];
      case 'toss': return ['attack', 7];
      case 'stagger': return ['attack', 6];
      case 'rec': return e.t < 0.3 ? ['attack', 7] : idle();
      default: return idle();
    }
  }
  if (e.kind === 'overseer') {
    switch (e.state) {
      case 'cone_wind': return ['attack', w(0, 2)];
      case 'cone': return ['attack', 3 + (Math.floor(e.t * 10) % 3)];
      case 'vent': return ['attack', 7];
      case 'punch_wind': return ['attack', 1];
      case 'punch': return ['attack', 3];
      case 'vents_wind': return ['attack', w(0, 2)];
      case 'vents': return ['attack', 6];
      case 'fan_wind': return ['attack', w(0, 2)];
      case 'fan': return ['attack', 6];
      case 'idle': case 'rec': return Math.abs(e.vx) > 20 ? ['walk', loop(8)] : idle();
      default: return idle();
    }
  }
  return null;
}

// Which frame of the Captain's own sheets fits what he is doing. He has no walk sheet: his
// walk is his idle sheet with a stride bob and a forward lean (see drawBoss).
function captainFrame(e) {
  if (Assets.has('captain2.idle')) return captain2Frame(e);
  const idle = ['idle', Math.floor(e.animT * 7) % 8];
  if (e.dead) return Assets.has('captain.defeat') ? ['defeat', Math.min(7, Math.floor(e.deadT / 1.4 * 8))] : ['hurt', Math.min(7, 4 + Math.floor(e.deadT * 8))];
  switch (e.state) {
    case 'phase': return ['attack', 4];
    case 'approach': return Math.abs(e.vx) > 30 && Assets.has('captain.walk') ? ['walk', Math.floor(e.animT * 9) % 8] : idle;
    case 'combo_wind': return ['attack', e.hits === 0 ? 1 : e.hits === 1 ? 3 : 5];
    case 'combo_strike': return ['attack', e.hits === 0 ? 2 : e.hits === 1 ? 4 : 5];
    case 'volley_wind': return ['attack', 6];
    case 'volley': return ['attack', 7];
    case 'leap_wind': return ['dash', 1];
    case 'leap': return ['dash', 2];
    case 'dash_wind': return ['dash', 1 + Math.min(1, Math.floor(e.t * 4))];
    case 'dash': return ['dash', 3 + (Math.floor(e.t * 12) % 2)];
    case 'rec': return e.t < 0.16 ? ['attack', 6] : idle;
    default: return idle;
  }
}
// The redesigned Captain: lantern-pole swings (attack 1 wind, 2-4 sweeps, 5 overhead, 6 the
// pole driven into the ground), a crouched flame lunge (dash 1-2 gather, 3-5 lunge, 6-7 rise).
function captain2Frame(e) {
  const K = 'captain2.', idle = [K + 'idle', Math.floor(e.animT * 7) % 8];
  if (e.dead) return Assets.has(K + 'defeat') ? [K + 'defeat', defeatFrame(e)] : [K + 'attack', 6];
  if (e.hurtA > 0.15 && Assets.has(K + 'hurt') && ['approach', 'rec'].includes(e.state)) return [K + 'hurt', Math.min(3, Math.floor((0.3 - e.hurtA) / 0.05))];
  // v16 (Connor's note 75): his own tell per move (captain-redesign-cast-<move>.png), the antiair kick, the phase roar
  { const ov = aaPose(e); if (ov) return ov; }
  const CAST = { combo: 'castcombo', volley: 'castvolley', leap: 'castleap', dash: 'castdash' }, mv = e.state.replace(/_wind|_strike/, ''), cs = CAST[mv];
  if (e.state === 'phase' && Assets.has(K + 'castleap')) return [K + 'castleap', Math.min(4, Math.floor(e.t / 1.2 * 5))];
  if (cs && Assets.has(K + cs)) {
    const wind = e.state.endsWith('_wind'), wd = e.windDur || 0.5;
    if (mv === 'combo') return [K + cs, wind && e.hits === 0 ? Math.min(4, Math.floor(e.t / wd * 5)) : 5 + Math.min(2, e.hits - (wind ? 1 : 0))];
    if (wind || e.state === mv) return [K + cs, wind ? Math.min(4, Math.floor(e.t / wd * 5)) : Math.min(7, 5 + Math.floor(e.t * 8))];
  }
  switch (e.state) {
    case 'phase': return [K + 'attack', 5];
    case 'approach': case 'enter': return Math.abs(e.vx) > 30 ? [K + 'walk', Math.floor(e.animT * 9) % 8] : idle;
    case 'combo_wind': return [K + 'attack', e.hits === 0 ? 1 : e.hits === 1 ? 3 : 5];
    case 'combo_strike': return [K + 'attack', e.hits === 0 ? 2 : e.hits === 1 ? 4 : 6];
    case 'volley_wind': return [K + 'attack', 1];
    case 'volley': return [K + 'attack', 3];
    case 'leap_wind': return [K + 'dash', 1];
    case 'leap': return [K + 'attack', 5];
    case 'dash_wind': return [K + 'dash', 1 + Math.min(1, Math.floor(e.t * 4))];
    case 'dash': return [K + 'dash', 3 + (Math.floor(e.t * 12) % 3)];
    case 'rec': if (e.last === 'dash' && Assets.has(K + 'castdash') && e.t < 0.35) return [K + 'castdash', 7];   // v16: the glaive dash's own last frame, not the old lantern-pole sheet
      return e.t < 0.2 ? [K + (e.last === 'dash' ? 'dash' : 'attack'), e.last === 'dash' ? 6 : 6] : e.t < 0.35 && e.last === 'dash' ? [K + 'dash', 7] : idle;
    default: return idle;
  }
}

// v15 (cycle 14's leftover): the painted prop props/prop-furnace-door.png (a brick arch with an iron door in it) is the
// doorway now; no code arch, fill or stroke. Its brick frame stays put and only the door slides up inside the arch, the
// furnace's light (a wash, allowed) showing behind it. The inner arch is measured on the art: 11.5% to 87.5% across, its
// crown 13% down.
function drawFurnaceDoor(ctx, x, y, k) {
  const pr = Assets.get('prop.furnacedoor'); if (!pr) return;
  const img = pr.img, iw = 276, ih = iw * img.height / img.width, x0 = x - iw / 2, y0 = y - ih;
  const ax0 = x0 + iw * 0.115, ax1 = x0 + iw * 0.875, ar = (ax1 - ax0) / 2, acx = (ax0 + ax1) / 2, acy = y0 + ih * 0.13 + ar;
  const inner = (fresh = true) => { if (fresh) ctx.beginPath(); ctx.moveTo(ax0, y); ctx.lineTo(ax0, acy); ctx.arc(acx, acy, ar, Math.PI, 0); ctx.lineTo(ax1, y); ctx.closePath(); };
  ctx.save();
  const g = ctx.createRadialGradient(acx, y - ih * 0.45, 10, acx, y - ih * 0.45, 340);
  g.addColorStop(0, `rgba(255,190,90,${0.5 * k})`); g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g; ctx.fillRect(acx - 340, y - ih * 0.45 - 340, 680, 680);
  // inside the arch: the furnace light, and the door sliding up out of the opening
  ctx.save(); inner(); ctx.clip();
  const fg = ctx.createRadialGradient(acx, y - ih * 0.35, 20, acx, y - ih * 0.35, ih * 0.8);
  fg.addColorStop(0, '#fff0b0'); fg.addColorStop(0.45, '#ffb04a'); fg.addColorStop(1, '#a8341a');
  ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = fg; ctx.fillRect(ax0, y0, ax1 - ax0, ih); ctx.globalAlpha = 1;
  ctx.drawImage(img, x0, y0 - ih * Math.min(1, k * 1.05), iw, ih);
  ctx.restore();
  // the brick frame (everything outside the inner arch) never moves
  ctx.save(); ctx.beginPath(); ctx.rect(x0 - 20, y0 - 20, iw + 40, ih + 40); inner(false); ctx.clip('evenodd');
  ctx.drawImage(img, x0, y0, iw, ih);
  ctx.restore();
  ctx.restore();
}

export function drawBoss(ctx, e) {
  ctx.save();
  // v6: the collapsed body stays a moment (the Captain kneels through Sora-Lin's arrival), then fades
  if (e.dead && e.kind === 'reed' && ownDefeat(e)) ctx.globalAlpha = clamp(1 - (e.deadT - (DEFEAT_DUR + 0.8)) / 0.6, 0, 1);   // v7: no ghost fade for the others
  // v6: every boss gets a light rim (like the hero's pale tunic) so it never melts into its arena
  const hp = hitPose(e), flash = hp.flash, rim = G.room.rim || '#fff1d6', rimA = Math.max(G.room.rimA || 0, 0.6);
  // v11 (review 11 #8): the shove and the flinch (a lean back from the blow, settling over 0.28 s)
  if (!e.dead) {
    if (e.shove) { ctx.translate(e.shove, 0); e.shove *= 0.8; if (Math.abs(e.shove) < 0.3) e.shove = 0; }
    if (e.flinchT > 0) { const k = e.flinchT / 0.28, fx = Math.sign(e.shove || -e.face) * 14 * k; ctx.translate(e.x + fx, e.y); ctx.rotate(Math.sign(e.shove || -e.face) * 0.06 * k); ctx.translate(-e.x, -e.y); e.flinchT -= 1 / 60; }
  }
  const ps = 1;
  // the Overseer's furnace door, opening behind it as it arrives (and closing once the fight starts)
  if (e.kind === 'overseer' && e.doorX != null) {
    if (e.state !== 'enter') e.doorK = Math.max(0, e.doorK - 1 / 40);
    if (e.doorK > 0) drawFurnaceDoor(ctx, e.doorX, e.floorY, e.doorK);
  }
  // sinking out (the Warden into the pool, the broken Colossus below the floor) and the
  // Warden rising in: drawn behind a clip at the floor line
  const below = e.state === 'enter' && e.kind === 'reed' && !Assets.has('reed.rise') ? (1 - (e.rise ?? 1)) * e.h * 1.15 : e.dead && e.sink ? e.sink * e.h * 1.15 : 0;
  if (below > 0) { ctx.beginPath(); ctx.rect(e.x - 600, -2000, 1200, (e.floorY ?? e.y) + 2006); ctx.clip(); }
  // breathing while still
  const still = !e.dead && ['idle', 'intro', 'rec', 'walk', 'approach'].includes(e.state) && Math.abs(e.vx) < 20;
  hp.sy *= still ? 1 + 0.015 * Math.sin(e.animT * 2.4) : 1;
  const deadShake = e.dead && !ownDefeat(e) && e.deadT < 0.9 ? Math.sin(e.deadT * 70) * 6 : 0;
  const ex = e.x + hp.ox + deadShake, ey = e.y + below;
  if (e.kind === 'captain') {
    const cf = captainFrame(e), ck = cf[0].includes('.') ? cf[0] : 'captain.' + cf[0], own = Assets.has(ck);
    if (own) {
      const walking = e.state === 'approach' && Math.abs(e.vx) > 30 && !ck.endsWith('walk');
      const bob = walking ? Math.abs(Math.sin(e.animT * 9)) * 10 : 0;
      ctx.fillStyle = 'rgba(20,10,25,0.28)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, 54, 10, 0, 0, 7); ctx.fill();
      if (e.phase === 2 && !e.dead) {
        const g = ctx.createRadialGradient(e.x, e.y - 120, 10, e.x, e.y - 120, 200);
        g.addColorStop(0, 'rgba(255,140,60,0.35)'); g.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = g; ctx.fillRect(e.x - 200, e.y - 320, 400, 340);
      }
      Assets.drawChar(ctx, ck, cf[1], ex, ey + 5 - bob, e.face, { flash, flashColor: hp.color, rot: walking ? e.face * 0.07 : 0, scale: ps, sx: hp.sx, sy: hp.sy, rim, rimA });
      if (e.flareT > 0) {   // the lantern flares as he arrives
        const k = e.flareT / 0.6, lx = ex + e.face * 70, ly = ey - 250;
        const g = ctx.createRadialGradient(lx, ly, 4, lx, ly, 220 * (1.4 - k * 0.4));
        g.addColorStop(0, `rgba(255,220,140,${0.8 * k})`); g.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = g; ctx.fillRect(lx - 260, ly - 260, 520, 520);
        Assets.drawFx(ctx, 'fx.fireblast', Math.min(7, Math.floor((1 - k) * 8)), lx, ly, 200, e.face);
      }
    } else drawSoldier(ctx, e, { scale: 1.34, tint: 'rgba(40,14,60,0.34)' });
  } else {
    if (e.kind === 'overseer' && !e.dead) drawGrates(ctx, e);
    const fr = bossFrame(e), key = e.kind + '.' + fr[0];
    // v6: a soft, wider ground shadow so the body sits on the floor and separates from the painting
    { const sg = ctx.createRadialGradient(e.x, e.y + 2, 4, e.x, e.y + 2, e.w * 0.85); sg.addColorStop(0, 'rgba(14,8,20,0.5)'); sg.addColorStop(1, 'rgba(14,8,20,0)');
      ctx.save(); ctx.translate(e.x, e.y + 2); ctx.scale(1, 0.16); ctx.translate(-e.x, -(e.y + 2)); ctx.fillStyle = sg; ctx.fillRect(e.x - e.w, e.y + 2 - e.w, e.w * 2, e.w * 2); ctx.restore(); }
    // tells drawn under the body: dust lifting off the ground before the Colossus slams
    if (e.kind === 'colossus' && e.state === 'slam_wind') {
      const k = Math.min(1, e.t / (e.windDur || 1));
      Assets.drawFx(ctx, 'fx.dust', Math.min(3, Math.floor(k * 4)), e.x, e.y + 10, 300 + 200 * k, 1, { anchor: 'bottom', alpha: 0.5 + 0.4 * k });
    }
    const shake2 = (e.state === 'stagger' ? Math.sin(e.t * 50) * 4 : 0);
    const tint = e.dark ? `rgba(30,14,12,${0.55 * e.dark})` : null;   // the Overseer's glow going out
    if (!Assets.drawChar(ctx, key, fr[1], ex + shake2, ey + 6, e.face, { flash, flashColor: hp.color, tint, scale: ps, sx: hp.sx, sy: hp.sy, rim, rimA })) {
      drawGuardian(ctx, { ...e, kind: PLACEHOLDER[e.kind], state: e.state === 'stagger' ? 'stun' : e.state }, G.time);
    }
    if (e.state === 'stagger') drawDaze(ctx, e.x, e.y - e.h * 0.92, 1.4);
    if (e.state === 'vent') {   // the weak spot glows
      ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(G.time * 14);
      const g = ctx.createRadialGradient(e.x, e.y - e.h * 0.55, 10, e.x, e.y - e.h * 0.55, 150);
      g.addColorStop(0, 'rgba(255,240,200,0.7)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.fillRect(e.x - 160, e.y - e.h - 60, 320, e.h + 60); ctx.restore();
    }
  }
  ctx.restore();
  if (G.debug) { ctx.strokeStyle = '#f0f'; ctx.lineWidth = 2; ctx.strokeRect(e.x - e.w / 2, e.y - e.h, e.w, e.h); }
}

// Dazed: the painted daze loop, or three gold wisps circling (painted wisp sheet).
export function drawDaze(ctx, x, y, s = 1) {
  if (Assets.has('fx.daze')) { Assets.drawFx(ctx, 'fx.daze', Math.floor(G.time * 12) % 8, x, y, 120 * s); return; }
  for (let i = 0; i < 3; i++) {
    const a = G.time * 5 + i * 2.1;
    Assets.drawFx(ctx, 'fx.wisp', (Math.floor(G.time * 10) + i * 2) % 8, x + Math.cos(a) * 44 * s, y + Math.sin(a) * 10 * s, 46 * s, 1, { tint: 'rgba(255,220,120,0.6)' });
  }
}

// Telegraphs and hazards that bosses leave in G.hurts, drawn by enemies.drawHurts:
// 'spout' (water column), 'cone' (flame jet), 'flame' (floor fire), 'shock', 'spike'.
export function drawBossHurt(ctx, h, t) {
  const k = Math.min(1, (h.age || 0) / 0.08);
  if (h.kind === 'spout') {
    // a painted geyser: the spout sheet if it exists, else two water-lash frames back to back
    const age = h.age || 0, life = age + h.t, k2 = Math.min(1, age / Math.max(0.01, life));
    const cx = h.x + h.w / 2, base = h.y + h.h;
    if (Assets.has('fx.waterspout')) Assets.drawFx(ctx, 'fx.waterspout', 2 + Math.min(5, Math.floor(k2 * 6)), cx, base + 6, h.h * 1.25, 1, { anchor: 'bottom' });
    else {
      const f = k < 1 ? 3 : 4 + Math.min(3, Math.floor(k2 * 4)), sz = h.h * 1.05;
      ctx.save(); ctx.globalAlpha = 0.95;
      for (const d of [1, -1]) Assets.drawFx(ctx, 'fx.whip', f, cx + d * sz * 0.2, base - sz * 0.45, sz, d, { sx: 0.55, rot: -0.35 });   // two lashes fanning up from one base
      Assets.drawFx(ctx, 'fx.whip', 7, cx, h.y + 20 + h.h * (1 - k), sz * 0.6, 1);   // spray at the crown
      ctx.restore();
    }
    return true;
  }
  if (h.kind === 'cone') {
    // the whole jet: a glow along its length and overlapping flame frames, widening as it goes
    ctx.save();
    const d = h.fromX < h.x + h.w / 2 ? 1 : -1, x0 = d > 0 ? h.x : h.x + h.w;
    const g = ctx.createLinearGradient(x0, 0, x0 + d * h.w, 0);
    g.addColorStop(0, 'rgba(255,220,140,0.55)'); g.addColorStop(1, 'rgba(240,116,42,0.15)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, h.y + h.h * 0.4); ctx.lineTo(x0 + d * h.w, h.y - 10); ctx.lineTo(x0 + d * h.w, h.y + h.h + 10); ctx.lineTo(x0, h.y + h.h * 0.6); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < 7; i++) {
      const s = 0.5 + i * 0.11;
      Assets.drawFx(ctx, 'fx.fireblast', 2 + ((Math.floor(t * 18) + i) % 4), x0 + d * h.w * (0.06 + i * 0.14), h.y + h.h / 2 + Math.sin(t * 30 + i) * 10, h.h * 1.5 * s, d) ||
        flame(ctx, x0 + d * h.w * (0.06 + i * 0.14), h.y + h.h, h.h * s, t + i);
    }
    ctx.restore();
    return true;
  }
  if (h.kind === 'mark') return true;   // a falling-rock or rain mark: only its telegraph shows
  return false;
}
export { hexA };
