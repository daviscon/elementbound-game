// Effects, v2: hand-drawn cel flipbooks (assets/fx/fx3d-*.png, 8 frames of 384 px, ink edges, flat colour)
// as camera-facing billboards (flip) or as quads oriented in the world (flipQuad: the gust cone from the
// palms, the staff smear in the swing plane), thin white ribbons from the staff tip, inked brush rings for
// ground markers, rock debris, camera shake (trauma), hit-stop and slow-mo.
// The old toon particles (emit) remain only for the parked fire/water/earth moves; no reachable v2 move
// uses particle balls or translucent circles.
import * as THREE from 'three';
import { toon, addOutline, INK } from './toon.js';
import { tex } from './assets.js';

let scene, camera;
export const Time = { scale: 1, target: 1, slowT: 0, stop: 0, real: 0 };
export const Shake = { trauma: 0, offset: new THREE.Vector3(), roll: 0 };

// ---------- particles ----------
const MAXP = 2400;
const P = { pos: new Float32Array(MAXP * 3), col: new Float32Array(MAXP * 3), size: new Float32Array(MAXP), alpha: new Float32Array(MAXP), shape: new Float32Array(MAXP), list: [] };
let points;
const pMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 600 } },
  vertexShader: /* glsl */`
    attribute float size; attribute float alpha; attribute float shape; attribute vec3 col;
    varying vec3 vCol; varying float vAlpha; varying float vShape;
    uniform float uScale;
    void main() { vCol = col; vAlpha = alpha; vShape = shape;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = min(size * uScale / max(0.5, -mv.z), uScale * 0.12);
      gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */`
    varying vec3 vCol; varying float vAlpha; varying float vShape;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p);
      if (r > 1.0) discard;
      vec3 c = vCol; float a = vAlpha;
      if (vShape < 0.5) {            // flame tongue: wide base, pointed tip, toon bands
        vec2 q = vec2(p.x, -p.y);
        float w = mix(1.0, 0.18, smoothstep(-0.7, 1.0, q.y));
        float f = length(vec2(q.x / w, q.y < 0.0 ? q.y * 1.15 : q.y * 0.9));
        if (f > 1.0) discard;
        c = f > 0.78 ? c * 0.8 : (f > 0.45 ? mix(c, vec3(1.0, 0.86, 0.35), 0.7) : vec3(1.0, 0.97, 0.82));
      } else if (vShape < 1.5) {     // smoke puff with an ink rim
        if (r > 0.82) c = vec3(0.114, 0.086, 0.125);
        else c = mix(c, c * 1.15, smoothstep(0.6, 0.0, r + p.y * 0.3));
      } else if (vShape < 2.5) {     // soft glint
        a *= smoothstep(1.0, 0.3, r); c = mix(c, vec3(1.0), smoothstep(0.5, 0.0, r));
      } else {                       // flat disc (droplets, dust)
        if (r > 0.8) c *= 0.7;
        c = mix(c, vec3(1.0), smoothstep(0.35, 0.1, length(p - vec2(-0.3, 0.3))));
      }
      gl_FragColor = vec4(c, a);
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false,
});

export function emit(o) {
  if (P.list.length >= (window.__fxCap || MAXP)) return;   // v7: the Mobile quality preset lowers the cap
  P.list.push({
    x: o.pos.x, y: o.pos.y, z: o.pos.z, vx: o.vel ? o.vel.x : 0, vy: o.vel ? o.vel.y : 0, vz: o.vel ? o.vel.z : 0,
    life: o.life ?? 0.6, max: o.life ?? 0.6, s0: o.size ?? 0.3, s1: o.size1 ?? 0, c0: new THREE.Color(o.color ?? 0xffffff), c1: new THREE.Color(o.color1 ?? o.color ?? 0xffffff),
    g: o.grav ?? 0, drag: o.drag ?? 1.5, shape: o.shape ?? 0, a0: o.alpha ?? 1, fadeIn: o.fadeIn ?? 0,
  });
}
const rnd = (a = 1) => (Math.random() * 2 - 1) * a;
const _c = new THREE.Color();
function updateParticles(dt) {
  const L = P.list; let n = 0;
  for (let i = L.length - 1; i >= 0; i--) {
    const p = L[i]; p.life -= dt;
    if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
    const k = Math.exp(-p.drag * dt);
    p.vx *= k; p.vy = p.vy * k - p.g * dt; p.vz *= k;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
  for (const p of L) {
    const u = 1 - p.life / p.max;
    P.pos[n * 3] = p.x; P.pos[n * 3 + 1] = p.y; P.pos[n * 3 + 2] = p.z;
    _c.copy(p.c0).lerp(p.c1, u);
    P.col[n * 3] = _c.r; P.col[n * 3 + 1] = _c.g; P.col[n * 3 + 2] = _c.b;
    P.size[n] = p.s0 + (p.s1 - p.s0) * u;
    P.alpha[n] = p.a0 * Math.min(1, (1 - u) * 3) * (p.fadeIn ? Math.min(1, u / p.fadeIn) : 1);
    P.shape[n] = p.shape; n++;
  }
  const g = points.geometry;
  for (const a of ['position', 'col', 'size', 'alpha', 'shape']) g.attributes[a].needsUpdate = true;
  g.setDrawRange(0, n);
}

// ---------- flipbooks (8-frame strips from the 2D game) ----------
const sheets = {};
const FILE = { 'fx3d-hit-spark': 'fx3d-hit-spark-keyed' };
// v3 (Connor's note 11, "cut off at the corners"): every strip is loaded through a canvas and its alpha is
// feathered to zero over the last 15% of each 384 px cell, on all four sides, so no frame can ever show a
// straight edge where the art met its cell border.
export const FEATHER = 0.15;
function featherSheet(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const W = c.width, H = c.height, cw = W / 8, d = x.getImageData(0, 0, W, H), a = d.data, F = cw * FEATHER;
  const ramp = (v) => { const k = Math.max(0, Math.min(1, v / F)); return k * k * (3 - 2 * k); };
  const ry = new Float32Array(H); for (let j = 0; j < H; j++) ry[j] = ramp(Math.min(j, H - 1 - j));
  const rx = new Float32Array(W); for (let i = 0; i < W; i++) { const u = i % cw; rx[i] = ramp(Math.min(u, cw - 1 - u)); }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = (j * W + i) * 4 + 3; a[k] = a[k] * rx[i] * ry[j]; }
  x.putImageData(d, 0, 0);
  return c;
}
function sheet(name) {
  if (!sheets[name]) {
    const t = new THREE.Texture(); t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1 / 8, 1);
    const img = new Image(); img.onload = () => { t.image = featherSheet(img); t.needsUpdate = true; }; img.src = 'assets/fx/' + (FILE[name] || name) + '.webp';
    sheets[name] = t;
  }
  return sheets[name];
}
const MAXFLIPS = 40;
function capFlips() { while (flips.length > MAXFLIPS) { const f = flips.shift(); f.parent.remove(f.s); f.s.material.dispose(); f.t.dispose(); } }
const flips = [];
export function flip(name, pos, o = {}) {
  const t = sheet(name).clone(); if (t.image) t.needsUpdate = true; t.repeat.set(1 / 8, 1);
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: o.depthTest ?? true, toneMapped: false, fog: false, color: o.tint ?? 0xffffff, rotation: o.rot ?? Math.random() * 6.28 * (o.spin ?? 0) });
  const s = new THREE.Sprite(m); s.position.copy(pos); s.scale.setScalar(o.size ?? 1.5);
  if (o.center) s.center.set(o.center[0], o.center[1]);
  s.renderOrder = 5;
  scene.add(s);
  flips.push({ s, t, life: 0, dur: o.dur ?? 0.4, loop: o.loop, follow: o.follow, followOff: o.followOff, grow: o.grow ?? 0, parent: scene, fadeOut: o.fadeOut });
  capFlips();
  return flips[flips.length - 1];
}
// a flipbook on a quad oriented in the world (normal blending, no tone mapping: the ink and flat colour survive)
//  dirV: the image's "down" runs along this direction and the quad turns about it to face the camera,
//        anchored at the top centre (the air gust: its apex sits at the palms)
//  otherwise: laid in a swing plane: yaw (facing), roll about the forward axis (0 flat, ±π/2 vertical)
const quadGeo = new THREE.PlaneGeometry(1, 1), quadGeoTop = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qx = new THREE.Vector3(), _qy = new THREE.Vector3(), _qz = new THREE.Vector3(), _qm = new THREE.Matrix4();
export function flipQuad(name, pos, o = {}) {
  const t = sheet(name).clone(); if (t.image) t.needsUpdate = true; t.repeat.set((o.flipX ? -1 : 1) / 8, 1);
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, alphaTest: 0.04, color: o.tint ?? 0xffffff });
  const mesh = new THREE.Mesh(o.dirV ? quadGeoTop : quadGeo, m);
  mesh.position.copy(pos); mesh.renderOrder = 5;
  const sz = o.size ?? 2;
  mesh.scale.set(sz * (o.aspect ?? 1), sz, 1);
  if (o.dirV) { mesh.userData.dirV = o.dirV.clone().normalize(); }
  else {
    // lay the image flat with its top toward the facing, then roll about the forward axis, then yaw
    _qa.setFromAxisAngle(_qx.set(1, 0, 0), Math.PI / 2);
    _qb.setFromAxisAngle(_qz.set(0, 0, 1), o.roll ?? 0); _qa.premultiply(_qb);
    _qb.setFromAxisAngle(_qy.set(0, 1, 0), o.yaw ?? 0); _qa.premultiply(_qb);
    mesh.quaternion.copy(_qa);
  }
  scene.add(mesh);
  const f = { s: mesh, t, life: 0, dur: o.dur ?? 0.35, loop: o.loop, follow: o.follow, grow: o.grow ?? 0, parent: scene, quad: true, flipX: o.flipX, fadeOut: o.fadeOut };
  flips.push(f); capFlips();
  return f;
}
function updateFlips(dt) {
  for (let i = flips.length - 1; i >= 0; i--) {
    const f = flips[i]; f.life += dt;
    const u = f.life / f.dur;
    if (!f.loop && u >= 1 || f.dead) { f.parent.remove(f.s); f.s.material.dispose(); f.t.dispose(); flips.splice(i, 1); continue; }
    const fr = Math.min(7, Math.floor((f.loop ? u % 1 : u) * 8));
    f.t.offset.x = f.flipX ? (fr + 1) / 8 : fr / 8;
    if (f.follow) { f.s.position.copy(f.follow); if (f.followOff) f.s.position.add(f.followOff); }
    if (f.fadeOut && f.life > f.dur - f.fadeOut && f.loop) f.s.material.opacity = Math.max(0, (f.dur - f.life) / f.fadeOut);
    if (f.s.userData.dirV) {   // turn about the gust axis to face the camera
      const d = f.s.userData.dirV; _qy.copy(d).negate();
      _qz.copy(camera.position).sub(f.s.position); _qz.addScaledVector(_qy, -_qz.dot(_qy)).normalize();
      _qx.crossVectors(_qy, _qz).normalize(); _qz.crossVectors(_qx, _qy);
      _qm.makeBasis(_qx, _qy, _qz); f.s.quaternion.setFromRotationMatrix(_qm);
    }
    if (f.grow) f.s.scale.multiplyScalar(1 + f.grow * dt);
  }
}

// ---------- ribbons ----------
const ribbons = [];
const ribbonMat = (color, core, opacity = 1) => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(core) }, uOpacity: { value: opacity } },
  vertexShader: `attribute float side; attribute float along; varying float vS; varying float vA;
    void main(){ vS = side; vA = along; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 uColor; uniform vec3 uCore; uniform float uOpacity; varying float vS; varying float vA;
    void main(){ float e = abs(vS); vec3 c = mix(uCore, uColor, smoothstep(0.15, 0.55, e));
      if (e > 0.86) c = mix(c, vec3(0.114,0.086,0.125), 0.55);
      float a = uOpacity * smoothstep(0.0, 0.35, vA) ; if (a < 0.02) discard;
      gl_FragColor = vec4(c, a);
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});
// a trail that follows a moving point; width tapers toward the tail
export function ribbon(o) {
  const N = o.n ?? 16;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 2 * 3), side = new Float32Array(N * 2), along = new Float32Array(N * 2), idx = [];
  for (let i = 0; i < N; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; along[i * 2] = along[i * 2 + 1] = 1 - i / (N - 1); if (i < N - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('side', new THREE.BufferAttribute(side, 1)); g.setAttribute('along', new THREE.BufferAttribute(along, 1)); g.setIndex(idx);
  const m = new THREE.Mesh(g, ribbonMat(o.color ?? 0xffffff, o.core ?? 0xffffff, o.opacity ?? 1));
  m.frustumCulled = false; m.renderOrder = 4;
  scene.add(m);
  const r = { m, g, pts: [], N, width: o.width ?? 0.3, life: o.life ?? 999, fade: 0, dead: false, src: o.src, every: 0 };
  ribbons.push(r);
  return r;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _side = new THREE.Vector3();
function updateRibbons(dt) {
  for (let i = ribbons.length - 1; i >= 0; i--) {
    const r = ribbons[i];
    r.life -= dt;
    if (r.src && !r.dead) { r.pts.unshift(r.src.clone()); }
    else if (r.pts.length) r.pts.pop();
    if (r.pts.length > r.N) r.pts.length = r.N;
    if ((r.dead && r.pts.length <= 1) || r.life <= 0) { scene.remove(r.m); r.g.dispose(); r.m.material.dispose(); ribbons.splice(i, 1); continue; }
    const pos = r.g.attributes.position.array, n = r.pts.length;
    if (!n) { r.m.visible = false; continue; }
    r.m.visible = true;
    for (let j = 0; j < r.N; j++) {
      const p = r.pts[Math.min(j, n - 1)], q = r.pts[Math.min(j + 1, n - 1)], q0 = r.pts[Math.max(0, Math.min(j - 1, n - 1))];
      if (!p || !q || !q0) { if (!r.warned) { r.warned = true; console.log('LOG ribbon gap', j, n, r.pts.length, r.N); } continue; }
      _d.copy(q0).sub(q); if (_d.lengthSq() < 1e-8) _d.set(0, 0, 1);
      _a.copy(p).sub(camera.position);
      _side.crossVectors(_d, _a).normalize();
      const w = r.width * (1 - j / r.N) * (j < n ? 1 : 0);
      pos[j * 6] = p.x + _side.x * w; pos[j * 6 + 1] = p.y + _side.y * w; pos[j * 6 + 2] = p.z + _side.z * w;
      pos[j * 6 + 3] = p.x - _side.x * w; pos[j * 6 + 4] = p.y - _side.y * w; pos[j * 6 + 5] = p.z - _side.z * w;
    }
    r.g.attributes.position.needsUpdate = true;
  }
}

// ---------- rings, swooshes, debris ----------
const rings = [];
export function ring(pos, o = {}) {
  const geo = new THREE.RingGeometry(0.8, 1, 40, 1);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: o.color ?? 0xf3ecdf, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += 0.06;
  if (o.vertical) { m.rotation.set(0, o.yaw || 0, 0); }
  scene.add(m);
  rings.push({ m, life: 0, dur: o.dur ?? 0.45, r0: o.r0 ?? 0.3, r1: o.r1 ?? 3, op: o.opacity ?? 0.85 });
}
// a thin inked brush ring on the ground (boss slam warnings, landing markers). Replaces the translucent discs.
let ringTex = null;
function brushRingTex() {
  if (ringTex) return ringTex;
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.translate(128, 128);
  for (let i = 0; i < 3; i++) { x.beginPath(); for (let a = 0; a <= 6.3; a += 0.05) { const r = 112 + Math.sin(a * 7 + i * 2) * 2.5 + i * 1.5; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.strokeStyle = 'rgba(29,22,32,0.95)'; x.lineWidth = 14 - i * 3; x.stroke(); }
  x.beginPath(); for (let a = 0; a <= 6.3; a += 0.05) { const r = 112 + Math.sin(a * 5) * 2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.strokeStyle = '#fff'; x.lineWidth = 6; x.stroke();
  ringTex = new THREE.CanvasTexture(c); ringTex.colorSpace = THREE.SRGBColorSpace; return ringTex;
}
const inkRings = [];
export function inkRing(pos, o = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: brushRingTex(), color: o.color ?? 0xf3ecdf, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
  m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += 0.05; m.renderOrder = 3;
  scene.add(m);
  const r = { m, life: 0, dur: o.dur ?? 0.5, r0: o.r0 ?? 0.3, r1: o.r1 ?? 3, hold: !!o.hold, follow: o.follow, pulse: o.pulse };
  m.scale.setScalar((o.hold ? r.r1 : r.r0) * 2);
  inkRings.push(r);
  return r;
}
function updateInkRings(dt) {
  for (let i = inkRings.length - 1; i >= 0; i--) {
    const r = inkRings[i]; r.life += dt; const u = r.life / r.dur;
    if (u >= 1 || r.dead) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); inkRings.splice(i, 1); continue; }
    if (r.follow) { r.m.position.x = r.follow.x; r.m.position.z = r.follow.z; }
    if (r.hold) { const k = r.pulse ? 1 + Math.sin(r.life * 14) * 0.04 : 1; r.m.scale.setScalar(r.r1 * 2 * k); r.m.material.opacity = Math.min(1, r.life * 6) * (u > 0.85 ? (1 - u) / 0.15 : 1); }
    else { const e = 1 - (1 - u) ** 3; r.m.scale.setScalar((r.r0 + (r.r1 - r.r0) * e) * 2); r.m.material.opacity = u > 0.6 ? (1 - u) / 0.4 : 1; }
  }
}
const debris = [];
const rockGeo = new THREE.DodecahedronGeometry(1, 0), shardGeo = new THREE.OctahedronGeometry(1, 0);
export function chunks(pos, o = {}) {
  const n = o.n ?? 8;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(o.ice ? shardGeo : rockGeo, toon(o.color ?? 0x9c8566));
    addOutline(m, 1);
    const s = (o.size ?? 0.14) * (0.6 + Math.random() * 0.8);
    m.scale.set(s, o.ice ? s * 2.2 : s, s);
    m.position.copy(pos);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    scene.add(m);
    const sp = o.speed ?? 6;
    debris.push({ m, v: new THREE.Vector3(rnd(sp), Math.random() * sp * 0.9 + (o.up ?? 2), rnd(sp)).add(o.dir || _b.set(0, 0, 0)), w: new THREE.Vector3(rnd(10), rnd(10), rnd(10)), life: o.life ?? 1.1 + Math.random() * 0.5, floor: o.floor ?? pos.y - 0.2 });
  }
}
function updateMisc(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.life += dt; const u = r.life / r.dur;
    if (u >= 1) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i, 1); continue; }
    const e = 1 - (1 - u) ** 3; const s = r.r0 + (r.r1 - r.r0) * e;
    r.m.scale.set(s, s, s); r.m.material.opacity = r.op * (1 - u);
  }
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.life -= dt;
    if (d.life <= 0) { scene.remove(d.m); debris.splice(i, 1); continue; }
    d.v.y -= 22 * dt; d.m.position.addScaledVector(d.v, dt);
    if (d.m.position.y < d.floor) { d.m.position.y = d.floor; d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6); }
    d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
    if (d.life < 0.25) d.m.scale.multiplyScalar(1 - dt * 6);
  }
}

// melee swoosh: a quick crescent in front of the body
const swooshes = [];
export function swoosh(origin, yaw, o = {}) {
  const geo = new THREE.RingGeometry(o.r ?? 0.9, (o.r ?? 0.9) + (o.w ?? 0.28), 24, 1, o.a0 ?? -0.9, o.arc ?? 1.8);
  const m = new THREE.Mesh(geo, ribbonMat(o.color ?? 0xffffff, 0xffffff, 0.9));
  const ga = geo.attributes.position.count; const side = new Float32Array(ga), along = new Float32Array(ga);
  const segs = 25;
  for (let i = 0; i < ga; i++) { const j = i % segs; side[i] = i < segs ? -0.9 : 0.2; along[i] = j / (segs - 1); }
  geo.setAttribute('side', new THREE.BufferAttribute(side, 1)); geo.setAttribute('along', new THREE.BufferAttribute(along, 1));
  m.position.copy(origin); m.rotation.set(o.pitch ?? -Math.PI / 2, 0, 0, 'YXZ'); m.rotation.y = yaw; m.rotation.z = o.roll ?? 0;
  m.renderOrder = 4;
  scene.add(m); swooshes.push({ m, life: 0, dur: o.dur ?? 0.16 });
}
function updateSwoosh(dt) {
  for (let i = swooshes.length - 1; i >= 0; i--) { const s = swooshes[i]; s.life += dt; const u = s.life / s.dur;
    if (u >= 1) { scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); swooshes.splice(i, 1); continue; }
    s.m.material.uniforms.uOpacity.value = 0.9 * (1 - u); s.m.scale.setScalar(1 + u * 0.25); }
}

// ---------- presets ----------
export const FX = {
  fireBurst(pos, scale = 1) { flip('fx3d-fire-impact', _b.copy(pos).setY(pos.y + 0.55 * scale), { size: 1.6 * scale, dur: 0.6 }); },
  fireTongue(pos, scale = 1, dur = 0.7) { return flip('fx3d-fire-impact', _b.copy(pos).setY(pos.y + 0.45 * scale), { size: 1.2 * scale, dur }); },
  rockBurst(pos, scale = 1) { flip('fx3d-rock-burst', _b.copy(pos).setY(pos.y + 0.5 * scale), { size: 1.7 * scale, dur: 0.6 }); },
  dust(pos, n = 2, s = 1) { for (let i = 0; i < Math.min(n, 3); i++) flip('dust-small', _b.set(pos.x + rnd(0.35 * s), pos.y + 0.2 * s, pos.z + rnd(0.35 * s)), { size: 0.7 * s, dur: 0.45 }); },
  splash(pos, s = 1) { flip('hit-spark-water', pos, { size: 1.5 * s, dur: 0.3 }); },
  iceBurst(pos) { chunks(pos, { n: 5, ice: true, color: 0xbff0fa, size: 0.07, speed: 4, life: 0.7 }); },
  airPuff(pos, s = 1) { flip('hit-spark-air', pos, { size: 1.3 * s, dur: 0.3 }); },
  hit(pos, el = null, s = 1) { flip(el && el !== 'air' ? 'hit-spark-' + el : 'fx3d-hit-spark', pos, { size: 0.95 * s, dur: 0.24 }); },
  parry(pos, kind = 'gold') { flip('fx3d-parry-flash', pos, { size: kind === 'block' ? 0.9 : 1.5, dur: kind === 'block' ? 0.22 : 0.34, tint: kind === 'red' ? 0xff8080 : kind === 'block' ? 0xf3ecdf : 0xffffff }); },
  poof(pos, s = 1) { flip('defeat-poof', pos, { size: 2.6 * s, dur: 0.6 }); },
  landDust(pos, s = 1) { flip('landing-dust', _b.copy(pos).setY(pos.y + 0.25 * s), { size: 1.6 * s, dur: 0.4 }); },
};

// ---------- shake / time ----------
export function shake(amount) { Shake.trauma = Math.min(1, Shake.trauma + amount); }
export function hitstop(sec) { Time.stop = Math.max(Time.stop, sec); }
export function slowmo(scale, sec) { Time.target = scale; Time.slowT = sec; }

export function initFX(sc, cam) {
  scene = sc; camera = cam;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P.pos, 3)); g.setAttribute('col', new THREE.BufferAttribute(P.col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(P.size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(P.alpha, 1)); g.setAttribute('shape', new THREE.BufferAttribute(P.shape, 1));
  points = new THREE.Points(g, pMat); points.frustumCulled = false; points.renderOrder = 6;
  scene.add(points);
  ['fx3d-hit-spark', 'fx3d-parry-flash', 'fx3d-air-gust', 'fx3d-staff-smear', 'fx3d-whirlwind', 'fx3d-fireball', 'fx3d-fire-impact', 'fx3d-rock-burst', 'hit-spark-air', 'landing-dust', 'dust-small', 'defeat-poof'].forEach(sheet);
}
export function setPointScale(h) { pMat.uniforms.uScale.value = h * 0.6; }

export function updateFX(dt, realDt) {
  updateParticles(dt); updateFlips(dt); updateRibbons(dt); updateMisc(dt); updateSwoosh(dt); updateInkRings(dt);
  // shake decays in real time
  Shake.trauma = Math.max(0, Shake.trauma - realDt * 1.6);
  const s = Shake.trauma * Shake.trauma, t = performance.now() / 1000;
  Shake.offset.set(Math.sin(t * 61) * 0.28 * s, Math.sin(t * 53 + 1.3) * 0.22 * s, Math.sin(t * 47 + 2.1) * 0.1 * s);
  Shake.roll = Math.sin(t * 37 + 0.7) * 0.03 * s;
}
export { rnd };
