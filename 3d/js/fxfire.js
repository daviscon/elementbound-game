// v4 (Connor's notes 22 and 26): the inked 3D fire library, in fx3d.js's language.
//  Solid geometry in three flat tones (deep orange body, bright yellow core where it faces you, a dark-red
//  edge), a back-face ink hull, drawn on (it grows out of its source) and eroded away (blotches eat it from
//  the tips down, the ink rim eats with it). Never a glowing particle ball, never a flat card.
//  Pieces: tongue (a lathe teardrop), sphere (fireball / smoke), diamond (embers), plus fx3d's windTube and
//  windRing re-coloured for sweeps and shock rings. Shares fx3d's scene and per-frame update.
//  API (all positions are world Vector3s; everything removes itself):
//   flameTongue(from, dir, {len, width, life})        a jab of flame along dir
//   fireArc(center, yaw, {radius, arc, life, width})  a swept fire arc (kick, whip, fan) round center, facing yaw
//   fireball(pos, {follow, size}) -> {obj, setPos(v), kill()}   a persistent inked fireball for projectiles
//   heldFlame(at(out), {life, size})                    a flickering flame riding a hand/shield (wind-up tells)
//   smokePuff(pos, {size})                              outlined smoke spheres that rise and shrink away
//   embers(pos, {n})                                    small inked diamond sparks
//   burnPatch(pos, {radius, life}) -> {kill(), pos, radius, alive}   flame tongues on a dark scorch
//   flameLine(from, to, {life})                         a line of rising flame pillars
//   fireRing(pos, {radius})                             an inked shock ring in fire tones
import * as THREE from 'three';
import { INK } from './toon.js';
import { onFX3D, fx3dScene, fx3dCamera, windTube, windRing } from './fx3d.js';

const FIRE = { a: 0xf06a1a, b: 0xffd94a, c: 0x9a2214 };
const SMOKE = { a: 0x8d837c, b: 0xbdb3aa, c: 0x5a504e };
const EMBER = { a: 0xffa526, b: 0xfff27a, c: 0xc0381a };
const UP = new THREE.Vector3(0, 1, 0);
const inkCol = new THREE.Color(INK).toArray().map((v) => v.toFixed(3)).join(',');

const VERT = /* glsl */`
  uniform float uInk;
  varying vec3 vN; varying vec3 vView; varying vec3 vW; varying float vY;
  void main() {
    vec3 p = position + normal * uInk;
    vec4 wp = modelMatrix * vec4(p, 1.0); vW = wp.xyz;
    vN = normalize(normalMatrix * normal); vY = uv.y;
    vec4 mv = viewMatrix * wp; vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  uniform vec3 uA, uB, uC; uniform float uInk, uErode, uSeed;
  varying vec3 vN; varying vec3 vView; varying vec3 vW; varying float vY;
  void main() {
    if (uErode > 0.0) {
      float n = sin(vW.x * 6.1 + uSeed) * sin(vW.y * 5.3 - uSeed * 0.7) * sin(vW.z * 6.7 + vW.x * 2.0 + uSeed * 1.3);
      n = n * 0.5 + 0.5;
      if (n * 0.7 + (1.0 - vY) * 0.3 < uErode) discard;   // the tips go first
    }
    if (uInk > 0.0) { gl_FragColor = vec4(${inkCol}, 1.0); return; }
    vec3 n = normalize(vN);
    float face = dot(n, normalize(vView));
    float lit = step(0.0, dot(n, normalize(vec3(-0.45, 0.75, 0.5))));
    vec3 c = face > 0.74 ? uB : (face < 0.3 ? uC : uA);
    if (lit < 0.5 && face <= 0.74) c = mix(c, uC, 0.5);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

// shared geometry (never disposed)
const TONGUE = (() => {
  const pts = [];
  for (let i = 0; i <= 9; i++) { const y = i / 9; pts.push(new THREE.Vector2(Math.max(0.001, Math.pow(Math.sin(Math.PI * Math.min(1, y * 1.05)), 0.75) * (1 - y * 0.5)), y)); }
  return new THREE.LatheGeometry(pts, 9);
})();
const SPHERE = new THREE.IcosahedronGeometry(1, 1);
const DIAMOND = new THREE.OctahedronGeometry(1, 0);

// one inked piece: a body and its back-face hull share the uniforms
function piece(geo, pal = FIRE, ink = 0.09) {
  const u = { uA: { value: new THREE.Color(pal.a) }, uB: { value: new THREE.Color(pal.b) }, uC: { value: new THREE.Color(pal.c) }, uErode: { value: 0 }, uSeed: { value: Math.random() * 10 } };
  const body = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { ...u, uInk: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG }));
  const hull = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { ...u, uInk: { value: ink } }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide }));
  const g = new THREE.Group(); g.add(body); g.add(hull); g.renderOrder = 4;
  body.frustumCulled = hull.frustumCulled = false;
  return { g, u, dispose() { body.material.dispose(); hull.material.dispose(); } };
}

// the live list, ticked by fx3d's update
const live = [];
let hooked = false;
function add(it) {
  if (!hooked) { hooked = true; onFX3D(tick); }
  const sc = fx3dScene(); if (!sc) return it;
  for (const p of it.parts) sc.add(p.g);
  it.t = -(it.delay || 0);
  live.push(it);
  return it;
}
function drop(it) { const sc = fx3dScene(); for (const p of it.parts) { if (sc) sc.remove(p.g); p.dispose(); } }
function tick(dt) {
  for (let i = live.length - 1; i >= 0; i--) {
    const it = live[i]; it.t += dt;
    if (it.t < 0) { for (const p of it.parts) p.g.visible = false; continue; }
    for (const p of it.parts) p.g.visible = true;
    if (it.update(dt, it.t) === false || it.dead) { drop(it); live.splice(i, 1); }
  }
}
const easeOut = (u) => 1 - (1 - u) * (1 - u);
const finite = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
// a safe direction: never a NaN from normalizing a zero vector
const dirOf = (v, fb = UP) => (finite(v) && v.lengthSq() > 1e-8 ? v.clone().normalize() : fb.clone());
const clamp01 = (u) => Math.max(0, Math.min(1, u));

// a single flame tongue on its base point, pointing along dir; grows over `grow` s, holds, erodes over the rest
function tongue(base, dir, o) {
  if (!finite(base)) return null;
  dir = dirOf(dir);
  const p = piece(TONGUE, o.pal || FIRE, o.ink ?? 0.09);
  const len = o.len ?? 1, w = o.width ?? 0.25, life = o.life ?? 0.5, grow = o.grow ?? life * 0.3, flick = o.flicker ?? 0;
  p.g.position.copy(base); p.g.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  const drift = o.drift ? o.drift.clone() : null, ph = Math.random() * 6;
  return add({ parts: [p], delay: o.delay, update(dt, t) {
    const g = clamp01(t / grow), e = easeOut(g);
    const f = flick ? 1 + Math.sin(t * 17 + ph) * flick : 1;
    p.g.scale.set(w * (0.55 + 0.45 * e), Math.max(0.01, len * e * f), w * (0.55 + 0.45 * e));
    if (drift) p.g.position.addScaledVector(drift, dt);
    const er = clamp01((t - life * 0.45) / (life * 0.55));
    p.u.uErode.value = er * 1.02;
    return t < life;
  } });
}

// ---------------------------------------------------------------- the API
// v5 (note 33): a firebending jet, not a blob. It leaves the fist along the strike line and expands fast:
// a bright yellow core tongue inside an orange body, dark-red inked licks round it that curl at the tips (a
// fire-coloured helix wraps the jet), everything motion-stretched and driven forward along the throw, and the
// tips break off into inked smoke puffs as it dies.
const CORE = { a: 0xffd23a, b: 0xfff4a8, c: 0xf29a1e }, EDGE = { a: 0xd2461a, b: 0xf06a1a, c: 0x7a1a10 };
export function flameTongue(from, dir, o = {}) {
  if (!finite(from)) return;
  const d = dirOf(dir, new THREE.Vector3(0, 0, 1)), len = o.len ?? 2.2, w = o.width ?? 0.38, life = o.life ?? 0.45;
  const side = new THREE.Vector3().crossVectors(d, UP); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
  const up = new THREE.Vector3().crossVectors(side, d).normalize();
  const speed = len / Math.max(0.2, life);   // the throw carries it forward
  // the orange body and the yellow core, stretched along the throw
  tongue(from, d, { len, width: w * 0.85, life, grow: Math.min(0.08, life * 0.18), drift: d.clone().multiplyScalar(speed * 0.55) });
  tongue(from.clone().addScaledVector(d, 0.05), d, { len: len * 0.72, width: w * 0.42, life: life * 0.8, grow: Math.min(0.06, life * 0.14), pal: CORE, ink: 0.05, drift: d.clone().multiplyScalar(speed * 0.6) });
  // dark-red licks round it, curling outward and up at the tips, staggered
  const n = o.licks ?? 4;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + Math.random() * 0.6, off = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    const ld = d.clone().addScaledVector(off, 0.3).addScaledVector(UP, 0.12).normalize();
    tongue(from.clone().addScaledVector(off, w * 0.3).addScaledVector(d, len * (0.15 + 0.12 * i)), ld,
      { len: len * (0.38 + Math.random() * 0.15), width: w * 0.42, life: life * 0.85, grow: 0.07, delay: 0.02 + i * 0.025, pal: EDGE,
        drift: d.clone().multiplyScalar(speed * 0.5).addScaledVector(off, 0.9).addScaledVector(UP, 0.7) });
  }
  // a curling lick that wraps the jet (the same tube language as the wind, in fire tones)
  const pts = []; for (let j = 0; j <= 6; j++) pts.push(from.clone().addScaledVector(d, len * 1.05 * j / 6));
  windTube({ points: pts, dur: life * 0.6, radius: w * 0.16, seg: 0.55, curl: w * 0.38, curlGrow: 1.4, turns: 1.6, lit: FIRE.a, shade: EDGE.c, core: CORE.b, coreMix: 1, ink: 0.014 });
  // the tips break off into smoke
  const tip = from.clone().addScaledVector(d, len * 1.05);
  setTimeout(() => smokePuff(tip.addScaledVector(d, speed * life * 0.3).addScaledVector(UP, 0.25), { size: w * 0.7, n: 2 }), life * 700);
  embers(from.clone().addScaledVector(d, len * 0.8), { n: 3, life: life + 0.2 });
}

export function fireArc(center, yaw, o = {}) {
  if (!finite(center) || !Number.isFinite(yaw)) return;
  const r = o.radius ?? 1.6, arc = o.arc ?? 2.2, life = o.life ?? 0.45, w = o.width ?? 0.18, dir = o.dir ?? 1, pts = [], y = o.y ?? 0;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, -(o.roll ?? 0), 'YXZ'));
  for (let i = 0; i <= 14; i++) { const a = (-arc / 2 + arc * i / 14) * dir; pts.push(new THREE.Vector3(Math.sin(a) * r, y + Math.sin(i / 14 * Math.PI) * 0.12, Math.cos(a) * r).applyQuaternion(q).add(center)); }
  // keep it out of the lens
  const cam = fx3dCamera(); if (cam) for (let it = 0; it < 5; it++) { if (!pts.some((p) => p.distanceTo(cam.position) < 1.3)) break; for (const p of pts) p.sub(center).multiplyScalar(0.75).add(center); }
  const col = { lit: FIRE.a, shade: FIRE.c, core: FIRE.b, coreMix: 1, ink: 0.016 };
  windTube({ points: pts, dur: life * 0.7, radius: w, seg: 0.7, ...col });
  windTube({ points: pts.map((p) => p.clone().setY(p.y + w * 1.6)), dur: life * 0.75, delay: 0.03, radius: w * 0.6, seg: 0.6, ...col });
  // tongues lick up behind the sweep
  const n = o.tongues ?? 4;
  for (let i = 0; i < n; i++) {
    const k = Math.round((i + 0.5) / n * 14), p = pts[k];
    tongue(p.clone().setY(p.y - w * 0.5), dirOf(UP.clone().addScaledVector(dirOf(p.clone().sub(center).setY(0)), 0.35)),
      { len: 0.55 + Math.random() * 0.3, width: 0.2, life: life * 0.8, grow: 0.08, delay: life * 0.7 * (i + 0.5) / n * 0.8 });
  }
  embers(pts[14], { n: 3 });
  // v5 (note 33): the leading edge breaks into inked smoke as the sweep dies
  const end = pts[14].clone(); setTimeout(() => smokePuff(end.setY(end.y + 0.3), { size: 0.35, n: 2 }), life * 800);
}

// fireball(pos, {follow}): follow = a Vector3 it tracks every frame (e.g. a projectile's pos), else call setPos
export function fireball(pos, o = {}) {
  const outer = piece(SPHERE, FIRE, 0.1), tails = [0, 1, 2].map(() => piece(TONGUE, FIRE, 0.09));
  const obj = new THREE.Group(); obj.position.copy(pos);
  const parts = [outer, ...tails];
  const last = pos.clone(), vel = new THREE.Vector3(0, 0, 1), _q = new THREE.Quaternion(), back = new THREE.Vector3();
  let killed = false;
  const it = add({ parts, update(dt, t) {
    if (killed) return false;
    if (o.follow) api.setPos(o.follow);
    const s = (o.size ?? 0.34) * (1 + Math.sin(t * 23) * 0.06);
    outer.g.position.copy(obj.position); outer.g.scale.setScalar(s); outer.g.rotation.set(t * 3, t * 5, 0);
    if (vel.lengthSq() < 1e-6) vel.set(0, 0, 1);
    back.copy(vel).multiplyScalar(-1).normalize();
    tails.forEach((p, i) => {
      const a = i / 3 * Math.PI * 2 + t * 4;
      const d = back.clone().add(new THREE.Vector3(Math.cos(a) * 0.35, Math.sin(a) * 0.35 + 0.15, Math.sin(a + 1) * 0.2)).normalize();
      p.g.position.copy(obj.position).addScaledVector(back, -0.05);
      p.g.quaternion.copy(_q.setFromUnitVectors(UP, d));
      const l = 0.75 + 0.2 * Math.sin(t * 19 + i * 2);
      p.g.scale.set(0.26, l, 0.26);
    });
    return true;
  } });
  const api = {
    obj,
    setPos(v) { if (!finite(v)) return; const d = v.clone().sub(last); if (d.lengthSq() > 1e-6) vel.lerp(d.normalize(), 0.5); last.copy(v); obj.position.copy(v); },
    kill() { if (killed) return; killed = true; it.dead = true; smokePuff(obj.position, { size: 0.45 }); embers(obj.position, { n: 4 }); },
  };
  return api;
}

// a flame held in a hand or on a shield for a wind-up tell: at(out) fills the point each frame (return false to end)
export function heldFlame(at, o = {}) {
  const life = o.life ?? 0.6, size = o.size ?? 0.5, p = piece(TONGUE, FIRE, 0.09), _p = new THREE.Vector3();
  return add({ parts: [p], update(dt, t) {
    if (at(_p) === false || !finite(_p)) return false;
    const g = easeOut(clamp01(t / 0.15)), f = 1 + Math.sin(t * 21) * 0.15;
    p.g.position.copy(_p); p.g.rotation.set(Math.sin(t * 9) * 0.15, 0, Math.cos(t * 11) * 0.15);
    p.g.scale.set(size * 0.42 * g, size * g * f * (1 + t / life * 0.4), size * 0.42 * g);
    p.u.uErode.value = clamp01((t - life) / 0.15) * 1.02;
    return t < life + 0.15;
  } });
}

export function smokePuff(pos, o = {}) {
  if (!finite(pos)) return;
  const size = o.size ?? 0.5, n = o.n ?? 3;
  for (let i = 0; i < n; i++) {
    const p = piece(SPHERE, SMOKE, 0.08), off = new THREE.Vector3((Math.random() - 0.5) * size, Math.random() * size * 0.5, (Math.random() - 0.5) * size);
    const life = 0.7 + Math.random() * 0.3, s0 = size * (0.45 + Math.random() * 0.3), rise = 0.7 + Math.random() * 0.6;
    p.g.position.copy(pos).add(off);
    add({ parts: [p], delay: i * 0.04, update(dt, t) {
      const u = t / life; p.g.position.y += rise * dt;
      p.g.scale.setScalar(Math.max(0.001, s0 * (u < 0.2 ? 0.5 + u * 2.5 : 1 - (u - 0.2) / 0.8)));
      return u < 1;
    } });
  }
}

export function embers(pos, o = {}) {
  if (!finite(pos)) return;
  const n = o.n ?? 5;
  for (let i = 0; i < n; i++) {
    const p = piece(DIAMOND, EMBER, 0.28), life = (o.life ?? 0.6) * (0.7 + Math.random() * 0.6);
    const v = new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3);
    p.g.position.copy(pos);
    add({ parts: [p], update(dt, t) {
      const u = t / life; v.y -= 4 * dt; p.g.position.addScaledVector(v, dt);
      const s = 0.07 * (u < 0.5 ? 1 : 1 - (u - 0.5) * 2);
      p.g.scale.set(s * 0.6, s * 1.4, s * 0.6); p.g.rotation.y += dt * 8;
      return u < 1;
    } });
  }
}

const SCORCH = new THREE.MeshBasicMaterial({ color: 0x2b1a16, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
export function burnPatch(pos, o = {}) {
  if (!finite(pos)) return { kill() {}, pos: new THREE.Vector3(), radius: 0, alive: false };
  const radius = o.radius ?? 1.3, life = o.life ?? 3;
  // a ragged dark scorch
  const geo = new THREE.CircleGeometry(radius, 18), a = geo.attributes.position;
  for (let i = 1; i < a.count; i++) { const k = 0.8 + Math.random() * 0.3; a.setXY(i, a.getX(i) * k, a.getY(i) * k); }
  geo.rotateX(-Math.PI / 2);
  const disc = new THREE.Mesh(geo, SCORCH); const dg = new THREE.Group(); dg.add(disc); dg.position.copy(pos).setY(pos.y + 0.03);
  const scorch = { g: dg, u: null, dispose() { geo.dispose(); } };
  const n = Math.min(7, Math.max(3, Math.round(radius * 3.5))), flames = [];
  for (let i = 0; i < n; i++) {
    const a2 = i / n * Math.PI * 2 + Math.random() * 0.6, rr = radius * (i === 0 ? 0 : 0.35 + Math.random() * 0.4);
    const p = piece(TONGUE, FIRE, 0.09); p.g.position.set(pos.x + Math.cos(a2) * rr, pos.y + 0.02, pos.z + Math.sin(a2) * rr);
    flames.push({ p, len: 0.5 + Math.random() * 0.45, w: 0.2 + Math.random() * 0.08, ph: Math.random() * 6, d: i * 0.05 });
  }
  const h = { pos: pos.clone(), radius, alive: true, end: life, kill() { h.end = Math.min(h.end, it.t + 0.01); } };
  const mid = new THREE.Vector3();
  const it = add({ parts: [scorch, ...flames.map((f) => f.p)], update(dt, t) {
    const out = clamp01((t - h.end) / 0.45), cam = fx3dCamera();
    for (const f of flames) {
      const g = easeOut(clamp01((t - f.d) / 0.25)), fl = 1 + Math.sin(t * 13 + f.ph) * 0.18 + Math.sin(t * 29 + f.ph * 2) * 0.07;
      // v6: a pushed-in brawl camera never fills the frame with fire: inside 3.5 m of the lens a tongue shrinks and
      // erodes away, gone by 1.2 m (measured to the middle of the tongue)
      let nr = 1;
      if (cam) { mid.copy(f.p.g.position); mid.y += f.len * 0.5; const u = clamp01((mid.distanceTo(cam.position) - 1.2) / 2.3); nr = u * u; }
      f.p.g.scale.set(f.w * (0.35 + 0.65 * nr), Math.max(0.01, f.len * g * fl * (1 - out * 0.5) * nr), f.w * (0.35 + 0.65 * nr));
      f.p.g.rotation.set(Math.sin(t * 5 + f.ph) * 0.12, 0, Math.cos(t * 6 + f.ph) * 0.12);
      f.p.u.uErode.value = Math.max(out, 1 - nr) * 1.02;
      f.p.g.visible = nr > 0.04;
    }
    dg.scale.setScalar(1 - out * 0.6);
    if (t > h.end + 0.45) { h.alive = false; return false; }
    if (t > h.end) h.alive = false;
    return true;
  } });
  return h;
}

export function flameLine(from, to, o = {}) {
  if (!finite(from) || !finite(to)) return;
  const life = o.life ?? 0.9, d = to.clone().sub(from), dist = d.length();
  const n = Math.max(2, Math.min(10, Math.round(dist / 0.9)));
  for (let i = 0; i < n; i++) {
    const p = from.clone().addScaledVector(d, n === 1 ? 0 : i / (n - 1));
    p.x += (Math.random() - 0.5) * 0.25; p.z += (Math.random() - 0.5) * 0.25;
    tongue(p, UP.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2)).normalize(),
      { len: (o.height ?? 1.8) * (0.8 + Math.random() * 0.4), width: o.width ?? 0.42, life, grow: 0.14, delay: i * (o.stagger ?? 0.04), flicker: 0.08 });
  }
  smokePuff(to.clone().setY(to.y + 1.2), { size: 0.4, n: 2 });
}

export function fireRing(pos, o = {}) {
  if (!finite(pos)) return;
  const r = o.radius ?? 2;
  windRing(pos.clone().setY(pos.y + 0.12), UP, { r: 0.2, r1: r, travel: 0, dur: 0.38, tube: 0.07, color: FIRE.a });
  windRing(pos.clone().setY(pos.y + 0.14), UP, { r: 0.15, r1: r * 0.72, travel: 0.25, dur: 0.3, tube: 0.05, color: FIRE.b });
  embers(pos.clone().setY(pos.y + 0.2), { n: 4 });
}
