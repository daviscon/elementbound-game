// v8 (note 44): firebending done properly. Connor: "the fire looks lazy, especially the stuff on the floor and the
// fire circles". Every flame mesh now uses the cel-fire shader (js/fx-fire.js): scrolling noise erodes it from its
// edges so it licks, splits and breaks off; three hard bands (dark-red rim, orange body, yellow-white core); an
// ink line that follows the eroded edge; a wobble that rises along the flame; and it all steps on twos (12 fps).
// Floor fire and fire circles are generated cel flipbooks (assets/fx/fire-*.png) on cards, over a scorched decal
// and a shader ring wall. Every area gets a 0.4 s tell first (fireTell: an inked ring drawing on, heat lines,
// embers gathering). Every flame sheds inked smoke puffs and a few embers. No glow, no additive blending.
//  API (world Vector3s; everything removes itself):
//   flameTongue(from, dir, {len, width, life, licks})   a jab of flame leaving the fist along dir
//   fireArc(center, yaw, {radius, arc, life, width})     a swept fire arc (kick, whip, fan) round center
//   fireball(pos, {follow, size}) -> {obj, setPos(v), kill()}
//   heldFlame(at(out), {life, size})                     a flame riding a hand or shield (wind-up tells)
//   smokePuff(pos, {size, n}) / embers(pos, {n})
//   burnPatch(pos, {radius, life}) -> {kill(), pos, radius, alive}   a burning patch on the floor
//   flameLine(from, to, {life}) / firePillar(pos, {height, life})
//   fireRing(pos, {radius})                              a ring of flame that erupts, holds and collapses
//   fireTell(pos, {radius, dur, delay})                  the 0.4 s ground tell before an area
import * as THREE from 'three';
import { onFX3D, fx3dScene, fx3dCamera, windTube, windRing } from './fx3d.js';
import { celFire, card, scorch, tellRing, TONGUE, WALL, BALL, PAL, FireClock, STEP, tickClock, lowFX, preloadFireSheets } from './fx-fire.js';
import { Audio } from './audio.js';

const UP = new THREE.Vector3(0, 1, 0);
const sfx = (name, at, o = {}) => { try { Audio.play(name, { at, ...o }); } catch { /* audio not ready */ } };

// ------------------------------------------------------------------ the live list (stepped on twos)
const live = [];
let hooked = false;
function add(it) {
  if (!hooked) { hooked = true; onFX3D(tick); preloadFireSheets(); }
  const sc = fx3dScene(); if (!sc) return it;
  for (const o of it.objs) { sc.add(o); o.visible = false; }
  it.t = -(it.delay || 0); it.ts = it.t; it.started = false;
  live.push(it);
  return it;
}
function drop(it) {
  const sc = fx3dScene();
  for (const o of it.objs) { if (sc) sc.remove(o); o.traverse((m) => { if (m.material) m.material.dispose(); }); }
  if (it.geos) for (const g of it.geos) g.dispose();
}
function tick(dt) {
  tickClock(dt);
  for (let i = live.length - 1; i >= 0; i--) {
    const it = live[i]; it.t += dt;
    if (it.t < 0) continue;
    if (!it.started) { it.started = true; it.ts = -1; for (const o of it.objs) o.visible = true; if (it.start) it.start(); }
    // on twos: the shape only changes on the shared 12 fps beat (`every` runs each frame, e.g. to ride a projectile)
    const ts = Math.floor(it.t / STEP) * STEP;
    if (it.every) it.every(dt, it.t);
    if (ts > it.ts) { const sdt = it.ts < 0 ? 0 : ts - it.ts; it.ts = ts; if (it.update(sdt, ts) === false) it.dead = true; }
    if (it.dead) { drop(it); live.splice(i, 1); }
  }
}
const easeOut = (u) => 1 - (1 - u) * (1 - u);
const finite = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const dirOf = (v, fb = UP) => (finite(v) && v.lengthSq() > 1e-8 ? v.clone().normalize() : fb.clone());
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const rnd = (a, b) => a + Math.random() * (b - a);
// near the lens a flame shrinks and erodes away (gone by 1.2 m), so a pushed-in camera never fills with fire
const _m = new THREE.Vector3();
function lensFade(p, lift = 0) { const cam = fx3dCamera(); if (!cam) return 1; _m.copy(p); _m.y += lift; const u = clamp01((_m.distanceTo(cam.position) - 1.2) / 2.3); return u * u; }

// one cel-fire tongue on its base point along dir: drawn on over `grow`, holds, erodes from the tip down
function tongue(base, dir, o) {
  if (!finite(base)) return null;
  dir = dirOf(dir);
  const F = celFire({ pal: o.pal, wob: o.wob ?? 0.16, coreW: o.coreW, freq: [4.6, 3.4, 4.6], scroll: 3.0 });
  const mesh = new THREE.Mesh(TONGUE, F.mat); mesh.frustumCulled = false; mesh.renderOrder = 4;
  const len = o.len ?? 1, w = o.width ?? 0.25, life = o.life ?? 0.5, grow = o.grow ?? life * 0.3, flick = o.flicker ?? 0.08;
  mesh.position.copy(base); mesh.quaternion.setFromUnitVectors(UP, dir);
  const drift = o.drift ? o.drift.clone() : null, ph = Math.random() * 6, bend = o.bend ? o.bend.clone() : null;
  return add({ objs: [mesh], delay: o.delay, update(dt, t) {
    const e = easeOut(clamp01(t / grow)), f = 1 + Math.sin(t * 17 + ph) * flick;
    const nr = o.lens === false ? 1 : lensFade(mesh.position, len * 0.5);
    mesh.scale.set(w * (0.5 + 0.5 * e) * (0.4 + 0.6 * nr), Math.max(0.01, len * e * f * nr), w * (0.5 + 0.5 * e) * (0.4 + 0.6 * nr));
    if (drift) { mesh.position.addScaledVector(drift, dt); drift.multiplyScalar(Math.pow(0.12, dt)); }
    if (bend) { const q = new THREE.Quaternion().setFromUnitVectors(UP, dirOf(dir.clone().addScaledVector(bend, clamp01(t / life)))); mesh.quaternion.copy(q); }
    F.u.uTime.value = FireClock.ts;
    F.u.uErode.value = Math.max((o.bold ? 0.0 : 0.07) + clamp01((t - life * (o.bold ? 0.45 : 0.35)) / (life * (o.bold ? 0.55 : 0.65))), 1 - nr);   // licking from the first frame
    return t < life;
  } });
}

// ------------------------------------------------------------------ jabs, kicks and held flames
// a firebending jet: it leaves the fist along the strike line and expands fast: an orange body with a hot core, dark
// licks curling off it, everything carried forward by the throw; it splits and breaks into smoke at the tips
export function flameTongue(from, dir, o = {}) {
  if (!finite(from)) return;
  const d = dirOf(dir, new THREE.Vector3(0, 0, 1)), len = o.len ?? 2.2, w = o.width ?? 0.38, life = o.life ?? 0.45;
  const side = new THREE.Vector3().crossVectors(d, UP); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
  const up = new THREE.Vector3().crossVectors(side, d).normalize();
  const speed = len / Math.max(0.2, life);
  tongue(from, d, { len, width: w * 1.2, life, grow: Math.min(0.08, life * 0.2), drift: d.clone().multiplyScalar(speed * 0.9), wob: 0.2, bold: true });
  tongue(from.clone().addScaledVector(d, 0.05), d, { len: len * 0.7, width: w * 0.5, life: life * 0.8, grow: Math.min(0.06, life * 0.15), pal: PAL.core, coreW: 0.3, drift: d.clone().multiplyScalar(speed * 0.95) });
  const n = lowFX() ? 2 : (o.licks ?? 4);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + Math.random() * 0.6, off = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    const ld = d.clone().addScaledVector(off, 0.35).addScaledVector(UP, 0.15).normalize();
    tongue(from.clone().addScaledVector(off, w * 0.3).addScaledVector(d, len * (0.15 + 0.12 * i)), ld,
      { len: len * rnd(0.35, 0.5), width: w * 0.45, life: life * 0.85, grow: 0.08, delay: 0.02 + i * 0.03, pal: PAL.edge,
        drift: d.clone().multiplyScalar(speed * 0.7).addScaledVector(off, 1.1).addScaledVector(UP, 0.8), bend: UP.clone().multiplyScalar(0.8) });
  }
  // the curl that wraps the jet stays the wind's tube language, in fire tones
  const pts = []; for (let j = 0; j <= 6; j++) pts.push(from.clone().addScaledVector(d, len * 1.05 * j / 6));
  windTube({ points: pts, dur: life * 0.6, radius: w * 0.14, seg: 0.55, curl: w * 0.4, curlGrow: 1.4, turns: 1.6, lit: 0xf2701e, shade: 0x7a1a10, core: 0xffe98a, coreMix: 1, ink: 0.014 });
  const tip = from.clone().addScaledVector(d, len * 1.1);
  smokePuff(tip.clone().addScaledVector(UP, 0.2), { size: w * 1.6, n: 1, delay: life * 0.65 });
  embers(from.clone().addScaledVector(d, len * 0.8), { n: lowFX() ? 2 : 3, life: life + 0.25 });
  if (o.sound !== false) sfx('fireJabWhoosh', from, { rate: rnd(0.92, 1.12), vol: 0.8 });
}

export function fireArc(center, yaw, o = {}) {
  if (!finite(center) || !Number.isFinite(yaw)) return;
  const r = o.radius ?? 1.6, arc = o.arc ?? 2.2, life = o.life ?? 0.45, w = o.width ?? 0.18, dir = o.dir ?? 1, pts = [], y = o.y ?? 0;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, -(o.roll ?? 0), 'YXZ'));
  for (let i = 0; i <= 14; i++) { const a = (-arc / 2 + arc * i / 14) * dir; pts.push(new THREE.Vector3(Math.sin(a) * r, y + Math.sin(i / 14 * Math.PI) * 0.12, Math.cos(a) * r).applyQuaternion(q).add(center)); }
  const cam = fx3dCamera(); if (cam) for (let it = 0; it < 5; it++) { if (!pts.some((p) => p.distanceTo(cam.position) < 1.3)) break; for (const p of pts) p.sub(center).multiplyScalar(0.75).add(center); }
  const col = { lit: 0xf2701e, shade: 0xa8241a, core: 0xffe98a, coreMix: 1, ink: 0.016 };
  windTube({ points: pts, dur: life * 0.7, radius: w * 0.6, seg: 0.7, ...col });
  // the arc is a smear of cel-fire: tongues laid along the sweep, each born as the leading edge passes, trailing
  // back along the arc and licking up, then breaking off into smoke
  const n = lowFX() ? 7 : 14, dur = life * 0.7;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n, k = Math.min(13, Math.floor(f * 14)), p = pts[k].clone().lerp(pts[k + 1], f * 14 - k);
    const tang = pts[k + 1].clone().sub(pts[k]).normalize();
    tongue(p, dirOf(tang.clone().multiplyScalar(-1).addScaledVector(UP, 0.55)),
      { len: rnd(0.8, 1.1) * Math.min(1.3, r / 1.8), width: 0.42, life: life * 0.7, grow: 0.05, delay: dur * f * 0.9, wob: 0.22,
        pal: i % 3 === 1 ? PAL.edge : PAL.fire, drift: UP.clone().multiplyScalar(0.7), bend: UP.clone().multiplyScalar(0.9) });
  }
  embers(pts[14], { n: 3 });
  smokePuff(pts[14].clone().setY(pts[14].y + 0.3), { size: 0.6, n: 1, delay: life * 0.75 });
}

export function fireball(pos, o = {}) {
  const size = o.size ?? 0.34;
  const F = celFire({ wob: 0.08, tip: 0.0, freq: [2.6, 2.6, 2.6], scroll: 3.5, coreW: 0.3 });
  F.u.uTip.value = 0.25; F.u.uErode.value = -0.22;   // a solid ball: only its rim licks
  const ball = new THREE.Mesh(BALL, F.mat); ball.frustumCulled = false; ball.renderOrder = 4;
  const tails = [0, 1, 2].map(() => { const T = celFire({ wob: 0.18 }); const m = new THREE.Mesh(TONGUE, T.mat); m.frustumCulled = false; m.renderOrder = 4; return { m, T }; });
  const obj = new THREE.Group(); obj.position.copy(pos);
  const last = pos.clone(), vel = new THREE.Vector3(0, 0, 1), _q = new THREE.Quaternion(), back = new THREE.Vector3();
  let killed = false, puffT = 0;
  const it = add({ objs: [ball, ...tails.map((t) => t.m)],
    every() { if (o.follow) api.setPos(o.follow); ball.position.copy(obj.position); for (const t of tails) t.m.position.copy(obj.position); },
    update(dt, t) {
      if (killed) return false;
      ball.scale.setScalar(size * (1 + Math.sin(t * 23) * 0.07)); ball.rotation.set(t * 3, t * 5, 0);
      F.u.uTime.value = FireClock.ts;
      if (vel.lengthSq() < 1e-6) vel.set(0, 0, 1);
      back.copy(vel).multiplyScalar(-1).normalize();
      tails.forEach((p, i) => {
        const a = i / 3 * Math.PI * 2 + t * 4;
        const d = back.clone().add(new THREE.Vector3(Math.cos(a) * 0.35, Math.sin(a) * 0.35 + 0.2, Math.sin(a + 1) * 0.2)).normalize();
        p.m.quaternion.copy(_q.setFromUnitVectors(UP, d));
        p.m.scale.set(size * 0.8, size * (2.2 + 0.6 * Math.sin(t * 19 + i * 2)), size * 0.8);
        p.T.u.uTime.value = FireClock.ts;
      });
      // it sheds a puff of inked smoke behind it as it flies
      puffT -= dt; if (puffT <= 0 && t > 0.1) { puffT = lowFX() ? 0.25 : 0.14; smokePuff(obj.position.clone().addScaledVector(back, size * 2.5), { size: size * 1.4, n: 1, rise: 0.4 }); }
      return true;
    } });
  const api = {
    obj,
    setPos(v) { if (!finite(v)) return; const d = v.clone().sub(last); if (d.lengthSq() > 1e-6) vel.lerp(d.normalize(), 0.5); last.copy(v); obj.position.copy(v); },
    kill() { if (killed) return; killed = true; it.dead = true; smokePuff(obj.position, { size: size * 2.4, n: 2 }); embers(obj.position, { n: 4 }); },
  };
  return api;
}

export function heldFlame(at, o = {}) {
  const life = o.life ?? 0.6, size = o.size ?? 0.5, F = celFire({ wob: 0.22 }), _p = new THREE.Vector3();
  const mesh = new THREE.Mesh(TONGUE, F.mat); mesh.frustumCulled = false; mesh.renderOrder = 4;
  let ended = false;
  return add({ objs: [mesh],
    every() { if (at(_p) === false || !finite(_p)) ended = true; else mesh.position.copy(_p); },
    update(dt, t) {
      if (ended) return false;
      const g = easeOut(clamp01(t / 0.15)), f = 1 + Math.sin(t * 21) * 0.15;
      mesh.rotation.set(Math.sin(t * 9) * 0.15, 0, Math.cos(t * 11) * 0.15);
      mesh.scale.set(size * 0.45 * g, size * g * f * (1 + t / life * 0.4), size * 0.45 * g);
      F.u.uTime.value = FireClock.ts; F.u.uErode.value = clamp01((t - life) / 0.15);
      return t < life + 0.15;
    } });
}

// ------------------------------------------------------------------ smoke and embers (generated flipbooks)
export function smokePuff(pos, o = {}) {
  if (!finite(pos)) return;
  const size = o.size ?? 0.5, n = lowFX() ? 1 : (o.n ?? 2);
  for (let i = 0; i < n; i++) {
    const s = size * rnd(1.3, 1.9), C = card('smoke', { bill: 2, w: s, h: s, anchor: 'center' });
    const life = rnd(0.75, 1.05), rise = (o.rise ?? 0.9) * rnd(0.7, 1.2), sway = rnd(-0.3, 0.3);
    C.m.position.copy(pos).add(new THREE.Vector3(rnd(-0.5, 0.5) * size, rnd(0, 0.4) * size, rnd(-0.5, 0.5) * size));
    add({ objs: [C.m], delay: (o.delay ?? 0) + i * 0.06, update(dt, t) {
      const u = t / life; C.m.position.y += rise * dt; C.m.position.x += sway * dt;
      C.u.uFrame.value = Math.min(7, u * 8); C.u.uCut.value = clamp01((u - 0.6) / 0.4);
      return u < 1;
    } });
  }
}

export function embers(pos, o = {}) {
  if (!finite(pos)) return;
  const n = lowFX() ? Math.ceil((o.n ?? 5) / 2) : (o.n ?? 5);
  for (let i = 0; i < n; i++) {
    const s = rnd(0.13, 0.2), C = card('ember', { bill: 2, w: s, h: s, anchor: 'center' }), life = (o.life ?? 0.6) * rnd(0.7, 1.3);
    const v = o.vel ? o.vel.clone().add(new THREE.Vector3(rnd(-0.4, 0.4), rnd(-0.2, 0.4), rnd(-0.4, 0.4))) : new THREE.Vector3(rnd(-1.5, 1.5), rnd(1.5, 4), rnd(-1.5, 1.5));
    C.m.position.copy(pos);
    add({ objs: [C.m], delay: o.delay, update(dt, t) {
      const u = t / life; v.y -= (o.grav ?? 4) * dt; C.m.position.addScaledVector(v, dt);
      C.u.uFrame.value = Math.min(7, u * 8);
      return u < 1;
    } });
  }
}

// ------------------------------------------------------------------ the floor: burning patches
// a ring of generated ground-fire cards (cylindrical billboards, each its own phase of the loop) round a centre
// card, over a scorched decal that keeps smouldering and erodes away after the flames go; it sheds smoke and embers
export function burnPatch(pos, o = {}) {
  if (!finite(pos)) return { kill() {}, pos: new THREE.Vector3(), radius: 0, alive: false };
  const radius = o.radius ?? 1.3, life = o.life ?? 3;
  const S = scorch(radius * 1.15); S.m.position.copy(pos).setY(pos.y + 0.03);
  const n = Math.max(3, Math.round(radius * (lowFX() ? 3 : 5.5))), cards = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2 + rnd(-0.3, 0.3), rr = i === n ? 0 : radius * rnd(0.45, 0.72);
    const big = i === n, w = radius * (big ? 1.25 : rnd(0.7, 0.95)), h = w * rnd(0.75, 0.95);
    const C = card('ground', { bill: 1, w, h }); C.m.position.set(pos.x + Math.cos(a) * rr, pos.y + 0.01, pos.z + Math.sin(a) * rr);
    cards.push({ C, w, h, ph: Math.floor(Math.random() * 8), d: i * 0.03, spd: rnd(10, 13) });
  }
  const h = { pos: pos.clone(), radius, alive: true, end: life, kill() { h.end = Math.min(h.end, it.ts + 0.01); } };
  let puffT = 0.3, emberT = 0.2;
  const it = add({ objs: [S.m, ...cards.map((c) => c.C.m)],
    start() { sfx('fireIgnite', pos, { vol: 0.8 }); sfx('fireCrackle', pos, { vol: 0.7, delay: 0.1 }); },
    update(dt, t) {
      const out = clamp01((t - h.end) / 0.5);
      for (const c of cards) {
        const g = easeOut(clamp01((t - c.d) / 0.2)), nr = lensFade(c.C.m.position, c.h * 0.5);
        c.C.u.uSize.value.set(c.w * (0.6 + 0.4 * g), c.h * g * (1 - out * 0.4) * nr);
        c.C.u.uFrame.value = (c.ph + Math.floor(t * c.spd)) % 8;
        c.C.u.uCut.value = Math.max(out, 1 - nr);
        c.C.m.visible = nr > 0.04 && g > 0;
      }
      // the scorch outlives the flames by a beat, then erodes
      S.u.uCut.value = clamp01((t - h.end - 0.3) / 0.6);
      if (t < h.end) {
        puffT -= dt; if (puffT <= 0) { puffT = lowFX() ? 0.9 : rnd(0.4, 0.6); smokePuff(pos.clone().add(new THREE.Vector3(rnd(-0.5, 0.5) * radius, radius * 0.9, rnd(-0.5, 0.5) * radius)), { size: radius * 0.45, n: 1, rise: 1.1 }); }
        emberT -= dt; if (emberT <= 0) { emberT = lowFX() ? 0.6 : 0.3; embers(pos.clone().add(new THREE.Vector3(rnd(-0.5, 0.5) * radius, 0.4, rnd(-0.5, 0.5) * radius)), { n: 1, vel: new THREE.Vector3(0, 2.6, 0), grav: 1.5, life: 0.8 }); }
      }
      if (t > h.end) h.alive = false;
      return t < h.end + 0.95;
    } });
  return h;
}

// ------------------------------------------------------------------ pillars and lines
// a column of flame: the generated pillar flipbook on a standing card, with a cel-fire tongue as its solid core
export function firePillar(pos, o = {}) {
  if (!finite(pos)) return;
  const H = o.height ?? 2.6, life = o.life ?? 0.65, W = H * 0.95;
  const C = card('pillar', { bill: 1, w: W, h: H * 1.25 });
  C.m.position.copy(pos);
  add({ objs: [C.m], delay: o.delay, start() { if (o.sound !== false) sfx('fireRoar', pos, { vol: 0.7, rate: rnd(0.95, 1.1) }); }, update(dt, t) {
    const u = t / life, nr = lensFade(pos, H * 0.5);
    C.u.uFrame.value = Math.min(7, u * 8); C.u.uCut.value = 1 - nr; C.m.visible = nr > 0.04;
    return u < 1;
  } });
  tongue(pos, UP, { len: H * 0.3, width: H * 0.12, life: life * 0.5, grow: 0.06, delay: (o.delay ?? 0) + 0.02, wob: 0.2 });   // a solid cel-fire root at its base
  smokePuff(pos.clone().setY(pos.y + H * 0.9), { size: H * 0.2, n: 1, delay: (o.delay ?? 0) + life * 0.6, rise: 1.4 });
  embers(pos.clone().setY(pos.y + H * 0.5), { n: 3, delay: (o.delay ?? 0) + 0.1 });
}

export function flameLine(from, to, o = {}) {
  if (!finite(from) || !finite(to)) return;
  const life = o.life ?? 0.9, d = to.clone().sub(from), dist = d.length();
  const n = Math.max(2, Math.min(lowFX() ? 6 : 10, Math.round(dist / 0.9)));
  for (let i = 0; i < n; i++) {
    const p = from.clone().addScaledVector(d, i / (n - 1));
    p.x += rnd(-0.12, 0.12); p.z += rnd(-0.12, 0.12);
    firePillar(p, { height: (o.height ?? 2.2) * rnd(0.85, 1.15), life: life * 0.75, delay: i * (o.stagger ?? 0.04), sound: i === 0 });
  }
}

// ------------------------------------------------------------------ fire circles
// a ring of flipbook cards bursting up round the circumference, a cel-fire shader WALL that erupts, holds and
// collapses (eroding from the top), and a dust shock ring rolling out along the ground
export function fireRing(pos, o = {}) {
  if (!finite(pos)) return;
  if (o.delay > 0) { const p = pos.clone(); add({ objs: [], delay: o.delay, update() { fireRing(p, { ...o, delay: 0 }); return false; } }); return; }
  const r = o.radius ?? 2, life = o.life ?? 0.75, wallH = Math.min(0.95, 0.4 + r * 0.16);
  // noise in the wall's unit space: about one tongue per 0.45 m of circumference, licking up the top 60%
  const F = celFire({ wob: 0.08, tip: 0.52, face: 0, freq: [Math.max(2.5, r * 2.6), 2.6, Math.max(2.5, r * 2.6)], scroll: 3.0, coreW: 0.55 });
  const wall = new THREE.Mesh(WALL, F.mat); wall.frustumCulled = false; wall.renderOrder = 4;
  wall.position.copy(pos).setY(pos.y + 0.02);
  const n = Math.max(5, Math.round(r * (lowFX() ? 2.5 : 4.5))), cards = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rnd(-0.15, 0.15), w = Math.max(0.7, r * 0.75) * rnd(0.85, 1.1);
    const C = card('burst', { bill: 1, w, h: w * rnd(0.95, 1.2) });
    C.m.position.set(pos.x + Math.cos(a) * r, pos.y + 0.01, pos.z + Math.sin(a) * r);
    cards.push({ C, d: rnd(0, 0.06) });
  }
  add({ objs: [wall, ...cards.map((c) => c.C.m)], start() { sfx('fireRingBurst', pos, { vol: 0.8, rate: rnd(0.95, 1.08) }); }, update(dt, t) {
    const u = t / life;
    // erupt (0.12 s), hold, collapse: the wall grows, then erodes from the top down
    const g = easeOut(clamp01(t / 0.12));
    wall.scale.set(r * (0.75 + 0.25 * g), wallH * g * (1 + Math.sin(t * 25) * 0.04), r * (0.75 + 0.25 * g));
    F.u.uTime.value = FireClock.ts; F.u.uErode.value = 0.12 + clamp01((u - 0.4) / 0.6);   // a little eaten even at its height, so it reads as tongues
    for (const c of cards) { const k = clamp01((t - c.d) / (life - c.d)); c.C.u.uFrame.value = Math.min(7, k * 8); c.C.u.uCut.value = clamp01((k - 0.85) / 0.15); }
    return u < 1;
  } });
  // the dust shock ring, and smoke where the wall dies
  windRing(pos.clone().setY(pos.y + 0.08), UP, { r: r * 0.5, r1: r * 1.45, travel: 0, dur: 0.42, tube: 0.035 + r * 0.008, color: 0xcdb48e });
  const k = lowFX() ? 2 : Math.min(5, Math.round(r * 1.5));
  for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2 + rnd(0, 1); smokePuff(pos.clone().add(new THREE.Vector3(Math.cos(a) * r, wallH * 0.8, Math.sin(a) * r)), { size: 0.35 + r * 0.08, n: 1, delay: life * 0.55 }); }
  embers(pos.clone().setY(pos.y + 0.3), { n: lowFX() ? 3 : 6, life: 0.8 });
}

// ------------------------------------------------------------------ the tell (0.4 s before any area)
// an inked ring draws itself on round the area, heat lines waver inside it, and embers gather in from the edge
export function fireTell(pos, o = {}) {
  if (!finite(pos)) return;
  const r = o.radius ?? 1.6, dur = o.dur ?? 0.4;
  const T = tellRing(r); T.m.position.copy(pos).setY(pos.y + 0.04);
  add({ objs: [T.m], delay: o.delay, update(dt, t) {
    const u = t / dur;
    T.u.uDraw.value = clamp01(u * 1.6); T.u.uTime.value = FireClock.ts; T.u.uCut.value = clamp01((u - 0.9) / 0.15);
    return u < 1.05;
  } });
  const n = lowFX() ? 5 : Math.min(12, Math.round(4 + r * 3));
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rnd(-0.2, 0.2), at = pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.1, Math.sin(a) * r));
    const v = pos.clone().sub(at).setY(0).multiplyScalar(0.85 / dur); v.y = rnd(0.6, 1.4);
    embers(at, { n: 1, vel: v, grav: 0, life: dur * rnd(0.8, 1.0), delay: (o.delay ?? 0) + rnd(0, dur * 0.25) });
  }
  if (o.sound !== false) sfx('fireIgnite', pos, { vol: 0.45, rate: 1.3, delay: o.delay ?? 0 });
}
