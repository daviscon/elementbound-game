// v3 (Connor's notes 5, 10, 11, 12): bending effects as real 3D geometry, not flat cards.
//  windTube: a tube swept along a curve, toon-shaded in two flat tones (white / cool blue shadow, no
//    gradient) with a back-face ink hull. A window (tail..head) runs along the curve, so the wind draws
//    itself out of the hand and erodes away; the tube is opaque and collapses to nothing outside the window,
//    so there is no alpha card, no edge-on sliver and never a straight cut edge.
//  windRing: an inked toon torus that bursts outward (the shock of a palm strike).
//  Presets: palmGust (L1+□), takedownBurst, swingArc (the staff smear as a swept 3D band), spiralColumn
//  (the ceremony).
//  impact(): 1-2 frame anime impact frames (black ink silhouettes on a burst of cream and colour).
import * as THREE from 'three';
import { INK } from './toon.js';

let scene, camera;
const tubes = [], rings = [];
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

const VERT = /* glsl */`
  uniform float uHead, uSeg, uRadius, uInk, uFar;
  varying vec3 vN; varying vec3 vView; varying float vU;
  void main() {
    float u = uv.x;
    float tail = uHead - uSeg;
    // fat at the head, a long thin tail, round ends
    float w = smoothstep(tail, tail + uSeg * 0.75, u) * (1.0 - smoothstep(uHead - uSeg * 0.1, uHead, u));
    w = sqrt(max(w, 0.0));
    vec3 c = position - normal * uRadius;
    vec4 wp = modelMatrix * vec4(c, 1.0);
    float far = uFar > 0.5 ? clamp(length(cameraPosition - wp.xyz) / 25.0, 1.0, 3.0) : 1.0;
    float r = uRadius * w * far + (uInk > 0.0 && w > 0.01 ? uInk * far : 0.0);
    vec3 p = c + normal * r;
    vN = normalize(normalMatrix * normal); vU = u;
    vec4 mv = modelViewMatrix * vec4(p, 1.0); vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  uniform vec3 uLit, uShade, uCore; uniform float uInk, uCoreMix;
  varying vec3 vN; varying vec3 vView; varying float vU;
  void main() {
    if (uInk > 0.0) { gl_FragColor = vec4(${new THREE.Color(INK).toArray().map((v) => v.toFixed(3)).join(',')}, 1.0); return; }
    vec3 n = normalize(vN), l = normalize(vec3(-0.45, 0.75, 0.5));
    float lit = step(0.05, dot(n, l));
    // a thin bright core line along the facing side, like the 2D game's wind
    float face = dot(n, normalize(vView));
    vec3 c = mix(uShade, uLit, lit);
    if (face > 0.82) c = mix(c, uCore, uCoreMix);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;
function tubeMats(o) {
  const u = { uHead: { value: 0 }, uSeg: { value: o.seg ?? 0.4 }, uRadius: { value: o.radius ?? 0.05 }, uFar: { value: o.far ? 1 : 0 },
    uLit: { value: new THREE.Color(o.lit ?? 0xffffff) }, uShade: { value: new THREE.Color(o.shade ?? 0xa9d4e4) },
    uCore: { value: new THREE.Color(o.core ?? 0xffffff) }, uCoreMix: { value: o.coreMix ?? 0.6 } };
  const body = new THREE.ShaderMaterial({ uniforms: { ...u, uInk: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG });
  const ink = new THREE.ShaderMaterial({ uniforms: { ...u, uInk: { value: o.ink ?? 0.014 } }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide });
  return { body, ink, u };
}

// o: { curve | points, dur, delay, radius, seg (window length, 0-1 of the curve), curl (extra helix radius),
//      phase, turns, lit, shade, ink, ease ('out' | 'lin'), follow: Object3D-like with position to ride along }
export function windTube(o) {
  let curve = o.curve || new THREE.CatmullRomCurve3(o.points);
  if (o.curl) {   // wrap a helix round the base curve
    const N = 48, frames = curve.computeFrenetFrames(N, false), pts = [], turns = o.turns ?? Math.max(1, (o.len ?? curve.getLength()) / 2.2);
    for (let i = 0; i <= N; i++) { const u = i / N, a = (o.phase ?? 0) + u * turns * Math.PI * 2, r = o.curl * (o.curlGrow ? 0.3 + u * o.curlGrow : 1); const p = curve.getPointAt(u); p.addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r); pts.push(p); }
    curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  }
  const segs = o.segments ?? 72;
  const geo = new THREE.TubeGeometry(curve, segs, o.radius ?? 0.05, o.radial ?? 7, false);
  const M = tubeMats(o);
  const body = new THREE.Mesh(geo, M.body), ink = new THREE.Mesh(geo, M.ink);
  const g = new THREE.Group(); g.add(body); g.add(ink); g.renderOrder = 4;
  body.frustumCulled = ink.frustumCulled = false;
  scene.add(g);
  const t = { g, geo, M, life: -(o.delay ?? 0), dur: o.dur ?? 0.5, seg: M.u.uSeg.value, ease: o.ease ?? 'out', dead: false, hold: o.hold };
  tubes.push(t);
  return t;
}
// an inked toon ring that bursts outward along `dir` (the shock of a palm strike or a takedown)
export function windRing(pos, dir, o = {}) {
  const r = o.r ?? 0.5, tube = o.tube ?? 0.05;
  const geo = new THREE.TorusGeometry(1, tube, 6, 40), igeo = new THREE.TorusGeometry(1, tube * 1.55, 6, 40);
  const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: o.color ?? 0xf4fbff }));
  const ink = new THREE.Mesh(igeo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  const g = new THREE.Group(); g.add(body); g.add(ink);
  g.position.copy(pos); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  scene.add(g);
  const k = { g, geo, igeo, body, ink, life: 0, dur: o.dur ?? 0.3, r0: r, r1: o.r1 ?? 1.6, travel: o.travel ?? 1.2, dir: dir.clone().normalize(), p0: pos.clone(), tube };
  rings.push(k);
  return k;
}

// ---------------------------------------------------------------- presets
const UP = new THREE.Vector3(0, 1, 0);
function basis(dir) { const side = new THREE.Vector3().crossVectors(dir, UP); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize(); const up = new THREE.Vector3().crossVectors(side, dir).normalize(); return { side, up }; }
// L1+□: six curling streams leave the palms and fan into a cone 4.6 m long, a ring of shock at the palms
export function palmGust(from, dir, reach = 4.6, o = {}) {
  const { side, up } = basis(dir), n = o.n ?? 9;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + Math.random() * 0.4, spread = 0.8 + Math.random() * 0.45, pts = [];
    for (let j = 0; j <= 8; j++) { const u = j / 8, rr = 0.06 + u * u * spread * reach * 0.32, aa = a + u * 2.4; pts.push(from.clone().addScaledVector(dir, u * reach).addScaledVector(side, Math.cos(aa) * rr).addScaledVector(up, Math.sin(aa) * rr * 0.8)); }
    windTube({ points: pts, dur: (o.dur ?? 0.55) + Math.random() * 0.1, delay: i * 0.012, radius: (o.radius ?? 0.11) * (0.7 + Math.random() * 0.6), seg: 0.6, ease: 'out' });
  }
  // a straight fat core blast
  windTube({ points: [from.clone(), from.clone().addScaledVector(dir, reach * 0.5), from.clone().addScaledVector(dir, reach)], dur: (o.dur ?? 0.55) * 0.8, radius: (o.radius ?? 0.07) * 2.6, seg: 0.55, curl: 0.16, turns: 2.5 });
  windRing(from.clone().addScaledVector(dir, 0.3), dir, { r: 0.1, r1: o.ring ?? 0.5, travel: 1.4, dur: 0.22, tube: 0.07 });
}
// the takedown: a spiral of wind wraps the soldier and throws him, two shock rings
export function takedownBurst(from, dir, target) {
  palmGust(from, dir, 5.2, { n: 8, radius: 0.09, dur: 0.5, ring: 0.7 });
  const { side, up } = basis(dir);
  for (let k = 0; k < 3; k++) {
    const pts = []; const c = target.clone().setY(target.y + 0.9);
    for (let j = 0; j <= 14; j++) { const u = j / 14, a = k * 2.1 + u * Math.PI * 3.2, r = 1.15 - u * 0.5; pts.push(c.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r * 0.7 + (u - 0.5) * 0.9).addScaledVector(dir, u * 2.2 - 0.6)); }
    windTube({ points: pts, dur: 0.6, delay: 0.04 + k * 0.05, radius: 0.06, seg: 0.6 });
  }
  windRing(target.clone().setY(target.y + 0.9), dir, { r: 0.3, r1: 1.1, travel: 1.0, dur: 0.26, tube: 0.06 });
}
// the staff smear as a swept band: an arc of fat tube that wipes through the swing (seen from any angle)
export function swingArc(center, yaw, o = {}) {
  const r = o.r ?? 1.35, a0 = o.a0 ?? -1.3, a1 = o.a1 ?? 1.3, roll = o.roll ?? 0, pts = [];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, -roll, 'YXZ'));
  for (let i = 0; i <= 12; i++) { const a = a0 + (a1 - a0) * i / 12; pts.push(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r).applyQuaternion(q).add(center)); }
  if (o.flip) pts.reverse();
  // never through the lens: shrink the arc toward its centre until every point is 1.3 m from the camera
  if (camera) { let k = 1; for (let it = 0; it < 6; it++) { let near = false; for (const p of pts) if (p.distanceTo(camera.position) < 1.3) near = true; if (!near) break; k *= 0.75; for (const p of pts) p.sub(center).multiplyScalar(0.75).add(center); } if (k < 0.3) return; }
  windTube({ points: pts, dur: o.dur ?? 0.2, radius: o.width ?? 0.07, seg: 0.75, lit: o.lit ?? 0xffffff, shade: o.shade ?? 0xbfe0ea, ink: 0.012 });
}

// ---------------------------------------------------------------- impact frames
// G.impactFrames > 0: the frame renders only layer 2 (the fighters), in ink, over a burst background
export const Impact = { frames: 0, bg: null, kind: 'gold' };
function burstTexture(c1, c2) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 576; const x = c.getContext('2d');
  x.fillStyle = c1; x.fillRect(0, 0, 1024, 576);
  x.translate(512, 288);
  for (let i = 0; i < 70; i++) { const a = i / 70 * Math.PI * 2 + Math.random() * 0.05, w = 0.012 + Math.random() * 0.03, r0 = 120 + Math.random() * 140; x.fillStyle = c2; x.beginPath(); x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); x.lineTo(Math.cos(a - w) * 900, Math.sin(a - w) * 900); x.lineTo(Math.cos(a + w) * 900, Math.sin(a + w) * 900); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const bgs = {};
export function impact(kind = 'gold', frames = 2) { Impact.frames = Math.max(Impact.frames, frames); Impact.kind = kind; }
const inkMat = new THREE.MeshBasicMaterial({ color: INK });
// called by main.js around renderer.render
export function renderImpact(renderer, sc, cam) {
  if (Impact.frames <= 0) return false;
  Impact.frames--;
  const k = Impact.kind;
  if (!bgs[k]) bgs[k] = k === 'red' ? burstTexture('#f3e6cf', '#c8423a') : k === 'air' ? burstTexture('#f6f1e4', '#7fb8cf') : burstTexture('#f6efdc', '#d9a43a');
  const bg = sc.background, fog = sc.fog, ov = sc.overrideMaterial;
  sc.background = bgs[k]; sc.fog = null; sc.overrideMaterial = inkMat;
  cam.layers.set(2);
  renderer.render(sc, cam);
  cam.layers.set(0);
  sc.background = bg; sc.fog = fog; sc.overrideMaterial = ov;
  return true;
}
// mark a character (and its weapon) as a fighter for impact frames
export function markFighter(obj) { obj.traverse((o) => o.layers.enable(2)); }

// ---------------------------------------------------------------- update
export function initFX3D(sc, cam) { scene = sc; camera = cam; }
// v4: other inked libraries (fxfire.js) share the scene and the per-frame update
const hooks = [];
export function onFX3D(fn) { hooks.push(fn); }
export function fx3dScene() { return scene; }
export function fx3dCamera() { return camera; }
export function updateFX3D(dt) {
  for (const h of hooks) h(dt);
  for (let i = tubes.length - 1; i >= 0; i--) {
    const t = tubes[i]; t.life += dt;
    if (t.life < 0) { t.M.u.uHead.value = -1; continue; }
    let u = Math.min(1, t.life / t.dur);
    if (t.ease === 'out') u = 1 - (1 - u) * (1 - u);
    t.M.u.uHead.value = u * (1 + t.seg * 1.02);
    if (t.life >= t.dur || t.dead) { scene.remove(t.g); t.geo.dispose(); t.M.body.dispose(); t.M.ink.dispose(); tubes.splice(i, 1); }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const k = rings[i]; k.life += dt; const u = Math.min(1, k.life / k.dur), e = 1 - (1 - u) ** 3;
    const R = k.r0 + (k.r1 - k.r0) * e;
    k.g.position.copy(k.p0).addScaledVector(k.dir, k.travel * e);
    // the ring's tube thins to nothing as it spreads (no fade: it erodes)
    const thin = Math.max(0.05, 1 - u * u);
    k.body.scale.set(R, R, thin); k.ink.scale.set(R, R, thin);
    if (u >= 1) { scene.remove(k.g); k.geo.dispose(); k.igeo.dispose(); k.body.material.dispose(); k.ink.material.dispose(); rings.splice(i, 1); }
  }
}

// v5 (note 30): the guard as a two-palm wind wall: a curved shell of inked wind streams in front of Joon.
// Five arcs (a dome, narrower at the top and bottom) whose windows keep sweeping across, so the wall flows.
export function windWall() {
  const g = new THREE.Group(); g.visible = false; g.renderOrder = 4;
  const arcs = [];
  const rows = [[0.35, 0.62, 0.8], [0.72, 0.8, 1.05], [1.1, 0.86, 1.15], [1.48, 0.8, 1.05], [1.82, 0.6, 0.8]];
  rows.forEach(([y, r, span], i) => {
    for (const dirn of [1, -1]) {
      const pts = [];
      for (let k = 0; k <= 16; k++) { const a = -span + 2 * span * k / 16; pts.push(new THREE.Vector3(Math.sin(a) * r * dirn, y + Math.sin(k / 16 * Math.PI) * 0.06 * dirn, Math.cos(a) * r)); }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035 + (i === 2 ? 0.012 : 0), 6, false);
      const M = tubeMats({ seg: 0.7, radius: 0.035 + (i === 2 ? 0.012 : 0), shade: 0xa9d4e4, ink: 0.012 });
      const b = new THREE.Mesh(geo, M.body), ink = new THREE.Mesh(geo, M.ink); b.frustumCulled = ink.frustumCulled = false;
      g.add(b); g.add(ink);
      arcs.push({ M, ph: i * 0.37 + (dirn > 0 ? 0 : 0.5), sp: 1.5 + i * 0.13 });
    }
  });
  let k = 0, t = 0, added = false;
  return {
    g,
    update(dt, on, p) {
      if (!added && scene) { scene.add(g); added = true; }
      k += ((on ? 1 : 0) - k) * (1 - Math.exp(-(on ? 22 : 14) * dt)); t += dt;
      g.visible = k > 0.02;
      if (!g.visible) return;
      g.position.copy(p.pos); g.rotation.y = p.yaw;
      g.scale.set(0.6 + 0.4 * k, 0.75 + 0.25 * k, 0.6 + 0.4 * k);
      for (const a of arcs) { a.M.u.uHead.value = 0.35 + ((t * a.sp + a.ph) % 1) * 1.1; a.M.u.uRadius.value = (a.M.u.uRadius.value > 0 ? a.M.u.uRadius.value : 0.035); }
    },
  };
}

// ---------------------------------------------------------------- v7 note 41: the Elder's icicle
// A long faceted spike in two flat tones (pale cyan lit, cool blue shade, flat-shaded facets), a back-face ink hull
// and a white highlight band down the lit side. Built along +Y from its grip end (0) to its point (len), so it can
// be parented to a hand and then thrown along its own axis.
const ICE_LIT = 0xd8f6ff, ICE_SHADE = 0x86c4dc;
function iceMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uLit: { value: new THREE.Color(ICE_LIT) }, uShade: { value: new THREE.Color(ICE_SHADE) } },
    vertexShader: `varying vec3 vN; void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uLit, uShade; varying vec3 vN; void main() { float lit = step(0.0, dot(normalize(vN), normalize(vec3(-0.4, 0.8, 0.45)))); gl_FragColor = vec4(mix(uShade, uLit, lit), 1.0);
      #include <colorspace_fragment>
    }`,
    flatShading: true,
  });
}
export function icicleMesh(len = 1.15, rad = 0.075) {
  const g = new THREE.Group();
  // a short blunt grip end, a long tapering spike: 6 facets, slightly twisted so the facets catch the light
  const pts = [new THREE.Vector2(0, -0.08), new THREE.Vector2(rad * 0.7, -0.05), new THREE.Vector2(rad, 0.08), new THREE.Vector2(rad * 0.82, len * 0.45), new THREE.Vector2(rad * 0.4, len * 0.82), new THREE.Vector2(0, len)];
  const geo = new THREE.LatheGeometry(pts, 6); geo.rotateY(0.3); geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, iceMat());
  const ink = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  ink.scale.set(1.32, 1.035, 1.32); ink.position.y = -0.012;
  // the white highlight band: a thin sliver along one lit facet
  const hgeo = new THREE.CylinderGeometry(rad * 0.1, rad * 0.22, len * 0.62, 4, 1); hgeo.translate(0, len * 0.38, 0);
  const hl = new THREE.Mesh(hgeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  hl.position.set(-rad * 0.55, 0, rad * 0.45); hl.rotation.z = 0.05;
  g.add(body, ink, hl);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  g.userData.len = len;
  return g;
}
// water drawn out of the air into the hand: thin cyan ribbons spiral in from about 1.4 m round the hand
export function iceDraw(target, dur = 0.9) {
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + Math.random() * 0.6, r = 1.2 + Math.random() * 0.4, h = -0.3 + Math.random() * 0.9;
    const p0 = target.clone().add(new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r));
    const mid = target.clone().lerp(p0, 0.45).add(new THREE.Vector3(Math.cos(a + 1.4) * 0.5, 0.25, Math.sin(a + 1.4) * 0.5));
    windTube({ points: [p0, mid, target.clone()], dur: dur * (0.7 + Math.random() * 0.25), delay: i * 0.07, radius: 0.028, seg: 0.5, lit: 0xcff4ff, shade: 0x5fb3d6, core: 0xffffff, coreMix: 0.8, ink: 0.01, curl: 0.08, turns: 1.5 });
  }
}
// the shatter: inked shards fly out and tumble down, a cyan shock ring, and an impact frame
const shards = [];
let shardGeo = null;
export function iceShatter(pos, dir, o = {}) {
  if (!shardGeo) { shardGeo = new THREE.OctahedronGeometry(1, 0); shardGeo.scale(0.45, 1.6, 0.45); }
  const n = o.n ?? 12, mat = iceMat(), inkM = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  const d = dir.clone().normalize();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(shardGeo, mat), ink = new THREE.Mesh(shardGeo, inkM); ink.scale.setScalar(1.3); m.add(ink);
    const s = 0.04 + Math.random() * 0.05; m.scale.setScalar(s); m.position.copy(pos);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 4).addScaledVector(d, 2.5);
    scene.add(m); shards.push({ m, v, w: new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7), s, life: 0, dur: 0.55 + Math.random() * 0.35 });
  }
  windRing(pos, d, { r: 0.2, r1: 1.3, travel: 0.4, dur: 0.28, color: 0xdff6ff, tube: 0.06 });
  if (o.impact !== false) impact('gold', 2);
}
onFX3D((dt) => {
  for (let i = shards.length - 1; i >= 0; i--) {
    const k = shards[i]; k.life += dt;
    k.v.y -= 14 * dt; k.m.position.addScaledVector(k.v, dt);
    k.m.rotation.x += k.w.x * dt; k.m.rotation.y += k.w.y * dt; k.m.rotation.z += k.w.z * dt;
    const u = k.life / k.dur; k.m.scale.setScalar(k.s * Math.max(0, 1 - u * u));   // they erode, never fade
    if (u >= 1) { scene.remove(k.m); shards.splice(i, 1); }
  }
});
