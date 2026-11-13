// Asset loader. Release builds load a static list, assets/manifest.json (written by tools/make-manifest.mjs),
// so nothing depends on server directory listings (GitHub Pages has none). Every GLB in the list is fetched
// up front (a few at a time, with byte progress for the title-screen loading bar) and then parsed in a fixed
// order, so the stance/idle files still come first. With ?debug the old dev behaviour comes back: the dev
// server's folder listings and assets/models/manifest.json are read too and re-checked every 20 s, so new GLBs
// dropped in while the game runs are picked up. A character with no GLB yet uses the code-built figure;
// clips that are missing fall back to procedural poses (see rig.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CLIP_MATCH } from './rig.js';
import { toonify } from './toon.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);   // release GLBs are meshopt-compressed (tools/optimize-glb.mjs)
export const DEBUG = typeof location !== 'undefined' && /[?&]debug/.test(location.search);
const KINDS = ['joon', 'soldier', 'shield', 'captain', 'elder'];   // v3: the Elder model arrived; v4: the shield-bearer
// v4: which folder supplies each character. The hero is the bald monk (13 Nov redesign); ?onemodel uses the
// monk-and-staff single mesh (note 18 experiment). The army is the crimson redesign; the Captain the warlord.
const ONE = typeof location !== 'undefined' && /[?&]onemodel/.test(location.search);
export const ONE_MODEL = ONE;
export const KIND_DIR = { joon: ONE ? 'joon-monk-staff' : 'joon-monk', soldier: 'soldier-crimson', shield: 'shield-soldier-crimson', captain: 'captain-warlord', elder: 'elder' };
const STANCES = { joon: 'joon/joon-combat-stance.glb', soldier: 'soldier/soldier-combat-stance.glb', shield: 'soldier/soldier-combat-stance.glb', captain: 'captain/captain-combat-stance.glb' };
const seen = new Set();
export const Models = { joon: null, soldier: null, shield: null, captain: null };   // { scene, clips:[{logical,clip}], height, skinned }
const listeners = [];
export const onModel = (fn) => listeners.push(fn);
export const loadLog = [];

// ---- the static manifest + byte progress (drives the title-screen loading bar)
let manifestP = null;
function manifest() {
  if (!manifestP) manifestP = fetch('assets/manifest.json', DEBUG ? { cache: 'no-store' } : {}).then((r) => r.ok ? r.json() : null).catch(() => null)
    .then((j) => { j = j || { files: {} }; j.files = j.files || {}; return j; });
  return manifestP;
}
export const Progress = { total: 0, loaded: 0, files: 0, filesDone: 0, done: false };
const progressFns = [];
export const onProgress = (fn) => progressFns.push(fn);
const tellProgress = () => { for (const fn of progressFns) fn(Progress); };
const bufs = new Map();   // url -> Promise<ArrayBuffer>
let active = 0; const queue = [];
const pump = () => { while (active < 6 && queue.length) { active++; const job = queue.shift(); job().finally(() => { active--; pump(); }); } };
function fetchBuf(url, size = 0) {
  if (bufs.has(url)) return bufs.get(url);
  Progress.total += size; Progress.files++;
  const p = new Promise((resolve, reject) => {
    queue.push(async () => {
      let got = 0;
      try {
        const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
        const len = +r.headers.get('content-length') || 0;
        if (!size && len) { size = len; Progress.total += len; }
        const reader = r.body && r.body.getReader ? r.body.getReader() : null;
        let ab;
        if (reader) {
          const chunks = [];
          for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; Progress.loaded += value.length; tellProgress(); }
          const out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } ab = out.buffer;
        } else { ab = await r.arrayBuffer(); got = ab.byteLength; Progress.loaded += got; }
        if (size > got) Progress.loaded += size - got;   // keep the bar honest if the size in the manifest is stale
        resolve(ab);
      } catch (e) { Progress.loaded += Math.max(0, size - got); reject(e); }
      finally { Progress.filesDone++; tellProgress(); }
    });
    pump();
  });
  bufs.set(url, p);
  return p;
}
async function loadGLB(url) {
  const ab = await fetchBuf(url);
  return loader.parseAsync(ab, THREE.LoaderUtils.extractUrlBase(url));
}
const sizeOf = (m, url) => (m.files[url] || 0);

async function listFolder(url) {
  if (!DEBUG) return [];
  try {
    const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) return [];
    const html = await r.text();
    return [...html.matchAll(/href="([^"]+\.glb)"/gi)].map((m) => decodeURIComponent(m[1]));
  } catch { return []; }
}
async function manifestFiles() {
  const m = await manifest();
  const out = Object.keys(m.files).filter((p) => /^assets\/models\/(clips|[^/]+)\/[^/]+\.glb$/i.test(p) && !/-combat-stance\.glb$/.test(p));
  if (!DEBUG) return out;
  try {   // dev: the hand-written model manifest (any shape: every *.glb string in it counts)
    const r = await fetch('assets/models/manifest.json', { cache: 'no-store' }); if (!r.ok) return out;
    const j = await r.json();
    const walk = (v) => { if (typeof v === 'string' && /\.glb$/i.test(v)) out.push(v); else if (v && typeof v === 'object') for (const k in v) walk(v[k]); };
    walk(j);
    return out.map((p) => p.replace(/^\.?\/?(3d-slice\/)?/, '')).map((p) => p.startsWith('assets/') ? p : 'assets/models/' + p);
  } catch { return out; }
}

export function logicalFor(name) {
  const n = name.replace(/^.*\//, '').replace(/\.glb$/i, '');
  // ordered: more specific first
  const order = ['backflip', 'idle', 'run', 'walk', 'roll', 'hurt', 'dead', 'kick', 'punch1', 'castFire', 'castWater', 'castEarth', 'castAir', 'roar', 'throwFire', 'jump', 'fall'];
  for (const k of order) if (CLIP_MATCH[k].test(n)) return k;
  return null;
}

function stripClip(clip) {
  // keep hips height, lock horizontal root motion (code moves the character); drop scale tracks
  clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
  for (const t of clip.tracks) {
    if (t.name === 'Hips.position') {
      const v = t.values, x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
  return clip;
}

// shared clip library (models/clips/): animation tracks only, applied to every generated character.
// seg = [start, end] seconds of the source clip used for the game action; lockY = code owns the height.
export const CLIP_TABLE = {
  // chosen by rendering every clip as an 8-frame strip on Joon (shots/clip-*.png)
  'run': [{ logical: 'run' }],
  'jump': [{ logical: 'jump', seg: [0.5, 1.45], lockY: true }],   // v3: the real jump (player.js JC)
  'backflip': [{ logical: 'backflip', seg: [0.25, 1.85], lockY: true }],          // foot at the top of the flip ~1.0 s -> u 0.47
  'roll-dodge': [{ logical: 'roll', seg: [0.35, 1.65] }],
  'hit-reaction': [{ logical: 'hurt', seg: [0.1, 0.9] }],
  'knock-down': [{ logical: 'knockdown', seg: [0.15, 2.0] }, { logical: 'dead', seg: [0.15, 2.4] }],
  'blown-back': [{ logical: 'blown', seg: [0.6, 2.0] }],
  'spin-jump': [{ logical: 'whirl', seg: [0.6, 2.2], lockY: true }],
  'ground-slam': [{ logical: 'castWall', seg: [0.9, 2.3], hitU: 0.68 }],          // fist hits the ground ~1.85 s
  'roundhouse-kick': [{ logical: 'kick', seg: [0.6, 1.9], hitU: 0.56 }],          // kick extended ~1.35 s
  'rising-flying-kick': [{ logical: 'launcher', seg: [0.05, 1.0], hitU: 0.42, lockY: true }],
  // looked at, not used: punch-combo (punches too small to read), kung-fu-punch (7 s mixed routine),
  // spell-cast (ends arm-up, no forward release), backflip-sweep-kick (floor work)
  'kung-fu-punch': [], 'punch-combo': [], 'backflip-sweep-kick': [],
  // v2: the staff library (generic two-handed weapon clips). Segments are chosen per move in player.js
  // (play(..., { seg })), so each is registered whole. Timings from review-3d-v2 and tests/frames/strip-*.
  'staff-combo-3': [{ logical: 'sCombo3' }], 'staff-combo-2': [{ logical: 'sCombo2' }], 'staff-heavy-overhead': [{ logical: 'sHeavy' }],
  'staff-thrust': [{ logical: 'sThrust' }], 'staff-sweep': [{ logical: 'sSweep' }], 'staff-spin': [{ logical: 'sSpin' }],
  'staff-stance': [{ logical: 'sStance' }], 'staff-parry': [{ logical: 'sParry' }], 'staff-walk': [{ logical: 'sWalk' }],
  'palm-push-both': [{ logical: 'palm' }],          // both palms out at ~1.55 s
  'dodge-counter': [{ logical: 'dodgeCounter' }],   // a slip at 2.3-3.4 s
  'spell-cast': [{ logical: 'cast' }],
  // arrived 10:06-10:17 (review-3d-v2 clip requests); segments from tests/frames/strip-*
  'staff-run': [{ logical: 'sRun' }],                 // loop 0-0.53 s
  'walk-casual': [{ logical: 'walk' }],               // loop 0-4.2 s
  'takedown-leg-sweep': [{ logical: 'legSweep' }],    // the sweep 0.45-1.5 s
  'get-up': [{ logical: 'getup' }],                   // rises 3.0-5.8 s
  'dazed-sway': [{ logical: 'dazed' }],               // loop
  'block-impact': [{ logical: 'blockHit' }],          // the hit and slide 1.05-1.7 s
  'over-shoulder-throw': [{ logical: 'throw' }],      // v7 note 41: the Elder's icicle throw (Meshy library 421)
  'kneel-and-rise': [{ logical: 'kneel' }],           // down 0-0.9 s, up to 2.57 s
  'sidestep': [{ logical: 'sidestep' }],              // 0.1-0.7 s
  // v4 note 24: the jump + R1 plunge (segments chosen in player.js)
  'jump-slam': [{ logical: 'jSlam' }], 'jump-overhead-strike': [{ logical: 'jOver' }],
  // v5 (planner 16:05): the sword-and-shield clips for the shield-bearer (the left arm carries the shield)
  'shield_push_left': [{ logical: 'shieldPush' }], 'attack': [{ logical: 'spearAtk' }], 'walk_backward_sword_shield': [{ logical: 'shieldBack' }],
  // v6: the rest of the grip clips (Joon's chain on weapon_combo, the shield-bearer's alert turns, the spear's left slash)
  'weapon_combo': [{ logical: 'wCombo' }], 'left_slash': [{ logical: 'lSlash' }],
  'sword_shield_alert_turn_left': [{ logical: 'alertL' }], 'sword_shield_alert_turn_right': [{ logical: 'alertR' }],
};
export const Shared = [];   // { file, logical, clip, seg, lockY, restY }
async function loadShared(path) {
  const file = path.replace(/^.*\//, '').replace(/\.glb$/i, '');
  try {
    const gltf = await loadGLB(path);
    const src = gltf.animations[0]; if (!src) return;
    const hips = gltf.scene.getObjectByName('Hips');
    const restY = hips ? hips.position.y : 0;
    src.tracks = src.tracks.filter((t) => !t.name.endsWith('.scale'));
    Shared.push({ file, logical: null, clip: src, restY, seg: [0, src.duration] });
    for (const e of CLIP_TABLE[file] || []) {
      const c = { file, logical: e.logical, clip: src, restY, seg: e.seg || [0, src.duration], lockY: !!e.lockY, hitU: e.hitU };
      Shared.push(c);
      loadLog.push(`shared clip ${e.logical} <- ${file}`);
      for (const fn of listeners) fn('*', 'shared', c);
    }
  } catch (e) { loadLog.push('failed ' + path + ': ' + e.message); }
}

async function loadFile(path) {
  if (path.includes('/models/clips/')) return loadShared(path);
  const kind = KINDS.find((k) => path.includes('/models/' + KIND_DIR[k] + '/'));
  if (!kind) return;
  try {
    const gltf = await loadGLB(path);
    const logical = logicalFor(path) || logicalFor(gltf.animations[0] ? gltf.animations[0].name : '');
    const clips = gltf.animations.map((c) => ({ logical: logicalFor(c.name) && logical === null ? logicalFor(c.name) : logical, clip: stripClip(c) })).filter((c) => c.logical);
    let skinned = null; gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
    if (!Models[kind]) {
      if (!skinned) { loadLog.push(path + ': no skinned mesh'); return; }
      toonify(gltf.scene, { outline: 0.9, character: true });
      // v4: the redesigned models ship with a stub clip; borrow the old character's combat stance as the idle
      const STANCE = STANCES[kind];
      if (STANCE && !clips.some((c) => c.logical === 'idle')) {
        try { const sg = await loadGLB('assets/models/' + STANCE); if (sg.animations[0]) clips.push({ logical: 'idle', clip: stripClip(sg.animations[0]) }); } catch (e) { loadLog.push('stance failed ' + STANCE); }
      }
      const box = new THREE.Box3().setFromObject(gltf.scene);
      Models[kind] = { scene: gltf.scene, clips, height: box.max.y - box.min.y, skinned };
      loadLog.push(`${kind}: model from ${path} (${clips.map((c) => c.logical).join(',')})`);
      for (const fn of listeners) fn(kind, 'model', Models[kind]);
    } else {
      for (const c of clips) {
        if (Models[kind].clips.some((x) => x.logical === c.logical)) continue;
        Models[kind].clips.push(c);
        loadLog.push(`${kind}: clip ${c.logical} from ${path}`);
        for (const fn of listeners) fn(kind, 'clip', c);
      }
    }
  } catch (e) { loadLog.push('failed ' + path + ': ' + e.message); }
}

const wanted = (f) => f.includes('/models/clips/') || KINDS.some((k) => f.includes('/models/' + KIND_DIR[k] + '/'));
export async function scanModels() {
  const m = await manifest();
  const files = new Set(await manifestFiles());
  for (const k of [...KINDS.map((k) => KIND_DIR[k]), 'clips']) for (const f of await listFolder(`assets/models/${k}/`)) files.add(`assets/models/${k}/${f.replace(/^.*\//, '')}`);
  // base model first: prefer the stance/idle file so the rest pose comes from it
  const fresh = [...files].filter((f) => !seen.has(f) && wanted(f)).sort((a, b) => (/stance|idle/i.test(b) ? 1 : 0) - (/stance|idle/i.test(a) ? 1 : 0));
  // fetch everything in parallel (bytes count toward Progress), then parse in this order
  for (const f of fresh) {
    fetchBuf(f, sizeOf(m, f)).catch(() => {});
    const kind = KINDS.find((k) => f.includes('/models/' + KIND_DIR[k] + '/'));
    if (kind && STANCES[kind] && !Models[kind]) { const s = 'assets/models/' + STANCES[kind]; fetchBuf(s, sizeOf(m, s)).catch(() => {}); }
  }
  for (const f of fresh) { seen.add(f); await loadFile(f); }
  return fresh.length;
}

export function startPolling() { if (DEBUG) setInterval(() => { scanModels(); scanProps(); }, 20000); }

// ---- props ----
export const Props = {};
const propSeen = new Set();
export async function scanProps() {
  const m = await manifest();
  const files = new Set(Object.keys(m.files).filter((p) => /^assets\/props\/[^/]+\.glb$/i.test(p)).map((p) => p.replace(/^.*\//, '')));
  for (const n of await listFolder('assets/props/')) files.add(n.replace(/^.*\//, ''));
  const want = ['bell-frame', 'gate-pavilion', 'training-post', 'ringed-staff'];
  for (const w of want) if (!files.size) files.add(w + '.glb');
  const fresh = [...files].filter((f) => !propSeen.has(f));
  for (const f of fresh) fetchBuf('assets/props/' + f, sizeOf(m, 'assets/props/' + f)).catch(() => {});
  for (const f of fresh) {
    propSeen.add(f);
    try {
      const g = await loadGLB('assets/props/' + f);
      toonify(g.scene, { outline: 0.8 });
      Props[f.replace('.glb', '')] = g.scene;
      for (const fn of listeners) fn(f.replace('.glb', ''), 'prop', g.scene);
    } catch (e) { loadLog.push('prop failed ' + f); }
  }
}
// both scans finished: the title screen shows its prompt
export function loadAll() {
  return Promise.all([scanModels(), scanProps()]).then((r) => { bufs.clear(); Progress.done = true; Progress.loaded = Math.max(Progress.loaded, Progress.total); tellProgress(); return r; });
}

// ---- textures ----
const tl = new THREE.TextureLoader();
export function tex(url, o = {}) {
  const t = tl.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  t.anisotropy = 8;
  return t;
}

// ---- the Meshy effect meshes (assets/fx3d-mesh): toon material + ink hull; the whirlwind lift uses one
export const FXMesh = {};
export async function loadFXMesh(name) {
  if (FXMesh[name] !== undefined) return FXMesh[name];
  FXMesh[name] = null;
  try { const g = await loadGLB('assets/fx3d-mesh/' + name + '.glb'); toonify(g.scene, { outline: 0.6 }); g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); FXMesh[name] = g.scene; } catch { loadLog.push('fx mesh missing ' + name); }
  return FXMesh[name];
}
