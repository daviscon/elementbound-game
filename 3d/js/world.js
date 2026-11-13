// Kite Hill: cliff path -> gate pavilion and training yard -> lower courtyard (open east cliff) ->
// stairs -> middle terrace with a raised walkway -> stairs -> the bell terrace (Captain arena).
// Collision is simple and exact: walkable surfaces (boxes, ramps, discs) give ground height, solid
// boxes push sideways, and a list of meshes is used for camera, aim and projectile raycasts.
import * as THREE from 'three';
import { toon, part, addOutline, rng, INK, GRADIENT } from './toon.js';
import { tex, Props } from './assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HAZE = 0xe9c9b0;
export const SUN = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
const R = rng(1234), R0 = R;

export const World = {
  surfaces: [], solids: [], rayMeshes: [], scene: null, clouds: [], fires: [], tiles: [], spots: {},
  // highest walkable surface under (x,z) whose top is at or below y+step
  ground(x, z, y = 999, step = 0.55) {
    let best = -Infinity;
    for (const s of this.surfaces) {
      if (s.off) continue;
      let h;
      if (s.type === 'disc') { if ((x - s.x) ** 2 + (z - s.z) ** 2 > s.r * s.r) continue; h = s.y; }
      else { if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue; h = s.type === 'ramp' ? s.ya + (s.yb - s.ya) * ((s.z1 - z) / (s.z1 - s.z0)) : s.y; }
      if (h <= y + step && h > best) best = h;
    }
    return best;
  },
  // push a circle (x,z,r) at height range [y, y+h] out of solid boxes; returns corrected {x,z,hit}
  collide(x, z, r, y, h = 1.6) {
    let hit = false;
    for (const b of this.solids) {
      if (b.off || y + h < b.y0 || y > b.y1 - 0.05) continue;
      const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; x += dx * k; z += dz * k; }
        else { // centre inside: push out along the shallowest axis
          const o = [[b.x0 - r - x, 0], [b.x1 + r - x, 0], [0, b.z0 - r - z], [0, b.z1 + r - z]].sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]))[0];
          x += o[0]; z += o[1];
        }
      }
    }
    return { x, z, hit };
  },
};

function uvWorld(geo, scale = 0.25) {
  // planar UVs by face normal, in world units (so the flagstones tile at a constant size)
  geo = geo.toNonIndexed(); geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

let flagMat, plasterMat, rockMat, rockDark, woodMat, roofMat, pillarMat, stoneMat, grassMat;
function stoneTexture() {
  // dressed stone blocks with ink mortar lines, in the 2D game's warm rock colours
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); const r = rng(77);
  x.fillStyle = '#3a2e30'; x.fillRect(0, 0, 512, 512);
  const rows = 8, rh = 512 / rows;
  for (let j = 0; j < rows; j++) {
    let px = -r() * 60;
    while (px < 512) {
      const w = 70 + r() * 80, t = 0.88 + r() * 0.2;
      const base = [206 * t, 176 * t, 138 * t];   // v4: warmer, so shaded stone reads sandstone, not grey
      x.fillStyle = `rgb(${base.map((v) => Math.min(255, v | 0)).join(',')})`;
      x.beginPath(); x.roundRect(px + 3, j * rh + 3, w - 6, rh - 6, 5); x.fill();
      x.fillStyle = 'rgba(255,240,215,0.25)'; x.fillRect(px + 6, j * rh + 6, w - 12, 5);
      x.fillStyle = 'rgba(60,40,40,0.18)'; x.fillRect(px + 6, j * rh + rh - 13, w - 12, 7);
      if (r() < 0.2) { x.strokeStyle = 'rgba(40,28,30,0.6)'; x.lineWidth = 2; x.beginPath(); const cx = px + w * r(); x.moveTo(cx, j * rh + 4); x.lineTo(cx + 8 - r() * 16, j * rh + rh * 0.6); x.stroke(); }
      if (px + w > 512) { x.fillStyle = `rgb(${base.map((v) => Math.min(255, v | 0)).join(',')})`; x.beginPath(); x.roundRect(px + 3 - 512, j * rh + 3, w - 6, rh - 6, 5); x.fill(); }
      px += w;
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function plasterTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const r = rng(5);
  x.fillStyle = '#efe3cb'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${200 + r() * 30},${180 + r() * 30},${150 + r() * 20},0.18)`; x.beginPath(); x.ellipse(r() * 256, r() * 256, 20 + r() * 40, 8 + r() * 14, 0, 0, 7); x.fill(); }
  // a red-brown skirt band at the base
  x.fillStyle = '#9c4a3a'; x.fillRect(0, 226, 256, 30); x.fillStyle = '#1d1620'; x.fillRect(0, 222, 256, 5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
// v4 (notes 20 and 29): painted rock in the 2D game's warm rock colours: big flat planes, a lit top edge, ink cracks
function rockTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const r = rng(31);
  x.fillStyle = '#c29572'; x.fillRect(0, 0, 256, 256);
  const tones = ['#b5876a', '#d2a47c', '#a97c64', '#dbb48a', '#b88a72'];
  for (let i = 0; i < 46; i++) {   // flat facet patches (wrap-safe: drawn 3x3)
    const cx = r() * 256, cy = r() * 256, w = 30 + r() * 60, h = 16 + r() * 30, col = tones[i % tones.length];
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { x.fillStyle = col; x.beginPath(); x.moveTo(cx + ox - w / 2, cy + oy); x.lineTo(cx + ox - w * 0.2, cy + oy - h / 2); x.lineTo(cx + ox + w / 2, cy + oy - h * 0.3); x.lineTo(cx + ox + w * 0.3, cy + oy + h / 2); x.closePath(); x.fill(); }
  }
  x.lineCap = 'round';
  for (let i = 0; i < 16; i++) {   // ink cracks with a lit lip above each
    let px = r() * 256, py = r() * 256; const pts = [[px, py]];
    for (let k = 0; k < 4; k++) { px += 8 + r() * 16; py += (r() - 0.5) * 14; pts.push([px, py]); }
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      x.strokeStyle = 'rgba(255,236,206,0.55)'; x.lineWidth = 3; x.beginPath(); pts.forEach(([a, b], j) => (j ? x.lineTo : x.moveTo).call(x, a + ox, b + oy - 3)); x.stroke();
      x.strokeStyle = 'rgba(42,30,36,0.75)'; x.lineWidth = 2.2; x.beginPath(); pts.forEach(([a, b], j) => (j ? x.lineTo : x.moveTo).call(x, a + ox, b + oy)); x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function paintTexture(base, cols, n, seed, stroke) {   // grass, bark, leaves: dabs of flat colour over a base
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < n; i++) { const cx = r() * 128, cy = r() * 128; x.fillStyle = cols[i % cols.length]; for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) { x.beginPath(); if (stroke) x.ellipse(cx + ox, cy + oy, 2 + r() * 2, 9 + r() * 14, 0, 0, 7); else x.ellipse(cx + ox, cy + oy, 6 + r() * 10, 4 + r() * 6, r() * 3, 0, 7); x.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
let leafMats, barkMat;
function mats() {
  const ft = tex('assets/env/tex-flagstones.webp'); ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
  flagMat = toon(0xffffff, { map: ft, unique: true });
  const rt = rockTexture();
  plasterMat = toon(0xffffff, { map: plasterTexture(), unique: true }); rockMat = toon(0xffffff, { map: rt, unique: true }); rockDark = toon(0x9a8a96, { map: rt, unique: true }); woodMat = toon(0x7a4a32);
  roofMat = toon(0x4d5a6e); pillarMat = toon(0xa8423a); stoneMat = toon(0xffffff, { map: stoneTexture(), unique: true });
  grassMat = toon(0xffffff, { map: paintTexture('#86a35c', ['#97b466', '#76934f', '#a3bd6e'], 60, 41), unique: true });
  rockMat.userData.alt = toon(0xe6dccc, { map: rt, unique: true });
  barkMat = toon(0xffffff, { map: paintTexture('#7a4a32', ['#5e3626', '#8e5a3c', '#4a2a22'], 40, 17, true), unique: true });
  // the 2D game's greens: deep shadow green, mid leaf, sunlit yellow-green
  leafMats = ['#4f7a4a', '#5f8f52', '#7fae5e'].map((b, i) => toon(0xffffff, { map: paintTexture(b, ['rgba(255,250,200,0.16)', 'rgba(30,50,40,0.18)'], 34, 50 + i), unique: true }));
}

// a walkable slab: visual box with flagstone top + rock sides down to `bottom`
function slab(x0, x1, z0, z1, y, o = {}) {
  const bottom = o.bottom ?? y - 1.2;
  const g = uvWorld(new THREE.BoxGeometry(x1 - x0, y - bottom, z1 - z0).translate((x0 + x1) / 2, (y + bottom) / 2, (z0 + z1) / 2), 0.22);
  const m = part(g, o.mat || flagMat, { parent: World.scene, cast: false });
  m.receiveShadow = true;
  World.surfaces.push({ type: 'box', x0, x1, z0, z1, y });
  World.rayMeshes.push(m);
  if (o.solid !== false) World.solids.push({ x0, x1, z0, z1, y0: bottom, y1: y - 0.01, ground: true });
  return m;
}
function wall(x0, x1, z0, z1, y0, y1, mat = stoneMat, o = {}) {
  const g = uvWorld(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), 0.4);
  if (mat === plasterMat) {   // plaster: the skirt band sits at the foot of every wall
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) if (Math.abs(n.getY(i)) < 0.5) uv.setY(i, Math.min(1, (p.getY(i) - y0) / Math.max(2.5, y1 - y0) * 1.0));
  }
  const m = part(g, mat, { parent: World.scene });
  const s = { x0, x1, z0, z1, y0, y1 };
  World.solids.push(s); World.rayMeshes.push(m);
  if (o.walkTop) World.surfaces.push({ type: 'box', x0, x1, z0, z1, y: y1 });
  m.userData.solid = s;
  return m;
}
// a visual-only plaster wall (collision lives in another box) that the wall-section kit dresses when it arrives
function dressBox(x0, x1, z0, z1, y0, y1) {
  const g = uvWorld(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), 0.4);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) if (Math.abs(n.getY(i)) < 0.5) uv.setY(i, Math.min(1, (p.getY(i) - y0) / Math.max(2.5, y1 - y0)));
  const m = part(g, plasterMat, { parent: World.scene });
  m.userData.solid = { x0, x1, z0, z1, y0, y1 };
  return m;
}
function ramp(x0, x1, z0, z1, ya, yb, steps = 10) {
  // stairs going north (z decreasing): ya at z1, yb at z0
  World.surfaces.push({ type: 'ramp', x0, x1, z0, z1, ya, yb });
  const d = (z1 - z0) / steps, hStep = (yb - ya) / steps;
  for (let i = 0; i < steps; i++) {
    const top = ya + hStep * (i + 1), zf = z1 - d * i;
    const g = uvWorld(new THREE.BoxGeometry(x1 - x0, top - (ya - 1), d).translate((x0 + x1) / 2, (top + ya - 1) / 2, zf - d / 2), 0.3);
    const m = part(g, stoneMat, { parent: World.scene }); World.rayMeshes.push(m);
  }
}
// low-poly rock: a squashed, jittered icosahedron
function rock(x, y, z, sx, sy, sz, mat = rockMat, rot = 0) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const seed = R() * 100;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.85 + 0.25 * (0.5 + 0.5 * Math.sin(x * 12.9 + y * 78.2 + z * 37.7 + seed)); p.setXYZ(i, x * k, y * k, z * k); }
  g.computeVertexNormals();
  const m = part(uvWorld(g, 0.7), mat, { parent: World.scene, pos: [x, y, z], scale: [sx, sy, sz], rot: [0, rot, 0] });
  return m;
}
// tall cliff column under a platform edge
function cliff(x, z, w, top, depth = 70, cap = true) {
  const g = new THREE.CylinderGeometry(w * 0.85, w * 1.25, depth, 7, 4);
  const p = g.attributes.position;
  const seed = R() * 100;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const h = Math.sin(x * 3.1 + y * 0.7 + z * 5.3 + seed); const k = 1 + h * 0.14; p.setX(i, x * k); p.setZ(i, z * k); if (y > depth / 2 - 0.1) p.setY(i, y - (0.5 + 0.5 * h) * 1.5); }
  g.computeVertexNormals();
  const m = part(uvWorld(g, 0.18), R() < 0.5 ? rockMat : rockMat.userData.alt, { parent: World.scene, pos: [x, top - depth / 2 - 0.4, z], rot: [0, R() * 6, 0], outline: 1.2 });
  m.receiveShadow = true;
  // green cap like the painted mountains
  if (cap && R() < 0.6) { const c = part(new THREE.SphereGeometry(w * 0.9, 7, 4, 0, 6.3, 0, 1.0), grassMat, { parent: World.scene, pos: [x, top - 1.8, z], scale: [1, 0.5, 1] }); c.receiveShadow = true; }
  return m;
}
// v4 (note 29): a toon tree like the 2D game's: a leaning painted-bark trunk with two boughs, and layered
// foliage clumps (lumpy blobs, shadow green under, sunlit green on top), every piece ink-outlined
function blob(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 1); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.86 + 0.2 * (0.5 + 0.5 * Math.sin(x * 7.1 + y * 5.3 + z * 9.7 + seed)); p.setXYZ(i, x * k, y * k * 0.72, z * k); }
  return uvWorld(g, 0.9);
}
function pine(x, y, z, s = 1, R = R0, parent = World.scene) {   // v6: optional rng stream and parent (sea-column dressing)
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); g.rotation.y = R() * 6; parent.add(g);
  part(uvWorld(new THREE.CylinderGeometry(0.13, 0.24, 2.4, 7).translate(0, 1.2, 0), 1.2), barkMat, { parent: g, rot: [0, 0, 0.08] });
  for (const [a, h] of [[0.9, 1.5], [-1.0, 1.9]]) part(uvWorld(new THREE.CylinderGeometry(0.05, 0.08, 0.9, 5).translate(0, 0.45, 0), 1.2), barkMat, { parent: g, pos: [0.1, h, 0], rot: [0, a * 2, a] });
  // three tiers of clumps: wide and dark at the bottom, small and sunlit at the crown
  const tiers = [[2.0, 1.15, 5, 0.62, 0], [2.85, 0.85, 4, 0.55, 1], [3.55, 0.45, 2, 0.5, 2]];
  for (const [h, rad, n, r, tone] of tiers) {
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + tone; part(blob(r + R() * 0.15, R() * 50), leafMats[tone], { parent: g, pos: [Math.cos(a) * rad, h + (R() - 0.5) * 0.25, Math.sin(a) * rad], outline: 1.1 }); }
    part(blob(rad * 0.9 + 0.3, R() * 50), leafMats[Math.min(2, tone + (tone ? 0 : 1))], { parent: g, pos: [0, h + 0.15, 0], outline: 1.1 });
  }
  return g;
}
function lantern(x, y, z, o = {}) {   // v6: o.parent, o.s (scale), o.solid === false for scenery out of reach
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(o.s ?? 1); (o.parent || World.scene).add(g);
  part(new THREE.CylinderGeometry(0.42, 0.5, 0.25, 8), stoneMat, { parent: g, pos: [0, 0.12, 0] });
  part(new THREE.CylinderGeometry(0.14, 0.18, 0.9, 8), stoneMat, { parent: g, pos: [0, 0.7, 0] });
  part(new THREE.BoxGeometry(0.62, 0.12, 0.62), stoneMat, { parent: g, pos: [0, 1.18, 0] });
  part(new THREE.BoxGeometry(0.44, 0.44, 0.44), toon(0xffd98a, { emissive: 0xffb44a, emissiveIntensity: 0.6 }), { parent: g, pos: [0, 1.46, 0] });
  part(new THREE.ConeGeometry(0.62, 0.42, 4), stoneMat, { parent: g, pos: [0, 1.86, 0], rot: [0, Math.PI / 4, 0] });
  if (o.solid === false) return g;
  World.solids.push({ x0: x - 0.45, x1: x + 0.45, z0: z - 0.45, z1: z + 0.45, y0: y, y1: y + 2.1 });
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(x, y + 1, z); World.scene.add(hit); World.rayMeshes.push(hit);
  return g;
}
// curved temple roof: an extruded sweep with upturned eaves
function roof(cx, cy, cz, w, d, h, rotY = 0, parent = World.scene) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2 - 0.9, 0.35); s.quadraticCurveTo(-d / 2 + 0.4, -0.05, -d * 0.18, h * 0.7); s.lineTo(0, h); s.lineTo(d * 0.18, h * 0.7); s.quadraticCurveTo(d / 2 - 0.4, -0.05, d / 2 + 0.9, 0.35); s.lineTo(d / 2 + 0.9, 0.05); s.lineTo(-d / 2 - 0.9, 0.05);
  const g = new THREE.ExtrudeGeometry(s, { depth: w + 1.6, bevelEnabled: false });
  g.translate(0, 0, -(w + 1.6) / 2);
  const m = part(g, roofMat, { parent, pos: [cx, cy, cz], rot: [0, rotY + Math.PI / 2, 0], outline: 1.3 });
  m.userData.ridge = part(new THREE.BoxGeometry(w + 1.8, 0.3, 0.35), pillarMat, { parent, pos: [cx, cy + h + 0.05, cz], rot: [0, rotY, 0] });
  return m;
}
function hall(x0, x1, z0, z1, y, hgt, rotY = 0) {
  // plaster walls, red pillars, dark roof
  wall(x0, x1, z0, z1, y, y + hgt, plasterMat);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  const along = d > w;
  const n = Math.floor((along ? d : w) / 3);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = along ? x1 + 0.15 : x0 + w * t, pz = along ? z0 + d * t : z1 + 0.15;
    part(new THREE.CylinderGeometry(0.2, 0.22, hgt, 8), pillarMat, { parent: World.scene, pos: [px, y + hgt / 2, pz] });
  }
  // windows: dark lattice panels
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const px = along ? x1 + 0.03 : x0 + w * t, pz = along ? z0 + d * t : z1 + 0.03;
    part(new THREE.BoxGeometry(along ? 0.05 : 1.6, 1.4, along ? 1.6 : 0.05), toon(0x5a3a2c), { parent: World.scene, pos: [px, y + hgt * 0.55, pz], outline: false });
  }
  roof(cx, y + hgt, cz, along ? d : w, along ? w : d, 2.4, along ? Math.PI / 2 : 0);
}

// v5 (note 38): a building's footing: a dressed-stone plinth under the whole footprint, and a painted rock mass
// below it down into the mountain, so nothing hovers over a rock column
const R5 = rng(5005);   // v5 dressing has its own stream so the rest of the map keeps its layout
function footing(x0, x1, z0, z1, top, depth = 30, plinth = 1.6) {
  part(uvWorld(new THREE.BoxGeometry(x1 - x0, plinth, z1 - z0).translate((x0 + x1) / 2, top - plinth / 2, (z0 + z1) / 2), 0.4), stoneMat, { parent: World.scene, outline: 1.2 });
  const w = x1 - x0 - 0.5, d = z1 - z0 - 0.5, h = depth - plinth;
  const g = new THREE.BoxGeometry(w, h, d, 4, 6, 4), p = g.attributes.position, seed = R5() * 100;
  for (let i = 0; i < p.count; i++) {   // taper toward the bottom, jitter the faces into rough planes
    const y = p.getY(i), u = 0.5 - y / h, k = 1 - u * 0.35, n = Math.sin(p.getX(i) * 1.7 + y * 0.9 + p.getZ(i) * 2.3 + seed) * 0.35;
    p.setX(i, p.getX(i) * k + n); p.setZ(i, p.getZ(i) * k - n);
  }
  g.translate((x0 + x1) / 2, top - plinth - h / 2, (z0 + z1) / 2); g.computeVertexNormals();
  const m = part(uvWorld(g, 0.18), rockMat, { parent: World.scene, outline: 1.2 }); m.receiveShadow = true;
  return m;
}
// v5 (note 35): a hand-built rock spire for the arena edge: three stacked, leaning, tapering faceted pieces
function spire(x, y, z, h, r, lean, rotY) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(lean, rotY, lean * 0.5); World.scene.add(g);
  let yy = 0, rr = r;
  for (const [f, sh] of [[0.5, 0], [0.32, 0.25], [0.18, -0.2]]) {
    const ph = h * f, geo = new THREE.CylinderGeometry(rr * 0.72, rr, ph, 6, 2), p = geo.attributes.position, seed = R5() * 100;
    for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getX(i) * 4.1 + p.getY(i) * 1.3 + p.getZ(i) * 3.7 + seed) * 0.12; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    geo.computeVertexNormals();
    part(uvWorld(geo, 0.5), yy ? rockMat.userData.alt : rockMat, { parent: g, pos: [sh * r * 0.3, yy + ph / 2, -sh * r * 0.2], rot: [0, R5() * 3, 0], outline: 1.3 });
    yy += ph * 0.92; rr *= 0.7;
  }
  World.solids.push({ x0: x - r * 0.8, x1: x + r * 0.8, z0: z - r * 0.8, z1: z + r * 0.8, y0: y, y1: y + h });
  return g;
}

// v6: the cloud-sea columns were bare stumps. Each now carries a little scene: a pine grove, a roadside shrine
// with banners, or a stone lantern under pines. Its own rng stream (nothing else moves), every piece set on the
// column's real top (a ray down onto the rock or its grass cap, so nothing hovers or sinks), and the pieces of all
// eighteen merged per material into a handful of meshes. They are all far scenery (60 m+ out, 10-30 m under the
// walkways), so the far pass would strip their ink lines anyway; none of it is walkable or near a camera.
const R6 = rng(6006);
function dressSeaColumns(cols) {
  const hold = new THREE.Group(), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  const cloth = [0xa8423a, 0xefe3cb, 0x4d5a6e].map((col) => toon(col, { side: THREE.DoubleSide, unique: true }));
  const gold = toon(0xc9a24a);
  cols.forEach((c, ci) => {
    const near = World.scene.children.filter((o) => o.isMesh && !World.clouds.includes(o) && Math.hypot(o.position.x - c.x, o.position.z - c.z) < c.w * 1.6 && o.position.y < c.top + 6);
    for (const o of near) o.updateMatrixWorld();
    const ground = (x, z) => { ray.set(new THREE.Vector3(x, c.top + 15, z), down); const h = ray.intersectObjects(near, false)[0]; return h ? h.point.y : c.top - 1.2; };
    const at = (a, f) => [c.x + Math.cos(a) * f * c.w, c.z + Math.sin(a) * f * c.w];
    const lowest = (x, z, r) => Math.min(...[[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dz]) => ground(x + dx, z + dz)));
    const tree = (a, f, s) => { const [x, z] = at(a, f); pine(x, lowest(x, z, 0.25 * s) - 0.12 * s, z, s, R6, hold); };
    const banner = (a, f, col) => {
      const [x, z] = at(a, f), y = lowest(x, z, 0.2) - 0.3, g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = R6() * 6.28; hold.add(g);
      part(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6).translate(0, 3.2, 0), woodMat, { parent: g, outline: false });
      part(new THREE.BoxGeometry(1.7, 0.12, 0.12), woodMat, { parent: g, pos: [0.65, 6.0, 0], outline: false });
      part(new THREE.SphereGeometry(0.2, 8, 6), gold, { parent: g, pos: [0, 6.5, 0], outline: false });
      const geo = new THREE.PlaneGeometry(1.2, 3.4, 1, 6), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const u = 0.5 - p.getY(i) / 3.4; p.setZ(i, Math.sin(u * 4 + ci) * 0.18 * u); if (u > 0.98) p.setX(i, p.getX(i) * 0.4); }   // a ripple, a swallowtail-ish point
      geo.computeVertexNormals();
      part(geo, cloth[col], { parent: g, pos: [0.8, 6.0 - 1.75, 0.08], outline: false });
    };
    const shrine = (a, f, k) => {   // a small roadside shrine on a stepped plinth that reaches down over the slope
      const [x, z] = at(a, f), hw = 1.9 * k, lo = lowest(x, z, hw), hi = Math.max(...[[hw, hw], [-hw, hw], [hw, -hw], [-hw, -hw], [0, 0]].map(([dx, dz]) => ground(x + dx, z + dz)));
      const base = hi + 0.35 * k, rot = Math.atan2(c.x - x, c.z - z) + Math.PI, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; hold.add(g);
      part(new THREE.BoxGeometry(hw * 2, base - lo + 0.4, hw * 2).translate(0, (base + lo - 0.4) / 2, 0), stoneMat, { parent: g, outline: false });
      part(new THREE.BoxGeometry(hw * 1.6, 0.3 * k, hw * 1.6).translate(0, base + 0.15 * k, 0), stoneMat, { parent: g, outline: false });
      const b2 = base + 0.3 * k, ph = 2.1 * k;
      for (const [px, pz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) part(new THREE.CylinderGeometry(0.15 * k, 0.17 * k, ph, 8), pillarMat, { parent: g, pos: [px * hw * 0.62, b2 + ph / 2, pz * hw * 0.62], outline: false });
      part(new THREE.BoxGeometry(hw * 1.24, ph * 0.8, 0.2 * k), plasterMat, { parent: g, pos: [0, b2 + ph * 0.4, -hw * 0.62], outline: false });
      part(new THREE.BoxGeometry(0.5 * k, 0.7 * k, 0.5 * k), stoneMat, { parent: g, pos: [0, b2 + 0.35 * k, -hw * 0.3], outline: false });
      roof(0, b2 + ph, 0, hw * 1.3, hw * 1.3, 1.1 * k, 0, g);
    };
    const kind = ci % 3, a0 = R6() * 6.28;
    if (kind === 0) {   // grove
      tree(a0, 0, 2.3 + R6() * 0.5);
      for (let i = 0; i < 3; i++) tree(a0 + 1.2 + i * 1.7 + R6() * 0.4, 0.34 + R6() * 0.08, 1.6 + R6() * 0.5);
    } else if (kind === 1) {   // shrine, banners either side, pines behind
      shrine(a0, 0.08, 1.25);
      banner(a0 + 0.9, 0.36, 0); banner(a0 - 0.9, 0.36, 1);
      tree(a0 + Math.PI + 0.6, 0.36, 1.9 + R6() * 0.4); tree(a0 + Math.PI - 0.7, 0.38, 1.6 + R6() * 0.4);
    } else {   // a stone lantern under pines, one banner
      const [lx, lz] = at(a0, 0.12); lantern(lx, lowest(lx, lz, 0.9) - 0.15, lz, { parent: hold, s: 2.2, solid: false });
      tree(a0 + 2.0, 0.34, 2.1 + R6() * 0.4); tree(a0 - 2.1, 0.36, 1.7 + R6() * 0.4);
      banner(a0 + Math.PI, 0.3, R6() < 0.5 ? 0 : 2);
    }
  });
  // merge everything per material: a few meshes for all eighteen columns
  hold.updateMatrixWorld(true);
  const byMat = new Map();
  hold.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld); if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(g);
  });
  World.seaDress = [];
  for (const [mat, list] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(list), mat); m.receiveShadow = true; m.castShadow = false;
    World.scene.add(m); World.seaDress.push(m); for (const g of list) g.dispose();
  }
  hold.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
}

// v5 (note 35): the cover rocks the Captain raises in phase 2 (level.js tearFloor). One mesh each (the camera fades
// it by its own material), a faceted, tapering rock with a broken top, varied per index; ~2.1 m tall, centred.
World.coverRock = (i) => {
  const rr = rng(700 + i * 13), h = 2.1, geo = new THREE.CylinderGeometry(0.45 + rr() * 0.2, 0.85 + rr() * 0.2, h, 5 + (i % 3), 3);
  const p = geo.attributes.position, lean = (rr() - 0.5) * 0.5, seed = rr() * 100;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k), u = y / h + 0.5, j = 1 + Math.sin(x * 4.3 + y * 2.1 + z * 3.9 + seed) * 0.16;
    p.setXYZ(k, x * j * (i % 2 ? 1.25 : 0.9) + lean * u, y > h / 2 - 0.01 ? y - (0.5 + 0.5 * Math.sin(x * 5 + z * 7 + seed)) * 0.45 : y, z * j);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(uvWorld(geo, 0.5), toon(0xffffff, { map: rockMat.map, unique: true }));
  m.castShadow = m.receiveShadow = true; addOutline(m, 1.2);
  return m;
};

function buildSky(scene) {
  // the painted panorama, mirrored once around the cylinder so there is no seam
  const t = tex('assets/env/sky-panorama.webp');
  t.wrapS = THREE.MirroredRepeatWrapping; t.repeat.set(2, 1);
  const g = new THREE.CylinderGeometry(900, 900, 900 * (1152 / 2688) * Math.PI * 2 / 2, 64, 1, true);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.position.y = 60; m.renderOrder = -10; m.rotation.y = Math.PI * 0.6;
  scene.add(m);
  // top cap: sky colour above the panorama
  const cap = new THREE.Mesh(new THREE.SphereGeometry(950, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), new THREE.MeshBasicMaterial({ color: 0x6f78b8, side: THREE.BackSide, fog: false, depthWrite: false }));
  cap.renderOrder = -11; scene.add(cap);
  World.sky = m;
}
function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  const r = rng(9);
  for (let i = 0; i < 22; i++) {
    const cx = 60 + r() * 392, cy = 140 + (r() - 0.5) * 60, rad = 40 + r() * 60;
    const g = x.createRadialGradient(cx, cy - rad * 0.3, rad * 0.1, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,248,240,1)'); g.addColorStop(0.7, 'rgba(250,232,222,0.95)'); g.addColorStop(1, 'rgba(240,215,210,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildClouds(scene) {
  const ct = cloudTexture();
  // a soft cloud sea far below, then drifting cloud cards just under the cliff edges

  // v4 (note 28): cards stay under the cliff edge (every card's top is below y -5) and fade out, per card, as
  // they drift toward the play space, toward the waterfall, or near the camera. They never reach the walkways.
  const mat = new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCloudA;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec2 cc = modelMatrix[3].xz;
        vec2 q = max(vec2(-30.0, -130.0) - cc, cc - vec2(36.0, 40.0)); float out1 = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        float dw = length(cc - vec2(70.0, -150.0));
        float dc = length(cameraPosition - modelMatrix[3].xyz);
        vCloudA = smoothstep(0.0, 18.0, out1) * smoothstep(25.0, 60.0, dw) * smoothstep(28.0, 55.0, dc);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCloudA;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= vCloudA;\n#include <opaque_fragment>');
  };
  for (let i = 0; i < 110; i++) {
    const s = 18 + R() * 34;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s * 2, s), mat);
    const a = R() * Math.PI * 2, d = 50 + R() * 170;
    m.position.set(Math.cos(a) * d, -6 - s * 0.5 - R() * 18, -50 + Math.sin(a) * d);
    m.userData.v = 0.6 + R() * 1.2;
    m.renderOrder = 1;
    scene.add(m); World.clouds.push(m);
  }
}

export function buildWorld(scene) {
  World.scene = scene; mats();
  buildSky(scene); buildClouds(scene);

  // A. cliff path and B. gate yard
  // v3: the cliff path has a broken span (z 13.4-15.4): the first jump [✕], taught before any fight
  slab(-2.6, 2.6, 15.4, 26, 0, { bottom: -3 }); slab(-2.6, 2.6, 8, 13.4, 0, { bottom: -3 });
  World.gap = { z0: 13.4, z1: 15.4 };
  slab(-9, 9, -10, 8, 0, { bottom: -3 });
  // v4 (note 29): the west side of the yard was a bare grey box. Same collision box, now hidden; what you see is a
  // painted rock footing under a plaster wall that the wall-section kit dresses like the gate wall.
  const westW = wall(-10.5, -9, -10, 8, -3, 2.2, rockMat); westW.visible = false;
  part(uvWorld(new THREE.BoxGeometry(1.5, 3, 18).translate(-9.75, -1.5, -1), 0.4), rockMat, { parent: scene, cast: false });
  wall(9, 10.5, -10, 8, -3, 1.1, stoneMat);   // east balustrade
  wall(-3.6, -2.6, 15.9, 26, -1, 0.7, stoneMat); wall(2.6, 3.6, 15.9, 26, -1, 0.7, stoneMat);
  wall(-3.6, -2.6, 8, 12.9, -1, 0.7, stoneMat); wall(2.6, 3.6, 8, 12.9, -1, 0.7, stoneMat);
  // broken stubs of the span and fallen stones under it
  for (const [x, z, r] of [[-1.8, 13.25, 0.3], [1.2, 13.3, -0.2], [0.2, 15.55, 0.5], [-2.0, 15.6, 0.1]]) rock(x, -0.35, z, 0.55, 0.45, 0.4, rockMat, r);
  for (let i = 0; i < 4; i++) rock(-1.5 + i, -5 - R() * 3, 14.4 + R() * 0.6, 0.6, 0.5, 0.6, rockDark, R() * 3);
  for (let z = 10; z < 26; z += 4) { rock(-6 - R() * 3, -2 + R(), z, 3, 4, 3); rock(6 + R() * 3, -2.5, z, 3, 4, 3); }
  // gate wall between yard and courtyard, with the barrier in the middle
  World.dress = []; World.dressRoofs = [];
  World.dress.push(dressBox(-10.5, -9, -10, 8, 0, 2.2));
  World.dress.push(wall(-9, -2.4, -10.8, -10, 0, 3.4, plasterMat), wall(2.4, 9, -10.8, -10, 0, 3.4, plasterMat));
  World.dressRoofs.push(roof(-5.7, 3.4, -10.4, 6.6, 1.2, 0.8), roof(5.7, 3.4, -10.4, 6.6, 1.2, 0.8));
  // v3 (note 13): a real timber-and-brass gate in a timber frame; the box stays as an invisible camera proxy
  const bar = wall(-2.4, 2.4, -10.6, -10.2, 0, 2.8, woodMat); bar.visible = false;
  World.barrier = new THREE.Group(); scene.add(World.barrier); World.barrier.add(bar);
  World.gate1Door = timberGate(World.barrier, 0, -10.4, 4.8, 2.9, 0.2);
  gateFrame(0, -10.4, 5.3, 3.8, 0.9);
  World.spots.start = new THREE.Vector3(0, 0, 20); World.spots.elder = new THREE.Vector3(-3.2, 0, -1.5); World.spots.post = new THREE.Vector3(4, 0, -4);
  World.spots.pavilion = new THREE.Vector3(0, 0, 8.6);

  // C. lower courtyard: open cliff to the east (x > 14), hall to the west
  slab(-14, 14, -42, -10, 0, { bottom: -2 });
  hall(-21, -14.2, -38, -14, 0, 4.2);
  footing(-21.8, -14, -38.8, -13.2, 0, 40);   // v5 (note 38): the hall stood over the void west of the yard
  World.solids.push({ x0: -21, x1: -14.2, z0: -38, z1: -14, y0: 0, y1: 8 });
  lantern(-10, 0, -17); lantern(-10, 0, -36); lantern(10.5, 0, -30);
  for (let z = -40; z < -10; z += 5) cliff(15.5 + R() * 1.5, z, 3 + R() * 1.5, -0.6);
  for (let x = -12; x < 14; x += 6) cliff(x, -9 + R(), 3, -1.5);
  // v7 note 39: the stray stone drum that sat in the middle of the courtyard floor (-4, -26) is gone
  pine(-12.5, 0, -40, 1.2); pine(-12.5, 0, -12, 1.0);
  // north retaining wall either side of the stairs
  World.dress.push(wall(-14, -4.5, -43, -42, 0, 4, stoneMat), wall(4.5, 14, -43, -42, 0, 4, stoneMat));
  World.spots.court = new THREE.Vector3(0, 0, -14); World.spots.courtMid = new THREE.Vector3(0, 0, -28);

  // D. stairs up (v3: a broken flight with a 1.1 m step-up ledge at z -45.4: jump [✕])
  ramp(-4, 4, -45, -42, 0, 1.2, 4);
  wall(-4, 4, -45.4, -45, 0, 2.3, stoneMat, { walkTop: true });
  ramp(-4, 4, -50, -45.4, 2.3, 4, 6);
  // v7 note 39 sweep: the two loose rocks on the stair landing (x -3.2 / 2.9, z -44.6) are gone too
  wall(-4.6, -4, -50, -42, 0, 4.8, stoneMat); wall(4, 4.6, -50, -42, 0, 4.8, stoneMat);

  // E. middle terrace (open east edge), raised walkway on the west with its own ramp
  slab(-14, 14, -74, -50, 4, { bottom: -2 });
  for (let z = -73; z < -50; z += 5) cliff(15.5 + R() * 1.5, z, 3 + R() * 1.5, 3.4);
  slab(-14, -9, -74, -60, 7.5, { bottom: 4 });
  ramp(-14, -10.2, -60, -52, 4, 7.5, 9);
  wall(-10.2, -9.6, -60, -52, 4, 5.1, stoneMat);
  wall(-9.4, -9, -74, -66, 7.5, 8.4, stoneMat); wall(-9.4, -9, -63.5, -60, 7.5, 8.4, stoneMat);   // parapet with a gap
  wall(-15.5, -14, -74, -50, 4, 11, rockMat);
  // low walls for cover
  wall(-3.5, 1.5, -60.4, -59.8, 4, 5.1, stoneMat, { walkTop: true }); wall(5.5, 6.1, -70, -65, 4, 5.1, stoneMat, { walkTop: true }); wall(-3.2, 0.2, -68.6, -68, 4, 5.1, stoneMat, { walkTop: true });   // v3: shortened, an open lane to shrine 3
  lantern(10, 4, -56); lantern(10, 4, -72);
  World.dress.push(wall(-14, -4.5, -75, -74, 4, 8, stoneMat), wall(4.5, 14, -75, -74, 4, 8, stoneMat));
  World.spots.terrace = new THREE.Vector3(0, 4, -53);

  // F. stairs to the bell terrace. v3: the lower half has fallen (a 2.3 m face at z -78): jump [✕], then the
  // Whirlwind Lift [L1+△] in the air carries Joon up. The floor of the stairwell is terrace level.
  slab(-4, 4, -78, -74, 4, { bottom: 2 });
  wall(-4, 4, -78.4, -78, 4, 6.3, stoneMat, { walkTop: true });
  ramp(-4, 4, -82, -78.4, 6.3, 8, 5);
  for (const [x, z, s] of [[-2.6, -76.6, 0.7], [2.2, -77.1, 0.55], [-0.4, -75.8, 0.4], [3.3, -75.2, 0.35]]) rock(x, 4.15, z, s, s * 0.7, s, rockMat, R() * 3);
  wall(-4.6, -4, -82, -74, 4, 8.8, stoneMat); wall(4, 4.6, -82, -74, 4, 8.8, stoneMat);

  // G. bell terrace: a disc of flagstones on the summit
  const BT = World.spots.bell = new THREE.Vector3(0, 8, -98);
  const disc = new THREE.CylinderGeometry(15, 13, 6, 40, 1);
  const dg = uvWorld(disc.translate(BT.x, BT.y - 3, BT.z), 0.22);
  const dm = part(dg, flagMat, { parent: scene, cast: false, outline: 1.2 }); World.rayMeshes.push(dm); World.bellDisc = dm;
  World.surfaces.push({ type: 'disc', x: BT.x, z: BT.z, r: 15, y: BT.y });
  World.surfaces.push({ type: 'box', x0: -4, x1: 4, z0: -84.5, z1: -82, y: 8 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < 0.4) continue; cliff(BT.x + Math.cos(a) * 15, BT.z + Math.sin(a) * 15, 4.5, 6.8); }
  cliff(BT.x, BT.z, 12, 4.5, 80, false);
  // v5 (note 35): the scatter of identical rotated floor plates is gone (World.tiles stays empty; level.js loops
  // over it harmlessly). Four hand-built rock spires stand at the arena rim instead, clear of the entry and the bell.
  for (let i = 0; i < 26; i++) { const a = R() * Math.PI * 2, d = 4 + R() * 9; if (BT.z + Math.sin(a) * d > BT.z + 9 && Math.abs(BT.x + Math.cos(a) * d) < 4) continue; R(); R(); R(); }   // keep the old random stream
  for (const [a, h, r, lean] of [[0.15, 4.6, 1.25, 0.06], [-0.95, 6.2, 1.5, -0.05], [-2.25, 3.4, 1.05, 0.08], [2.85, 5.2, 1.3, -0.07]]) {
    spire(BT.x + Math.cos(a) * 13.4, BT.y - 0.3, BT.z + Math.sin(a) * 13.4, h, r, lean, a * 2.3);
  }
  pine(-14, 8, -112, 1.3); pine(13, 8, -110, 1.1); pine(-16, 6, -90, 1.0);
  World.spots.bellFrame = new THREE.Vector3(0, 8, -110);
  World.spots.arenaGate = new THREE.Vector3(0, 8, -83.5);

  // distant summit buildings and a pagoda for the skyline
  const pag = (x, y, z, s) => { for (let i = 0; i < 4; i++) { const w = (4 - i * 0.7) * s; wall(x - w / 2, x + w / 2, z - w / 2, z + w / 2, y + i * 2.6 * s, y + (i + 0.7) * 2.6 * s, plasterMat); roof(x, y + (i + 0.7) * 2.6 * s, z, w, w, 1.2 * s); } };
  cliff(-36, -120, 10, 14, 90); pag(-36, 14, -120, 1.2); footing(-39.4, -32.6, -123.4, -116.6, 14, 4, 1.2);   // v5 (note 38): footings
  cliff(40, -60, 9, 2, 80); hall(34, 46, -66, -56, 2, 4); footing(33.2, 46.8, -66.8, -55.2, 2, 34);
  cliff(-40, -40, 8, -4, 70); pine(-40, -4, -40, 1.6); pine(-37, -4, -36, 1.2);
  const seaCols = [];   // v6: same draws in the same order as before (a, d, w, top, then cliff's own)
  for (let i = 0; i < 18; i++) { const a = R() * 6.28, d = 60 + R() * 120, x = Math.cos(a) * d, z = -50 + Math.sin(a) * d, w = 6 + R() * 8, top = -8 - R() * 20; cliff(x, z, w, top, 70); seaCols.push({ x, z, w, top }); }
  dressSeaColumns(seaCols);
  World.fireWall = null;
  // v3 (3D-DIRECTION 4 and 5): inked characters over unlined, painted backgrounds. Distant scenery loses its
  // ink lines and sinks into the haze; only what Joon can touch keeps an outline.
  const far = [];
  scene.traverse((o) => { if (o.userData.isOutline && o.parent) { const p = o.parent.getWorldPosition(new THREE.Vector3()); if (Math.abs(p.x) > 24 || p.z < -116 || p.z > 34 || p.y < -14) far.push(o); } });
  for (const o of far) o.parent.remove(o);
  World.unlined = far.length;
}

// props from the generated GLBs (they arrive while the game runs)
export function placeProp(name, obj) {
  const scene = World.scene;
  const place = (o, pos, height, rotY = 0) => {
    const b = new THREE.Box3().setFromObject(o), s = height / (b.max.y - b.min.y);
    o.scale.setScalar(s); o.rotation.y = rotY;
    const b2 = new THREE.Box3().setFromObject(o);
    o.position.set(pos.x, pos.y - b2.min.y, pos.z);
    scene.add(o);
    return new THREE.Box3().setFromObject(o);
  };
  if (name === 'gate-pavilion') {
    const b = place(obj, World.spots.pavilion, 6.2);
    // posts are solid, the middle is open
    const w = b.max.x - b.min.x;
    World.solids.push({ x0: b.min.x, x1: b.min.x + w * 0.16, z0: b.min.z + 0.3, z1: b.max.z - 0.3, y0: 0, y1: 6 }, { x0: b.max.x - w * 0.16, x1: b.max.x, z0: b.min.z + 0.3, z1: b.max.z - 0.3, y0: 0, y1: 6 });
    proxy(b.min.x, b.min.x + w * 0.16, 0, b.max.y * 0.7, b.min.z + 0.3, b.max.z - 0.3); proxy(b.max.x - w * 0.16, b.max.x, 0, b.max.y * 0.7, b.min.z + 0.3, b.max.z - 0.3);
    proxy(b.min.x, b.max.x, b.max.y * 0.62, b.max.y, b.min.z, b.max.z);
  } else if (name === 'training-post') {
    const pb = place(obj, World.spots.post, 2.3, -0.6); World.postModel = obj;
    proxy(World.spots.post.x - 0.3, World.spots.post.x + 0.3, 0, 2.3, World.spots.post.z - 0.3, World.spots.post.z + 0.3);
    if (World.postFallback) World.postFallback.visible = false;
  } else if (name === 'wind-shrine' && World.v2) {
    for (const sh of World.v2.shrines) { const o = obj.clone(true); place(o, sh.pos, 2.1, sh.group.rotation.y); sh.group.visible = false; sh.model = o; proxy(sh.pos.x - 0.6, sh.pos.x + 0.6, sh.pos.y, sh.pos.y + 2.2, sh.pos.z - 0.6, sh.pos.z + 0.6); }
  } else if (name === 'wind-wheel' && World.v2 && World.v2.wheel) {
    const w = World.v2.wheel; w.hub.clear(); w.hub.add(fitFlat(obj, 2.3));
  } else if (name === 'wind-chime' && World.v2) {
    for (const ch of World.v2.chimes) { const o = obj.clone(true); const b = new THREE.Box3().setFromObject(o), s = 0.9 / (b.max.y - b.min.y); o.scale.setScalar(s); ch.hang.clear(); ch.hang.add(o); o.position.y = -0.45; }
  } else if (name === 'timber-gate' && World.gateDoors) {
    // the delivered gate door (note 13): a pair of doors per opening, fitted to it; the code door hides
    const b0 = new THREE.Box3().setFromObject(obj), s0 = b0.getSize(new THREE.Vector3()), c0 = b0.getCenter(new THREE.Vector3());
    for (const G0 of World.gateDoors) {
      for (const sx of [-1, 1]) {
        const o = obj.clone(true); o.position.set(-c0.x, -b0.min.y, -c0.z);
        const h = new THREE.Group(); h.add(o); h.scale.set(G0.w / 2 / s0.x, G0.h / s0.y, (G0.d * 1.6) / s0.z);
        h.position.set(G0.cx + sx * G0.w / 4, 0, G0.z); if (sx > 0) h.rotation.y = Math.PI;   // mirrored pair: ring pulls meet in the middle
        G0.parent.add(h);
      }
      G0.g.visible = false;
    }
  } else if (name === 'gate-frame' && World.gateFrames) {
    const b0 = new THREE.Box3().setFromObject(obj), s0 = b0.getSize(new THREE.Vector3()), c0 = b0.getCenter(new THREE.Vector3());
    for (const F of World.gateFrames) {
      const o = obj.clone(true); o.position.set(-c0.x, -b0.min.y, -c0.z);
      const h = new THREE.Group(); h.add(o); h.scale.set((F.w + 1.1) / s0.x, (F.h + 0.9) / s0.y, (F.d + 0.4) / s0.z); h.position.set(F.cx, 0, F.z);
      scene.add(h); F.g.visible = false; F.model = h;
    }
  } else if (name === 'wall-section' && World.dress) {
    // v3: dress the code walls with the generated wall section, tiled ~4 m a piece and fitted to each wall
    // (the code box stays for collision and the camera, hidden)
    const src = obj; const b0 = new THREE.Box3().setFromObject(src), s0 = b0.getSize(new THREE.Vector3()), c0 = b0.getCenter(new THREE.Vector3());
    for (const m of World.dress) {
      const S = m.userData.solid; if (!S) continue;
      const along = S.x1 - S.x0 >= S.z1 - S.z0, len = along ? S.x1 - S.x0 : S.z1 - S.z0, thick = along ? S.z1 - S.z0 : S.x1 - S.x0, hgt = S.y1 - S.y0;
      const n = Math.max(1, Math.round(len / 3.6)), seg = len / n;
      for (let i = 0; i < n; i++) {
        const o = src.clone(true); o.position.set(-c0.x, -b0.min.y, -c0.z);
        const h = new THREE.Group(); h.add(o);
        h.scale.set(seg / s0.x * 1.02, hgt / s0.y, (thick + 0.12) / s0.z);
        const t = (i + 0.5) * seg;
        if (along) h.position.set(S.x0 + t, S.y0, (S.z0 + S.z1) / 2); else { h.position.set((S.x0 + S.x1) / 2, S.y0, S.z0 + t); h.rotation.y = Math.PI / 2; }
        scene.add(h);
      }
      m.visible = false;
    }
    for (const r of World.dressRoofs || []) { r.visible = false; if (r.userData.ridge) r.userData.ridge.visible = false; }
  } else if (name === 'bell-frame') {
    const bb = place(obj, World.spots.bellFrame, 6.5, 0); World.bellModel = obj;
    proxy(bb.min.x, bb.max.x, bb.min.y, bb.max.y, bb.min.z + 0.2, bb.max.z - 0.2);
    if (World.bellFallback) World.bellFallback.visible = false;
    World.solids.push({ x0: -3, x1: 3, z0: -111.5, z1: -108.5, y0: 8, y1: 14 });
  }
}

// invisible boxes so the camera and projectiles collide with the generated props
function proxy(x0, x1, y0, y1, z0, z1) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); World.scene.add(m); World.rayMeshes.push(m); return m;
}
// code fallbacks for the props (hidden when the GLBs arrive)
export function fallbackProps() {
  const scene = World.scene;
  if (!Props['training-post']) {
    const g = new THREE.Group(); g.position.copy(World.spots.post); scene.add(g);
    part(new THREE.CylinderGeometry(0.22, 0.26, 2.2, 10), woodMat, { parent: g, pos: [0, 1.1, 0] });
    for (const [y, r] of [[1.6, 0], [1.2, 1.6], [0.8, 3.2]]) part(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 6), woodMat, { parent: g, pos: [0, y, 0], rot: [0, r, Math.PI / 2] });
    World.postFallback = g;
  }
  if (!Props['bell-frame']) {
    const g = new THREE.Group(); g.position.copy(World.spots.bellFrame); scene.add(g);
    for (const x of [-2.2, 2.2]) part(new THREE.BoxGeometry(0.4, 5, 0.4), pillarMat, { parent: g, pos: [x, 2.5, 0] });
    part(new THREE.BoxGeometry(5.6, 0.4, 0.5), woodMat, { parent: g, pos: [0, 5, 0] });
    part(new THREE.CylinderGeometry(0.9, 1.25, 2.2, 16), toon(0x9a7a3a), { parent: g, pos: [0, 3.6, 0] });
    World.bellFallback = g;
  }
  World.solids.push({ x0: World.spots.post.x - 0.35, x1: World.spots.post.x + 0.35, z0: World.spots.post.z - 0.35, z1: World.spots.post.z + 0.35, y0: 0, y1: 2.4 });
}

export function updateWorld(dt) {
  for (const c of World.clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 220) c.position.x = -220; }
}

// ---------------------------------------------------------------- v2: shrines, the wind-wheel gate,
// the chime balcony, the slinger ledge and the waterfall for the water tease. Code-built until the
// requested GLBs arrive (wind-shrine, wind-wheel, wind-chime); placeProp swaps them in.
const V2 = { shrines: [], chimes: [] };
World.v2 = V2;
function shrineMesh(pos, rotY = 0) {
  const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = rotY; World.scene.add(g);
  part(new THREE.CylinderGeometry(0.75, 0.85, 0.25, 14), stoneMat, { parent: g, pos: [0, 0.12, 0] });
  part(new THREE.CylinderGeometry(0.24, 0.3, 1.0, 8), stoneMat, { parent: g, pos: [0, 0.75, 0] });
  part(new THREE.CylinderGeometry(0.38, 0.22, 0.16, 12), stoneMat, { parent: g, pos: [0, 1.32, 0] });
  part(new THREE.ConeGeometry(0.7, 0.45, 4), roofMat, { parent: g, pos: [0, 1.85, 0], rot: [0, Math.PI / 4, 0] });
  for (const [x, z] of [[0.36, 0.36], [-0.36, 0.36], [0.36, -0.36], [-0.36, -0.36]]) part(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6), pillarMat, { parent: g, pos: [x * 0.8, 1.45, z * 0.8] });
  const chimes = [];
  for (let i = 0; i < 3; i++) { const c = part(new THREE.CylinderGeometry(0.025, 0.025, 0.26, 6), toon(0xc9a24a), { parent: g, pos: [-0.2 + i * 0.2, 1.42, 0.42] }); chimes.push(c); }
  // a curl of wind carved on the pillar
  part(new THREE.TorusGeometry(0.13, 0.025, 5, 14, Math.PI * 1.5), toon(0xd9cfb4), { parent: g, pos: [0, 0.8, 0.27] });
  World.solids.push({ x0: pos.x - 0.5, x1: pos.x + 0.5, z0: pos.z - 0.5, z1: pos.z + 0.5, y0: pos.y, y1: pos.y + 2 });
  return { group: g, chimes };
}
function windWheel(pos, rotY = 0) {
  const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = rotY; World.scene.add(g);
  const hub = new THREE.Group(); g.add(hub);
  part(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 10), toon(0xc9a24a), { parent: hub, rot: [Math.PI / 2, 0, 0] });
  const sail = toon(0xefe3cb, { side: THREE.DoubleSide, unique: true });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, arm = new THREE.Group(); arm.rotation.z = a; hub.add(arm);
    part(new THREE.BoxGeometry(0.07, 1.15, 0.07), woodMat, { parent: arm, pos: [0, 0.6, 0] });
    part(new THREE.PlaneGeometry(0.38, 0.62), sail, { parent: arm, pos: [0.21, 0.72, 0.02], outline: false });
    part(new THREE.BoxGeometry(0.02, 0.62, 0.025), toon(0x9c4a3a), { parent: arm, pos: [0.4, 0.72, 0.02] });
  }
  part(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 12), woodMat, { parent: g, pos: [0, 0, -0.35], rot: [Math.PI / 2, 0, 0] });
  part(new THREE.BoxGeometry(0.2, 0.2, 0.7), woodMat, { parent: g, pos: [0, 0, -0.55] });
  return { group: g, hub };
}
function chime(pos) {
  const g = new THREE.Group(); g.position.copy(pos); World.scene.add(g);
  part(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8), woodMat, { parent: g, pos: [0, 1.3, 0] });
  part(new THREE.BoxGeometry(0.8, 0.08, 0.08), woodMat, { parent: g, pos: [0.3, 2.55, 0] });
  const hang = new THREE.Group(); hang.position.set(0.6, 2.5, 0); g.add(hang);
  for (let i = 0; i < 3; i++) part(new THREE.CylinderGeometry(0.04, 0.04, 0.5 - i * 0.08, 8), toon(0xc9a24a), { parent: hang, pos: [-0.08 + i * 0.08, -0.35 + i * 0.04, 0] });
  part(new THREE.BoxGeometry(0.16, 0.24, 0.015), toon(0xefe3cb), { parent: hang, pos: [0, -0.8, 0] });
  World.solids.push({ x0: pos.x - 0.15, x1: pos.x + 0.15, z0: pos.z - 0.15, z1: pos.z + 0.15, y0: pos.y, y1: pos.y + 2.6 });
  return { group: g, hang, at: new THREE.Vector3(pos.x + 0.6, pos.y + 2.1, pos.z) };
}
export function buildV2() {
  const scene = World.scene;
  // second gate at the head of the courtyard stairs, with the wind-wheel high on the wall beside it
  const gbox = wall(-4, 4, -42.6, -42.2, 0, 3.6, woodMat); gbox.visible = false;
  const gate = new THREE.Group(); scene.add(gate); gate.add(gbox);
  World.gate2Door = timberGate(gate, 0, -42.4, 8.0, 3.7, 0.24);
  gateFrame(0, -42.4, 8.5, 4.6, 1.0);
  V2.gate = gate; V2.gateSolid = gbox.userData.solid;
  V2.wheel = windWheel(new THREE.Vector3(-7.5, 3.0, -41.6), 0);
  World.surfaces.push({ type: 'box', x0: -14, x1: -4.5, z0: -43, z1: -42, y: 4 });   // walkable wall tops for the stairs slinger
  World.surfaces.push({ type: 'box', x0: 4.5, x1: 14, z0: -43, z1: -42, y: 4 });
  // shrines (also checkpoints): the stairs, the terrace, before the bell terrace
  V2.shrines.push({ pos: new THREE.Vector3(-7.2, 0, -32.5), ...shrineMesh(new THREE.Vector3(-7.2, 0, -32.5), 0.9) });   // v3: off the lantern, open ground round it
  V2.shrines.push({ pos: new THREE.Vector3(9.5, 4, -53.5), ...shrineMesh(new THREE.Vector3(9.5, 4, -53.5), -0.8) });
  // v3: shrine 3 stands on the terrace by the fallen bell stairs (the whirlwind it gives is how you climb them)
  V2.shrines.push({ pos: new THREE.Vector3(-7, 4, -72.3), ...shrineMesh(new THREE.Vector3(-7, 4, -72.3), 0.5) });
  World.surfaces.push({ type: 'box', x0: -4, x1: 4.6, z0: -84.5, z1: -81.5, y: 8 });
  // the chime balcony: a side path off the terrace's east edge that loops back
  slab(13.5, 20, -72, -62, 4, { bottom: 1 });
  wall(20, 20.6, -72, -62, 4, 4.9, stoneMat);
  cliff(18, -67, 3.2, 3.4);
  V2.chimes.push(chime(new THREE.Vector3(19.3, 4, -71.2)), chime(new THREE.Vector3(19.3, 4, -62.6)));
  // the third chime stands on a rock pillar out over the clouds
  cliff(28.5, -66.5, 2.2, 5.2, 60, false);
  World.surfaces.push({ type: 'disc', x: 28.5, z: -66.5, r: 2, y: 5.2 });
  V2.chimes.push(chime(new THREE.Vector3(28.1, 5.2, -66.5)));
  V2.spot = new THREE.Vector3(15.5, 4, -66.5);   // the stone to stand on
  const spot = part(new THREE.CylinderGeometry(0.55, 0.6, 0.08, 16), toon(0xd9cfb4), { parent: scene, pos: [V2.spot.x, 4.04, V2.spot.z] });
  part(new THREE.TorusGeometry(0.4, 0.03, 5, 18, Math.PI * 1.5), toon(0x8a6a58), { parent: scene, pos: [V2.spot.x, 4.1, V2.spot.z], rot: [-Math.PI / 2, 0, 0] });
  V2.chest = null;   // v5 (note 34): the stray chest is gone; the chimes give their reward directly (level.js chimeHit)
  // v5 (note 32): the waterfall (a strip of water down a lone column) is removed. The ending camera still reads
  // World.v2.waterfall.position as its look target: an empty, invisible group out over the clean valley view.
  const wf = new THREE.Group(); wf.position.set(22, -11, -182); scene.add(wf);   // frames the river valley in the panorama
  V2.waterfall = wf; wf.visible = false;   // revealed by the water tease
}
// v3 (note 13): a heavy timber gate door like the 2D game's west gate: dark red-brown planks, three black iron
// bands with brass rivets on both faces, a brass ring pull and plate. Centred at (cx, z), built into `parent`.
const plankCols = [0x7a3f2a, 0x6c3624, 0x84472f, 0x733b27];
function timberGate(parent, cx, z, w, h, d) {
  const g = new THREE.Group(); g.position.set(cx, 0, z); parent.add(g);
  (World.gateDoors || (World.gateDoors = [])).push({ g, parent, cx, z, w, h, d });
  const n = Math.max(4, Math.round(w / 0.42)), pw = w / n;
  for (let i = 0; i < n; i++) {
    const ph = h - (i % 2) * 0.06 - Math.abs(i - (n - 1) / 2) * 0.012;
    part(new THREE.BoxGeometry(pw - 0.025, ph, d), toon(plankCols[i % plankCols.length]), { parent: g, pos: [-w / 2 + pw * (i + 0.5), ph / 2, 0], outline: 0.7 });
  }
  const iron = toon(0x2b2530), brass = toon(0xc9a24a);
  for (const fy of [0.17, 0.5, 0.83]) {
    part(new THREE.BoxGeometry(w + 0.02, 0.17, d + 0.05), iron, { parent: g, pos: [0, h * fy, 0], outline: 0.8 });
    for (let x = -w / 2 + 0.22; x < w / 2 - 0.1; x += 0.46) for (const sz of [1, -1]) part(new THREE.SphereGeometry(0.04, 8, 6), brass, { parent: g, pos: [x, h * fy, sz * (d / 2 + 0.03)], outline: false, cast: false });
  }
  for (const sz of [1, -1]) {
    part(new THREE.TorusGeometry(0.2, 0.035, 8, 20), brass, { parent: g, pos: [0, h * 0.62, sz * (d / 2 + 0.07)], outline: 0.8 });
    part(new THREE.BoxGeometry(0.34, 0.22, 0.03), brass, { parent: g, pos: [0, h * 0.7, sz * (d / 2 + 0.03)], outline: 0.8 });
  }
  return g;
}
// the frame a gate sits in: two square timber posts on stone bases, a heavy lintel, a short tiled roof
function gateFrame(cx, z, w, h, d) {
  const g = new THREE.Group(); World.scene.add(g);
  (World.gateFrames || (World.gateFrames = [])).push({ g, cx, z, w, h, d });
  for (const sx of [-1, 1]) {
    const x = cx + sx * (w / 2);
    part(new THREE.BoxGeometry(0.62, 0.5, d + 0.2), stoneMat, { parent: g, pos: [x, 0.25, z] });
    part(new THREE.BoxGeometry(0.4, h, 0.4), toon(0x6c3624), { parent: g, pos: [x, h / 2, z] });
    part(new THREE.BoxGeometry(0.46, 0.12, 0.46), toon(0xc9a24a), { parent: g, pos: [x, h + 0.02, z] });
    World.solids.push({ x0: x - 0.3, x1: x + 0.3, z0: z - d / 2 - 0.1, z1: z + d / 2 + 0.1, y0: 0, y1: h });
  }
  part(new THREE.BoxGeometry(w + 1.0, 0.38, 0.5), toon(0x6c3624), { parent: g, pos: [cx, h + 0.2, z] });
  part(new THREE.BoxGeometry(w + 0.6, 0.16, 0.36), toon(0x9c4a3a), { parent: g, pos: [cx, h - 0.12, z] });
  for (const sx of [-1, 1]) part(new THREE.TorusGeometry(0.17, 0.035, 5, 12), toon(0xd9c9a0), { parent: g, pos: [cx + sx * (w / 2 - 0.05), h - 0.05, z + 0.24], rot: [0, 0, Math.PI / 4] });
  roof(cx, h + 0.38, z, w + 0.4, 0.9, 0.55);
  return g;
}

// a flat prop (shield, wheel): scale its largest side to `size`, centre it, and turn its thinnest axis to +Z
export function fitFlat(obj, size) {
  const holder = new THREE.Group();
  const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  obj.position.sub(c); holder.add(obj);
  const inner = new THREE.Group(); inner.add(holder);
  if (sz.x <= sz.y && sz.x <= sz.z) holder.rotation.y = Math.PI / 2; else if (sz.y <= sz.x && sz.y <= sz.z) holder.rotation.x = Math.PI / 2;
  inner.scale.setScalar(size / Math.max(sz.x, sz.y, sz.z));
  return inner;
}
