// Every regular enemy, projectiles, enemy attack boxes, and damage.
// Each kind is one entry in TYPES: { hp, w, h, speed, update(e, dt), frame(e), onHit?(e, dmg, o) }.
//   brawler / slinger   fire-army soldiers (Kite Hill and the early fights)
//   shield              Shieldbearer: blocks from the front; slam, stone wall, gust up close or a
//                       hit from behind opens it; a mace smash leaves it open for a moment
//   archer              Ember Archer: keeps its distance, lobs arcing fire arrows, hops back
//   moth                Cinder Moth: flies, swoops through you dropping cinders; gust grounds it
//   snapper             Reed Snapper: a shell that only opens after it snaps; whip flips it
//   mite                Quarry Mite: curls into a stone and rolls along floors until it hits a wall
//   hound               Kiln Hound: fast runner that pounces; walls stop it cold; weak to water
import { G, overlap, clamp, rnd, boxOf, shake, hitstop, impact, burst, sign, addFx, popText, banner, skill, flag, setFlag, later } from './game.js';
import { antiAir, followHurts, drawAntiAir, aaPose } from './pogo.js';
import { PHYS, W } from './config.js';
import { Assets } from './assets.js';
import { moveBody, groundAt, igniteBranch, rectFree, rayDown } from './world.js';
import { hurtPlayer, addBreath, parry, inParryWindow } from './player.js';
import { updateBoss, drawBoss, bossDefeated, bossHit, drawBossHurt, bodyBlock } from './bosses.js';
import { phSoldier } from './placeholders.js';
import { flame, rr as D_rr, hexA as D_hexA } from './draw.js';
import { Sound } from './audio.js';
import * as Flow from './flow.js';

const SLINGER_TINT = 'rgba(70,60,170,0.38)';
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
const go = (e, s) => { e.state = s; e.t = 0; };
const onScreen = (e, pad = 40) => Math.abs(e.x - (G.cam.x + 960)) < 960 + pad && Math.abs(e.y - e.h / 2 - (G.cam.y + 540)) < 540 + pad;
// v9 (review 9 #6): blows come one after another: a soldier whose neighbour (within 200 px) is already winding up waits 0.35 s
const neighbourWinding = (e) => G.enemies.some((q) => q !== e && !q.dead && !q.boss && q.state === 'wind' && Math.abs(q.x - e.x) < 200);
const mayWind = (e) => { if (e.holdT > 0) return false; if (neighbourWinding(e)) { e.holdT = 0.12; return false; } return true; };   // v15 (note 68): was 0.2   // v10 (note 13): groups press harder (was 0.35)
const busyAttackers = () => G.enemies.filter((q) => !q.dead && !q.boss && (q.state === 'wind' || q.state === 'fwind' || q.state === 'strike')).length;
const P = () => G.player;
// v11 (note 24): states that begin an attack, held back while the Elder teaches Still Breath
const ATTACK_START = { wind: 1, fwind: 1, draw: 1, lunge: 1, leap: 1, swoop: 1, snap: 1, roll: 1, flare: 1, crouch: 1 };

// --- soldiers (brawler, slinger) ---------------------------------------------------------
// v6: in a locked fight nobody hides: a soldier stuck on a ledge above Joon for 2 s walks off it
// toward him (the Barracks ambush once stalled for 30 s with the last soldier on a side ledge).
const lockedFight = () => !!(G.room.fight && G.room.fight.phase !== 'done');
function dropDown(e, p, dt) {
  const above = lockedFight() && e.onGround && p.y - e.y > 100 && Math.abs(p.x - e.x) > 120;
  e.highT = above ? (e.highT || 0) + dt : 0;
  return e.highT > 2;
}
function updateSoldier(e, dt) {
  const p = P(), dx = p.x - e.x, dy = p.y - e.y, adx = Math.abs(dx), ady = Math.abs(dy);
  const brawler = e.type === 'brawler';
  if (lockedFight()) e.alert = true;   // never idle while the room is locked
  const drop = dropDown(e, p, dt);
  switch (e.state) {
    case 'idle':
      e.vx = approach(e.vx, 0, 2000 * dt);
      if (!p.dead && (e.alert || (adx < (brawler ? 780 : 900) && ady < (brawler ? 280 : 420) && onScreen(e)))) { go(e, brawler ? 'chase' : 'aim'); if (!e.barked) { e.barked = true; Sound.sfx('soldier-alert', { x: e.x, gap: 0.35 }); } }   // v7: a soldier's own 'hup' and armour rattle, not a dog's bark
      break;
    case 'chase':
      e.face = sign(dx);
      if (p.dead || (!e.alert && (adx > 1150 || ady > 460))) { go(e, 'idle'); break; }
      if (e.scripted && adx < 260 && ady < 130 && !flag('taught-heal')) { e.scripted = false; go(e, 'wind'); e.t = 0.2; e.vx = e.face * 380; Sound.sfx('soldier-alert', { x: e.x }); break; }   // v10 (note 20): the first soldier rushes in
      // v12 (note 34): Joon up on a ledge above him is not safe: after 0.8 s the soldier vaults up after him
      if (brawler && e.onGround && p.onGround && p.y < e.y - 100 && p.y > e.y - 340 && adx < 380) {
        e.upT = (e.upT || 0) + dt;
        if (e.upT > 0.8) { e.upT = 0; e.vy = -1250; e.vx = e.face * Math.min(320, adx * 1.4); e.onGround = false; Sound.sfx('jump', { x: e.x, rate: 0.85, vol: 0.6 }); break; }
      } else e.upT = 0;
      if (!e.onGround && e.vy < 0) break;   // in the air on a vault: keep the leap's speed
      // v12 (Connor's note 34): a whiff is punished at once (a shorter wind-up, no waiting turn)
      if (brawler && e.punishT > 0 && adx < 210 && ady < 130 && e.onGround) { e.punishT = 0; e.chain = 0; go(e, 'wind'); e.t = 0.14; e.vx = e.face * 160; Sound.sfx('swing', { x: e.x, rate: 0.8, vol: 0.4 }); break; }
      // v15 (Connor's note 68: "they're firebenders, they can throw fire"): out of reach he throws fire. A fist drawn
      // back with a glint (0.36 s, the tell), then a fast straight fire jab led at where Joon is going, or (one in three,
      // or when Joon is up on a ledge) a high arc of fire that lands on him
      e.jabCd = (e.jabCd ?? rnd(0.6, 1.4)) - dt;
      if (brawler && e.jabCd <= 0 && adx > 300 && adx < 820 && ady < 360 && e.onGround && onScreen(e) && mayWind(e) && busyAttackers() < 3) {
        go(e, 'fwind'); e.vx = 0; e.arc = ady > 120 || Math.random() < 0.33; e.jabCd = rnd(1.6, 2.4); Sound.sfx('boss-windup-fire', { x: e.x, rate: 1.5, vol: 0.35, gap: 0.2 }); break;
      }
      // v12: from just out of reach he steps back and lunges, most of all while a comrade holds Joon's attention
      e.lungeCd = (e.lungeCd || 0) - dt;
      if (brawler && e.lungeCd <= 0 && adx > 200 && adx < 430 && ady < 100 && e.onGround && (busyAttackers() > 0 || Math.random() < dt * 0.9) && groundAt(e.x + e.face * 300, e.y) && mayWind(e)) {
        go(e, 'lwind'); e.vx = -e.face * 170; e.lungeCd = rnd(2.2, 3.2); Sound.sfx('soldier-alert', { x: e.x, gap: 0.5, vol: 0.7 }); break;
      }
      if (adx < 135 && ady < 130) {
        if (busyAttackers() < 3 && mayWind(e)) { e.chain = 0; go(e, 'wind'); e.vx = 0; Sound.sfx('swing', { x: e.x, rate: 0.7, vol: 0.4 }); }
        else e.vx = approach(e.vx, -e.face * 120, 1600 * dt);        // wait your turn
      }
      else if (adx > 60 && e.onGround && (drop || groundAt(e.x + e.face * 50, e.y))) e.vx = approach(e.vx, e.face * e.speed, 1600 * dt);
      else e.vx = approach(e.vx, 0, 2400 * dt);
      break;
    case 'aim':
      e.face = sign(dx);
      if (p.dead || (!e.alert && (adx > 1250 || ady > 520))) { go(e, 'idle'); break; }
      if (drop) e.vx = approach(e.vx, e.face * e.speed, 1400 * dt);
      else if (adx < 300 && e.onGround && groundAt(e.x - e.face * 60, e.y) && e.x - e.face * 60 > 60 && e.x - e.face * 60 < G.room.w - 60) e.vx = approach(e.vx, -e.face * e.speed, 1400 * dt);
      else e.vx = approach(e.vx, 0, 2000 * dt);
      if (onScreen(e)) e.cd -= dt;
      if (e.cd <= 0 && e.onGround) { go(e, 'wind'); e.vx = 0; }
      break;
    case 'wind':
      e.vx = approach(e.vx, 0, 3000 * dt);
      if (!brawler && e.t > 0.3 && !e.glint) { e.glint = true; burst(e.x + e.face * 55, e.y - 125, 5, { color: ['#ffffff', '#ffd36b'], min: 40, max: 160, life: 0.2, size: 7, grav: 0 }); }
      if (e.t >= (brawler ? 0.34 : 0.44)) {   // v12 (note 34): grunt wind-ups 0.35 to 0.5 s (brawler was 0.42); v15 a touch quicker
        go(e, 'strike'); e.glint = false;
        if (brawler) {
          e.vx = e.face * 300;
          G.hurts.push({ x: e.face > 0 ? e.x + 5 : e.x - 155, y: e.y - 160, w: 150, h: 140, t: 0.13, delay: 0, dmg: 1, src: e, fromX: e.x });
          Sound.sfx('swing-big', { x: e.x, rate: 1.1, vol: 0.6 });
        } else {
          const sx = e.x + e.face * 55, sy = e.y - 125;
          let ang = Math.atan2((p.y - 80) - sy, p.x - sx);
          const lim = 0.7;
          if (e.face > 0) ang = clamp(ang, -lim, lim); else ang = ang > 0 ? Math.max(ang, Math.PI - lim) : Math.min(ang, -Math.PI + lim);
          if (e.type === 'ember') throwFlask(e);   // v10: a flask that leaves burning ground
          else {
            // v15 (note 68): the slinger leads its shot (where Joon will be when it arrives), throws faster, and one time
            // in three follows it at once with a high arc that drops where he is dodging to
            const lead = clamp((p.vx || 0) * Math.hypot(p.x - sx, p.y - sy) / 760, -260, 260);
            ang = Math.atan2((p.y - 80) - sy, p.x + lead - sx);
            if (e.face > 0) ang = clamp(ang, -lim, lim); else ang = ang > 0 ? Math.max(ang, Math.PI - lim) : Math.min(ang, -Math.PI + lim);
            spawnShot({ kind: 'fireball', x: sx, y: sy, vx: Math.cos(ang) * 760, vy: Math.sin(ang) * 760, r: 20, dmg: 1, life: 3.2, src: e });
            Sound.sfx('enemy-fireball', { x: e.x });
            if (Math.random() < 0.34) later(0.3, () => { if (!e.dead && e.state !== 'hurt') throwFire(e, true); });
            e.cd = rnd(1.15, 1.6);
          }
        }
      }
      break;
    case 'fwind':   // v15: the fire throw's tell
      e.vx = approach(e.vx, 0, 3000 * dt); e.face = sign(dx);
      if (e.t > 0.18 && !e.glint) { e.glint = true; burst(e.x - e.face * 20, e.y - 120, 6, { color: ['#ffffff', '#ffd36b', '#f0742a'], min: 40, max: 160, life: 0.22, size: 8, grav: 0 }); }
      if (e.t >= 0.36) { e.glint = false; throwFire(e, e.arc); go(e, 'recover'); }
      break;
    case 'strike':
      e.vx = approach(e.vx, 0, 1500 * dt);
      if (e.t >= 0.22) {
        // v12 (note 34): a brawler strings 2 or 3 blows while Joon stays in reach; each follow-up winds faster
        if (brawler && (e.chain || 0) < (e.maxChain ?? (e.maxChain = Math.random() < 0.35 ? 1 : 2)) && adx < 190 && ady < 130 && !p.dead) { e.chain = (e.chain || 0) + 1; go(e, 'wind'); e.t = 0.16; e.face = sign(dx); Sound.sfx('swing', { x: e.x, rate: 0.8, vol: 0.35 }); }
        else { e.maxChain = null; go(e, 'recover'); }
      }
      break;
    case 'recover':
      e.vx = approach(e.vx, 0, 3000 * dt);
      if (e.t >= (brawler ? 0.26 : 0.3)) go(e, brawler ? 'chase' : 'aim');   // v12: was 0.55; v15 (note 68): shorter gaps
      break;
    // v12 (note 34): the lunge: a short step back (the tell, 0.4 s), then a long low thrust that covers 300 px
    case 'lwind':
      e.vx = approach(e.vx, 0, 900 * dt);
      if (e.t > 0.25 && !e.glint) { e.glint = true; burst(e.x + e.face * 70, e.y - 110, 6, { color: ['#ffffff', '#ffd36b'], min: 40, max: 180, life: 0.22, size: 8, grav: 0 }); }
      if (e.t >= 0.42) {
        go(e, 'lunge'); e.glint = false; e.vx = e.face * 900;
        G.hurts.push({ follow: e, x: e.x, y: e.y - 150, w: 130, h: 120, t: 0.3, delay: 0, dmg: 1, src: e, fromX: e.x, lead: 40 });
        Sound.sfx('swing-big', { x: e.x, rate: 1.2, vol: 0.6 });
      }
      break;
    case 'lunge':
      if (!groundAt(e.x + e.face * 60, e.y) || e.hitX) e.vx = 0;
      e.vx = approach(e.vx, 0, 1800 * dt);
      if (e.t >= 0.36) go(e, 'recover');
      break;
    // v12 (note 34): guard. After two quick blows from the front he raises his guard: blows from the front glance off
    // and knock Joon back; then he counters. A heavy blow, an element, a strike from behind or above breaks through.
    case 'guard':
      e.vx = approach(e.vx, 0, 3000 * dt);
      if (e.t >= (e.guardFor || 0.45)) { e.chain = 1; e.maxChain = 1; go(e, 'wind'); e.t = 0.2; e.face = sign(dx); Sound.sfx('guard-counter', { x: e.x }); }
      break;
    default: genericHurt(e, dt, brawler ? 'chase' : 'aim');
  }
}
function genericHurt(e, dt, back) {
  if (e.state === 'hurt' || e.state === 'stun') {
    if (e.onGround) e.vx = approach(e.vx, 0, 2600 * dt);
    if (e.hurtT <= 0 && (e.onGround || e.flies)) { go(e, back); e.alert = true; }
  }
}
function soldierFrame(e) {
  const brawler = e.type === 'brawler' || e.type === 'captain';
  if (e.dead) return Assets.has('soldier.defeat') ? ['soldier.defeat', defeatFrame(e)] : ['soldier.hurt', Math.min(7, 4 + Math.floor(e.deadT * 9))];
  switch (e.state) {
    case 'hurt': case 'stun': return ['soldier.hurt', Math.min(3, Math.floor(e.t * 12))];
    case 'chase': return Math.abs(e.vx) > 30 ? ['soldier.walk', Math.floor(e.walkD / 26) % 8] : ['soldier.idle', Math.floor(e.animT * 7) % 8];
    case 'wind': return ['soldier.attack', 1 + Math.min(2, Math.floor(e.t / (brawler ? 0.42 : 0.5) * 3))];
    case 'fwind': return ['soldier.attack', 1 + Math.min(2, Math.floor(e.t / 0.36 * 3))];
    case 'strike': case 'lunge': return ['soldier.attack', e.t < 0.1 ? 4 : 5];
    case 'lwind': return ['soldier.attack', 1 + Math.min(2, Math.floor(e.t / 0.42 * 3))];
    case 'guard': return ['soldier.attack', 1];
    case 'recover': return e.t < 0.16 ? ['soldier.attack', 6] : ['soldier.idle', Math.floor(e.animT * 7) % 8];
    case 'aim': return Math.abs(e.vx) > 30 ? ['soldier.walk', (800 - Math.floor(e.walkD / 26)) % 8] : ['soldier.idle', Math.floor(e.animT * 7) % 8];
    default: return ['soldier.idle', Math.floor(e.animT * 7) % 8];
  }
}

// v12 (Connor's note 34): spam gets punished. Two plain blows from the front within 1.2 s and the third meets a raised
// guard: it glances off, Joon is knocked back a step with his combo broken, and the soldier counters 0.45 s later.
// Gust, a heavy blow (the finisher), any element, a down-strike or a strike from behind still land.
function brawlerHit(e, dmg, o) {
  const p = G.player, front = sign(p.x - e.x) === e.face;
  // the combo's finisher counts as a blow from the front too: two blows in, the third (the finisher, when mashed) is blocked
  const plain = o.basic && !o.down && !o.up && !o.gust;
  if (e.state === 'guard' && front && plain) return guardBlock(e);
  if (!plain || !front) { e.frontHits = 0; return dmg; }
  e.frontHits = (e.frontT > 0 ? (e.frontHits || 0) : 0) + 1; e.frontT = 1.2;
  if (e.frontHits >= 3 && e.onGround) { e.frontHits = 0; e.face = sign(p.x - e.x) || e.face; go(e, 'guard'); e.guardFor = 0.45; e.vx = 0; Sound.sfx('guard-raise', { x: e.x }); return guardBlock(e); }
  return dmg;
}
function guardBlock(e) {
  const p = G.player;
  e.guardHits = (e.guardHits || 0) + 1;
  // knocked back off the guard: the combo is broken and he can't strike again for a moment
  p.vx = (sign(p.x - e.x) || -e.face) * 560; p.atk = null; p.comboT = 0; p.atkQueued = false; p.atkLock = 0.38; p.recoilT = 0.22;
  hitstop(0.06); shake(4); Sound.sfx('parasol-clang', { x: e.x, rate: 1.3, vol: 0.6 }); Sound.sfx('player-recoil', { x: p.x });
  burst(e.x + e.face * 40, e.y - 110, 10, { color: ['#ffffff', '#ffd36b', '#f3e2bd'], min: 120, max: 420, angle: e.face > 0 ? 0 : Math.PI, spread: 0.9, life: 0.25, size: 9 });
  if (G.stats) G.stats.blocked = (G.stats.blocked || 0) + 1;
  return 'block';
}

// --- Shieldbearer ------------------------------------------------------------------------
function updateShield(e, dt) {
  const p = P(), dx = p.x - e.x, adx = Math.abs(dx), ady = Math.abs(p.y - e.y);
  if (e.guardDown > 0) e.guardDown -= dt;
  switch (e.state) {
    case 'idle':
      e.vx = approach(e.vx, 0, 2000 * dt);
      if (!p.dead && (e.alert || (adx < 800 && ady < 300 && onScreen(e)))) { go(e, 'walk'); Sound.sfx('clank', { x: e.x, rate: 0.7, vol: 0.5 }); if (!e.barked) { e.barked = true; Sound.sfx('soldier-alert', { x: e.x, rate: 0.85, gap: 0.35 }); } }
      break;
    case 'walk':
      if (sign(dx) !== e.face && adx > 30) { go(e, 'turn'); break; }
      if (adx < 175 && ady < 140 && e.guardDown <= 0) { if (busyAttackers() < 3 && mayWind(e)) { go(e, 'wind'); e.vx = 0; Sound.sfx('swing-big', { x: e.x, rate: 0.6, vol: 0.5 }); } break; }
      if (e.onGround && groundAt(e.x + e.face * 60, e.y) && adx > 120) e.vx = approach(e.vx, e.face * e.speed, 900 * dt);
      else e.vx = approach(e.vx, 0, 1800 * dt);
      break;
    case 'turn':   // heavy: the turn is the opening
      e.vx = approach(e.vx, 0, 2000 * dt);
      if (e.t > 0.5) { e.face = sign(dx); go(e, 'walk'); }
      break;
    case 'wind':
      e.vx = approach(e.vx, 0, 3000 * dt);
      if (e.t > 0.6) {
        go(e, 'strike'); e.vx = e.face * 140;
        G.hurts.push({ x: e.face > 0 ? e.x + 10 : e.x - 180, y: e.y - 150, w: 170, h: 150, t: 0.14, delay: 0, dmg: G.room.region === 'kite' ? 1 : 2, src: e, fromX: e.x });   // v11 (review 11 #6): 1 heart in Kite Hill, where he is met first
        Sound.sfx('mace', { x: e.x }); shake(8); Sound.rumble(0.3, 0.2, 90);
        addFx('dust', e.x + e.face * 110, e.y + 6, { dur: 0.35, size: 200, anchor: 'bottom' });
      }
      break;
    case 'strike': e.vx = approach(e.vx, 0, 2000 * dt); if (e.t > 0.16) { go(e, 'recover'); e.guardDown = 0.8; } break;
    case 'recover': e.vx = approach(e.vx, 0, 3000 * dt); if (e.t > 0.8) go(e, 'walk'); break;
    default: genericHurt(e, dt, 'walk');
  }
}
function shieldHit(e, dmg, o) {
  const p = P(), from = o.fromX ?? p.x;
  const open = e.guardDown > 0 || e.state === 'turn' || e.state === 'recover' || e.state === 'strike' || e.state === 'stun';
  if (o.slam || o.launch) { e.guardDown = 1.2; return dmg; }
  if (o.gust && Math.abs(p.x - e.x) < 260) { e.guardDown = 0.9; Sound.sfx('guard-break', { x: e.x }); addFx('guardbreak', e.x + e.face * 40, e.y - 120, { dur: 0.4, size: 260, face: e.face }); return 0; }
  if (open || o.down || sign(from - e.x) !== e.face) return dmg;
  // blocked from the front
  Sound.sfx('block', { x: e.x }); shake(3); hitstop(0.04);
  addFx('blockspark', e.x + e.face * 50, e.y - 120, { dur: 0.2, size: 190 });
  if (o.basic) { p.vx = sign(p.x - e.x) * 420; }
  // v10 (note 15): no banner; the clang and the push-back say it, and a dash through him opens his back (note 19)
  return 'block';
}
function shieldFrame(e) {
  if (e.dead) return ['shield.attack', 6];
  switch (e.state) {
    case 'walk': return Math.abs(e.vx) > 20 ? ['shield.walk', Math.floor(e.walkD / 18) % 8] : ['shield.walk', 0];
    case 'turn': return ['shield.walk', 4];
    case 'wind': return ['shield.attack', 1 + Math.min(3, Math.floor(e.t / 0.6 * 4))];
    case 'strike': return ['shield.attack', 5];
    case 'recover': return ['shield.attack', e.t < 0.4 ? 6 : 7];
    case 'hurt': case 'stun': return ['shield.attack', 6];
    default: return e.guardDown > 0 ? ['shield.attack', 6] : ['shield.walk', 0];
  }
}

// --- Ember Archer --------------------------------------------------------------------------
function updateArcher(e, dt) {
  const p = P(), dx = p.x - e.x, adx = Math.abs(dx), dy = p.y - e.y;
  switch (e.state) {
    case 'idle':
      e.vx = approach(e.vx, 0, 2000 * dt);
      if (p.dead) break;
      e.face = sign(dx);
      if (adx < 240 && !e.hopped && e.onGround) { e.hopped = true; e.vx = -e.face * 520; e.vy = -620; e.onGround = false; go(e, 'hop'); Sound.sfx('jump2', { x: e.x, rate: 0.8, vol: 0.6 }); break; }
      if (onScreen(e) && adx < 1300) e.cd -= dt;
      // no shot from up here for a while: drop down to your level
      // v6: in a locked fight the ledge is never a hiding place: 2 s above Joon (any height) and it drops
      { const lock = lockedFight();
        if (dy > (lock ? 120 : 260) && e.ground && e.ground.oneway) { e.below = (e.below || 0) + dt; if (e.below > (lock ? 2 : 4)) { e.dropT = 0.3; e.below = 0; } } else e.below = 0; }
      if (e.cd <= 0 && e.onGround) { go(e, 'draw'); Sound.sfx('bow-draw', { x: e.x }); }
      break;
    case 'hop': if (e.onGround && e.t > 0.15) { e.vx = 0; go(e, 'idle'); } break;
    case 'draw': {
      e.vx = approach(e.vx, 0, 3000 * dt); e.face = sign(dx);
      if (e.t < 0.5) e.aim = e.type === 'potter' ? { x: p.x + (p.vx || 0) * 0.3, y: p.y } : { x: p.x, y: p.y - 70 };           // the line locks 0.2 s before release
      if (e.t > 0.7 && e.type === 'potter') { lobPot(e); go(e, 'loose'); e.cd = rnd(1.7, 2.2); }
      else if (e.t > 0.7) {
        const sx = e.x + e.face * 60, sy = e.y - 130, tx = e.aim.x, ty = e.aim.y;
        const g = 1500, flight = clamp(Math.abs(tx - sx) / 900, 0.35, 1.1);
        spawnShot({ kind: 'arrow', x: sx, y: sy, vx: (tx - sx) / flight, vy: (ty - sy - 0.5 * g * flight * flight) / flight, grav: g, r: 14, dmg: 1, life: 3, src: e });
        Sound.sfx('arrow', { x: e.x }); go(e, 'loose');
        e.cd = G.room.region === 'brass' ? 1.5 : 1.9;   // v15 (note 68): was 2.2 / 2.9
      }
      break; }
    case 'loose': if (e.t > 0.35) go(e, 'idle'); break;
    default: genericHurt(e, dt, 'idle');
  }
}
function archerFrame(e) {
  if (e.dead) return ['archer.shoot', 7];
  switch (e.state) {
    case 'draw': return ['archer.shoot', 1 + Math.min(3, Math.floor(e.t / 0.7 * 4))];
    case 'loose': return ['archer.shoot', e.t < 0.12 ? 5 : e.t < 0.24 ? 6 : 7];
    case 'hurt': case 'stun': return ['archer.shoot', 7];
    default: return ['archer.shoot', 0];
  }
}
// The dotted arc of the arrow being drawn: shows where it will land.
function drawArcherAim(ctx, e) {
  if (e.state !== 'draw' || !e.aim) return;
  const sx = e.x + e.face * 60, sy = e.y - 130, g = 1500, flight = clamp(Math.abs(e.aim.x - sx) / 900, 0.35, 1.1);
  const vx = (e.aim.x - sx) / flight, vy = (e.aim.y - sy - 0.5 * g * flight * flight) / flight;
  const locked = e.t >= 0.5;
  ctx.save(); ctx.globalAlpha = locked ? 0.85 : 0.45 + 0.2 * Math.sin(G.time * 30);
  ctx.fillStyle = locked ? '#ffd36b' : '#f0742a';
  // v14 (note 57): each dot is fx/aim-dots.png (a cream ink dot, tinted gold or orange) once it lands
  const dot = Assets.get('fx.aimdot');
  for (let k = 0.05; k < 1; k += 0.06) { const t = flight * k, px = sx + vx * t, py = sy + vy * t + 0.5 * g * t * t;
    if (dot) { const z = locked ? 16 : 13; ctx.drawImage(dot.img, px - z / 2, py - z / 2, z, z); continue; }
    ctx.beginPath(); ctx.arc(px, py, locked ? 5 : 4, 0, 7); ctx.fill(); }
  ctx.restore();
}

// --- Cinder Moth ---------------------------------------------------------------------------
function updateMoth(e, dt) {
  const p = P();
  e.flies = e.state !== 'grounded' && e.state !== 'hurt';
  const steer = (tx, ty, sp) => { const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1; e.vx = approach(e.vx, dx / d * Math.min(sp, d * 4), 1800 * dt); e.vy = approach(e.vy, dy / d * Math.min(sp, d * 4), 1800 * dt); };
  if (e.flies && Math.floor(e.animT * 2) !== Math.floor((e.animT - dt) * 2) && onScreen(e) && Math.random() < 0.3) Sound.sfx('flutter', { x: e.x, vol: 0.5 });
  switch (e.state) {
    case 'idle': {
      const t = e.animT;
      steer(e.hx + Math.sin(t * 0.9) * 110, e.hy + Math.sin(t * 1.8) * 40, 220);
      e.face = sign(e.vx || 1);
      e.cd -= dt;
      const d = Math.hypot(p.x - e.x, p.y - 80 - e.y);
      if (!p.dead && d < 560 && e.cd <= 0 && !G.enemies.some((q) => q.type === 'moth' && q !== e && ['rise', 'flare', 'swoop'].includes(q.state))) {
        e.side = sign(e.x - p.x); go(e, 'rise');
      }
      break; }
    case 'rise':
      steer(p.x + e.side * 220, p.y - 330, 520); e.face = -e.side;
      if (e.t > 0.7) { go(e, 'flare'); e.vx = 0; e.vy = 0; Sound.sfx('shriek', { x: e.x }); e.from = { x: e.x, y: e.y }; e.mid = { x: p.x, y: p.y - 60 }; e.to = { x: p.x - e.side * 300, y: p.y - 320 }; }
      break;
    case 'flare': e.vx = 0; e.vy = 0; if (e.t > 0.5) { go(e, 'swoop'); e.dropped = 0; } break;
    case 'swoop': {
      const k = Math.min(1, e.t / 0.75), a = e.from, m = e.mid, b = e.to;
      const nx = (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * m.x + k * k * b.x, ny = (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * m.y + k * k * b.y;
      e.vx = (nx - e.x) / dt; e.vy = (ny - e.y) / dt; e.face = sign(b.x - a.x);
      if (e.dropped < 3 && k > 0.25 + e.dropped * 0.2) { e.dropped++; spawnShot({ kind: 'cinder', x: e.x, y: e.y, vx: rnd(-60, 60), vy: 0, grav: 1400, r: 12, dmg: 1, life: 2.5, src: e }); }
      if (k >= 1) { go(e, 'idle'); e.cd = rnd(1.6, 2.4); e.hx = clamp(e.x, 100, G.room.w - 100); e.hy = e.y; }
      break; }
    case 'grounded':     // blown out of the air: stunned on the floor, easy to finish
      e.vx = approach(e.vx, 0, 1200 * dt);
      if (e.t > 1.4) { go(e, 'idle'); e.vy = -300; }
      break;
    case 'hurt': if (e.hurtT <= 0) go(e, e.groundNext ? 'grounded' : 'idle'); e.groundNext = false; break;
  }
}
function mothHit(e, dmg, o) {
  if (o.ring) return 0;                                   // it is fire: the flame ring does nothing
  if (o.burn) return Math.ceil(dmg / 2);
  if (o.gust) { e.groundNext = true; e.hurtT = 0.3; e.blownT = 1; Sound.sfx('flutter', { x: e.x, rate: 0.7 }); }
  return dmg;
}
function mothFrame(e) {
  if (e.dead) return ['moth.fly', 4];
  if (e.state === 'flare') return ['moth.fly', 3 + (Math.floor(e.t * 10) % 2)];
  if (e.state === 'swoop') return ['moth.fly', 4];
  if (e.state === 'grounded') return ['moth.fly', 4];
  return ['moth.fly', Math.floor(e.animT * 12) % 8];
}

// --- Reed Snapper ---------------------------------------------------------------------------
function updateSnapper(e, dt) {
  const p = P(), dx = p.x - e.x, adx = Math.abs(dx), ady = Math.abs(p.y - e.y);
  e.shell = !['settle', 'flipped'].includes(e.state);
  switch (e.state) {
    case 'idle':   // a tuft of reeds at the water's edge
      e.vx = approach(e.vx, 0, 2000 * dt);
      if (!p.dead && adx < 340 && ady < 200) { go(e, 'scuttle'); Sound.sfx('chitter', { x: e.x, rate: 0.7 }); }
      break;
    case 'scuttle':
      e.face = sign(dx);
      if (adx < 160 && ady < 120) { go(e, 'open'); e.vx = 0; Sound.sfx('chitter', { x: e.x, rate: 1.2, vol: 0.6 }); break; }
      if (adx > 700) { go(e, 'idle'); break; }
      e.vx = approach(e.vx, e.onGround && (groundAt(e.x + e.face * 70, e.y) || e.wades) ? e.face * 240 : 0, 1600 * dt);
      break;
    case 'open': e.vx = approach(e.vx, 0, 3000 * dt); if (e.t > 0.45) { go(e, 'snap'); e.vx = e.face * 260; Sound.sfx('snap', { x: e.x }); G.hurts.push({ x: e.face > 0 ? e.x + 10 : e.x - 160, y: e.y - 90, w: 150, h: 90, t: 0.12, delay: 0, dmg: 1, src: e, fromX: e.x, hold: 0.3 }); } break;
    case 'snap': e.vx = approach(e.vx, 0, 2500 * dt); if (e.t > 0.15) go(e, 'settle'); break;
    case 'settle': e.vx = 0; if (e.t > 0.7) go(e, 'scuttle'); break;
    case 'flipped': e.vx = approach(e.vx, 0, 2000 * dt); if (e.t > FLIP_T && e.onGround) { go(e, 'scuttle'); e.vy = -300; Sound.sfx('chitter', { x: e.x, rate: 1.3 }); } break;
    default: genericHurt(e, dt, 'scuttle');
  }
}
const FLIP_T = 3.0;   // v10 (Connor's note 22): on its back for 3 s
function snapperHit(e, dmg, o) {
  if (o.whip || o.launch || o.gust) { if (e.state !== 'flipped') { go(e, 'flipped'); Sound.sfx('flip', { x: e.x, x: e.x }); } e.vy = -420; e.onGround = false; return dmg; }
  if (e.state === 'flipped') return dmg * 2;
  if (e.state === 'settle') return o.burn ? Math.ceil(dmg / 2) : dmg;
  if (o.slam) return Math.ceil(dmg / 2);
  // shell
  Sound.sfx('clank', { x: e.x, rate: 1.4, vol: 0.7 }); hitstop(0.03);
  burst(e.x, e.y - 60, 5, { color: ['#ffffff', '#86b46a'], min: 80, max: 260, life: 0.25, size: 7 });
  // v11 (note 15): no 'Shell' pop word: the spark and the clack say it
  return 'block';
}
function snapperFrame(e) {
  if (e.dead) return ['snapper.walk', 6];
  switch (e.state) {
    case 'scuttle': return ['snapper.walk', Math.floor(e.walkD / 16) % 4];
    case 'open': return ['snapper.walk', 4];
    case 'snap': return ['snapper.walk', 5];
    case 'settle': return ['snapper.walk', 6 + (e.t > 0.35 ? 1 : 0)];
    case 'flipped': return ['snapper.walk', 6];
    default: return ['snapper.walk', 0];
  }
}

// --- Quarry Mite -----------------------------------------------------------------------------
function updateMite(e, dt) {
  const p = P(), dx = p.x - e.x, adx = Math.abs(dx), ady = Math.abs(p.y - e.y);
  Sound.loop('roll-loop', G.enemies.some((q) => q.type === 'mite' && q.state === 'roll' && !q.dead && onScreen(q)));
  switch (e.state) {
    case 'idle': case 'walk':
      e.state = 'walk';
      if (e.onGround && (!groundAt(e.x + e.face * 34, e.y) || e.hitX)) e.face = -e.face;   // turn at edges
      e.vx = approach(e.vx, e.face * 130, 900 * dt);
      if (!p.dead && ady < 90 && adx < 420 && e.onGround && e.cd <= 0) { e.face = sign(dx); go(e, 'curl'); e.vx = 0; Sound.sfx('chitter', { x: e.x }); }
      e.cd -= dt;
      break;
    case 'curl': e.vx = 0; if (e.t > 0.35) { go(e, 'roll'); e.rollDir = e.face; e.spin = 0; } break;
    case 'roll':
      e.vx = approach(e.vx, e.rollDir * 620, 2400 * dt);
      e.spin += e.vx * dt / 30;
      if (e.hitX) { go(e, 'dazed'); e.vx = -e.rollDir * 120; Sound.sfx('thud-wall', { x: e.x }); shake(3); burst(e.x + e.rollDir * 30, e.y - 25, 6, { color: ['#c2a06a', '#9c7c4d'], min: 60, max: 220, life: 0.3, size: 8, shape: 'chunk', grav: 1400 }); }
      if (e.t > 4) go(e, 'dazed');
      break;
    case 'dazed': e.vx = approach(e.vx, 0, 1200 * dt); if (e.t > 0.9) { go(e, 'walk'); e.cd = 1.2; } break;
    default: genericHurt(e, dt, 'walk');
  }
}
function miteHit(e, dmg, o) {
  if (e.state === 'roll') {
    if (o.gust) { e.rollDir = -e.rollDir; e.vx = e.rollDir * 700; Sound.sfx('thud-wall', { x: e.x, rate: 1.4 }); return 0; }
    if (o.basic && !o.down && sign((o.fromX ?? P().x) - e.x) === e.rollDir) { Sound.sfx('clank', { x: e.x, rate: 1.6, vol: 0.5 }); return 'block'; }
  }
  return dmg;
}
function miteFrame(e) {
  if (e.dead) return ['mite.walk', 4];
  switch (e.state) {
    case 'curl': case 'dazed': return ['mite.walk', 4];
    case 'roll': return ['mite.walk', 5 + (Math.floor(Math.abs(e.spin)) % 3)];
    default: return ['mite.walk', Math.floor(e.walkD / 12) % 4];
  }
}

// --- Kiln Hound --------------------------------------------------------------------------------
function updateHound(e, dt) {
  const p = P(), dx = p.x - e.x, adx = Math.abs(dx), ady = Math.abs(p.y - e.y);
  switch (e.state) {
    case 'idle':
      e.vx = approach(e.vx, 0, 2000 * dt);
      if (!p.dead && (e.alert || (adx < 900 && ady < 300 && onScreen(e)))) { go(e, 'run'); Sound.sfx('bark', { x: e.x }); }
      break;
    case 'run':
      e.face = sign(dx);
      if (e.onGround && (adx < 520 && adx > 120 || adx < 120) && ady < 160 && e.cd <= 0) { go(e, 'crouch'); e.vx = 0; Sound.sfx('growl', { x: e.x }); break; }
      e.cd -= dt;
      e.vx = approach(e.vx, e.onGround && groundAt(e.x + e.face * 80, e.y) ? e.face * 430 : 0, 2200 * dt);
      if (e.hitObj && e.hitX && e.hitObj.pillar) wallStun(e);
      break;
    case 'crouch':
      e.vx = 0;
      if (Math.random() < 0.5) burst(e.x - e.face * 20, e.y - 60, 1, { color: ['#ffd36b', '#f0742a'], min: 20, max: 90, angle: -Math.PI / 2, spread: 0.6, life: 0.4, size: 9, grav: -200 });
      if (e.t > 0.4) { const d = clamp(adx, 160, 480); go(e, 'leap'); e.vx = e.face * d / 0.55; e.vy = -760; e.onGround = false; Sound.sfx('pounce', { x: e.x }); }
      break;
    case 'leap':
      G.hurts.push({ x: e.x - 70, y: e.y - 100, w: 140, h: 100, t: dt * 1.5, delay: 0, dmg: 1, fromX: e.x, src2: e });
      if (e.hitX && e.hitObj && e.hitObj.pillar) { wallStun(e); break; }
      if (e.onGround && e.t > 0.1) { go(e, 'skid'); Sound.sfx('skid', { x: e.x }); addFx('dust', e.x, e.y + 6, { dur: 0.35, size: 180, face: e.face, anchor: 'bottom' }); }
      break;
    case 'skid': e.vx = approach(e.vx, 0, 1300 * dt); if (e.t > 0.6) { go(e, 'run'); e.cd = 0.9; } break;
    case 'stun': e.vx = approach(e.vx, 0, 2000 * dt); if (e.t > 1.5) go(e, 'run'); break;
    default: genericHurt(e, dt, 'run');
  }
}
function wallStun(e) {
  const pl = e.hitObj;
  go(e, 'stun'); e.vx = -e.face * 160; e.vy = -200; Sound.sfx('thud-wall', { x: e.x }); shake(6);
  if (pl.kind === 'ice') pl.t = pl.life;
}
function houndHit(e, dmg, o) { if (o.whip) { Sound.sfx('burn', { x: e.x, rate: 1.5 }); burst(e.x, e.y - 60, 10, { color: ['#f3ecdf', '#cfc6c0'], min: 40, max: 200, angle: -Math.PI / 2, spread: 0.8, life: 0.7, size: 16, grav: -200 }); return dmg * 2; } if (o.burn || o.ring) return Math.ceil(dmg / 2); return dmg; }
function houndFrame(e) {
  if (e.dead) return ['hound.pounce', 6];
  switch (e.state) {
    case 'run': return ['hound.run', Math.floor(e.walkD / 34) % 8];
    case 'crouch': return ['hound.pounce', 1 + (e.t > 0.2 ? 1 : 0)];
    case 'leap': return ['hound.pounce', e.vy < 0 ? 3 : 4];
    case 'skid': return ['hound.pounce', e.t < 0.3 ? 5 : 6];
    case 'stun': case 'hurt': return ['hound.pounce', 7];
    default: return ['hound.run', 0];
  }
}


// --- v10 (Connor's note 14): four foes of our own, each with one rule and a readable wind-up ------------------------
//   parasol  Parasol Guard (Kite Hill): a wide brass dome held overhead. Down-strikes ring off it and throw Joon back
//            up; hit him from the side, or tear the dome away with a Gust or a deflected shot. Dashed through, he is
//            slow to turn round.
//   hook     Hook-Blade Duelist (Ninefold Quarry): curved blades guard both sides, so any blow from the side is
//            parried with a clang (and he answers with a quick lunge). Hit him from above, or in the opening after
//            his lunge.
//   ember    Ember Slinger (Kilnmouth): lobs clay flasks of burning oil that leave burning ground for 3.5 s. Jump or
//            glide over it, or put it out with ice or a whip of water.
//   potter   Pot Lobber (the Drowned Steps): lobs fire-pots in a high arc. The pot's shadow grows on the ground where
//            it will land; be somewhere else.
const ARMY_TINT = { parasol: 'rgba(40,50,130,0.32)', hook: 'rgba(20,80,90,0.32)', ember: 'rgba(210,90,30,0.30)', potter: 'rgba(110,70,30,0.22)' };
function updateParasol(e, dt) {
  const p = P(), dx = p.x - e.x, adx = Math.abs(dx), ady = Math.abs(p.y - e.y);
  if (e.dome === undefined) e.dome = true;
  if (e.domeOffT > 0 && (e.domeOffT -= dt) <= 0) { e.dome = true; Sound.sfx('parasol-open', { x: e.x }); burst(e.x, e.y - 215, 6, { color: ['#ffe9a8', '#b08d3c'], min: 40, max: 160, life: 0.3, size: 7 }); }
  if (e.domeFly) { const d = e.domeFly; d.t += dt; d.vy += 2200 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vx * dt / 60; if (d.t > 1.2) e.domeFly = null; }
  if (lockedFight()) e.alert = true;
  switch (e.state) {
    case 'idle':
      e.vx = approach(e.vx, 0, 2000 * dt);
      if (!p.dead && (e.alert || (adx < 820 && ady < 300 && onScreen(e)))) { go(e, 'walk'); if (!e.barked) { e.barked = true; Sound.sfx('soldier-alert', { x: e.x, rate: 0.9, gap: 0.35 }); } }
      break;
    case 'walk':
      if (sign(dx) !== e.face && adx > 30) { go(e, 'turn'); break; }
      if (adx < 200 && ady < 140) {
        if (busyAttackers() < 3 && mayWind(e)) { go(e, 'wind'); e.vx = 0; Sound.sfx('enemy-idle-shift', { x: e.x, vol: 1.6 }); }   // v11: his armour rattles as he tips the dome
        else e.vx = approach(e.vx, 0, 1800 * dt);
        break;
      }
      e.vx = approach(e.vx, e.onGround && groundAt(e.x + e.face * 60, e.y) && adx > 150 ? e.face * e.speed : 0, 1200 * dt);
      break;
    case 'turn': e.vx = approach(e.vx, 0, 2000 * dt); if (e.t > 0.45) { e.face = sign(dx); go(e, 'walk'); } break;   // slow: the turn is his opening
    case 'wind':
      e.vx = approach(e.vx, 0, 3000 * dt);
      if (e.t > 0.32 && !e.glint) { e.glint = true; burst(e.x + e.face * 120, e.y - 118, 5, { color: ['#ffffff', '#ffe9a8'], min: 30, max: 120, life: 0.2, size: 7, grav: 0 }); }
      if (e.t > 0.5) {
        go(e, 'strike'); e.glint = false; e.vx = e.face * 280;
        G.hurts.push({ x: e.face > 0 ? e.x + 10 : e.x - 200, y: e.y - 150, w: 190, h: 70, t: 0.14, delay: 0, dmg: 1, src: e, fromX: e.x });
        Sound.sfx('parasol-ram', { x: e.x });   // v11: his own ram sound (was the duelist's lunge)
      }
      break;
    case 'strike': e.vx = approach(e.vx, 0, 2000 * dt); if (e.t > 0.18) go(e, 'recover'); break;
    case 'recover': e.vx = approach(e.vx, 0, 3000 * dt); if (e.t > 0.6) go(e, 'walk'); break;
    default: genericHurt(e, dt, 'walk');
  }
}
function parasolHit(e, dmg, o) {
  const p = P();
  if (e.dome !== false && ((o.gust && Math.abs(p.x - e.x) < 360) || o.reflected)) {
    e.dome = false; e.domeOffT = 4.5;
    e.domeFly = { x: e.x, y: e.y - 215, vx: sign(e.x - (o.fromX ?? p.x)) * 560, vy: -760, rot: 0, t: 0 };
    Sound.sfx('parasol-off', { x: e.x }); shake(6);
    return o.reflected ? dmg : 0;
  }
  // v12 (Connor's note 34): with the dome up, a plain blow from the front glances off it and knocks Joon back. Gust it
  // off first (or hit him from behind): that is this foe's question
  if (e.dome !== false && o.basic && !o.down && sign(p.x - e.x) === e.face && !['recover', 'turn', 'hurt', 'stun'].includes(e.state)) return guardBlock(e);   // after his ram (or while he turns) the dome is tipped: that is the opening
  if (e.dome !== false && o.down) {
    Sound.sfx('parasol-clang', { x: e.x }); hitstop(0.04); shake(3);
    burst(p.x, e.y - 240, 8, { color: ['#ffffff', '#ffe9a8', '#b08d3c'], min: 80, max: 300, angle: -Math.PI / 2, spread: 1.2, life: 0.3, size: 8 });
    return 'block';
  }
  return dmg;
}
function parasolFrame(e) {
  if (e.dead) return ['soldier.defeat', defeatFrame(e)];
  switch (e.state) {
    case 'walk': return Math.abs(e.vx) > 20 ? ['soldier.walk', Math.floor(e.walkD / 26) % 8] : ['soldier.idle', Math.floor(e.animT * 7) % 8];
    case 'turn': return ['soldier.idle', 0];
    case 'wind': return ['soldier.attack', 1 + Math.min(2, Math.floor(e.t / 0.5 * 3))];
    case 'strike': case 'lunge': return ['soldier.attack', e.t < 0.1 ? 4 : 5];
    case 'lwind': return ['soldier.attack', 1 + Math.min(2, Math.floor(e.t / 0.42 * 3))];
    case 'guard': return ['soldier.attack', 1];
    case 'recover': return e.t < 0.16 ? ['soldier.attack', 6] : ['soldier.idle', Math.floor(e.animT * 7) % 8];
    case 'hurt': case 'stun': return ['soldier.hurt', Math.min(3, Math.floor(e.t * 12))];
    default: return ['soldier.idle', Math.floor(e.animT * 7) % 8];
  }
}
// The brass dome: a shallow cap on a pole from the off hand, ribbed, with an indigo trim.
function drawDome(ctx, x, y, face, tilt = 0, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.rotate(tilt * face);
  const R = 96;
  ctx.lineWidth = 6; ctx.strokeStyle = INK_E; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 92); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#6d4a3f'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 90); ctx.stroke();
  const g = ctx.createLinearGradient(0, -48, 0, 8); g.addColorStop(0, '#f2d58a'); g.addColorStop(0.55, '#c9a04e'); g.addColorStop(1, '#8a6a2c');
  ctx.beginPath(); ctx.moveTo(-R, 6); ctx.quadraticCurveTo(-R * 0.9, -46, 0, -50); ctx.quadraticCurveTo(R * 0.9, -46, R, 6); ctx.quadraticCurveTo(0, 18, -R, 6); ctx.closePath();
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK_E; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(80,55,20,0.7)';
  for (const k of [-0.6, -0.25, 0.25, 0.6]) { ctx.beginPath(); ctx.moveTo(0, -48); ctx.quadraticCurveTo(R * k * 0.7, -30, R * k, 9); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(-R + 4, 7); ctx.quadraticCurveTo(0, 20, R - 4, 7); ctx.lineWidth = 6; ctx.strokeStyle = '#3d3a7a'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -52, 7, 0, 7); ctx.fillStyle = '#f2d58a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK_E; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-R * 0.35, -26, 18, 6, -0.4, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
  ctx.restore();
}
const INK_E = '#1d1420';

function updateHook(e, dt) {
  const p = P(), dx = p.x - e.x, adx = Math.abs(dx), ady = Math.abs(p.y - e.y);
  if (lockedFight()) e.alert = true;
  switch (e.state) {
    case 'idle':
      e.vx = approach(e.vx, 0, 2000 * dt);
      if (!p.dead && (e.alert || (adx < 800 && ady < 300 && onScreen(e)))) { go(e, 'stalk'); e.cd = rnd(0.6, 1.1); if (!e.barked) { e.barked = true; Sound.sfx('soldier-alert', { x: e.x, rate: 1.1, gap: 0.35 }); } }
      break;
    case 'stalk': {
      e.face = sign(dx);
      // keeps a lunge's length away, circling in and out
      const want = adx > 330 ? 1 : adx < 210 ? -1 : 0;
      e.vx = approach(e.vx, want && e.onGround && groundAt(e.x + want * e.face * 60, e.y) ? want * e.face * e.speed : 0, 1500 * dt);
      e.cd -= dt;
      if (e.cd <= 0 && adx < 560 && ady < 150 && mayWind(e) && busyAttackers() < 3) { go(e, 'wind'); e.vx = 0; Sound.sfx('boss-windup-blade', { x: e.x, vol: 0.55 }); }
      break; }
    case 'wind':
      e.vx = approach(e.vx, 0, 3000 * dt);
      if (e.t > 0.55) {
        go(e, 'lunge'); e.vx = e.face * 1050;
        G.hurts.push({ follow: e, x: e.x, y: e.y - 150, w: 150, h: 130, t: 0.3, delay: 0, dmg: 1, src: e, fromX: e.x });
        Sound.sfx('hook-lunge', { x: e.x });
        addFx('dashstreak', e.x - e.face * 40, e.y - 90, { dur: 0.25, face: e.face, size: 200 });
      }
      break;
    case 'lunge':
      if (e.hitX || e.t > 0.3 || !groundAt(e.x + e.face * 50, e.y)) { go(e, 'recover'); e.vx *= 0.3; Sound.sfx('captain-skid', { x: e.x, vol: 0.5, rate: 1.2 }); }
      break;
    case 'recover':   // blades low: the opening
      e.vx = approach(e.vx, 0, 2600 * dt);
      if (e.t > 0.85) { go(e, 'stalk'); e.cd = rnd(0.8, 1.2); }
      break;
    default: genericHurt(e, dt, 'stalk');
  }
}
function hookHit(e, dmg, o) {
  const p = P();
  if (o.down || o.slam || o.launch || e.state === 'recover' || e.state === 'stun' || (e.state === 'hurt' && e.hurtT > 0)) return dmg;
  // both sides guarded: parried with a clang, and he answers
  Sound.sfx('hook-parry', { x: e.x }); hitstop(0.05); shake(4);
  addFx('blockspark', e.x + sign((o.fromX ?? p.x) - e.x) * 50, e.y - 110, { dur: 0.2, size: 170 });
  if (o.basic) p.vx = sign(p.x - e.x) * 460;
  if (e.state === 'stalk' || e.state === 'idle') { e.face = sign(p.x - e.x); go(e, 'wind'); e.t = 0.25; }
  return 'block';
}
function hookFrame(e) {
  if (e.dead) return ['soldier.defeat', defeatFrame(e)];
  switch (e.state) {
    case 'stalk': return Math.abs(e.vx) > 30 ? ['soldier.walk', (e.vx * e.face > 0 ? Math.floor(e.walkD / 26) : 800 - Math.floor(e.walkD / 26)) % 8] : ['soldier.idle', Math.floor(e.animT * 7) % 8];
    case 'wind': return ['soldier.attack', 1 + Math.min(2, Math.floor(e.t / 0.55 * 3))];
    case 'lunge': return ['soldier.attack', 4 + (e.t > 0.12 ? 1 : 0)];
    case 'recover': return ['soldier.attack', 6];
    case 'hurt': case 'stun': return ['soldier.hurt', Math.min(3, Math.floor(e.t * 12))];
    default: return ['soldier.idle', Math.floor(e.animT * 7) % 8];
  }
}
// Two hooked blades: a crescent of steel on a short grip, one forward and one behind.
function drawBlade(ctx, x, y, ang, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(0, -6); ctx.lineWidth = 9; ctx.strokeStyle = INK_E; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = '#6d4a3f'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4, -6); ctx.quadraticCurveTo(34, -40, 10, -96); ctx.quadraticCurveTo(-6, -104, -14, -92); ctx.quadraticCurveTo(10, -60, -12, -10); ctx.closePath();
  const g = ctx.createLinearGradient(-10, -100, 30, -10); g.addColorStop(0, '#f4f7fb'); g.addColorStop(1, '#8c9aa6');
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK_E; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(12, -2); ctx.lineWidth = 6; ctx.strokeStyle = '#b08d3c'; ctx.stroke();
  ctx.restore();
}

// v15 (note 68): a firebender's thrown fire. Straight: a fast jab led at where Joon is going. Arc: a lob that lands on
// him (led too), for a target up on a ledge or one keeping its distance.
function throwFire(e, arc) {
  const p = P(), sx = e.x + e.face * 55, sy = e.y - 125;
  if (arc) {
    const g = 1700, tx = p.x + (p.vx || 0) * 0.5, ty = p.y - 30, flight = clamp(Math.abs(tx - sx) / 700, 0.6, 1.1);
    spawnShot({ kind: 'fireball', x: sx, y: sy - 20, vx: (tx - sx) / flight, vy: (ty - sy + 20 - 0.5 * g * flight * flight) / flight, grav: g, r: 20, dmg: 1, life: 3, src: e });
  } else {
    const lead = clamp((p.vx || 0) * Math.abs(p.x - sx) / 820, -240, 240);
    let ang = Math.atan2((p.y - 80) - sy, p.x + lead - sx); const lim = 0.6;
    if (e.face > 0) ang = clamp(ang, -lim, lim); else ang = ang > 0 ? Math.max(ang, Math.PI - lim) : Math.min(ang, -Math.PI + lim);
    spawnShot({ kind: 'fireball', x: sx, y: sy, vx: Math.cos(ang) * 820, vy: Math.sin(ang) * 820, r: 18, dmg: 1, life: 2.6, src: e });
  }
  Sound.sfx('enemy-fireball', { x: e.x, rate: arc ? 0.9 : 1.15, vol: 0.8, pitch: 0.06 });
}
// Ember Slinger and Pot Lobber share the soldier's and the archer's bodies; their throws are their own.
function throwFlask(e) {
  const p = P(), sx = e.x + e.face * 40, sy = e.y - 150, tx = p.x + (p.vx || 0) * 0.25, ty = p.y - 10, g = 1500;
  const flight = clamp(Math.abs(tx - sx) / 750, 0.55, 1.0);
  spawnShot({ kind: 'flask', x: sx, y: sy, vx: (tx - sx) / flight, vy: (ty - sy - 0.5 * g * flight * flight) / flight, grav: g, r: 16, dmg: 1, life: 3, src: e });
  Sound.sfx('fire-flask-throw', { x: e.x });
  e.cd = rnd(1.5, 2.0);
}
function lobPot(e) {
  const sx = e.x + e.face * 30, sy = e.y - 170, tx = e.aim.x, ty = e.aim.y, g = 1800;
  const flight = clamp(0.95 + Math.abs(tx - sx) / 2600, 1.0, 1.35);
  Sound.sfx('pot-whistle', { x: e.x, delay: Math.max(0, flight - 0.75), vol: 0.9 });   // v11: the pot whistles as it drops
  spawnShot({ kind: 'pot', x: sx, y: sy, vx: (tx - sx) / flight, vy: (ty - sy - 0.5 * g * flight * flight) / flight, grav: g, r: 20, dmg: 1, life: 3.2, src: e, target: { x: tx, y: ty }, flight });
  Sound.sfx('pot-throw', { x: e.x });
}
// Burning ground: a low strip of fire on the floor where a flask or pot broke (3.5 s; a pot's is shorter)
export function groundFire(x, y, w, t) {
  const hit = rayDown(x, y - 60, 500);
  if (!hit || hit.water) { if (hit && hit.water) { burst(x, hit.y, 10, { color: ['#ffffff', '#cfc6c0'], min: 40, max: 200, angle: -Math.PI / 2, spread: 0.8, life: 0.6, size: 12, grav: -200 }); Sound.sfx('burn', { x, rate: 1.4 }); } return; }
  for (const h of G.hurts) if (h.kind === 'groundfire' && Math.abs(h.x + h.w / 2 - x) < 120 && Math.abs(h.y + h.h - hit.y) < 20) { h.t = Math.max(h.t, t); return; }
  G.hurts.push({ kind: 'groundfire', x: x - w / 2, y: hit.y - 44, w, h: 44, t, max: t, delay: 0, dmg: 1, fromX: x, seed: rnd(10) });
  Sound.sfx('ground-fire', { x });
}
// Ice or water puts burning ground out (moves.js calls this with the wall or the whip's reach)
export function douse(r) {
  for (let i = G.hurts.length - 1; i >= 0; i--) {
    const h = G.hurts[i];
    if (h.kind !== 'groundfire' || !overlap(h, r)) continue;
    G.hurts.splice(i, 1);
    burst(h.x + h.w / 2, h.y + 20, 14, { color: ['#ffffff', '#e6eef2', '#cfc6c0'], rx: h.w / 2, min: 40, max: 220, angle: -Math.PI / 2, spread: 0.7, life: 0.8, size: 16, grav: -260 });
    Sound.sfx('burn', { x: h.x + h.w / 2, rate: 1.5 });
  }
}

// The trial post in a shrine (note 11): only the power just learned moves it.
const TRIAL_NEED = { air: (o) => o.gust, water: (o) => o.whip, earth: (o) => o.slam || o.launch, fire: (o) => o.burn || o.ring };
function postHit(e, dmg, o) {
  if (TRIAL_NEED[e.el] && TRIAL_NEED[e.el](o)) return 9;
  e.wob = 1; Sound.sfx('post-hit', { x: e.x, gap: 0.08 }); hitstop(0.03);
  burst(e.x, e.y - 120, 4, { color: ['#e9c46a', '#a07a3c'], min: 40, max: 160, life: 0.3, size: 6, shape: 'chunk', grav: 1200 });
  return 'block';
}
function drawPost(ctx, e) {
  const wob = (e.wob = Math.max(0, (e.wob || 0) - 1 / 30)), a = e.dead ? clamp(1 - e.deadT / 0.6, 0, 1) : 1;
  // v14 (note 57): props/training-post.png (idle, struck wobble, broken) once it lands
  if (Assets.has('prop.trainingpost')) { const f = e.dead ? Math.min(7, 6 + Math.floor((e.deadT || 0) / 0.2)) : wob > 0 ? 2 + (Math.floor(G.time * 20) % 3) : Math.floor(G.time * 2) % 2; Assets.drawFxBox(ctx, 'prop.trainingpost', f, e.x, e.y + 4, 90, 1, { anchor: 'bottom', alpha: a }); return; }
  const C = { air: '#d7eef2', water: '#4aa3d8', earth: '#c39a5b', fire: '#f0742a' }[e.el] || '#ffffff';
  ctx.save(); ctx.globalAlpha = a; ctx.translate(e.x, e.y); ctx.rotate(Math.sin(G.time * 40) * 0.05 * wob + (e.dead ? e.deadT * 1.6 * (e.vx < 0 ? -1 : 1) : 0));
  ctx.fillStyle = 'rgba(20,10,25,0.28)'; ctx.beginPath(); ctx.ellipse(0, 2, 46, 9, 0, 0, 7); ctx.fill();
  // v11 (review 11 #11, D14): the planner's painted post for this element, at its own proportions
  const art = Assets.get('prop.trialposts'), cell = { air: 0, water: 1, earth: 2, fire: 3 }[e.el];
  if (art && cell != null) { const im = art.img, cw = im.width / 4, h = 250, w = cw * h / im.height; ctx.drawImage(im, cell * cw, 0, cw, im.height, -w / 2, -h + 6, w, h); ctx.restore(); return; }
  ctx.fillStyle = '#7a5236'; D_rr(ctx, -11, -200, 22, 202, 6); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK_E; ctx.stroke();
  ctx.fillStyle = '#7a5236'; D_rr(ctx, -62, -170, 124, 18, 6); ctx.fill(); ctx.stroke();
  // straw wraps
  for (const [y, h] of [[-150, 60], [-78, 44]]) { ctx.fillStyle = '#e2c27a'; D_rr(ctx, -30, y, 60, h, 14); ctx.fill(); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(120,80,30,0.6)'; for (let i = -20; i <= 20; i += 10) { ctx.beginPath(); ctx.moveTo(i, y + 4); ctx.lineTo(i + 3, y + h - 4); ctx.stroke(); } ctx.lineWidth = 5; ctx.strokeStyle = INK_E; }
  // the paper charm in the element's colour
  ctx.fillStyle = '#f3ecdf'; ctx.fillRect(-14, -150, 28, 54); ctx.lineWidth = 3; ctx.strokeRect(-14, -150, 28, 54);
  ctx.fillStyle = C; ctx.beginPath(); ctx.arc(0, -123, 9, 0, 7); ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();
  if (!e.dead) { const g = 0.25 + 0.15 * Math.sin(G.time * 3); ctx.save(); ctx.globalCompositeOperation = 'lighter'; const rg = ctx.createRadialGradient(e.x, e.y - 123, 2, e.x, e.y - 123, 50); rg.addColorStop(0, D_hexA(C, g)); rg.addColorStop(1, D_hexA(C, 0)); ctx.fillStyle = rg; ctx.fillRect(e.x - 50, e.y - 173, 100, 100); ctx.restore(); }
}

// --- the table ---------------------------------------------------------------------------------
const TYPES = {
  brawler: { hp: 4, w: 70, h: 170, speed: () => rnd(180, 215), update: updateSoldier, frame: soldierFrame, onHit: brawlerHit, contact: false },
  slinger: { hp: 3, w: 70, h: 170, speed: () => 150, update: updateSoldier, frame: soldierFrame, tint: SLINGER_TINT },
  shield: { hp: 6, w: 90, h: 200, armorWind: true, speed: () => 110, update: updateShield, frame: shieldFrame, onHit: shieldHit, heavy: true },
  archer: { hp: 3, w: 70, h: 180, speed: () => 0, update: updateArcher, frame: archerFrame },
  moth: { hp: 2, w: 90, h: 70, speed: () => 0, update: updateMoth, frame: mothFrame, onHit: mothHit, flies: true, contact: (e) => e.state === 'swoop', drawY: 40 },
  snapper: { hp: 5, w: 130, h: 80, speed: () => 240, update: updateSnapper, frame: snapperFrame, onHit: snapperHit, wades: true },
  mite: { hp: 1, w: 60, h: 50, speed: () => 130, update: updateMite, frame: miteFrame, onHit: miteHit, contact: (e) => e.state === 'roll' },
  hound: { hp: 4, w: 150, h: 100, speed: () => 430, update: updateHound, frame: houndFrame, onHit: houndHit, contact: (e) => e.state === 'run' && Math.abs(e.vx) > 200 },
  // v10 (note 14)
  parasol: { hp: 5, w: 80, h: 190, armorWind: true, speed: () => 115, update: updateParasol, frame: parasolFrame, onHit: parasolHit, army: true },
  hook: { hp: 6, w: 80, h: 190, armorWind: true, speed: () => 210, update: updateHook, frame: hookFrame, onHit: hookHit, army: true },
  ember: { hp: 3, w: 70, h: 170, speed: () => 150, update: updateSoldier, frame: soldierFrame, army: true },
  potter: { hp: 3, w: 70, h: 180, speed: () => 0, update: updateArcher, frame: archerFrame },
  post: { hp: 1, w: 70, h: 190, speed: () => 0, update: (e) => { e.vx = 0; }, frame: () => ['none', 0], onHit: postHit },
};
export const ENEMY_TYPES = Object.keys(TYPES);

export function spawnEnemy(t, x, y, o = {}) {
  const T = TYPES[t] || TYPES.brawler;
  const e = {
    type: TYPES[t] ? t : 'brawler', x, y, w: T.w, h: T.h, vx: 0, vy: 0, face: -1, onGround: false,
    hp: T.hp, maxHp: T.hp, state: 'idle', t: rnd(0.5), flash: 0, hurtT: 0, dead: false, deadT: 0, walkD: 0, hits: 0, hitsT: 0,
    speed: T.speed(), cd: rnd(0.6, 1.4), animT: rnd(1), alert: !!o.alert, hx: x, hy: y, flies: !!T.flies, wades: !!T.wades, guardDown: 0, ...o,
  };
  if (e.flies) { e.cd = rnd(1.0, 2.6); }
  G.enemies.push(e);
  return e;
}

export function spawnShot(s) {
  const shot = { t: 0, r: 18, dmg: 1, life: 3, grav: 0, from: 'enemy', ...s };
  G.shots.push(shot);
  return shot;
}

// Deal damage to an enemy or boss. Returns true if it landed (a block returns false).
export function hitEnemy(e, dmg, kx = 0, ky = 0, o = {}) {
  if (e.dead || e.invuln) return false;
  const T = TYPES[e.type];
  if (e.boss) dmg = bossHit(e, dmg, o);
  else if (T && T.onHit) {
    const r = T.onHit(e, dmg, o);
    if (r === 'block') return false;
    dmg = r;
  }
  const fromX = o.fromX ?? G.player.x, side = sign(e.x - fromX);
  const el = hitElement(o);
  if (dmg > 0) {
    // v5: the hit shows in the body, not over it. A 50 ms tint in the blow's element colour
    // (wall-clock, so hit-stop can't stretch it into a white cut-out), a 4-frame squash and a
    // 10 px nudge away from the blow that springs back.
    e.hp -= dmg; e.flash = 0; e.flashEnd = now() + 50; e.flashCol = FLASH_RGB[el]; popDamage(e, dmg, o);
    e.sqT = SQ_DUR; e.sqK = e.boss ? 0.34 : 1; e.sqSide = side;
  }
  if (!e.boss) {
    // poise: a soldier hit three times in quick succession shrugs off the next blow and swings back
    e.hits = e.hitsT > 0 ? e.hits + 1 : 1; e.hitsT = 1.2;
    const armored = T && T.poise && e.hits >= T.poise && e.hp > 0 && !o.heavy;
    if (armored) { e.hits = 0; e.vx = kx * 0.15; e.state = 'wind'; e.t = 0.1; e.alert = true; burst(e.x, e.y - e.h * 0.6, 6, { color: ['#ffd36b'], min: 60, max: 200, life: 0.25, size: 8 }); }
    else if (T && T.armorWind && ['wind', 'strike', 'lunge', 'draw'].includes(e.state) && !o.heavy && !o.slam && !o.gust && dmg > 0) {
      // v12 (note 34): heavier foes have poise: a plain blow during their wind-up doesn't stop the swing
      e.vx *= 0.5;
    }
    else if (dmg > 0 || o.gust) {
      const heavyBody = T && T.heavy && !o.heavy && !o.slam;
      e.hurtT = o.heavy ? 0.42 : 0.3; e.vx = heavyBody ? kx * 0.3 : kx; if (!heavyBody) e.vy = e.flies && !o.gust ? ky * 0.4 : ky;
      if (!['flipped', 'roll'].includes(e.state)) { e.state = 'hurt'; e.t = 0; }
      if (ky < 0 && !heavyBody) e.onGround = false;
      if (o.burn && !e.boss) e.burnT = 1.5;
    }
  }
  if (dmg <= 0 && !e.boss) return true;
  // v10 (review 10 #5): 50 ms for a normal hit, 65 ms heavy; the combo's last blow and a parry keep the long freeze;
  // a move that hits again and again (flame ring ticks, burning) freezes only on its first touch
  const hs = o.combo === 2 ? 0.085 : o.heavy ? 0.065 : 0.04;
  if (o.heavy && dmg > 0 && !o.ring) impact(e.x, e.y - e.h * 0.55, { col: el && el !== 'air' && FLASH_RGB[el] && !o.basic && !o.slam ? `rgb(${FLASH_RGB[el]})` : null });   // v13: finishers, the down-strike, heavy casts
  if (!(o.ring && e.ringHit)) hitstop(hs); if (o.ring) e.ringHit = true; shake(o.heavy ? 9 : 4); Sound.rumble(o.heavy ? 0.4 : 0.15, o.heavy ? 0.3 : 0.25, o.heavy ? 90 : 50);
  // the spark sits at the contact point (between the blow and the body, at chest height), small, turned to the blow
  const reachIn = Math.min(e.w * 0.45, Math.abs(e.x - fromX) / 2);
  const spk = addFx('spark', e.x - side * reachIn, e.y - e.h * (e.flies ? 0.5 : 0.6) + rnd(-10, 10), { dur: 0.2, size: o.heavy ? 190 : 130, face: side, el });   // v8: bigger next to two bodies
  spk.rot = o.down ? side * 1.2 : rnd(-0.25, 0.25);
  Sound.sfx(o.heavy ? 'hit-heavy' : 'hit', { rate: o.heavy ? 0.9 : 1, x: e.x });
  Sound.sfx(o.combo === 1 ? 'punch-hit-2' : o.combo === 2 ? 'punch-hit-3' : 'punch-hit', { vol: o.heavy ? 0.9 : 0.6, gap: 0.03, x: e.x });
  if (SOLDIERLY[e.type] && e.hp > 0) Sound.sfx('soldier-hurt', { gap: 0.25, vol: 0.8, x: e.x });
  burst(e.x - side * e.w * 0.2, e.y - e.h * 0.55, o.heavy ? 12 : 7, { color: SPARK_COLORS[el], angle: side > 0 ? 0 : Math.PI, spread: 1.1, min: 140, max: 520, life: 0.35, size: 10 });
  if (e.hp <= 0) killEnemy(e, kx, ky);   // v10 (Connor's note 13): hits give no Breath; only the defeat does
  return true;
}
// Which element a blow carries (picks the hit spark and its particles).
const STRIDE = { brawler: 95, slinger: 95, shield: 110, archer: 95, hound: 260, parasol: 100, hook: 90, ember: 95, potter: 95 };
const SOLDIERLY = { brawler: 1, slinger: 1, shield: 1, archer: 1, parasol: 1, hook: 1, ember: 1, potter: 1 };
const SOLDIER_SHEET = { brawler: 1, slinger: 1, parasol: 1, hook: 1, ember: 1 };
// v8: a defeat sheet's 8 frames run 0.7 s (the body hits the ground at frame 5), the last is held 0.4 s, then 0.3 s fade
const DEFEAT_SHEET_END = 0.7, DEFEAT_FALL = 0.45;
// v11 (note 26): each foe falls with its own defeat sheet (no more borrowing the plain soldier's or the archer's)
// v12 (note 33): a defeat sheet whose poses overlap (listed for a redraw) gives way to the clean soldier fall
const cleanSheet = (k) => Assets.has(k) && !Assets.get(k).touch;
export const defeatKey = (e) => (cleanSheet(e.type + '.defeat') ? e.type + '.defeat' : SOLDIER_SHEET[e.type] ? 'soldier.defeat' : e.type === 'potter' ? 'archer.defeat' : e.type + '.defeat');
export const defeatFrame = (e) => Math.min(7, Math.floor(e.deadT / DEFEAT_SHEET_END * 8));
const defeatAlpha = (e, sheet) => (sheet ? clamp(1 - (e.deadT - DEFEAT_SHEET_END - 0.4) / 0.3, 0, 1) : clamp(1 - (e.deadT - 0.8) / 0.5, 0, 1));
const hitElement = (o) => (o.slam || o.launch ? 'earth' : o.burn || o.ring ? 'fire' : o.whip ? 'water' : 'air');
const SPARK_COLORS = { air: ['#ffffff', '#eafcff', '#bfe9f2'], water: ['#ffffff', '#bfe9f2', '#3fa7e8'], earth: ['#f3e2bd', '#c9a26a', '#8a6a44'], fire: ['#ffffff', '#ffd36b', '#f0742a'] };
function popDamage(e, dmg, o) { if (G.debug) popText(String(dmg), e.x, e.y - e.h - 20, o.heavy ? '#ffd36b' : '#ffffff'); }

export function killEnemy(e, kx, ky) {
  e.dead = true; e.deadT = 0; e.hp = 0;
  if (e.boss) { bossDefeated(e); return; }
  // v8: with a knocked-out sheet the body stays low and plays it out on the ground (no big tumble arc)
  const sheet = Assets.has(defeatKey(e));
  if (e.type === 'post') { setFlag(e.trialFlag); Sound.sfx('stone-crumble', { x: e.x, rate: 1.4, vol: 0.6 }); burst(e.x, e.y - 120, 18, { color: ['#e2c27a', '#7a5236', '#f3ecdf'], min: 120, max: 520, life: 0.7, size: 10, shape: 'chunk', grav: 1400 }); }
  if (sheet) { e.vx = (kx || -e.face * 300) * 0.35; e.vy = e.onGround ? -160 : Math.min(e.vy, 0); if (kx) e.face = -sign(kx); }
  else { e.vx = kx * 0.7 || -e.face * 200; e.vy = Math.min(ky, -380); }
  e.flies = false;
  if (G.killed) G.killed.add(e.spawnIdx);
  // v10 (Connor's note 13): Breath comes from defeated foes only. Each drops wisps (8 Breath each) that fly to Joon
  const wisps = { mite: 1, moth: 1, brawler: 2, slinger: 2, archer: 2, hound: 2, snapper: 2, shield: 3, parasol: 3, hook: 3, ember: 2, potter: 2 }[e.type] || 2;
  for (let i = 0; i < wisps; i++) G.pickups.push({ t: 'wisp', x: e.x, y: e.y - 60, vx: rnd(-220, 220), vy: rnd(-520, -280), dropped: true, life: 9, homeT: 0.35 + i * 0.08 });
  const jade = { brawler: 2, slinger: 2, shield: 5, archer: 3, moth: 2, snapper: 3, mite: 1, hound: 3, parasol: 4, hook: 5, ember: 3, potter: 3, post: 4 }[e.type] || 1;
  for (let i = 0; i < jade; i++) G.pickups.push({ t: 'jade', x: e.x, y: e.y - 60, vx: rnd(-260, 260), vy: rnd(-640, -320), dropped: true, life: 14, seed: rnd(6) });
  const p = G.player;
  if (Math.random() < (p.hp <= 2 ? 0.4 : 0.14)) G.pickups.push({ t: 'bloom', x: e.x, y: e.y - 90, vx: rnd(-120, 120), vy: -560, dropped: true, life: 12 });
  Sound.sfx('enemy-defeat', { rate: e.type === 'mite' ? 1.4 : e.type === 'shield' ? 0.8 : 1, x: e.x });
  if (SOLDIERLY[e.type]) Sound.sfx('soldier-defeat', { rate: e.type === 'shield' ? 0.85 : 1, x: e.x });
}

export function updateEnemies(dt) {
  const room = G.room, p = G.player;
  // v11 (note 24): the heal lesson never freezes the loop (that kept struck-down bodies standing). It only holds the
  // START of new attacks for its first 4 s; it ends on a heal, full hearts or after 6 s.
  const lesson = G.teachHeal && G.state === 'play' && !G.talk ? G.teachHeal : null;
  if (lesson) { lesson.t += dt; if (lesson.t > 6 || p.hp >= G.save.maxHp) Flow.healTaught(); }
  const holdStarts = !!(lesson && lesson.t < 4);
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.flash > 0) e.flash -= dt;
    if (e.sqT > 0) e.sqT -= dt;
    if (e.hurtT > 0) e.hurtT -= dt;
    if (e.hitsT > 0) e.hitsT -= dt;
    if (e.frontT > 0) e.frontT -= dt;
    if (e.punishT > 0) e.punishT -= dt;
    if (e.holdT > 0) e.holdT -= dt;
    antiAir(e, dt, p);   // v14 (note 53): every foe answers a pogo
    if (e.boss) { updateBoss(e, dt); if (e.remove) G.enemies.splice(i, 1); continue; }
    if (e.dead) {
      e.deadT += dt; e.vy += PHYS.gravity * dt; if (e.onGround) e.vx = approach(e.vx, 0, 1800 * dt);
      moveBody(e, dt);
      // v8 (review 8 #1): a defeat sheet (when the type has one) plays, holds its last frame, then fades; the body
      // lands with a thud, and only a small low puff is left at the feet instead of a cloud over both fighters
      const sheet = Assets.has(defeatKey(e));
      if (!e.fellT && e.deadT > 0.12 && (sheet ? e.deadT > DEFEAT_FALL : e.onGround)) {
        e.fellT = e.deadT;
        if (SOLDIERLY[e.type] || e.type === 'hound') { Sound.sfx('body-fall', { x: e.x, rate: e.type === 'shield' ? 0.85 : e.type === 'hound' ? 1.2 : 1, gap: 0.1 }); burst(e.x, e.y - 6, 6, { color: ['#d8c8a8', '#a89878'], rx: e.w * 0.5, min: 40, max: 160, angle: -Math.PI / 2, spread: 1.4, life: 0.4, size: 9, grav: 500 }); }
      }
      const poofAt = sheet ? DEFEAT_SHEET_END + 0.25 : 0.75;
      if (e.deadT > poofAt && !e.poofed) { e.poofed = true; addFx('poofsmall', e.x, e.y + 6, { dur: 0.55, size: Math.max(120, e.h * 0.9), anchor: 'bottom' }); }
      if (e.deadT > (sheet ? DEFEAT_SHEET_END + 0.7 : 1.3) || e.y > room.h + 400) G.enemies.splice(i, 1);
      continue;
    }
    e.t += dt; e.animT += dt;
    // v10 (Connor's note 19): dashed through, a foe snaps its head round after Joon (guards turn slowly, see the dash)
    if (e.dashedT > 0) { e.dashedT -= dt; if (!e.headTurned && e.dashedT < 0.5 && e.type !== 'shield' && e.type !== 'parasol' && e.state !== 'strike') { e.headTurned = true; e.face = sign(p.x - e.x); Sound.sfx('enemy-turn', { x: e.x, gap: 0.1, vol: 0.7 }); } }
    if (e.onGround) {
      const stride = STRIDE[e.type], before = e.walkD;
      e.walkD += Math.abs(e.vx) * dt;
      // footfalls, only for bodies near enough to matter
      if (stride && Math.floor(before / stride) !== Math.floor(e.walkD / stride) && Math.abs(e.x - p.x) < 1000 && Math.abs(e.vx) > 40)
        Sound.sfx(e.type === 'hound' ? 'hound-paws' : e.type === 'hook' ? 'hook-step' : 'soldier-step', { vol: clamp(1.2 - Math.abs(e.x - p.x) / 1000, 0.2, 1) * (e.type === 'shield' ? 1.2 : 1), gap: 0.07, pitch: 0.1, x: e.x });
    }
    else if (e.flies) e.walkD += Math.hypot(e.vx, e.vy) * dt;
    if (e.dropT > 0) e.dropT -= dt;
    // burning (Fire Blast): 1 damage every half second
    if (e.burnT > 0) { e.burnT -= dt; e.burnTick = (e.burnTick || 0) - dt; if (e.burnTick <= 0) { e.burnTick = 0.5; e.hp -= 1; e.flash = 0.06; burst(e.x, e.y - e.h * 0.6, 4, { color: ['#ffd36b', '#f0742a'], min: 30, max: 120, life: 0.4, size: 9, grav: -200 }); if (e.hp <= 0) killEnemy(e, 0, -300); } }
    // v11 (review 11 sound list): a soldier standing at rest shifts his weight now and then (a soft rattle of plates)
    if (SOLDIERLY[e.type] && e.onGround && Math.abs(e.vx) < 10 && Math.abs(e.x - p.x) < 900 && Math.random() < dt / 5) Sound.sfx('enemy-idle-shift', { x: e.x, gap: 0.8 });
    const T = TYPES[e.type], s0 = e.state;
    T.update(e, dt);
    if (holdStarts && e.state !== s0 && ATTACK_START[e.state] && !e.dead) { e.state = s0; e.holdT = Math.max(e.holdT || 0, 0.3); e.vx *= 0.5; }
    if (e.dead) continue;
    // v12 (Connor's note 37, a rule for every type): in a locked fight no foe may keep out of Joon's reach. One left up on a
    // ledge above him for 2 s walks off it toward him (soldiers did this already; now the guards, hooks and lobbers do too)
    if (!e.flies && e.type !== 'post' && lockedFight() && e.onGround && p.y - e.y > 100 && !ATTACK_START[e.state] && !['strike', 'recover', 'hurt', 'stun'].includes(e.state)) {
      e.reachT = (e.reachT || 0) + dt;
      if (e.reachT > 2) { if (!e.reachDir) e.reachDir = Math.abs(p.x - e.x) > 90 ? sign(p.x - e.x) : e.face; e.face = e.reachDir; e.vx = e.face * Math.max(e.speed || 0, 160); }   // commit to one way off
    } else { e.reachT = 0; e.reachDir = 0; }
    if (e.flies) { e.x += e.vx * dt; e.y += e.vy * dt; }
    else { e.vy = Math.min(e.vy + PHYS.gravity * dt, PHYS.maxFall); moveBody(e, dt); }
    // thrown by a gust into a wall or another enemy: both are dazed
    if (e.blownT > 0) {
      e.blownT -= dt;
      const other = G.enemies.find((q) => q !== e && !q.dead && !q.boss && overlap(boxOf(q), boxOf(e)));
      if ((e.hitX && !e.flies) || other) {
        e.blownT = 0; e.hp -= 2; e.flash = 0.07; e.state = 'stun'; e.t = 0; e.hurtT = 0.8; e.vx = 0;
        Sound.sfx('thud-wall', { x: e.x }); shake(6);
        if (other) { other.hp -= 2; other.flash = 0.07; other.state = 'stun'; other.t = 0; other.hurtT = 0.8; if (other.hp <= 0) killEnemy(other, 0, -400); }
        if (e.hp <= 0) killEnemy(e, 0, -400);
      }
    }
    e.x = clamp(e.x, 40, room.w - 40);
    if (e.flies) e.y = clamp(e.y, 80, room.h - 40);
    if (e.y > room.h + 400) { G.enemies.splice(i, 1); continue; }
    // planner hotfix 12:27 (Connor soft-locked in the Drowned Steps): an enemy that ends up in deep water or a pit can't
    // be reached there, so it goes under with a splash and counts as defeated (its Breath drops as usual)
    if (!e.dead && !e.flies && !e.boss && (room.hazards || []).some((h) => (h.t === 'water' || h.t === 'pit') && e.x > h.x && e.x < h.x + h.w && e.y > h.y + 12)) {
      addFx('splash', e.x, e.y, { dur: 0.55, size: 170, anchor: 'bottom' }); Sound.sfx('enemy-drown', { x: e.x }); killEnemy(e, 0, -120);
    }
    if (e.dropIn != null && e.onGround) { e.dropIn = null; addFx('dust', e.x, e.y + 8, { dur: 0.4, size: 200, anchor: 'bottom' }); Sound.sfx('land-hard', { x: e.x, vol: 0.8 }); shake(3); }   // v9: a wave soldier lands
    if (T.contact && T.contact(e) && !p.dead && overlap(boxOf(e), boxOf(p))) hurtPlayer(1, e.x, { src: e });
    // v8 (review 8 #1): soldiers' bodies block like the guardians' (the dash and a down-strike from above still pass);
    // small creatures stay passable. A soldier never pins Joon to a wall (soft).
    if (SOLDIERLY[e.type]) {
      const touching = bodyBlock(e, p, dt, { soft: true });   // v9 (review 9 #2): at the painted width (BODY_HALF)
      if (touching && !e.bumped && Math.abs(p.vx) + Math.abs(e.vx) > 60) Sound.sfx('body-bump', { gap: 0.5, x: e.x });
      e.bumped = touching;
    }
  }

  // v9 (review 9 #6): soldiers and hounds on the ground never stand inside each other: each pair closer than
  // (a.w + b.w) * 0.55 is eased apart (half the overlap each, at most 180 px/s), only into free space
  const crowd = G.enemies.filter((e) => !e.dead && !e.boss && (SOLDIERLY[e.type] || e.type === 'hound') && e.onGround && !(e.hurtT > 0) && e.state !== 'hurt');
  for (let a = 0; a < crowd.length; a++) for (let b = a + 1; b < crowd.length; b++) {
    const A = crowd[a], Bq = crowd[b], dx = Bq.x - A.x, min = (A.w + Bq.w) * 0.55;
    if (Math.abs(dx) >= min || Math.abs(A.y - Bq.y) > 40) continue;
    const d = dx === 0 ? (A.face || 1) * -1 : Math.sign(dx), mv = Math.min((min - Math.abs(dx)) / 2, 180 * dt);
    for (const [q, s] of [[A, -d], [Bq, d]]) if (rectFree({ x: q.x + s * mv - q.w / 2, y: q.y - q.h + 4, w: q.w, h: q.h - 8 }, true) && groundAt(q.x + s * mv, q.y)) q.x += s * mv;
    if (min - Math.abs(dx) > 20) Sound.sfx('enemy-shove', { gap: 1.5, x: A.x });
  }

  // enemy attack boxes (melee, spikes, flame pillars, shockwaves)
  followHurts();
  for (let i = G.hurts.length - 1; i >= 0; i--) {
    const h = G.hurts[i];
    if (h.src && (h.src.dead || !['strike', 'snap', 'combo_strike', 'lunge'].includes(h.src.state) && !h.src.boss)) { G.hurts.splice(i, 1); continue; }
    if (h.delay > 0) { h.delay -= dt; if (h.delay <= 0 && h.onStart) h.onStart(h); continue; }
    if (h.follow) { const f = h.follow; h.x = f.face > 0 ? f.x - 20 : f.x + 20 - h.w; h.y = f.y - 150; }   // v10: a lunge's blades travel with him
    h.age = (h.age || 0) + dt;
    if (h.dmg > 0 && overlap(h, boxOf(p))) {
      if (p.deflect > 0 && (h.src || h.kind === 'melee')) {
        const src = h.src || G.enemies.find((q) => q.boss && !q.dead);
        parry(p.x + sign((h.fromX ?? p.x) - p.x) * 60, p.y - 100, src);   // v10 (note 16): the deflect window is the parry
        G.hurts.splice(i, 1); burst(p.x + p.face * 60, p.y - 90, 8, { color: '#eafcff', min: 100, max: 380, life: 0.3 }); continue;
      }
      const landed = hurtPlayer(h.dmg, h.fromX ?? h.x + h.w / 2, { src: h.src });
      if (landed && h.onHit) h.onHit();
      if (landed && h.hold) { p.vx *= 0.2; p.vy = -200; }
    }
    h.t -= dt;
    if (h.t <= 0) G.hurts.splice(i, 1);
  }
  updateShots(dt);
  Sound.loop('ground-fire-loop', G.hurts.some((h) => h.kind === 'groundfire' && Math.abs(h.x - p.x) < 1100));   // v10
}

// v10 (Connor's note 16): a caught shot hangs at Joon's palms while time crawls; the left stick (or the arrows) aims
// it. It flies back at double strength when the window ends or on a strike press (see updateAim in flow.js)
function catchShot(s) {
  const p = P();
  s.held = true; s.from = 'player'; s.grav = 0; s.bounce = 0;
  p.deflectHit = true; p.deflect = 0; p.castLock = 0; p.inv = Math.max(p.inv, 0.6);
  const src = s.src && !s.src.dead ? s.src : null;
  const ang = src ? Math.atan2(src.y - src.h / 2 - (p.y - 112), src.x - p.x) : Math.atan2(-s.vy, -s.vx);
  G.aim = { s, t: 0, dur: skill('echo') ? 0.8 : 0.6, ax: Math.cos(ang), ay: Math.sin(ang) };
  if (Math.abs(G.aim.ax) > 0.1) p.face = sign(G.aim.ax);
  hitstop(0.05); shake(5); impact(s.x, s.y); Sound.sfx('deflect-catch'); Sound.sfx('parry', { vol: 0.5 }); Sound.rumble(0.3, 0.5, 120);
  burst(s.x, s.y, 10, { color: ['#eafcff', '#ffffff'], min: 100, max: 360, life: 0.3 });
}
export function releaseShot() {
  const a = G.aim; if (!a) return;
  const s = a.s, sp = 1500;
  s.held = false; s.vx = a.ax * sp; s.vy = a.ay * sp; s.dmg = Math.max(2, (s.dmg || 1) * 2); s.life = 2; s.reflected = true; s.r = Math.max(s.r, 22);
  if (s.kind === 'arrow' || s.kind === 'pot') s.grav = 0;
  G.aim = null; G.slowT = 0; G.slowK = null;
  shake(7); Sound.sfx('deflect-release'); Sound.rumble(0.4, 0.4, 90);
  addFx('dashstreak', s.x, s.y, { dur: 0.22, face: sign(s.vx), size: 200, rot: Math.atan2(s.vy, Math.abs(s.vx)) * sign(s.vx) });
}

function explode(s) {
  // v10 (note 14): a flask or a pot breaks into fire on the ground (only the foe's own; a deflected one just bursts)
  if (s.kind === 'flask' || s.kind === 'pot') {
    Sound.sfx(s.kind === 'pot' ? 'pot-burst' : 'fireball-impact', { x: s.x });
    if (s.kind === 'pot') { POT_BURSTS.push({ x: s.x, y: s.y, t0: G.time, seed: Math.random() * 6 }); burst(s.x, s.y - 20, 6, { color: ['#ffd36b', '#fff1c0'], min: 120, max: 360, life: 0.3, size: 7, grav: 600 }); }
    else burst(s.x, s.y, 14, { color: ['#ffd36b', '#f0742a', '#b5714a', '#7a3e24'], min: 120, max: 460, life: 0.5, size: 11, shape: 'chunk', grav: 1400 });
    if (!s.reflected) {
      if (s.kind === 'pot') G.hurts.push({ x: s.x - 95, y: s.y - 120, w: 190, h: 140, t: 0.22, delay: 0, dmg: 1, kind: 'flame', small: true, fromX: s.x });
      groundFire(s.x, s.y, s.kind === 'pot' ? 160 : 230, s.kind === 'pot' ? 1.4 : 3.5);
    }
    return;
  }
  // v12 (note 39): an icicle shatters where its shadow was, and leaves a short spray of ice that still stings
  if (s.kind === 'icicle') {
    Sound.sfx('icicle-fall', { x: s.x, gap: 0.05 }); shake(5);
    if (Assets.has('fx.icicle')) addFx('icicleshatter', s.x, s.y + 4, { dur: 0.42, size: s.r * 14, anchor: 'bottom' });
    burst(s.x, s.y, 14, { color: ['#ffffff', '#d8f2ff', '#9fd2ee'], min: 120, max: 480, angle: -Math.PI / 2, spread: 1.3, life: 0.5, size: 10, shape: 'chunk', grav: 1800 });
    if (!s.reflected) G.hurts.push({ x: s.x - 50, y: s.y - 50, w: 100, h: 50, t: 0.12, delay: 0, dmg: 1, kind: 'icesplash', fromX: s.x });
    return;
  }
  const fire = s.kind === 'fireball' || s.kind === 'fireblast' || s.kind === 'firewave' || s.kind === 'arrow' || s.kind === 'cinder';
  const col = fire ? ['#ffd36b', '#f0742a', '#7a2412'] : s.kind === 'boulder' || s.kind === 'rockwave' ? ['#b59a6e', '#8a7558'] : ['#bfe9f2', '#3fa7b8'];
  burst(s.x, s.y, s.kind === 'fireblast' ? 16 : 9, { color: col, min: 80, max: 380, life: 0.4, size: s.kind === 'fireblast' ? 14 : 10 });
  const onScr = s.x > G.cam.x - 100 && s.x < G.cam.x + W + 100;
  if (onScr && s.kind === 'boulder') { Sound.sfx('boulder-impact', { x: s.x, vol: 0.8 }); addFx('shatter', s.x, s.y, { dur: 0.4, size: s.r * 5 }); }
  else if (onScr && (s.kind === 'fireball' || s.kind === 'cinder' || s.kind === 'fireblast')) Sound.sfx('fireball-impact', { x: s.x, gap: 0.06 });   // v15: the hero's fire blast is heard on a wall too
}

function updateShots(dt) {
  const room = G.room, p = G.player, pb = boxOf(p);
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i];
    if (s.held) { s.x = p.x + p.face * 78; s.y = p.y - 112; s.t += dt; continue; }   // v10: caught, waiting to be aimed
    s.t += dt; s.life -= dt;
    if (s.stuck) { if (s.life <= 0) G.shots.splice(i, 1); continue; }
    s.vy += s.grav * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    let dead = s.life <= 0 || s.x < -200 || s.x > room.w + 200 || s.y > room.h + 300;
    const sb = s.wave ? { x: s.x - s.w / 2, y: s.y - s.h, w: s.w, h: s.h } : { x: s.x - s.r * 0.7, y: s.y - s.r * 0.7, w: s.r * 1.4, h: s.r * 1.4 };
    // world
    if (!dead) for (const c of room.col) {
      if (s.wave && !c.pillar && !c.barrier) continue;           // ground waves only stop at walls you raise
      if (!overlap(sb, c)) continue;
      if (c.gate && c.t === 'branch' && s.burn) igniteBranch(c);
      if (c.pillar) { c.hp -= s.wave ? 3 : 1; if (c.hp <= 0) c.t = c.life; }
      if (s.bounce > 0 && s.vy > 0 && s.y - s.vy * dt <= c.y + 12) { s.bounce--; s.y = c.y - s.r * 0.7; s.vy = -Math.abs(s.vy) * 0.62; shake(4); Sound.sfx('thud-wall', { x: s.x, rate: 0.8, vol: 0.6 }); break; }
      if ((s.kind === 'flask' || s.kind === 'pot') && c.pillar && c.kind === 'ice') { dead = true; douse({ x: s.x - 120, y: s.y - 80, w: 240, h: 160 }); Sound.sfx('ice-knock', { x: s.x }); break; }
      if (s.kind === 'arrow' && !c.pillar) { s.stuck = true; s.life = 1; s.ang = Math.atan2(s.vy, s.vx); Sound.sfx('arrow-hit', { x: s.x }); break; }
      if (s.kind === 'cinder') G.hurts.push({ x: s.x - 40, y: c.y - 60, w: 80, h: 60, t: 0.6, delay: 0, dmg: 1, kind: 'flame', fromX: s.x });
      dead = true; explode(s); if (s.from === 'player' || s.kind === 'arrow') Sound.sfx('arrow-hit', { x: s.x, rate: 0.8, vol: 0.5 }); break;
    }
    if (s.stuck) continue;
    if (!dead && s.from === 'enemy' && !p.dead) {
      const dx = s.x - p.x, dy = s.y - (p.y - 80), d = Math.hypot(dx, dy);
      if (p.deflect > 0 && d < 190 && !s.wave && !G.aim) {
        catchShot(s);   // v10 (Connor's note 16): caught between the palms; time slows and the stick aims it back
      } else if (p.ring > 0 && d < 170 && !s.wave) {
        dead = true; explode(s); addBreath(3); Sound.sfx('burn', { x: s.x, vol: 0.5 });
      } else if (overlap(sb, pb)) {
        if (hurtPlayer(s.dmg, s.x - s.vx, { src: s.src })) { if (!s.wave) { dead = true; explode(s); } if (s.push) p.vx = s.push; }
        else if (!s.wave && p.inv <= 0 && !(p.deflect > 0)) { dead = true; explode(s); }
      }
    } else if (!dead && s.from === 'player') {
      for (const e of G.enemies) {
        if (e.dead || !overlap(sb, boxOf(e)) || (s.hitSet && s.hitSet.has(e))) continue;
        hitEnemy(e, s.dmg, sign(s.vx) * 420, -220, { heavy: s.dmg >= 3, burn: !!s.burn, fromX: s.x - s.vx * 0.05, reflected: !!s.reflected });
        if (s.pierce > 0) { s.pierce--; s.hitSet.add(e); continue; }
        dead = true; explode(s); break;
      }
    }
    if (dead) G.shots.splice(i, 1);
  }
}

// --- drawing ---------------------------------------------------------------------------------
export const punchScale = () => 1;
// v5 hit pose: flash (0/1, wall-clock), its colour, and the squash and nudge after a blow.
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const SQ_DUR = 4 / 60;
const FLASH_RGB = { air: '200,236,255', water: '150,215,235', earth: '240,214,160', fire: '255,190,120' };
export function hitPose(e) {
  const fl = now() < (e.flashEnd || 0) ? 1 : e.flash > 0 ? e.flash / 0.07 : 0;
  const k = e.sqT > 0 ? (e.sqT / SQ_DUR) * (e.sqK || 1) : 0;
  return { flash: fl, color: e.flashCol, sx: 1 + 0.08 * k, sy: 1 - 0.06 * k, ox: (e.sqSide || 0) * 10 * k };
}
export function drawSoldier(ctx, e, o = {}) {
  let fr = o.frame ? [(o.sheet || 'soldier') + '.' + o.frame[0], o.frame[1]] : soldierFrame(e);
  { const ov = aaPose(e); if (ov) fr = ov; }   // v14 (note 57): the anti-air pose from its own sheet
  // v10: the new uniform's hurt and defeat share one sheet; use it so a hit never flashes the old red armour
  if (Assets.has('soldier.hurtdefeat') && !Assets.has('soldier.hurt')) {   // v13: the legacy sheet is the old design; the redesign has its own hurt and defeat
    if (fr[0] === 'soldier.hurt') fr = ['soldier.hurtdefeat', Math.min(3, fr[1])];
    else if (fr[0] === 'soldier.defeat') fr = ['soldier.hurtdefeat', 4 + Math.min(3, fr[1] >> 1)];
  }
  // v13: a defeat strip whose poses touch (two bodies in one cell, note 33) is never shown. The foe topples instead:
  // its own hurt pose, pivoting on its heels onto its back, then the usual fade.
  let topple = 0;
  if (e.dead && fr[0].endsWith('.defeat') && Assets.has(fr[0]) && Assets.get(fr[0]).touch) {
    const hk = fr[0].replace('.defeat', '.hurt'), k = clamp(e.deadT / 0.42, 0, 1);
    fr = [Assets.has(hk) ? hk : 'soldier.hurt', 3]; topple = -e.face * (Math.PI / 2) * 0.96 * k * k;
  }
  const alpha = e.dead ? defeatAlpha(e, true) : 1;
  const hp = hitPose(e);
  const opt = { flash: hp.flash, flashColor: hp.color, alpha, tint: e.type === 'slinger' && !Assets.has('ember.throw') ? SLINGER_TINT : o.tint, scale: o.scale || 1, sx: hp.sx, sy: hp.sy, rim: G.room.rim, rimA: G.room.rimA, rot: (o.rot || 0) + topple };
  const lf = lifeOf(e, fr[0], fr[1]); opt.sy *= lf.sy; opt.rot += lf.rot + poseLean(e);
  if (e.onGround && !e.dead) { ctx.fillStyle = 'rgba(20,10,25,0.28)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, 50 * (o.scale || 1), 10, 0, 0, 7); ctx.fill(); }
  if (!Assets.drawChar(ctx, fr[0], fr[1], e.x + hp.ox, e.y + 5 + lf.dy - Math.abs(topple) / (Math.PI / 2) * 30, e.face, opt)) { const [, anim] = fr[0].split('.'); phSoldier(ctx, anim, fr[1], e.x, e.y, e.face, { ...opt, variant: e.type }, G.time); }
  if (G.debug) { ctx.strokeStyle = '#f00'; ctx.lineWidth = 2; ctx.strokeRect(e.x - e.w / 2, e.y - e.h, e.w, e.h); }
}

// v10 (note 14): the new soldiers wear the army's sheets in their own colours, with their gear drawn on
// (enemy-<kind>-<anim>.png replace this when they arrive)
// Each kind's own sheet, frame by state (null keeps the shared soldier sheet for that state):
//   parasol walk: 8 steps under the dome; hook attack: guard 0-1, crouch 2-3, lunge 4-5, recover 6-7;
//   ember throw: glowing fist 1-3, low throw 4-5, settle 6-7
// v11 (Connor's note 26, review 11 #3): every foe uses its OWN sheet in every state: idle (breathing, by time), moving
// (frames advance with distance walked), wind-up and attack, hurt (8 frames over 0.4 s) and defeat. No body swaps.
const hurtF = (e) => Math.min(7, Math.floor(e.t / 0.4 * 8));
const idleF = (e) => Math.floor(e.animT * 7) % 8;
const has = (k) => Assets.has(k);
const OWN = {
  slinger: (e) => OWN.ember(e),
  parasol: (e) => {
    if (e.dead) return has('parasol.defeat') ? ['parasol.defeat', defeatFrame(e)] : null;
    if ((e.state === 'hurt' || e.state === 'stun') && e.dome !== false && has('parasol.hurt')) return ['parasol.hurt', hurtF(e)];
    if (e.dome === false && has('parasol.barewalk')) return ['parasol.barewalk', Math.abs(e.vx) > 20 ? 3 + Math.floor(e.walkD / 22) % 5 : Math.floor(e.animT * 5) % 3];
    if (e.state === 'wind' && has('parasol.attack')) return ['parasol.attack', Math.min(2, Math.floor(e.t / 0.5 * 3))];
    if (e.state === 'strike' && has('parasol.attack')) return ['parasol.attack', e.t < 0.08 ? 3 : 4];
    if (e.state === 'recover' && has('parasol.attack')) return ['parasol.attack', 5 + Math.min(2, Math.floor(e.t / 0.6 * 3))];
    if (Math.abs(e.vx) > 20) return ['parasol.walk', Math.floor(e.walkD / 17) % 8];   // v11: short heavy steps (a frame per 17 px)
    return has('parasol.idle') ? ['parasol.idle', idleF(e)] : ['parasol.walk', 0];
  },
  hook: (e) => {
    if (e.dead) return has('hook.defeat') ? ['hook.defeat', defeatFrame(e)] : null;
    if (e.state === 'hurt' || e.state === 'stun') return has('hook.hurt') ? ['hook.hurt', hurtF(e)] : null;
    if (e.state === 'wind') return ['hook.attack', 2 + (e.t > 0.3 ? 1 : 0)];
    if (e.state === 'lunge') return ['hook.attack', 4 + (e.t > 0.12 ? 1 : 0)];
    if (e.state === 'recover') return ['hook.attack', 6 + (e.t > 0.45 ? 1 : 0)];
    if (Math.abs(e.vx) > 20 && has('hook.walk')) return ['hook.walk', Math.floor(e.walkD / 30) % 8];
    return has('hook.idle') ? ['hook.idle', idleF(e)] : ['hook.attack', Math.floor(e.animT * 3) % 2];
  },
  ember: (e) => {
    if (e.dead) return has('ember.defeat') ? ['ember.defeat', defeatFrame(e)] : null;
    if (e.state === 'hurt' || e.state === 'stun') return has('ember.hurt') ? ['ember.hurt', hurtF(e)] : null;
    if (e.state === 'wind') return ['ember.throw', 1 + Math.min(2, Math.floor(e.t / 0.5 * 3))];
    if (e.state === 'strike') return ['ember.throw', 4 + (e.t > 0.1 ? 1 : 0)];
    if (e.state === 'recover') return ['ember.throw', 6 + (e.t > 0.15 ? 1 : 0)];
    if (Math.abs(e.vx) > 30 && has('ember.walk')) return ['ember.walk', Math.floor(e.walkD / 26) % 8];
    return has('ember.idle') ? ['ember.idle', idleF(e)] : null;
  },
};
// The older foes and the creatures: their new idle, hurt and defeat sheets over the frame functions above
function creatureOwn(e) {
  const T = e.type, hurt = e.state === 'hurt' || e.state === 'stun';
  if (e.dead) return has(T + '.defeat') ? [T + '.defeat', defeatFrame(e)] : null;
  if (T === 'moth' && hurt && has('moth.defeat')) return ['moth.defeat', Math.min(2, Math.floor(e.t / 0.3 * 3))];
  if (hurt && has(T + '.hurt')) return [T + '.hurt', hurtF(e)];
  if (T === 'potter' && has('potter.throw') && (e.state === 'draw' || e.state === 'loose')) return null;
  const still = Math.abs(e.vx) < 20 && e.onGround;
  const idleState = { shield: ['idle', 'walk'], archer: ['idle', 'aim'], hound: ['idle'], snapper: ['idle'], mite: ['idle', 'walk', 'creep'], potter: ['idle', 'aim', 'walk'] }[T];
  if (still && idleState && (idleState.includes(e.state) || (T === 'shield' && e.state === 'walk' && !(e.guardDown > 0))) && has(T + '.idle')) return [T + '.idle', idleF(e)];
  return null;
}
// v11 (note 26): a body never holds one frame for long. When no sheet moves it (a held pose), it breathes (a slow
// squash about the feet) and, if it is moving, bobs and leans with each step.
// v11 (review 11 #3): a 0.12 s lean back at the start of every wind-up, and a lean away from a blow while it lands
function poseLean(e) {
  let r = 0;
  if (!e.dead && (e.state === 'wind' || e.state === 'draw' || e.state === 'crouch') && e.t < 0.12) r -= e.face * 0.07 * Math.sin(e.t / 0.12 * Math.PI);
  if (!e.dead && e.sqT > 0) r += (e.sqSide || 0) * 0.2 * (e.sqT / SQ_DUR) * (e.sqK || 1);
  return r;
}
function lifeOf(e, key, f) {
  const sig = key + ':' + f;
  if (sig !== e.lastSig) { e.lastSig = sig; e.sigT = 0; } else e.sigT = (e.sigT || 0) + 1 / 60;
  if (e.dead || e.sigT < 0.25) return { sy: 1, dy: 0, rot: 0 };
  const mv = Math.abs(e.vx) > 20, ph = e.walkD / 26 * Math.PI;
  return mv ? { sy: 1, dy: -Math.abs(Math.sin(ph)) * 5, rot: Math.sin(ph) * 0.05 * e.face } : { sy: 1 + 0.015 * Math.sin(e.animT * 2.4), dy: 0, rot: 0 };
}
function drawArmy(ctx, e) {
  const T = TYPES[e.type];
  let [key, f] = T.frame(e);
  const own = OWN[e.type] && OWN[e.type](e), hasOwn = !!(own && Assets.has(own[0])), artDone = Assets.has(e.type === 'parasol' ? 'parasol.walk' : e.type === 'hook' ? 'hook.attack' : 'ember.throw');
  if (e.type === 'slinger') { const [k0, f0] = hasOwn ? own : T.frame(e); const [sh, an] = k0.split('.'); drawSoldier(ctx, e, { frame: [an, f0], sheet: sh }); return; }
  if (hasOwn) [key, f] = own;
  { const ov = aaPose(e); if (ov) [key, f] = ov; }   // v14 (note 57)
  const [sheet, anim] = key.split('.');
  drawSoldier(ctx, e, { frame: [anim, f], sheet, tint: artDone ? null : ARMY_TINT[e.type], rot: hasOwn && e.type === 'parasol' ? (e.state === 'wind' ? -0.08 : e.state === 'strike' ? 0.12 : 0) * e.face : 0 });
  if (artDone && e.type !== 'parasol') return;
  if (e.dead && e.deadT > 0.3) return;
  const fa = e.dead ? 0 : 1, face = e.face;
  if (e.type === 'parasol') {
    const tilt = e.state === 'wind' ? -0.12 : e.state === 'strike' ? 0.18 : e.state === 'turn' ? Math.sin(e.t * 20) * 0.08 : 0;
    if (e.dome !== false && !artDone) drawDome(ctx, e.x - face * 18, e.y - 215 + Math.sin(e.animT * 2) * 2, face, tilt, fa);
    // the spear: held low, thrust on the strike
    if (!artDone) {
      const reach = e.state === 'strike' ? 175 : e.state === 'wind' ? 60 : 95, y = e.y - 118;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = INK_E; ctx.beginPath(); ctx.moveTo(e.x - face * 30, y + 10); ctx.lineTo(e.x + face * reach, y); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = '#8a5d3b'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.x + face * (reach + 30), y - 1); ctx.lineTo(e.x + face * reach, y - 9); ctx.lineTo(e.x + face * reach, y + 8); ctx.closePath(); ctx.fillStyle = '#f2d58a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK_E; ctx.stroke();
      ctx.restore();
    }
  } else if (e.type === 'hook') {
    const st = e.state, low = st === 'recover';
    const fwd = st === 'lunge' ? 1.4 : st === 'wind' ? -0.5 : low ? 2.3 : 0.25;
    drawBlade(ctx, e.x + face * 46, e.y - (low ? 70 : 105), face * fwd, 1.05 * face);
    drawBlade(ctx, e.x - face * 40, e.y - (low ? 70 : 108), -face * (low ? 2.3 : st === 'lunge' ? 0.9 : 0.35), -1.0 * face);
    if (st === 'wind' && e.t > 0.3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(e.x + face * 60, e.y - 190, 8 + 4 * Math.sin(G.time * 30), 0, 7); ctx.fill(); ctx.restore(); }
  } else if (e.type === 'ember' && e.state === 'wind') {
    // the flask, lit, raised behind the head
    const x = e.x - face * 30, y = e.y - 200 - Math.min(1, e.t / 0.4) * 20;
    ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, 15, 19, 0, 0, 7); ctx.fillStyle = '#a5643c'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK_E; ctx.stroke();
    flame(ctx, x, y - 16, 34, G.time * 1.6); ctx.restore();
  }
  if (e.domeFly) drawDome(ctx, e.domeFly.x, e.domeFly.y, 1, e.domeFly.rot, clamp(1.2 - e.domeFly.t, 0, 1));
}

function drawCreature(ctx, e) {
  const T = TYPES[e.type], dsheet = e.dead && Assets.has(e.type + '.defeat');
  let [key, f] = dsheet ? [e.type + '.defeat', defeatFrame(e)] : T.frame(e);
  { const ov = !dsheet && aaPose(e); if (ov) [key, f] = ov; }   // v14 (note 57): the shield raised overhead from its own sheet
  // v10: the Pot Lobber's own sheet (reach 1-3, lob 4-5, settle 6-7); the snapper on its back (0-5 flailing, 6-7 righting)
  const potArt = e.type === 'potter' && Assets.has('potter.throw');
  const mine = creatureOwn(e); if (mine) [key, f] = mine;
  if (potArt && !e.dead && !mine) { key = 'potter.throw'; f = e.state === 'draw' ? 1 + Math.min(2, Math.floor(e.t / 0.7 * 3)) : e.state === 'loose' ? (e.t < 0.15 ? 4 : e.t < 0.25 ? 5 : 6) : e.state === 'hurt' || e.state === 'stun' ? 7 : 0; }
  const flipArt = e.type === 'snapper' && e.state === 'flipped' && Assets.has('snapper.flipped');
  if (flipArt) { key = 'snapper.flipped'; f = e.t > FLIP_T - 0.3 ? 6 + (e.t > FLIP_T - 0.15 ? 1 : 0) : Math.floor(e.t * 10) % 6; }
  const alpha = e.dead ? defeatAlpha(e, dsheet) : 1;
  const hp = hitPose(e), lf = lifeOf(e, key, f);
  const opt = { flash: hp.flash, flashColor: hp.color, alpha, sx: hp.sx, sy: hp.sy * lf.sy, rot: lf.rot + poseLean(e), rim: G.room.rim, rimA: G.room.rimA, tint: potArt || mine ? null : ARMY_TINT[e.type] };
  if (e.guardDown > 0 && e.type === 'shield' && Math.floor(G.time * 10) % 2) { opt.flash = Math.max(opt.flash, 0.25); opt.flashColor = '255,233,168'; }
  if (e.burnT > 0) { opt.flash = Math.max(opt.flash, 0.2 + 0.15 * Math.sin(G.time * 30)); opt.flashColor = '255,150,60'; }
  const flipped = e.type === 'snapper' && e.state === 'flipped' && !flipArt;
  if ((e.onGround || e.flies) && !e.dead) { const gy = e.flies ? e.y + 240 : e.y + 2; if (!e.flies) { ctx.fillStyle = 'rgba(20,10,25,0.28)'; ctx.beginPath(); ctx.ellipse(e.x, gy, e.w * 0.55, 9, 0, 0, 7); ctx.fill(); } }
  let feet = e.y + 5 + (T.drawY || 0) + lf.dy;
  ctx.save();
  if (flipped) { ctx.translate(e.x, e.y - e.h * 0.5); ctx.scale(1, -1); ctx.translate(-e.x, -(e.y - e.h * 0.5)); }
  if (e.type === 'mite' && e.state === 'roll') {   // the ball turns as it rolls
    ctx.translate(e.x, e.y - 34); ctx.rotate(e.spin * 0.6); ctx.translate(-e.x, -(e.y - 34));
  }
  if (e.state === 'stun' || e.state === 'dazed') { for (let i = 0; i < 3; i++) { const a = G.time * 6 + i * 2.1; ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * 40, e.y - e.h - 18 + Math.sin(a) * 8, 6, 0, 7); ctx.fill(); } }
  if (!Assets.drawChar(ctx, key, f, e.x + hp.ox, feet, e.face, opt)) {
    ctx.fillStyle = '#7b3a32'; ctx.beginPath(); ctx.ellipse(e.x, e.y - e.h / 2, e.w / 2, e.h / 2, 0, 0, 7); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#1d1420'; ctx.stroke();
  }
  ctx.restore();
  if (e.type === 'archer') drawArcherAim(ctx, e);
  if (e.type === 'potter' && e.state === 'draw' && !e.dead && !potArt) {   // v10: the fire-pot lifted overhead, its wick smoking
    const x = e.x - e.face * 10, y = e.y - 215 - Math.min(1, e.t / 0.5) * 24;
    ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, 22, 20, 0, 0, 7); ctx.fillStyle = '#b5714a'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK_E; ctx.stroke();
    ctx.fillStyle = '#7a3e24'; ctx.fillRect(x - 12, y - 24, 24, 8); flame(ctx, x, y - 22, 26, G.time * 1.6); ctx.restore();
  }
  if (G.debug) { ctx.strokeStyle = '#f00'; ctx.lineWidth = 2; ctx.strokeRect(e.x - e.w / 2, e.y - e.h, e.w, e.h); }
}

// One bad frame of one body must never blank the game: each draw is fenced and logged once.
const drawErrs = new Set();
export function safeDraw(ctx, tag, fn) {
  ctx.save();
  try { fn(); } catch (err) { if (!drawErrs.has(tag + err.message)) { drawErrs.add(tag + err.message); console.warn('draw error in ' + tag + ': ' + err.message); } }
  ctx.restore();
}
export function drawEnemies(ctx) {
  for (const e of G.enemies) {
    safeDraw(ctx, e.boss ? 'boss ' + e.kind + ' ' + e.state : 'enemy ' + e.type, () => {
      if (e.boss) drawBoss(ctx, e);
      else if (e.type === 'slinger' && Assets.has('ember.throw')) drawArmy(ctx, e);   // v10: the fire-thrower's own throw
      else if (e.type === 'brawler' || e.type === 'slinger') drawSoldier(ctx, e);
      else if (e.type === 'post') drawPost(ctx, e);
      else if (TYPES[e.type].army) drawArmy(ctx, e);
      else drawCreature(ctx, e);
    });
  }
  safeDraw(ctx, 'anti-air', () => drawAntiAir(ctx));
}

export function drawHurts(ctx) {
  const t = G.time;
  for (const h of G.hurts) {
    if (h.src || h.src2) continue; // melee: the attack itself is the tell
    if (h.delay > 0) {
      // telegraph: a pulsing mark on the ground
      ctx.save(); ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 30);
      ctx.fillStyle = h.kind === 'flame' ? '#ffb347' : h.kind === 'spike' ? '#e6cc94' : '#bfe9f2';
      // v14 (note 57): fx/ground-warning.png stretched over the spot once it lands (the game tints fire and stone)
      if (h.kind !== 'icepillar' && !Assets.drawFx(ctx, 'fx.groundwarn', Math.floor(t * 12) % 8, h.x + h.w / 2, h.y + h.h + 6, Math.max(60, h.w * 0.3), 1, { anchor: 'bottom', sx: h.w / Math.max(60, h.w * 0.3) * 0.9, tint: h.kind === 'flame' ? 'rgba(255,150,60,0.5)' : null })) { if (h.kind !== 'icepillar') ctx.fillRect(h.x, h.y + h.h - 14, h.w, 14); }
      if (h.kind === 'icepillar') {
        // v14 (Connor's notes 52, 57, 59): the tell is a sprite, fx/frost-crack-tell.png (frost cracks spreading and
        // glowing brighter, frame 8 just before the burst) once it lands; until then the ice-spike strip's first frames
        // (the floor cracking), pulsing on the spot. A frost crackle and a low rumble start it (bosses.js).
        const D0 = h.tell0 || 0.85, k = 1 - Math.min(1, h.delay / D0), y = h.y + h.h, cx = h.x + h.w / 2;
        ctx.globalAlpha = 1;
        if (!Assets.drawFxBox(ctx, 'fx.frosttell', Math.min(7, Math.floor(k * 8)), cx, y + 4, 210, 1, { anchor: 'bottom', refF: 7 })) Assets.drawFx(ctx, 'fx.icespikes', k < 0.6 ? 0 : 1, cx, y + 6, 150 + 120 * k, 1, { anchor: 'bottom', alpha: 0.6 + 0.4 * Math.abs(Math.sin(t * 9)) });
      }
      if (h.kind === 'spout') {   // painted bubbling: the warning sheet, else rising droplets from the whip sheet
        ctx.globalAlpha = 0.9;
        if (Assets.has('fx.spoutwarn')) Assets.drawFx(ctx, 'fx.spoutwarn', Math.floor(t * 12) % 8, h.x + h.w / 2, h.y + h.h + 4, h.w * 1.3, 1, { anchor: 'bottom' });
        else for (let i = 0; i < 2; i++) Assets.drawFx(ctx, 'fx.whip', 6 + ((Math.floor(t * 8) + i) % 2), h.x + h.w * (0.35 + 0.3 * i), h.y + h.h - 40, 110, i ? -1 : 1, { rot: -0.6 });
      }
      ctx.restore();
      continue;
    }
    if (h.kind === 'icepillar' || h.kind === 'icesplash') { drawIcePillar(ctx, h); continue; }
    if (drawBossHurt(ctx, h, t)) continue;
    const k = Math.min(1, (h.age || 0) / 0.08);
    if (h.kind === 'spike') {
      for (let i = 0; i < 3; i++) {
        const x = h.x + h.w * (0.2 + i * 0.3), hh = h.h * k * (i === 1 ? 1 : 0.7);
        ctx.beginPath(); ctx.moveTo(x - h.w * 0.17, h.y + h.h); ctx.lineTo(x + (i - 1) * 8, h.y + h.h - hh); ctx.lineTo(x + h.w * 0.17, h.y + h.h); ctx.closePath();
        ctx.fillStyle = i === 1 ? '#c2a06a' : '#9c7c4d'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#3b2917'; ctx.lineJoin = 'round'; ctx.stroke();
      }
    } else if (h.kind === 'groundfire') {
      // v10 (note 14): burning ground: a low painted strip (fx-burning-ground.png) or code flames, dying down at the end
      const a = Math.min(1, h.t / 0.5), k2 = Math.min(1, (h.age || 0) / 0.15);
      ctx.save(); ctx.globalAlpha = a;
      const gl = ctx.createLinearGradient(0, h.y + h.h - 30, 0, h.y + h.h + 6); gl.addColorStop(0, 'rgba(255,140,40,0)'); gl.addColorStop(1, 'rgba(255,120,30,0.55)');
      ctx.fillStyle = gl; ctx.fillRect(h.x - 10, h.y + h.h - 30, h.w + 20, 36);
      if (Assets.has('fx.burningground')) { for (let x = h.x; x < h.x + h.w; x += 110) { const age = h.age || 0, fr = age < 0.12 ? 0 : h.t < 0.25 ? 7 : h.t < 0.6 ? 6 : 1 + (Math.floor(t * 10 + x * 0.013 + h.seed) % 5); Assets.drawFx(ctx, 'fx.burningground', fr, x + 55, h.y + h.h + 4, 130, 1, { anchor: 'bottom' }); } }
      else for (let i = 0; i < Math.ceil(h.w / 34); i++) flame(ctx, h.x + 17 + i * 34, h.y + h.h + 2, h.h * k2 * (0.75 + 0.35 * Math.sin(i * 2.1 + h.seed)), t * 1.3 + i * 0.7 + h.seed);
      ctx.restore();
    } else if (h.kind === 'flame') {
      const a = Math.min(1, h.t / 0.25);
      ctx.save(); ctx.globalAlpha = a;
      if (h.small && Assets.has('fx.burningground')) Assets.drawFx(ctx, 'fx.burningground', 3 + (Math.floor(t * 12) % 2), h.x + h.w / 2, h.y + h.h + 4, h.w * 1.3, 1, { anchor: 'bottom' });   // v10: a pot's burst is low fire, not a pillar
      else if (!Assets.drawFx(ctx, 'fx.burn', 2 + (Math.floor(t * 12 + h.x) % 4), h.x + h.w / 2, h.y + h.h - h.h * 0.55, Math.max(h.w, h.h) * 1.6, 1))
        for (let i = 0; i < 3; i++) flame(ctx, h.x + h.w * (0.25 + i * 0.25), h.y + h.h, h.h * 0.72 * k * (i === 1 ? 1 : 0.7), t * 1.3 + i);
      ctx.restore();
    } else if (h.kind === 'shock') {
      ctx.save(); ctx.globalAlpha = 1 - (h.age || 0) / 0.25;
      if (!Assets.drawFx(ctx, 'fx.slam', 3 + Math.min(4, Math.floor((h.age || 0) / 0.05)), h.x + h.w / 2, h.y + h.h + 6, h.w * 1.2, 1, { anchor: 'bottom' })) {
        ctx.fillStyle = h.color || '#bfe9f2';
        for (let x = h.x; x < h.x + h.w; x += 34) { const hh = h.h * (0.5 + 0.5 * Math.sin(x * 0.2 + t * 30)); ctx.fillRect(x, h.y + h.h - hh, 22, hh); }
      }
      ctx.restore();
    }
    if (G.debug) { ctx.strokeStyle = '#f80'; ctx.lineWidth = 2; ctx.strokeRect(h.x, h.y, h.w, h.h); }
  }
}

// v14 (Connor's notes 43, 57, 58): the fire pots and their burst are sprites: fx/fire-pot.png (a spinning clay pot with a
// lit fuse) and fx/fire-pot-burst.png (an inked flame burst with clay shards) when they land; until then the fireball
// strip in flight and the fire-blast strip on impact. Nothing drawn in code.
const POT_BURSTS = [];
function drawFirePot(ctx, s, t) {
  const f = Math.floor(t * 14) % 8;
  // v15 (Connor's note 67, "like a grenade or a bomb"): a small clay fire-bomb about the size of Joon's head. Frame 0's
  // painted box (pot, fuse and flame) is 199 x 337, so 32 px wide draws it about 54 px tall (it was 58 wide, ~98 tall)
  if (Assets.drawFxBox(ctx, 'fx.firepot', f, s.x, s.y, 32, sign(s.vx || 1))) return;
  Assets.drawFx(ctx, 'fx.fireball', f, s.x, s.y, 120, 1, { rot: Math.atan2(s.vy, s.vx) });
}
function drawPotBursts(ctx) {
  for (let i = POT_BURSTS.length - 1; i >= 0; i--) {
    const b = POT_BURSTS[i], t = G.time - b.t0;
    if (t > 0.42) { POT_BURSTS.splice(i, 1); continue; }
    // v15 (note 67): the burst is about 1.5x Joon's height (its biggest frame drawn ~300 px tall), and it starts on the
    // flame (frame 3): frames 0-2 paint the whole pot cracking at burst size, which read as a pot bigger than Joon
    const f = Math.min(7, 3 + Math.floor(t / 0.42 * 5));
    if (!Assets.drawFxBox(ctx, 'fx.firepotburst', f, b.x, b.y - 130, 290, 1, { refF: 3 })) Assets.drawFx(ctx, 'fx.fireblast', f, b.x, b.y - 80, 280, 1);
  }
}
export function drawShots(ctx) {
  drawPotBursts(ctx);
  const t = G.time;
  // v10 (note 14): anything dropped from above shows where it will land: a shadow that grows as it falls
  for (const s of G.shots) if (s.shadow && s.from === 'enemy') {
    const k = clamp(1 - (s.shadow.y - s.y) / 900, 0, 1);
    ctx.save(); ctx.globalAlpha = 0.2 + 0.55 * k; ctx.fillStyle = 'rgba(20,10,25,0.85)'; ctx.beginPath(); ctx.ellipse(s.shadow.x, s.shadow.y + 2, 20 + 50 * k, 6 + 10 * k, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  // v10 (note 16): the aim line of a caught shot, dotted out to 420 px with a head
  if (G.aim) {
    const a = G.aim, s = a.s;
    ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = '#eafcff';
    for (let d = 40; d < 420; d += 34) { ctx.beginPath(); ctx.arc(s.x + a.ax * d, s.y + a.ay * d, 6 - d / 140, 0, 7); ctx.fill(); }
    const hx = s.x + a.ax * 440, hy = s.y + a.ay * 440, an = Math.atan2(a.ay, a.ax);
    ctx.translate(hx, hy); ctx.rotate(an); ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-10, -16); ctx.lineTo(-10, 16); ctx.closePath();
    ctx.lineWidth = 5; ctx.strokeStyle = '#1d1420'; ctx.stroke(); ctx.fill();
    ctx.restore();
  }
  for (const s of G.shots) {
    if (s.kind === 'fireblast') {
      const f = 1 + (Math.floor(s.t * 16) % 5);
      if (!Assets.drawFx(ctx, 'fx.fireblast', f, s.x, s.y, 250, sign(s.vx), Math.abs(s.vy) > Math.abs(s.vx) ? { rot: Math.PI / 2 * sign(s.vy) } : {})) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx) + Math.PI / 2); flame(ctx, 0, 34, 60, t); ctx.restore(); }
    } else if (s.kind === 'fireball' || s.kind === 'cinder') {
      const f = Math.floor(s.t * 14) % 8, ang = Math.atan2(s.vy, s.vx);
      if (!Assets.drawFx(ctx, 'fx.fireball', f, s.x - Math.cos(ang) * s.r * 1.1, s.y - Math.sin(ang) * s.r * 1.1, s.r * 7.5, 1, { rot: ang })) {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(ang + Math.PI / 2); flame(ctx, 0, s.r * 0.9, s.r * 2.1, t * 1.4); ctx.restore();
      }
      if (s.reflected) { ctx.strokeStyle = 'rgba(234,252,255,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 10, 0, 7); ctx.stroke(); }
    } else if (s.kind === 'arrow') {
      const ang = s.stuck ? s.ang : Math.atan2(s.vy, s.vx);
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(ang);
      if (s.stuck) ctx.globalAlpha = Math.min(1, s.life * 2);
      ctx.lineCap = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = '#1d1420'; ctx.beginPath(); ctx.moveTo(-70, 0); ctx.lineTo(4, 0); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = '#8a5d3b'; ctx.beginPath(); ctx.moveTo(-68, 0); ctx.lineTo(2, 0); ctx.stroke();
      ctx.fillStyle = '#e2574c'; ctx.beginPath(); ctx.moveTo(-72, 0); ctx.lineTo(-58, -9); ctx.lineTo(-54, 0); ctx.lineTo(-58, 9); ctx.closePath(); ctx.fill();
      if (!s.stuck || s.life > 0.6) Assets.drawFx(ctx, 'fx.fireball', Math.floor(s.t * 14) % 8, -6, 0, 90, 1);
      ctx.restore();
      if (s.reflected) { ctx.strokeStyle = 'rgba(234,252,255,0.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, s.y, 26, 0, 7); ctx.stroke(); }
    } else if (s.kind === 'flask' || s.kind === 'pot') {
      // v10: the pot's shadow grows where it will land (drawn first, on the ground)
      if (s.kind === 'pot' && s.target && !s.reflected && !s.held) {
        const k = clamp(s.t / (s.flight || 1.2), 0, 1);
        ctx.save(); ctx.globalAlpha = 0.25 + 0.5 * k; ctx.fillStyle = 'rgba(20,10,25,0.85)'; ctx.beginPath(); ctx.ellipse(s.target.x, s.target.y + 2, 30 + 60 * k, 8 + 12 * k, 0, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.35 + 0.5 * k; ctx.lineWidth = 4; ctx.strokeStyle = '#ffb347'; ctx.setLineDash([12, 10]); ctx.lineDashOffset = -t * 60; ctx.beginPath(); ctx.ellipse(s.target.x, s.target.y + 2, 95, 22, 0, 0, 7); ctx.stroke(); ctx.restore();
      }
      if (s.kind === 'pot') drawFirePot(ctx, s, t);
      else {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.t * 8 * sign(s.vx));
        const r = s.kind === 'pot' ? 22 : 15;
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.1, 0, 0, 7); ctx.fillStyle = s.kind === 'pot' ? '#b5714a' : '#a5643c'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#1d1420'; ctx.stroke();
        ctx.fillStyle = '#7a3e24'; ctx.fillRect(-r * 0.55, -r * 1.25, r * 1.1, r * 0.4);
        ctx.restore();
        flame(ctx, s.x, s.y - 14, 24, t * 1.6);
      }
      if (s.reflected) { ctx.strokeStyle = 'rgba(234,252,255,0.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, s.y, 30, 0, 7); ctx.stroke(); }
    } else if (s.kind === 'orb') {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fillStyle = s.reflected ? '#eafcff' : '#3fa7b8'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#12414c'; ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.3, 0, 7); ctx.fillStyle = '#bfe9f2'; ctx.fill();
    } else if (s.kind === 'boulder') {
      // a kit rock, tumbling
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.t * 6 * sign(s.vx));
      if (!drawKitRock(ctx, s.r)) {
        ctx.beginPath(); ctx.moveTo(-s.r, -s.r * 0.3); ctx.lineTo(-s.r * 0.4, -s.r); ctx.lineTo(s.r * 0.6, -s.r * 0.8); ctx.lineTo(s.r, 0); ctx.lineTo(s.r * 0.5, s.r); ctx.lineTo(-s.r * 0.6, s.r * 0.8); ctx.closePath();
        ctx.fillStyle = '#b59a6e'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#3b2917'; ctx.lineJoin = 'round'; ctx.stroke();
      }
      ctx.restore();
    } else if (s.kind === 'icicle') {
      if (!Assets.drawFx(ctx, 'fx.icicle', Math.min(2, Math.floor(s.t * 8)), s.x, s.y - s.r * 2.2, s.r * 14, 1)) drawIcicle(ctx, s.x, s.y, s.r);
    } else if (s.kind === 'icespikes' || s.kind === 'frostsweep' || s.kind === 'frozenwave') {
      drawIceWave(ctx, s, t);
    } else if (s.wave) {
      const fire = s.kind === 'firewave', d = sign(s.vx);
      if (s.kind === 'rockwave') {
        if (!Assets.drawFx(ctx, 'fx.stonewall', 4 + (Math.floor(s.t * 12) % 3), s.x, s.y + 4, s.h * 2.0, d, { anchor: 'bottom' })) drawRockWave(ctx, s, t, d);
      } else if (fire) {
        if (!Assets.drawFx(ctx, 'fx.burn', 2 + (Math.floor(s.t * 14) % 4), s.x, s.y - s.h * 0.55, s.h * 2.0, d)) { ctx.save(); ctx.translate(s.x, s.y); for (let i = 0; i < 3; i++) flame(ctx, -s.w * 0.3 + i * s.w * 0.3, 0, s.h * (0.6 + i * 0.2), t * 1.5 + i); ctx.restore(); }
      } else if (!Assets.drawFx(ctx, 'fx.whip', 3 + (Math.floor(s.t * 12) % 3), s.x, s.y - s.h * 0.5, s.h * 2.3, d)) {
        ctx.save(); ctx.translate(s.x, s.y); ctx.scale(d, 1);
        ctx.beginPath(); ctx.moveTo(-s.w * 0.7, 0); ctx.quadraticCurveTo(-s.w * 0.2, -s.h * 0.5, 0, -s.h); ctx.quadraticCurveTo(s.w * 0.75, -s.h * 0.9, s.w * 0.5, -s.h * 0.4); ctx.quadraticCurveTo(s.w * 0.2, -s.h * 0.5, s.w * 0.5, 0); ctx.closePath();
        ctx.fillStyle = '#3fa7b8'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#12414c'; ctx.stroke(); ctx.restore();
      }
    }
    if (G.debug) { ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.stroke(); }
  }
}
// v12 (Connor's note 39): the Rime Warden's attacks, drawn big in solid cel shapes: ink outline, two flat tones and a
// white edge. Spikes race along the floor in a row that rises and sinks behind its front; the sweep is a low curling
// wall of frost; the frozen wave is a tall crest locked in ice.
const ICE = ['#eaf7ff', '#a9d6ef', '#5d97bf'];
function iceShard(ctx, x, y, w, h, lean = 0) {
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + lean - w * 0.08, y - h); ctx.lineTo(x + w / 2, y); ctx.closePath();
  ctx.fillStyle = ICE[1]; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#1b2a3a'; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - w * 0.18, y - 4); ctx.lineTo(x + lean - w * 0.08, y - h + 8); ctx.lineTo(x - w * 0.02, y - 4); ctx.closePath(); ctx.fillStyle = ICE[0]; ctx.fill();
}
function drawIcicle(ctx, x, y, r) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 3); ctx.lineTo(r * 0.8, -r * 3); ctx.lineTo(0, r * 1.2); ctx.closePath();
  ctx.fillStyle = ICE[1]; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#1b2a3a'; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 2.8); ctx.lineTo(-r * 0.05, -r * 2.8); ctx.lineTo(-r * 0.05, r * 0.6); ctx.closePath(); ctx.fillStyle = ICE[0]; ctx.fill();
  ctx.restore();
}
function drawIceWave(ctx, s, t) {
  const d = sign(s.vx);
  // v13: the planner's ink-brush strips when they are in: three frames of rising, then the travelling loop
  // the spike strip (rise 1-5, shatter 6-7, melt 8): the front spike keeps rising, the ones it left behind shatter and
  // melt into the floor, so it reads as ice erupting along the ground. The peak spike stands about 1.3x the hit box.
  if (s.kind === 'icespikes' && Assets.has('fx.icespikes')) {
    const sz = s.h * 3.6, front = s.t < 0.08 ? Math.floor(s.t / 0.04) : 2 + (Math.floor(s.t * 16) % 3);
    const trail = s.t < 0.08 ? [front] : [front, 5, 6, 7];
    for (let i = trail.length - 1; i >= 0; i--) Assets.drawFx(ctx, 'fx.icespikes', trail[i], s.x - d * i * 58, s.y + 6, sz, d, { anchor: 'bottom' });
    return;
  }
  const strip = s.kind === 'icespikes' ? 'fx.icespikes' : s.kind === 'frozenwave' ? 'fx.frozenwave' : null;
  if (strip && Assets.has(strip)) {   // the frozen wave: water rises (1-3), the crest freezes (4-5), it breaks up (6-8) as it dies
    const f = s.life < 0.35 ? 5 + Math.min(2, Math.floor((0.35 - s.life) / 0.12)) : s.t < 0.25 ? Math.floor(s.t / 0.084) : 3 + (Math.floor(s.t * 5) % 2);
    Assets.drawFx(ctx, strip, f, s.x, s.y + 6, s.h * 4.2, d, { anchor: 'bottom' });
    return;
  }
  ctx.save();
  if (s.kind === 'icespikes') {
    // the front spike is tallest; a trail of shorter ones sinks back into the floor behind it
    for (let i = 0; i < 6; i++) {
      const x = s.x - d * i * 46, k = Math.max(0, 1 - i * 0.17), h = s.h * 1.3 * k * (0.85 + 0.15 * Math.sin(t * 40 + i));
      if (h > 6) iceShard(ctx, x, s.y + 4, 46 + 20 * k, h, d * 10);
    }
  } else if (s.kind === 'frostsweep') {
    // v14 (Connor's note 57): the crystal rush from art: fx/crystal-rush.png when it lands, else the ice-shatter strip's
    // flying shards, three overlapping, looping as they race along the floor
    ctx.restore();
    const f = Math.floor(t * 16);
    const rf = s.t < 0.12 ? Math.floor(s.t / 0.04) : s.life < 0.16 ? 6 + Math.min(1, Math.floor((0.16 - s.life) / 0.08)) : 3 + (Math.floor(t * 12) % 3);
    if (Assets.drawFxBox(ctx, 'fx.crystalrush', rf, s.x, s.y + 6, s.w * 2.1, d, { anchor: 'bottom', refF: 4 })) return;
    for (let i = 0; i < 3; i++) Assets.drawFx(ctx, 'fx.iceshatter', 2 + ((f + i * 2) % 4), s.x - d * i * 60, s.y - s.h * (0.45 - i * 0.08), s.h * (1.9 - i * 0.3), d);
    return;
  } else {
    ctx.translate(s.x, s.y); ctx.scale(d, 1);
    ctx.beginPath(); ctx.moveTo(-s.w * 0.8, 0); ctx.quadraticCurveTo(-s.w * 0.5, -s.h * 0.7, 0, -s.h); ctx.quadraticCurveTo(s.w * 0.55, -s.h * 1.05, s.w * 0.6, -s.h * 0.6);
    ctx.quadraticCurveTo(s.w * 0.35, -s.h * 0.7, s.w * 0.3, -s.h * 0.45); ctx.lineTo(s.w * 0.55, 0); ctx.closePath();
    ctx.fillStyle = ICE[1]; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#1b2a3a'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s.w * 0.5, -s.h * 0.25); ctx.quadraticCurveTo(-s.w * 0.2, -s.h * 0.8, s.w * 0.1, -s.h * 0.92); ctx.lineWidth = 8; ctx.strokeStyle = ICE[0]; ctx.stroke();
    for (let i = 0; i < 4; i++) iceShard(ctx, s.w * (0.35 - i * 0.12), -s.h * (0.55 + i * 0.1), 26, 40, 8);   // the frozen crest's spikes
  }
  ctx.restore();
}
function drawIcePillar(ctx, h) {
  const age = h.age || 0, y = h.y + h.h;
  if (h.kind === 'icesplash') return;
  // bursts up in 0.08 s, holds, then cracks and sinks in the last 0.15 s
  const k = Math.min(1, age / 0.08) * (h.t < 0.15 ? h.t / 0.15 : 1), hh = h.h * k, cx = h.x + h.w / 2;
  if (Assets.has('fx.icepillar')) {   // v13: the ink-brush strip: burst (0-3), hold (4-5), crack and sink (6-7)
    const f = h.t < 0.15 ? 6 + Math.min(1, Math.floor((0.15 - h.t) / 0.075)) : age < 0.12 ? Math.floor(age / 0.03) : 4 + (Math.floor(age * 6) % 2);
    Assets.drawFx(ctx, 'fx.icepillar', f, cx, y + 4, h.h * 1.72, 1, { anchor: 'bottom' });
    return;
  }
  ctx.save();
  ctx.beginPath(); ctx.moveTo(h.x, y); ctx.lineTo(h.x + 8, y - hh * 0.8); ctx.lineTo(cx - 10, y - hh); ctx.lineTo(cx + 18, y - hh * 0.9); ctx.lineTo(h.x + h.w - 6, y - hh * 0.7); ctx.lineTo(h.x + h.w, y); ctx.closePath();
  ctx.fillStyle = ICE[1]; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#1b2a3a'; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(h.x + 22, y - 6); ctx.lineTo(h.x + 26, y - hh * 0.78); ctx.lineTo(cx - 12, y - hh * 0.95); ctx.lineTo(cx - 6, y - 6); ctx.closePath(); ctx.fillStyle = ICE[0]; ctx.fill();
  ctx.beginPath(); ctx.moveTo(h.x + h.w - 20, y - 6); ctx.lineTo(h.x + h.w - 18, y - hh * 0.62); ctx.lineTo(cx + 16, y - hh * 0.85); ctx.lineTo(cx + 8, y - 6); ctx.closePath(); ctx.fillStyle = ICE[2]; ctx.globalAlpha = 0.6; ctx.fill();
  ctx.restore();
}
function drawRockWave(ctx, s, t, d) {
  ctx.save(); ctx.translate(s.x, s.y); ctx.scale(d, 1);
  for (let i = 0; i < 3; i++) {
    const x = -s.w * 0.45 + i * s.w * 0.4, hh = s.h * (0.55 + 0.45 * ((i + 1) / 3)) * (0.9 + 0.1 * Math.sin(t * 30 + i));
    ctx.beginPath(); ctx.moveTo(x - 28, 0); ctx.lineTo(x - 6, -hh); ctx.lineTo(x + 14, -hh * 0.8); ctx.lineTo(x + 30, 0); ctx.closePath();
    ctx.fillStyle = i === 2 ? '#c2a06a' : '#9c7c4d'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#3b2917'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  ctx.restore();
}
// The quarry kit's rubble piece, used as a thrown boulder.
let Kits = null;
import('./kits.js').then((m) => { Kits = m.Kits; });
function drawKitRock(ctx, r) {
  const pc = Kits && Kits.ready && Kits.piece(['quarry', 'rubble']);
  if (!pc) return false;
  const s = (r * 2.6) / Math.max(pc.w, pc.h);
  ctx.drawImage(pc.img, pc.x, pc.y, pc.w, pc.h, -pc.w * s / 2, -pc.h * s / 2, pc.w * s, pc.h * s);
  return true;
}
