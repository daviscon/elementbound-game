// Elementbound 3D (v2): boot, renderer, lights, the main loop (hit-stop, slow-motion), title / pause menu /
// ending, pad connection handling, hot-swapping generated models as they arrive, and window.__game.
import * as THREE from 'three';
import { G } from './state.js';
import { buildWorld, buildV2, World, placeProp, fallbackProps, updateWorld, SUN, HAZE } from './world.js';
import { Player } from './player.js';
import { initInput, pollInput, Input } from './input.js';
import { updateCamera, Cam, LOCK, lockSwitch } from './camera.js';
import { initFX, updateFX, Time, setPointScale, FX } from './fx.js';
import { initBending, updateProjectiles, updateWalls, Bend } from './bending.js';
import { Audio } from './audio.js';
import { HUD, glyph } from './hud.js';
import { Menu } from './menu.js';
import { Level, warp, ceremony, startEncounter, startBoss } from './level.js';
import { loadAll, onProgress, Progress, DEBUG, startPolling, onModel, Models, Props, loadLog, Shared, CLIP_TABLE } from './assets.js';
import { Soldier, Captain } from './enemies.js';
import { Character } from './rig.js';
import { initFX3D, updateFX3D, renderImpact, markFighter } from './fx3d.js';
import { Guide } from './guide.js';
import { initTouch } from './touch.js';

const qs = new URLSearchParams(location.search);
if (qs.has('fxlab') && DEBUG) location.replace('fx-lab.html');   // release: dev tools only with ?debug
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(HAZE);
scene.fog = new THREE.Fog(HAZE, 70, 380);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.08, 2500);
G.scene = scene; G.camera = camera;

const hemi = new THREE.HemisphereLight(0xbfd0ff, 0x8a6a58, 0.95); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd8a8, 2.3);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 140;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
const fill = new THREE.DirectionalLight(0x9fb4ff, 0.55); fill.position.set(30, 20, -40); scene.add(fill);

function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); setPointScale(innerHeight * renderer.getPixelRatio()); }
addEventListener('resize', resize); resize();

buildWorld(scene); buildV2();
initFX(scene, camera); initFX3D(scene, camera); initBending(scene); initInput(canvas); HUD.init(); Menu.load();
// v3 (3D-DIRECTION 1, note 9): characters animate on twos (12 fps held poses) for strikes, stances and
// reactions; locomotion stays on ones so the feet never slide under a held pose (compared in shots/twos-ab.mp4)
Character.twos = qs.has('twos');   // planner hotfix 13:12: Connor found the held 12 fps poses clunky ("not enough frames"), so full frame rate is the default; ?twos brings it back Character.twosSkip = /^(run|walk|sRun|sWalk)$/;
const player = G.player = new Player(scene);
if (qs.has('fire')) player.unlocked.fire = true;
player.spawn(World.spots.start, Math.PI);
Level.init();

// generated assets swap in as they arrive (and every 20 s after)
onModel((kind, what, data) => {
  if (what === 'prop') {
    if (kind === 'ringed-staff') { player.staff.setModel(data); return; }
    if (kind === 'captain-glaive') { for (const e of G.enemies) if (e.weapon && e.weapon.kind === 'glaive') e.weapon.setModel(data); return; }   // v8: never a soldier's spear
    placeProp(kind, data); return;
  }
  if (what === 'shared') { if (!G.noShared) { player.char.addShared(data); for (const e of G.enemies) e.char.addShared(data); if (Level.elderChar && /^(throw|walk)$/.test(data.logical)) Level.elderChar.addShared(data); } return; }
  const chars = [];
  if (kind === 'joon') chars.push(player.char);
  if (kind === 'elder' && Level.elderChar) chars.push(Level.elderChar);
  if (kind === 'soldier' || kind === 'shield' || kind === 'captain') for (const e of G.enemies) if (e.char.kind === kind) chars.push(e.char);
  for (const c of chars) { if (what === 'model') c.useModel(Models[kind]); else c.addClip(data.logical, data.clip); }
});
{
  const orig = Character.prototype.useFallback;
  Character.prototype.useFallback = function () { orig.call(this); if (Models[this.kind]) this.useModel(Models[this.kind]); };
  const origUM = Character.prototype.useModel;
  Character.prototype.useModel = function (m) { origUM.call(this, m); if (!G.noShared) for (const c of Shared) if (c.logical) this.addShared(c); };
}

const $ = (id) => document.getElementById(id);
const titleText = () => { $('title-go').innerHTML = Input.usingTouch ? 'Tap to begin' : `${glyph('✕')} Begin`; };
titleText();
HUD.onRelabel = () => { titleText(); if (Menu.open) Menu.render(); };
// the title-screen loading bar: real byte progress of the manifest loads (assets.js Progress); Begin appears at 100%
document.body.classList.add('loading');
const paintLoad = (p) => { const f = p.total ? Math.min(1, p.loaded / p.total) : 0; $('load-fill').style.width = (p.done ? 100 : 27 + f * 73).toFixed(1) + '%'; $('load-pct').textContent = p.done ? '' : Math.floor(f * 100) + '%'; };
onProgress(paintLoad);
loadAll().then(() => {
  fallbackProps();
  $('load-note').textContent = Input.padConnected ? '' : 'Best with a PlayStation controller · mouse and keyboard work too';
  startPolling();
  G.ready = true;
  paintLoad(Progress); document.body.classList.remove('loading');
});

// ------------------------------------------------------------------ audio unlock: every pad press until it runs
Input.onAnyPadPress = () => { if (Audio.ctx && !Audio.running) Audio.resume(); };
Input.onPadChange = (on) => {
  titleText();
  if (!on && G.state === 'play' && !G.paused) { setPause(true, true); }
  $('reconnect').classList.toggle('hidden', on || !G.started);
  if (on && G.paused) { $('reconnect').classList.add('hidden'); }
  HUD.abShown = '';
};

// ------------------------------------------------------------------ screens
function lockPointer() { if (G.testing || Input.usingPad || Input.usingTouch || G.touch) return;   // v7: never on touch
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} }
async function begin() {
  if (G.state !== 'title' || !G.ready || G.started) return;
  G.started = true;
  await Audio.init(); Audio.resume();
  Audio.play('menuConfirm');
  $('title').classList.add('out'); setTimeout(() => $('title').classList.add('hidden'), 1300);
  HUD.show(true);
  lockPointer();
  Level.start();
  // one move: crane down from the vista to Joon's shoulder
  updateCamera(0, 0.016);
  const end = { pos: camera.position.clone(), q: camera.quaternion.clone() };
  titleCam(0); Cam.ret = { t: 0, dur: 2.6, fromPos: camera.position.clone(), fromQ: camera.quaternion.clone(), fromFov: camera.fov };
}
$('title').addEventListener('click', begin);
canvas.addEventListener('click', () => { if (G.state === 'play' && !Input.locked && !G.paused) lockPointer(); });
function setPause(on, pad = false) {
  if (G.paused === on || performance.now() - (G.pauseAt || 0) < 250) return;
  G.pauseAt = performance.now();
  G.paused = on;
  if (on) Menu.show(); else Menu.hide();
  Audio.play(on ? 'pauseOpen' : 'pauseClose', { vol: 0.5 });
  if (on) document.exitPointerLock && document.exitPointerLock(); else lockPointer();
}
Menu.onClose = () => setPause(false);
Menu.onRestart = () => { setPause(false); Level.respawn(); };
// never pause on pointer-lock loss while a pad is in use
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && G.state === 'play' && !G.paused && !G.testing && !Input.usingPad) setPause(true); });

// ------------------------------------------------------------------ loop
let last = performance.now(), fpsAcc = 0, fpsN = 0;
const dbg = $('dbg');
function frame(now) {
  requestAnimationFrame(frame);
  let realDt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.testing && G.fixedDt) realDt = G.fixedDt;
  G.frameTimes.push(realDt * 1000); if (G.frameTimes.length > 600) G.frameTimes.shift();
  G.realTime += realDt;
  pollInput(realDt);
  if (G.state === 'title') { if (Input.pressed('confirm') || Input.pressed('pause')) begin(); }
  else if (G.state === 'ending') { if (Input.pressed('confirm') || Input.pressed('pause')) location.reload(); }
  else if (Input.pressed('pause') && (G.state === 'play' || G.paused)) setPause(!G.paused);
  if (G.paused) { Menu.update(); renderer.render(scene, camera); return; }
  if (Time.slowT > 0) { Time.slowT -= realDt; if (Time.slowT <= 0) Time.target = 1; }
  Time.scale += (Time.target - Time.scale) * (1 - Math.exp(-(Time.target < Time.scale ? 30 : 6) * realDt));
  let dt = realDt * Time.scale;
  if (Time.stop > 0) { Time.stop -= realDt; dt = 0; }
  Audio.setRate(Time.scale);
  G.time += dt;
  if (G.state === 'title') { titleCam(realDt); }
  else {
    player.update(dt);
    // the parked fire backflip (?fire=1): L2 + □
    if (player.unlocked.fire && Input.pressed('fireflip') && !player.action && G.state === 'play') { const a = Bend.fire.heavy(player); a.kind = 'bend'; a.t = 0; player.action = a; }
    for (const e of G.enemies) e.update(dt);
    G.enemies = G.enemies.filter((e) => !e.removed);
    updateProjectiles(dt); updateWalls(dt);
    Level.update(dt);
    Guide.update(dt);
    updateCamera(dt, realDt);
  }
  updateFX(dt, realDt); updateFX3D(dt);
  updateWorld(dt, camera);
  for (const c of World.clouds) c.rotation.y = Math.atan2(camera.position.x - c.position.x, camera.position.z - c.position.z);
  sun.position.copy(player.pos).addScaledVector(SUN, 60); sun.target.position.copy(player.pos);
  HUD.update(realDt);
  // impact frames: the fighters in ink over a burst (1-2 frames on the biggest hits)
  for (const ch of [player.char, ...G.enemies.map((e) => e.char)]) if (ch.root.userData.fighter !== ch.backend) { ch.root.userData.fighter = ch.backend; markFighter(ch.root); }
  if (player.staff.group.userData.fighter !== player.staff.inner.children.length) { player.staff.group.userData.fighter = player.staff.inner.children.length; markFighter(player.staff.group); }
  if (!renderImpact(renderer, scene, camera)) renderer.render(scene, camera);
  fpsAcc += realDt; fpsN++;
  if (fpsAcc > 0.5) { if (G.showFps && DEBUG) dbg.textContent = `${Math.round(fpsN / fpsAcc)} fps  ${renderer.info.render.calls} calls`; fpsAcc = 0; fpsN = 0; }
}
let tt = 0;
function titleCam(dt) {
  tt += dt;
  camera.position.set(Math.sin(tt * 0.05) * 5 + 2, 9, 40);
  camera.lookAt(0, 3, 0);
  if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ test handle
window.__game = {
  G, World, Cam, LOCK, lockSwitch, Time, Input, Models, Props, loadLog, Audio, HUD, Menu, Level,
  start: () => begin(),
  warp: (n) => warp(n),
  unlock: (...abs) => { for (const a of abs) player.unlocked[a] = true; },
  grantAll: () => Object.assign(player.unlocked, { shot: true, step: true, whirl: true }),   // whirl = the double jump (v8 note 47)
  ceremony: (i) => ceremony(i), encounter: (id) => startEncounter(id), boss: (ph) => startBoss(ph),
  god: (on = true) => { G.god = on; },
  spawn: (kind = 'soldier', x, y, z, o = {}) => { const e = kind === 'captain' ? new Captain(new THREE.Vector3(x, y, z), { awake: true, encounter: o.encounter ?? 'test', ...o }) : new Soldier(new THREE.Vector3(x, y, z), { awake: true, encounter: o.encounter ?? 'test', role: kind === 'soldier' ? 'grunt' : kind, ...o }); e.lastGround = y; G.enemies.push(e); if (kind === 'captain') { G.boss = e; HUD.boss(e); } return e; },
  aimAt: (x, y, z) => { const d = new THREE.Vector3(x, y, z).sub(camera.position); Cam.yaw = Math.atan2(-d.x, -d.z); Cam.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); },
  press: (code, on = true) => { if (on) Input.injected.add(code); else Input.injected.delete(code); },
  look: (dx, dy) => { Cam.yaw -= dx; Cam.pitch -= dy; },
  // tune the staff grip live: grip('sCombo3', x, y, z) sets that clip's grip axis in RightHand space
  grip: (clip, x, y, z) => { import('./staff.js').then((m) => { m.GRIP[clip] = [x, y, z]; }); },
  Guide,
  twos: (on = true, skip = null) => { Character.twos = on; Character.twosSkip = skip ? new RegExp(skip) : null; },
  frameStats: () => { const f = [...G.frameTimes].sort((a, b) => a - b); return { n: f.length, avg: f.reduce((a, b) => a + b, 0) / f.length, p95: f[Math.floor(f.length * 0.95)], max: f[f.length - 1] }; },
  info: () => renderer.info,
  renderer, scene, camera, player, Shared, CLIP_TABLE,
  viewClip: (file, t) => { const c = Shared.find((s) => s.file === file && !s.logical) || Shared.find((s) => s.file === file); const ch = player.char; if (!c) return 'missing';
    ch.backend.clips.__view = { clip: c.clip, action: ch.backend.mixer.clipAction(c.clip) }; ch.play('__view', { restart: true, fade: 0, dur: 1e6, loop: false }); ch.viewT = t; return c.clip.duration; },
};
// v7 note 43: touch controls, the rotate card and the Mobile quality preset (js/touch.js)
initTouch({ renderer, sun, resize, setPause: (on) => setPause(on) });
