// Character rig: one animation system for both the generated GLB skeletons and the code-built
// fallback figure. Bones share names (Hips, Spine02, Spine01, Spine, neck, Head, Left/Right
// Shoulder/Arm/ForeArm/Hand, UpLeg/Leg/Foot/ToeBase).
//
// Procedural poses are authored as rotations in a canonical T-pose frame (character faces +Z,
// left = +X, up = +Y), so the same pose library drives any rest pose (A-pose or T-pose):
//   local_b = R'_parent^-1 * D_b * R'_b,  where R' is the bone's rest world rotation corrected to the T-pose.
// A state either samples a GLB clip (if one exists for it) or evaluates a procedural pose. Every
// state change cross-fades from a snapshot of the last output, so nothing ever pops.
import * as THREE from 'three';
import { toon, part, INK } from './toon.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { POSES, isUpperOnly, LEG_BONES } from './poses.js';

export const BONES = ['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const CHILD = { Hips: 'Spine02', Spine02: 'Spine01', Spine01: 'Spine', Spine: 'neck', neck: 'Head',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot' };
const CANON = { Spine02: [0, 1, 0], Spine01: [0, 1, 0], Spine: [0, 1, 0], neck: [0, 1, 0],
  LeftShoulder: [1, 0, 0], LeftArm: [1, 0, 0], LeftForeArm: [1, 0, 0], RightShoulder: [-1, 0, 0], RightArm: [-1, 0, 0], RightForeArm: [-1, 0, 0],
  LeftUpLeg: [0, -1, 0], LeftLeg: [0, -1, 0], RightUpLeg: [0, -1, 0], RightLeg: [0, -1, 0] };

// logical state -> clip name patterns (matched against file and animation names)
const CLIP_MATCH = {
  idle: /combat[-_ ]?stance|idle|fight[-_ ]?idle/i, run: /run|sprint/i, walk: /walk/i, jump: /jump/i, fall: /fall/i,
  backflip: /back[-_ ]?flip/i, roll: /roll|dodge/i, hurt: /hurt|hit[-_ ]?react|get[-_ ]?hit/i, dead: /death|dying|knock[-_ ]?out/i,
  kick: /kick/i, punch1: /jab|punch/i, castFire: /fire/i, castWater: /water/i, castEarth: /earth|stomp/i, castAir: /air|palm/i,
  roar: /roar|taunt/i, throwFire: /throw/i,
};

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();
const D2R = Math.PI / 180;
export const TILT_MAX = 12;   // v5 (note 31)
const TILT_STATES = /^(run|walk|sRun|sWalk|idle|calm|sStance|aim)$/;
const _tA = new THREE.Vector3(), _tB = new THREE.Vector3(), _tC = new THREE.Vector3(), _tq = new THREE.Quaternion(), _tq2 = new THREE.Quaternion(), _tq3 = new THREE.Quaternion();

// ---- the code-built fallback figure ------------------------------------------------------
const LOOKS = {
  joon: { h: 1.6, skin: 0xd9a57c, top: 0x4f7d86, sleeve: 0xefe2c8, pants: 0x6b5a4e, sash: 0xb8423a, hair: 0x2b1d1a, shoe: 0x3b2f2a, wrap: 0xe8dcc0 },
  soldier: { h: 1.75, skin: 0xc99872, top: 0xd9a43a, sleeve: 0x4b2f7a, pants: 0x4b2f7a, sash: 0x3a2560, hair: 0xd9a43a, shoe: 0x2c2240, wrap: 0x4b2f7a, helmet: true, mask: 0x3a2560 },
  captain: { h: 2.0, skin: 0xc99872, top: 0xe0aa3c, sleeve: 0x4a2a78, pants: 0x3a2560, sash: 0xe0aa3c, hair: 0xc9b2d6, shoe: 0xe0aa3c, wrap: 0xe0aa3c, helmet: true, crest: 0xa8273a, coat: 0x4a2a78, mask: 0x1d1620 },
  shield: { h: 1.75, skin: 0xc99872, top: 0xa8273a, sleeve: 0x2b2a2e, pants: 0x2b2a2e, sash: 0xd9a43a, hair: 0x2b2a2e, shoe: 0x1d1a1c, wrap: 0x2b2a2e, helmet: true, mask: 0x111111 },
  elder: { h: 1.5, skin: 0xd9a57c, top: 0xe39b3a, sleeve: 0xe39b3a, pants: 0xc9772c, sash: 0x8a3b2a, hair: 0xe8e2d8, shoe: 0x3b2f2a, wrap: 0xe8dcc0, robe: 0xe39b3a, bald: true },
};

function buildFallback(kind) {
  const L = LOOKS[kind] || LOOKS.joon, s = L.h / 1.6;
  const root = new THREE.Group();
  const bones = {};
  const B = (name, parent, x, y, z) => { const b = new THREE.Object3D(); b.name = name; b.position.set(x * s, y * s, z * s); (parent ? bones[parent] : root).add(b); bones[name] = b; return b; };
  B('Hips', null, 0, 0.92, 0);
  B('Spine02', 'Hips', 0, 0.08, 0); B('Spine01', 'Spine02', 0, 0.12, 0); B('Spine', 'Spine01', 0, 0.12, 0);
  B('neck', 'Spine', 0, 0.16, 0); B('Head', 'neck', 0, 0.07, 0);
  for (const [side, sx] of [['Left', 1], ['Right', -1]]) {
    B(side + 'Shoulder', 'Spine', 0.04 * sx, 0.11, 0); B(side + 'Arm', side + 'Shoulder', 0.12 * sx, 0, 0);
    B(side + 'ForeArm', side + 'Arm', 0.25 * sx, 0, 0); B(side + 'Hand', side + 'ForeArm', 0.23 * sx, 0, 0);
    B(side + 'UpLeg', 'Hips', 0.1 * sx, -0.04, 0); B(side + 'Leg', side + 'UpLeg', 0, -0.4, 0);
    B(side + 'Foot', side + 'Leg', 0, -0.41, 0); B(side + 'ToeBase', side + 'Foot', 0, -0.05, 0.12);
  }
  const M = (c) => toon(c);
  const cap = (r, len) => new THREE.CapsuleGeometry(r * s, Math.max(0.001, len * s - 2 * r * s), 4, 10);
  const seg = (bone, geo, mat, dir, len, o = {}) => {
    const m = part(geo, mat, { parent: bones[bone] });
    if (dir === 'x') { m.rotation.z = Math.PI / 2; m.position.x = len / 2 * s * (o.sx || 1); }
    else if (dir === '-y') m.position.y = -len / 2 * s;
    else if (dir === 'y') m.position.y = len / 2 * s;
    if (o.pos) m.position.add(new THREE.Vector3(...o.pos).multiplyScalar(s));
    if (o.scale) m.scale.set(...o.scale);
    return m;
  };
  // torso
  seg('Spine02', cap(0.15, 0.3), M(L.pants), 'y', 0.14, { scale: [1.1, 1, 0.8] });
  seg('Spine01', cap(0.16, 0.32), M(L.top), 'y', 0.2, { scale: [1.05, 1, 0.78] });
  seg('Spine', cap(0.17, 0.3), M(L.top), 'y', 0.12, { scale: [1.15, 1, 0.8] });
  part(new THREE.TorusGeometry(0.15 * s, 0.045 * s, 6, 16), M(L.sash), { parent: bones.Spine02, pos: [0, 0.09 * s, 0], rot: [Math.PI / 2, 0, 0], scale: [1.08, 0.8, 1] });
  if (L.coat) { const c = part(new THREE.CylinderGeometry(0.2 * s, 0.36 * s, 0.75 * s, 10, 1, true), toon(L.coat, { side: THREE.DoubleSide }), { parent: bones.Hips, pos: [0, -0.3 * s, -0.02 * s] }); c.name = 'coat'; }
  if (L.robe) part(new THREE.CylinderGeometry(0.17 * s, 0.32 * s, 0.7 * s, 10, 1, true), toon(L.robe, { side: THREE.DoubleSide }), { parent: bones.Hips, pos: [0, -0.32 * s, 0] });
  // head
  const head = part(new THREE.SphereGeometry(0.135 * s, 16, 12), M(L.skin), { parent: bones.Head, pos: [0, 0.1 * s, 0.01 * s], scale: [0.95, 1.08, 1] });
  if (L.mask) part(new THREE.SphereGeometry(0.137 * s, 14, 10, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.4), M(L.mask), { parent: head, outline: false });
  if (L.helmet) {
    part(new THREE.SphereGeometry(0.155 * s, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M(L.hair), { parent: bones.Head, pos: [0, 0.13 * s, 0] });
    part(new THREE.CylinderGeometry(0.19 * s, 0.19 * s, 0.025 * s, 18), M(L.hair), { parent: bones.Head, pos: [0, 0.1 * s, 0] });
    part(new THREE.SphereGeometry(0.03 * s, 8, 6), M(L.hair), { parent: bones.Head, pos: [0, 0.3 * s, 0] });
    if (L.crest) part(new THREE.BoxGeometry(0.035 * s, 0.14 * s, 0.3 * s), M(L.crest), { parent: bones.Head, pos: [0, 0.32 * s, -0.02 * s] });
  } else if (!L.bald) {
    part(new THREE.SphereGeometry(0.145 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), M(L.hair), { parent: bones.Head, pos: [0, 0.12 * s, -0.01 * s], scale: [1.05, 1, 1.08] });
    part(new THREE.SphereGeometry(0.06 * s, 8, 6), M(L.hair), { parent: bones.Head, pos: [0, 0.27 * s, -0.08 * s] });
    part(new THREE.ConeGeometry(0.05 * s, 0.2 * s, 6), M(L.hair), { parent: bones.Head, pos: [0, 0.3 * s, -0.16 * s], rot: [-1.0, 0, 0] });
  } else {
    part(new THREE.ConeGeometry(0.06 * s, 0.22 * s, 6), M(L.hair), { parent: bones.Head, pos: [0, -0.05 * s, 0.12 * s], rot: [2.6, 0, 0] });
  }
  // eyes (flat ink dots) so facing reads
  for (const ex of [-0.045, 0.045]) part(new THREE.SphereGeometry(0.018 * s, 6, 5), toon(INK), { parent: head, pos: [ex * s, 0.015 * s, 0.123 * s], outline: false, cast: false });
  for (const [side, sx] of [['Left', 1], ['Right', -1]]) {
    seg(side + 'Shoulder', new THREE.SphereGeometry(0.085 * s, 10, 8), M(L.helmet ? L.top : L.sleeve), 'x', 0.1, { sx });
    seg(side + 'Arm', cap(0.065, 0.27), M(L.sleeve), 'x', 0.25, { sx });
    seg(side + 'ForeArm', cap(0.055, 0.25), M(L.wrap), 'x', 0.23, { sx });
    seg(side + 'Hand', new THREE.SphereGeometry(0.06 * s, 10, 8), M(L.skin), 'x', 0.08, { sx });
    seg(side + 'UpLeg', cap(0.09, 0.44), M(L.pants), '-y', 0.4, { scale: [1.05, 1, 1.05] });
    seg(side + 'Leg', cap(0.075, 0.42), M(L.wrap), '-y', 0.4);
    const f = part(new THREE.BoxGeometry(0.11 * s, 0.08 * s, 0.24 * s), M(L.shoe), { parent: bones[side + 'Foot'], pos: [0, -0.02 * s, 0.05 * s] });
    f.geometry.translate(0, 0, 0);
  }
  return { root, bones, height: L.h };
}

// ---- Character ---------------------------------------------------------------------------
export class Character {
  static twos = false; static twosSkip = null;
  constructor(kind, scene) {
    this.kind = kind;
    this.root = new THREE.Group();          // feet position, yaw = facing
    this.body = new THREE.Group();          // extra pitch/roll for leans and whole-body flips
    this.root.add(this.body);
    scene.add(this.root);
    this.state = 'idle'; this.t = 0; this.dur = 1; this.loop = true; this.speed = 1;
    this.params = { move: 0, lean: 0, aimPitch: 0, hand: 0, phase: 0 };
    this.fade = 0; this.fadeDur = 0.15;
    this.snap = {}; this.snapHip = new THREE.Vector3();
    this.flashT = 0;
    this.backend = null;
    this.useFallback();
  }

  useFallback() {
    const fb = buildFallback(this.kind);
    this._install({ obj: fb.root, bones: fb.bones, clips: {}, mixer: null, height: fb.height, glb: false });
  }

  // model: { scene, animations[] (with .logical), height }
  useModel(model) {
    const obj = SkeletonUtils.clone(model.scene);
    let skinned = null; obj.traverse((o) => { if (o.isSkinnedMesh && !o.userData.isOutline && !skinned) skinned = o; });
    model = { ...model, skinned };
    const bones = {};
    for (const n of BONES) { const b = obj.getObjectByName(n); if (b) bones[n] = b; }
    if (!bones.Hips || !bones.RightHand || !bones.LeftFoot) { console.warn('rig: model missing bones, keeping fallback', this.kind); return; }
    const mixer = new THREE.AnimationMixer(obj);
    const clips = {};
    for (const c of model.clips) clips[c.logical] = { clip: c.clip, action: mixer.clipAction(c.clip) };
    this._install({ obj, bones, clips, mixer, height: model.height, glb: true, skinned: model.skinned });
  }

  addClip(logical, clip) {
    if (!this.backend || !this.backend.glb || this.backend.clips[logical]) return;
    this.backend.clips[logical] = { clip, action: this.backend.mixer.clipAction(clip) };
  }
  // a shared-library clip: retarget the hips height onto this body, use only the chosen segment
  addShared(c) {
    const be = this.backend;
    if (!be || !be.glb || !c.logical || (be.clips[c.logical] && !be.clips[c.logical].shared)) return;
    const clip = c.clip.clone();
    const rest = be.rest.Hips.localPos;
    const k = c.restY ? rest.y / c.restY : 1;
    for (const t of clip.tracks) if (t.name === 'Hips.position') {
      const v = t.values, y0 = v[1];
      for (let i = 0; i < v.length; i += 3) { v[i] = rest.x; v[i + 2] = rest.z; v[i + 1] = c.lockY ? rest.y + (v[i + 1] - y0) * k * 0.25 : rest.y + (v[i + 1] - c.restY) * k; }
    }
    be.clips[c.logical] = { clip, action: be.mixer.clipAction(clip), seg: c.seg, shared: true, hitU: c.hitU };
  }

  _install(be) {
    if (this.backend) { this.body.remove(this.backend.obj); }
    this.backend = be;
    this.body.add(be.obj);
    this.body.updateMatrixWorld(true);
    be.obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    // rest data in body space
    const inv = new THREE.Matrix4().copy(this.body.matrixWorld).invert();
    const rest = {};
    const skin = be.skinned;
    for (const n of BONES) {
      const b = be.bones[n]; if (!b) continue;
      let mw;
      const i = skin ? skin.skeleton.bones.indexOf(b) : -1;
      // rest pose from the inverse bind matrices (bone world at bind = mesh world * IBM^-1)
      if (i >= 0) mw = new THREE.Matrix4().multiplyMatrices(skin.matrixWorld, new THREE.Matrix4().copy(skin.skeleton.boneInverses[i]).invert());
      else mw = b.matrixWorld.clone();
      const m = new THREE.Matrix4().multiplyMatrices(inv, mw);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      m.decompose(p, q, sc);
      rest[n] = { p, q, localPos: b.position.clone(), localQ: b.quaternion.clone() };
    }
    // canonical correction: rotate each limb's rest direction onto the T-pose direction
    for (const n of BONES) {
      const r = rest[n]; if (!r) continue;
      let cw = new THREE.Quaternion();
      if (CANON[n] && rest[CHILD[n]]) {
        const d = rest[CHILD[n]].p.clone().sub(r.p).normalize();
        cw.setFromUnitVectors(d, new THREE.Vector3(...CANON[n]));
      } else {
        const par = parentName(n); if (par && rest[par]) cw.copy(rest[par].cw);
      }
      r.cw = cw;
      r.qc = cw.clone().multiply(r.q);   // R'
    }
    // parent rest rotations (for the hips, the armature node)
    for (const n of BONES) {
      const r = rest[n]; if (!r) continue;
      const par = parentName(n);
      if (par && rest[par]) r.parQc = rest[par].qc.clone();
      else {
        const pm = new THREE.Matrix4().multiplyMatrices(inv, be.bones[n].parent.matrixWorld);
        const pq = new THREE.Quaternion(); pm.decompose(new THREE.Vector3(), pq, new THREE.Vector3());
        r.parQc = pq;
      }
      r.parQcInv = r.parQc.clone().invert();
    }
    // meters -> hips-parent units
    const ps = new THREE.Vector3(); be.bones.Hips.parent.getWorldScale(ps);
    const bs = new THREE.Vector3(); this.body.getWorldScale(bs);
    be.unit = bs.x / ps.x;
    be.rest = rest;
    this.snap = {};
    for (const n of BONES) if (be.bones[n]) this.snap[n] = be.bones[n].quaternion.clone();
    this.snapHip.copy(be.bones.Hips.position);
    this.fade = 0;
    this._flashMats = [];
    be.obj.traverse((o) => { if (o.isMesh && !o.userData.isOutline && o.material && o.material.emissive) this._flashMats.push(o.material); });
    // de-share fallback materials so a hit-flash only lights this one character
    {
      this._flashMats = [];
      be.obj.traverse((o) => { if (o.isMesh && !o.userData.isOutline && o.material && o.material.emissive) { o.material = o.material.clone(); this._flashMats.push(o.material); } });
    }
    this.height = be.height;
  }

  // when a clip drives this action, its own contact time (else the procedural default)
  hitU(logical, def) { const c = this.backend.glb && this.backend.clips[logical]; return c && c.hitU !== undefined ? c.hitU : def; }
  get glb() { return this.backend && this.backend.glb; }
  bone(n) { return this.backend.bones[n]; }

  // world position of a hand or foot (a little past the joint, where the fist or toe is)
  socket(name, out = new THREE.Vector3()) {
    const map = { handR: ['RightHand', 'RightForeArm'], handL: ['LeftHand', 'LeftForeArm'], footR: ['RightToeBase', 'RightFoot'], footL: ['LeftToeBase', 'LeftFoot'], head: ['Head', 'neck'], chest: ['Spine', 'Spine01'] };
    const [a, b] = map[name];
    const A = this.backend.bones[a], Bn = this.backend.bones[b];
    A.getWorldPosition(out);
    if (Bn && (name.startsWith('hand'))) { Bn.getWorldPosition(_v2); out.add(_v.copy(out).sub(_v2).multiplyScalar(0.35)); }
    if (name === 'head') out.y += 0.1;
    return out;
  }

  // o: { restart, fade, dur, loop, speed, seg: [a, b] clip seconds, pingpong, cont: keep the clip running (no
  // snapshot, no fade: used to chain strikes that are consecutive segments of one clip) }
  play(state, o = {}) {
    if (state === this.state && !o.restart && !o.cont) { if (o.speed) this.speed = o.speed; return; }
    const be = this.backend;
    const seg = o.seg || null;
    if (o.cont && state === this.state && this.backend.glb) {
      // continue the same clip from where it is now to a new end point
      const now = this.clipTime();
      this.seg = [now, seg ? seg[1] : now + 1]; this.t = 0;
      this.dur = Math.max(0.01, (this.seg[1] - this.seg[0]) / (o.speed || 1)); this.speed = 1; this.pingpong = false; this.loop = false;
      return;
    }
    // snapshot current output for the cross-fade
    for (const n of BONES) if (be.bones[n]) (this.snap[n] || (this.snap[n] = new THREE.Quaternion())).copy(be.bones[n].quaternion);
    this.snapHip.copy(be.bones.Hips.position);
    this.prevState = this.state;
    this.state = state; this.t = 0; this._dirty = true;   // a new move samples at once (the snap frame)
    this.seg = seg; this.pingpong = !!o.pingpong;
    this.speed = o.speed || 1;
    const clipE = be.glb && be.clips[state];
    if (seg && clipE) this.dur = (seg[1] - seg[0]) / this.speed;
    else this.dur = o.dur || (POSES[state] && POSES[state].dur) || 1;
    if (seg && clipE) this.speed = 1;   // dur already includes the speed
    this.loop = o.loop ?? !!(POSES[state] && POSES[state].loop);
    this.fadeDur = o.fade ?? 0.18;   // v4 note 15: longer default cross-fade (strikes pass their own, shorter, on purpose)
    this.fade = this.fadeDur > 0 ? 0 : 1;
  }
  // the source-clip time currently shown (for clip states)
  clipTime() {
    const be = this.backend, clipE = be.glb && be.clips[this.state];
    if (!clipE) return 0;
    const seg = this.seg || clipE.seg || [0, clipE.clip.duration * 0.999];
    return seg[0] + (this.params.u ?? 0) * (seg[1] - seg[0]);
  }
  hasClip(state) { return !!(this.backend.glb && this.backend.clips[state]); }
  // a second clip sampled for the arms and spine only (e.g. the staff carry over the run)
  setUpper(state, o = {}) { this.upper = state; this.upperSeg = o.seg || null; this.upperW = o.w ?? 1; }

  flash(t = 0.12) { this.flashT = t; }

  update(dt) {
    const be = this.backend;
    this.t += dt * this.speed;
    // v3 (3D-DIRECTION 1): animate on twos. The pose is sampled 12 times a second and held in between
    // (movement, camera and effects stay at the full frame rate). A new move resamples at once.
    let sdt = dt;
    const twos = Character.twos && this.twos !== false && !(Character.twosSkip && Character.twosSkip.test(this.state));
    if (twos) {
      this._acc = (this._acc || 0) + dt;
      if (this._acc < 1 / 12 && this._cache && !this._dirty && this._cacheBe === be) { this._restore(be); this._tickFlash(dt); return; }
      sdt = this._acc; this._acc = this._acc % (1 / 12);
    }
    this._dirty = false;
    let u = this.t / this.dur;
    if (this.pingpong) { const k = u % 2; u = k > 1 ? 2 - k : k; }
    else if (this.loop) u = u % 1; else u = Math.min(1, u);
    if ((this.state === 'run' || this.state === 'walk' || this.state === 'sRun') && this.params.phaseDriven) u = ((this.params.phase % 1) + 1) % 1;
    this.params.u = u;
    const clipE = be.glb && be.clips[this.state];
    const upper = isUpperOnly(this.state) && this.params.move > 0.15;
    if (clipE) {
      const { action, clip } = clipE;
      if (this._activeAction !== action) { if (this._activeAction) this._activeAction.stop(); action.reset().play(); action.setEffectiveWeight(1); this._activeAction = action; }
      const seg = this.seg || clipE.seg || [0, clip.duration * 0.999];
      // upper-body layer: sample the upper clip first and keep its arm and spine rotations
      const up = this.upper && be.clips[this.upper];
      if (up && this.upperW > 0) {
        if (!this._upMixer) this._upMixer = new THREE.AnimationMixer(be.obj);
        const ua = this._upMixer.clipAction(up.clip); if (!ua.isRunning()) ua.play();
        const us = this.upperSeg || up.seg || [0, up.clip.duration * 0.999];
        ua.time = us[0] + (((this.t * (this.upperRate || 1)) / (us[1] - us[0])) % 1) * (us[1] - us[0]);
        if (this._activeAction) this._activeAction.stop();
        this._upMixer.update(0);
        this._upQ = this._upQ || {};
        for (const n of UPPER_BONES) if (be.bones[n]) (this._upQ[n] || (this._upQ[n] = new THREE.Quaternion())).copy(be.bones[n].quaternion);
        ua.stop();
        action.reset().play(); this._activeAction = action;
      }
      action.time = this.viewT !== undefined ? this.viewT : seg[0] + u * (seg[1] - seg[0]);
      be.mixer.update(0);
      if (up && this.upperW > 0) for (const n of UPPER_BONES) if (be.bones[n]) be.bones[n].quaternion.slerp(this._upQ[n], this.upperW);
      be.bones.Hips.position.x = be.rest.Hips.localPos.x; be.bones.Hips.position.z = be.rest.Hips.localPos.z;
      if (this.state === 'run' || this.state === 'walk') { /* clip owns legs */ }
    } else {
      if (this._activeAction) { this._activeAction.stop(); this._activeAction = null; }
      const pose = POSES[this.state] ? POSES[this.state].fn(u, this.params, this.t) : POSES.idle.fn(0, this.params, this.t);
      if (upper) {
        const loco = POSES[this.params.move > 0.6 ? 'run' : 'walk'].fn((this.params.phase || 0) % 1, this.params, this.t);
        for (const n of LEG_BONES) pose.b[n] = loco.b[n];
        pose.b.Hips = loco.b.Hips; pose.h = loco.h;
      }
      this.applyPose(pose);
    }
    // cross-fade from the snapshot
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + sdt / Math.max(0.001, this.fadeDur));
      const k = this.fade * this.fade * (3 - 2 * this.fade);
      for (const n of BONES) { const b = be.bones[n]; if (b && this.snap[n]) { _q.copy(this.snap[n]).slerp(b.quaternion, k); b.quaternion.copy(_q); } }
      be.bones.Hips.position.lerpVectors(this.snapHip, be.bones.Hips.position, k);
    }
    if (TILT_STATES.test(this.state || '')) this.capTilt(TILT_MAX);
    if (twos) this._store(be);
    this._tickFlash(dt);
  }
  // v5 (note 31): running leaned up to 90 degrees (the clip's own lean, the turn lean and the acceleration
  // spring all stacked). On locomotion clips the total torso tilt (hips to head, against world up, including
  // the body group's lean) is capped at TILT_MAX: any excess is taken back out at the hips.
  capTilt(maxDeg) {
    const be = this.backend, h = be.bones.Hips, hd = be.bones.Head; if (!h || !hd || !h.parent || !be.glb) return;
    this.root.updateMatrixWorld(true);
    h.getWorldPosition(_tA); hd.getWorldPosition(_tB);
    const d = _tB.sub(_tA).normalize();
    const ang = Math.acos(Math.min(1, Math.max(-1, d.y)));
    this.tiltDeg = ang / D2R;
    const max = maxDeg * D2R; if (ang <= max) return;
    // taken out at the lowest spine bone, so the legs and feet keep their contact
    const sp = be.bones.Spine02 || h;
    _tC.set(-d.z, 0, d.x).normalize();   // axis = d x up: a positive turn brings d toward up
    _tq.setFromAxisAngle(_tC, ang - max);
    sp.getWorldQuaternion(_tq2).premultiply(_tq);
    sp.parent.getWorldQuaternion(_tq3);
    sp.quaternion.copy(_tq3.invert().multiply(_tq2));
    sp.updateMatrixWorld(true);
  }
  // v6: root motion for turn clips. hipYaw() is the hip line's facing against the root (radians); unspin(a) turns
  // the hips back by a about world up, so the code can carry the turn on the root instead (no pop at the end).
  hipYaw() {
    const be = this.backend, L = be.bones.LeftUpLeg, R = be.bones.RightUpLeg; if (!L || !R) return 0;
    this.root.updateMatrixWorld(true); L.getWorldPosition(_tA); R.getWorldPosition(_tB);
    return Math.atan2(_tA.x - _tB.x, _tA.z - _tB.z) - this.root.rotation.y;
  }
  unspin(a) {
    const h = this.backend.bones.Hips; if (!h || !a) return;
    h.getWorldQuaternion(_tq2).premultiply(_tq.setFromAxisAngle(_tC.set(0, 1, 0), -a));
    h.parent.getWorldQuaternion(_tq3); h.quaternion.copy(_tq3.invert().multiply(_tq2)); h.updateMatrixWorld(true);
  }
  _store(be) { const c = this._cache || (this._cache = {}); for (const n of BONES) if (be.bones[n]) (c[n] || (c[n] = new THREE.Quaternion())).copy(be.bones[n].quaternion); (c.hip || (c.hip = new THREE.Vector3())).copy(be.bones.Hips.position); this._cacheBe = be; }
  _restore(be) { const c = this._cache; for (const n of BONES) if (be.bones[n] && c[n]) be.bones[n].quaternion.copy(c[n]); be.bones.Hips.position.copy(c.hip); }
  _tickFlash(dt) {
    // hit flash
    if (this.flashT > 0 || this._flashOn) {
      this.flashT -= dt;
      const on = this.flashT > 0;
      for (const m of this._flashMats) { m.emissive.setRGB(on ? 1 : 0, on ? 0.86 : 0, on ? 0.62 : 0); m.emissiveIntensity = on ? 0.16 : 0; }
      this._flashOn = on;
    }
  }

  // two-bone IK on one arm ('Left' or 'Right'): bring the hand to a world-space target, keeping the
  // elbow bending the way it already bends. w blends from the animated pose.
  armIK(side, target, w = 1) {
    if (w <= 0) return;
    const be = this.backend;
    const A = be.bones[side + 'Arm'], B = be.bones[side + 'ForeArm'], C = be.bones[side + 'Hand'];
    if (!A || !B || !C) return;
    A.parent.updateMatrixWorld(true);
    const a = A.getWorldPosition(_ik.a), b = B.getWorldPosition(_ik.b), c = C.getWorldPosition(_ik.c);
    const t = _ik.t.copy(c).lerp(target, w);
    const lab = a.distanceTo(b), lcb = b.distanceTo(c), lat = Math.min(a.distanceTo(t), (lab + lcb) * 0.999);
    // 1. elbow angle from the law of cosines
    const cur = _ik.v1.subVectors(a, b).normalize().angleTo(_ik.v2.subVectors(c, b).normalize());
    const want = Math.acos(THREE.MathUtils.clamp((lab * lab + lcb * lcb - lat * lat) / (2 * lab * lcb), -1, 1));
    const axis = _ik.v3.crossVectors(_ik.v1.subVectors(b, a), _ik.v2.subVectors(c, b));
    if (axis.lengthSq() < 1e-10) axis.set(0, 0, 1); else axis.normalize();
    rotateWorld(B, axis, -(want - cur));
    // 2. swing the upper arm so the hand points at the target
    A.updateMatrixWorld(true);
    C.getWorldPosition(c);
    _ik.q.setFromUnitVectors(_ik.v1.subVectors(c, a).normalize(), _ik.v2.subVectors(t, a).normalize());
    rotateWorldQ(A, _ik.q);
    A.updateMatrixWorld(true);
  }

  applyPose(pose) {
    const be = this.backend, rest = be.rest;
    for (const n of BONES) {
      const b = be.bones[n], r = rest[n]; if (!b) continue;
      const e = pose.b[n];
      if (e) { _e.set(e[0] * D2R, e[1] * D2R, e[2] * D2R, 'XYZ'); _q.setFromEuler(_e); } else _q.identity();
      // local = R'p^-1 * D * R'
      b.quaternion.copy(r.parQcInv).multiply(_q).multiply(r.qc);
    }
    const h = pose.h || [0, 0, 0];
    // hips offset in body space -> hips parent space
    _v.set(h[0], h[1], h[2]).multiplyScalar(be.unit);
    _v.applyQuaternion(rest.Hips.parQcInv);
    be.bones.Hips.position.copy(rest.Hips.localPos).add(_v);
  }
}

const UPPER_BONES = ['Spine01', 'Spine', 'neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'];
const _ik = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), t: new THREE.Vector3(), v1: new THREE.Vector3(), v2: new THREE.Vector3(), v3: new THREE.Vector3(), q: new THREE.Quaternion(), pq: new THREE.Quaternion(), wq: new THREE.Quaternion() };
// apply a world-space rotation to a bone (keeps its parent)
function rotateWorldQ(bone, q) {
  bone.parent.getWorldQuaternion(_ik.pq);
  bone.getWorldQuaternion(_ik.wq);
  _ik.wq.premultiply(q);
  bone.quaternion.copy(_ik.pq.invert().multiply(_ik.wq));
}
function rotateWorld(bone, axis, ang) { rotateWorldQ(bone, new THREE.Quaternion().setFromAxisAngle(axis, ang)); }

function parentName(n) {
  for (const k in CHILD) if (CHILD[k] === n) return k;
  if (n === 'LeftShoulder' || n === 'RightShoulder') return 'Spine';
  if (n === 'LeftUpLeg' || n === 'RightUpLeg') return 'Hips';
  if (n === 'LeftToeBase') return 'LeftFoot';
  if (n === 'RightToeBase') return 'RightFoot';
  if (n === 'LeftHand') return 'LeftForeArm';
  if (n === 'RightHand') return 'RightForeArm';
  return null;
}

export { CLIP_MATCH };
