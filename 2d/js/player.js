// Joon: movement, basic combo, down-strike, ledges and walls, healing, damage, drawing.
import { G, flag, overlap, clamp, rnd, boxOf, shake, hitstop, impact, burst, addFx, banner, skill, popText, sign } from './game.js';
import { PHYS, SLOT_ACTIONS } from './config.js';
import { Input } from './input.js';
import { Assets } from './assets.js';
import { moveBody, hazardAt, breakCrack, rectFree, isPassage } from './world.js';
import { tryCast } from './moves.js';
import { hitEnemy } from './enemies.js';
import { bodyHalf } from './bosses.js';
const BLOCKERS = { brawler: 1, slinger: 1, shield: 1, archer: 1 };
import { phHero } from './placeholders.js';
import { pogoHit, pogoBlocked, pogoLanded } from './pogo.js';
import * as Flow from './flow.js';
import * as UI from './ui.js';
import { Sound } from './audio.js';

export function newPlayer() {
  return {
    x: 0, y: 0, w: 60, h: 150, vx: 0, vy: 0, face: 1, onGround: false, ground: null,
    hp: 5, breath: 100,   // v11 (review 11 #6): a New Game starts with full Breath (was 40: one Gust left 15)
    coyote: 0, buffer: 0, airJumps: 0, jumpCut: false, glideArmed: false, gliding: false,
    dashT: 0, dashCd: 0, dashDir: 1, airDash: 0, dropT: 0,
    atk: null, comboN: -1, comboT: 0, atkQueued: false,
    atkBuf: 0, dashBuf: 0, castBuf: 0, castSlot: 0, jumpRel: false,
    inv: 0, hurtT: 0, flash: 0, castT: 0, castDur: 0.3, focusT: 0,
    slam: null, slamLandT: 0, ring: 0, deflect: 0, deflectAge: 9,
    ledge: null, ledgeCd: 0, wall: 0, wallT: 0, wallOff: 0, wjT: 0, wjDir: 0,
    intHold: -1, healT: 0, meditT: 0, wakeT: 0,
    animT: 0, landT: 0, landK: 0, runDist: 0, victoryT: 0, victoryWant: false, skidT: 0, dead: false, deadT: 0, safe: { x: 0, y: 0 }, noBreathT: 0, lowT: 0,
  };
}

export function resetPlayerState(p) {
  Object.assign(p, { victoryT: 0, victoryWant: false, vx: 0, vy: 0, dashT: 0, atk: null, comboN: -1, comboT: 0, atkQueued: false, hurtT: 0, castT: 0, slam: null, ring: 0, deflect: 0, gliding: false, airJumps: 0, airDash: 0, dropT: 0, buffer: 0, coyote: 0, onGround: false, ledge: null, wall: 0, wjT: 0, healT: 0, bindT: 0, healReq: false, atkBuf: 0, dashBuf: 0, castBuf: 0, intHold: -1 });
  Sound.stopLoops();
}

export const addBreath = (n) => { const p = G.player, was = p.breath; p.breath = clamp(p.breath + n, 0, Flow.maxBreath()); if (was < healCost() && p.breath >= healCost()) Sound.sfx('breath-gain', { vol: 0.8 }); };   // v15: a soft chime when the bar can bind

const COMBO = [
  // v7: each hit steps into the strike (about 60 px; was about 20)
  { dur: 0.24, a: 0.05, b: 0.16, dmg: 1, kx: 260, ky: -120, reach: 130, lunge: 420 },
  { dur: 0.26, a: 0.06, b: 0.17, dmg: 1, kx: 300, ky: -160, reach: 140, lunge: 440 },
  { dur: 0.36, a: 0.10, b: 0.22, dmg: 1, kx: 720, ky: -320, reach: 165, lunge: 560, heavy: true },
];
// v15 (Connor's note 68, "make it like Hollow Knight"): a strike is the nail. It deals 1 (the finisher too; it keeps its
// knock-back and its stagger) and every landed strike BUILDS Breath, like the nail building soul. Bending is the damage:
// Gust, Whip and Fire Blast deal 3 at mid range and cost Breath (moves.js). About 11 strikes fill the bar.
export const STRIKE_BREATH = 9;
export const VICTORY_T = 1.8;
const BUF = 0.15;                  // how long an attack / dash / cast press is remembered
// v15 (note 68): Silksong's bind replaces the slow standing focus. One press spends a full Breath bar for 3 hearts, on
// the ground or in the air; a short bind (Joon hangs still while the ring closes), the hearts land on its key frame.
const BIND_T = 0.42, BIND_HIT = 0.24, BIND_HEARTS = 3, HEAL_COST = 100;
export const healCost = () => (skill('stillmind') ? 80 : HEAL_COST);
const healTime = () => BIND_T;
const dashCooldown = () => (skill('swiftwind') ? 0.26 : PHYS.dashCooldown);
const airDashes = () => (skill('secondwind') ? 2 : 1);

// Presses are read every step, even during hit-stop and fades, so none are lost.
export function readPresses() {
  const p = G.player, I = Input;
  if (!p) return;
  if (I.pressed.jump) { p.buffer = PHYS.jumpBuffer; p.jumpFresh = true; }
  if (I.released.jump) p.jumpRel = true;
  if (I.pressed.attack) p.atkBuf = BUF;
  if (I.pressed.dash) p.dashBuf = BUF;
  for (let i = 0; i < 4; i++) if (I.pressed[SLOT_ACTIONS[i]]) { p.castBuf = BUF; p.castSlot = i; }
  if (I.pressed.interact) p.intPress = true;
}

// v9 (Connor's note 6): strikes straight up and up-diagonal, on the ground or in the air. Each throws the open palm
// along its line; the swoosh and the hit box follow the same line.
const AIM = {
  up: { dur: 0.28, a: 0.06, b: 0.18, dmg: 1, kx: 0, ky: -620, box: (p) => ({ x: p.x - 75, y: p.y - 320, w: 150, h: 200 }), fx: { ox: 0, oy: -220, rot: -Math.PI / 2 } },
  diag: { dur: 0.28, a: 0.06, b: 0.18, dmg: 1, kx: 300, ky: -520, box: (p) => ({ x: p.face > 0 ? p.x + 10 : p.x - 180, y: p.y - 300, w: 170, h: 190 }), fx: { ox: 95, oy: -205, rot: -Math.PI / 4 } },
};
// v9 (review 9 #7): no interact prompt (and no interact press) in a fight: while striking, 0.8 s after a strike or a hit,
// or with an alert enemy within 700 px
export const fighting = () => { const p = G.player; return !!p.atk || p.fightT > 0 || G.enemies.some((e) => !e.dead && (e.alert || e.boss) && Math.abs(e.x - p.x) < 700 && Math.abs(e.y - p.y) < 500); };
function startAttack(p) {
  p.fightT = 0.8;
  const aim = Input.aimDir();
  if (aim === 'up' || aim === 'diag') {
    const A = AIM[aim];
    p.atk = { kind: aim, t: 0, ...A, hit: new Set() };
    if (p.onGround && aim === 'diag') p.vx = p.face * 160;
    if (!p.onGround && p.vy > 0) p.vy *= 0.5;   // a strike in the air hangs a moment
    Sound.sfx(aim === 'up' ? 'swing-up' : 'swing-diag');   // v10 (review 10 #4): each direction has its own swing
    addFx('arcup', 0, 0, { follow: p, ox: p.face * A.fx.ox, oy: A.fx.oy, dur: 0.18, face: p.face, size: 210, rot: aim === 'diag' ? 0.5 * p.face : 0 });   // v11: the rising arc
    return;
  }
  if (!p.onGround && (aim === 'down' || Input.held.down)) {
    p.atk = { kind: 'down', t: 0, dur: 0.42, hit: new Set() };
    Sound.sfx('swing-down');
    // v8 (review 8 #4): a short arc of air under the heel, carried with the body
    p.atk.fx = addFx('downtrail', p.x, p.y, { follow: p, ox: 0, oy: 10, dur: 0.3, size: 200, face: p.face });
    addFx('arcdown', 0, 0, { follow: p, ox: p.face * 10, oy: 40, dur: 0.2, face: p.face, size: 200 });   // v11: the falling arc under the heel
    return;
  }
  const n = p.comboT > 0 ? (p.comboN + 1) % 3 : 0;
  p.comboN = n;
  p.atk = { kind: 'combo', n, t: 0, ...COMBO[n], hit: new Set(), whiff: true };
  if (p.onGround) {
    // v9 (review 9 #2): the lunge stops at arm's length from the nearest body ahead (strike reach 130-165 still lands)
    let lunge = COMBO[n].lunge;
    for (const e of G.enemies) {
      if (e.dead || e.flies || !(e.boss || BLOCKERS[e.type]) || Math.abs(e.y - p.y) > 160) continue;
      const ahead = (e.x - p.x) * p.face; if (ahead <= 0 || ahead > 260) continue;
      lunge = Math.min(lunge, Math.max(0, ahead - bodyHalf(e) - 10) / 0.14);
    }
    p.vx = p.face * lunge;
  }
  Sound.sfx(n === 2 ? 'swing-big' : 'swing', { rate: 1 + n * 0.08 });
  // a painted swoosh rides the strike; the finisher gets the wide crescent
  if (n === 2) addFx('strikeheavy', 0, 0, { follow: p, ox: p.face * 95, oy: -100, dur: 0.24, face: p.face, size: 250 });   // v11 (review 11 #11): untinted: the arcs are air, not an element
  else addFx('arcside', 0, 0, { follow: p, ox: p.face * 80, oy: n === 0 ? -112 : -92, dur: 0.17, face: p.face, size: 190, rot: n === 1 ? 0.35 * p.face : 0 });
}

const wallSolid = (s) => !s.barrier && !s.oneway && !(s.gate && (s.t === 'crack' || s.t === 'branch')) && s.h >= 60;   // v7: no clinging to thornwood
// A solid face right beside the player on `side` (for clinging).
function wallBeside(p, side) {
  const probe = { x: side > 0 ? p.x + p.w / 2 : p.x - p.w / 2 - 6, y: p.y - p.h + 20, w: 6, h: p.h - 50 };
  for (const s of G.room.col) if (wallSolid(s) && overlap(probe, s)) return s;
  return null;
}
// A ledge corner the hands can catch: the top of a solid right in front, near head height.
function ledgeAhead(p, side) {
  const hw = p.w / 2;
  // v5: only a real fall or jump catches a ledge: 0.08 s off the ground and open air under the feet
  if ((p.airT || 0) <= 0.08 || !rectFree({ x: p.x - hw + 4, y: p.y + 2, w: p.w - 8, h: 60 }, false)) return null;
  for (const s of G.room.col) {
    if (!wallSolid(s)) continue;
    if (s.pillar && s.h < p.h * 1.2) continue;   // a wall of your own that is barely taller than you is a step, not a ledge
    const face = side > 0 ? s.x : s.x + s.w;
    const gap = side > 0 ? face - (p.x + hw) : (p.x - hw) - face;
    if (gap < -3 || gap > 16) continue;
    const handY = p.y - p.h;
    if (s.y < handY - 14 || s.y > handY + 46) continue;
    const stand = { x: side > 0 ? face + 4 : face - p.w - 4, y: s.y - p.h - 2, w: p.w, h: p.h };
    if (!rectFree(stand)) continue;
    if (!rectFree({ x: p.x - hw, y: s.y - 30, w: p.w, h: 20 })) continue;   // head room to swing up
    return { s, face, side };
  }
  return null;
}

// v6: stone has three takes, so a run on paving doesn't repeat one sample
const STONE = ['step-stone', 'step-stone-1', 'step-stone-2'];
function stepSound(p) {
  const sf = surfaceOf(p);
  // v11 (review 11 sound list): the sprint has its own quick light footfalls, alternating takes
  if (p.sprint && sf !== 'water') { p.sprintFoot = !p.sprintFoot; Sound.sfx(p.sprintFoot ? 'sprint-step-1' : 'sprint-step-2', { pitch: 0.06 }); return; }
  Sound.sfx(sf === 'stone' ? STONE[(Math.random() * 3) | 0] : 'step-' + sf, { pitch: 0.08 });
}
function surfaceOf(p) {
  const g = p.ground, reg = G.room.region;
  if (g && g.pillar) return g.kind === 'ice' ? 'metal' : 'stone';
  for (const h of G.room.hazards) if (h.t === 'water' && p.x > h.x - 40 && p.x < h.x + h.w + 40 && Math.abs(h.y - p.y) < 60) return 'water';
  // v8: the step matches the platform piece under the feet (stone islands, iron catwalks, wooden shelves)
  if (g && g.oneway) { const st = g.style.startsWith('in:') ? g.fb || '' : g.style; return /^(rock|ledge|stone|kilntop|highledge)$/.test(st) ? 'stone' : reg === 'brass' && /chained|elevator|plank/.test(st) ? 'metal' : /chained/.test(st) ? 'stone' : 'wood'; }
  if (G.room.def.bg && G.room.def.bg.kind === 'in' && reg !== 'quarry') return 'wood';
  return reg === 'quarry' ? 'gravel' : reg === 'brass' ? 'metal' : 'stone';
}

export function updatePlayer(dt) {
  // planner hotfix 12:27 (Connor ran out of Breath mid-crossing and was stuck): bending used to cross water or gaps must
  // never strand you. Out of combat (no alert foe within 900 px), Breath slowly refills to a floor of 50, two Ice Walls'
  // worth. Above 50 it still comes only from defeats (note 13).
  { const p0 = G.player; if (p0 && !p0.dead && p0.breath < 50 && !G.enemies.some((e) => !e.dead && Math.abs(e.x - p0.x) < 900 && Math.abs(e.y - p0.y) < 600 && (e.alert || e.state === 'chase' || e.state === 'aim'))) p0.breath = Math.min(50, p0.breath + 12 * dt); }
  const p = G.player, I = Input, A = G.save.abil;
  p.animT += dt;
  p.airT = p.onGround ? 0 : (p.airT || 0) + dt;
  if (p.onGround && p.pogoN) pogoLanded(p);
  // v14 (Connor's note 56): holding down on a thin plank for 0.35 s drops through it too (down + jump still does it at
  // once), so a player who never learned the chord can't be stranded on a stack of planks
  if (p.onGround && p.ground && p.ground.oneway && I.held.down && !I.held.left && !I.held.right && !p.atk && p.dropT <= 0) {
    p.downHold = (p.downHold || 0) + dt;
    if (p.downHold > 0.35) { p.dropT = 0.22; p.downHold = 0; Sound.sfx('drop-through', { gap: 0.2 }); }
  } else p.downHold = 0;
  for (const k of ['hangT', 'castLock', 'deflectMiss', 'sprintSkidT', 'healPulse', 'inv', 'hurtT', 'flash', 'castT', 'dashCd', 'dropT', 'comboT', 'landT', 'deflect', 'ring', 'noBreathT', 'atkBuf', 'dashBuf', 'castBuf', 'ledgeCd', 'wjT', 'skidT', 'focusT', 'meditT', 'wakeT', 'slamLandT', 'turnT', 'hazT', 'takeT', 'fightT', 'stopT', 'dashEndT', 'atkLock', 'recoilT']) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
  p.deflectAge += dt;

  if (p.dead) {
    p.deadT += dt; p.vx *= 0.92; p.vy = Math.min(p.vy + PHYS.gravity * dt, PHYS.maxFall);
    moveBody(p, dt);
    return;
  }
  // low health: a slow heartbeat
  if (p.hp === 1 && (p.lowT -= dt) <= 0) { p.lowT = 1.1; Sound.sfx('lowhp'); }

  const dir = (I.held.right ? 1 : 0) - (I.held.left ? 1 : 0);
  if (p.buffer > 0 && !p.jumpFresh) p.buffer -= dt;
  const fresh = p.jumpFresh; p.jumpFresh = false;
  if (fresh && !p.onGround && p.coyote <= 0) p.glideArmed = true;   // glide needs a fresh press in the air
  p.coyote = p.onGround ? PHYS.coyote : p.coyote - dt;

  // --- hanging on a ledge ---------------------------------------------------------------
  if (p.ledge) { updateLedge(p, dt, dir); return; }
  // a boss's name card: Joon stands his ground and watches the entrance
  if ((G.bossIntro || G.bossCard && G.bossCard.t < 2.4) && p.onGround && !p.dead) { p.vx *= 0.75; p.atk = null; return finishStep(p, dt, 0, true); }
  // v7: after a boss falls, Joon lets the fight go: one long breath, fist to palm (input held 1.8 s)
  if (p.victoryWant && p.onGround && !p.atk && p.dashT <= 0 && !p.slam) { p.victoryWant = false; p.victoryT = VICTORY_T; Sound.sfx('victory-breath'); }
  if (p.victoryT > 0) { p.victoryT -= dt; p.vx *= 0.75; return finishStep(p, dt, 0, true); }

  const locked = p.hurtT > 0 || p.dashT > 0 || !!p.slam || p.meditT > 0 || p.recoilT > 0;   // v12: knocked back off a guard
  if (G.attune) return finishStep(p, dt, 0, true);   // v10 (note 11): kneeling at a shrine, attuning
  if (G.doorWalk) {   // v10 (review 10 #2): walking into a passage or a boss gate
    const w = G.doorWalk, dx = w.d.x - p.x;
    w.t += dt; p.atk = null; p.sprint = false;
    p.vx = Math.abs(dx) > 10 ? sign(dx) * 300 : 0; if (Math.abs(dx) > 10) p.face = sign(dx);
    if (w.t >= w.dur && !G.fade) { G.doorWalk = null; Flow.transition(w.d.to, w.other.x, w.other.y); }
    return finishStep(p, dt, 0, false);
  }

  // --- interact: tap acts on what is near; hold with nothing near is Still Breath (v10, Connor's note 20)
  const near = nearInteract();
  if (p.intPress) {
    p.intPress = false;
    if (near && !locked && !fighting() && !G.teachHeal) { Flow.interact(); p.intHold = -1; }
    else { p.intHold = 0; p.healReq = true; }   // v15: △ / E with nothing to use binds (heals)
  }
  if (I.pressed.heal) p.healReq = true;
  // v14 (Hollow Knight's keys): Up on the ground beside a door, an NPC, a stone or a shrine interacts, as E / △ do
  if (I.pressed.up && near && !near.glyph && p.onGround && !locked && !fighting() && !G.teachHeal && !I.held.attack && !p.atk) Flow.interact();
  if (p.intHold >= 0) { if (!I.held.interact) { p.intHold = -1; p.healWarned = false; } else p.intHold += dt; }
  // v9 (Connor's note 5): a passage is walked through with a push up (an arch, a stair up) or down (a stair down)
  if (near && near.glyph && !locked && !fighting() && p.onGround && (G.time - (G.enteredAt || 0)) > 0.4 && (near.glyph === 'up' ? I.pressed.up : I.pressed.down) && !I.held.interact) { Flow.interact(); }
  // v15 (note 68): the bind. A blow before its key frame breaks it and keeps the Breath (hurtPlayer clears bindT)
  if (p.healReq) {
    p.healReq = false;
    if (p.bindT > 0 || locked || p.atk || p.castLock > 0 || p.hp >= G.save.maxHp) { /* nothing to mend, or busy */ }
    else if (p.breath < healCost()) { p.noBreathT = 0.6; Sound.sfx('no-breath', { gap: 0.4 }); }
    else { p.bindT = BIND_T; p.bindDone = false; p.healT = 0.001; p.sprint = false; p.gliding = false; Sound.sfx('heal-ring'); Sound.sfx('heal-breath', { vol: 0.8 }); }
  }
  if (p.bindT > 0) {
    p.bindT = Math.max(0, p.bindT - dt); p.healT = BIND_T - p.bindT; p.vx = 0; p.vy = 0;
    if (Math.random() < 0.6) burst(p.x + rnd(-60, 60), p.y - rnd(0, 60), 1, { color: ['#eafcff', '#bfe9f2'], min: 20, max: 90, angle: -Math.PI / 2, spread: 0.5, life: 0.5, size: 7, grav: -300 });
    if (!p.bindDone && p.healT >= BIND_HIT) {
      p.bindDone = true; p.hp = Math.min(G.save.maxHp, p.hp + BIND_HEARTS); p.breath = Math.max(0, p.breath - healCost()); p.healPulse = 0.35;
      Sound.sfx('heal'); Sound.sfx('heal-tick', { vol: 0.7 }); shake(3); Sound.rumble(0.2, 0.4, 100);
      if (G.teachHeal) Flow.healTaught();
      burst(p.x, p.y - 90, 18, { color: ['#ffffff', '#ffb3a6', '#bfe9f2'], min: 60, max: 300, life: 0.6, size: 10, grav: -100 });
    }
    if (p.bindT <= 0) p.healT = 0;
    return finishStep(p, dt, 0, true);
  }
  p.healT = 0;

  if (!locked) {
    // v10 (Connor's note 13): a cast commits. Through the cast and its recovery Joon can't run, jump or strike; the
    // last 30% can be cut short with a dash
    const committed = p.castLock > 0, dashCancel = committed && p.castLock < (p.castLockMax || 0.3) * 0.3;
    // v10 (Connor's note 17): holding the dash button after a dash keeps Joon sprinting on the ground
    if (p.sprint && (!I.held.dash || (p.onGround && (dir !== p.face || !dir)) || p.wall || p.healT > 0 || committed)) endSprint(p);
    const slow = (p.atk && p.onGround) ? 0.45 :   // v7: was 0.2 (the combo rooted Joon)
      (p.castT > 0 && p.onGround ? 0.35 : 1);
    let target = committed ? (p.onGround ? 0 : p.vx) : dir * PHYS.runSpeed * slow * (Input.walk ? 0.45 : 1) * (p.sprint && dir === p.face ? PHYS.sprintMul : 1);
    if (p.wjT > 0 && dir === p.wjDir) target = p.vx;        // just kicked off a wall: pushing back toward it does nothing yet
    let acc = (p.onGround ? PHYS.groundAccel : PHYS.airAccel) * dt;
    if (p.sprintSkidT > 0) acc *= 0.4;                     // a sprint's stop slides
    if (!(p.atk && p.onGround && p.atk.t < 0.1)) p.vx += clamp(target - p.vx, -acc, acc);
    if (p.sprint && p.onGround && (p.sprintDust = (p.sprintDust || 0) - dt) <= 0) { p.sprintDust = 0.11; burst(p.x - p.face * 26, p.y - 4, 4, { color: ['#e9dcc0', '#cdbb9c'], min: 40, max: 170, angle: p.face > 0 ? Math.PI + 0.4 : -0.4, spread: 0.5, life: 0.42, size: 12, grav: 200 });
      // v11 (review 11 #7): speed lines trail the sprint so it never reads as a plain run
      if ((p.sprintLines = (p.sprintLines || 0) + 1) % 2 === 0) addFx('dashstreak', p.x - p.face * 70, p.y - 100, { dur: 0.2, face: p.face, size: 170, alpha: 0.45 }); }
    if (dir && !p.atk && p.castT <= 0 && !committed && !p.wall) {
      if (dir !== p.face && p.onGround && Math.abs(p.vx) > 200) { if (!(p.turnT > 0)) Sound.sfx('turn-skid', { vol: 0.8 }); p.turnT = Math.max(p.turnT || 0, 0.12); p.turnFrom = p.face; }
      p.face = dir;
    }

    // v9 (review 9 #9): a plain stop from a run: two settling steps (0.18 s) and their sound
    if (p.onGround && Math.abs(p.vx) > 400) p.wasRunning = true; else if (!p.onGround || dir) p.wasRunning = p.wasRunning && p.onGround && !!dir;
    if (p.onGround && !dir && !p.atk && Math.abs(p.vx) < 60 && p.wasRunning && !(p.stopT > 0)) { p.stopT = 0.18; p.wasRunning = false; Sound.sfx('run-stop', { gap: 0.4 }); }
    if (p.onGround && Math.abs(p.vx) < 30 && !dir) p.runStartT = 0;
    // skid when reversing at speed
    if (p.onGround && dir && Math.sign(p.vx) === -dir && Math.abs(p.vx) > 480 && p.skidT <= 0) {
      p.skidT = 0.3; Sound.sfx('skid', { vol: 0.6 });
      addFx('skid', p.x - dir * 20, p.y + 8, { dur: 0.3, size: 80, face: -dir, anchor: 'bottom' });
      p.turnT = 0.15; p.turnFrom = -dir;   // a turn-around: plant and pivot
    }

    if (p.buffer > 0 && !committed) {
      if (p.wall) {
        // wall jump: kick away from the wall
        const side = p.wall;
        p.vx = -side * PHYS.wallJumpVx; p.vy = -PHYS.wallJumpVy; p.wjT = 0.2; p.wjDir = side; p.face = -side;
        p.wall = 0; p.buffer = 0; p.jumpCut = false; p.airDash = 0;
        Sound.sfx('walljump'); Sound.loop('slide-loop', false);
        burst(p.x + side * 30, p.y - 60, 8, { color: ['#e9dcc0', '#ffffff'], min: 60, max: 240, angle: side > 0 ? Math.PI : 0, spread: 0.8, life: 0.35, size: 9, grav: 300 });
      } else if (p.coyote > 0) {
        if (I.held.down && p.ground && p.ground.oneway) { p.dropT = 0.22; p.buffer = 0; p.coyote = 0; Sound.sfx('drop-through', { gap: 0.2 }); }   // v7: no longer silent
        else {
          p.vy = -PHYS.jumpV; p.buffer = 0; p.coyote = 0; p.onGround = false; p.jumpCut = false;
          Sound.sfx('jump'); p.takeT = 0.1;   // v7: a take-off stretch and a puff at the feet, like the landing has
          addFx('dustsmall', p.x, p.y + 8, { dur: 0.28, size: 110, anchor: 'bottom' });
          burst(p.x, p.y, 5, { color: '#e9dcc0', min: 40, max: 160, angle: -Math.PI / 2, spread: 1.3, life: 0.35, size: 9, grav: 200 });
        }
      } else if (A.doubleJump && p.airJumps < 1) {
        p.vy = -PHYS.doubleJumpV; p.airJumps++; p.buffer = 0; p.jumpCut = false; p.gliding = false; p.glideArmed = false;
        Sound.sfx('jump2');
        addFx('jumpring', p.x, p.y + 6, { dur: 0.36, size: 240 });   // left in the air where you stepped (v7: its own puff, not the move's ring)
        burst(p.x, p.y, 8, { color: ['#d7eef2', '#ffffff'], min: 60, max: 260, angle: Math.PI / 2, spread: 0.9, life: 0.4, size: 9, grav: 0 });
      }
    }
    if (p.jumpRel && p.vy < -200 && !p.jumpCut) { p.vy *= PHYS.jumpCut; p.jumpCut = true; }

    if (p.dashBuf > 0 && A.dash && p.dashCd <= 0 && (!committed || dashCancel) && (p.onGround || p.wall || p.airDash < airDashes())) {
      p.dashBuf = 0; p.castLock = 0; p.castT = 0; p.dashThru = new Set(); p.ghostT = 0;
      const offWall = p.wall; if (p.wall) { p.wall = 0; Sound.loop('slide-loop', false); }
      p.dashT = PHYS.dashTime * (skill('swiftwind') ? 1.15 : 1); p.dashCd = dashCooldown(); p.dashDir = offWall ? -offWall : (dir || p.face); p.face = p.dashDir;
      if (!p.onGround) p.airDash++;
      p.inv = Math.max(p.inv, PHYS.dashTime + 0.04); p.atk = null; p.gliding = false; p.healT = 0;
      addFx('dashstreak', p.x - p.dashDir * 60, p.y - 75, { dur: 0.28, face: p.dashDir, size: 230 });   // the streak stays where you left
      Sound.sfx('dash'); Sound.rumble(0.05, 0.3, 60);
    }

    if (p.atkBuf > 0 && p.castT <= 0.1 && !committed) {
      if (p.atk && p.atk.kind === 'combo') { p.atkQueued = true; p.atkBuf = 0; }
      else if (!p.atk && !(p.atkLock > 0)) { p.atkBuf = 0; if (p.wall) { p.face = -p.wall; } startAttack(p); }
    }
    if (p.castBuf > 0) {
      const r = tryCast(G.save.slots[p.castSlot]);
      if (r !== 'busy') p.castBuf = 0;
    }
  }
  p.jumpRel = false;
  finishStep(p, dt, dir, false);
}

// v10 (Connor's note 17): letting go of the sprint at speed digs the heels in: a slide, dust and a scrape
function endSprint(p) {
  p.sprint = false;
  if (p.onGround && Math.abs(p.vx) > 600) {
    const d = sign(p.vx);
    p.sprintSkidT = 0.3; p.skidT = 0.3;
    Sound.sfx('sprint-skid', { vol: 0.8 });
    addFx('skid', p.x + d * 10, p.y + 8, { dur: 0.4, size: 240, face: -d, anchor: 'bottom' });   // v11 (review 11 #7): twice the dust
    burst(p.x + d * 20, p.y - 6, 16, { color: ['#e9dcc0', '#cdbb9c', '#ffffff'], min: 60, max: 260, angle: d > 0 ? -0.5 : Math.PI + 0.5, spread: 0.5, life: 0.45, size: 10, grav: 500 });
  }
}

// Attack timeline, gravity and collision, landing, walls, ledges, hazards.
function finishStep(p, dt, dir, healing) {
  if (p.ghosts) p.ghosts = p.ghosts.filter((g) => (g.t -= dt) > 0);
  const I = Input, A = G.save.abil;
  const locked = p.hurtT > 0 || p.dashT > 0 || !!p.slam;
  if (p.atk) {
    const a = p.atk;
    a.t += dt;
    if (a.kind === 'combo') {
      if (a.t >= a.a && a.t <= a.b) {
        const box = { x: p.face > 0 ? p.x + 6 : p.x - 6 - a.reach, y: p.y - 150, w: a.reach, h: 150 };
        for (const e of G.enemies) {
          // v11 (review 11 #7): the Parasol Guard's dome rides 60 px above his body box; a heel on the dome counts (it rings and bounces)
        const eb = boxOf(e); if (e.type === 'parasol' && e.dome !== false) { eb.y -= 70; eb.h += 70; eb.x -= 30; eb.w += 60; }
        if (e.dead || a.hit.has(e) || !overlap(box, eb)) continue;
          a.hit.add(e); a.whiff = false;
          // v10 (Connor's note 13): strikes no longer feed Breath; only a defeated foe does
          if (hitEnemy(e, a.dmg, p.face * a.kx, a.ky, { basic: true, heavy: a.heavy, fromX: p.x, combo: a.n })) {
            if (a.heavy) p.focusT = 2;            // the finisher focuses the breath: next cast costs half
            if (e.type !== 'post') addBreath(STRIKE_BREATH);   // v15 (note 68): the strike builds Breath
          }
        }
        // v7: a strike on a raised wall doesn't break it, and now says so: a dull knock and a few chips
        if (!a.knocked) for (const pl of G.pillars) if (overlap(box, pl)) {
          a.knocked = true; a.whiff = false; hitstop(0.04); shake(3);
          const ice = pl.kind === 'ice', hx = p.face > 0 ? pl.x : pl.x + pl.w;
          Sound.sfx(ice ? 'ice-knock' : 'clank', ice ? {} : { rate: 0.7, vol: 0.7 });
          burst(hx, p.y - 90, 6, { color: ice ? ['#ffffff', '#dff3ff', '#bfe9f2'] : ['#c9b9a0', '#8a7a72'], min: 80, max: 260, angle: p.face > 0 ? Math.PI : 0, spread: 0.8, life: 0.35, size: 8, sizeMin: 4, shape: 'chunk', grav: 1400 });
          break;
        }
      }
      if (a.t >= a.dur) {
        p.atk = null; p.comboT = 0.42;
        // v12 (Connor's note 34): the third blow ends the chain with a short recovery (0.24 s), and a swing at the air
        // tells the soldiers nearby to step in and punish it
        if (a.n === 2) { p.comboT = 0; p.atkLock = 0.24; p.atkQueued = false; }
        if (a.whiff) for (const e of G.enemies) if (!e.dead && !e.boss && Math.abs(e.x - p.x) < 260 && Math.abs(e.y - p.y) < 140) e.punishT = 0.45;
        if (p.atkQueued && !locked) { p.atkQueued = false; startAttack(p); }
        p.atkQueued = false;
      }
    } else if (a.kind === 'up' || a.kind === 'diag') {
      if (a.t >= a.a && a.t <= a.b) {
        const box = a.box(p);
        for (const e of G.enemies) {
          if (e.dead || a.hit.has(e) || !overlap(box, boxOf(e))) continue;
          a.hit.add(e);
          if (hitEnemy(e, a.dmg, p.face * a.kx, a.ky, { basic: true, fromX: p.x, fromY: p.y - 200, up: true }) && e.type !== 'post') addBreath(STRIKE_BREATH);
        }
      }
      if (a.t >= a.dur) { p.atk = null; p.comboT = 0; }
    } else { // down-strike: bounce off enemies, spikes, thorns and fire
      const box = { x: p.x - 55, y: p.y - 30, w: 110, h: 110 };
      let bounce = false;
      for (const e of G.enemies) {
        if (e.dead || a.hit.has(e) || !overlap(box, boxOf(e))) continue;
        a.hit.add(e);
        // v10 (review 10 #4): the heel springs off every body it meets, flying ones and shells and domes included
        // v14 (note 53): but a raised shield, a spinning parasol or the Warden's spikes take no damage, and repeat pogos on
        // one foe without landing fall off (100/70/40/0 %); the bounce itself always stays
        const k = pogoBlocked(e) ? 0 : pogoHit(p, e);
        if (k > 0 && hitEnemy(e, k, 0, 200, { basic: true, down: true, fromX: p.x, fromY: p.y }) && e.type !== 'post') addBreath(Math.round(STRIKE_BREATH * k));
        bounce = true;
      }
      if (!bounce) for (const h of G.room.hazards) if (h.t !== 'water' && overlap(box, h)) { bounce = true; Sound.sfx('clank', { rate: 1.3, vol: 0.6 }); burst(p.x, h.y, 8, { color: ['#ffffff', '#ffe9a8'], min: 80, max: 300, angle: -Math.PI / 2, spread: 1, life: 0.3, size: 8 }); break; }
      if (!bounce) for (const pl of G.pillars) if (overlap(box, pl) && p.vy > 0 && p.y < pl.y + 10) { bounce = true; break; }
      if (bounce) { p.vy = -920; p.airDash = 0; p.airJumps = 0; p.jumpCut = true; p.atk = null; shake(5); Sound.rumble(0.1, 0.4, 70); addFx('bounce', p.x, p.y + 40, { dur: 0.26, size: 220 }); Sound.sfx('downstrike-bounce', { vol: 0.8 }); }
      else if (a.t >= a.dur || p.onGround) p.atk = null;
    }
  }

  // vertical: dash, slam or gravity (+ glide, wall slide)
  if (p.dashT > 0) {
    p.dashT -= dt; p.vx = p.dashDir * PHYS.dashSpeed; p.vy = 0;
    if (Math.random() < 0.7) burst(p.x - p.dashDir * 20, p.y - rnd(20, 130), 1, { color: '#d7eef2', min: 10, max: 60, life: 0.25, size: 8, grav: 0 });
    // v10 (Connor's note 19): the dash slips through bodies. A whoosh as it passes, an afterimage, and the foe turns
    // its head after you; a guard who was dashed through is open from behind while he turns
    if ((p.ghostT = (p.ghostT || 0) - dt) <= 0) { p.ghostT = 0.035; (p.ghosts || (p.ghosts = [])).push({ x: p.x, y: p.y, face: p.dashDir, f: 2 + Math.min(3, Math.floor((1 - p.dashT / PHYS.dashTime) * 4)), t: 0.2 }); }
    for (const e of G.enemies) {
      if (e.dead || !p.dashThru || p.dashThru.has(e) || !overlap(boxOf(p), boxOf(e))) continue;
      p.dashThru.add(e); e.dashedT = 0.7; e.headTurned = false;
      Sound.sfx('dash-through', { x: e.x, gap: 0.08 });
      if (!e.boss && (e.type === 'shield' || e.type === 'parasol') && e.state !== 'wind' && e.state !== 'strike') { e.state = 'turn'; e.t = -0.25; }
    }
    if (p.dashT <= 0) {
      const sprint = Input.held.dash && A.dash && (dir === p.dashDir || !p.onGround);
      p.vx = p.dashDir * PHYS.runSpeed * (sprint ? PHYS.sprintMul : dir === p.dashDir ? 1 : 0.55);
      if (sprint) { p.sprint = true; if (p.onGround) Sound.sfx('sprint-start', { vol: 0.7 }); }
      // v9 (review 9 #9): the dash lands: its last frame holds 0.06 s, squashed 4%, with a puff at the heel
      p.dashEndT = 0.06; if (p.onGround) addFx('dustsmall', p.x - p.dashDir * 30, p.y + 8, { dur: 0.25, size: 80, anchor: 'bottom', face: -p.dashDir });
    }
  } else if (p.slam) {
    const s = p.slam;
    s.t += dt;
    if (s.phase === 'rise') {
      p.vy += PHYS.gravity * dt; p.vx *= 0.9;
      if (p.vy >= -60 || s.t > 0.3) { s.phase = 'fall'; p.vy = PHYS.slamSpeed; p.vx = 0; }
    } else { p.vy = PHYS.slamSpeed; p.vx = 0; }
  } else {
    // sharper arc: light at the apex while jump is held, heavier on the way down
    let gr = PHYS.gravity;
    if (p.vy > 0) gr = PHYS.fallGravity;
    if (p.hangT > 0) { gr = 0; p.vy = Math.min(p.vy, 0) * 0.85; }   // v10 (note 23): the air-cast hang
    else if (Math.abs(p.vy) < PHYS.apexBand && I.held.jump) gr = PHYS.apexGravity;
    const vy0 = p.vy;
    p.vy += gr * dt;
    const wasGliding = p.gliding;
    p.gliding = false;
    if (A.glide && !p.onGround && !p.wall && I.held.jump && p.glideArmed && (p.vy > PHYS.glideFall || wasGliding) && p.hurtT <= 0) {
      // v8 (review 8 #2): ease onto the cushion of air instead of snapping to the glide speed in one frame
      p.vy = vy0 > PHYS.glideFall ? vy0 + (PHYS.glideFall - vy0) * Math.min(1, dt * 14) : Math.min(p.vy, PHYS.glideFall);
      p.gliding = true;
      if (!wasGliding) {
        p.glideT = 0;
        Sound.sfx('glide-open', { gap: 0.25 });   // v8: a push of air from the palms (no kite)
        // thin air lines under the palms, on the body for the whole glide
        if (p.glideFx) p.glideFx.t = p.glideFx.dur;
        if (Assets.has('fx.glidestreaks')) p.glideFx = addFx('glidestreak', p.x, p.y, { follow: p, ox: -p.face * 10, oy: -95, dur: 99, loop: true, size: 210, behind: true, face: -p.face, anchor: 'left' });   // v9: the ribbons stream back from the hands
      }
      p.glideT += dt;
      if (Math.random() < 0.5) burst(p.x - p.face * 20, p.y - 40, 1, { color: '#d7eef2', min: 30, max: 120, angle: Math.PI / 2, spread: 0.5, life: 0.4, size: 8, grav: 0 });
    }
    if (!p.gliding && p.glideFx) { p.glideFx.dur = p.glideFx.t + 0.2; p.glideFx = null; }
    if (wasGliding && !p.gliding && !p.onGround && p.dashT <= 0) Sound.sfx('glide-close', { gap: 0.3 });   // v9 (review 9 sound 3): the cloth settles
    // v14 (Connor's note 55: "too slow, it gets in the way"): a column of wind is a snap, not a float. Gliding, or holding
    // ✕ in the air, it throws Joon up at 1,700 px/s (the Gorge Lookout's 760 px column in about 0.5 s, was about 2.7 s at
    // 280 px/s), eases off over the last 160 px so he leaves the top under control, and never touches his sideways speed.
    if ((p.gliding || (!p.onGround && Input.held.jump)) && p.dashT <= 0) {
      for (const u of G.room.updrafts) if (p.x > u.x && p.x < u.x + u.w && p.y > u.y && p.y - 60 < u.y + u.h) {
        const top = p.y - u.y, cap = top < 160 ? -500 - top * 6 : -1700;
        if (!p.inDraft) { p.inDraft = true; Sound.sfx('gust', { vol: 0.7, rate: 1.25, gap: 0.4 }); }
        p.vy = Math.max(cap, Math.min(p.vy, 0) - 9000 * dt);
        if (Math.random() < 0.6) burst(p.x + rnd(-40, 40), p.y - rnd(20, 160), 1, { color: ['#ffffff', '#e6f4ff'], min: 500, max: 900, angle: Math.PI / 2, spread: 0.05, life: 0.18, size: 5, grav: 0 });   // speed lines
        break;
      }
    }
    if (!G.room.updrafts.some((u) => p.x > u.x && p.x < u.x + u.w && p.y > u.y && p.y - 60 < u.y + u.h)) p.inDraft = false;
    if (p.wall && p.vy > PHYS.wallSlide) p.vy = PHYS.wallSlide;
    if (p.vy > PHYS.maxFall) p.vy = PHYS.maxFall;
  }
  Sound.loop('glide-loop', p.gliding, 1, p.vy < 0 ? 1.3 : 1);

  // bodies don't overlap: standing inside an enemy or a guardian eases you out of it
  if (p.dashT <= 0 && !p.ledge) {
    for (const e of G.enemies) {
      if (e.dead || e.flies || e.state === 'intro' || e.state === 'enter' || Math.abs(e.y - p.y) > Math.max(e.h, p.h) * 0.7) continue;
      const dx = p.x - e.x, reach = (e.w + p.w) / 2 * 0.8;
      if (Math.abs(dx) < reach) {
        // the push never moves Joon into a wall or an arena barrier: if his side is blocked, the body gives way instead
        const push = Math.min(reach - Math.abs(dx), 420 * dt), d = dx === 0 ? -e.face || 1 : Math.sign(dx);
        if (rectFree({ x: p.x + d * push - p.w / 2, y: p.y - p.h + 4, w: p.w, h: p.h - 8 }, true)) p.x += d * push;
        else if (!e.boss) e.x -= d * push;
      }
    }
  }
  const wasGround = p.onGround, fallV = p.vy, prevX = p.x;
  moveBody(p, dt);
  p.realVx = (p.x - prevX) / Math.max(dt, 1e-4);   // v6: what the feet really cover (pushing into a wall is 0)
  if (p.hitX && p.dashT > 0) p.dashT = 0;

  if (p.onGround) {
    if (!wasGround) {
      const k = clamp(fallV / 1500, 0, 1);
      p.landDur = p.landT = 0.12 + 0.08 * k; p.landK = k;   // v6: a heavier landing absorbs a little longer
      // v5: dust by fall speed. v6: never wider than the hero for an ordinary landing (hard cloud capped at 220, puff only above 900)
      if (fallV > 1300) { addFx('dust', p.x, p.y + 8, { dur: 0.4, size: Math.min(220, 130 + fallV * 0.05), anchor: 'bottom' }); Sound.sfx('land-hard'); shake(3); Sound.rumble(0.25, 0.2, 80); }
      else if (fallV > 700) { if (fallV > 900) addFx('dustsmall', p.x, p.y + 8, { dur: 0.3, size: 60 + (fallV - 900) * 0.08, anchor: 'bottom' }); Sound.sfx('land', { vol: fallV > 1000 ? 1 : 0.8 }); }
      else if (fallV > 200) Sound.sfx('land', { vol: 0.5 });
      p.runDist = 0;
    }
    p.airJumps = 0; p.airDash = 0; p.glideArmed = false; p.gliding = false; p.airCast = false; p.blastBoost = false;
    if (p.wall) { p.wall = 0; Sound.loop('slide-loop', false); }
    if (p.slam && p.slam.phase === 'fall') slamLand(p);
    // footsteps on the run frames where a foot plants
    if (Math.abs(p.realVx) > 20 && !healing) {
      const before = Math.floor(p.runDist / 37);
      p.runDist += Math.abs(p.x - prevX);
      const now = Math.floor(p.runDist / 37);
      if (now !== before && (now % 8 === 1 || now % 8 === 5)) stepSound(p);
    }
    // remember the last safe footing (not a temporary wall, not right on an edge)
    const g = p.ground;
    if (g && !g.pillar && !g.gate && p.x > g.x + 44 && p.x < g.x + g.w - 44 && !hazardAt({ x: p.x - 90, y: p.y - 150, w: 180, h: 170 })) { p.safe.x = p.x; p.safe.y = p.y; }
  } else if (!p.slam && p.dashT <= 0 && p.hurtT <= 0 && !healing) {
    // wall cling (Stone Grip) and ledge catch
    if (p.wall) {
      if (!wallBeside(p, p.wall) || dir === -p.wall) { p.wallOff += dt; if (p.wallOff > 0.1 || !wallBeside(p, p.wall)) { p.wall = 0; Sound.loop('slide-loop', false); } }
      else p.wallOff = 0;
      if (p.wall && p.vy > 60 && Math.random() < 0.4) burst(p.x + p.wall * 28, p.y - 120, 1, { color: ['#e9dcc0', '#bfb0a0'], min: 20, max: 80, angle: -Math.PI / 2, spread: 0.6, life: 0.3, size: 6, grav: 400 });
      Sound.loop('slide-loop', !!p.wall && p.vy > 60);
    } else if (A.grip && p.vy > 0 && dir && wallBeside(p, dir) && !p.atk) {
      p.wall = dir; p.wallOff = 0; p.face = dir; p.airDash = 0; p.airJumps = 0; p.glideArmed = false;
      p.vy = Math.min(p.vy, 120); Sound.sfx('wall-grab');
    }
    if (!p.wall && p.vy > -80 && p.ledgeCd <= 0 && !p.atk && p.castT <= 0) {
      const side = dir || (p.hitX || 0);
      const L = side && ledgeAhead(p, side);
      if (L) {
        p.ledge = { ...L, t: 0, climb: -1 };
        p.x = side > 0 ? L.face - p.w / 2 : L.face + p.w / 2; p.y = L.s.y + 128; p.vx = 0; p.vy = 0; p.face = side;
        p.airJumps = 0; p.airDash = 0; p.gliding = false; p.atk = null;
        Sound.sfx('ledge'); Sound.rumble(0.05, 0.25, 50);
        burst(L.face, L.s.y, 5, { color: ['#e9dcc0'], min: 30, max: 120, angle: -Math.PI / 2, spread: 1, life: 0.3, size: 6, grav: 600 });
      }
    }
  }

  // v6: stepping into or out of shallow water is heard and splashes, even when it doesn't hurt
  const wet = G.room.hazards.some((h) => h.t === 'water' && p.x > h.x && p.x < h.x + h.w && p.y > h.y + 6 && p.y < h.y + h.h);
  if (wet !== !!p.wet) {
    p.wet = wet;
    Sound.sfx(wet ? 'water-enter' : 'water-exit', { gap: 0.2 });
    if (wet || Math.abs(p.vy) > 200) addFx('splash', p.x, p.y + 6, { dur: 0.5, size: wet ? 150 : 110, anchor: 'bottom' });
  }
  // hazards and pits
  const hz = hazardAt(boxOf(p));
  if (hz) { Flow.hazardHit(hz.t); return; }
  Flow.checkEdges();
}

function updateLedge(p, dt, dir) {
  const L = p.ledge, I = Input;
  L.t += dt;
  p.vx = 0; p.vy = 0;
  if (L.s.pillar && !G.pillars.includes(L.s)) { p.ledge = null; p.ledgeCd = 0.3; return; }   // the ice melted
  if (L.climb >= 0) {
    L.climb += dt;
    if (L.climb >= 0.3) {
      p.ledge = null; p.x = L.face + L.side * (p.w / 2 + 8); p.y = L.s.y; p.onGround = true; p.ground = L.s; p.landT = p.landDur = 0.08; p.landK = 0.3;
      Sound.sfx('step-' + surfaceOf(p));
    }
    return;
  }
  if (L.t < 0.08) return;          // a beat to settle on the catch
  if (p.buffer > 0) {
    p.buffer = 0;
    if (dir === -L.side) {         // leap away
      p.ledge = null; p.ledgeCd = 0.3; p.vx = -L.side * 520; p.vy = -PHYS.jumpV * 0.9; p.face = -L.side; p.jumpCut = false;
      Sound.sfx('jump');
    } else { L.climb = 0; Sound.sfx('climb'); }
  } else if (I.held.up || dir === L.side && L.t > 0.25) { L.climb = 0; Sound.sfx('climb'); }
  else if (I.held.down || dir === -L.side) { p.ledge = null; p.ledgeCd = 0.35; }
  if (p.intPress) p.intPress = false;
}

function slamLand(p) {
  p.slam = null; p.inv = Math.max(p.inv, 0.25); p.slamLandT = 0.3;
  shake(16); hitstop(0.06); Sound.rumble(0.8, 0.6, 180);
  Sound.sfx('earth-slam'); Sound.sfx('land-hard', { vol: 0.8 });
  const big = skill('tremor') ? 1.4 : 1;
  addFx('dust', p.x, p.y + 8, { dur: 0.45, size: 300 * big, anchor: 'bottom' });   // v6: was 420
  addFx('slam', p.x, p.y + 6, { dur: 0.5, size: 520 * big, anchor: 'bottom' });
  burst(p.x, p.y, 16, { color: [G.room.pal.top, G.room.pal.fill, '#e9dcc0'], rx: 80, min: 120, max: 520, angle: -Math.PI / 2, spread: 1.3, life: 0.6, size: 16, sizeMin: 6, shape: 'chunk', grav: 2000 });
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x;
    if (Math.abs(dx) < 250 * big + e.w / 2 && Math.abs(e.y - p.y) < 170) hitEnemy(e, 3, Math.sign(dx || 1) * 420, -760, { heavy: true, slam: true, fromX: p.x });
  }
  for (const g of G.room.gates) {
    if (g.t === 'crack' && !g.open && p.x + 110 > g.x && p.x - 110 < g.x + g.w && Math.abs(g.y - p.y) < 30) { breakCrack(g); p.onGround = false; p.vy = 500; }
  }
}

// A deflect timed just before a hit: reflect it, stagger the attacker, refill Breath.
export function parry(x, y, src) {
  const p = G.player;
  hitstop(0.14); shake(8); impact(x ?? p.x, y ?? p.y - 110); Sound.sfx('parry'); Sound.rumble(0.3, 0.7, 120);
  p.inv = Math.max(p.inv, 0.35); p.deflectHit = true; p.castLock = 0;   // v10: no Breath for a parry (note 13); a clean parry frees Joon at once
  // v11 (note 15): no 'Parry!' word; the spark, the clang and the stagger say it      // review 10: beside the blow, not on top of Joon
  addFx('spark', x, y, { dur: 0.25, size: 280 });
  burst(x, y, 14, { color: ['#ffffff', '#eafcff', '#bfe9f2'], min: 160, max: 560, life: 0.35, size: 9 });
  if (src && !src.boss) { src.state = 'hurt'; src.hurtT = 1.2; src.t = 0; src.vx = -sign(p.x - src.x) * 520; src.vy = -320; src.flash = 0.07; src.onGround = false; src.guardDown = 1.2; }
  else if (src && src.boss) { src.flash = 0.07; }
}
export const inParryWindow = () => G.player.deflect > 0;   // v10 (note 16): the deflect is its own window

// Damage from enemies. Returns true if it landed.
export function hurtPlayer(dmg, fromX, o = {}) {
  const p = G.player;
  if (p.dead || p.inv > 0 || (p.slam && !o.force) || G.fade) return false;
  if (p.deflect > 0 && !o.force && !o.noParry) { parry(p.x + sign(fromX - p.x) * 60, p.y - 100, o.src); return false; }
  // v15 (Connor's note 68, as Hollow Knight does late in a fight): every blow in the Rime Warden's second phase costs 2
  if (G.boss && !G.boss.dead && G.boss.phase >= 2 && dmg > 0) dmg = Math.max(dmg, 2);   // v16 (note 75): every guardian's phase two costs 2 hearts a blow
  p.hp -= dmg; p.fightT = 0.8;
  p.sprint = false; p.castLock = 0;
  p.inv = 1.1; p.hurtT = 0.28; p.flash = 0.2; p.atk = null; p.dashT = 0; p.castT = 0; p.slam = null; p.gliding = false; p.ledge = null; p.wall = 0; p.healT = 0; p.bindT = 0; p.meditT = 0;
  p.vx = (p.x < fromX ? -1 : 1) * 480; p.vy = -520; p.onGround = false; G.hurtGlow = 1;
  shake(12); hitstop(0.09); Sound.rumble(0.6, 0.6, 160);
  Sound.sfx('player-hurt'); Sound.sfx('hit', { rate: 0.8, vol: 0.6 }); Sound.stopLoops(); if (G.state === 'play') Sound.stopDown(0.1, 0.5);   // v15: the music gives way for a beat so the blow is heard
  burst(p.x, p.y - 80, 10, { color: ['#ffffff', '#e2574c'], min: 120, max: 420, life: 0.4, size: 10 });
  if (p.hp <= 0) Flow.playerDied();
  else if (G.room.region === 'kite' && !flag('taught-heal') && G.save.moves.length) Flow.teachHeal();   // v10 (note 20)
  return true;
}

// --- drawing ---------------------------------------------------------------------------
export function drawPlayer(ctx) {
  const p = G.player;
  let anim = 'idle', f = 0, feet = p.y + 5, sx = 1, sy = 1, clingShift = 0, turnFace = 0, rot = 0;
  const A = p.atk, has = (k) => Assets.has('hero.' + k);
  if (p.dead) {
    if (has('knockout')) { anim = 'knockout'; f = Math.min(5, Math.floor(p.deadT * 8)); }
    else { anim = 'hurt'; f = Math.min(4, 1 + Math.floor(p.deadT * 10)); }
  }
  else if (p.wakeT > 0 && has('knockout')) { anim = 'knockout'; f = 5 + Math.min(2, Math.floor((0.6 - p.wakeT) / 0.2)); }
  else if (p.ledge && has('ledge')) {
    const L = p.ledge;
    if (L.climb < 0) { anim = 'ledge'; f = 2; feet = L.s.y - 6 + Assets.heightOf('hero.ledge', 2); }
    else { const k = Math.min(1, L.climb / 0.3); anim = 'ledge'; f = 3 + Math.min(4, Math.floor(k * 5)); const hang = L.s.y - 6 + Assets.heightOf('hero.ledge', 2); feet = hang + (L.s.y - hang) * Math.min(1, k * 1.4); }
  }
  else if (p.meditT > 0 && has('meditate')) { const e = 1.4 - p.meditT; anim = 'meditate'; f = e < 0.45 ? Math.floor(e / 0.45 * 4) : 4 + Math.floor(G.time * 6) % 4; }
  else if (p.victoryT > 0) {
    // settle (0-2), the long breath (3-5), fist to palm and hold (6-7); the meditate sheet stands in without the art
    const u = VICTORY_T - p.victoryT;
    if (has('victory')) { anim = 'victory'; f = u < 0.45 ? Math.floor(u / 0.15) : u < 1.15 ? 3 + Math.min(2, Math.floor((u - 0.45) / 0.24)) : u < 1.4 ? 6 : 7; }
    else if (has('meditate')) { anim = 'meditate'; f = Math.min(3, Math.floor(u / 0.2)); }
  }
  else if (p.healT > 0 && has('heal')) { anim = 'heal'; f = Math.min(7, Math.floor(p.healT / healTime() * 8)); }   // v7: the redrawn sheet has no clipped frame
  else if (p.hurtT > 0) { anim = 'hurt'; f = 1 + Math.min(3, Math.floor((0.28 - p.hurtT) / 0.28 * 4)); }
  else if (p.dashT > 0) { anim = 'dash'; f = 2 + Math.min(3, Math.floor((1 - p.dashT / PHYS.dashTime) * 4)); }
  else if (p.dashEndT > 0 && p.onGround) { anim = 'dash'; f = 5; sy = 0.96; sx = 1.03; }   // v9: the dash's last frame held, squashed
  else if (p.slam || p.slamLandT > 0) {
    // v8 (review 8 #4): tuck (0-1), the heel-first dive (2-3, flickered), then impact, crouch and rise (4-6) on landing.
    // v7 flickered the landing frames during the fall, which read as a standing pose dropping.
    if (has('downstrike')) { anim = 'downstrike'; f = p.slamLandT > 0 ? (p.slamLandT > 0.22 ? 4 : p.slamLandT > 0.1 ? 5 : 6) : p.slam.phase === 'rise' ? Math.min(1, Math.floor(p.slam.t * 8)) : 2 + Math.floor(G.time * 14) % 2; }
    else { anim = 'jump'; f = p.slam && p.slam.phase === 'rise' ? 2 : 6; }
  }
  else if (A && (A.kind === 'up' || A.kind === 'diag')) {
    // v9: the up and up-diagonal palm strikes (hero-attack-up.png, hero-attack-diag.png; the diagonal is mirrored for left)
    const u = Math.min(0.999, A.t / A.dur), k = A.kind === 'up' ? 'attackup' : 'attackdiag';
    if (has(k)) { anim = k; f = Math.floor(u * 8); }
    else { anim = 'attack'; f = Math.min(3, Math.floor(u * 4)); rot = (A.kind === 'up' ? -0.35 : -0.18); }
  }
  else if (A && A.kind === 'combo' && !p.onGround && has('airattack')) {
    // v7: in the air the strikes are thrown with the knees tucked: palm (0-1), other palm (2-3), spinning heel kick (4-7)
    const u = Math.min(0.999, A.t / A.dur); anim = 'airattack'; f = A.n === 2 ? 4 + Math.floor(u * 4) : (A.n === 1 ? 2 : 0) + Math.floor(u * 2);
  }
  else if (A && A.kind === 'combo' && A.n === 2 && has('finisher')) { anim = 'finisher'; f = Math.min(7, Math.floor(A.t / A.dur * 8)); }
  else if (A && A.kind === 'combo') {
    // v9 (review 9 #9): a follow-up strike skips its wind-up frame from guard (the hands are already up)
    const u = A.t / A.dur, k = A.n > 0 ? Math.min(3, 1 + Math.floor(u * 3)) : Math.min(3, Math.floor(u * 4));
    anim = 'attack'; f = (A.n === 1 ? 4 : 0) + k; if (A.n === 2) sx = 1.04;
  }
  else if (p.comboT > 0 && p.onGround && p.comboN >= 0 && p.comboN < 2 && Math.abs(p.vx) < 200) { anim = 'attack'; f = (p.comboN === 1 ? 4 : 0) + 3; }   // v9: between combo hits, hold the strike just thrown, not the guard pose
  else if (A) { if (has('downstrike')) { anim = 'downstrike'; f = A.t < 0.06 ? 1 : 2 + Math.floor(A.t * 14) % 2; } else { anim = 'attack'; f = 6; } }
  else if (p.wall && has('cling')) {
    // v6: the hands and feet sit on the wall face, whatever margin the sheet has
    anim = 'cling'; f = Math.floor(p.animT * 6) % 8;
    const s = wallBeside(p, p.wall), gap = !s ? 0 : p.wall > 0 ? s.x - (p.x + p.w / 2) : (p.x - p.w / 2) - (s.x + s.w);
    clingShift = p.wall * (p.w / 2 + gap + 4 - Assets.reachOf('hero.cling', f));
  }
  else if (p.wall && has('wall')) { anim = 'wall'; f = 0; clingShift = p.wall * 14; }   // a hand and a foot on the wall
  else if (p.wjT > 0 && has('wall')) { anim = 'wall'; f = 4 + Math.min(3, Math.floor((0.2 - p.wjT) / 0.05)); }
  else if (p.castT > 0 && !p.onGround && has('aircast')) { anim = 'aircast'; f = Math.min(7, Math.floor((1 - p.castT / p.castDur) * 8)); }   // v11 (B3): a cast thrown in mid-air
  else if (p.castT > 0 && has('cast-' + p.castEl)) { anim = 'cast-' + p.castEl; f = Math.min(7, Math.floor((1 - p.castT / p.castDur) * 8)); }
  else if (p.castT > 0) { anim = 'cast'; f = 2 + Math.min(4, Math.floor((1 - p.castT / p.castDur) * 5)); }
  else if (!p.onGround) {
    // v8 (review 8 #2): two opening frames, then frames 2 to 7 loop at 10 a second; the body leans into its travel and bobs
    if (p.gliding) { anim = 'glide'; const u = p.glideT || 0; f = u < 0.12 ? Math.floor(u / 0.06) : 2 + Math.floor((u - 0.12) * 10) % 6; rot = clamp(p.vx / 520, -1, 1) * 0.06 * p.face; feet += Math.sin(u * 7.85) * 4; }   // v9: the new sheet leans forward itself; a small extra lean and a 4 px bob on a 0.8 s sine
    else { anim = 'jump'; f = p.vy < -420 ? 1 : p.vy < -140 ? 2 : p.vy < 140 ? 3 : p.vy < 420 ? 4 : p.vy < 900 ? 5 : 6; if (p.vy < -700) { sy = 1.05; sx = 0.96; } }
  }
  else if (p.landT > 0 && (p.landK > 0.3 || Math.abs(p.vx) < 60)) {   // every real landing shows, running or not
    // v6: feet-on-the-ground frames only: touch, absorb and rise (0-4) standing; the forward lean (5-7) running
    const u = 1 - p.landT / (p.landDur || 0.12);
    if (has('land')) { anim = 'land'; f = Math.abs(p.vx) > 60 ? 5 + Math.min(2, Math.floor(u * 3)) : Math.min(4, Math.floor(u * 5)); }
    else { anim = 'jump'; f = 7; }
  }
  else if (p.turnT > 0 && has('turn')) { anim = 'turn'; f = Math.min(7, Math.floor((1 - p.turnT / 0.15) * 8)); if (f < 4 && p.turnFrom) turnFace = p.turnFrom; }   // v6: skid frames face the old way, the push-off the new
  else if (Math.abs(p.vx) > 60 && Math.abs(p.realVx ?? p.vx) > 20) {
    anim = 'run'; f = Math.floor(p.runDist / 37) % 8;
    // v9 (review 9 #9): from a standstill the first 0.1 s leans into the push-off
    p.runStartT = (p.runStartT || 0) + 1 / 60; if (p.runStartT < 0.1) { rot = p.face * 0.07 * (1 - p.runStartT / 0.1); sy *= 0.97; }
    if (p.sprint && has('sprint')) { anim = 'sprint'; f = Math.floor(p.runDist / 40) % 8; rot += p.face * 0.02; }   // v11 (B1): the flat-out sprint sheet
    else if (p.sprint) { rot += p.face * 0.14; f = Math.floor(p.runDist / 30) % 8; sy *= 0.97; }   // v10: the sprint leans into it. v11 (review 11 #7): 8 degrees, the stride 1.4x quicker, a little lower
  }
  else if (p.sprintSkidT > 0 && p.onGround && has('skid')) { anim = 'skid'; f = Math.min(7, Math.floor((1 - p.sprintSkidT / 0.3) * 8)); turnFace = sign(p.vx) || p.face; }   // v11 (B2): heels dug in
  else if (p.sprintSkidT > 0 && p.onGround && has('turn')) { anim = 'turn'; f = 1; turnFace = sign(p.vx) || p.face; }   // v10: the sprint's skid
  else if (p.stopT > 0) { anim = 'run'; f = p.stopT > 0.09 ? 2 : 3; rot = -p.face * 0.06 * (p.stopT / 0.18); sy *= 0.97 + 0.03 * (1 - p.stopT / 0.18); }   // v9: two settling steps, weight back
  else { f = Math.floor(p.animT * 6) % 8; }   // v9: the new idle breath at 6 a second
  // turning without a turn sheet: a quick pivot squeeze so the flip isn't a single-frame snap
  if (p.turnT > 0 && anim !== 'turn' && p.onGround) { const u = 1 - p.turnT / 0.12; sx *= 0.74 + 0.26 * Math.abs(2 * u - 1); }
  if (p.takeT > 0 && !p.onGround) { const k = p.takeT / 0.1; sx *= 1 - 0.08 * k; sy *= 1 + 0.08 * k; }
  if (p.landT > 0 && p.onGround) { const k = (p.landT / (p.landDur || 0.12)) * (0.4 + p.landK * 0.6); sy *= 1 - 0.1 * k; sx *= 1 + 0.07 * k; }

  // v8 (review 8 #7): after a hit the body blinks clearly on and off (12 a second, down to 0.45), not a soft pulse
  const blink = p.inv > 0 && p.hurtT <= 0 && p.dashT <= 0 && !p.dead && Math.floor(p.inv * 24) % 2 === 0;
  // a hit is unmistakable: 0.08 s of solid warm white, then a red wash over the hurt frames
  const o = { flash: 0, flashMax: 0.2, flashColor: '255,236,214', alpha: blink ? 0.45 : 1, sx, sy, rot };
  if (G.doorWalk) { const k = Math.min(1, G.doorWalk.t / G.doorWalk.dur); o.alpha *= 1 - 0.75 * k; o.sy *= 1 - 0.06 * k; if (G.doorWalk.d.dir === 'down') feet += 24 * k; }   // into the opening
  if (p.hurtT > 0 && p.flash > 0.14) { o.flash = 1; o.flashMax = 0.92; o.flashOver = true; o.flashColor = '255,246,232'; }
  else if (p.hurtT > 0 && !p.dead) { o.flash = 1; o.flashMax = 0.36 * Math.min(1, p.hurtT / 0.1); o.flashOver = true; o.flashColor = '226,64,52'; }
  if (p.focusT > 0) { o.flash = Math.max(o.flash, 0.12 + 0.08 * Math.sin(G.time * 20)); o.flashColor = '255,210,140'; }
  // soft ground shadow
  // v7: lying down, the shadow stretches under the whole body instead of a dark blot at the head
  const lying = anim === 'knockout' && f >= 2 && f <= 5;
  if (p.onGround && p.ground && !p.ground.pillar) { ctx.fillStyle = 'rgba(20,10,25,0.28)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, (lying ? 88 : 44) * sx, lying ? 11 : 9, 0, 0, 7); ctx.fill(); }
  // v10 (note 19): the dash leaves pale afterimages along its line
  for (const g of p.ghosts || []) Assets.drawChar(ctx, 'hero.dash', g.f, g.x, g.y + 5, g.face, { alpha: 0.38 * g.t / 0.2, flash: 1, flashMax: 0.7, flashOver: true, flashColor: '200,236,255' });
  if (!Assets.drawChar(ctx, 'hero.' + anim, f, p.x + clingShift, feet, turnFace || p.face, o)) phHero(ctx, anim === 'knockout' ? 'hurt' : anim, f, p.x, p.y, p.face, o, G.time);
  drawHealRing(ctx, p);
  if (G.debug) { ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2; ctx.strokeRect(p.x - p.w / 2, p.y - p.h, p.w, p.h); }
}

// v10 (Connor's note 20): Still Breath shows as a ring of breath filling round Joon, one heart per turn of the ring
function drawHealRing(ctx, p) {
  const k = p.healT > 0 ? Math.min(1, p.healT / healTime()) : 0, pulse = p.healPulse > 0 ? p.healPulse / 0.35 : 0;
  if (!k && !pulse) return;
  const cx = p.x, cy = p.y - 82, r = 112 + pulse * 26;
  // v14 (note 57): fx/heal-ring.png (a ring of breath closing round him, filling once) once it lands
  if (Assets.drawFx(ctx, 'fx.healring', k ? Math.min(6, Math.floor(k * 7)) : 7, cx, cy, (r + 30) * 2, 1, { alpha: 0.35 + 0.65 * (k ? 1 : pulse) })) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.35 + 0.65 * (k ? 1 : pulse);
  ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(29,20,32,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  if (k) { ctx.lineWidth = 8; ctx.strokeStyle = '#bfe9f2'; ctx.shadowColor = '#eafcff'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke(); }
  if (pulse) { ctx.lineWidth = 6 * pulse; ctx.strokeStyle = '#ffb3a6'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); }
  ctx.restore();
}

// What can be interacted with right now? Used for the prompt and by Flow.interact().
export function nearInteract() {
  const p = G.player, room = G.room;
  if (!p.onGround) return null;
  const n = G.npc;
  for (const v of G.villagers || []) if (Math.abs(p.x - v.x) < 120 && Math.abs(p.y - v.y) < 90) return { type: 'villager', obj: v, label: v.def.label || 'Talk', x: v.x, y: v.y - 250 };
  if (n && n.walkTo == null && Math.abs(p.x - n.x) < 130 && Math.abs(p.y - n.y) < 90) return { type: 'npc', obj: n, label: 'Talk', x: n.x, y: n.y - 250 };
  if (room.stone && Math.abs(p.x - room.stone.x) < 120 && Math.abs(p.y - room.stone.y) < 90) return { type: 'stone', obj: room.stone, label: room.meditated ? 'Moves and the Path' : 'Meditate', x: room.stone.x, y: room.stone.y - 150 };
  if (room.shrine && Math.abs(p.x - room.shrine.x) < 140 && Math.abs(p.y - room.shrine.y) < 90) return { type: 'shrine', obj: room.shrine, label: flag('shrine-' + room.shrine.el) ? 'Recall the lesson' : 'Learn', x: room.shrine.x, y: room.shrine.y - 360 };
  for (const d of room.doors) if (Math.abs(p.x - d.x) < 80 && Math.abs(p.y - d.y) < 60) return { type: 'door', obj: d, label: d.label || 'Enter', x: d.x, y: d.y - 290, glyph: isPassage(d) ? (d.dir === 'down' ? 'down' : 'up') : null };
  if (G.save.satchel && G.save.satchel.room === room.id && Math.abs(p.x - G.save.satchel.x) < 110 && Math.abs(p.y - G.save.satchel.y) < 100) return { type: 'satchel', obj: G.save.satchel, label: 'Recover your beads', x: G.save.satchel.x, y: G.save.satchel.y - 150 };
  return null;
}
