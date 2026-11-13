// Cel shading: a 3-step gradient map on MeshToonMaterial, and inverted-hull ink outlines
// (static and skinned). Adapted from the first 3D mock-up.
import * as THREE from 'three';

export const INK = 0x1d1620;

function makeGradient(stops) {
  const data = new Uint8Array(stops.length);
  stops.forEach((v, i) => { data[i] = Math.round(v * 255); });
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
// three tones: shadow, half, light
export const GRADIENT = makeGradient([0.0, 0.0, 0.0, 0.42, 0.42, 1, 1, 1]);
export const GRADIENT_SOFT = makeGradient([0.25, 0.25, 0.25, 0.6, 0.6, 1, 1, 1]);

const cache = new Map();
export function toon(color, opts = {}) {
  const cacheable = !opts.map && !opts.unique && !opts.transparent && opts.emissive === undefined;
  const key = color + '|' + (opts.soft ? 1 : 0);
  if (cacheable && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: opts.soft ? GRADIENT_SOFT : GRADIENT, map: opts.map || null,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide,
  });
  if (opts.emissive !== undefined) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
  if (cacheable) cache.set(key, m);
  return m;
}

// Outline normals: averaged per position so hard-edged boxes get closed hulls.
function ensureOutlineNormals(geo) {
  if (geo.attributes.oNormal) return;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position, nor = geo.attributes.normal, acc = new Map();
  const keyOf = (i) => `${Math.round(pos.getX(i) * 1e3)},${Math.round(pos.getY(i) * 1e3)},${Math.round(pos.getZ(i) * 1e3)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(i); let a = acc.get(k); if (!a) { a = [0, 0, 0]; acc.set(k, a); }
    a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(keyOf(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  geo.setAttribute('oNormal', new THREE.BufferAttribute(out, 3));
}

const oCache = new Map();
// skinned: uses the mesh's own normals through the skinning chunks
export function outlineMaterial(thick = 1, color = INK, skinned = false) {
  const key = thick + '|' + color + '|' + skinned;
  if (oCache.has(key)) return oCache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uThick: { value: thick } }]),
    vertexShader: /* glsl */`
      ${skinned ? '' : 'attribute vec3 oNormal;'}
      uniform float uThick;
      #include <common>
      #include <skinning_pars_vertex>
      #include <fog_pars_vertex>
      void main() {
        ${skinned ? `
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        ` : `vec3 objectNormal = oNormal; vec3 transformed = position;`}
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        vec3 n = normalize(normalMatrix * objectNormal);
        float d = clamp(-mvPosition.z, 2.5, 90.0);
        mvPosition.xyz += n * uThick * (0.012 + d * 0.0021);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, fog: true,
  });
  oCache.set(key, m);
  return m;
}

export function addOutline(mesh, thick = 1, color = INK) {
  let o;
  if (mesh.isSkinnedMesh) {
    o = new THREE.SkinnedMesh(mesh.geometry, outlineMaterial(thick, color, true));
    o.bind(mesh.skeleton, mesh.bindMatrix);
    o.bindMode = mesh.bindMode;
    o.frustumCulled = false;
  } else {
    ensureOutlineNormals(mesh.geometry);
    o = new THREE.Mesh(mesh.geometry, outlineMaterial(thick, color));
  }
  o.userData.isOutline = true;
  o.castShadow = false; o.receiveShadow = false;
  o.matrixAutoUpdate = false;
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

export function outlineAll(root, thick = 1, color = INK) {
  const list = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.isOutline && !o.userData.noOutline) list.push(o); });
  list.forEach((m) => addOutline(m, thick, color));
}

export function part(geo, mat, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
  if (o.scale !== undefined) { if (Array.isArray(o.scale)) m.scale.set(o.scale[0], o.scale[1], o.scale[2]); else m.scale.setScalar(o.scale); }
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  if (o.outline !== false) addOutline(m, typeof o.outline === 'number' ? o.outline : 1, o.ink ?? INK);
  else m.userData.noOutline = true;
  if (o.parent) o.parent.add(m);
  return m;
}

export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
  t.anisotropy = 8;
  return t;
}

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// v3 (3D-DIRECTION "look pushed further" 2 and 3): characters get ONE hard shadow tone, hue-shifted to a cool
// purple-brown instead of a darker copy of the base, no gradient and no specular; the head (every vertex
// skinned mostly to the Head bone) is lit flat, so faces read like a drawing, never blotchy.
export const CEL = { threshold: { value: 0.62 }, shadow: { value: new THREE.Color(0.66, 0.58, 0.78) }, light: { value: new THREE.Color(1.04, 1.0, 0.95) }, on: { value: 1 } };
export function celCharacter(m, headIndex = -1) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCelT = CEL.threshold; sh.uniforms.uCelS = CEL.shadow; sh.uniforms.uCelL = CEL.light; sh.uniforms.uCelOn = CEL.on; sh.uniforms.uHead = { value: headIndex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vFace; uniform float uHead;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vFace = 0.0;
        #ifdef USE_SKINNING
        if (uHead >= 0.0) { vFace += abs(skinIndex.x - uHead) < 0.5 ? skinWeight.x : 0.0; vFace += abs(skinIndex.y - uHead) < 0.5 ? skinWeight.y : 0.0; vFace += abs(skinIndex.z - uHead) < 0.5 ? skinWeight.z : 0.0; vFace += abs(skinIndex.w - uHead) < 0.5 ? skinWeight.w : 0.0; }
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFace; uniform float uCelT, uCelOn; uniform vec3 uCelS, uCelL;')
      .replace('#include <opaque_fragment>', `
        if (uCelOn > 0.5) {
          vec3 baseC = diffuseColor.rgb;
          float litAmt = dot(outgoingLight, vec3(0.299, 0.587, 0.114)) / max(dot(baseC, vec3(0.299, 0.587, 0.114)), 1e-3);
          float lit = max(step(uCelT, litAmt), step(0.55, vFace));
          outgoingLight = baseC * mix(uCelS, uCelL, lit) + totalEmissiveRadiance;
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'cel' + headIndex;
  return m;
}

// Turn any loaded GLB into cel-shaded, ink-outlined, non-shiny meshes (keeps the base colour texture).
export function toonify(root, { outline = 1, ink = INK, soft = false, character = false } = {}) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.isOutline) meshes.push(o); });
  for (const o of meshes) {
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    const m = new THREE.MeshToonMaterial({ color: 0xffffff, map: src.map || null, gradientMap: soft ? GRADIENT_SOFT : GRADIENT });
    if (!src.map && src.color) m.color.copy(src.color);
    if (src.map) src.map.anisotropy = 8;
    o.material = m;
    if (character && o.isSkinnedMesh) celCharacter(m, o.skeleton.bones.findIndex((b) => b.name === 'Head'));
    o.castShadow = true; o.receiveShadow = true;
    if (outline) addOutline(o, outline, ink);
  }
  return root;
}
