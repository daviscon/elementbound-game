// The ringed staff (and the Captain's glaive): a pole held by a character's hands.
//
// Modes:
//  'hands'  the staff runs from the right hand toward the left hand whenever both hands are on it
//           (0.28-1.0 m apart), so the left hand sits on the shaft by construction. Otherwise a fixed
//           per-clip grip axis in RightHand space is used and the left hand is pinned to the shaft by a
//           two-bone IK if it is already within 0.35 m (one-handed flourishes stay free).
//  'carry'  one-handed, fixed grip (running in combat).
//  'back'   slung diagonally across the back, following the torso.
// Mode changes blend in world space over a short time, so a draw or a sheath never pops.
// Originality guard: a fighting staff only. It never folds into wings, never glides, never flies.
import * as THREE from 'three';
import { toon, addOutline, part } from './toon.js';
import { ribbon } from './fx.js';
import { GripCap } from './grip.js';

const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// grip axis (staff +Y, toward the finial) in RightHand bone space, per clip state. From
// review-3d-v2/frames/axis-report.json; default is the averaged axis of the attack clips.
export const SLING = { off: [-0.02, -0.08, -0.2], dir: [-0.76, 0.64, 0.12] };   // v6: the back sling (Spine01 space)
export const GRIP = { default: [-0.81, -0.45, -0.39], sHeavy: [0.70, -0.09, -0.71], sParry: [-0.98, 0.09, 0.16], sWalk: [0.56, 0.32, 0.77], run: [0.56, 0.32, 0.77], jump: [0.56, 0.32, 0.77], wCombo: [0, -1, 0], lSlash: [0, -1, 0] };   // v6: the one-handed grip combo, the pole along the forearm (tools/wstrip.mjs)
// where the right hand holds the pole, as a fraction of its length from the foot cap
const HOLD = { default: 0.3, sParry: 0.42, sStance: 0.34 };
const HOLD_FLIP = { default: 0.36, sParry: 0.48, sStance: 0.42, run: 0.42, sRun: 0.42, jump: 0.45 };   // v4: the ring head ~1.15 m beyond the right hand when striking

export class Staff {
  constructor(char, scene, o = {}) {
    this.char = char; this.scene = scene;
    this.len = o.len ?? 1.8;
    this.group = new THREE.Group(); scene.add(this.group);
    this.inner = new THREE.Group(); this.group.add(this.inner);
    this.mode = o.mode ?? 'back'; this.from = null; this.blendT = 1; this.blendDur = 0.2;
    this.dir = new THREE.Vector3(0, 1, 0); this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion();
    this.hold = 0.3; this.ikW = 0; this.tipPos = new THREE.Vector3(); this.prevTip = new THREE.Vector3(); this.tipVel = new THREE.Vector3();
    this.trail = null; this.visible = true; this.kind = o.kind || 'staff';
    this.flip = !/[?&]noflip/.test(location.search);   // v4 note 18 (v5 note 30: the glaive too, so its blade leads every swing)
    this.buildFallback();
    this.grips = { R: new GripCap(scene, 'Right'), L: new GripCap(scene, 'Left') };   // v6: fists on the shaft
  }

  // code-built stand-in until the GLB arrives (teak pole, cloth bands, brass loop and four rings)
  buildFallback() {
    const L = this.len, g = new THREE.Group();
    if (this.kind === 'glaive') {
      part(new THREE.CylinderGeometry(0.03, 0.03, L, 8), toon(0x2c2448), { parent: g });
      for (const y of [-0.3, 0.1, 0.5]) part(new THREE.CylinderGeometry(0.036, 0.036, 0.06, 8), toon(0xb08a3c), { parent: g, pos: [0, y * L / 2, 0] });
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.2, 0.25, 0.08, 0.62); sh.quadraticCurveTo(-0.02, 0.3, -0.06, 0.02); sh.lineTo(0, 0);
      const blade = part(new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }), toon(0xb9bcc4), { parent: g, pos: [0, L / 2 - 0.05, -0.01] });
      part(new THREE.SphereGeometry(0.06, 8, 6), toon(0xb08a3c), { parent: g, pos: [0, -L / 2, 0] });
      part(new THREE.ConeGeometry(0.05, 0.22, 6), toon(0x3a2a6a), { parent: g, pos: [0.04, L / 2 - 0.16, 0], rot: [0, 0, Math.PI] });
      this.blade = blade;
    } else if (this.kind === 'spear') {
      // v5: the crimson army's spear (stand-in until spear.glb loads): a dark pole, a gold collar, a steel head
      part(new THREE.CylinderGeometry(0.022, 0.024, L, 8), toon(0x3a2420), { parent: g });
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), toon(0xc9a24a), { parent: g, pos: [0, L / 2 - 0.04, 0] });
      part(new THREE.ConeGeometry(0.05, 0.3, 6), toon(0xb9bcc4), { parent: g, pos: [0, L / 2 + 0.15, 0] });
    } else {
      part(new THREE.CylinderGeometry(0.022, 0.026, L, 8), toon(0x7a4a2c), { parent: g });
      for (const y of [-0.12, 0.2]) part(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8), toon(0xd9cfb4), { parent: g, pos: [0, y * L, 0] });
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), toon(0xb08a3c), { parent: g, pos: [0, -L / 2 + 0.02, 0] });
      part(new THREE.TorusGeometry(0.09, 0.016, 6, 16), toon(0xb08a3c), { parent: g, pos: [0, L / 2 + 0.07, 0] });
      for (let i = 0; i < 4; i++) part(new THREE.TorusGeometry(0.035, 0.008, 5, 10), toon(0xc9a24a), { parent: g, pos: [Math.cos(i * 1.57) * 0.08, L / 2 + 0.07 + Math.sin(i * 1.57) * 0.08, 0], rot: [Math.PI / 2, 0, 0] });
    }
    this.fallback = g; this.inner.add(g);
  }
  // the generated model: fit its long axis to +Y, centre it and scale it to the staff length
  setModel(src) {
    const obj = src.clone(true);
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    // v6: the shaft's radius round the middle of the pole (where hands go), for the grip caps
    { const long = Math.max(size.x, size.y, size.z), ax = size.x > size.y && size.x > size.z ? 0 : size.z > size.y ? 2 : 1, rs = [], v = new THREE.Vector3(); obj.updateMatrixWorld(true);
      obj.traverse((o) => { if (o.isMesh && !o.userData.isOutline) { const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i += 2) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).sub(ctr); const c = [v.x, v.y, v.z], along = c[ax]; if (Math.abs(along) > long * 0.3) continue; c[ax] = 0; rs.push(Math.hypot(c[0], c[1], c[2])); } } });
      rs.sort((a, b) => a - b); if (rs.length > 20) this.shaftR = rs[Math.floor(rs.length * 0.5)] * this.len / long; }
    const holder = new THREE.Group(); holder.add(obj); obj.position.sub(ctr);
    if (size.x > size.y && size.x > size.z) holder.rotation.z = Math.PI / 2; else if (size.z > size.y) holder.rotation.x = Math.PI / 2;
    const long = Math.max(size.x, size.y, size.z); holder.scale.setScalar(this.len / long);
    if (this.modelFlip) { const outer = new THREE.Group(); outer.add(holder); outer.rotation.z = Math.PI; this.model0 = holder; holder.parent.updateMatrixWorld(); return this._setHolder(outer, obj); }
    return this._setHolder(holder, obj);
  }
  _setHolder(holder, obj) {
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    if (this.fallback) { this.inner.remove(this.fallback); this.fallback = null; }
    if (this.model) this.inner.remove(this.model);
    this.model = holder; this.inner.add(holder);
  }

  setMode(mode, dur = 0.2) {
    if (mode === this.mode) return;
    this.from = { pos: this.group.position.clone(), quat: this.group.quaternion.clone(), hold: this.hold };
    this.mode = mode; this.blendT = 0; this.blendDur = dur;
  }
  // v4: swap which end leads, blended (the plunge slam brings the ring head over and down onto the ground)
  flipTo(on, dur = 0.12) {
    if (this.flip === on) return;
    this.flip = on; this.from = { pos: this.group.position.clone(), quat: this.group.quaternion.clone(), hold: this.hold }; this.blendT = 0; this.blendDur = dur;
  }
  show(on) { this.visible = on; this.group.visible = on && !this.ghost; }   // v4: ghost = the staff is part of the hero mesh (?onemodel)

  // world position along the pole: 0 = foot cap, 1 = ring finial
  at(frac, out = new THREE.Vector3()) {
    return out.copy(Y).applyQuaternion(this.group.quaternion).multiplyScalar((frac - this.hold) * this.len).add(this.group.position);
  }
  tip(out = new THREE.Vector3()) { return this.at(1.0, out); }

  trailOn(o = {}) {
    if (this.trail && !this.trail.dead) return;
    this.trail = ribbon({ src: this.tipPos, color: o.color ?? 0xdff2f6, core: 0xffffff, width: o.width ?? 0.085, n: o.n ?? 12, opacity: 0.95 });
  }
  trailOff() { if (this.trail) { this.trail.dead = true; this.trail = null; } }

  update(dt) {
    const ch = this.char, be = ch.backend;
    if (!be || !be.bones.RightHand) return;
    ch.root.updateMatrixWorld(true);
    const state = ch.state;
    let pos = _a, dir = _b, hold = this.flip ? (HOLD_FLIP[state] ?? HOLD_FLIP.default) : (HOLD[state] ?? HOLD.default);
    this.ikW = 0;
    if (this.mode === 'planted' && this.plantPos) {
      // v3: stood upright in the ground (the attunement ceremony), rings at the top, a slight lean
      pos.copy(this.plantPos); dir.set(0.06, 1, 0.04).normalize(); hold = 0.0;
    } else if (this.mode === 'upright') {
      // v5 (note 30): held upright in one hand at rest, the foot cap by the foot, leaning a little out and
      // forward so it clears the body and the robe (the Captain grips his glaive like this in the off hand
      // while the other palm throws fire). The pole passes through the palm socket, so a hand is always on it.
      const L = this.uprightHand === 'L';
      ch.socket(L ? 'handL' : 'handR', pos);
      ch.root.getWorldQuaternion(_q);
      dir.set(L ? 0.16 : -0.16, 1, 0.12).normalize().applyQuaternion(_q);
      pos.add(_c.set(L ? 0.03 : -0.03, 0, 0.02).applyQuaternion(_q));
      hold = this.uprightHold ?? 0.4;
    } else if (this.mode === 'back') {
      // diagonal across the back, finial up over the right shoulder, following the torso's turn
      // v5 (note 30): bound to the upper spine bone with an offset clear of the robe in every clip
      const sp = be.bones.Spine01 || be.bones.Spine;
      sp.getWorldPosition(pos);
      ch.body.getWorldQuaternion(_q);
      const rq = be.rest.Spine01 ? be.rest.Spine01.q : be.rest.Spine ? be.rest.Spine.q : null;
      if (rq) { sp.getWorldQuaternion(_q2); const bodyRest = _q.clone().multiply(rq); _q2.multiply(bodyRest.invert()); _q.premultiply(_q2); }
      // v6 (item 4): lower and more diagonal, ring head over the right shoulder, the foot cap past the left hip;
      // the top lies close to the shoulder blades and the foot stands further off the robe, which flares lower down
      pos.add(_c.set(SLING.off[0], SLING.off[1], SLING.off[2]).applyQuaternion(_q));
      dir.set(SLING.dir[0], SLING.dir[1], SLING.dir[2]).normalize().applyQuaternion(_q);
      hold = 0.5;
    } else {
      const R = ch.socket('handR', pos);
      const L = ch.socket('handL', _c);
      const rb = be.bones.RightHand; rb.getWorldQuaternion(_q);
      const g = GRIP[state] || GRIP.default;
      const fixed = _d.set(g[0], g[1], g[2]).normalize().applyQuaternion(_q);
      // v4 note 18: the clips are two-handed axe swings, the axe head beyond the RIGHT hand and the left
      // hand lower on the haft. So the brass ring head points from the left hand THROUGH the right hand and
      // leads every swing; the foot cap trails past the left hand. (v3 had it the other way round.)
      // (the one-handed carry on the run and in the air keeps the ring head up, so it is not flipped)
      const flip = this.flip && this.mode !== 'carry', F = flip ? -1 : 1;
      if (flip) fixed.negate();
      if (!flip) hold = HOLD[state] ?? HOLD.default;
      if (this.mode === 'carry') dir.copy(fixed);
      else {
        const apart = L.distanceTo(R);
        const w2 = ss(0.26, 0.38, apart) * (1 - ss(0.95, 1.1, apart)) * (this.noDynamic ? 0 : 1);
        const dyn = L.clone().sub(R).normalize().multiplyScalar(F);
        if (dyn.dot(fixed) < -0.2) dyn.copy(fixed);       // left hand behind the right: not on this pole
        dir.copy(fixed).lerp(dyn, w2).normalize();
        if (w2 > 0.5) hold = flip ? Math.max(hold, Math.min(0.72, apart / this.len + 0.12)) : Math.min(hold, 0.9 - apart / this.len);
        this._needIK = w2 < 0.5;
      }
    }
    // smooth the axis a little so clip noise never jitters the pole
    if (this.lastMode !== this.mode || this.dir.dot(dir) < 0.2) this.dir.copy(dir);
    else this.dir.lerp(dir, 1 - Math.exp(-45 * dt)).normalize();
    this.lastMode = this.mode;
    _q.setFromUnitVectors(Y, this.dir);
    this.hold += (hold - this.hold) * (1 - Math.exp(-12 * dt));
    // blend from the previous mode
    if (this.blendT < 1 && this.from) {
      this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
      const k = this.blendT * this.blendT * (3 - 2 * this.blendT);
      this.group.position.copy(this.from.pos).lerp(pos, k);
      this.group.quaternion.copy(this.from.quat).slerp(_q, k);
    } else { this.group.position.copy(pos); this.group.quaternion.copy(_q); }
    this.inner.position.set(0, (0.5 - this.hold) * this.len, 0);
    this.group.updateMatrixWorld(true);
    // left hand on the shaft (fixed-grip clips only, and only if it is already close)
    if (this.mode === 'hands' && this._needIK && this.blendT >= 1 && !this.noIK) {
      const L = ch.socket('handL', _c);
      const o = this.group.position, d = this.dir;
      const s = this.flip ? THREE.MathUtils.clamp(_d.subVectors(L, o).dot(d), -(this.hold - 0.05) * this.len, -0.12) : THREE.MathUtils.clamp(_d.subVectors(L, o).dot(d), 0.12, (0.95 - this.hold) * this.len);
      const near = _a.copy(o).addScaledVector(d, s);
      const dist = near.distanceTo(L);
      if (dist < 0.35) { const w = 1 - ss(0.22, 0.35, dist); this.ikW = w; ch.armIK('Left', near.sub(_d.subVectors(L, ch.bone('LeftHand').getWorldPosition(_a.clone())).multiplyScalar(1)), w); }
    }
    // v6 (item 1): the grip caps (a fist round the shaft on each hand that holds it)
    const m = this.mode, uL = m === 'upright' && this.uprightHand === 'L';
    this.grips.R.update(this, ch, (m === 'hands' || m === 'carry' || (m === 'upright' && !uL)) && !this.noGrip, dt);
    this.grips.L.update(this, ch, (m === 'hands' || uL) && !this.noGrip, dt);
    this.prevTip.copy(this.tipPos);
    this.tip(this.tipPos);
    if (dt > 0) this.tipVel.subVectors(this.tipPos, this.prevTip).divideScalar(dt);
  }

  dispose() { this.trailOff(); this.scene.remove(this.group); this.grips.R.dispose(); this.grips.L.dispose(); }
}
