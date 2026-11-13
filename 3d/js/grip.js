// v6 (item 1): the grip cap. The Meshy rig has no finger bones, so a hand can't close round a shaft and every
// pole used to pass through a flat open palm. A grip cap is a small cel-shaded, inked fist: four curled fingers
// wrapped round a cylinder of the shaft's radius, a thumb across them, and a palm that stretches back to the
// wrist. While a hand holds a weapon, the cap sits on the shaft at that hand (oriented to the shaft, the palm
// toward the wrist) and the hand bone shrinks inside it, so the flat palm is hidden. Its colour is sampled
// from the character's own texture under the hand (skin for Joon and the Captain, gloves for the soldiers).
// ?nogrip turns caps off for the side-by-side.
import * as THREE from 'three';
import { addOutline, celCharacter, GRADIENT } from './toon.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const GRIP_ON = typeof location === 'undefined' || !/[?&]nogrip/.test(location.search);
const R_IN = 0.026;        // shaft radius the fingers wrap (the staff is 0.022-0.03)
const SHRINK = 0.4;        // hand bone scale inside the fist
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _f = new THREE.Vector3();

// one fist in a local frame: +Y along the shaft, +X toward the wrist (the palm side), sign mirrors left/right
function buildFist(mat, sign, R_IN) {
  const g = new THREE.Group(), geos = [];
  const at = (geo, p) => { geo.translate(p.x, p.y, p.z); return geo; };
  const fingers = [[0.031, 0.0135], [0.0105, 0.0145], [-0.0105, 0.014], [-0.03, 0.0125]];   // y, tube radius (index .. little)
  for (let i = 0; i < 4; i++) {
    const [y, tr] = fingers[i];
    const r = R_IN + tr * 0.95, pts = [];
    // from the palm's edge (+X, a little to +Z) round the far side to the tips back near the palm (-Z)
    const a0 = 0.55, a1 = 0.55 + Math.PI * 1.55 - i * 0.05;
    for (let k = 0; k <= 10; k++) { const a = a0 + (a1 - a0) * k / 10; pts.push(new THREE.Vector3(Math.cos(a) * r, y + (k / 10 - 0.5) * 0.004, Math.sin(a) * r * sign)); }
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, tr, 7, false));
    geos.push(at(new THREE.SphereGeometry(tr, 8, 6), pts[pts.length - 1]));        // the fingertip
    geos.push(at(new THREE.SphereGeometry(tr * 1.12, 8, 6), pts[0]));             // the knuckle
  }
  // the thumb: from the heel of the hand across the index finger on the front of the shaft
  const thumbCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.035, 0.03, 0.022 * sign), new THREE.Vector3(0.012, 0.047, 0.034 * sign), new THREE.Vector3(-0.014, 0.046, 0.036 * sign), new THREE.Vector3(-0.03, 0.041, 0.022 * sign)]);
  geos.push(new THREE.TubeGeometry(thumbCurve, 10, 0.0125, 7, false));
  geos.push(at(new THREE.SphereGeometry(0.0125, 8, 6), new THREE.Vector3(-0.03, 0.041, 0.022 * sign)));
  const curl = new THREE.Mesh(mergeGeometries(geos.map((q) => q.toNonIndexed())), mat);   // one draw (and one ink hull) for the fingers
  geos.forEach((q) => q.dispose());
  // the palm and the back of the hand: an ellipsoid from the shaft to the wrist (stretched every frame)
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), mat); palm.name = 'palm';
  palm.scale.set(0.04, 0.047, 0.027); palm.position.set(0.045, 0, 0.004 * sign);
  g.add(curl, palm);
  for (const o of [curl, palm]) { o.castShadow = true; o.receiveShadow = false; addOutline(o, 0.55); }
  g.userData.palm = palm;
  return g;
}

// the average texture colour of the vertices skinned to a bone (the hand's skin or glove)
function sampleBoneColor(skinned, boneName) {
  try {
    const bi = skinned.skeleton.bones.findIndex((b) => b.name === boneName); if (bi < 0) return null;
    const geo = skinned.geometry, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, uv = geo.attributes.uv;
    const map = skinned.material.map; if (!uv || !map || !map.image) return null;
    const img = map.image, W = Math.min(256, img.width), H = Math.min(256, img.height);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, W, H);
    const px = cx.getImageData(0, 0, W, H).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < si.count; i++) {
      let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi) w += sw.getComponent(i, k);
      if (w < 0.7) continue;
      const u = uv.getX(i) % 1, v = uv.getY(i) % 1;
      const x = Math.min(W - 1, Math.max(0, Math.floor((u < 0 ? u + 1 : u) * W))), y = Math.min(H - 1, Math.max(0, Math.floor((v < 0 ? v + 1 : v) * (map.flipY ? -1 : 1) * H + (map.flipY ? H : 0))));
      const j = (y * W + x) * 4; r += px[j]; g += px[j + 1]; b += px[j + 2]; n++;
    }
    if (n < 4) return null;
    return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
  } catch { return null; }
}

export class GripCap {
  // side: 'Right' | 'Left'
  constructor(scene, side) {
    this.side = side; this.scene = scene;
    this.mat = celCharacter(new THREE.MeshToonMaterial({ color: 0xd9a57c, gradientMap: GRADIENT }), -1);
    this.r = R_IN; this.build();
    this.w = 0; this.be = null; this.on = false;
  }
  build() {
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = buildFist(this.mat, this.side === 'Right' ? 1 : -1, this.r);
    this.mesh.visible = false; this.scene.add(this.mesh);
    this.mesh.traverse((o) => o.layers.enable(2));   // drawn in the impact frames with the fighters
  }
  // staff: the Staff (its group is the pole: origin on the axis, +Y along it); char: the holder
  update(staff, ch, holding, dt) {
    const be = ch.backend, hand = be && be.bones[this.side + 'Hand'];
    if (!hand) return;
    if (this.be !== be) {   // a new body (the GLB arrived): resample the hand's colour, reset the old hand
      if (this.be && this.be.bones[this.side + 'Hand']) this.be.bones[this.side + 'Hand'].scale.setScalar(1);
      this.be = be;
      const col = be.skinned ? sampleBoneColor(be.skinned, this.side + 'Hand') : null;
      if (col) this.mat.color.copy(col);
    }
    let on = false;
    // the shaft radius at the grip (measured from the weapon model) in fist units, rebuilt when it changes
    if (!this.k || this.be !== this._kbe) { const f = ch.bone(this.side + 'ForeArm'); this.k = f ? f.getWorldPosition(_f).distanceTo(hand.getWorldPosition(_w)) / 0.234 * 1.1 : 1; this._kbe = be; }
    const k = this.k;
    const r = THREE.MathUtils.clamp((staff.shaftR || R_IN) / k, 0.018, 0.05);
    if (Math.abs(r - this.r) > 0.002) { this.r = r; this.build(); }
    if (GRIP_ON && holding && staff.group.visible && be.glb) {
      _o.copy(staff.group.position); _d.set(0, 1, 0).applyQuaternion(staff.group.quaternion);
      ch.socket(this.side === 'Right' ? 'handR' : 'handL', _s);
      hand.getWorldPosition(_w);
      const ax = _s.clone().sub(_o).dot(_d);
      const lo = -staff.hold * staff.len + 0.08, hi = (1 - staff.hold) * staff.len - 0.12;
      _c.copy(_o).addScaledVector(_d, THREE.MathUtils.clamp(ax, lo, hi));
      const off = _s.distanceTo(_c);
      on = off < 0.11 * k && ax > lo - 0.05 && ax < hi + 0.05;
      if (on) {
        // +X toward the wrist, perpendicular to the shaft
        _x.subVectors(_w, _c); _x.addScaledVector(_d, -_x.dot(_d));
        let lw = _x.length();
        if (lw < 0.01) { ch.bone(this.side + 'ForeArm').getWorldPosition(_f); _x.subVectors(_w, _f).negate(); _x.addScaledVector(_d, -_x.dot(_d)); lw = 0.06 * k; }
        _x.normalize(); _z.crossVectors(_x, _d).normalize(); _x.crossVectors(_d, _z);
        _m.makeBasis(_x, _d, _z);
        this.mesh.quaternion.setFromRotationMatrix(_m);
        this.mesh.position.copy(_c);
        this.mesh.scale.setScalar(k);
        // the palm reaches back to the wrist (in fist units), never shorter than the fist's own palm
        const reach = THREE.MathUtils.clamp(lw / k, 0.035, 0.13);
        const p = this.mesh.userData.palm; p.position.x = reach * 0.5 + 0.012; p.scale.x = reach * 0.5 + 0.018;
      }
    }
    // the hand shrinks into the fist (and back out) over ~0.06 s
    this.w += ((on ? 1 : 0) - this.w) * (1 - Math.exp(-(on ? 60 : 30) * Math.max(dt, 1 / 120)));
    if (!on && this.w < 0.02) this.w = 0;
    hand.scale.setScalar(1 - (1 - SHRINK) * this.w);
    this.mesh.visible = on;
    this.on = on;
  }
  dispose() { this.scene.remove(this.mesh); if (this.be && this.be.bones[this.side + 'Hand']) this.be.bones[this.side + 'Hand'].scale.setScalar(1); }
}
