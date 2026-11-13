// Brass soldiers in four roles and the Captain (three phases).
// Readable by design (v2):
//  - every attack shows a signal above the head for its whole wind-up, with its own sound: gold can be
//    parried or blocked (L1), red cannot (dodge it). Gold wind-ups last at least 0.45 s, red at least 0.6 s.
//  - at most two soldiers attack at once (attack tokens)
//  - a stun meter fills from hits (and jumps on a parry); full, the soldier is dazed for 4 s and R3 takes him down
// Roles: grunt (melee), shield-bearer (turns light strikes aside from the front; a heavy, a parry or a gust
// opens him), slinger (on a ledge, lobs fire pots at a red inked ring; only the aimed gust reaches him),
// Sergeant (elite: more health, a red sweep, a big stun meter that asks for a takedown).
import * as THREE from 'three';
import { G, hitEnemy, hurtPlayer, killEnemy } from './state.js';
import { Character } from './rig.js';
import { Staff } from './staff.js';
import { World } from './world.js';
import { Audio } from './audio.js';
import { swingArc, impact } from './fx3d.js';
import { flameTongue, fireArc, fireball, burnPatch, fireRing, smokePuff, embers, heldFlame, firePillar, fireTell } from './fxfire.js';
import { FX, flip, flipQuad, inkRing, chunks, shake, slowmo, hitstop, rnd } from './fx.js';
import { enemyBolt, firePot, spawnProjectile } from './bending.js';
import { rumble } from './input.js';
import { toon, part, addOutline } from './toon.js';
import { Cam } from './camera.js';
import { Props } from './assets.js';
import { fitFlat } from './world.js';

const GRAV = 26;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ROLE = {
  grunt: { hp: 46, stunMax: 40, poise: 0 },
  shield: { hp: 56, stunMax: 50, poise: 1 },
  slinger: { hp: 26, stunMax: 40, poise: 0 },
  sergeant: { hp: 120, stunMax: 120, poise: 1, scale: 1.12 },
};

class Enemy {
  constructor(kind, pos, o = {}) {
    this.kind = kind;
    this.char = new Character(kind === 'captain' ? 'captain' : o.role === 'shield' ? 'shield' : 'soldier', G.scene);   // v4: the shield-bearer is one model
    this.pos = pos.clone(); this.vel = new THREE.Vector3(); this.yaw = o.yaw ?? 0;
    this.radius = kind === 'captain' ? 0.6 : 0.42; this.height = kind === 'captain' ? 2.0 : 1.75;
    this.state = 'idle'; this.t = 0; this.cd = 1 + Math.random() * 1.5; this.encounter = o.encounter; this.onGround = true;
    this.awake = !!o.awake;
    this.stun = 0; this.stunMax = 60; this.stunned = false; this.stunT = 0; this.sinceHit = 9;
    this.sig = null; this.sigT = 0;
    this.char.root.position.copy(this.pos); this.char.root.rotation.y = this.yaw;
    this.lastGround = pos.y;
  }
  get toPlayer() { return _v.copy(G.player.pos).sub(this.pos); }
  faceTo(yaw, dt, rate = 8) { this.yaw = wrap(this.yaw + wrap(yaw - this.yaw) * (1 - Math.exp(-rate * dt))); }
  setState(s, t = 0) { this.state = s; this.t = t; }
  // the attack signal: gold (parry it) or red (dodge it), shown for the whole wind-up
  signal(kind) {
    this.sig = kind; this.sigT = 0;
    if (kind) { Audio.play(kind === 'gold' ? 'sigGold' : 'sigRed', { at: this.pos, vol: this.boss ? 1 : 0.8 }); G.hud && G.hud.threat(this, kind); }
  }
  addStun(v) {
    if (this.stunned || this.dead) return;
    this.sinceHit = 0;
    this.stun = Math.min(this.stunMax, this.stun + v);
    if (this.stun >= this.stunMax) this.becomeStunned();
  }
  becomeStunned() {
    this.stunned = true; this.stunT = this.boss ? 3.2 : 4; this.signal(null);
    if (this.attacking) { this.attacking = false; G.attackTokens = Math.max(0, (G.attackTokens || 0) - 1); }
    this.setState('dazed'); this.char.play('dazed', { fade: 0.2 });
    Audio.play('dazed', { at: this.pos }); FX.hit(this.pos.clone().setY(this.pos.y + this.height), null, 0.7);
    G.hud && G.hud.takedownReady(this);
  }
  endStun() { this.stunned = false; this.stun = 0; if (!this.dead && !this.takenDown) { this.setState('engage'); this.char.play('idle', { fade: 0.3 }); } }
  tickStun(dt) {
    this.sinceHit += dt;
    if (this.stunned) { this.stunT -= dt; if (this.stunT <= 0 && !this.takenDown) this.endStun(); }
    else if (this.sinceHit > 2) this.stun = Math.max(0, this.stun - 8 * dt);
    if (this.sig) this.sigT += dt;
  }
  physics(dt, wantVel) {
    const k = this.onGround ? (this.gustT > 0 ? 2.2 : 9) : 0.6;
    this.vel.x += (wantVel.x - this.vel.x) * (1 - Math.exp(-k * dt));
    this.vel.z += (wantVel.z - this.vel.z) * (1 - Math.exp(-k * dt));
    this.gustT = Math.max(0, (this.gustT || 0) - dt);
    this.vel.y -= GRAV * dt;
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const c = this.falling ? { x: nx, z: nz } : World.collide(nx, nz, this.radius, this.pos.y + 0.2, 1.5);
    // knocked into a wall: it hurts, and it stuns
    if (c.hit && Math.hypot(this.vel.x, this.vel.z) > 7 && !this.boss && !this.dead) { hitEnemy(this, { dmg: 6, heavy: true, stun: 30 }); this.vel.x *= -0.3; this.vel.z *= -0.3; Audio.play('thud', { at: this.pos }); }
    if (!this.falling) for (const o of G.enemies) {
      if (o === this || o.dead || o.falling) continue;
      const dx = c.x - o.pos.x, dz = c.z - o.pos.z, d = Math.hypot(dx, dz), r = this.radius + o.radius;
      if (d < r && d > 1e-4) { c.x += dx / d * (r - d) * 0.5; c.z += dz / d * (r - d) * 0.5; }
    }
    this.pos.x = c.x; this.pos.z = c.z;
    this.pos.y += this.vel.y * dt;
    const gh = this.falling ? -Infinity : World.ground(this.pos.x, this.pos.z, this.pos.y - this.vel.y * dt);
    if (this.pos.y <= gh && this.vel.y <= 0) {
      if (!this.onGround && this.airborne) { FX.dust(this.pos, 3, 0.9); Audio.play('armorFall', { at: this.pos, vol: 0.6 }); this.airborne = false; if (!this.dead && !this.boss && !this.stunned && !this.takenDown) { this.setState('down'); this.char.play('knockdown', { restart: true, fade: 0.1, dur: 1.4 }); } }
      this.pos.y = gh; this.vel.y = 0; this.onGround = true;
    } else if (this.onGround && gh > -Infinity && this.pos.y - gh < 0.4 && this.vel.y <= 0) { this.pos.y = gh; this.vel.y = 0; }
    else this.onGround = false;
    if (!this.onGround && gh === -Infinity && !this.falling && this.pos.y < this.lastGround - 0.6) {
      if (this.boss) { this.pos.copy(World.spots.bell).setY(World.spots.bell.y + 0.1); this.vel.set(0, 0, 0); }   // the Captain never falls
      else this.fallOff();
    }
    if (this.onGround) this.lastGround = this.pos.y;
  }
  // off the mountain: slow motion, a fading yell, the camera leans after him, a puff in the cloud sea
  fallOff() {
    this.falling = true; this.fallT = 0; this.signal(null);
    this.char.play('flail', { fade: 0.1 });
    Audio.play('cliffFall', { at: this.pos });
    if (!this.dead) { this.hp = 0; killEnemy(this, { cliff: true }); }
    slowmo(0.35, 0.8);
    Cam.watch = { e: this, t: 1.6 };
    G.hud && G.hud.tag('Off the mountain');
  }
  // v5 (note 37): the parry tell. A gold flash on the striking hand exactly 0.35 s before the hit frame, with a
  // one-off cue, the same for every parryable melee attack. hitIn = game seconds from now to the hit frame;
  // the tell is dropped if the attack is interrupted (he leaves the listed states).
  goldTell(hitIn, states, hand = 'handR') { (this.tells || (this.tells = [])).push({ at: hitIn - TELL_LEAD, states, hand }); }
  tickTells(dt) {
    if (!this.tells || !this.tells.length) return;
    for (let i = this.tells.length - 1; i >= 0; i--) {
      const k = this.tells[i]; k.at -= dt;
      if (this.dead || !k.states.includes(this.state)) { this.tells.splice(i, 1); continue; }
      if (k.at > 0) continue;
      this.tells.splice(i, 1);
      const hp = this.char.socket(k.hand, new THREE.Vector3());
      flip('fx3d-parry-flash', hp, { size: this.boss ? 1.3 : 1.0, dur: 0.2 });
      flip('fx3d-parry-flash', hp.clone().add(_v.set(0, 0.02, 0)), { size: 0.55, dur: 0.32 });
      Audio.play('parryTell', { at: this.pos, vol: 0.9 });
      (G.tellLog || (G.tellLog = [])).push({ t: G.realTime, who: this.kind });
    }
  }
  baseUpdate(dt) {
    this.t += dt;
    this.tickTells(dt);
    if (this.dead && !this.falling) {
      this.deadT += dt;
      if (this.deadT > 1.6 && !this.poofed) { this.poofed = true; FX.poof(this.pos.clone().setY(this.pos.y + 0.6)); Audio.play('soldierDefeat', { at: this.pos, vol: 0.5 }); this.remove(); }
    }
    if (this.falling) {
      this.fallT += dt; this.vel.y -= GRAV * dt * 0.6; this.pos.addScaledVector(this.vel, dt);
      if (!this.puffed && this.pos.y < -11) { this.puffed = true; flip('defeat-poof', this.pos, { size: 5, dur: 0.8 }); Audio.play('cloudPuff', { at: this.pos, vol: 1 }); }
      if (this.fallT > 3) this.remove();
    }
    this.char.root.position.copy(this.pos); this.char.root.rotation.y = this.yaw;
    this.char.params.move = Math.hypot(this.vel.x, this.vel.z) / 5;
    this.char.update(dt);
  }
  remove() { this.removed = true; this.signal(null); G.scene.remove(this.char.root); if (this.weapon) this.weapon.dispose(); if (this.shieldMesh) G.scene.remove(this.shieldMesh); }
  // a takedown begins: hold still and take it
  beginTakedown() { this.signal(null); this.invuln = true; this.vel.set(0, 0, 0); if (this.attacking) { this.attacking = false; G.attackTokens = Math.max(0, (G.attackTokens || 0) - 1); } }
  sweepDown() { this.char.play('knockdown', { restart: true, fade: 0.05, dur: 1.2 }); this.vel.set(0, 2.5, 0); }
}

export const TELL_LEAD = 0.35;
const _w2 = new THREE.Vector3(), _n2 = new THREE.Vector3(), _x2 = new THREE.Vector3(), _m2 = new THREE.Matrix4(), _q3 = new THREE.Quaternion();
// ------------------------------------------------------------------ soldier
const NO_SHIELD_MESH = false;
const SPEARS = !/[?&]nospear/.test(location.search);   // v5: ?nospear for the side-by-side   // true once the shield-bearer GLB carries its own shield
export class Soldier extends Enemy {
  constructor(pos, o = {}) {
    super('soldier', pos, o);
    this.role = o.role || (o.ranged ? 'slinger' : 'grunt');
    this.ranged = this.role === 'slinger';
    const R = ROLE[this.role];
    this.hp = this.maxHp = R.hp; this.stunMax = R.stunMax; this.poise = R.poise;
    if (R.scale) { this.char.body.scale.setScalar(R.scale); this.height *= R.scale; this.radius *= 1.1; this.heavyBody = true; }
    this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.phase = Math.random();
    this.char.play('idle', { fade: 0 });
    this.home = pos.clone();
    // v4 (note 23): the shield-bearer is one model (shield-soldier-crimson.glb), so no separate shield mesh;
    // the shield's blocking logic stays
    // Stopgap: the delivered GLB has no shield in its mesh (checked 14:12, shots/v4-shield-model-*.png), so the
    // forearm-tracked shield stays until a model with the shield arrives. Set NO_SHIELD_MESH when it does.
    if (this.role === 'shield') { this.shieldUp = true; this.shieldDownT = 0; if (!NO_SHIELD_MESH) this.makeShield(); }
    if (this.role === 'sergeant') this.makeSash();
    // v5 (planner 16:05, note 30): grunts and the Sergeant carry the spear. It stands upright in the right hand
    // (a palm socket) and comes into both hands only on the spear-attack clip (assets clips/attack.glb).
    if (SPEARS && (this.role === 'grunt' || this.role === 'sergeant')) {
      this.weapon = new Staff(this.char, G.scene, { len: 2.0, kind: 'spear', mode: 'upright' });
      this.weapon.uprightHand = 'R'; this.weapon.uprightHold = 0.42;
      if (Props.spear) this.weapon.setModel(Props.spear);
    }
    this.dazed = false; this.dazeT = 0; this.lowDazed = false; this.fanCd = 0;
  }
  // v4 (note 22): health, not stance. No stun meter: after 4 s without a hit he heals 5%/s, and under 20%
  // he is open to the R3 finisher (player.js reads e.stunned). Dropping under 20% dazes him for 1.6 s.
  get stunned() { return !this.dead && this.maxHp > 0 && this.hp < this.maxHp * 0.2; }
  set stunned(v) {}
  addStun() {
    if (this.dead) return;
    this.sinceHit = 0;
    if (!this.lowDazed && this.stunned && !this.takenDown) { this.lowDazed = true; this.daze(1.6); }
  }
  daze(t) {
    this.dazed = true; this.dazeT = t; this.signal(null); this.releaseToken();
    this.setState('dazed'); this.char.play('dazed', { fade: 0.2 });
    Audio.play('dazed', { at: this.pos }); FX.hit(this.pos.clone().setY(this.pos.y + this.height), null, 0.7);
    G.hud && G.hud.takedownReady(this);
  }
  tickStun(dt) {
    this.sinceHit += dt;
    if (this.dazed) { this.dazeT -= dt; if (this.dazeT <= 0 && !this.takenDown) { this.dazed = false; if (!this.dead && this.state === 'dazed') { this.setState('engage'); this.char.play('idle', { fade: 0.3 }); } } }
    if (!this.dead && !this.takenDown && this.sinceHit > 4 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.05 * dt);
      if (this.hp >= this.maxHp * 0.2) this.lowDazed = false;
    }
    if (this.sig) this.sigT += dt;
  }
  // v6 (item 3): the shield-bearer's alert turn. When Joon gets well round his side he turns to face him on the
  // sword-and-shield alert-turn clips instead of spinning on the spot. The clip's own hip turn is measured every
  // frame, taken back out of the hips and carried on the root (scaled to the angle he needs), so the turn ends
  // facing Joon with no pop into the next clip.
  startTurn(yawTo) {
    const d = wrap(yawTo - this.yaw), left = d > 0, c = this.char;
    this.turnD = d; this.turnYaw0 = this.yaw; this.turnHip0 = null;
    this.turnDur = left ? 0.62 : 0.7;
    c.play(left ? 'alertL' : 'alertR', { seg: left ? [0.0, 0.8] : [0.2, 1.1], speed: (left ? 0.8 : 0.9) / this.turnDur, restart: true, fade: 0.12 });
    this.setState('turn');
    Audio.play('soldierStep', { at: this.pos, vol: 0.6 }); Audio.play('shieldBlock', { at: this.pos, vol: 0.18, rate: 1.4 });
  }
  turnRoot() {
    const c = this.char, hy = c.hipYaw();
    if (this.turnHip0 === null) this.turnHip0 = hy;
    const delta = wrap(hy - this.turnHip0), CLIP = Math.PI / 2;
    const k = Math.min(1, Math.abs(delta) / CLIP);
    c.unspin(delta);
    this.yaw = wrap(this.turnYaw0 + this.turnD * Math.max(k, Math.min(1, this.t / this.turnDur) ** 2));
    c.root.rotation.y = this.yaw;
  }
  // a round shield on the left forearm: crimson lacquer, gold rim and boss (v4: the crimson army)
  makeShield() {
    if (Props['soldier-shield']) { const g = new THREE.Group(); g.add(fitFlat(Props['soldier-shield'].clone(true), 0.82)); G.scene.add(g); this.shieldMesh = g; this.shieldUp = true; this.shieldDownT = 0; return; }
    const g = new THREE.Group();
    part(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 20), toon(0x8f2230), { parent: g, rot: [Math.PI / 2, 0, 0] });
    part(new THREE.TorusGeometry(0.4, 0.035, 6, 24), toon(0xc9a24a), { parent: g });
    part(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xc9a24a), { parent: g, rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.03] });
    G.scene.add(g); this.shieldMesh = g; this.shieldUp = true; this.shieldDownT = 0;
  }
  makeSash() {
    // the Sergeant: a tall gold plume (v4: the crimson army's elite), inked, so he reads at a glance
    const h = this.char.bone('Head'); if (!h) return;
    const g = new THREE.ConeGeometry(0.09, 0.5, 6); g.translate(0, 0.25, 0); g.scale(0.55, 1, 1.6);
    this.crest = part(g, toon(0xd9a43a), { parent: G.scene }); addOutline(this.crest, 1.2);
    this.crest.rotation.order = 'YXZ';
  }
  blocks(from, m) {
    if (this.role !== 'shield' || !this.shieldUp || this.dazed || this.dead) return false;
    if (m.heavy || m.ender) return false;
    _s.copy(from).sub(this.pos).setY(0).normalize();
    return Math.sin(this.yaw) * _s.x + Math.cos(this.yaw) * _s.z > 0.35;
  }
  onBlock(m, p) {
    this.sinceHit = 0; FX.parry(this.pos.clone().setY(this.pos.y + 1.1).addScaledVector(_s, 0.45), 'block');
    G.hud && G.hud.hintOnce('shield', 'The shield turns light strikes: use a heavy, a parry or a gust to open him.', ['R2', 'L1', 'L1+□']);
  }
  guardBreak() {
    if (this.role !== 'shield' || !this.shieldUp) return;
    this.shieldUp = false; this.shieldDownT = 3.2; Audio.play('shieldBlock', { at: this.pos, rate: 0.8 });
    if (!this.dazed) { this.setState('stagger'); this.char.play('hurt', { restart: true, fade: 0.05, dur: 0.6 }); }
  }
  onParried(p) {
    this.sinceHit = 0; this.guardBreak();
    if (this.attacking) { this.attacking = false; G.attackTokens = Math.max(0, (G.attackTokens || 0) - 1); }
    this.signal(null);
    if (!this.dazed) { this.setState('reel'); this.char.play('hurt', { restart: true, fade: 0.04, dur: 0.7 }); this.vel.addScaledVector(_s.copy(this.pos).sub(p.pos).setY(0).normalize(), 3); }
  }
  react(o) {
    if (this.falling || this.dazed || this.takenDown) return;
    if (o.heavy || o.ender) this.guardBreak();
    // poise: grunts and slingers flinch from anything; shield-bearers and the Sergeant only from heavies
    const flinch = !this.poise || o.heavy || o.ender || o.launch || o.up > 4;
    if (!flinch) { this.char.flash(0.05); return; }
    this.signal(null);
    if (this.attacking) { this.attacking = false; G.attackTokens = Math.max(0, (G.attackTokens || 0) - 1); }
    if (o.el === 'air' && o.knock && Math.hypot(o.knock.x, o.knock.z) > 6 && this.char.hasClip('blown')) { this.setState('down'); this.char.play('blown', { restart: true, fade: 0.05, dur: 1.2 }); }
    else if (o.up > 5 || o.knockdown || o.ender) { this.setState('down'); this.char.play(o.up > 5 ? 'hurt' : 'knockdown', { restart: true, fade: 0.06, dur: o.up > 5 ? 0.6 : 1.4 }); }
    else { this.setState('stagger'); this.char.play('hurt', { restart: true, fade: 0.04, dur: 0.4 }); this.yaw = Math.atan2(o.from ? o.from.x - this.pos.x : 0, o.from ? o.from.z - this.pos.z : 1); }
    if (!this.awake) this.wake();
    Audio.play('soldierHurt', { at: this.pos, vol: 0.4 });
  }
  onDeath(o) {
    if (this.attacking) { this.attacking = false; G.attackTokens = Math.max(0, (G.attackTokens || 0) - 1); }
    this.signal(null); this.dazed = false;
    if (this.heldF) this.heldF.dead = true;
    if (!o.cliff && !o.takedown) { this.char.play('dead', { fade: 0.08 }); Audio.play('bodyFall', { at: this.pos, vol: 0.5, delay: 0.35 }); }
    if (this.shieldMesh) { const s = this.shieldMesh; setTimeout(() => G.scene.remove(s), 1500); }
  }
  wake() { if (this.awake) return; this.awake = true; Audio.play('soldierAlert', { at: this.pos, vol: 0.6 }); }
  update(dt) {
    if (this.removed) return;
    const want = _w.set(0, 0, 0);
    // v4 guard: never let a NaN position reach the effects, audio pan or the renderer
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z)) { this.pos.copy(this.home); this.vel.set(0, 0, 0); }
    if (!Number.isFinite(this.vel.x + this.vel.y + this.vel.z)) this.vel.set(0, 0, 0);
    if (!Number.isFinite(this.yaw)) this.yaw = 0;
    this.tickStun(dt);
    if (this.shieldDownT > 0) { this.shieldDownT -= dt; if (this.shieldDownT <= 0 && !this.dead) this.shieldUp = true; }
    if (!this.dead && !this.falling && !this.takenDown && G.player && G.state === 'play' && !G.freezeAI) this.think(dt, want);
    if (!this.falling && !this.removed) this.physics(dt, want);
    this.baseUpdate(dt);
    if (this.turnCd > 0) this.turnCd -= dt;
    if (this.state === 'turn' && !this.removed) this.turnRoot();
    if (this.weapon && !this.removed) { const st = this.char.state; this.weapon.setMode((st === 'spearAtk' || st === 'lSlash') && !this.dead ? 'hands' : 'upright', 0.12); this.weapon.noDynamic = st === 'lSlash'; this.weapon.update(dt); }
    // v5 (note 30): a forearm socket. The shield's plane always contains the forearm (strapped to it, so it
    // turns with every clip), its face pointing out: forward and to his left, made perpendicular to the arm.
    // Its back sits 0.07 m off the forearm's centre line, so there is never a gap or a float.
    if (this.shieldMesh && !this.removed) {
      const fa = this.char.bone('LeftForeArm'), hd = this.char.bone('LeftHand');
      if (fa && hd) {
        fa.getWorldPosition(_s); hd.getWorldPosition(_v);
        const along = _w2.subVectors(_v, _s); const len = along.length() || 1; along.divideScalar(len);
        // strapped along the forearm when the arm is down or across; when the forearm points out at the target
        // (the push) it becomes a centre grip, face forward and the boss over the fist, so it is never edge-on
        const fwdK = Math.max(0, Math.min(1, (along.x * Math.sin(this.yaw) + along.z * Math.cos(this.yaw) - 0.35) / 0.45));
        _s.lerp(_v, 0.45 + 0.5 * fwdK);
        const n = _n2.set(Math.sin(this.yaw) * 0.85 + Math.cos(this.yaw) * 0.5, 0.05, Math.cos(this.yaw) * 0.85 - Math.sin(this.yaw) * 0.5);
        n.addScaledVector(along, -n.dot(along) * (1 - fwdK)); if (n.lengthSq() < 1e-4) n.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); n.normalize();
        if (Math.abs(n.dot(along)) > 0.98) along.set(0, 1, 0);
        along.addScaledVector(n, -along.dot(n)).normalize();
        const x = _x2.crossVectors(along, n).normalize();
        _m2.makeBasis(x, along, n); _q3.setFromRotationMatrix(_m2);
        if (this.shieldMesh.userData.init) this.shieldMesh.quaternion.slerp(_q3, 1 - Math.exp(-40 * dt)); else { this.shieldMesh.quaternion.copy(_q3); this.shieldMesh.userData.init = true; }
        this.shieldMesh.position.copy(_s).addScaledVector(n, 0.07);
        if (this.dead) { this.shieldMesh.position.y = Math.max(this.pos.y + 0.1, this.shieldMesh.position.y); }
      }
    }
    if (this.crest && !this.removed) { const h = this.char.bone('Head'); if (h) { h.getWorldPosition(this.crest.position); this.crest.position.y += 0.2 * (ROLE.sergeant.scale || 1); this.crest.position.x -= Math.sin(this.yaw) * 0.04; this.crest.position.z -= Math.cos(this.yaw) * 0.04; this.crest.rotation.set(-0.25, this.yaw, 0); } }
    if (this.crest && this.removed) G.scene.remove(this.crest);
  }
  // a wind-up tell: a flame rides his fist (or the shield's forearm) for as long as he stays in that wind-up
  tell(st, where, life) {
    heldFlame((out) => {
      if (this.dead || this.removed || this.state !== st) return false;
      const b = where === 'handR' ? null : this.char.bone(where);
      if (b) b.getWorldPosition(out).add(_v.set(Math.sin(this.yaw) * 0.22, 0.05, Math.cos(this.yaw) * 0.22));
      else if (where === 'handR') this.char.socket('handR', out);
      else out.copy(this.pos).add(_v.set(Math.sin(this.yaw) * 0.5, 1.15, Math.cos(this.yaw) * 0.5));
      return true;
    }, { life, size: where === 'handR' ? 0.5 : 0.6 });
    Audio.play('windupFire', { at: this.pos, vol: 0.5 });
  }
  attackHit(range, dmg, sig, o = {}) {
    const d = this.toPlayer, dist = Math.hypot(d.x, d.z);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const inArc = o.arc ? (fx * d.x + fz * d.z) / (dist || 1) > Math.cos(o.arc) : (fx * d.x + fz * d.z) / (dist || 1) > 0.3;
    if (dist < range && inArc && Math.abs(d.y) < 1.3) return hurtPlayer(dmg, this.pos.clone(), { sig, attacker: this, knock: o.knock ?? 6, up: o.up });
    return false;
  }
  releaseToken() { if (this.attacking) { this.attacking = false; G.attackTokens = Math.max(0, (G.attackTokens || 0) - 1); } }
  think(dt, want) {
    const P = G.player, d = this.toPlayer, dist = Math.hypot(d.x, d.z), yawTo = Math.atan2(d.x, d.z);
    if (!this.awake) { if (dist < 14) this.wake(); else { this.char.play('idle'); return; } }
    if (P.dead) { this.char.play('idle'); this.signal(null); return; }
    this.cd -= dt;
    const c = this.char;
    switch (this.state) {
      case 'dazed': want.set(0, 0, 0); return;
      case 'stagger': if (this.t > 0.42) this.setState('engage'); return;
      case 'reel': if (this.t > 1.5) { this.setState('engage'); this.cd = 0.8; } return;
      case 'down': case 'air': if (this.onGround && this.t > 1.3) { if (c.hasClip('getup') && (c.state === 'knockdown' || c.state === 'blown')) { this.setState('getup'); c.play('getup', { seg: [3.0, 5.8], speed: 1.9, fade: 0.2, restart: true }); } else { this.setState('engage'); c.play('idle', { fade: 0.45 }); } this.cd = Math.max(this.cd, 0.6); } return;
      case 'turn': if (this.t >= this.turnDur) { this.yaw = wrap(this.turnYaw0 + this.turnD); this.setState('engage'); c.play('idle', { fade: 0.15 }); this.turnCd = 1.4; } return;
      // v6 (item 3): the spear's second attack, a wide left slash (gold, parryable): clips/left_slash.glb, the
      // wind-up 0.19-0.75 s, the slash 0.75-1.5 s at 2x with the spear across his front at 0.95 s (t 0.10)
      case 'slashWind': {
        this.faceTo(yawTo, dt, 6);
        if (this.t > 0.55) { this.setState('slash'); this.signal(null); c.play('lSlash', { seg: [0.75, 1.5], speed: 2, fade: 0.04, restart: true }); Audio.play('swingHeavy', { at: this.pos, vol: 0.6, rate: 1.15 }); this.hitDone = false; }
        return;
      }
      case 'slash': {
        if (this.t < 0.12) want.set(Math.sin(this.yaw) * 3, 0, Math.cos(this.yaw) * 3);
        if (!this.hitDone && this.t > 0.10) { this.hitDone = true; this.attackHit(2.5, 1, 'gold', { arc: 1.7, knock: 6 }); }
        if (this.t > 0.62) { this.releaseToken(); this.cd = 0.8 + Math.random() * 0.6; this.setState('engage'); c.play('idle', { fade: 0.25 }); }
        return;
      }
      case 'getup': if (this.t > 1.45) { this.setState('engage'); c.play('idle', { fade: 0.3 }); } return;
      // ---- melee: a gold strike (a punch, or the shield bash) ----
      case 'windup': {
        this.faceTo(yawTo, dt, 6);
        if (this.t > (this.role === 'sergeant' ? 0.5 : 0.55)) { this.setState('strike'); this.signal(null); if (this.weapon && c.hasClip('spearAtk')) c.play('spearAtk', { seg: [0.85, 1.8], dur: 0.475, speed: 2.0, fade: 0.04, restart: true }); else c.play('punch2', { restart: true, fade: 0.05, dur: 0.42 }); Audio.play('swing', { at: this.pos, vol: 0.55 }); }
        return;
      }
      case 'strike': {
        if (this.t < 0.16) want.set(Math.sin(this.yaw) * 6, 0, Math.cos(this.yaw) * 6);
        if (!this.hitDone && this.t > 0.15) {
          this.hitDone = true; this.attackHit(1.9, 1, 'gold');
          // v5 (note 33): a firebender's punch throws a short tight jet along the arm
          const fw = _s.set(Math.sin(this.yaw), -0.03, Math.cos(this.yaw)), fist = c.socket('handR', new THREE.Vector3());
          flameTongue(fist.addScaledVector(fw, 0.2), fw.clone(), { len: 1.3, width: 0.26, life: 0.3, licks: 3 });   // v8: flameTongue plays the soft whoosh
        }
        if (this.t > 0.6) {
          this.hitDone = false;
          if (this.role === 'sergeant' && !this.second) { this.second = true; this.setState('windup', 0.25); this.signal('gold'); if (this.weapon && c.hasClip('spearAtk')) c.play('spearAtk', { seg: [0.55, 0.85], dur: 0.25, speed: 1.2, fade: 0.08, restart: true }); else c.play('windupPunch', { fade: 0.08 }); this.goldTell(0.5 - 0.25 + 0.15, ['windup', 'strike']); return; }
          this.second = false; this.releaseToken(); this.cd = 0.75 + Math.random() * 0.6; this.setState('engage');
        }
        return;
      }
      // ---- red: a charging shoulder bash (grunt) or the spinning sweep (Sergeant) ----
      case 'redWind': {
        this.faceTo(yawTo, dt, 5);
        if (this.t > 0.7) { this.setState('red'); this.signal(null); c.play(this.role === 'sergeant' ? 'kick' : 'punch1', { restart: true, fade: 0.05, dur: 0.6 }); Audio.play(this.role === 'sergeant' ? 'fireWhip' : 'swingHeavy', { at: this.pos, vol: this.role === 'sergeant' ? 0.85 : 1 }); this.hitDone = false; }   // the whip sound's 0.28 s attack peaks on the hit
        return;
      }
      case 'red': {
        if (this.role === 'sergeant') {
          // v4 (note 22): the sweep is a fire whip, 3.2 m round him
          if (!this.whipFx && this.t > 0.18) { this.whipFx = true; fireArc(this.pos.clone().setY(this.pos.y + 0.6), this.yaw, { radius: 2.7, arc: 4.6, life: 0.5, width: 0.2, tongues: 5 }); }
          if (!this.hitDone && this.t > 0.28) { this.hitDone = true; this.attackHit(3.2, 2, 'red', { arc: 2.6, knock: 9, up: 3 }); }
        } else {
          if (this.t < 0.32) want.set(Math.sin(this.yaw) * 11, 0, Math.cos(this.yaw) * 11);
          if (!this.hitDone && this.t > 0.1 && dist < 1.5) { this.hitDone = true; this.attackHit(1.6, 2, 'red', { knock: 9, arc: 1.2 }); }
        }
        if (this.t > 0.75) { this.whipFx = false; this.releaseToken(); this.cd = 1.1 + Math.random() * 0.7; this.setState('engage'); }
        return;
      }
      // ---- v4 fire moves (note 22) ----
      // grunt: a gold flame jab, 3 m (parry or guard it). Tell: a flame in his fist for 0.6 s
      case 'jabWind': {
        this.faceTo(yawTo, dt, 6);
        if (this.t > 0.6) {
          this.setState('jab'); this.signal(null); c.play('punch2', { restart: true, fade: 0.05, dur: 0.45 }); this.hitDone = false;
          const fw = _s.set(Math.sin(this.yaw), -0.04, Math.cos(this.yaw));
          const fist = c.socket('handR', new THREE.Vector3()); fist.y = Math.max(fist.y, this.pos.y + 1.0);
          flameTongue(fist.addScaledVector(fw, 0.25), fw.clone(), { len: 2.6, width: 0.42, life: 0.45 });   // v5: leaves the fist along the punch
          Audio.play('fireJab', { at: this.pos, vol: 0.6 });
        }
        return;
      }
      case 'jab': {
        if (!this.hitDone && this.t > 0.08) { this.hitDone = true; this.attackHit(3.0, 1, 'gold', { arc: 0.6, knock: 6 }); }
        if (this.t > 0.7) { this.releaseToken(); this.cd = 0.9 + Math.random() * 0.7; this.setState('engage'); }
        return;
      }
      // shield-bearer: a red fire-shield bash (dodge it) that leaves a burning patch. Tell: the shield catches fire for 0.7 s
      case 'bashWind': {
        this.faceTo(yawTo, dt, 5);
        if (this.t > 0.6 && !this.told) { this.told = true; const at = this.pos.clone().add(_s.set(Math.sin(this.yaw) * 3.3, 0, Math.cos(this.yaw) * 3.3)); const gy = World.ground(at.x, at.z, this.pos.y + 1); at.y = gy > -Infinity ? gy : this.pos.y; fireTell(at, { radius: 1.5, dur: 0.4 }); }   // v8 note 44: the 0.4 s ground tell
        if (this.t > 0.7) { this.told = false; this.setState('bash'); this.signal(null); if (c.hasClip('shieldPush')) c.play('shieldPush', { seg: [0.7, 1.6], dur: 0.75, speed: 0.9 / 0.75, restart: true, fade: 0.05 }); else c.play('punch1', { restart: true, fade: 0.05, dur: 0.6 }); /* v5: a real shield push (arm out ~0.87 s = t 0.14) */ Audio.play('swingHeavy', { at: this.pos }); this.hitDone = false; this.patched = false; }
        return;
      }
      case 'bash': {
        if (this.t < 0.28) want.set(Math.sin(this.yaw) * 8, 0, Math.cos(this.yaw) * 8);
        if (!this.hitDone && this.t > 0.1 && dist < 2) { this.hitDone = true; this.attackHit(1.9, 2, 'red', { knock: 9, arc: 1.0 }); }
        if (!this.patched && this.t > 0.3) {
          this.patched = true;
          const at = this.pos.clone().add(_s.set(Math.sin(this.yaw) * 1.1, 0, Math.cos(this.yaw) * 1.1));
          const gy = World.ground(at.x, at.z, this.pos.y + 1); if (gy > -Infinity) at.y = gy; else at.y = this.pos.y;
          burnPatch(at, { radius: 1.25, life: 3 }); fireRing(at, { radius: 1.7 });
          G.hazards.push({ x: at.x, y: at.y, z: at.z, r: 1.1, t: 3, fx: 999 });   // level.js hurts Joon inside (fx 999: the inked patch is the visual)
          Audio.play('fireImpact', { at, vol: 0.7 }); shake(0.08);
        }
        if (this.t > 0.85) { this.releaseToken(); this.cd = 1.3 + Math.random() * 0.7; this.setState('engage'); }
        return;
      }
      // slinger rushed: a red close-range flame fan (dodge it)
      case 'fanWind': {
        this.faceTo(yawTo, dt, 8);
        if (this.t > 0.55) {
          this.setState('fan'); this.signal(null); c.play('throwFire', { restart: true, fade: 0.05, dur: 0.5 }); this.hitDone = false;
          fireArc(this.pos.clone().setY(this.pos.y + 1.0), this.yaw, { radius: 1.9, arc: 1.9, life: 0.45, width: 0.2, tongues: 3 });
          const fw = _s.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          flameTongue(this.pos.clone().setY(this.pos.y + 1.1).addScaledVector(fw, 0.4), fw.clone(), { len: 2.2, width: 0.5, life: 0.4 });
          Audio.play('fireFlick', { at: this.pos, vol: 0.75 });
        }
        return;
      }
      case 'fan': {
        if (!this.hitDone && this.t > 0.06) { this.hitDone = true; this.attackHit(3.0, 1, 'red', { arc: 0.95, knock: 8 }); }
        if (this.t > 0.6) { this.fanCd = 3.5; this.cd = Math.max(this.cd, 1.2); this.setState('engage'); }
        return;
      }
      // ---- slinger: a lobbed fire pot ----
      case 'throwWind': {
        this.faceTo(yawTo, dt, 7);
        if (this.t > 0.65) {
          this.setState('throw'); this.signal(null); c.play('throwFire', { restart: true, fade: 0.05, dur: 0.5 });
          const from = c.socket('handR', new THREE.Vector3());
          inkedPot(from, P.pos.clone().addScaledVector(P.vel.clone().setY(0), 0.3), this);
        }
        return;
      }
      case 'boltWind': {
        this.faceTo(yawTo, dt, 7);
        if (this.t > 0.6) {
          this.setState('throw'); this.signal(null); c.play('throwFire', { restart: true, fade: 0.05, dur: 0.5 });
          const from = c.socket('handR', new THREE.Vector3());
          enemyBolt(from, P.pos.clone().setY(P.pos.y + 1.0).addScaledVector(P.vel.clone().setY(0), 0.2 * Math.min(1, dist / 17)), { speed: 17, attacker: this });
        }
        return;
      }
      case 'throw': if (this.t > 0.5) { this.cd = this.ranged ? 1.8 + Math.random() * 1.0 : 2.6 + Math.random() * 1.4; this.setState('engage'); } return;
    }
    // engage: move to range and pick attacks
    if (this.role === 'shield' && !this.attacking && !(this.turnCd > 0) && c.hasClip('alertL') && c.hasClip('alertR') && Math.abs(wrap(yawTo - this.yaw)) > 1.1 && dist < 9) { this.startTurn(yawTo); return; }
    this.faceTo(yawTo, dt, 7);
    const fwd = _v.set(d.x / (dist || 1), 0, d.z / (dist || 1)), side = _s.set(fwd.z, 0, -fwd.x).multiplyScalar(this.strafeDir);
    if (this.ranged) {
      // the slinger keeps to his ledge
      const back = _w.copy(this.home).sub(this.pos).setY(0);
      if (back.length() > 1.5) want.copy(back.normalize().multiplyScalar(2.5));
      this.fanCd -= dt;
      if (this.fanCd <= 0 && dist < 3.4 && Math.abs(d.y) < 1.2) { this.setState('fanWind'); c.play('windupThrow', { fade: 0.1 }); this.signal('red'); this.tell('fanWind', 'handR', 0.55); return; }
      if (this.cd <= 0 && dist < 26) { this.setState('throwWind'); c.play('windupThrow', { fade: 0.12 }); this.signal('red'); return; }
    } else {
      const tokens = G.attackTokens || 0;
      if (dist > 2.0 && (tokens < 2 || this.attacking)) want.addScaledVector(fwd, dist > 5 ? 4.2 : 3);
      else if (dist > 4.5) want.addScaledVector(fwd, 2.6);
      else if (dist < 3.5 && !this.attacking) want.addScaledVector(fwd, -1.5);
      want.addScaledVector(side, dist < 6 ? 1.6 : 0.6);
      // v5 (note 36): flank. While someone else is attacking, a waiting soldier circles to Joon's side or back
      // (each one keeps its own side), so the second attack comes from where he is not looking.
      if (!this.attacking && tokens >= 1 && dist < 7) {
        const P = G.player, fy = P.yaw, bx = -Math.sin(fy), bz = -Math.cos(fy);   // Joon's back
        const sideX = Math.cos(fy) * this.strafeDir, sideZ = -Math.sin(fy) * this.strafeDir;
        const tx = P.pos.x + (bx * 0.6 + sideX) * 2.6 - this.pos.x, tz = P.pos.z + (bz * 0.6 + sideZ) * 2.6 - this.pos.z, tl = Math.hypot(tx, tz);
        if (tl > 0.6) { want.x += tx / tl * 3.4; want.z += tz / tl * 3.4; }
      }
      const fireReach = this.role === 'grunt' || this.role === 'shield' ? 3.2 : 2.4;
      if (this.cd <= 0 && dist < fireReach && tokens < 2 && Math.abs(d.y) < 1.2) {
        // v4 fire moves: grunt flame jab (gold), shield fire bash (red); out past 2.4 m only the fire move reaches
        const fire = (this.role === 'grunt' && (dist > 2.4 || Math.random() < 0.5)) || (this.role === 'shield' && this.shieldUp && (dist > 2.4 || Math.random() < 0.5));   // v5 (note 36): more fire
        if (!fire && dist > 2.4) { /* close in first */ }
        else {
        this.attacking = true; G.attackTokens = tokens + 1;
        if (fire && this.role === 'grunt') { this.setState('jabWind'); c.play('windupPunch', { fade: 0.1 }); this.signal('gold'); this.tell('jabWind', 'handR', 0.6); this.goldTell(0.6 + 0.08, ['jabWind', 'jab']); return; }
        if (fire) { this.setState('bashWind'); c.play('windupPunch', { fade: 0.1 }); this.signal('red'); this.tell('bashWind', 'LeftForeArm', 0.7); return; }
        const red = (this.role === 'sergeant' && Math.random() < 0.5) || (this.role === 'grunt' && Math.random() < 0.2);
        if (red && this.role === 'sergeant') this.tell('redWind', 'handR', 0.7);
        if (red) { this.setState('redWind'); c.play('windupPunch', { fade: 0.1 }); this.signal('red'); }
        else if (this.weapon && c.hasClip('lSlash') && Math.random() < 0.4) { this.setState('slashWind'); c.play('lSlash', { seg: [0.19, 0.75], speed: 0.56 / 0.55, fade: 0.1, restart: true }); this.signal('gold'); this.goldTell(0.55 + 0.10, ['slashWind', 'slash']); }
        else { this.setState('windup'); if (this.weapon && c.hasClip('spearAtk')) c.play('spearAtk', { seg: [0.3, 0.85], dur: this.role === 'sergeant' ? 0.5 : 0.55, speed: 0.55 / (this.role === 'sergeant' ? 0.5 : 0.55), fade: 0.1, restart: true }); else c.play('windupPunch', { fade: 0.1 }); this.signal('gold'); this.goldTell((this.role === 'sergeant' ? 0.5 : 0.55) + 0.15, ['windup', 'strike']); }
        return;
      }
      }
      if (this.role === 'grunt' && this.cd <= 0 && dist > 6 && dist < 15 && Math.random() < dt * 0.6) { this.setState('boltWind'); c.play('windupThrow', { fade: 0.12 }); this.signal('gold'); return; }
    }
    // never walk off the cliff on purpose
    const ahead = World.ground(this.pos.x + want.x * 0.4, this.pos.z + want.z * 0.4, this.pos.y + 0.5);
    if (ahead === -Infinity || ahead < this.pos.y - 1.6) want.set(0, 0, 0);   // v3: may step down the 1.1 m stair ledge
    const sp = Math.hypot(want.x, want.z);
    const backing = this.role === 'shield' && sp > 0.3 && sp < 3.6 && (want.x * Math.sin(this.yaw) + want.z * Math.cos(this.yaw)) < -0.5 * sp && c.hasClip('shieldBack');
    if (backing) { c.play('shieldBack', { fade: 0.2, loop: true }); }   // v5: steps back behind the shield
    else if (sp > 0.3) { this.phase += sp * dt / (sp > 3.6 && c.glb && c.backend.clips.run ? 2.6 : c.hasClip('walk') ? 5.2 : 1.6); c.params.phase = this.phase; c.params.phaseDriven = true; c.play(sp > 3.6 ? 'run' : 'walk', { fade: 0.2 }); if (Math.floor(this.phase * 2) !== this._step) { this._step = Math.floor(this.phase * 2); Audio.play('soldierStep', { at: this.pos, vol: 0.5 }); } }
    else c.play('idle', { fade: 0.2 });
  }
}

// v4 (notes 22/26): the slinger's fire pot as an inked 3D fireball on its arc; lands in a ring of fire and
// leaves an inked burning patch (2.6 s) that hurts Joon if he stands in it. Red: the red landing ring says dodge.
function inkedPot(from, target, attacker) {
  const gy = World.ground(target.x, target.z, target.y + 2);
  const land = new THREE.Vector3(target.x, gy > -Infinity ? gy : target.y, target.z);
  const T = 1.15;
  const v = new THREE.Vector3((land.x - from.x) / T, 0, (land.z - from.z) / T); v.y = (land.y - from.y + 0.5 * 22 * T * T) / T;
  const mark = inkRing(land, { r1: 1.7, hold: true, dur: T + 0.1, color: 0xe2574c, pulse: true });
  fireTell(land, { radius: 1.7, dur: 0.4, delay: T - 0.4 });   // v8 note 44: embers and heat gather where it lands
  Audio.play('windupFire', { at: from, vol: 0.6 });
  const pr = spawnProjectile({ pos: from, vel: v, grav: 22, owner: 'enemy', r: 0.25, life: T + 1, attacker,
    onDone: () => { mark.dead = true; ball.kill(); },
    onHit: (p, h) => {
      mark.dead = true;
      const c = h.point.clone(); const gy = World.ground(c.x, c.z, c.y + 1.5); if (gy > -Infinity) c.y = gy;   // on Joon: drop to his feet
      fireRing(c, { radius: 1.9 }); smokePuff(c.clone().setY(c.y + 0.7), { size: 0.4 });
      Audio.play('fireImpact', { at: c, vol: 0.7 }); shake(0.1);
      const P = G.player; if (P && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 1.8 && Math.abs(P.pos.y - c.y) < 1.2) hurtPlayer(2, c, { knock: 7, up: 3, sig: 'red' });
      burnPatch(c, { radius: 1.2, life: 2.6 });
      G.hazards.push({ x: c.x, y: c.y, z: c.z, r: 1.1, t: 2.6, fx: 999 });
    } });
  const ball = fireball(from, { follow: pr.pos, size: 0.26 });
  return pr;
}

// ------------------------------------------------------------------ the Captain
// 600 hp in three phases (60 / 25 / 15%). Phase 1: a duel. Phase 2: the floor tears up, the camera
// goes wide, leap slams and fire lanes, two soldiers climb in. Phase 3: slower, a three-hit gold string;
// parrying it fills his stun meter and R3 starts the slow-motion takedown that rings the bell.
// He fights with a glaive on the staff clips. Every string is followed by a real opening.
// v4 (note 19): a named moveset, 4-6 moves a phase. Every move has its own wind-up pose and sound, shows
// the gold (parry/guard it) or red (dodge it) signal for its whole wind-up, and is followed by a real
// opening (`open`, seconds he stands recovering). Phase 2 combines moves the duel taught (dash -> slam,
// volley -> pillar line, wheel -> reap). Moves come from a weighted queue that never picks one 3x running.
const _UP = new THREE.Vector3(0, 1, 0);
const CAP = {
  string: { name: 'Brass String', clip: 'sCombo2', wind: [0.0, 0.4], strike: [0.4, 1.7], hits: [0.75, 1.35], sig: 'gold', windT: 0.55, reach: 2.9, dmg: 1, open: 1.0, snd: 'windupFire', swing: 'glaiveSwing' },
  lunge: { name: 'Glaive Lunge', clip: 'sThrust', wind: [0.2, 0.5], strike: [0.5, 1.2], hits: [0.8], sig: 'gold', windT: 0.7, reach: 3.6, dmg: 2, lunge: 9, open: 1.0, snd: 'windupFire', swing: 'captainDash' },
  reap: { name: 'Reaping Arc', clip: 'sSweep', wind: [1.1, 1.6], strike: [1.6, 3.2], hits: [2.25], sig: 'red', windT: 0.9, reach: 3.4, dmg: 2, arc: 2.8, open: 1.1, snd: 'windupHeavy', swing: 'staffWhooshHeavy' },
  wheel: { name: 'Glaive Wheel', kind: 'wheel', clip: 'sSpin', wind: [0.0, 0.5], strike: [0.5, 1.9], hits: [0.85, 1.2, 1.55], sig: 'red', windT: 0.85, reach: 2.7, dmg: 1, arc: 3.2, advance: 5.0, open: 1.2, snd: 'windupHeavy', swing: 'swingHeavy' },
  feint: { name: 'Feint and Grab', kind: 'feint', clip: 'palm', pre: ['sThrust', [0.2, 0.5]], wind: [0.9, 1.4], strike: [1.4, 1.95], hits: [1.55], sig: 'gold', windT: 1.0, swapT: 0.42, reach: 2.6, dmg: 2, arc: 1.0, lunge: 7, open: 1.0, snd: 'windupFire', swing: 'hitHeavy' },
  slam: { name: 'Marked Leap Slam', clip: 'sHeavy', wind: [0.2, 0.9], strike: [0.9, 1.87], hits: [1.58], sig: 'red', windT: 0.7, reach: 2.8, dmg: 2, open: 1.1, snd: 'windupHeavy', swing: 'captainLeap' },
  pillar: { name: 'Rising Flame Line', kind: 'pillar', clip: 'castWall', wind: [0.9, 1.6], strike: [1.6, 2.3], hits: [1.85], sig: 'red', windT: 0.9, dmg: 2, open: 1.0, snd: 'quake', swing: 'stomp' },
  dash: { name: 'Fire Dash', kind: 'dash', clip: 'sThrust', wind: [0.0, 0.45], strike: [0.5, 1.2], hits: [], sig: 'red', windT: 0.8, dmg: 2, open: 1.2, snd: 'windupHeavy', swing: 'captainDash' },
  volley: { name: 'Triple Volley', kind: 'volley', sig: 'gold', open: 1.0 },
};
// [entry, weight, condition on distance]; 'a>b' chains b straight after a (no opening in between)
// v5 (note 36): three real phases. Phase 1 (100-65%): the triple fireball volley plus two moves, the string and
// the lunge. Phase 2 (65-30%): adds the reaping arc, the wheel, the feint, the leap slam, the flame line and the
// fire dash, chained, and he is 12% faster. Phase 3 (30-0%), desperate: everything, chained, 20% faster, a
// five-bolt volley, and the three-hit gold string whose parries fill his stun meter for the finish.
const QUEUE = {
  1: [['volley', 3, (d) => d >= 3.5], ['string', 4, (d) => d < 4], ['lunge', 3, (d) => d >= 2 && d < 8], ['string>lunge', 1.5, (d) => d < 4], ['volley', 1, (d) => d < 3.5]],
  2: [['reap', 2, (d) => d < 4], ['wheel', 2, (d) => d < 6.5], ['feint', 2, (d) => d < 5], ['slam', 2.5], ['pillar', 2.5], ['dash', 2, (d) => d > 3.5], ['volley', 2, (d) => d > 3], ['string', 2, (d) => d < 4], ['lunge', 1.5, (d) => d >= 2], ['dash>slam', 2, (d) => d > 3.5], ['volley>pillar', 2, (d) => d > 3], ['wheel>reap', 1.5, (d) => d < 6]],
  3: [['string', 4, (d) => d < 4.5], ['lunge>string', 2, (d) => d >= 2], ['wheel>reap', 1.5, (d) => d < 6], ['dash>slam', 1.5, (d) => d > 3.5], ['volley>pillar', 1.5, (d) => d > 3], ['feint', 1, (d) => d < 5], ['reap', 1, (d) => d < 4], ['slam', 1]],
};
const PHASE_SLOW = { 1: 1, 2: 0.88, 3: 0.8 };   // wind-ups x slow, strike clips / slow
const PHASE_AT = { 2: 0.65, 3: 0.30 };
const arenaClamp = (v, r = 12) => { const B = World.spots.bell; const off = v.clone().sub(B).setY(0); if (off.length() > r) off.setLength(r); return v.set(B.x + off.x, v.y, B.z + off.z); };
export class Captain extends Enemy {
  constructor(pos, o = {}) {
    super('captain', pos, o);
    this.boss = true; this.heavyBody = true; this.hp = this.maxHp = 600;   // v3: 600 -> 450; v4: back to 600, his named moves give real openings to punish
    this.phaseN = o.phase || 1; this.stunMax = 300; this.minHp = 1;
    if (this.phaseN >= 2) this.hp = this.maxHp * PHASE_AT[2];
    this.char.play('idle', { fade: 0 }); this.setState(this.phaseN >= 2 ? 'engage' : 'intro'); this.combo = 0;
    this.weapon = new Staff(this.char, G.scene, { len: 2.1, kind: 'glaive', mode: 'hands' });
    this.weapon.noIK = false;
    if (Props && Props['captain-glaive']) this.weapon.setModel(Props['captain-glaive']);
    this.recent = []; this.chain = null; this.pillars = []; this.marks = [];
  }
  get phase2() { return this.phaseN >= 2; }
  addStun(v) { super.addStun(this.phaseN === 3 ? v * 0.5 : v); }
  clearMarks() { for (const m of this.marks) m.dead = true; this.marks = []; if (this.slamMark) { this.slamMark.dead = true; this.slamMark = null; } }
  onParried(p) {
    this.signal(null); this.chain = null; this.clearMarks();
    super.addStun(this.phaseN === 3 ? 110 : 45);
    if (!this.stunned) { this.setState('recover'); this.recoverT = 2.0; this.char.play('hurt', { restart: true, fade: 0.05, dur: 0.8 }); this.weapon.trailOff(); }
  }
  react(o) {
    const k = this.hp / this.maxHp;
    // v5 (note 36): from phase 2 he will not stand and be juggled: three hits inside 1.6 s outside his
    // openings and he flares, a red fire ring round him that throws Joon off (dodge out of it)
    if (this.phaseN >= 2 && !this.stunned && !['recover', 'dazed', 'phase', 'flare'].includes(this.state)) {
      const now = G.realTime; this.hitTimes = (this.hitTimes || []).filter((t) => now - t < 1.6); this.hitTimes.push(now);
      if (this.hitTimes.length >= 3) { this.hitTimes = []; this.startFlare(); }
    }
    if (this.phaseN === 3 && this.hp <= 1 && !this.stunned && this.state !== 'phase') { this.clearMarks(); this.becomeStunned(); this.stunT = 9; if (this.char.hasClip('kneel')) this.char.play('kneel', { seg: [0, 0.9], speed: 1, fade: 0.15, restart: true }); G.hud && G.hud.hint('He is spent. [R3]', 4); return; }
    if (this.phaseN === 1 && k <= PHASE_AT[2]) { this.startPhase(2); return; }
    if (this.phaseN === 2 && k <= PHASE_AT[3]) { this.startPhase(3); return; }
  }
  startPhase(n) {
    this.phaseN = n; this.invuln = true; this.signal(null); this.stun = 0; this.stunned = false; this.chain = null; this.clearMarks(); this.recent = [];
    this.setState('phase'); this.weapon.trailOff();
    if (this.char.hasClip('kneel')) this.char.play('kneel', { seg: [0, 2.5], speed: 1.05, fade: 0.12, restart: true }); else this.char.play('roar', { restart: true, fade: 0.1, dur: 2.0 });
    Audio.play(n === 3 ? 'captainRoarP3' : 'captainRoarP2', { vol: 1 });   // v6: a roar take per phase (ElevenLabs, earshot)
    // v5 (note 36): the phase beat: a roar, a fire shock ring, a slow-motion beat and (v6) an authored camera move
    Audio.play('phase', { vol: 0.8, delay: 0.15 });
    inkRing(this.pos.clone(), { r0: 0.6, r1: n === 3 ? 7 : 5.5, dur: 0.55, color: 0xffb070 }); fireTell(this.pos.clone(), { radius: n === 3 ? 4.2 : 3.2, dur: 0.4 }); fireRing(this.pos.clone(), { radius: n === 3 ? 4.2 : 3.2, delay: 0.4 });
    shake(0.45); rumble(0.9, 0.9, 300); slowmo(0.35, 0.6); impact('gold', 2);
    if (Cam.beat && !G.noBeatCam) Cam.beat(this, 1.2); else if (Cam.kick) Cam.kick(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 0.25);
    if (n === 2) { Audio.play('quake', { vol: 0.8, delay: 0.5 }); G.onCaptainPhase2 && G.onCaptainPhase2(this); }
    if (n === 3) { G.onCaptainPhase3 && G.onCaptainPhase3(this); }
    Cam.bossPhase = n;
  }
  startFlare() {
    this.chain = null; this.clearMarks(); this.weapon.trailOff(); this.signal('red'); this.setState('flare');
    this.char.play('roar', { restart: true, fade: 0.06, dur: 0.7 });
    Audio.play('windupFire', { at: this.pos, rate: 1.3, vol: 0.8 });
    fireTell(this.pos.clone(), { radius: 3.2, dur: 0.38 });   // v8 note 44: the ring erupts at t 0.38
    for (const h of ['handR', 'handL']) heldFlame((out) => this.state === 'flare' && !this.dead ? this.char.socket(h, out) : false, { life: 0.35, size: 0.6 });
  }
  remove() { this.clearMarks(); this.pillars = []; super.remove(); }
  onDeath() { this.signal(null); this.clearMarks(); this.weapon.trailOff(); G.onCaptainDefeated && G.onCaptainDefeated(this); }
  // a takedown on the stunned Captain: a heavy blow, not the end (until phase 3)
  takedownHit(p, dir) {
    this.takenDown = false; this.invuln = false; this.stunned = false; this.stun = 0;
    if (this.phaseN === 3) { G.onCaptainFinish && G.onCaptainFinish(this, p); return; }
    hitEnemy(this, { dmg: this.maxHp * 0.12, heavy: true, ender: true, from: p.pos, knock: dir.clone().multiplyScalar(4) });
    if (this.state === 'phase') return;   // the blow started the next phase: let it play
    this.setState('recover'); this.recoverT = 1.6; this.char.play('knockdown', { restart: true, fade: 0.05, dur: 1.6 });
  }
  sweepDown() { this.char.play('hurt', { restart: true, fade: 0.05, dur: 0.6 }); }
  update(dt) {
    if (this.removed) return;
    const want = _w.set(0, 0, 0);
    this.tickStun(dt);
    this.tickPillars(dt);
    if (!this.dead && !this.takenDown && G.player && G.state === 'play' && !G.freezeAI) this.think(dt, want);
    if (!this.dead) this.physics(dt, want);
    if (this.dead) { if (this.fly) this.fly(dt); this.t += dt; this.char.root.position.copy(this.pos); this.char.update(dt); this.weapon.update(dt); return; }
    if (this.state !== 'wind' && this.state !== 'strike' && this.state !== 'volleyWind' && this.marks.length) this.clearMarks();
    this.baseUpdate(dt);
    this.gripWeapon();
    this.weapon.update(dt);
  }
  // v5 (note 30): the glaive is in both hands only on the staff clips (sCombo2, sThrust, sSweep, sSpin, sHeavy);
  // for everything else (the fire volley, the palm grab, the flame line, idle, walking, hurt) he grips it upright
  // in his LEFT hand while the right palm throws the fire. It is never left hanging with no hand on it.
  gripWeapon() {
    const st = this.char.state || '';
    const staffClip = /^s[A-Z]/.test(st);
    this.weapon.uprightHand = 'L'; this.weapon.uprightHold = 0.45;
    this.weapon.setMode(staffClip ? 'hands' : 'upright', 0.14);
  }
  // ---- the queue
  pickMove(dist) {
    const list = QUEUE[this.phaseN] || QUEUE[1], r2 = this.recent.slice(-2);
    const banned = r2.length === 2 && r2[0] === r2[1] ? r2[0] : null;
    let opts = list.filter((e) => (!e[2] || e[2](dist)) && e[0].split('>')[0] !== banned);
    if (!opts.length) opts = list.filter((e) => e[0].split('>')[0] !== banned);
    let tot = 0; for (const e of opts) tot += e[1];
    let r = Math.random() * tot; for (const e of opts) { r -= e[1]; if (r <= 0) return e[0]; }
    return opts[opts.length - 1][0];
  }
  begin(entry) {
    const [a, b] = entry.split('>');
    this.chain = b || null; this.recent.push(a); if (this.recent.length > 4) this.recent.shift();
    this.startAttack(a);
  }
  startAttack(name) {
    const A0 = CAP[name], c = this.char, P = G.player;
    const A = this.atk = { ...A0 }; this.atkName = name; this.hitI = 0; this.moveName = A.name;
    const slow = PHASE_SLOW[this.phaseN] || 1;
    this.clearMarks();
    if (A.kind === 'volley') {
      this.setState('volleyWind'); c.play('windupThrow', { fade: 0.12, restart: true }); this.signal('gold');
      Audio.play('windupFire', { at: this.pos, rate: 1.1, vol: 0.8 });
      heldFlame((out) => this.state === 'volleyWind' && !this.dead ? c.socket('handR', out) : false, { life: 0.8, size: 0.55 }); return;
    }
    this.windT = A.windT * slow;
    this.setState('wind');
    const pre = A.pre;
    if (pre && c.hasClip(pre[0])) c.play(pre[0], { seg: pre[1], dur: A.swapT, speed: (pre[1][1] - pre[1][0]) / A.swapT, fade: 0.12, restart: true });
    else if (c.hasClip(A.clip)) c.play(A.clip, { seg: A.wind, dur: this.windT, speed: (A.wind[1] - A.wind[0]) / this.windT, fade: 0.12, restart: true });
    else c.play('windupSlash', { fade: 0.12 });
    this.signal(A.sig);
    if (A.sig === 'gold' && A.kind !== 'feint') for (const h of A.hits) this.goldTell(this.windT + (h - A.strike[0]) * slow / 1.15, ['wind', 'strike']);
    Audio.play(A.snd || (A.sig === 'red' ? 'windupHeavy' : 'windupFire'), { at: this.pos, rate: 0.85, vol: 0.7 });
    if (name === 'slam') this.slamMark = inkRing(P.pos.clone(), { r1: 2.6, hold: true, dur: 1.6, color: 0xe2574c, pulse: true });
    if (A.kind === 'pillar' || A.kind === 'dash') for (const h of ['handR', 'handL']) heldFlame((out) => this.state === 'wind' && this.atk === A && !this.dead ? c.socket(h, out) : false, { life: this.windT, size: 0.5 });
    if (A.kind === 'pillar') {   // the line is aimed now and inked red along the floor: step off it
      const d = P.pos.clone().sub(this.pos).setY(0); if (d.lengthSq() < 0.01) d.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); d.normalize();
      this.aim = d; this.line = [];
      for (let k = 1.6; k <= 15; k += 1.45) { const p = arenaClamp(this.pos.clone().addScaledVector(d, k), 12.5); if (this.line.length && p.distanceTo(this.line[this.line.length - 1]) < 0.5) break; this.line.push(p); this.marks.push(inkRing(p, { r1: 0.95, hold: true, dur: 3, color: 0xe2574c, pulse: true })); }
    }
    if (A.kind === 'dash') {   // a straight run through where Joon stands, 4 m past him; the lane is inked red
      const to = arenaClamp(P.pos.clone().add(P.pos.clone().sub(this.pos).setY(0).setLength(4)), 12);
      this.dashFrom = this.pos.clone(); this.dashTo = to; this.aim = to.clone().sub(this.pos).setY(0).normalize();
      const len = this.dashFrom.distanceTo(to);
      for (let k = 1.2; k < len; k += 1.3) this.marks.push(inkRing(this.pos.clone().addScaledVector(this.aim, k), { r1: 0.7, hold: true, dur: 2, color: 0xe2574c, pulse: true }));
    }
  }
  // flame pillars erupt one after another along the inked line
  tickPillars(dt) {
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const q = this.pillars[i]; q.t -= dt; if (q.t > 0) continue;
      this.pillars.splice(i, 1);
      if (q.mark) q.mark.dead = true;
      firePillar(q.p, { height: 2.7, life: 0.65, sound: q.i % 2 === 0 }); if (q.i % 2 === 0) fireRing(q.p, { radius: 0.9, life: 0.55 });   // v8: the generated pillar column + a cel-fire core
      if (q.i % 2 === 0) Audio.play('fireImpact', { at: q.p, vol: 0.55 });
      const P = G.player; if (P && !this.dead && Math.hypot(P.pos.x - q.p.x, P.pos.z - q.p.z) < 1.05 && P.pos.y - q.p.y < 2) hurtPlayer(this.atk ? this.atk.dmg || 2 : 2, q.p.clone(), { sig: 'red', attacker: this, knock: 7, up: 6 });
    }
  }
  finishMove() {
    const c = this.char, slow = PHASE_SLOW[this.phaseN] || 1;
    this.weapon.trailOff(); this.clearMarks();
    // phase 3: the three-hit gold string
    this.combo++;
    if (this.phaseN === 3 && this.atkName === 'string' && this.combo < 3) { this.startAttack('string'); return; }
    this.combo = 0;
    if (this.chain && !G.player.dead) { const n = this.chain; this.chain = null; this.startAttack(n); return; }
    // the punish window: he stands open
    this.setState('recover'); this.recoverT = (this.atk.open || 1.0) * slow; c.play('idle', { fade: 0.3 });
  }
  think(dt, want) {
    const P = G.player, d = this.toPlayer, dist = Math.hypot(d.x, d.z), yawTo = Math.atan2(d.x, d.z), c = this.char;
    if (P.dead) { c.play('idle'); this.signal(null); this.clearMarks(); return; }
    const slow = PHASE_SLOW[this.phaseN] || 1;
    if (this.invuln && this.state !== 'phase') this.invuln = false;
    switch (this.state) {
      case 'intro': this.faceTo(yawTo, dt, 4); if (this.t > 0.1 && !this.roared) { this.roared = true; c.play('roar', { fade: 0.15, dur: 1.6 }); Audio.play('captainRoar', { at: this.pos }); shake(0.2); } if (this.t > 1.8) { this.setState('engage'); this.cd = 0.8; } return;
      case 'phase': this.faceTo(yawTo, dt, 3); if (this.t > 0.6 && !this.tore && this.phaseN === 2) { this.tore = true; G.onCaptainTear && G.onCaptainTear(this); } if (this.t > 2.4) { this.invuln = false; this.setState('engage'); this.cd = 0.8; } return;
      case 'dazed': return;
      case 'recover': if (this.t > (this.recoverT || 1.2)) { this.setState('engage'); this.recoverT = 0; } return;
      case 'flare': {
        if (!this.flared && this.t > 0.38) {
          this.flared = true; this.signal(null);
          fireRing(this.pos.clone(), { radius: 3.2 }); inkRing(this.pos.clone(), { r0: 0.5, r1: 3.4, dur: 0.35, color: 0xffb070 });
          fireArc(this.pos.clone().setY(this.pos.y + 0.7), this.yaw, { radius: 2.4, arc: 6.2, life: 0.45, width: 0.2, tongues: 6 });
          Audio.play('flameRing', { at: this.pos, vol: 0.9 }); Audio.play('fireWhoosh', { at: this.pos, vol: 0.8, rate: 0.85 }); shake(0.3);
          if (dist < 3.3 && Math.abs(d.y) < 1.6) hurtPlayer(1, this.pos.clone(), { sig: 'red', attacker: this, knock: 11, up: 4 });
        }
        if (this.t > 0.9) { this.flared = false; this.setState('engage'); this.cd = 0.3; }
        return;
      }
      case 'wind': {
        const A = this.atk;
        if (A.kind === 'pillar' || A.kind === 'dash') this.faceTo(Math.atan2(this.aim.x, this.aim.z), dt, 8);
        else this.faceTo(yawTo, dt, A.lunge ? 4 : 6);
        if (this.atkName === 'slam' && this.slamMark) { this.slamMark.m.position.x += (P.pos.x - this.slamMark.m.position.x) * Math.min(1, dt * 4); this.slamMark.m.position.z += (P.pos.z - this.slamMark.m.position.z) * Math.min(1, dt * 4); }
        // the feint: a gold thrust that he pulls, and the signal turns red: a grab, dodge it
        if (A.kind === 'feint' && !this.swapped && this.t >= A.swapT) {
          this.swapped = true; A.sig = 'red'; this.signal('red'); Audio.play('captainRoar', { at: this.pos, vol: 0.45, rate: 1.3 });
          const rest = this.windT - this.t; if (c.hasClip(A.clip)) c.play(A.clip, { seg: A.wind, dur: rest, speed: (A.wind[1] - A.wind[0]) / Math.max(0.2, rest), fade: 0.1, restart: true });
        }
        if (this.t >= this.windT) {
          this.setState('strike'); this.signal(null); this.swapped = false;
          if (c.hasClip(A.clip)) c.play(A.clip, { cont: true, seg: A.strike, speed: 1.15 / slow });
          else c.play('slash', { restart: true, fade: 0.05, dur: 0.6 });
          Audio.play(A.swing || 'glaiveSwing', { at: this.pos, vol: 0.9, delay: 0.08 });
          this.weapon.trailOn({ color: A.kind === 'dash' || A.kind === 'pillar' ? 0xff8a3c : 0xffd0a0, width: 0.12 });
          if (this.atkName === 'slam') { // a leap onto the marked spot (clamped inside the arena)
            const to = arenaClamp(this.slamMark ? this.slamMark.m.position.clone() : P.pos.clone(), 11);
            this.leapFrom = this.pos.clone(); this.leapTo = to; this.vel.y = 10; Audio.play('captainLeap', { at: this.pos });
            fireTell(to, { radius: 3.0, dur: 0.4, delay: 0.25 });   // v8 note 44
          }
          if (A.kind === 'dash') { this.dashT = 0; this.dashHit = false; this.trailT = 0; Audio.play('fireJab', { at: this.pos, vol: 0.8 }); }
        }
        return;
      }
      case 'strike': {
        const A = this.atk, clipT = A.strike[0] + this.t * 1.15 / slow;
        if (A.kind === 'dash') {   // a straight run at 22 m/s; a short burning trail behind it
          const left = this.dashTo.clone().sub(this.pos).setY(0), L = left.length();
          this.dashT += dt;
          if (L > 0.6 && this.dashT < 1.0) { want.copy(this.aim).multiplyScalar(22); this.vel.x = want.x; this.vel.z = want.z; }
          this.trailT -= dt; if (this.trailT <= 0) { this.trailT = 0.06; flameTongue(this.pos.clone().setY(this.pos.y + 0.1), _s.copy(this.aim).multiplyScalar(-0.6).setY(1), { len: 1.3, width: 0.34, life: 0.4 }); }
          if (!this.dashHit && dist < 1.3 && Math.abs(d.y) < 1.6) { this.dashHit = true; hurtPlayer(A.dmg, this.pos.clone(), { sig: 'red', attacker: this, knock: 11, up: 4 }); }
          if (L <= 0.6 || this.dashT >= 1.0) {
            const from = this.dashFrom, len = from.distanceTo(this.pos);
            if (len > 2) for (let k = 1; k < len; k += 2.2) burnPatch(from.clone().addScaledVector(this.aim, k), { radius: 0.7, life: 1.2 });
            if (len > 2) G.hazards.push({ x: (from.x + this.pos.x) / 2, y: this.pos.y, z: (from.z + this.pos.z) / 2, lane: true, dir: this.aim.clone(), len, t: 1.2, fx: 0, quiet: true });
            Audio.play('skid', { at: this.pos }); FX.landDust(this.pos, 1.4); this.vel.x *= 0.2; this.vel.z *= 0.2;
            this.finishMove();
          }
          return;
        }
        if (A.lunge && clipT < A.hits[0]) want.set(Math.sin(this.yaw) * A.lunge, 0, Math.cos(this.yaw) * A.lunge);
        if (A.advance && this.hitI < A.hits.length) { this.faceTo(yawTo, dt, 2); if (dist > 1.2) want.set(d.x / dist * A.advance, 0, d.z / dist * A.advance); }
        if (this.atkName === 'slam' && this.leapTo) { const k = Math.min(1, this.t / 0.6); if (k < 1) { this.vel.x = (this.leapTo.x - this.leapFrom.x) / 0.6; this.vel.z = (this.leapTo.z - this.leapFrom.z) / 0.6; } }
        if (this.hitI < A.hits.length && clipT >= A.hits[this.hitI]) {
          this.hitI++;
          if (this.atkName === 'slam') this.slamLand();
          else if (A.kind === 'pillar') {
            shake(0.35); rumble(0.6, 0.6, 160); Audio.play('flameRing', { at: this.pos, vol: 0.7 }); FX.landDust(this.pos, 1.6);
            this.line.forEach((p, i) => { this.pillars.push({ p, i, t: 0.4 + i * 0.075, mark: this.marks[i], last: i === this.line.length - 1 }); fireTell(p, { radius: 0.9, dur: 0.4 + i * 0.075, sound: i === 0 }); });   // v8 note 44: a 0.4 s tell under each pillar
            this.marks = [];
          } else {
            const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), inArc = (fx * d.x + fz * d.z) / (dist || 1) > Math.cos(A.arc || 0.9);
            if (A.kind === 'wheel') Audio.play('swingHeavy', { at: this.pos, vol: 0.8, rate: 0.9 + this.hitI * 0.08 });
            if (dist < A.reach && inArc && Math.abs(d.y) < 1.6) {
              const r = hurtPlayer(A.dmg, this.pos.clone(), { sig: A.sig, attacker: this, knock: A.kind === 'feint' ? 10 : 8, up: A.kind === 'feint' ? 6 : 0 });
              if (r === 'parry') return;
            }
            if (A.kind === 'wheel' || (A.sig === 'red' && A.arc)) fireArc(this.pos.clone().setY(this.pos.y + 0.9), this.yaw + (A.kind === 'wheel' ? this.hitI * 2.1 : 0), { radius: 2.1, arc: 2.6, life: 0.4 });
            if (A.arc) swingArc(this.pos.clone().setY(this.pos.y + (A.kind === 'wheel' ? 1.0 : 0.6)), this.yaw + (A.kind === 'wheel' ? this.hitI * 2.1 : 0), { r: A.kind === 'wheel' ? 2.2 : 2.6, a0: -2.6, a1: 2.6, width: 0.13, dur: 0.24, lit: 0xffe0d0, shade: 0xe0866c });
          }
        }
        if (clipT >= A.strike[1] - 0.02) this.finishMove();
        return;
      }
      case 'volleyWind': this.faceTo(yawTo, dt, 6); if (this.t > 0.75) {
        this.setState('volley'); this.signal(null); c.play('throwFire', { restart: true, fade: 0.05, dur: 0.6 });
        const from = c.socket('handR', new THREE.Vector3()), n = this.phase2 ? 5 : 3, spread = this.phase2 ? 0.2 : 0.16;
        const base = P.pos.clone().setY(P.pos.y + 0.9).sub(from);
        for (let i = 0; i < n; i++) { const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - (n - 1) / 2) * spread); enemyBolt(from, from.clone().add(dir), { speed: this.phase2 ? 18 : 15, big: this.phase2 && i === (n - 1) / 2, attacker: this }); }
      } return;
      case 'volley': if (this.t > 0.7) { if (this.chain && !P.dead) { const n = this.chain; this.chain = null; this.startAttack(n); } else { this.setState('recover'); this.recoverT = 1.0; } } return;
    }
    // engage
    this.faceTo(yawTo, dt, 5);
    this.cd -= dt;
    const fwd = _v.set(d.x / (dist || 1), 0, d.z / (dist || 1));
    const keep = this.phaseN === 2 ? 4.5 : 2.6;
    if (dist > keep + 0.6) want.addScaledVector(fwd, dist > 9 ? 4.0 : 2.4);
    else if (dist < keep - 0.8) want.addScaledVector(fwd, -1.6);
    want.addScaledVector(_s.set(fwd.z, 0, -fwd.x), 1.0);
    const sp = Math.hypot(want.x, want.z);
    if (sp > 0.3) { this.phase = (this.phase || 0) + sp * dt / (sp <= 3.5 && c.hasClip('walk') ? 5.6 : 1.9); c.params.phase = this.phase; c.params.phaseDriven = true; c.play(sp > 3.5 ? 'run' : 'walk', { fade: 0.2 }); if (Math.floor(this.phase * 2) !== this._step) { this._step = Math.floor(this.phase * 2); Audio.play('soldierStep', { at: this.pos, rate: 0.7 }); } }
    else c.play('idle', { fade: 0.2 });
    if (this.cd > 0) return;
    this.cd = this.phaseN === 2 ? 0.7 : 0.6;   // the opening is the recover state; this is the walk between moves
    if (this.phaseN === 3) this.combo = 0;
    this.begin(this.pickMove(dist));
  }
  slamLand() {
    Audio.play('captainLand', { at: this.pos }); Audio.play('flameRing', { at: this.pos, vol: 0.6 });
    shake(0.5); rumble(1, 1, 250); FX.landDust(this.pos, 2.5); FX.rockBurst(this.pos, 1.6);
    inkRing(this.pos, { r0: 0.5, r1: 3.2, dur: 0.4, color: 0xffb070 }); fireRing(this.pos, { radius: 3.0 }); smokePuff(this.pos.clone().setY(this.pos.y + 0.4), { size: 0.6 });
    const P = G.player; if (P && Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < 2.8 && Math.abs(P.pos.y - this.pos.y) < 1.2) hurtPlayer(2, this.pos.clone(), { sig: 'red', attacker: this, knock: 10, up: 4 });
  }
}
