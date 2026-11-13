// The one-shot camera (v2): close over the right shoulder, Joon on the left third.
//  - boom: exploring 2.6 m (+0.3 at a full run), combat 2.3 m, aiming 1.9 m; the Captain's phases 2.4 / 3.6 / 1.8 m;
//    every change blends over about 0.6 s
//  - lock-on aims at the point 60% of the way from Joon to the target, so both stay in frame
//  - hits nudge the camera along the hit (Cam.kick, a spring that settles in 0.15 s); shake is kept for slams
//  - collision rays start from Joon's chest; cover slabs between the camera and Joon fade
//  - no hard cuts: story moments use Cam.shot(poseFn, blendIn) and Cam.release(blendOut), one continuous move
import * as THREE from 'three';
import { G, setCamKick } from './state.js';
import { World } from './world.js';
import { Input } from './input.js';
import { Shake, Time } from './fx.js';
import { Audio } from './audio.js';

export const Cam = {
  yaw: Math.PI, pitch: -0.14, pivot: new THREE.Vector3(), aimK: 0, dist: 2.6, curDist: 2.6, fov: 60, override: null,
  lookAhead: new THREE.Vector3(), zoomK: 0, focusDist: 0, focusT: 0, fadeables: [], bossPhase: 0,
  kicks: [], shotState: null, ret: null,
  kick(dir, amt = 0.08) { this.kicks.push({ d: dir.clone().setY(0).normalize(), a: amt, t: 0 }); if (this.kicks.length > 6) this.kicks.shift(); },
  focus(dist, dur) { this.focusDist = dist; this.focusT = dur; },
  // story camera: pose(t) -> { pos, look, fov }. Blends from wherever the camera is.
  shot(pose, blendIn = 1.2, o = {}) { const c = G.camera; this.shotState = { pose, t: 0, blend: blendIn, fromPos: c.position.clone(), fromQ: c.quaternion.clone(), fromFov: c.fov, dur: o.dur, out: o.out ?? 0.45 }; this.ret = null; },
  // v6 (item 6): the Captain's phase beat, an authored 1.2 s move: from wherever the camera is, it pushes in on him
  // (to 2.9 m) while orbiting 0.75 rad round him, low and looking up a little, Joon kept at the frame's edge; then it
  // hands back to the gameplay camera over 0.45 s. One continuous move, no cut.
  beat(boss, dur = 1.2) {
    if (this.shotState) return;
    const c = G.camera, C = boss.pos.clone().setY(boss.pos.y + 1.45);
    const a0 = Math.atan2(c.position.x - C.x, c.position.z - C.z), d0 = THREE.MathUtils.clamp(Math.hypot(c.position.x - C.x, c.position.z - C.z), 3.6, 7), h0 = THREE.MathUtils.clamp(c.position.y - C.y, -0.4, 2.5);
    // orbit toward the side Joon is not on, so he never crosses the lens
    const pj = G.player.pos, aj = Math.atan2(pj.x - C.x, pj.z - C.z), sgn = wrap(aj - a0) > 0 ? -1 : 1;
    this.shot((t) => {
      const k = ease(Math.min(1, t / dur)), a = a0 + sgn * 0.75 * k, d = THREE.MathUtils.lerp(d0, 2.9, k), h = THREE.MathUtils.lerp(h0, -0.25, k);
      const pos = new THREE.Vector3(C.x + Math.sin(a) * d, C.y + h, C.z + Math.cos(a) * d);
      // never behind a rock or a wall: pull in to just short of the first thing between him and the lens
      ray.set(C, pos.clone().sub(C).normalize()); ray.far = d + 0.3;
      const hit = ray.intersectObjects(World.rayMeshes, false)[0]; if (hit) pos.copy(C).addScaledVector(ray.ray.direction, Math.max(1.6, hit.distance - 0.35));
      const look = C.clone().lerp(new THREE.Vector3(pj.x, pj.y + 1.2, pj.z), 0.18 * (1 - k)); look.y += 0.15 * k;
      return { pos, look, fov: THREE.MathUtils.lerp(58, 46, k) };
    }, 0.3, { dur, out: 0.45 });
  },
  release(blendOut = 1.0) { const c = G.camera; this.shotState = null; this.ret = { t: 0, dur: blendOut, fromPos: c.position.clone(), fromQ: c.quaternion.clone(), fromFov: c.fov }; },
};
setCamKick((d, a) => Cam.kick(d, a));
const ray = new THREE.Raycaster(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3(), _k = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (x) => x * x * (3 - 2 * x);

// ------------------------------------------------------------------ v7 note 42: lock-on switching (God of War style)
// While locked on: flick the right stick (or move the mouse / drag the camera past a threshold) left or right to
// switch to the nearest enemy in that direction ON SCREEN. A 0.3 s cooldown stops flicker; the stick has to come
// back near centre before it can flick again. No enemy that way: nothing happens. When the locked enemy dies (or
// goes off the mountain), the lock moves to the next nearest live enemy within 18 m.
export const LOCK = { cd: 0, acc: 0, armed: true, mArmed: true, easeT: 0, slide: null, switches: 0, log: [] };
const lockable = (e) => e && !e.dead && !e.falling && !e.removed && !e.takenDown;
function screenOf(e, out) { return out.set(e.pos.x, e.pos.y + e.height * 0.55, e.pos.z).project(G.camera); }
export function lockSwitch(dir) {
  const cur = G.lockTarget; if (!lockable(cur)) return false;
  const c = screenOf(cur, new THREE.Vector3()).clone(), v = new THREE.Vector3();
  let best = null, bd = 1e9;
  for (const e of G.enemies) {
    if (e === cur || !lockable(e) || e.pos.distanceTo(G.player.pos) > 26) continue;
    screenOf(e, v); if (v.z > 1 || Math.abs(v.x) > 1.5) continue;   // behind the camera or far off screen
    const dx = (v.x - c.x) * dir; if (dx < 0.015) continue;
    const d = Math.hypot(dx, (v.y - c.y) * 0.6); if (d < bd) { bd = d; best = e; }
  }
  if (!best) return false;
  LOCK.slide = { x: (c.x + 1) / 2, y: (1 - c.y) / 2, t: 0 };
  G.lockTarget = best; LOCK.easeT = 0.4; LOCK.cd = 0.3; LOCK.switches++; LOCK.log.push({ t: +G.time.toFixed(2), dir });
  Audio.play('menuMove', { vol: 0.5, rate: dir > 0 ? 1.08 : 0.94 });
  return true;
}
function lockUpdate(dt) {
  LOCK.cd -= dt; LOCK.easeT -= dt;
  const lt = G.lockTarget;
  if (!lt) { LOCK.acc = 0; return; }
  if (!lockable(lt)) {
    // the locked enemy died: hand the lock to the next nearest one, sliding the marker over
    const from = screenOf(lt, new THREE.Vector3());
    let best = null, bd = 18;
    for (const e of G.enemies) { if (e === lt || !lockable(e)) continue; const d = e.pos.distanceTo(G.player.pos); if (d < bd) { bd = d; best = e; } }
    G.lockTarget = best;
    if (best) { LOCK.slide = { x: (from.x + 1) / 2, y: (1 - from.y) / 2, t: 0 }; LOCK.easeT = 0.5; LOCK.log.push({ t: +G.time.toFixed(2), auto: true }); }
    return;
  }
  if (G.state !== 'play' || G.player.aiming) { LOCK.acc = 0; return; }
  const gp = Input.gamepad;
  if (Input.usingPad && gp) {
    const rx = gp.axes[2] || 0;
    if (Math.abs(rx) < 0.35) LOCK.armed = true;
    else if (LOCK.armed && Math.abs(rx) > 0.7 && LOCK.cd <= 0) { LOCK.armed = false; lockSwitch(Math.sign(rx)); }
  } else {
    // mouse or touch drag: a quick sideways movement worth about 0.1 rad of camera turn
    // after a switch the drag has to ease off (like the stick coming back to centre) before it can switch again,
    // so one long swipe is one switch
    LOCK.acc = LOCK.acc * Math.exp(-7 * dt) + Input.look.x;
    if (!LOCK.mArmed) { if (Math.abs(LOCK.acc) < 0.02 && LOCK.cd <= 0) LOCK.mArmed = true; }
    else if (Math.abs(LOCK.acc) > 0.1 && LOCK.cd <= 0) { const d = Math.sign(LOCK.acc); LOCK.acc = 0; LOCK.mArmed = false; lockSwitch(d); }
  }
}

export function cameraForward(out = new THREE.Vector3()) { return out.set(-Math.sin(Cam.yaw) * Math.cos(Cam.pitch), Math.sin(Cam.pitch), -Math.cos(Cam.yaw) * Math.cos(Cam.pitch)); }

function lookQuat(pos, look) { _m.lookAt(pos, look, _up); return _q.setFromRotationMatrix(_m).clone(); }

export function updateCamera(dt, realDt) {
  const cam = G.camera, p = G.player;
  if (!p) return;
  if (Cam.override) { Cam.override(cam, realDt); return; }
  // story shot: blend from the snapshot to the scripted pose
  if (Cam.shotState) {
    const s = Cam.shotState; s.t += realDt;
    if (s.dur && s.t >= s.dur) { Cam.release(s.out); return updateCamera(dt, 0); }
    const pose = s.pose(s.t);
    const k = ease(Math.min(1, s.t / s.blend));
    cam.position.copy(s.fromPos).lerp(pose.pos, k);
    cam.quaternion.copy(s.fromQ).slerp(lookQuat(pose.pos, pose.look), k);
    const fov = THREE.MathUtils.lerp(s.fromFov, pose.fov ?? 55, k);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    Cam.fov = cam.fov;
    syncListener(cam);
    return;
  }
  const aiming = p.aiming;
  Cam.aimK += ((aiming ? 1 : 0) - Cam.aimK) * damp(12, realDt);
  // v7 note 42: while locked on, a sideways flick of the camera input switches targets instead of turning the camera
  lockUpdate(realDt);
  const lockedNow = G.lockTarget && !G.lockTarget.dead;
  if (G.state === 'play' || G.state === 'walkTalk') { Cam.yaw -= Input.look.x * (lockedNow ? 0.15 : 1); Cam.pitch -= Input.look.y * (lockedNow ? 0.3 : 1); }
  // lock-on: ease yaw toward the point 60% of the way to the target (faster for 0.4 s after a switch)
  const lt = G.lockTarget;
  if (lt && !lt.dead) {
    _t.copy(p.pos).lerp(lt.pos, 0.6).sub(p.pos);
    if (_t.lengthSq() > 0.25) {
      const want = Math.atan2(-_t.x, -_t.z);
      Cam.yaw += wrap(want - Cam.yaw) * damp(LOCK.easeT > 0 ? 9 : 5, realDt);
      const wantP = Math.atan2(lt.pos.y + lt.height * 0.5 - (p.pos.y + 1.45), Math.hypot(_t.x, _t.z) / 0.6) - 0.08;
      Cam.pitch += (wantP - Cam.pitch) * damp(3, realDt);
    }
  }
  // v7 note 41: a story focus (the Elder in the parry lesson): frame Joon and her, like a soft lock-on
  else if (G.camFocus && G.state === 'play') {
    _t.copy(p.pos).lerp(G.camFocus, 0.5).sub(p.pos);
    if (_t.lengthSq() > 0.25) Cam.yaw += wrap(Math.atan2(-_t.x, -_t.z) + (G.camFocusOff || 0) - Cam.yaw) * damp(Math.abs(Input.look.x) > 0.002 ? 0.6 : 3, realDt);
  }
  // a soldier going off the mountain: lean the camera after him without ever losing Joon
  if (Cam.watch) {
    const w = Cam.watch; w.t -= realDt;
    if (w.t <= 0 || w.e.removed) Cam.watch = null;
    else { _t.copy(w.e.pos).sub(p.pos); const want = Math.atan2(-_t.x, -_t.z); Cam.yaw += wrap(want - Cam.yaw) * 0.35 * damp(2.5, realDt); Cam.pitch += (-0.42 - Cam.pitch) * damp(1.5, realDt); }
  }
  // pad aim assist: magnetism toward an enemy (or a wind-wheel / chime) inside a small cone
  if ((Input.usingPad || Input.usingTouch) && aiming) {   // v7: the same light aim assist on touch
    let best = null, bestA = 0.07;
    cameraForward(_d);
    const cands = G.enemies.filter((e) => !e.dead).map((e) => _p.set(e.pos.x, e.pos.y + e.height * 0.55, e.pos.z).clone()).concat((G.targets || []).filter((t) => !t.done).map((t) => t.pos));
    for (const c of cands) {
      _t.copy(c).sub(cam.position); const dist = _t.length(); if (dist > 45) continue;
      const a = _d.angleTo(_t.normalize()); if (a < bestA) { bestA = a; best = c; }
    }
    if (best) {
      _t.copy(best).sub(cam.position);
      const wy = Math.atan2(-_t.x, -_t.z), wp = Math.atan2(_t.y, Math.hypot(_t.x, _t.z));
      const k = damp(2.2, realDt) * (Math.abs(Input.look.x) + Math.abs(Input.look.y) > 0.0005 ? 1.6 : 0.6);
      Cam.yaw += wrap(wy - Cam.yaw) * k; Cam.pitch += (wp - Cam.pitch) * k;
    }
  }
  Cam.pitch = Math.max(-1.0, Math.min(0.7, Cam.pitch));

  // pivot: follows Joon's head height with a short lag in jumps and flips
  const speed = Math.hypot(p.vel.x, p.vel.z);
  _v.set(p.vel.x, 0, p.vel.z).multiplyScalar(aiming ? 0 : 0.08);
  Cam.lookAhead.lerp(_v, damp(2.5, realDt));
  _t.set(p.pos.x, p.pos.y + 1.45 + Cam.aimK * 0.1, p.pos.z).add(Cam.lookAhead);
  const kxz = damp(aiming ? 30 : 13, realDt), ky = damp(p.onGround ? 10 : 6.5, realDt);
  Cam.pivot.x += (_t.x - Cam.pivot.x) * kxz; Cam.pivot.z += (_t.z - Cam.pivot.z) * kxz; Cam.pivot.y += (_t.y - Cam.pivot.y) * ky;
  if (Cam.pivot.distanceTo(_t) > 6) Cam.pivot.copy(_t);

  // boom distance
  const combat = p.combat || p.staffOut;
  let base = combat ? 2.3 : 2.6 + Math.min(1, speed / 6.4) * 0.3;
  if (G.boss && !G.boss.dead) base = [2.4, 2.4, 3.6, 1.8][Cam.bossPhase] ?? 2.4;
  if (G.camDist) base = G.camDist;
  Cam.focusT -= realDt;
  if (Cam.focusT > 0) base = Cam.focusDist;
  Cam.dist += (base - Cam.dist) * damp(Cam.focusT > 0 ? 6 : 3.5, realDt);
  const dist = THREE.MathUtils.lerp(Cam.dist, 1.9, Cam.aimK);
  const shoulder = THREE.MathUtils.lerp(0.72, 0.78, Cam.aimK) * Math.min(1, Cam.dist / 2.4 + 0.25);
  cameraForward(_d);
  const right = _p.set(Math.cos(Cam.yaw), 0, -Math.sin(Cam.yaw));
  const origin = _v.copy(Cam.pivot).addScaledVector(right, shoulder);
  // collision: from the chest out to the wanted camera spot (rays both ways)
  const back = _d.clone().negate();
  const camWant = origin.clone().addScaledVector(back, dist);
  const chest = _k.set(p.pos.x, p.pos.y + 1.2, p.pos.z);
  const full = chest.distanceTo(camWant);
  const dir = camWant.clone().sub(chest).normalize();
  const solid = World.rayMeshes.concat(G.walls.map((w) => w.mesh));
  ray.set(chest, dir); ray.far = full + 0.3;
  let free = full + 1;
  const h1 = ray.intersectObjects(solid, false); if (h1.length) free = Math.min(free, h1[0].distance - 0.3);
  ray.set(camWant.clone().addScaledVector(dir, 0.3), dir.clone().negate()); ray.far = full + 0.3;
  const h2 = ray.intersectObjects(solid, false); if (h2.length) free = Math.min(free, full + 0.3 - h2[h2.length - 1].distance - 0.3);
  let want = dist;
  if (free < full) want = Math.max(0.45, dist * Math.max(0, free) / full);
  Cam.curDist = want < Cam.curDist ? want : Cam.curDist + (want - Cam.curDist) * damp(4, realDt);
  const sh = Cam.curDist / Math.max(0.01, dist);
  cam.position.copy(Cam.pivot).addScaledVector(right, shoulder * Math.min(1, sh)).addScaledVector(back, Cam.curDist);
  // hit kicks: a quick spring along the hit direction
  _k.set(0, 0, 0);
  for (let i = Cam.kicks.length - 1; i >= 0; i--) {
    const k = Cam.kicks[i]; k.t += realDt;
    const f = k.t < 0.035 ? k.t / 0.035 : Math.exp(-(k.t - 0.035) * 22);
    if (k.t > 0.4) { Cam.kicks.splice(i, 1); continue; }
    _k.addScaledVector(k.d, k.a * f);
  }
  cam.position.add(_k);
  cam.position.add(Shake.offset);
  cam.lookAt(_t.copy(cam.position).add(_d));
  cam.rotateZ(Shake.roll);
  const fov = THREE.MathUtils.lerp(60, 52, Cam.aimK) + (Time.scale < 0.6 ? -4 : 0);
  Cam.fov += (fov - Cam.fov) * damp(10, realDt);
  // coming back from a story shot: blend from the snapshot into the gameplay pose
  if (Cam.ret) {
    const r = Cam.ret; r.t += realDt; const k = ease(Math.min(1, r.t / r.dur));
    cam.position.lerpVectors(r.fromPos, cam.position, k);
    cam.quaternion.slerpQuaternions(r.fromQ, cam.quaternion.clone(), k);
    Cam.fov = THREE.MathUtils.lerp(r.fromFov, Cam.fov, k);
    if (k >= 1) Cam.ret = null;
  }
  if (Math.abs(cam.fov - Cam.fov) > 0.01) { cam.fov = Cam.fov; cam.updateProjectionMatrix(); }
  // bodies right on the lens hide; Joon himself hides under 0.6 m
  for (const e of G.enemies) e.char.root.visible = Math.hypot(e.pos.x - cam.position.x, e.pos.y + 1 - cam.position.y, e.pos.z - cam.position.z) > 0.9;
  const close = cam.position.distanceTo(chest.set(p.pos.x, p.pos.y + 1.2, p.pos.z)) > 0.6;
  p.char.root.visible = close; p.staff.group.visible = close && p.staff.visible && !p.staff.ghost;
  // fade cover slabs between the camera and Joon
  if (Cam.fadeables.length) {
    ray.set(cam.position, chest.clone().sub(cam.position).normalize()); ray.far = cam.position.distanceTo(chest);
    const hits = new Set(ray.intersectObjects(Cam.fadeables, false).map((h) => h.object));
    for (const m of Cam.fadeables) { const k = hits.has(m) ? 0.28 : 1; m.material.opacity += (k - m.material.opacity) * damp(10, realDt); m.material.transparent = m.material.opacity < 0.99; m.material.depthWrite = m.material.opacity > 0.9; }
  }
  syncListener(cam);
  computeAim();
}
function syncListener(cam) { Audio.listener.x = cam.position.x; Audio.listener.y = cam.position.y; Audio.listener.z = cam.position.z; Audio.listener.yaw = Cam.yaw; }

// the point under the reticle: first enemy, target or surface along the centre ray (past the player)
export function computeAim() {
  const cam = G.camera, p = G.player;
  cameraForward(_d);
  const o = cam.position;
  const skip = _t.copy(p.pos).setY(p.pos.y + 1.2).sub(o).dot(_d) + 0.6;
  let best = 120, target = null;
  for (const e of G.enemies) {
    if (e.dead) continue;
    for (const hgt of [0.35, 0.7, 1.05]) {
      _p.set(e.pos.x, e.pos.y + e.height * hgt, e.pos.z).sub(o);
      const tt = _p.dot(_d); if (tt < skip) continue;
      const d2 = _p.lengthSq() - tt * tt, r = e.radius + 0.15;
      if (d2 < r * r && tt < best) { best = tt; target = e; }
    }
  }
  for (const t of G.targets || []) {
    if (t.done) continue;
    _p.copy(t.pos).sub(o); const tt = _p.dot(_d); if (tt < skip) continue;
    if (_p.lengthSq() - tt * tt < (t.r || 0.4) ** 2 && tt < best) { best = tt; target = null; }
  }
  ray.set(_v.copy(o).addScaledVector(_d, skip), _d); ray.far = Math.max(0.01, best - skip);
  const hits = ray.intersectObjects(World.rayMeshes.concat(G.walls.map((w) => w.mesh)), false);
  if (hits.length) { best = skip + hits[0].distance; target = null; }
  if (G.lockTarget && !G.lockTarget.dead && !p.aiming) {
    const e = G.lockTarget; G.aimPoint.set(e.pos.x, e.pos.y + e.height * 0.55, e.pos.z); G.aimTarget = e; return;
  }
  G.aimPoint.copy(o).addScaledVector(_d, best);
  G.aimTarget = target;
  G.aimDist = best;
}
