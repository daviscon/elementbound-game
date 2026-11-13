import { impact } from './fx3d.js';
// Shared game state and the combat rules both sides use: damage, stun, hit weight, guard and parry.
import * as THREE from 'three';
import { Audio } from './audio.js';
import { FX, shake, hitstop, slowmo, Time } from './fx.js';
import { rumble } from './input.js';

export const G = {
  scene: null, camera: null, player: null, enemies: [], projectiles: [], walls: [], hazards: [], dummies: [], pickups: [],
  time: 0, realTime: 0, state: 'title', flags: {}, god: false, encounter: null, checkpoint: null,
  stats: { kills: 0, cliff: 0, start: 0, hits: 0, parries: 0, takedowns: 0 },
  aimPoint: new THREE.Vector3(), aimTarget: null, lockTarget: null, showDamage: false, hud: null, frameTimes: [], seenHints: new Set(),
};

export const ELEMENTS = ['air', 'water', 'earth', 'fire'];
export const COST = { air: 14, water: 14, earth: 18, fire: 8, airH: 30, waterH: 26, earthH: 30, fireH: 32 };
export const EL_COLOR = { air: 0xf2fbff, water: 0x59b8e6, earth: 0xa8834f, fire: 0xff8a3c };
export const BEADS = { soldier: 10, shield: 15, slinger: 12, sergeant: 30, captain: 120 };

let camKick = null;
export function setCamKick(fn) { camKick = fn; }
const _d = new THREE.Vector3();

// hit an enemy. o: { dmg, knock: Vector3 (horizontal m/s), up, heavy, ender, launch, knockdown, stun, staff, from, el, hs }
export function hitEnemy(e, o) {
  if (e.dead || e.invuln || e.takenDown) return false;
  const dmg = o.dmg ?? 5;
  e.hp -= dmg; G.stats.hits++;
  if (e.minHp !== undefined && e.hp < e.minHp) e.hp = e.minHp;   // the Captain only falls to the finishing takedown
  e.char.flash(0.05);
  const at = e.pos.clone(); at.y += e.height * 0.6;
  // contact point: on the near side of the body
  if (o.from) { _d.copy(o.from).sub(e.pos).setY(0).normalize(); at.addScaledVector(_d, e.radius * 0.8); }
  FX.hit(at, o.el || null, o.ender ? 1.25 : o.heavy ? 1.1 : 0.85);
  if ((o.ender || (o.heavy && dmg >= 12)) && !o.noImpact) impact(o.el === 'air' ? 'air' : 'gold', 1);   // v3: impact frame on the biggest hits
  if (o.staff) Audio.play(o.heavy || o.ender ? 'staffHitHeavy' : 'staffHit', { at: e.pos, vol: 0.95 });
  else if (o.el === 'air') Audio.play('punch', { at: e.pos, vol: 0.5 });
  else Audio.play(o.heavy || o.ender ? 'hitHeavy' : 'punch', { at: e.pos, vol: 0.85 });
  // stun build-up: 0.6x damage, 1.5x that on heavies, plus whatever the move adds
  const stun = (o.stun ?? 0) + (o.el === 'air' && !o.staff ? 0 : dmg * 0.6 * (o.heavy || o.ender ? 1.5 : 1));
  if (e.addStun) e.addStun(stun);
  if (e.onHurt) e.onHurt(o);
  const hs = o.hs ?? (o.ender ? 0.11 : o.heavy ? 0.09 : 0.045);
  hitstop(hs);
  // the camera nudges in the hit's direction (shake stays for slams)
  if (camKick) { const dir = o.knock && o.knock.lengthSq() > 0.01 ? o.knock.clone().normalize() : (o.from ? e.pos.clone().sub(o.from).setY(0).normalize() : null); if (dir) camKick(dir, o.ender ? 0.12 : o.heavy ? 0.1 : 0.06); }
  if (o.ender || o.heavy) rumble(0.6, 0.4, 90); else rumble(0.2, 0.2, 40);
  G.hud && G.hud.hitmark();
  if (o.knock && !e.boss) {
    const resist = e.heavyBody ? 0.45 : 1;
    e.vel.x += o.knock.x * resist; e.vel.z += o.knock.z * resist;
    if (o.up) { e.vel.y = Math.max(e.vel.y, o.up * resist); e.airborne = true; }
  } else if (o.knock && e.boss) { e.vel.x += o.knock.x * 0.12; e.vel.z += o.knock.z * 0.12; }
  if (e.hp <= 0) killEnemy(e, o);
  else if (e.react) e.react(o);
  return true;
}

export function killEnemy(e, o = {}) {
  if (e.dead) return;
  e.dead = true; e.deadT = 0;
  G.stats.kills++;
  if (o.cliff) G.stats.cliff++;
  if (e.onDeath) e.onDeath(o);
  // beads (experience): more for takedowns and cliff falls
  const n = Math.round((BEADS[e.role || e.kind] ?? 10) * (o.takedown || o.cliff ? 1.5 : 1));
  if (G.player) { G.player.beads += n; G.hud && G.hud.beads(n, e.pos); }
  const left = G.enemies.filter((x) => !x.dead && x.encounter === e.encounter).length;
  if (left === 0 && !e.boss) { slowmo(0.25, 0.9); Audio.duck(0.35, 2); }
}

// the player is hit. from: Vector3 source. o: { sig: 'gold' (can be parried or blocked) | 'red' (cannot) |
// undefined (hazard), attacker, proj, knock, up }. Returns 'parry', 'block', true (hurt) or false (missed).
export const PARRY_EARLY = 0.15, PARRY_LATE = 0.15;
function doParry(at, d, attacker) {
  const p = G.player;
  // parry: no damage, slow motion, an impact frame, the attacker reels and his stun meter jumps; a counter follows
  G.stats.parries++; G.pendingHit = null; G.lastBlock = null;
  FX.parry(at, 'gold'); impact('gold', 3); Audio.play('parry', { vol: 1 }); Audio.play('jingle', { vol: 0.7 });
  hitstop(0.11); slowmo && slowmo(0.3, 0.5); rumble(0.8, 0.6, 60); camKick && camKick(d.clone().negate(), 0.09);
  p.parryJolt();
  if (attacker && attacker.onParried) attacker.onParried(p);
  if (p.parryCounter && attacker) p.parryCounter(attacker);   // v7: no counter prompt after parrying the Elder's icicle (no attacker)
  G.hud && G.hud.parry();
  G.parryLog && G.parryLog.push({ t: G.realTime });
  return 'parry';
}
// v5 (note 37): every frame from player.js. A guard press now settles a held gold hit or a fresh block as a parry.
export function tickParry(pressed) {
  const p = G.player; if (!p) return;
  const ph = G.pendingHit, lb = G.lastBlock;
  if (pressed && ph && G.realTime - ph.t <= PARRY_LATE) { doParry(ph.at, ph.d, ph.o.attacker); ph.o.onLate && ph.o.onLate('parry'); return; }
  if (pressed && lb && G.realTime - lb.t <= PARRY_LATE) { p.action = null; doParry(lb.at, lb.d, lb.attacker); lb.onLate && lb.onLate('parry'); return; }
  if (ph && (G.realTime - ph.t > PARRY_LATE || p.dead || G.state !== 'play')) { G.pendingHit = null; const r = !p.dead && G.state === 'play' ? hurtPlayer(ph.dmg, ph.from, ph.o) : false; ph.o.onLate && ph.o.onLate(r); }
  if (lb && G.realTime - lb.t > PARRY_LATE) G.lastBlock = null;
}
export function hurtPlayer(dmg, from, o = {}) {
  const p = G.player;
  if (!p || p.dead || G.state !== 'play') return false;
  if (p.iframes > 0) return false;
  if (o.sig === 'gold' && !o.noDefer) (G.hitLog || (G.hitLog = [])).push({ t: G.realTime, who: o.attacker ? o.attacker.kind : '-' });   // v5: tell/hit audit
  // guard: facing the attack, palms up
  // v5 (note 37): the parry window is centred on the HIT frame: a guard press up to PARRY_EARLY before it, or up
  // to PARRY_LATE after it (a gold hit that would land is held for that long, and a block is upgraded), on the
  // pad and the keyboard alike. Every parryable melee attack shows a gold flash on the striking hand 0.35 s
  // before its hit frame, with a one-off cue (enemies.js goldTell).
  _d.copy(from).sub(p.pos).setY(0).normalize();
  const facing = Math.sin(p.yaw) * _d.x + Math.cos(p.yaw) * _d.z;
  const at = p.pos.clone().setY(p.pos.y + 1.2).addScaledVector(_d, 0.5);
  if (o.sig === 'gold' && facing > -0.15 && G.realTime - p.guardPressT <= PARRY_EARLY && p.onGround && p.hurtT <= 0) return doParry(at, _d.clone(), o.attacker);
  if (p.guard && o.sig === 'gold' && facing > -0.15) {
    // block: no damage, Joon slides back half a metre (a press in the next PARRY_LATE turns it into a parry)
    FX.parry(at, 'block'); Audio.play('block', { vol: 0.9 }); rumble(0.3, 0.3, 50); hitstop(0.05);
    p.blockSlide(from);
    if (o.attacker && o.attacker.onBlocked) o.attacker.onBlocked(p);
    G.lastBlock = { t: G.realTime, at, d: _d.clone(), attacker: o.attacker, onLate: o.onLate };
    return 'block';
  }
  if (o.sig === 'gold' && !o.noDefer && (!o.proj || o.lateOK) && !G.pendingHit && facing > -0.15 && p.onGround) {   // v6: bolts too (bending.js holds them)
    G.pendingHit = { t: G.realTime, dmg, from: from.clone(), o: { ...o, noDefer: true }, at, d: _d.clone() };
    return 'pending';
  }
  if (G.god) { FX.hit(p.pos.clone().setY(p.pos.y + 1), null, 0.6); return false; }
  p.hp -= dmg; p.iframes = 1.0; p.hurtT = o.sig === 'red' ? 0.5 : 0.34;
  _d.copy(p.pos).sub(from); _d.y = 0; _d.normalize();
  p.vel.x = _d.x * (o.knock ?? 6); p.vel.z = _d.z * (o.knock ?? 6); if (o.up) { p.vel.y = o.up; p.onGround = false; }
  p.char.flash(0.06); p.char.play('hurt', { restart: true, fade: 0.06 });
  if (p.action) p.endAction();
  Audio.play('hurt'); hitstop(0.08); shake(0.3); rumble(1, 0.8, 150);
  camKick && camKick(_d.clone(), 0.12);
  G.hud && G.hud.hurt(from);
  if (p.hp <= 0) p.die();
  return true;
}

export const tmp = { v: new THREE.Vector3(), v2: new THREE.Vector3(), v3: new THREE.Vector3() };
export { Time };
