// v8 (note 44): the cel-fire building blocks, in the inked wind's language (solid shapes, flat tones, an ink line).
//  celFire(geo, o)  a flame mesh material: scrolling 3D noise erodes the shape from its edges (it licks, splits and
//                   breaks off), three hard bands (dark-red rim, orange body, yellow-white core), an ink line that
//                   follows the ERODED edge (and the silhouette), and a vertex wobble that grows up the flame.
//  card(sheet, o)   a generated 8-frame flipbook card (fx/fire-*.png): cut out at alpha 0.5 (crisp, opaque, no
//                   additive soup), cylindrical / spherical billboard or fixed, dissolving by noise instead of fading.
//  Everything animates on twos: one shared 12 fps clock (FireClock.ts), so flame shapes step like hand-drawn cels.
import * as THREE from 'three';
import { INK } from './toon.js';

export const FireClock = { t: 0, ts: 0 };
export const STEP = 1 / 12;
export function tickClock(dt) { FireClock.t += dt; FireClock.ts = Math.floor(FireClock.t / STEP) * STEP; }
// the Mobile quality preset lowers the particle cap; fire uses it to halve its card counts
export const lowFX = () => (window.__fxCap || 2400) < 1500;

const inkCol = new THREE.Color(INK).toArray().map((v) => v.toFixed(3)).join(',');
const NOISE = /* glsl */`
  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vn(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { return vn(p) * 0.62 + vn(p * 2.07 + 7.1) * 0.38; }`;

// ------------------------------------------------------------------ the cel-fire mesh shader
const FIRE_VERT = /* glsl */`
  uniform float uTime, uWob, uSeed;
  varying vec3 vP; varying vec3 vN; varying vec3 vView; varying float vY; varying vec3 vW;
  void main() {
    float y = clamp(uv.y, 0.0, 1.0);
    vec3 p = position;
    float w = uWob * y * y;                       // the wobble rises along the flame
    p.x += sin(uTime * 11.0 + y * 7.0 + uSeed) * w;
    p.z += cos(uTime * 8.0 + y * 6.0 + uSeed * 1.7) * w;
    vP = position; vY = y;
    vN = normalize(normalMatrix * normal);
    vW = (modelMatrix * vec4(p, 1.0)).xyz;
    vec4 mv = modelViewMatrix * vec4(p, 1.0); vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const FIRE_FRAG = /* glsl */`
  uniform vec3 uRim, uBody, uCore; uniform float uTime, uErode, uSeed, uScroll, uTip, uCoreW;
  uniform vec3 uFreq; uniform float uFace;
  varying vec3 vP; varying vec3 vN; varying vec3 vView; varying float vY; varying vec3 vW;
  ${NOISE}
  void main() {
    // noise scrolls up the flame (object space), so the eroded edge licks upward
    float n = fbm(vP * uFreq + vec3(uSeed, uSeed * 0.7 - uTime * uScroll, uSeed * 1.3));
    vec3 nn = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
    float face = abs(dot(nn, normalize(vView)));
    // inside-ness: the base is solid, the tip and the thin edges go first; uErode eats it all away
    float m = n * 0.62 + (1.0 - vY) * uTip + face * uFace - 0.42 - uErode * 1.15;
    m -= 1.0 - smoothstep(1.3, 3.2, distance(vW, cameraPosition));   // it erodes away near the lens
    if (m < 0.0) discard;
    float fw = max(fwidth(m), 1e-4);
    vec3 c;
    if (m < fw * 2.2 || (gl_FrontFacing && face < 0.16)) c = vec3(${inkCol});   // the ink follows the eroded edge
    else if (m < 0.07 + fw) c = uRim;
    else if (m + face * 0.12 > uCoreW) c = uCore;
    else c = uBody;
    if (!gl_FrontFacing && c != vec3(${inkCol})) c = mix(c, uRim, 0.55);      // the inside of a split reads darker
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;
export const PAL = {
  fire: { rim: 0xa8241a, body: 0xf2701e, core: 0xffe98a },
  core: { rim: 0xe0561c, body: 0xffb43a, core: 0xfff6c8 },
  edge: { rim: 0x7a1a10, body: 0xd2461a, core: 0xf6902a },
};
export function celFire(o = {}) {
  const pal = o.pal || PAL.fire;
  const u = {
    uRim: { value: new THREE.Color(pal.rim) }, uBody: { value: new THREE.Color(pal.body) }, uCore: { value: new THREE.Color(pal.core) },
    uTime: { value: 0 }, uErode: { value: 0 }, uSeed: { value: Math.random() * 20 }, uWob: { value: o.wob ?? 0.12 },
    uScroll: { value: o.scroll ?? 2.2 }, uTip: { value: o.tip ?? 0.42 }, uCoreW: { value: o.coreW ?? 0.36 },
    uFreq: { value: new THREE.Vector3(...(o.freq || [3.2, 2.4, 3.2])) }, uFace: { value: o.face ?? 0.18 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG, side: THREE.DoubleSide });
  return { mat, u };
}

// flame geometry: a lathe teardrop with enough rings for the wobble and the erosion to read; an open wall for rings
export const TONGUE = (() => {
  const pts = [];
  for (let i = 0; i <= 14; i++) { const y = i / 14; pts.push(new THREE.Vector2(Math.max(0.001, Math.pow(Math.sin(Math.PI * Math.min(1, y * 1.04)), 0.7) * (1 - y * 0.55)), y)); }
  return new THREE.LatheGeometry(pts, 14);
})();
export const WALL = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 48, 6, true); g.translate(0, 0.5, 0); return g; })();
export const BALL = new THREE.IcosahedronGeometry(1, 3);

// ------------------------------------------------------------------ generated flipbook cards
const SHEETS = {
  ground: 'assets/fx/fire-ground-loop.webp', burst: 'assets/fx/fire-ring-burst.webp', pillar: 'assets/fx/fire-pillar.webp',
  smoke: 'assets/fx/fire-smoke.webp', ember: 'assets/fx/fire-embers.webp',
};
// Art provenance switch (v8): the five sheets came from GPT Image 2 via treg, not Higgsfield. `?nofireart` (or
// FIRE_ART = false, or any sheet failing to load) swaps every card for a shader-only stand-in (cel-fire tongues,
// inked smoke and ember shapes), so the files can be dropped without breaking the fire.
export let FIRE_ART = typeof location === 'undefined' || !/[?&]nofireart/.test(location.search);
const tex = {};
function sheet(k) {
  if (!tex[k]) { const t = new THREE.TextureLoader().load(SHEETS[k], undefined, undefined, () => { FIRE_ART = false; }); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; tex[k] = t; }
  return tex[k];
}
export function preloadFireSheets() { for (const k in SHEETS) sheet(k); }
const CARD_VERT = /* glsl */`
  uniform float uBill; uniform vec2 uSize, uAnchor;
  varying vec2 vUv; varying float vNear;
  void main() {
    vUv = uv;
    vec2 q = (position.xy + uAnchor) * uSize;
    vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vNear = 1.0 - smoothstep(1.4, 3.4, distance(c + vec3(0.0, uSize.y * 0.5, 0.0), cameraPosition));
    vec3 wp;
    if (uBill > 1.5) {          // spherical: camera right and up
      vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      wp = c + r * q.x + u * q.y;
    } else if (uBill > 0.5) {   // cylindrical: stands up, turns to the camera
      vec3 f = cameraPosition - c; f.y = 0.0; f = length(f) > 1e-4 ? normalize(f) : vec3(0.0, 0.0, 1.0);
      wp = c + vec3(f.z, 0.0, -f.x) * q.x + vec3(0.0, q.y, 0.0);
    } else {                    // fixed in the world (ground decals, standing ring cards)
      wp = (modelMatrix * vec4(q, 0.0, 1.0)).xyz;
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
const CARD_FRAG = /* glsl */`
  uniform sampler2D map; uniform float uFrame, uCut, uSeed; uniform vec3 uTint;
  varying vec2 vUv; varying float vNear;
  ${NOISE}
  void main() {
    vec4 c = texture2D(map, vec2((floor(uFrame) + vUv.x) / 8.0, vUv.y));
    // dissolve by noise as uCut rises (no alpha fade: the shape breaks up and its edge stays crisp)
    float n = vn(vec3(vUv * 7.0, uSeed));
    if (c.a - max(uCut, vNear) * (0.55 + n * 0.9) < 0.5) discard;
    gl_FragColor = vec4(c.rgb * uTint, 1.0);
    #include <colorspace_fragment>
  }`;
const PLANE = new THREE.PlaneGeometry(1, 1);
// o: { bill: 0 fixed | 1 cylindrical | 2 spherical, w, h, anchor: 'bottom' | 'center', tint }
export function card(k, o = {}) {
  if (!FIRE_ART) return shaderCard(k, o);
  const u = {
    map: { value: sheet(k) }, uFrame: { value: 0 }, uCut: { value: 0 }, uSeed: { value: Math.random() * 30 },
    uBill: { value: o.bill ?? 1 }, uSize: { value: new THREE.Vector2(o.w ?? 1, o.h ?? o.w ?? 1) },
    uAnchor: { value: new THREE.Vector2(0, o.anchor === 'center' ? 0 : 0.5) }, uTint: { value: new THREE.Color(o.tint ?? 0xffffff) },
  };
  const m = new THREE.Mesh(PLANE, new THREE.ShaderMaterial({ uniforms: u, vertexShader: CARD_VERT, fragmentShader: CARD_FRAG, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = 3;
  return { m, u };
}

// ------------------------------------------------------------------ the scorch decal and the tell ring
const DECAL_FRAG = /* glsl */`
  uniform float uCut, uSeed; uniform vec3 uCol;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
    float edge = 0.78 + (vn(vec3(cos(a) * 2.2, sin(a) * 2.2, uSeed)) - 0.5) * 0.45;   // a ragged burnt edge
    float n = vn(vec3(p * 4.0, uSeed + 3.0));
    float m = edge - r - uCut * (0.4 + n * 0.9);
    if (m < 0.0) discard;
    vec3 c = m < 0.035 ? vec3(${inkCol}) : (n > 0.62 && r < edge * 0.7 ? uCol * 1.6 : uCol);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;
const DECAL_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GROUND = (() => { const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2); return g; })();
export function scorch(radius) {
  const u = { uCut: { value: 0 }, uSeed: { value: Math.random() * 30 }, uCol: { value: new THREE.Color(0x2b1a16) } };
  const m = new THREE.Mesh(GROUND, new THREE.ShaderMaterial({ uniforms: u, vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.scale.setScalar(radius); m.renderOrder = 2;
  return { m, u };
}
// the tell: an inked ring that draws itself on round the area, and heat lines wavering inside it
const TELL_FRAG = /* glsl */`
  uniform float uDraw, uTime, uCut; uniform vec3 uHot, uRim;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x) / 6.2831853 + 0.5;
    if (a > uDraw || r > 1.0) discard;
    vec3 c; bool on = false;
    float band = abs(r - 0.9);
    if (band < 0.075) { on = true; c = band > 0.045 ? vec3(${inkCol}) : uRim; }
    // heat shimmer: wavy rings creeping inward, on twos
    float w = r + sin(a * 6.2831853 * 7.0 + uTime * 9.0) * 0.025;
    float k = fract(w * 3.2 + uTime * 1.6);
    if (!on && r < 0.8 && k < 0.12 && vn(vec3(p * 5.0, uTime * 2.0)) > 0.42) { on = true; c = k < 0.04 ? uRim : uHot; }
    if (!on) discard;
    if (vn(vec3(p * 9.0, 1.0)) < uCut) discard;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;
export function tellRing(radius) {
  const u = { uDraw: { value: 0 }, uTime: { value: 0 }, uCut: { value: 0 }, uHot: { value: new THREE.Color(0xffb04a) }, uRim: { value: new THREE.Color(0xd2401c) } };
  const m = new THREE.Mesh(GROUND, new THREE.ShaderMaterial({ uniforms: u, vertexShader: DECAL_VERT, fragmentShader: TELL_FRAG,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  m.scale.setScalar(radius); m.renderOrder = 2;
  return { m, u };
}

// the shader-only stand-in for a flipbook card: the same uniforms (uFrame, uCut, uSize), read every render
const SMOKE_PAL = { rim: 0x8d837c, body: 0xbdb3aa, core: 0xd9d0c6 }, EMBER_PAL = { rim: 0xc0381a, body: 0xffa526, core: 0xfff27a };
const ROCK = new THREE.IcosahedronGeometry(1, 2), DIAM = new THREE.OctahedronGeometry(1, 0);
function shaderCard(k, o) {
  const smoke = k === 'smoke', ember = k === 'ember';
  const F = celFire({ pal: smoke ? SMOKE_PAL : ember ? EMBER_PAL : PAL.fire, wob: smoke || ember ? 0.02 : 0.18, tip: smoke ? 0.6 : 0.42, freq: smoke ? [1.4, 1.4, 1.4] : undefined, scroll: smoke ? 0.8 : 2.6 });
  const u = { ...F.u, uFrame: { value: 0 }, uCut: { value: 0 }, uSize: { value: new THREE.Vector2(o.w ?? 1, o.h ?? o.w ?? 1) }, uBill: { value: o.bill ?? 1 } };
  const m = new THREE.Mesh(smoke ? ROCK : ember ? DIAM : TONGUE, F.mat); m.frustumCulled = false; m.renderOrder = 3;
  m.onBeforeRender = () => {
    const w = u.uSize.value.x, h = u.uSize.value.y, f = u.uFrame.value;
    // looping ground fire keeps its height; bursts and pillars swell then die over their 8 frames
    const env = k === 'ground' ? 0.8 + 0.2 * Math.sin(f * 0.8) : k === 'burst' || k === 'pillar' ? Math.sin(Math.min(1, (f + 1) / 8) * Math.PI) : 1;
    if (smoke) m.scale.setScalar(w * 0.32 * (0.6 + f * 0.06));
    else if (ember) m.scale.set(w * 0.22, w * 0.45, w * 0.22);
    else m.scale.set(w * (k === 'pillar' ? 0.16 : 0.17), Math.max(0.01, h * (k === 'pillar' ? 0.95 : 0.85) * env), w * (k === 'pillar' ? 0.16 : 0.17));
    F.u.uTime.value = FireClock.ts; F.u.uErode.value = Math.max(u.uCut.value, smoke ? Math.max(0, (f - 5) / 3) : 0);
  };
  return { m, u };
}
