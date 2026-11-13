// Joon: movement, the ringed-staff combat and the air moves he earns.
//
// Staff combat (pad first):
//   R1 light chain. Strikes 1-3 are consecutive segments of one clip (staff-combo-3), so a buffered press
//      simply lets the clip keep playing; strike 4 is the overhead, strike 5 the roundhouse-kick ender.
//      Presses are buffered for 0.25 s and honoured from the cancel window (the last 30% of a strike).
//   R2 heavy overhead. After strike 3 it becomes the reaping sweep; after strike 1 or 2 the rising
//      flying kick (skill). While aiming (L2) it fires the aimed gust shot (once learned).
//   L1 guard (hold); a tap just before a gold attack lands is a parry.  ○ roll, or the wind-step.
//   ✕ jump (v3): the jump clip, coyote time 0.12 s, a 0.15 s jump buffer, release early for a short hop.
//   L1+□ palm gust (8 s cooldown).  ✕ again in the air: the double jump (once shrine 3 is attuned; once per airtime).
//   R3 lock on, or a takedown on a stunned enemy within reach.
// Swings commit: only a dodge may interrupt a strike, and only after its hit frame.
import { ONE_MODEL } from './assets.js';
import * as THREE from 'three';
import { G, hitEnemy, tickParry } from './state.js';
import { Character } from './rig.js';
import { Staff } from './staff.js';
import { Input, rumble } from './input.js';
import { Cam, cameraForward } from './camera.js';
import { World } from './world.js';
import { Audio } from './audio.js';
import { FX, flipQuad, ribbon, shake, hitstop, slowmo } from './fx.js';
import { swingArc, windTube, windRing, impact, windWall } from './fx3d.js';
import { Bend, gustShot } from './bending.js';

const RUN = 6.4, AIMRUN = 3.0, GUARDRUN = 2.2, ACC = 60, AIRACC = 22, GRAV = 26;
const BUFFER = 0.25, JUMP_BUFFER = 0.15, COYOTE = 0.12, JUMPV = 8.6;
// v8 note 47: the double jump (unlock key stays `whirl`, it used to be the Whirlwind Lift): a second, slightly lower jump
const JUMPV2 = 8.1;
// the jump clip (clips/jump.glb, see tests/frames/strip-jump.jpg): push-off 0.50-0.72, tuck at the apex
// 0.72-0.92, opening out 0.92-1.10, the landing crouch and recover 1.10-1.45
const JC = { up: [0.5, 0.92], down: [0.92, 1.1], land: [1.1, 1.45] };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _h = new THREE.Vector3();

// planner hotfix 13:20 (Connor: "I click R1 and immediately the hit and sound land, but the animation takes two to three times longer"):
// light strikes, kicks and the thrust play 1.7x faster, heavies 1.35x; hit frames stay on the clip so they still sync.
// strike table. clip times are source-clip seconds (see tests/frames/strip-* and review-3d-v2 sheets)
// reach in m, arc = half-angle in radians, knock in m/s
// v4 note 21: hit frames moved onto the measured contact (the ring head furthest forward and fastest, tools/probe-contact.mjs):
// l1 0.62->0.70 and l3 2.15->2.20 sat in the reversal between backswing and swing; l4 0.75->0.65 was late; l2 1.42->1.50.
export const MOVES = {
  l1: { clip: 'sCombo3', a: 0.48, b: 1.20, hit: 0.70, speed: 2.29, dmg: 6, reach: 2.3, arc: 1.25, knock: 2.4, smear: { roll: 0.4, flip: false } },
  l2: { clip: 'sCombo3', a: 1.20, b: 1.90, hit: 1.50, speed: 2.29, dmg: 6, reach: 2.3, arc: 1.25, knock: 2.4, smear: { roll: -0.3, flip: true } },
  l3: { clip: 'sCombo3', a: 1.90, b: 2.60, hit: 2.20, speed: 2.29, dmg: 7, reach: 2.4, arc: 1.35, knock: 3.0, smear: { roll: 0.1, flip: false } },
  l4: { clip: 'sCombo2', a: 0.40, b: 1.05, hit: 0.65, speed: 2.21, dmg: 9, reach: 2.4, arc: 0.9, knock: 3.5, smear: { roll: 1.45, flip: false }, heavyish: true },
  kick: { clip: 'kick', a: 0.6, b: 1.9, hit: 1.33, speed: 2.29, dmg: 12, reach: 1.9, arc: 1.2, knock: 5.5, up: 1.5, ender: true, foot: true },
  fly: { clip: 'launcher', a: 0.05, b: 1.0, hit: 0.45, speed: 1.95, dmg: 8, reach: 1.9, arc: 1.0, knock: 2, up: 9.5, ender: true, foot: true, launch: true },
  heavy: { clip: 'sHeavy', a: 0.55, b: 1.87, hit: 1.58, speed: 1.76, dmg: 15, reach: 2.5, arc: 0.8, knock: 5, heavy: true, smear: { roll: 1.57, flip: false, big: true } },
  sweep: { clip: 'sSweep', a: 1.5, b: 3.4, hit: 2.25, speed: 2.03, dmg: 12, reach: 2.7, arc: 2.6, knock: 6, up: 3, heavy: true, ender: true, knockdown: true, smear: { roll: 0, flip: false, big: true, flat: true } },
  // v5 (note 37): the counter after a parry: R1 within 0.8 s is a fast, heavy thrust that staggers
  counter: { clip: 'sThrust', a: 0.5, b: 1.1, hit: 0.8, speed: 2.4, dmg: 20, reach: 2.9, arc: 0.9, knock: 7, heavy: true, ender: true, smear: { roll: 0, flip: false, thrust: true } },
  // v6 (item 2): the five-hit chain on the grip clip (clips/weapon_combo.glb, one-handed). Four consecutive segments of
  // one clip, so the chain flows; each hit sits on its measured contact frame (the ring head furthest forward and
  // fastest, tools/probe-wcombo.mjs: 0.64, 1.33, 2.21, 2.92 s). Durations, damage, reach and cancel rules match l1-l4.
  g1: { clip: 'wCombo', a: 0.45, b: 0.95, hit: 0.64, speed: 1.6, dmg: 6, reach: 2.3, arc: 1.25, knock: 2.4, oneHand: true, smear: { path: true } },
  g2: { clip: 'wCombo', a: 0.95, b: 1.90, hit: 1.33, speed: 3.1, dmg: 6, reach: 2.3, arc: 1.25, knock: 2.4, oneHand: true, smear: { path: true } },
  g3: { clip: 'wCombo', a: 1.90, b: 2.60, hit: 2.21, speed: 2.29, dmg: 7, reach: 2.4, arc: 1.35, knock: 3.0, oneHand: true, smear: { path: true } },
  g4: { clip: 'wCombo', a: 2.60, b: 3.30, hit: 2.92, speed: 2.29, dmg: 9, reach: 2.4, arc: 0.9, knock: 3.5, oneHand: true, smear: { path: true }, heavyish: true },
  thrust: { clip: 'sThrust', a: 0.5, b: 1.1, hit: 0.8, speed: 2.04, dmg: 9, reach: 2.6, arc: 0.6, knock: 5, smear: { roll: 0, flip: false, thrust: true } },
};
// v6: which chain plays (?combo=grip, the default | staff, the v5 chain | mix); see CHANGELOG v6 item 2 for the side-by-side
const COMBO = (typeof location !== 'undefined' && (location.search.match(/[?&]combo=(\w+)/) || [])[1]) || 'grip';
const CHAINS = { staff: ['l1', 'l2', 'l3', 'l4', 'kick'], grip: ['g1', 'g2', 'g3', 'g4', 'kick'], mix: ['g1', 'l2', 'g3', 'l4', 'kick'] };
const CHAIN = CHAINS[COMBO] || CHAINS.staff;

export class Player {
  constructor(scene) {
    this.char = new Character('joon', scene);
    this.staff = new Staff(this.char, scene, { len: 1.8 });
    this.staffFlip0 = this.staff.flip;
    this.wall = windWall();   // v5 (note 30): the guard is a two-palm wind wall
    if (ONE_MODEL) { this.staff.ghost = true; this.staff.group.visible = false; }   // v4 note 18 experiment: the staff is in the mesh
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = Math.PI; this.radius = 0.38; this.height = 1.6;
    this.maxHp = 10; this.hp = 10;           // hearts are 2 hp each (half hearts)
    this.breath = 100; this.maxBreath = 100; this.breathDelay = 0;
    this.element = 'air';
    // the slice starts with the staff and one air move; the rest are earned at shrines
    this.unlocked = { staff: true, gust: true, shot: false, step: false, whirl: false, fire: false };
    this.skills = {}; this.beads = 0;
    this.cd = { gust: 0, plunge: 0 }; this.cdMax = { gust: 8, plunge: 0.35 }; this.dblUsed = false;
    this.onGround = true; this.coyote = 0; this.iframes = 0; this.hurtT = 0;
    this.action = null; this.chainNext = 0; this.chainGrace = 0; this.buffer = null;
    this.lean = 0; this.phase = 0; this.airT = 0; this.fallStartY = 0;
    this.dead = false; this.lastSafe = new THREE.Vector3();
    this.combat = false; this.combatT = 0; this.staffOut = false;
    this.guard = false; this.guardPressT = -9; this.runT = 0;
  }
  spawn(pos, yaw = Math.PI) {
    this.pos.copy(pos); this.vel.set(0, 0, 0); this.yaw = yaw; this.char.root.position.copy(pos); this.char.root.rotation.y = yaw;
    this.action = null; this.dead = false; this.onGround = true; this.guard = false; this.char.play('calm', { fade: 0 });
    this.staffOut = false; this.staff.setMode('back', 0.01); this.combat = false; this.combatT = 0;
    Cam.yaw = yaw + Math.PI; Cam.pivot.set(pos.x, pos.y + 1.45, pos.z);
  }
  get aiming() { return this.wantAim && !this.dead && (!this.action || this.action.aimOK); }
  get parryWindow() { return 0.15; }   // v5 (note 37): +-0.15 s round the hit frame (state.js PARRY_EARLY/LATE)
  setElement() {}

  spend(cost) {
    if (G.god) return true;
    if (this.breath < cost) { Audio.play('noBreath', { vol: 0.6 }); G.hud && G.hud.noBreath(); return false; }
    this.breath -= cost; this.breathDelay = 0.7; return true;
  }
  die() {
    this.dead = true; this.action = null; this.staff.trailOff(); this.char.play('dead', { fade: 0.1 }); Audio.play('gameover');
    G.onPlayerDeath && G.onPlayerDeath();
  }
  heal(n) { const before = this.hp; this.hp = Math.min(this.maxHp, this.hp + n); if (this.hp > before) { Audio.play('heartGain', { vol: 0.7 }); G.hud && G.hud.healed(); } }

  // the enemy the next strike is aimed at: the lock target, else the best one in front
  target(range = 4.5) {
    if (G.lockTarget && !G.lockTarget.dead && G.lockTarget.pos.distanceTo(this.pos) < range + 2) return G.lockTarget;
    let best = null, bd = range * 2;
    const fy = this.stickYaw() ?? this.yaw;
    for (const e of G.enemies) {
      if (e.dead || e.falling || e.takenDown) continue;
      _h.copy(e.pos).sub(this.pos); _h.y = 0; const d = _h.length();
      const f = (Math.sin(fy) * _h.x + Math.cos(fy) * _h.z) / (d || 1);
      const score = d * (1.5 - f * 0.7);
      if (d < range && f > -0.2 && Math.abs(e.pos.y - this.pos.y) < 1.8 && score < bd) { bd = score; best = e; }
    }
    return best;
  }
  stickYaw() {
    if (!(Input.move.x || Input.move.y)) return null;
    const f = _f.set(-Math.sin(Cam.yaw), 0, -Math.cos(Cam.yaw)), r = _r.set(Math.cos(Cam.yaw), 0, -Math.sin(Cam.yaw));
    _h.set(0, 0, 0).addScaledVector(f, Input.move.y).addScaledVector(r, Input.move.x); return Math.atan2(_h.x, _h.z);
  }

  update(dt) {
    const c = this.char;
    const rt = G.realTime;
    this.iframes = Math.max(0, this.iframes - dt); this.hurtT = Math.max(0, this.hurtT - dt);
    this.breathDelay -= dt;
    if (this.breathDelay <= 0) this.breath = Math.min(this.maxBreath, this.breath + dt * 14);
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.chainGrace = Math.max(0, this.chainGrace - dt);
    this.counterT = Math.max(0, (this.counterT || 0) - dt);
    const canAct = G.state === 'play' && !this.dead && !G.lockInput;
    this.wantAim = canAct && Input.down('aim') && this.unlocked.shot;

    // ---- input buffer: the last press is honoured for 0.25 s ----
    if (canAct) {
      for (const a of ['light', 'heavy', 'dodge', 'gust', 'jump']) if (Input.pressed(a)) this.buffer = { a, t: rt };
      if (this.buffer && rt - this.buffer.t > (this.buffer.a === 'jump' ? JUMP_BUFFER : BUFFER)) this.buffer = null;
      if (Input.pressed('guard')) this.guardPressT = rt;
      tickParry(Input.pressed('guard'));   // v5 (note 37): a press just after a gold hit still parries
      if (Input.pressed('lock')) this.lockOrTakedown();
    } else { this.buffer = null; tickParry(false); }

    // ---- combat awareness: the staff comes off the back when a fight starts ----
    const threat = G.enemies.some((e) => !e.dead && !e.falling && e.awake && e.pos.distanceTo(this.pos) < 16);
    if (threat) { this.combatT = 4; if (!this.combat) { this.combat = true; if (!this.staffOut && canAct && !this.action) this.startDraw(); } }
    else { this.combatT = Math.min(this.combatT, 0.8) - dt; if (this.combat && this.combatT <= 0) this.combat = false; }
    if (!this.combat && this.staffOut && !this.action && this.combatT < -1.5 && !this.guard && !G.keepStaff) this.sheathe();

    // ---- input -> desired velocity (camera relative) ----
    let mx = canAct ? Input.move.x : 0, my = canAct ? Input.move.y : 0;
    if (this.hurtT > 0) { mx = my = 0; }
    const fwd = _f.set(-Math.sin(Cam.yaw), 0, -Math.cos(Cam.yaw)), right = _r.set(Math.cos(Cam.yaw), 0, -Math.sin(Cam.yaw));
    const want = _v.set(0, 0, 0).addScaledVector(fwd, my).addScaledVector(right, mx);
    let act = this.action;
    this.guard = canAct && Input.down('guard') && !Input.down('gust') && (!act || act.kind === 'guardJolt') && this.hurtT <= 0 && this.onGround;
    if (this.guard) this.drawNow();
    let maxSp = this.aiming ? AIMRUN : this.guard ? GUARDRUN : RUN;
    if (act) maxSp *= act.move ?? 0;
    want.multiplyScalar(maxSp);
    const sp0 = Math.hypot(this.vel.x, this.vel.z);
    this.runT = sp0 > RUN * 0.8 && !act ? this.runT + dt : 0;

    // ---- start actions from the buffer ----
    if (canAct && this.hurtT <= 0 && this.buffer) {
      const b = this.buffer.a;
      if (!act || act.kind === 'guardJolt' || (act.kind === 'draw' && act.t > 0.3)) {
        if (act && act.kind === 'draw' && b !== 'none') { this.action = null; act = null; }
        if (b === 'jump') { if (this.canJump()) { this.buffer = null; this.startJump(); } else if (this.canDoubleJump()) { this.buffer = null; this.startDoubleJump(); } }
        else if (b === 'dodge' && this.onGround) { this.buffer = null; this.startDodge(want); }
        else if (b === 'gust') { this.buffer = null; if (this.unlocked.gust) this.startGust(); }
        else if (b === 'heavy' && this.aiming && this.unlocked.shot) { this.buffer = null; this.startShot(); }
        else if (b === 'heavy' && !this.aiming && this.onGround) {
          this.buffer = null;
          const step = this.chainGrace > 0 ? this.chainNext : 0;
          this.startStrike(step === 3 ? 'sweep' : (step === 1 || step === 2) && this.skills.flyKick ? 'fly' : 'heavy');
        }
        else if (b === 'light' && !this.onGround && !this.aiming && this.canPlunge()) { this.buffer = null; this.startPlunge(); }
        else if (b === 'light' && this.onGround && !this.aiming) {
          this.buffer = null;
          if (this.counterT > 0) { this.counterT = 0; this.startStrike('counter'); impact('gold', 1); }
          else if (this.runT > 0.35 && this.chainGrace <= 0) this.startStrike('thrust');
          else { const s = this.chainGrace > 0 ? this.chainNext : 0; this.startStrike(CHAIN[s], { step: s }); }
        }
      } else if (act.kind === 'strike') {
        // cancel window: the last 30% of the strike, after its hit
        const ok = act.clipT >= act.cancelAt;
        if (ok && b === 'light' && act.step !== undefined && act.step < CHAIN.length - 1) { this.buffer = null; this.startStrike(CHAIN[act.step + 1], { step: act.step + 1, from: act }); }
        else if (ok && b === 'light' && act.name === 'thrust') { this.buffer = null; this.startStrike(CHAIN[1], { step: 1, from: act }); }
        else if (ok && b === 'heavy' && !act.move0.ender && act.name !== 'heavy') {
          this.buffer = null;
          const name = act.step === 2 ? 'sweep' : (act.step <= 1 && this.skills.flyKick) ? 'fly' : 'heavy';
          this.startStrike(name, { from: act });
        }
        else if (b === 'dodge' && act.hitDone && this.onGround) { this.buffer = null; this.endAction(); this.startDodge(want); }
        else if (b === 'jump' && act.hitDone && act.clipT >= act.cancelAt && this.onGround) { this.buffer = null; this.endAction(); this.startJump(); }
      }
      act = this.action;
    }

    // ---- horizontal movement ----
    const acc = this.onGround ? ACC : AIRACC;
    if (act && act.drive) act.drive(dt, this);
    else {
      const dvx = want.x - this.vel.x, dvz = want.z - this.vel.z, dl = Math.hypot(dvx, dvz), step = acc * dt;
      if (dl <= step) { this.vel.x = want.x; this.vel.z = want.z; } else { this.vel.x += dvx / dl * step; this.vel.z += dvz / dl * step; }
    }

    // ---- facing ----
    let targetYaw = this.yaw;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.aiming || (act && act.faceAim)) { _h.copy(G.aimPoint).sub(this.pos); targetYaw = Math.atan2(_h.x, _h.z); if (this.aiming && !act) targetYaw = Cam.yaw + Math.PI; }
    else if (act && act.faceYaw !== undefined) targetYaw = act.faceYaw;
    else if (this.guard) { const t = this.target(7); const fp = t ? t.pos : G.guardFace; if (fp) targetYaw = Math.atan2(fp.x - this.pos.x, fp.z - this.pos.z); }
    else if (want.lengthSq() > 0.01) targetYaw = Math.atan2(want.x, want.z);
    const dy = wrap(targetYaw - this.yaw);
    const turnRate = act ? (act.turn ?? 18) : this.onGround ? 13 : 6;
    const turn = dy * (1 - Math.exp(-turnRate * dt));
    this.yaw = wrap(this.yaw + turn);
    this.lean += ((-turn / Math.max(dt, 1e-4)) * 0.035 * Math.min(1, sp / RUN) - this.lean) * (1 - Math.exp(-10 * dt));
    this.lean = Math.max(-0.3, Math.min(0.3, this.lean));

    // ---- vertical ----
    this.coyote = this.onGround ? COYOTE : this.coyote - dt;
    // a short hop: let go of ✕ while rising and the jump is cut
    if (this.jumping && this.vel.y > 2 && !Input.down('jump') && !this.jumpCut) { this.jumpCut = true; this.vel.y *= 0.5; }
    if (!(act && act.noGrav)) this.vel.y -= GRAV * (act && act.lowGrav ? (this.vel.y > 0 ? 0.62 : 0.35) : 1) * dt;
    this.vel.y = Math.max(this.vel.y, -40);

    // ---- integrate + collide ----
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const col = World.collide(nx, nz, this.radius, this.pos.y + 0.3, 1.3);
    for (const e of G.enemies) {
      if (e.dead || e.falling) continue;
      const dx = col.x - e.pos.x, dz = col.z - e.pos.z, d = Math.hypot(dx, dz), r = this.radius + e.radius;
      if (d < r && d > 1e-4 && Math.abs(e.pos.y - this.pos.y) < 1.5) { col.x += dx / d * (r - d) * 0.6; col.z += dz / d * (r - d) * 0.6; }
    }
    this.pos.x = col.x; this.pos.z = col.z;
    this.pos.y += this.vel.y * dt;
    const gh = World.ground(this.pos.x, this.pos.z, this.pos.y - this.vel.y * dt);
    const wasGround = this.onGround;
    if (this.pos.y <= gh && this.vel.y <= 0) {
      if (!wasGround) this.land(this.fallStartY - gh);
      this.jumping = false; this.dblUsed = false;
      this.pos.y = gh; this.vel.y = 0; this.onGround = true;
      // a fall puts you back on the last ground that was not near an edge (v3: no long walk back)
      this.safeT = (this.safeT || 0) - dt;
      if (this.safeT <= 0) { this.safeT = 0.2; let ok = true; for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (World.ground(this.pos.x + ox * 1.1, this.pos.z + oz * 1.1, this.pos.y + 0.3) < this.pos.y - 0.6) ok = false; if (ok) this.lastSafe.copy(this.pos); }
    } else if (wasGround && gh > -Infinity && this.pos.y - gh < 0.35 && this.vel.y <= 0) {
      this.pos.y = gh; this.vel.y = 0;
    } else {
      if (wasGround) this.fallStartY = this.pos.y;
      this.onGround = false;
    }
    if (!this.onGround) { this.airT += dt; this.fallStartY = Math.max(this.fallStartY, this.pos.y); } else this.airT = 0;
    this.landT = Math.max(0, (this.landT || 0) - (this.onGround && this.action ? 1 : 0));
    if (this.pos.y < -18 && !this.dead) G.onPlayerFell && G.onPlayerFell();

    // ---- action timeline ----
    if (this.action) this.tickAction(dt);

    // ---- animation ----
    c.root.position.copy(this.pos);
    c.root.rotation.y = this.yaw;
    c.body.rotation.z = this.lean * (this.action ? 0.2 : 1);
    const sp2 = Math.hypot(this.vel.x, this.vel.z);
    // v4 note 15, secondary motion: lean into a sprint start, rock back on a stop, dip on landing (a damped spring)
    const accF = dt > 0 ? (sp2 - (this.prevSp ?? sp2)) / dt : 0; this.prevSp = sp2;
    const pitchT = this.onGround && !this.action ? THREE.MathUtils.clamp(accF * 0.006, -0.1, 0.09) : 0;
    const pv = this.pitchV || 0, pp = this.pitch || 0, dip = this.landDip || 0;
    this.pitchV = pv + ((pitchT + dip - pp) * 160 - pv * 18) * dt;
    this.pitch = pp + this.pitchV * dt; this.landDip = Math.max(0, dip - dt * 0.9);
    c.body.rotation.x = THREE.MathUtils.clamp(this.pitch, -0.14, 0.2);
    c.params.move = sp2 / RUN; c.params.lean = this.lean * 57;
    c.params.aimPitch = this.aiming || (act && act.faceAim) ? Cam.pitch * 57 : 0;
    c.params.phaseDriven = true;
    let upper = null;
    if (!this.action && !this.dead && this.hurtT <= 0) {
      if (!this.onGround) this.airAnim(c);
      else if (this.landT > 0 && !(sp2 > 0.6 && this.landT < this.landDur - 0.1)) { this.landT -= dt; /* finish landing */ }
      else if (this.guard) {
        if (c.state !== 'palm') c.play('palm', { seg: [1.36, 1.64], pingpong: true, speed: 0.6, fade: 0.1 });
        if (sp2 > 0.4) this.stepSounds(sp2, dt, 1.2);
      }
      else if (sp2 > 0.6) {
        const run = sp2 > 3.6;
        let stride = 1.5;
        if (run && this.staffOut && c.hasClip('sRun')) { c.play('sRun', { fade: 0.22 }); stride = 3.1; }
        else if (run) { c.play('run', { fade: 0.22 }); if (this.staffOut && c.hasClip('sWalk')) upper = 'sWalk'; stride = c.glb && c.backend.clips.run ? 3.2 : 2.5; }
        else if (this.staffOut && c.hasClip('sWalk')) c.play('sWalk', { fade: 0.22, loop: true, dur: 1.13 / Math.max(0.6, sp2 / 2.2) });
        else { c.play('walk', { fade: 0.22 }); if (c.hasClip('walk')) stride = 5.2; }
        this.stepSounds(sp2, dt, stride);
      } else if (this.aiming) c.play('aim', { fade: 0.2 });
      else if (this.staffOut) c.play('calm', { fade: 0.3 });   // v5: the staff stands upright in his right hand
      else c.play('calm', { fade: 0.3 });
    }
    c.setUpper(upper, { w: 1 });
    c.params.phase = this.phase;
    c.params.relaxed = G.state !== 'play' || G.calm || !this.combat;
    c.update(dt);
    // the staff: in the hands to fight, carried one-handed on the run, on the back otherwise
    // v5 (note 30): the guard and the parry are a bare two-palm wind wall, so the staff slings onto the back;
    // standing still it is held upright in the right hand; it is only in both hands for the staff strikes
    if (this.staffOut && !(this.action && this.action.kind === 'cutscene')) {
      const ak = this.action && this.action.kind;
      const mode = this.guard || ak === 'guardJolt' || ak === 'recoil' ? 'back'
        : this.action ? 'hands'
        : upper || !this.onGround || c.state === 'jump' ? 'carry'
        : sp2 < 0.6 && !this.aiming && this.landT <= 0 ? 'upright' : 'hands';
      this.staff.setMode(mode, mode === 'back' ? 0.1 : 0.16);
    }
    this.wall && this.wall.update(dt, this.guard && !this.dead, this);
    this.staff.noDynamic = !!(this.action && this.action.oneHand);
    // v4 note 24: in the plunge's fall and landing the ring head comes over and leads (blended), then goes back
    const plungeDown = this.action && this.action.kind === 'plunge' && this.action.phase !== 'hang';
    this.staff.flipTo(this.staffFlip0 && !plungeDown, plungeDown ? 0.14 : 0.22);
    this.staff.update(dt);
  }

  stepSounds(sp, dt, stride) {
    const before = Math.floor(this.phase * 2);
    this.phase += sp * dt / stride;
    if (Math.floor(this.phase * 2) !== before) { Audio.play('step', { vol: sp > 4 ? 0.9 : 0.6 }); if (sp > 4 && Math.random() < 0.5) FX.dust(this.pos, 1, 0.5); }
  }

  land(fall) {
    const hard = fall > 3.2;
    this.landDip = Number.isFinite(fall) ? Math.min(0.16, 0.04 + Math.max(0, fall) * 0.035) : 0.04;   // v4 note 15: the body dips into the landing
    Audio.play(hard ? 'landHard' : 'land', { vol: Math.min(1, 0.4 + fall * 0.15) });
    FX.dust(this.pos, hard ? 3 : 2, hard ? 1.2 : 0.7);
    if (hard) { FX.landDust(this.pos, 1.2); shake(0.15); rumble(0.4, 0.2, 80); }
    if (!this.action) {
      if (this.char.hasClip('jump')) { const sp = hard ? 1.0 : 1.5; this.char.play('jump', { seg: JC.land, speed: sp, fade: 0.1, restart: true }); this.landDur = this.landT = (JC.land[1] - JC.land[0]) / sp; }
      else { this.char.play('land', { fade: 0.05, dur: hard ? 0.3 : 0.2 }); this.landDur = this.landT = hard ? 0.3 : 0.2; }
    }
    if (fall > 0.6) rumble(Math.min(0.5, 0.1 + fall * 0.08), 0.15, 50);
    this.fallStartY = this.pos.y;
  }

  canJump() { return (this.onGround || this.coyote > 0) && !this.jumping && this.hurtT <= 0 && !this.guardLocked; }
  // ✕: a real jump. Instant lift-off (the push-off frames play fast so the jump never feels late)
  startJump() {
    this.jumping = true; this.jumpCut = false; this.coyote = 0; this.onGround = false;
    this.vel.y = JUMPV; this.fallStartY = this.pos.y; this.landT = 0;
    const c = this.char;
    if (c.hasClip('jump')) c.play('jump', { seg: JC.up, dur: 0.34, speed: (JC.up[1] - JC.up[0]) / 0.34, fade: 0.06, restart: true });
    else c.play('fall', { fade: 0.1 });
    c.airPhase = 'up';
    Audio.play('jump', { vol: 0.75 }); FX.dust(this.pos, 2, 0.6);
    G.stats.jumps = (G.stats.jumps || 0) + 1;
  }
  // v8 note 47: ✕ again in the air, once per airtime (shrine 3): a second, slightly lower jump off a puff of wind
  canDoubleJump() { return this.unlocked.whirl && !this.onGround && this.coyote <= 0 && !this.dblUsed && this.hurtT <= 0 && !this.dead; }
  startDoubleJump() {
    this.dblUsed = true; this.jumping = true; this.jumpCut = false; this.onGround = false;
    this.vel.y = JUMPV2; this.fallStartY = this.pos.y; this.landT = 0;
    const c = this.char;
    if (c.hasClip('jump')) c.play('jump', { seg: JC.up, dur: 0.3, speed: (JC.up[1] - JC.up[0]) / 0.3, fade: 0.05, restart: true });
    c.airPhase = 'up';
    // the inked wind puff under his feet: a flat ring bursting outward and a few short curls pushing down
    const UP = new THREE.Vector3(0, 1, 0), at = this.pos.clone().setY(this.pos.y + 0.05);
    windRing(at, UP, { r: 0.25, r1: 1.15, travel: -0.35, dur: 0.3, tube: 0.06 });
    windRing(at.clone().setY(at.y - 0.12), UP, { r: 0.15, r1: 0.7, travel: -0.5, dur: 0.24, tube: 0.045 });
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + this.yaw + 0.4, s = Math.sin(a), co = Math.cos(a);
      const p0 = at.clone().add(new THREE.Vector3(s * 0.2, 0.05, co * 0.2)), p2 = at.clone().add(new THREE.Vector3(s * 0.75, -0.55, co * 0.75));
      windTube({ points: [p0, p0.clone().lerp(p2, 0.5).add(new THREE.Vector3(s * 0.15, 0.05, co * 0.15)), p2], dur: 0.28, radius: 0.035, seg: 0.55 });
    }
    Audio.play('windStep', { vol: 0.55, rate: 1.15 });
    G.stats.doubleJumps = (G.stats.doubleJumps || 0) + 1;
  }
  // in the air: tuck on the way up, open out on the way down (driven by the vertical speed, not a timer)
  airAnim(c) {
    if (!c.hasClip('jump')) { if (this.vel.y < -2 && c.state !== 'fall') c.play('fall', { fade: 0.25 }); return; }
    if (c.state !== 'jump') { c.play('jump', { seg: [1.0, 1.02], dur: 0.2, fade: 0.2, restart: true }); c.airPhase = 'hang'; return; }
    if (this.vel.y < -1 && c.airPhase !== 'down') { c.airPhase = 'down'; c.play('jump', { cont: true, seg: [0, JC.down[1]], speed: 0.6 }); }
  }

  lockOrTakedown() {
    // a stunned enemy in reach: the takedown
    let best = null, bd = 2.8;
    for (const e of G.enemies) { if (e.dead || !e.stunned || e.falling || e.takenDown) continue; const d = e.pos.distanceTo(this.pos); if (d < bd) { bd = d; best = e; } }
    if (best && (!this.action || this.action.kind === 'guardJolt' || this.action.kind === 'draw') && this.onGround) { this.action = null; this.startTakedown(best); return; }
    if (G.lockTarget) { G.lockTarget = null; return; }
    let pick = null, sd = 25;
    cameraForward(_f);
    for (const e of G.enemies) { if (e.dead || e.falling) continue; _h.copy(e.pos).sub(this.pos); const d = _h.length(); const facing = _h.normalize().dot(_f); const score = d * (1.6 - facing); if (score < sd) { sd = score; pick = e; } }
    G.lockTarget = pick; if (pick) Audio.play('menuMove', { vol: 0.6 });
  }

  endAction() { const a = this.action; this.action = null; if (a && a.onEnd) a.onEnd(a); this.staff.trailOff(); }

  tickAction(dt) {
    const a = this.action; a.t += dt;
    if (a.kind === 'strike') return this.tickStrike(a, dt);
    const u = a.t / a.dur;
    for (const ev of a.events || []) if (!ev.done && u >= ev.u) { ev.done = true; ev.fn(this, a); }
    if (a.update) a.update(dt, u, this);
    if (u >= 1 && this.action === a) { this.endAction(); if (a.after) a.after(this); }
  }

  // ---------------- the staff: draw and sheathe ----------------
  startDraw() {
    this.staffOut = true;
    Audio.play('staffDraw', { vol: 0.8 });
    if (this.char.hasClip('sStance')) this.char.play('sStance', { seg: [2.8, 4.9], speed: 2.1, fade: 0.12, restart: true });
    this.staff.setMode('hands', 0.3);
    this.action = { kind: 'draw', t: 0, dur: 1.0, move: 0.5, events: [], turn: 10 };
    G.hud && G.hud.combat(true);
  }
  drawNow() { if (this.staffOut) return; this.staffOut = true; this.staff.setMode('hands', 0.16); Audio.play('staffDraw', { vol: 0.45 }); G.hud && G.hud.combat(true); }
  sheathe() { this.staffOut = false; this.staff.setMode('back', 0.35); Audio.play('jingle', { vol: 0.3 }); G.hud && G.hud.combat(false); }

  // ---------------- strikes ----------------
  startStrike(name, o = {}) {
    const m = MOVES[name];
    const from = o.from;
    this.drawNow();
    if (from) this.staff.trailOff();
    const tgt = this.target(name === 'thrust' ? 6 : 4.5);
    let faceYaw = this.stickYaw() ?? this.yaw;
    // v3: with no enemy near, a training post (or other dummy) within reach pulls the swing the same way
    let dummy = null;
    if (!tgt) for (const d of G.dummies || []) { const dx = d.pos.x - this.pos.x, dz = d.pos.z - this.pos.z, dd = Math.hypot(dx, dz); if (dd < 3.4 && Math.cos(Math.atan2(dx, dz) - faceYaw) > -0.2) dummy = { pos: d.pos, d: dd }; }
    const aimAt = tgt || dummy;
    if (aimAt) faceYaw = Math.atan2(aimAt.pos.x - this.pos.x, aimAt.pos.z - this.pos.z);
    const dist = tgt ? Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) : dummy ? Math.max(1.2, dummy.d) : 0;
    // step toward the target so the chain stays connected: 0.4-0.6 m, more to close a gap
    const want = aimAt ? THREE.MathUtils.clamp(dist - (m.reach - 0.6), dummy ? 0 : 0.35, name === 'thrust' ? 3.2 : 1.6) : 0.45;
    // same clip, contiguous segment: let the clip keep running (the flow); otherwise blend 0.1 s
    const cont = from && from.move0.clip === m.clip && Math.abs(from.move0.b - m.a) < 0.02 && this.char.state === m.clip;
    // v6: a strike cancelled early into the next segment leaves the clip short of that segment's start. The hit is
    // timed from the clip time actually shown (c0), and the catch-up plays up to 1.8x faster so the contact lands
    // about when it would have (v5 timed it from the segment start, so the spark could come on the backswing).
    let c0 = m.a, sp = m.speed;
    if (cont) { c0 = Math.min(m.a, this.char.clipTime()); sp = THREE.MathUtils.clamp((m.hit - c0) / ((m.hit - m.a) / m.speed), m.speed, m.speed * 1.8); this.char.play(m.clip, { cont: true, seg: [m.a, m.b], speed: sp }); }
    else this.char.play(m.clip, { seg: [m.a, m.b], speed: m.speed, fade: from ? 0.1 : 0.08, restart: true });
    const dur = (m.b - c0) / sp, hitAfter = (m.hit - c0) / sp;
    const a = this.action = {
      kind: 'strike', name, move0: m, step: o.step, t: 0, dur, clipT: c0, c0, sp, cancelAt: Math.max(m.hit + 0.04, m.a + (m.b - m.a) * 0.45),   // planner hotfix 13:20: the next strike may start much sooner after the hit (was the last 30%)
      faceYaw, turn: 22, hitDone: false, move: 0, oneHand: !!m.oneHand,
      drive: (dt, p) => { const k = p.action.t; const s = k < hitAfter ? want / hitAfter : 0; p.vel.x = Math.sin(faceYaw) * s; p.vel.z = Math.cos(faceYaw) * s; },
    };
    // sound: the whoosh layered with the rings
    Audio.play(m.heavy || m.ender ? 'staffWhooshHeavy' : 'staffWhoosh', { vol: 0.75, delay: Math.max(0, hitAfter - 0.12) });
    if (!m.foot) Audio.play('jingle', { vol: 0.55, delay: Math.max(0, hitAfter - 0.1) });
    if (!m.foot) a.trailAt = Math.max(0, hitAfter - 0.16);
    return a;
  }
  tickStrike(a, dt) {
    const m = a.move0;
    a.clipT = a.c0 + a.t * a.sp;
    // v6: on ones (every frame) through the swing into contact: animated on twos, a fast swing's held pose lags the
    // clip by up to 1/12 s, so the spark could land while the staff still showed the backswing (3D-DIRECTION 1:
    // "big moves can switch to ones for the snap frames")
    if (a.clipT >= m.hit - 0.25 * a.sp / m.speed - 0.1 && a.clipT <= m.hit + 0.1) this.char._dirty = true;
    if (a.trailAt !== undefined && a.t >= a.trailAt && !a.trailing) { a.trailing = true; this.staff.trailOn({ width: m.heavy ? 0.12 : 0.085 }); }
    if (a.trailing && a.clipT > m.hit + 0.12) { this.staff.trailOff(); a.trailing = false; a.trailAt = undefined; }
    // v6: the grip chain's smear follows the ring head's real path over the last 0.2 clip-seconds before contact
    if (m.smear && m.smear.path && !a.hitDone && a.clipT >= m.hit - 0.2) { const P = a.path || (a.path = []); if (!P.length || P[P.length - 1].distanceTo(this.staff.tipPos) > 0.03) P.push(this.staff.tipPos.clone()); }
    if (!a.hitDone && a.clipT >= m.hit) { a.hitDone = true; this.strikeHit(a); }
    if (a.t >= a.dur && this.action === a) {
      this.action = null; this.staff.trailOff();
      // no buffered press: settle into the guard stance; a press soon after still continues the chain
      if (a.step !== undefined && a.step < CHAIN.length - 1) { this.chainNext = a.step + 1; this.chainGrace = 0.35; }
      else if (a.step !== undefined) { this.chainNext = 0; this.chainGrace = 0; }
      else if (a.name === 'thrust') { this.chainNext = 1; this.chainGrace = 0.35; }
      this.char.play('calm', { fade: 0.25 });
    }
  }
  strikeHit(a) {
    const m = a.move0;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let any = false, blocked = false;
    for (const e of G.enemies) {
      if (e.dead || e.falling || e.takenDown) continue;
      _h.copy(e.pos).sub(this.pos); const d = Math.hypot(_h.x, _h.z);
      if (d > m.reach + e.radius || Math.abs(_h.y) > 1.6) continue;
      const ang = Math.acos(THREE.MathUtils.clamp((fx * _h.x + fz * _h.z) / (d || 1), -1, 1));
      if (ang > m.arc && d > 0.7) continue;
      const dir = _h.clone().setY(0).normalize();
      // a shield-bearer turns light strikes aside from the front
      if (e.blocks && e.blocks(this.pos, m)) { blocked = true; e.onBlock(m, this); continue; }
      const kn = m.flat ? dir.clone() : new THREE.Vector3(fx, 0, fz).lerp(dir, 0.5).normalize();
      hitEnemy(e, { dmg: m.dmg, knock: kn.multiplyScalar(m.knock), up: m.up || 0, heavy: !!(m.heavy || m.heavyish), ender: !!m.ender, launch: m.launch, knockdown: m.knockdown, melee: true, staff: !m.foot, from: this.pos });
      any = true;
    }
    for (const t of G.dummies || []) {
      _h.copy(t.pos).sub(this.pos); const d = Math.hypot(_h.x, _h.z);
      if (d > m.reach + 0.4) continue;
      if ((fx * _h.x + fz * _h.z) / (d || 1) < Math.cos(m.arc) && d > 0.7) continue;
      t.onHit(a.name, m); any = true;
      FX.hit(t.pos.clone().setY(t.pos.y + 1.2), null, m.heavy ? 1.1 : 0.8); Audio.play(m.heavy ? 'staffHitHeavy' : 'staffHit', { at: t.pos, vol: 0.7, rate: 1.15 }); hitstop(m.heavy ? 0.07 : 0.04);
    }
    // the swing's smear in the swing plane
    if (!m.foot && m.smear) {
      // v3: the smear is a swept 3D band in the swing plane (never a card seen edge-on)
      const s = m.smear, c = this.pos.clone().setY(this.pos.y + (s.flat ? 0.5 : 1.05)), fw = _h.set(fx, 0, fz).clone();
      if (s.path) { const P = a.path || []; if (P.length >= 3) { const last = P[P.length - 1], prev = P[P.length - 2], ext = last.clone().add(last.clone().sub(prev).multiplyScalar(1.5)); windTube({ points: [...P, ext], dur: 0.17, radius: 0.07, seg: 0.75, lit: 0xffffff, shade: 0xbfe0ea, ink: 0.012 }); } }
      else if (s.thrust) windTube({ points: [c.clone().addScaledVector(fw, 0.5), c.clone().addScaledVector(fw, 2.8)], dur: 0.15, radius: 0.06, seg: 0.85 });
      else swingArc(c.addScaledVector(fw, 0.15), this.yaw, { roll: s.roll, flip: s.flip, r: s.flat ? 1.55 : s.big ? 1.6 : 1.4, width: s.big ? 0.095 : 0.065, a0: s.flat ? -1.9 : -1.4, a1: s.flat ? 1.9 : 1.4, dur: s.big ? 0.2 : 0.16 });
    }
    if (blocked && !any) { Audio.play('shieldBlock', { at: this.pos }); rumble(0.3, 0.3, 60); hitstop(0.05); this.recoil(); }
    if (any) this.breath = Math.min(this.maxBreath, this.breath + 4);
    // the air-infused staff: heavies send a short wind blade (skill)
    if (a.name === 'heavy' && this.skills.blade && this.spend(15)) Bend.windBlade(this);
  }
  recoil() {
    this.action = null;
    this.char.play('hurt', { restart: true, fade: 0.05, dur: 0.3 });
    this.action = { kind: 'recoil', t: 0, dur: 0.3, move: 0, events: [], drive: (dt, p) => { p.vel.x = -Math.sin(p.yaw) * 2.5; p.vel.z = -Math.cos(p.yaw) * 2.5; } };
  }
  parryCounter() { this.counterT = 0.8; G.hud && G.hud.hint && G.hud.hint('Counter! [R1]', 0.8); }
  // a parry: a quick snap on the guard pose
  parryJolt() {
    this.action = null; this.staff.trailOff();
    if (this.char.hasClip('palm')) this.char.play('palm', { seg: [1.0, 1.5], speed: 2.4, fade: 0.03, restart: true });   // v5: a two-palm snap
    this.action = { kind: 'guardJolt', t: 0, dur: 0.2, move: 0, events: [] };
  }
  blockSlide(from) {
    const d = this.pos.clone().sub(from).setY(0).normalize();
    if (this.char.hasClip('blockHit')) this.char.play('blockHit', { seg: [1.05, 1.7], speed: 1.4, fade: 0.04, restart: true });
    this.action = { kind: 'guardJolt', t: 0, dur: 0.2, move: 0, events: [], drive: (dt, p) => { const k = 1 - p.action.t / 0.2; p.vel.x = d.x * 5 * k; p.vel.z = d.z * 5 * k; } };
  }

  // ---------------- dodge: roll, or the wind-step once learned ----------------
  startDodge(want) {
    const dir = want.lengthSq() > 0.01 ? Math.atan2(want.x, want.z) : wrap(this.yaw + Math.PI);
    if (this.unlocked.step) return this.startStep(dir);
    this.yaw = dir;
    this.iframes = Math.max(this.iframes, 0.34);
    Audio.play('dodge', { vol: 0.8 });
    this.char.play('roll', { fade: 0.06, dur: 0.52, restart: true });
    // v3 (note 9): the staff goes onto the back for the roll (it used to trail on the ground off the hand)
    const wasOut = this.staffOut; if (wasOut) { this.staffOut = false; this.staff.setMode('back', 0.08); }
    this.action = { kind: 'roll', t: 0, dur: 0.52, events: [], faceYaw: dir, turn: 30, oneHand: true,
      onEnd: () => { if (wasOut) { this.staffOut = true; this.staff.setMode('hands', 0.16); } },
      drive: (dt, p) => { const k = 1 - p.action.t / p.action.dur; const s = 3 + 9 * k * k; p.vel.x = Math.sin(dir) * s; p.vel.z = Math.cos(dir) * s; } };
    FX.dust(this.pos, 2, 0.7);
  }
  // a gust-driven dash: longer, and it passes straight through red attacks
  startStep(dir) {
    this.yaw = dir;
    this.iframes = Math.max(this.iframes, 0.42); this.stepping = true;
    Audio.play('windStep', { vol: 0.9 });
    const c = this.char;
    if (c.hasClip('sidestep')) c.play('sidestep', { seg: [0.1, 0.7], speed: 1.65, fade: 0.04, restart: true }); else c.play('roll', { fade: 0.05, dur: 0.36, restart: true });
    const srcs = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let i = 0; i < 3; i++) srcs[i].copy(this.pos).setY(this.pos.y + 0.5 + i * 0.4);
    const ribs = srcs.map((s, i) => ribbon({ src: s, color: 0xdff2f6, core: 0xffffff, width: 0.06 + i * 0.015, n: 12, opacity: 0.95 }));
    { const back = new THREE.Vector3(-Math.sin(dir), 0, -Math.cos(dir)), o = this.pos.clone().setY(this.pos.y + 0.9); for (let i = 0; i < 3; i++) windTube({ points: [o.clone().addScaledVector(back, -0.3), o.clone().addScaledVector(back, 1.8).setY(o.y + (i - 1) * 0.35)], dur: 0.3, radius: 0.05, seg: 0.8, curl: 0.12, turns: 1.2, phase: i * 2 }); }
    this.action = { kind: 'step', t: 0, dur: 0.36, events: [], faceYaw: dir, turn: 40, oneHand: true,
      drive: (dt, p) => { const k = 1 - p.action.t / p.action.dur; const s = 4 + 20 * k * k; p.vel.x = Math.sin(dir) * s; p.vel.z = Math.cos(dir) * s; },
      update: (dt, u, p) => { srcs.forEach((s, i) => s.set(p.pos.x + Math.cos(p.yaw) * (i - 1) * 0.3, p.pos.y + 0.5 + i * 0.4, p.pos.z - Math.sin(p.yaw) * (i - 1) * 0.3)); },
      onEnd: () => { ribs.forEach((r) => (r.dead = true)); this.stepping = false; } };
  }

  // ---------------- air: palm gust (L1 + □) ----------------
  startGust() {
    if (this.cd.gust > 0) { G.hud && G.hud.cooldownNope('gust'); Audio.play('noBreath', { vol: 0.4 }); return; }
    this.cd.gust = this.cdMax.gust * (this.skills.gustCD ? 0.75 : 1);
    const tgt = this.target(6);
    let faceYaw = tgt ? Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) : (this.stickYaw() ?? this.yaw);
    if (!tgt) for (const d of G.dummies || []) { const dx = d.pos.x - this.pos.x, dz = d.pos.z - this.pos.z; if (Math.hypot(dx, dz) < 4.5) faceYaw = Math.atan2(dx, dz); }
    const c = this.char;
    if (c.hasClip('palm')) c.play('palm', { seg: [1.05, 1.8], speed: 1.5, fade: 0.08, restart: true }); else c.play('castAir', { restart: true, fade: 0.08, dur: 0.5 });
    // both palms push: the staff goes onto the back for the move, and comes back after
    const wasOut = this.staffOut; this.staffOut = false; this.staff.setMode('back', 0.12);
    G.hud && G.hud.used('gust');
    this.action = { kind: 'gust', t: 0, dur: 0.5, move: 0.15, faceYaw, turn: 25,
      events: [{ u: 0.62, fn: (p) => Bend.palmGust(p, faceYaw) }],
      onEnd: () => { if (wasOut || this.combat) { this.staffOut = true; this.staff.setMode('hands', 0.2); } } };
  }
  // ---------------- v4 note 24: jump + R1, the plunging staff slam ----------------
  // At the apex Joon raises the staff overhead (a 0.12 s hang), then the code drives him straight down, ring
  // head first. Landing hits a ground circle (2.5 m, bigger from higher up) with an inked wind shock ring and
  // dust, hit-stop and rumble, and knocks light enemies down. Pose: Sword_Judgment (clips/jump-overhead-strike):
  // overhead 0.80-0.95 s, the downward strike 1.17-1.5 s, the low crouch to 1.9 s.
  canPlunge() {
    if (this.hurtT > 0 || this.cd.plunge > 0) return false;
    const gh = World.ground(this.pos.x, this.pos.z, this.pos.y + 0.1);
    return this.pos.y - gh > 0.55 || this.vel.y > 2;
  }
  startPlunge() {
    this.drawNow();
    const c = this.char, has = c.hasClip('jOver');
    const tgt = this.target(5);
    const faceYaw = tgt ? Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) : this.yaw;
    const top = this.pos.y;
    if (has) c.play('jOver', { seg: [0.62, 0.95], dur: 0.16, speed: (0.95 - 0.62) / 0.16, fade: 0.06, restart: true });
    Audio.play('staffWhoosh', { vol: 0.6, rate: 0.8 }); Audio.play('jingle', { vol: 0.5 });
    const HANG = 0.16;
    const a = this.action = { kind: 'plunge', t: 0, dur: 9, move: 0, events: [], faceYaw, turn: 30, noGrav: true, phase: 'hang', top,
      drive: (dt, p) => {
        const A = p.action;
        if (A.phase === 'hang') { p.vel.y = Math.max(0, p.vel.y * 0.5); p.vel.x *= 0.85; p.vel.z *= 0.85; }
        else if (A.phase === 'fall') {
          p.vel.y = Math.max(-30, p.vel.y - 70 * dt);   // straight down, fast
          // a little homing toward the target so the circle lands where you meant it
          let hx = 0, hz = 0; if (tgt && !tgt.dead) { hx = THREE.MathUtils.clamp((tgt.pos.x - p.pos.x) * 3, -4, 4); hz = THREE.MathUtils.clamp((tgt.pos.z - p.pos.z) * 3, -4, 4); }
          p.vel.x = hx; p.vel.z = hz;
        } else { p.vel.x = 0; p.vel.z = 0; }
      },
      update: (dt, u, p) => {
        const A = p.action;
        if (A.phase === 'hang' && A.t >= HANG) {
          A.phase = 'fall'; p.vel.y = -8;
          if (has) c.play('jOver', { seg: [1.0, 1.22], dur: 0.22, speed: 1, fade: 0.05, restart: true });
          p.staff.trailOn({ width: 0.11 });
          Audio.play('staffWhooshHeavy', { vol: 0.9 });
        }
        if (A.phase === 'fall' && (p.onGround || A.t > 2.5)) p.plungeLand(A);
        if (A.phase === 'land' && A.t >= A.endT) p.endAction();
      },
      onEnd: () => { if (c.hasClip('sStance')) c.play('sStance', { seg: [4.9, 6.05], pingpong: true, speed: 0.7, fade: 0.25 }); },
    };
    this.iframes = Math.max(this.iframes, 0.2);
    return a;
  }
  plungeLand(A) {
    const c = this.char, fall = Math.max(0, A.top - this.pos.y);
    const k = Math.min(1, fall / 4);                  // 0 = a hop's height, 1 = 4 m or more (a long fall)
    const R = 2.5 + k * 1.3, dmg = Math.round(11 + k * 9);
    A.phase = 'land'; A.endT = A.t + 0.5; this.cd.plunge = 0.35;
    this.staff.trailOff();
    if (c.hasClip('jOver')) c.play('jOver', { seg: [1.3, 1.9], dur: 0.5, speed: 0.6 / 0.5, fade: 0.04, restart: true });
    // the ring head hits the ground in front of him
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const at = new THREE.Vector3(this.pos.x + fx * 0.9, this.pos.y + 0.06, this.pos.z + fz * 0.9);
    windRing(at, new THREE.Vector3(0, 1, 0), { r: 0.4, r1: R, travel: 0, dur: 0.32, tube: 0.07 });
    windRing(at.clone().setY(at.y + 0.1), new THREE.Vector3(0, 1, 0), { r: 0.2, r1: R * 0.6, travel: 0.3, dur: 0.24, tube: 0.05 });
    for (let i = 0; i < 8; i++) {   // inked wind spokes skidding out along the ground
      const ang = i / 8 * Math.PI * 2 + 0.2, d0 = 0.4, d1 = R * (0.75 + 0.2 * (i % 2));
      const p0 = at.clone().add(new THREE.Vector3(Math.sin(ang) * d0, 0.12, Math.cos(ang) * d0)), p1 = at.clone().add(new THREE.Vector3(Math.sin(ang) * d1, 0.3, Math.cos(ang) * d1));
      windTube({ points: [p0, p0.clone().lerp(p1, 0.5).setY(at.y + 0.45), p1], dur: 0.3, radius: 0.045, seg: 0.6 });
    }
    FX.landDust(at, 1.3 + k * 0.6); FX.dust(at, 3, 1.4);
    Audio.play('landHard', { vol: 1 }); Audio.play('staffHitHeavy', { vol: 0.9, rate: 0.85 });
    shake(0.22 + k * 0.15); rumble(0.7 + k * 0.3, 0.5, 120); hitstop(0.07 + k * 0.03); impact('air', 1 + (k > 0.5 ? 1 : 0));
    let n = 0;
    for (const e of G.enemies) {
      if (e.dead || e.falling || e.takenDown) continue;
      const dx = e.pos.x - at.x, dz = e.pos.z - at.z, d = Math.hypot(dx, dz);
      if (d > R + e.radius || Math.abs(e.pos.y - this.pos.y) > 1.4) continue;
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      hitEnemy(e, { dmg: d < 1.3 ? dmg : Math.round(dmg * 0.7), knock: dir.multiplyScalar(4 + k * 3), up: 3.5, heavy: true, ender: true, knockdown: !e.boss && !e.heavyBody, melee: true, staff: true, from: this.pos, noImpact: true, hs: 0.02 });
      n++;
    }
    for (const t of G.dummies || []) { if (t.pos.distanceTo(at) < R + 0.4) { t.onHit('heavy', MOVES.heavy); n++; } }
    if (n) this.breath = Math.min(this.maxBreath, this.breath + 6);
    G.stats.slams = (G.stats.slams || 0) + 1;
  }
  // ---------------- air: the aimed gust shot (L2 + R2) ----------------
  startShot() {
    if (!this.spend(20)) return;
    const c = this.char;
    if (c.hasClip('palm')) c.play('palm', { seg: [1.25, 1.7], speed: 1.5, fade: 0.05, restart: true }); else c.play('castAir', { restart: true, fade: 0.05, dur: 0.3 });
    G.hud && G.hud.used('shot');
    this.action = { kind: 'shot', t: 0, dur: 0.3, move: 0.6, faceAim: true, aimOK: true, oneHand: true, events: [{ u: 0.5, fn: (p) => gustShot(p) }] };
  }

  // ---------------- the takedown (R3 on a stunned enemy) ----------------
  // Joon hooks the ankle with the staff's ring end, sweeps, and a palm gust sends the soldier tumbling.
  startTakedown(e) {
    this.drawNow();
    G.lockTarget = null;
    const faceYaw = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
    e.takenDown = true; e.beginTakedown && e.beginTakedown(this);
    this.iframes = 2;
    const c = this.char;
    if (c.hasClip('legSweep')) c.play('legSweep', { seg: [0.45, 1.5], speed: 1.6, fade: 0.08, restart: true });
    else if (c.hasClip('sSweep')) c.play('sSweep', { seg: [1.9, 3.0], speed: 1.55, fade: 0.08, restart: true });
    Audio.play('staffWhooshHeavy', { vol: 0.8, delay: 0.12 }); Audio.play('jingle', { vol: 0.6, delay: 0.15 });
    Cam.focus(1.7, 1.5);
    const dist = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
    const step = Math.max(0, dist - 1.3);
    this.action = { kind: 'takedown', t: 0, dur: 1.3, move: 0, faceYaw, turn: 30,
      drive: (dt, p) => { const s = p.action.t < 0.25 ? step / 0.25 : 0; p.vel.x = Math.sin(faceYaw) * s; p.vel.z = Math.cos(faceYaw) * s; },
      events: [
        { u: 0.12, fn: (p) => p.staff.trailOn({ width: 0.11 }) },
        { u: 0.3, fn: (p) => { // the hook and sweep: the legs go
          p.staff.trailOff();
          e.sweepDown && e.sweepDown(p);
          FX.hit(e.pos.clone().setY(e.pos.y + 0.4), null, 1.1); Audio.play('staffHitHeavy', { at: e.pos }); hitstop(0.09); rumble(0.6, 0.5, 90); Cam.kick(new THREE.Vector3(Math.sin(faceYaw), 0, Math.cos(faceYaw)), 0.08);
        } },
        { u: 0.5, fn: (p) => { // flow into the two-handed push
          if (p.char.hasClip('palm')) p.char.play('palm', { seg: [1.2, 1.75], speed: 1.25, fade: 0.1, restart: true });
          p.staff.setMode('back', 0.15); p.staffOut = false;
        } },
        { u: 0.74, fn: (p) => { // the palm gust: he tumbles away (off the mountain if the edge is near)
          slowmo(0.6, 0.45);
          Bend.takedownGust(p, e, faceYaw);
          Audio.play('takedown', { vol: 1 }); rumble(1, 0.8, 160); hitstop(0.11);
        } },
      ],
      onEnd: () => { this.staffOut = true; this.staff.setMode('hands', 0.2); this.iframes = 0.3; } };
  }
}
