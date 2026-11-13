// Level flow for "Kite Hill: the monastery under siege" (v2).
//  1. The Elder walks Joon up the cliff path, talking (captions, no boxes). Staff practice at the training
//     post: the light chain, the heavy, guard and parry (the Elder throws gold-signalled wind), the dodge,
//     the palm gust. The gate opens.
//  2. Courtyard: two grunts, then a shield-bearer. The east edge is open.
//  3. Shrine 1 (stairs): the Aimed Gust. Used at once on the wind-wheel that winches the stairs gate, and on a
//     slinger on the wall top.
//  4. Terrace wave 1: two shield-bearers and a slinger on the walkway. Shrine 2: the Wind-Step. Wave 2: the
//     Sergeant (a red sweep) and two grunts. Side path: the three chimes and a chest.
//  5. Shrine 3: the Double Jump. The Captain on the bell terrace, three phases. His last fall rings the bell.
//  6. The camera drifts to the waterfall: water is next. ✕ plays again.
// Shrines double as checkpoints. Story camera moves are continuous (Cam.shot / Cam.release), never cuts.
import * as THREE from 'three';
import { G, hurtPlayer, killEnemy } from './state.js';
import { World } from './world.js';
import { Soldier, Captain } from './enemies.js';
import { Character } from './rig.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';
import { Input, rumble } from './input.js';
import { Cam } from './camera.js';
import { FX, flip, flipQuad, inkRing, chunks, shake, slowmo, hitstop, ribbon, rnd, Time } from './fx.js';
import { spawnProjectile, projTell } from './bending.js';
import { toon, addOutline } from './toon.js';
import { tex } from './assets.js';
import { impact, windTube, windRing, icicleMesh, iceDraw, iceShatter } from './fx3d.js';

const ELDER = 'Elder Sora-Lin';
let elder, captions = [], capT = 0;
const ELDER_PORTRAIT = 'assets/ui/npc-elder-portrait.webp';

export const Level = {
  stage: 'intro', train: -1, wave: 0,
  init() {
    elder = this.elderChar = new Character('elder', G.scene);
    elder.root.position.set(-1.4, 0, 16.5); elder.root.rotation.y = Math.PI; elder.params.relaxed = true; elder.play('idle', { fade: 0 });
    this.elderPath = [new THREE.Vector3(-1.4, 0, 12), new THREE.Vector3(-1.5, 0, 4), new THREE.Vector3(-0.2, 0, -1.2), new THREE.Vector3(1.4, 0, -2.6)];
    this.elderI = -1;
    G.onPlayerDeath = () => setTimeout(() => Level.respawn(), 1800);
    G.onPlayerFell = () => { if (!G.god && !(Level.stage === 'intro' && G.player.pos.z > 5)) G.player.hp -= 1; HUD.hurt(); if (G.player.hp <= 0) G.player.die(); else Level.respawn(true); };
    G.onCaptainPhase2 = (c) => phase2(c);
    G.onCaptainPhase3 = (c) => phase3(c);
    G.onCaptainTear = (c) => tearFloor(c);
    G.onCaptainFinish = (c, p) => captainFinish(c, p);
    G.onCaptainDefeated = (c) => {};
    G.spawnHeart = (pos) => spawnHeart(pos);
    G.extraMarks = [];
    // the training post takes strikes and counts the drill
    G.dummies = [{ pos: World.spots.post.clone(), onHit: (k) => trainHit(k) }];
    // the wind-wheel: three aimed gusts within 6 s winch the stairs gate open
    const V = World.v2;
    this.wheelHits = []; this.wheelSpin = 0;
    G.targets = [];
    V.wheel.group.updateMatrixWorld(true);
    this.wheelT = { pos: V.wheel.group.getWorldPosition(new THREE.Vector3()), r: 1.15, done: false, onHit: (k) => wheelHit(k) };
    G.targets.push(this.wheelT);
    this.chimeHits = [null, null, null];
    V.chimes.forEach((c, i) => { const t = { pos: c.at.clone(), r: 0.6, done: false, i, onHit: (k) => chimeHit(i, k) }; c.target = t; G.targets.push(t); });
    // v3: no invisible barrier before the bell terrace: the fallen stairs (a 2.3 m face) are the gate, and the
    // Double Jump from shrine 3 is how you climb them
    this.barrier3 = { x0: 0, x1: 0, z0: 0, z1: 0, y0: 0, y1: 0, off: true };
  },

  start() {
    G.state = 'play'; G.stats.start = performance.now();
    G.checkpoint = { pos: World.spots.start.clone(), yaw: Math.PI, stage: 'intro' };
    Audio.music('hill', 2.5); Audio.ambience();
    G.calm = true;
    setTimeout(() => HUD.area('KITE HILL', 'the monastery under siege'), 1600);
    setTimeout(() => HUD.hintOnce('move', '[LS] move   [RS] look', 4), 3200);
    this.elderI = 0;
    document.getElementById('goal').classList.add('lesson');   // v7 note 40: a bigger goal line through the lessons
    say([[ELDER, 'Joon. Walk with me to the training post. The soldiers are already on the lower stairs.'],
      [ELDER, 'Your staff first. Air comes later, one breath at a time.']]);
  },

  respawn(fell) {
    const p = G.player, cp = G.checkpoint;
    const f = document.getElementById('fade'); f.style.opacity = 1;
    setTimeout(() => {
      if (!fell) { p.hp = p.maxHp; p.breath = p.maxBreath; p.cd.gust = 0; }
      const safe = fell && p.lastSafe.lengthSq() > 0 && !G.boss;
      p.spawn(safe ? p.lastSafe : cp.pos, safe ? p.yaw : cp.yaw); p.iframes = 1.5; HUD.shownHp = -1;
      if (!fell && G.encounter && !G.encounter.done) resetEncounter(G.encounter);
      G.hazards = G.hazards.filter((h) => h.t === undefined && !h.lane);
      f.style.opacity = 0;
    }, fell ? 450 : 700);
  },

  update(dt) {
    const p = G.player;
    updateElder(dt);
    updateCaptions(dt);
    // training: the Elder's parry drill
    if (this.train === 2) drill(dt);
    LessonRing.update(dt);
    // gate barrier sinks once open; the stairs gate winches up
    if (G.flags.gateOpen && World.barrier.position.y > -3) World.barrier.position.y -= dt * 2.2 * Math.min(1, (World.barrier.position.y + 3.3) / 1.0);
    const V = World.v2;
    // v3: the stairs gate drops into its slot as the wheel winches (it sits in a real frame now)
    if (G.flags.gate2Open && V.gate.position.y > -3.9) V.gate.position.y -= dt * 1.6 * Math.min(1, (V.gate.position.y + 4.2) / 1.2);
    // the wind-wheel turns with every gust
    this.wheelSpin *= Math.exp(-dt * (G.flags.gate2Open ? 0.15 : 0.6));
    V.wheel.hub.rotation.z -= this.wheelSpin * dt;
    // chimes swing
    for (const c of V.chimes) { c.swing = (c.swing || 0) * Math.exp(-dt * 1.5); c.hang.rotation.z = Math.sin(G.time * 9) * c.swing; }
    // stage triggers
    if (this.stage === 'courtyard' && p.pos.z < -15 && !G.flags.enc1) { G.flags.enc1 = true; startEncounter('court'); }
    if (this.stage === 'terrace' && p.pos.z < -53 && !G.flags.enc3) { G.flags.enc3 = true; startEncounter('terrace1'); }
    if (this.stage === 'bell' && p.pos.z < -86 && !G.flags.boss && G.flags.attuned3) { G.flags.boss = true; startBoss(); }
    // interact: shrines, the chest
    shrinePrompts(p);
    if (this.stage === 'bell' && !G.flags.attuned3 && p.pos.z < -70) HUD.hintOnce('shrine3', 'The bell stairs have fallen. The shrine by the west wall hums: [△] attune', 5);
    if (Level.stage === 'stairs' && !G.flags.gate2Open && p.pos.z < -38 && p.unlocked.shot) HUD.hintOnce('wheel', 'Spin the wind-wheel: three aimed gusts [L2+R2] in quick succession', 5);
    // encounter progress (waves)
    const enc = G.encounter;
    // planner hotfix 12:05 (Connor couldn't reach shrine 2): a slinger left alone on a high ledge no longer
    // blocks the level. Once the ground fighters are down, a lone slinger gets 6 s, then retreats over the wall.
    if (enc && enc.id !== 'boss' && !enc.done && enc.spawned && !enc.waiting) {
      const alive = G.enemies.filter((e) => e.encounter === enc.id && !e.dead);
      if (alive.length && alive.every((e) => e.role === 'slinger')) {
        enc.loneT = (enc.loneT || 0) + dt;
        if (enc.loneT > 6) { for (const e of alive) { FX.dust(e.pos, 3, 1); e.remove(); } G.enemies = G.enemies.filter((e) => !(e.encounter === enc.id && alive.includes(e))); }
      } else enc.loneT = 0;
    }
    if (enc && enc.id !== 'boss' && !enc.done && enc.spawned && G.enemies.filter((e) => e.encounter === enc.id && !e.dead).length === 0 && !enc.waiting) {
      if (enc.wave + 1 < ENC[enc.id].waves.length) { enc.waiting = true; setTimeout(() => { enc.waiting = false; enc.wave++; spawnWave(enc); }, 900); }
      else if (enc.id !== 'boss') encounterDone(enc);
    }
    // hazards: fire-pot patches and the Captain's fire lanes
    for (let i = G.hazards.length - 1; i >= 0; i--) {
      const h = G.hazards[i];
      if (h.t !== undefined) { h.t -= dt; if (h.t <= 0) { G.hazards.splice(i, 1); continue; } }
      h.fx = (h.fx || 0) - dt;
      if (h.fx <= 0 && !h.quiet) { h.fx = h.lane ? 0.32 : 0.45; const off = h.lane ? h.dir.clone().multiplyScalar(rnd(h.len / 2)) : new THREE.Vector3(rnd(h.r * 0.5), 0, rnd(h.r * 0.5)); FX.fireTongue(new THREE.Vector3(h.x, h.y, h.z).add(off), h.lane ? 0.9 : 0.75, 0.75); }
      const inside = h.lane ? laneHit(h, p.pos) : Math.hypot(p.pos.x - h.x, p.pos.z - h.z) < h.r;
      if (inside && p.pos.y - h.y < 0.4) hurtPlayer(1, new THREE.Vector3(h.x, h.y, h.z).add(h.lane ? h.dir.clone().multiplyScalar(h.dir.dot(p.pos.clone().sub(new THREE.Vector3(h.x, h.y, h.z)))) : new THREE.Vector3()), { knock: 6, up: 4 });
    }
    // the fire wall that seals the bell terrace
    if (World.fireWall) { this.fwT = (this.fwT || 0) - dt; if (this.fwT <= 0) { this.fwT = 0.18; FX.fireTongue(new THREE.Vector3(rnd(3.6), World.spots.arenaGate.y, World.spots.arenaGate.z + rnd(0.3)), 1.1, 0.8); } }
    // tiles thrown up in phase 2 settle back
    for (const t of World.tiles) if (t.fly) { t.v.y -= 26 * dt; t.m.position.addScaledVector(t.v, dt); t.m.rotation.x += t.w * dt; if (t.m.position.y < t.land) { t.m.position.y = t.land; t.fly = false; t.m.rotation.set(t.rx, t.m.rotation.y, t.rz); Audio.play('rockImpact', { at: t.m.position, vol: 0.4 }); } }
    // heart pickups
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const k = G.pickups[i]; k.t += dt; k.s.position.y = k.y + 0.3 + Math.sin(k.t * 4) * 0.1;
      if (k.t > 0.6 && k.s.position.distanceTo(p.pos.clone().setY(p.pos.y + 0.8)) < 1.3) { p.heal(2); G.scene.remove(k.s); G.pickups.splice(i, 1); }
      else if (k.t > 20) { G.scene.remove(k.s); G.pickups.splice(i, 1); }
    }
  },
};
function laneHit(h, pos) { const d = pos.clone().sub(new THREE.Vector3(h.x, h.y, h.z)).setY(0); const along = d.dot(h.dir); const lat = d.addScaledVector(h.dir, -along).length(); return Math.abs(along) < h.len / 2 && lat < 0.7; }

// ------------------------------------------------------------------ captions (walk and talk)
function say(lines, then) { captions = lines.map((l) => ({ who: l[0], text: l[1] })); capT = 0; Level.capThen = then; showCaption(); }
function showCaption() {
  const c = captions[0]; if (!c) { HUD.clearCaption(); const t = Level.capThen; Level.capThen = null; t && t(); return; }
  c.dur = 1.6 + c.text.length * 0.052; capT = 0;
  HUD.caption(c.who, c.text, c.dur + 0.5);
  Audio.play(c.who === ELDER ? 'talk' : 'confirm', { vol: 0.35 });
}
function updateCaptions(dt) {
  if (!captions.length) return;
  capT += dt;
  // △ skips a line (only while nothing is fighting and nothing usable is near; ✕ is the jump now)
  const skip = Input.pressed('interact') && !G.player.combat && capT > 0.3 && !Level.promptNear;
  if (capT > captions[0].dur || skip) { captions.shift(); showCaption(); }
}

// ------------------------------------------------------------------ the Elder walks with Joon
function updateElder(dt) {
  const p = G.player, path = Level.elderPath;
  let moving = false;
  if (Level.elderI >= 0 && Level.elderI < path.length) {
    const tgt = path[Level.elderI], pos = elder.root.position;
    const d = tgt.clone().sub(pos).setY(0), dist = d.length();
    const lag = p.pos.distanceTo(pos);
    if (dist < 0.3) Level.elderI++;
    else if (lag < 6 || pos.z > p.pos.z + 1) {   // waits if Joon falls behind
      const sp = Math.min(2.3, dist * 2);
      pos.addScaledVector(d.normalize(), sp * dt); moving = true;
      // v3: the Elder hops the broken span of the cliff path
      const gz0 = World.gap.z0 - 0.4, gz1 = World.gap.z1 + 0.4;
      pos.y = pos.z > gz0 && pos.z < gz1 ? Math.sin(Math.PI * (gz1 - pos.z) / (gz1 - gz0)) * 0.8 : 0;
      elder.root.rotation.y += Math.atan2(Math.sin(Math.atan2(d.x, d.z) - elder.root.rotation.y), Math.cos(Math.atan2(d.x, d.z) - elder.root.rotation.y)) * Math.min(1, dt * 6);
      elder.params.phase = (elder.params.phase || 0) + sp * dt / 1.3; elder.params.phaseDriven = true;
    }
  }
  // the drill starts when either of them reaches the post
  // v7: the lessons start when Joon stands in the ring of wind by the post (the Elder is there or nearly)
  if (Level.stage === 'intro' && Level.train < 0 && Level.elderI >= 1 && Math.hypot(p.pos.x - SPOT.x, p.pos.z - SPOT.z) < 1.3) { captions.length = 0; HUD.clearCaption(); startTraining(); }
  if (!moving) {
    const toE = Math.hypot(p.pos.x - elder.root.position.x, p.pos.z - elder.root.position.z);
    if (toE < 10) { const want = Math.atan2(p.pos.x - elder.root.position.x, p.pos.z - elder.root.position.z); elder.root.rotation.y += Math.atan2(Math.sin(want - elder.root.rotation.y), Math.cos(want - elder.root.rotation.y)) * Math.min(1, dt * 3); }
  }
  if (Level.elderBusy > 0) Level.elderBusy -= dt;   // the throw clip plays out
  else elder.play(moving ? 'walk' : captions.length ? 'talk' : 'idle', { fade: 0.3 });
  elder.update(dt);
}

// ------------------------------------------------------------------ training at the post
// v7 note 40, an onboarding you can't get lost in. Every step has:
//  - one short line from the Elder, and a goal line (top right, kept up until the step is done) that names the exact
//    button for the scheme in use (pad, keyboard and mouse or touch; it relabels live);
//  - a soft ring of wind on the ground where she wants Joon (LessonRing), and a breadcrumb wisp of wind along the path
//    to it every 3 s while he is away from it, which stops once he is there;
//  - a chime and a tick (a gold check on the goal line) when it is done.
// The gate stays shut until the last lesson is done, so there is nothing else to do in the yard.
const SPOT = new THREE.Vector3(3.0, 0, -1.4);          // where Joon stands for every lesson (2.8 m from the post)
const PARRY_SPOT = new THREE.Vector3(0.5, 0, 1.5);      // the parry lesson's ring: a clear line to the Elder, the post out of shot
const THROW_SPOT = new THREE.Vector3(-2.5, 0, -2.5);    // where the Elder throws the icicle from (5 m away)
const WATCH_SPOT = new THREE.Vector3(1.0, 0, -3.9);     // where she watches the post lessons from
const DRILL = [
  { say: 'Three light strikes on the post. Let them flow.', text: 'Strike the post three times: [R1] [R1] [R1]' },
  { say: 'Now one heavy strike.', text: 'Heavy strike the post: [R2]' },
  { say: 'I will throw ice at you. Tap guard as it flashes gold.', text: 'Parry her icicle: tap [L1] just as it flashes gold' },
  { say: 'If you cannot stop it, do not be there.', text: 'Dodge roll: [○]' },
  { say: 'One breath of air is yours already. Push the post.', text: 'Palm Gust the post: [L1+□]' },
];
export function lessonGoal() {
  if (Level.stage !== 'intro') return null;
  if (Level.train < 0) return { pos: SPOT, text: G.player.pos.z > World.gap.z0 - 0.6 ? 'Follow the Elder. Jump the broken path: [✕]' : 'Follow the Elder to the ring of wind by the training post: [LS]' };
  if (Level.train === 2 && !atParry()) return { pos: PARRY_SPOT, text: 'Step into the ring of wind facing the Elder' };
  if (Level.train === 2) return { pos: PARRY_SPOT, text: Level.goalHold || DRILL[2].text };
  if (Level.train === 3) return { pos: null, text: DRILL[3].text };
  if (Level.train < DRILL.length) return { pos: SPOT, text: Level.goalHold || DRILL[Level.train].text };
  return null;
}
const atParry = () => Math.hypot(G.player.pos.x - PARRY_SPOT.x, G.player.pos.z - PARRY_SPOT.z) < 1.6;
function startTraining() {
  Level.train = 0; Level.trainN = 0; G.keepStaff = true; G.calm = false;
  G.player.drawNow();
  lessonTick(() => { say([[ELDER, DRILL[0].say]]); HUD.goal(DRILL[0].text, 999); });
}
function trainHit(kind) {
  const post = World.postModel || World.postFallback;
  if (post) { post.rotation.z = 0.06; setTimeout(() => (post.rotation.z = 0), 90); }
  if (Level.train === 0 && /^[lg][123]$/.test(kind)) { Level.trainN = kind === 'l1' || kind === 'g1' ? 1 :   // v6: the grip chain too
    Level.trainN + 1; if (Level.trainN >= 3) advanceDrill(); else HUD.goal(`Strike the post three times: [R1] [R1] [R1]  <b>${Level.trainN}/3</b>`, 999); }
  else if (Level.train === 1 && (kind === 'heavy' || kind === 'sweep')) advanceDrill();
  else if (Level.train === 4 && kind === 'gust') advanceDrill();
}
// the chime and the tick: a gold check pops on the goal line, then the next step's line replaces it
function lessonTick(then) {
  Audio.play('chime2', { vol: 0.55 }); Audio.play('tick', { vol: 0.8, delay: 0.12 });
  HUD.goalDone && HUD.goalDone();
  (G.lessonLog || (G.lessonLog = [])).push({ t: +G.time.toFixed(2), train: Level.train });
  setTimeout(then, 750);
}
function advanceDrill() {
  if (Level.advancing) return;
  Level.advancing = true;
  Level.train++; Level.trainN = 0; Level.drillT = 0; Level.drillThrows = 0; Level.goalHold = null;
  const i = Level.train;
  if (i === 2) { G.guardFace = elder.root.position; G.camFocus = elder.root.position; G.camFocusOff = Level.focusOff ?? 0.25; G.seenHints.add('parried'); elderGoto(THROW_SPOT); }
  if (i === 3) { G.guardFace = null; G.camFocus = null; elderGoto(WATCH_SPOT); }
  lessonTick(() => {
    Level.advancing = false;
    if (i < DRILL.length) { say([[ELDER, DRILL[i].say]]); HUD.goal(DRILL[i].text, 999); }
    else trainingDone();
  });
}
function elderGoto(pos) { Level.elderPath = [pos.clone()]; Level.elderI = 0; }

// the parry lesson (v7 note 41): the Elder draws water out of the air into a long inked icicle in her hand, winds up
// over her shoulder (the Meshy Over_Shoulder_Throw clip) and throws it. It flies with the gold glint 0.35 s before it
// reaches Joon; a parry shatters it into inked shards with an impact frame. One parry passes, or three blocks.
const THROW_SEG = [2.3, 4.3], THROW_SPEED = 0.75, RELEASE = (3.4 - 2.3) / 0.75;   // release at clip 3.4 s (probe-throw7)
function drill(dt) {
  const p = G.player;
  Level.drillT += dt;
  const d = Level.drill;
  const atSpot = Math.hypot(elder.root.position.x - THROW_SPOT.x, elder.root.position.z - THROW_SPOT.z) < 0.5;
  if (!d && atSpot && Level.drillT > 1.4 && !Level.advancing && atParry()) startThrow();
  if (!d && !atParry()) Level.drillT = Math.min(Level.drillT, 0.6);   // she waits for him to step into the ring
  // standing in the ring, Joon squares up to her (a guard only counts when he faces the throw)
  if (atParry() && Math.hypot(Input.move.x, Input.move.y) < 0.2 && !p.action) {
    const wy = Math.atan2(elder.root.position.x - p.pos.x, elder.root.position.z - p.pos.z);
    p.yaw += Math.atan2(Math.sin(wy - p.yaw), Math.cos(wy - p.yaw)) * Math.min(1, dt * 7);
  }
  if (!d) return;
  d.t += dt;
  const hand = elder.socket('handR', new THREE.Vector3());
  const aim = p.pos.clone().setY(p.pos.y + 1.1);
  // she faces Joon through the throw
  const want = Math.atan2(p.pos.x - elder.root.position.x, p.pos.z - elder.root.position.z);
  elder.root.rotation.y += Math.atan2(Math.sin(want - elder.root.rotation.y), Math.cos(want - elder.root.rotation.y)) * Math.min(1, dt * 8);
  if (d.ice && !d.thrown) {
    // held like a javelin: the grip end in her hand, the point at Joon; it grows out of the gathered water
    // tipped up like a raised javelin so it reads as a long spike from behind Joon, levelling out for the throw
    const lev = Math.max(0, Math.min(1, (d.t - (RELEASE - 0.35)) / 0.35));
    const dir = aim.clone().sub(hand).normalize().add(new THREE.Vector3(0, 1.1 * (1 - lev), 0)).normalize();
    const grow = Math.min(1, d.t / 0.9), k = 1 - (1 - grow) ** 3;
    d.ice.scale.set(0.3 + 0.7 * k, Math.max(0.02, k), 0.3 + 0.7 * k);
    d.ice.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    d.ice.position.copy(hand).addScaledVector(dir, -0.3 * k);
  }
  if (!d.thrown && d.t >= RELEASE) throwIce(d, hand, aim);
  if (d.thrown && d.t > RELEASE + 2.2) Level.drill = null;
}
function startThrow() {
  const hand = elder.socket('handR', new THREE.Vector3());
  const d = Level.drill = { t: 0, thrown: false, ice: icicleMesh(1.4, 0.09) };
  G.scene.add(d.ice); d.ice.scale.setScalar(0.01);
  if (elder.hasClip && elder.hasClip('throw')) elder.play('throw', { seg: THROW_SEG, speed: THROW_SPEED, fade: 0.2, restart: true, dur: (THROW_SEG[1] - THROW_SEG[0]) / THROW_SPEED });
  else elder.play('talk', { fade: 0.1 });
  Level.elderBusy = (3.95 - THROW_SEG[0]) / THROW_SPEED;   // into the follow-through, then she eases back to idle (not the whole low lunge)
  iceDraw(hand.clone(), 0.9);
  Audio.play('icicleForm', { at: hand });
  Audio.play('icicleThrow', { at: hand, delay: RELEASE - 0.14 });   // the whoosh peaks 0.14 s in: on the release
}
function throwIce(d, hand, aim) {
  d.thrown = true;
  const ice = d.ice, p = G.player;
  const from = hand.clone(), dir = aim.clone().sub(from).normalize();
  ice.scale.setScalar(1);
  const fwd = new THREE.Vector3(0, 1, 0);
  windTube({ points: [from.clone().addScaledVector(dir, -0.3).add(new THREE.Vector3(0, 0.25, 0)), from.clone(), from.clone().addScaledVector(dir, 0.6)], dur: 0.25, radius: 0.03, seg: 0.8, lit: 0xdff6ff, shade: 0x7fc4de });
  spawnProjectile({ pos: from, vel: dir.clone().multiplyScalar(11), owner: 'enemy', r: 0.22, life: 2, ice: true,
    tick: (q) => { projTell(q); ice.position.copy(q.pos).addScaledVector(dir, -0.6); ice.quaternion.setFromUnitVectors(fwd, dir); },
    onHit: (q, h) => {
      if (h.surface || h.target) return 'pass';   // the icicle goes round the post
      const at = q.pos.clone();
      const done = (r) => {
        G.scene.remove(ice);
        if (Level.train !== 2) return;
        if (r === 'parry') { iceShatter(at, dir.clone().negate()); Audio.play('icicleShatter', { at }); say([[ELDER, 'Yes. Like that.']]); advanceDrill(); }
        else if (r === 'block') { iceShatter(at, dir.clone().negate(), { n: 7, impact: false }); Audio.play('icicleShatter', { at, vol: 0.6 });
          Level.drillThrows++;
          if (Level.drillThrows >= 3) { say([[ELDER, 'Blocked is good. Parried is better. You will learn.']]); advanceDrill(); }
          else { Level.goalHold = 'Blocked. Now tap [L1] just as it flashes gold'; HUD.goal(Level.goalHold, 999); } }
        else { iceShatter(at, dir.clone().negate(), { n: 6, impact: false }); Audio.play('iceShatter', { at, vol: 0.5 }); Level.goalHold = 'Tap [L1] just as the icicle flashes gold'; HUD.goal(Level.goalHold, 999); }
      };
      if (h.player) {
        const r = hurtPlayer(0, q.prev.clone(), { sig: 'gold', knock: 3, onLate: done });
        if (r !== 'pending') done(r);
      } else done('miss');
      Level.drillT = 0;
    }, onExpire: () => { G.scene.remove(ice); Level.drillT = 0; } });
}
// the dodge drill counts any dodge
setInterval(() => { if (Level.train === 3 && !Level.advancing && G.player && G.player.action && (G.player.action.kind === 'roll' || G.player.action.kind === 'step')) advanceDrill(); }, 100);
function trainingDone() {
  Level.train = 99; G.keepStaff = false; HUD.clearHint();
  setTimeout(() => document.getElementById('goal').classList.remove('lesson'), 1500);
  elderGoto(new THREE.Vector3(-1.6, 0, -6.5));
  say([[ELDER, 'Staff first, then breath, then the element. Never the other way round.'],
    [ELDER, 'The soldiers are in the courtyard. The east edge has no railing. Use it.']],
  () => { HUD.hintOnce('lockon', '[R3] lock on · flick [RS] to switch', 4); });
  setTimeout(openGate, 1200);
}

// the soft ring of wind on the ground where the Elder wants Joon: three inked arcs turning slowly, breathing;
// it shrinks away once he is standing in it, and comes back if he wanders off mid-lesson
const LessonRing = {
  g: null, k: 0,
  build() {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const arc = new THREE.TorusGeometry(0.85, 0.035, 5, 28, Math.PI * 0.42);
      const body = new THREE.Mesh(arc, new THREE.MeshBasicMaterial({ color: 0xeefaff }));
      const ink = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.055, 5, 28, Math.PI * 0.42), new THREE.MeshBasicMaterial({ color: 0x1d1620, side: THREE.BackSide }));
      const a = new THREE.Group(); a.add(body, ink); a.rotation.z = i * Math.PI * 2 / 3; g.add(a);
    }
    // an inner, thinner ring of wind turning the other way
    const inner = new THREE.Group();
    for (let i = 0; i < 2; i++) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 4, 20, Math.PI * 0.55), new THREE.MeshBasicMaterial({ color: 0xbfe6f2 })); a.rotation.z = i * Math.PI; inner.add(a); }
    g.add(inner); g.userData.inner = inner;
    g.rotation.x = -Math.PI / 2; g.renderOrder = 3;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    G.scene.add(g); this.g = g;
  },
  update(dt) {
    let goal = lessonGoal(); if (goal && !goal.pos) goal = null;
    if (!goal && !this.g) return;
    if (!this.g) this.build();
    const p = G.player, there = goal && Math.hypot(p.pos.x - goal.pos.x, p.pos.z - goal.pos.z) < (Level.train === 2 ? 1.2 : Level.train >= 0 ? 2.4 : 1.1);
    const want = goal && !there ? 1 : 0;
    this.k += (want - this.k) * (1 - Math.exp(-dt * (want ? 5 : 8)));
    this.g.visible = this.k > 0.02;
    if (!this.g.visible) return;
    if (goal) this.g.position.set(goal.pos.x, World.ground ? Math.max(goal.pos.y, World.ground(goal.pos.x, goal.pos.z, goal.pos.y + 1) || 0) + 0.04 : 0.04, goal.pos.z);
    const breathe = 1 + Math.sin(G.time * 2.6) * 0.06;
    this.g.scale.setScalar(this.k * breathe);
    this.g.rotation.z += dt * 0.9; this.g.userData.inner.rotation.z -= dt * 2.2;
  },
};
Level.lessonRing = LessonRing;

function openGate() {
  G.flags.gateOpen = true; G.calm = false;
  const s = World.solids.find((b) => b.y1 === 2.8 && b.x0 === -2.4); if (s) s.off = true;
  Audio.play('gate'); shake(0.15);
  Level.stage = 'courtyard';
  G.checkpoint = { pos: new THREE.Vector3(0, 0, -6), yaw: Math.PI, stage: 'courtyard' };
}

// ------------------------------------------------------------------ encounters
const ENC = {
  court: { waves: [[{ p: [-4, 0, -33], role: 'grunt' }, { p: [4, 0, -35], role: 'grunt' }], [{ p: [0, 0, -39], role: 'shield' }]], cp: [0, 0, -14], after: () => { Level.stage = 'shrine1'; setTimeout(() => HUD.hintOnce('shrine1', 'A wind shrine by the stairs. [△] to attune', 5), 1500); } },
  stairs: { waves: [[{ p: [9, 4, -42.5], role: 'slinger' }, { p: [-1.5, 4, -50], role: 'grunt' }, { p: [2, 4, -51], role: 'grunt' }]], cp: [0, 0, -38], after: () => { Level.stage = 'terrace'; } },
  terrace1: { waves: [[{ p: [-3, 4, -62], role: 'shield' }, { p: [4, 4, -64], role: 'shield' }, { p: [-11.5, 7.5, -67], role: 'slinger' }]], cp: [0, 4, -52], after: () => { Level.stage = 'shrine2'; setTimeout(() => HUD.hintOnce('shrine2', 'The terrace shrine. [△] to attune', 5), 1200); } },
  terrace2: { waves: [[{ p: [0, 4, -69], role: 'sergeant' }, { p: [-6, 4, -66], role: 'grunt' }, { p: [6, 4, -65], role: 'grunt' }]], cp: [7.5, 4, -55], after: () => { Level.stage = 'bell'; setTimeout(() => HUD.hintOnce('side', 'A side path leads east, to three chimes', 4), 2500); } },
};
function spawnWave(enc) {
  const def = ENC[enc.id];
  for (const s of def.waves[enc.wave]) {
    const e = new Soldier(new THREE.Vector3(...s.p), { role: s.role, encounter: enc.id, yaw: 0, awake: true });
    e.lastGround = s.p[1];
    G.enemies.push(e);
    FX.dust(e.pos, 2, 0.8);
  }
  enc.spawned = true;
  Audio.play('soldierAlert', { delay: 0.2 });
  const roles = def.waves[enc.wave].map((s) => s.role);
  if (roles.includes('shield')) HUD.hintOnce('shield', 'A shield-bearer: open him with a heavy [R2], a parry or a gust', 5);
  if (roles.includes('slinger') && G.player.unlocked.shot) HUD.hintOnce('slinger', 'A slinger on the ledge: only an aimed gust [L2+R2] reaches him', 5);
  if (roles.includes('sergeant')) HUD.hintOnce('sergeant', 'The Sergeant. Red signals cannot be blocked: wind-step [○] through them', 5);
}
function startEncounter(id) {
  const enc = { id, done: false, spawned: false, wave: 0 };
  G.encounter = enc;
  G.checkpoint = { pos: new THREE.Vector3(...ENC[id].cp), yaw: Math.PI, stage: Level.stage };
  Audio.play('sting');
  spawnWave(enc);
  if (id === 'court') setTimeout(() => HUD.hintOnce('gold', 'Gold signal: parry or block it [L1]. Red: dodge [○]', 5), 1200);
}
function resetEncounter(enc) {
  for (const e of G.enemies) if (e.encounter === enc.id && !e.removed) e.remove();
  G.enemies = G.enemies.filter((e) => e.encounter !== enc.id);
  G.attackTokens = 0;
  if (enc.id === 'boss') { resetBoss(); return; }
  enc.wave = 0; enc.waiting = false;
  spawnWave(enc);
}
function encounterDone(enc) {
  enc.done = true; G.attackTokens = 0;
  Audio.play('waveClear', { delay: 0.6 });
  const def = ENC[enc.id];
  G.checkpoint = { pos: new THREE.Vector3(...def.cp), yaw: Math.PI, stage: Level.stage };
  def.after();
}

// ------------------------------------------------------------------ shrines and the attunement ceremony
const SHRINE = [
  { stage: 'shrine1', ab: 'shot', flag: 'attuned1', how: 'Hold [L2] to aim, [R2] to fire. It reaches what the staff cannot.', lore: 'The first monks spun the wind-wheels with their breath alone.' },
  { stage: 'shrine2', ab: 'step', flag: 'attuned2', how: '[○] becomes a gust-driven step that passes straight through red attacks.', lore: 'Air does not stand in the way of the blow. It is simply elsewhere.' },
  { stage: 'bell', ab: 'whirl', flag: 'attuned3', how: 'In the air, [✕] again: a second jump off a puff of wind. Once per jump; landing resets it.', lore: 'The bell was hung by wind, and wind will ring it.' },
];
function shrinePrompts(p) {
  if (G.state !== 'play') return;   // hotfix 12:05: no longer hidden while a distant enemy keeps 'combat' on
  World.v2.shrines.forEach((sh, i) => {
    const S = SHRINE[i];
    if (G.flags[S.flag]) return;
    if (Level.stage !== S.stage) {
      // planner hotfix 13:12 (Connor stood at the wrong shrine and △ did nothing): a shrine that isn't awake yet says so
      if (p.pos.distanceTo(sh.pos) < 2.6) HUD.hint(G.enemies.some((e) => !e.dead) ? 'This shrine is still asleep. Clear the soldiers first.' : 'This shrine is still asleep. Follow the wind column to the one that is awake (D-pad ↑ shows the way).', 0.3);
      return;
    }
    if (p.pos.distanceTo(sh.pos) < 2.6) { HUD.hint('[△] attune', 0.3); if (Input.pressed('interact')) ceremony(i); }
  });
}
// v3 (Connor's note 12): the attunement ceremony, redone. ~7.6 s in-engine, one slow orbiting camera move.
//  0.0  Joon walks onto the shrine's step and faces it          0.7  he plants the staff upright, kneels
//  1.2-4.3  wind gathers: inked 3D wind tubes spiral up around him and the staff, tighter and faster
//  4.4  he rises, takes the staff and spins it: the wind bursts outward (one impact frame, a shock ring)
//  5.0  the medallion and its name on the painted scroll card         7.6  the camera hands back
function ceremony(i) {
  const sh = World.v2.shrines[i], S = SHRINE[i], p = G.player;
  G.flags[S.flag] = true; G.state = 'cutscene'; HUD.clearHint();
  const fwd = new THREE.Vector3(Math.sin(sh.group.rotation.y), 0, Math.cos(sh.group.rotation.y));
  const spot = sh.pos.clone().addScaledVector(fwd, 1.6);
  const face = Math.atan2(sh.pos.x - spot.x, sh.pos.z - spot.z);
  const from = p.pos.clone();
  p.vel.set(0, 0, 0); p.drawNow();
  p.action = { kind: 'cutscene', t: 0, dur: 1e9, events: [], move: 0 };   // the player code keeps its hands off
  const c = p.char;
  Audio.play('attune', { vol: 0.95 }); Audio.duck(0.35, 8);
  // the staff stands planted at his right, a step toward the shrine
  const right = new THREE.Vector3(-Math.cos(face), 0, Math.sin(face));
  const plant = spot.clone().addScaledVector(right, 0.45).addScaledVector(fwd, -0.45);
  // camera: a slow 115-degree orbit round him with a push-in, looking up a little at the release. Of all the
  // starting angles and both directions, it takes the orbit whose whole path has the clearest view of him
  // (raycast against the level), so it never ends up inside a roof or a wall.
  const look0 = spot.clone().setY(spot.y + 1.15), rc = new THREE.Raycaster(), Yax = new THREE.Vector3(0, 1, 0);
  const camAt = (a0, dirn, tt) => { const k = Math.min(1, tt / 7.4), e = k * k * (3 - 2 * k); const a = a0 + dirn * e * 2.0, dist = 4.3 - e * 1.4, h = 1.8 - e * 0.9;
    return { pos: spot.clone().add(fwd.clone().applyAxisAngle(Yax, a).multiplyScalar(dist)).setY(spot.y + h), look: spot.clone().setY(spot.y + 1.05 + e * 0.25), fov: 48 - e * 6 }; };
  let best = null, bestS = 1e9;
  for (let a0 = -Math.PI; a0 < Math.PI; a0 += Math.PI / 8) for (const dirn of [1, -1]) {
    let sc = 0;
    for (let q = 0; q <= 8; q++) { const cp = camAt(a0, dirn, q / 8 * 7.6).pos, d = cp.clone().sub(look0), L = d.length(); rc.set(look0, d.normalize()); rc.far = L + 0.6; if (rc.intersectObjects(World.rayMeshes, false).length) sc += 1; if (World.ground(cp.x, cp.z, cp.y + 5) > cp.y - 0.4) sc += 1; if (World.collide(cp.x, cp.z, 0.8, cp.y - 1, 2).hit) sc += 1.5; }
    sc += Math.abs(Math.atan2(Math.sin(a0 - 2.4), Math.cos(a0 - 2.4))) * 0.05;   // all else equal, start from behind his shoulder
    if (sc < bestS) { bestS = sc; best = [a0, dirn]; }
  }
  Cam.shot((tt) => camAt(best[0], best[1], tt), 1.1);
  let t = 0, last = performance.now(), nextWind = 1.2, k = 0;
  const tick = () => {
    if (G.state !== 'cutscene') return;
    const now = performance.now(); t += Math.min(0.05, (now - last) / 1000); last = now;
    if (t < 0.7) { p.pos.lerpVectors(from, spot, Math.min(1, t / 0.7)); p.yaw += Math.atan2(Math.sin(face - p.yaw), Math.cos(face - p.yaw)) * 0.2; c.play(c.hasClip('walk') ? 'walk' : 'idle', { fade: 0.2 }); c.params.phase = (c.params.phase || 0) + 0.02; }
    else p.yaw = face;
    if (t >= 0.7 && !tick.kneel) {
      tick.kneel = true;
      p.staff.plantPos = plant; p.staff.setMode('planted', 0.3); Audio.play('staffHit', { at: plant, vol: 0.5, rate: 0.8 }); FX.dust(plant, 2, 0.6);
      if (c.hasClip('kneel')) c.play('kneel', { seg: [0, 0.9], speed: 0.75, fade: 0.25, restart: true }); else c.play('idle', { fade: 0.3 });
      inkRing(plant, { r0: 0.2, r1: 1.4, dur: 0.6, color: 0xdff2f6 });
    }
    // the wind gathers: spirals that rise round him and climb the staff, tighter and quicker as it builds
    if (t > nextWind && t < 4.3) {
      const build = (t - 1.2) / 3.1; nextWind = t + 0.32 - build * 0.2; k++;
      const pts = [], r0 = 1.6 - build * 0.6, turns = 1.2 + build * 0.8, ph = k * 2.4, hTop = 2.2 + build * 1.4;
      for (let j = 0; j <= 28; j++) { const u = j / 28, a = ph + u * turns * Math.PI * 2, r = r0 * (1 - u * 0.62); pts.push(new THREE.Vector3(spot.x + Math.cos(a) * r, spot.y + 0.08 + u * hTop, spot.z + Math.sin(a) * r)); }
      windTube({ points: pts, dur: 1.1 - build * 0.35, radius: 0.045 + build * 0.03, seg: 0.5 });
      if (k % 3 === 0) { // a thin streak climbs the planted staff
        const sp = []; for (let j = 0; j <= 14; j++) { const u = j / 14, a = k + u * Math.PI * 4; sp.push(plant.clone().add(new THREE.Vector3(Math.cos(a) * 0.14, u * 1.9, Math.sin(a) * 0.14))); }
        windTube({ points: sp, dur: 0.7, radius: 0.025, seg: 0.6 });
      }
      if (Math.random() < 0.3) Audio.play('jingle', { vol: 0.3 });
    }
    // he rises and takes the staff
    if (t > 3.6 && !tick.rise) { tick.rise = true; if (c.hasClip('kneel')) c.play('kneel', { seg: [0.9, 2.57], speed: 2.4, fade: 0.15, restart: true }); }
    if (t > 4.15 && !tick.take) { tick.take = true; p.staff.setMode('hands', 0.18); }
    // the release: a staff spin, the wind bursts outward
    if (t > 4.35 && !tick.burst) {
      tick.burst = true;
      if (c.hasClip('sSpin')) c.play('sSpin', { seg: [0.5, 1.9], speed: 1.15, fade: 0.08, restart: true });
      const ctr = spot.clone().setY(spot.y + 1.0);
      for (let j = 0; j < 10; j++) { const a = j / 10 * Math.PI * 2, d = new THREE.Vector3(Math.cos(a), 0.08 * Math.sin(j * 3), Math.sin(a)); const pts = []; for (let q = 0; q <= 8; q++) { const u = q / 8, aa = a + u * 0.9; pts.push(ctr.clone().add(new THREE.Vector3(Math.cos(aa) * (0.4 + u * 4.2), (u - 0.3) * 0.5 + Math.sin(j) * 0.3, Math.sin(aa) * (0.4 + u * 4.2)))); } windTube({ points: pts, dur: 0.55, delay: j * 0.01, radius: 0.08, seg: 0.6 }); }
      windRing(ctr.clone().setY(spot.y + 0.3), new THREE.Vector3(0, 1, 0), { r: 0.5, r1: 3.4, travel: 0.1, dur: 0.45, tube: 0.07 });
      impact('air', 1); shake(0.25); rumble(0.7, 0.6, 180); FX.dust(spot, 3, 1.4);
      p.staff.trailOn({ width: 0.1 });
      sh.chimes && sh.chimes.forEach((ch) => (ch.rotation.z = 0.4));
    }
    if (t > 5.0 && !tick.card) {
      tick.card = true; p.unlocked[S.ab] = true; p.staff.trailOff();
      HUD.unlock(S.ab, S.how); Audio.play('unlock', { vol: 0.8 });
      HUD.caption('', S.lore, 4);
    }
    if (t > 5.4 && !tick.settle) { tick.settle = true; if (c.hasClip('sStance')) c.play('sStance', { seg: [4.9, 6.05], pingpong: true, speed: 0.7, fade: 0.3 }); }
    if (t > 7.6) {
      Cam.release(1.2); G.state = 'play'; p.action = null;
      G.checkpoint = { pos: spot.clone(), yaw: face + Math.PI, stage: Level.stage };
      p.heal(p.maxHp); p.breath = p.maxBreath;
      afterShrine(i);
      return;
    }
    p.char.root.position.copy(p.pos); p.char.root.rotation.y = p.yaw;
    requestAnimationFrame(tick);
  };
  tick();
}
function afterShrine(i) {
  if (i === 0) { Level.stage = 'stairs'; HUD.hint('Look up: the wind-wheel on the wall winches the gate. [L2] aim, [R2] gust', 5); }
  if (i === 1) { Level.stage = 'terrace2'; setTimeout(() => startEncounter('terrace2'), 1400); }
  if (i === 2) { HUD.hint('The bell stairs have fallen. Jump [✕], then [✕] again in the air: a double jump carries you up', 7); }
}

// ------------------------------------------------------------------ puzzles
function wheelHit(kind) {
  if (kind !== 'shot' || G.flags.gate2Open) return;
  const now = G.time;
  Level.wheelHits = Level.wheelHits.filter((t) => now - t < 6); Level.wheelHits.push(now);
  Level.wheelSpin += 3.5;
  Audio.play('wheelSpin', { at: Level.wheelT.pos, vol: 0.7 });
  if (Level.wheelHits.length >= 3) {
    G.flags.gate2Open = true; Level.wheelT.done = true; Level.wheelSpin = 14;
    Audio.play('gateWinch', { vol: 0.9, delay: 0.3 });
    World.v2.gateSolid.off = true;
    HUD.hint('The gate winches open', 2.5);
    setTimeout(() => startEncounter('stairs'), 1600);
  } else HUD.hint(`The wheel turns… ${Level.wheelHits.length} / 3`, 2);
}
function chimeHit(i, kind) {
  if (kind !== 'shot' || G.flags.chimesDone) return;
  const V = World.v2, p = G.player;
  V.chimes[i].swing = 0.5;
  Audio.play(['chime1', 'chime2', 'chime3'][i], { at: V.chimes[i].at, vol: 1 });
  const onSpot = p.pos.distanceTo(V.spot) < 1.3;
  if (!onSpot) { HUD.hint('Ring all three from the marked stone', 3); Level.chimeHits = [null, null, null]; return; }
  Level.chimeHits[i] = G.time;
  const ok = Level.chimeHits.every((t) => t !== null && G.time - t < 5);
  if (ok) { G.flags.chimesDone = true; V.chimes.forEach((c) => (c.target.done = true)); setTimeout(openChest, 600); }   // v5 note 34: no chest; the chimes give the reward directly
}
function openChest() {
  G.flags.chestOpen = true; const p = G.player;
  Audio.play('chestOpen'); p.beads += 60; HUD.beads(60);
  p.maxHp += 2; p.heal(p.maxHp);
  HUD.hint('<b>Heart piece</b>: one more heart. And 60 beads for the skill tree (Options)', 5);
  flip('fx3d-parry-flash', p.pos.clone().setY(p.pos.y + 1.2), { size: 1.6, dur: 0.4 });
}
function spawnHeart(pos) {
  const m = new THREE.SpriteMaterial({ map: tex('assets/ui/cut/heart-full.png'), transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.setScalar(0.45); s.position.copy(pos); G.scene.add(s);
  G.pickups.push({ s, y: pos.y - 0.6, t: 0 });
}

// ------------------------------------------------------------------ the Captain
function startBoss(phase = 1) {
  const enc = { id: 'boss', done: false, spawned: true, wave: 0 };
  G.encounter = enc;
  G.checkpoint = { pos: new THREE.Vector3(0, 8, -86.5), yaw: Math.PI, stage: 'bell', bossPhase: phase };
  World.fireWall = true;
  if (!World.fireSolid) World.solids.push(World.fireSolid = { x0: -4, x1: 4, z0: -85.0, z1: -84.6, y0: 7, y1: 12 }); else World.fireSolid.off = false;
  Audio.play('flameRing'); Audio.music('captain', 1.2);
  const c = new Captain(new THREE.Vector3(0, 8, phase === 1 ? -102 : -96), { encounter: 'boss', yaw: 0, phase });
  c.lastGround = 8; G.enemies.push(c); G.boss = c;
  Cam.bossPhase = phase;
  FX.fireBurst(c.pos, 2);
  HUD.boss(c);
  if (phase === 1) {
    // one move: from Joon's shoulder out to the Captain and back
    const P = G.player;
    Cam.shot((t) => { const k = Math.min(1, t / 1.0); const look = c.pos.clone().setY(c.pos.y + 1.4); const near = c.pos.clone().add(new THREE.Vector3(1.6, 1.7, 4.2)); const far = P.pos.clone().add(new THREE.Vector3(0.9, 1.7, 2.4)); return { pos: far.lerp(near, k * k * (3 - 2 * k)), look, fov: 48 }; }, 0.8);
    G.lockInput = true;
    setTimeout(() => { HUD.area('THE CAPTAIN', 'hunter of the Fourfold'); Audio.play('bossCard'); }, 500);
    setTimeout(() => { Cam.release(1.0); G.lockInput = false; }, 2300);
  } else { tearFloor(c, true); }
}
function resetBoss() {
  if (G.boss && !G.boss.removed) G.boss.remove();
  G.boss = null; HUD.boss(null); G.hazards = G.hazards.filter((h) => !h.lane);
  const ph = G.checkpoint.bossPhase || 1;
  if (ph === 1) { G.flags.boss = false; World.fireWall = null; if (World.fireSolid) World.fireSolid.off = true; Audio.music('hill'); G.encounter = null; Cam.bossPhase = 0; }
  else startBoss(2);
}
function phase2(c) {
  HUD.caption('The Captain', 'Enough! Let the mountain burn!', 3);
  slowmo(0.5, 0.5);
  G.checkpoint = { pos: new THREE.Vector3(0, 8, -86.5), yaw: Math.PI, stage: 'bell', bossPhase: 2 };
  // two soldiers climb in over the edge
  setTimeout(() => { for (const [x, z] of [[-11, -95], [11, -100]]) { const e = new Soldier(new THREE.Vector3(x, 8, z), { role: 'grunt', encounter: 'boss', awake: true }); e.lastGround = 8; G.enemies.push(e); FX.dust(e.pos, 3, 1); } }, 2600);
}
function phase3(c) {
  HUD.caption('The Captain', 'You are only a boy. Kneel.', 3);
  G.hazards = G.hazards.filter((h) => !h.lane);
  setTimeout(() => HUD.hintOnce('p3', 'Parry his string [L1] to break him, then [R3]', 5), 1500);
}
function tearFloor(c, quiet) {
  if (World.torn) return; World.torn = true;
  if (!quiet) { shake(0.6); Audio.play('floorBreak'); Audio.play('captainLand', { vol: 0.8 }); }
  const B = World.spots.bell;
  for (const t of World.tiles) {
    t.fly = !quiet; t.v = new THREE.Vector3(rnd(4), 7 + Math.random() * 6, rnd(4)); t.w = rnd(8); t.rx = rnd(0.5); t.rz = rnd(0.5);
    t.land = B.y - 0.1 + Math.random() * 0.4;
    if (!quiet) FX.rockBurst(t.m.position.clone().setY(B.y), 0.7);
  }
  const R = (a, d) => new THREE.Vector3(B.x + Math.cos(a) * d, B.y, B.z + Math.sin(a) * d);
  // slabs of floor rise as cover, textured like the floor; they fade when they come between camera and Joon
  const ft = tex('assets/env/tex-flagstones.webp'); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(0.6, 0.9);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.4, p = R(a, 8.5);
    const m = World.coverRock(i);   // v5 note 35: varied hand-built rocks, not one rotated brick (world.js)
    m.position.set(p.x, p.y - 1.4, p.z); m.rotation.set(rnd(0.06), a, rnd(0.06)); G.scene.add(m);
    Cam.fadeables.push(m);
    World.solids.push({ x0: p.x - 0.65, x1: p.x + 0.65, z0: p.z - 0.65, z1: p.z + 0.65, y0: B.y, y1: B.y + 2 });
    const start = performance.now();
    const rise = () => { const k = Math.min(1, (performance.now() - start) / 300); m.position.y = p.y - 1.4 + 2.35 * (1 - (1 - k) ** 3); if (k < 1) requestAnimationFrame(rise); };
    rise(); FX.dust(p, 3, 1.2);
  }
  // fire lanes across the floor
  // v4 (note 19): no standing fire lanes any more; the fire is in his moves (pillar line, fire dash)
  inkRing(B, { r0: 1, r1: 13, dur: 0.8, color: 0xffb070 });
}
// phase 3, stunned, R3: the last blow launches him. v4 (note 25): one continuous physical flight, no cut and
// no snap. Hit-stop and an impact frame, then a ballistic arc (solved to land on the bell) in slow motion; the
// camera rides alongside, he tumbles back with an inked wind trail behind him, strikes the bell (shock ring,
// dust, the bell swings and rings), and drops to the floor under it.
function captainFinish(c, p) {
  const bellC = World.spots.bellFrame.clone().setY(World.spots.bellFrame.y + 3.4);
  hitstop(0.16); impact('gold', 3); shake(0.45); rumble(1, 1, 300); Audio.duck(0.15, 7);
  Audio.play('takedown', { vol: 1 }); Audio.play('hitHeavy', { vol: 0.9 });
  c.invuln = true; c.dead = true; G.stats.kills++; c.signal(null); c.clearMarks && c.clearMarks(); c.weapon.trailOff();
  HUD.boss(null); G.encounter.done = true; G.hazards = []; G.lockInput = true;
  const dir = bellC.clone().sub(c.pos).setY(0).normalize(), side = new THREE.Vector3(dir.z, 0, -dir.x);
  // he hits the bell's near face with his back, body centre ~1 m above his feet
  const hitAt = bellC.clone().addScaledVector(dir, -1.0), target = hitAt.clone().setY(hitAt.y - 1.0);
  const from = c.pos.clone(), D = target.clone().sub(from), T = THREE.MathUtils.clamp(Math.hypot(D.x, D.z) / 10, 1.0, 1.7), g = 16;
  c.vel.set(D.x / T, (D.y + 0.5 * g * T * T) / T, D.z / T);
  const yaw = Math.atan2(-dir.x, -dir.z);   // facing Joon, flung backward
  c.yaw = yaw; c.char.root.rotation.order = 'YXZ'; c.char.root.rotation.set(0, yaw, 0);
  c.char.play('blown', { restart: true, fade: 0.05, dur: T * 1.25 });
  windRing(c.pos.clone().setY(c.pos.y + 1.0), dir, { r: 0.4, r1: 1.8, travel: 2.2, dur: 0.4, tube: 0.08 });
  Audio.play('gust', { vol: 0.9, delay: 0.1 });
  setTimeout(() => slowmo(0.32, 2.4), 170);   // slow motion once the hit-stop lets go
  // the camera rides beside him, a little behind, and swings to frame the bell as he nears it
  const cam0 = G.camera.position.clone();
  Cam.shot(() => {
    const k = THREE.MathUtils.clamp(c.flyT / T, 0, 1), e = k * k * (3 - 2 * k), e2 = Math.min(1, c.flyT / (T * 0.45));
    const at = c.pos.clone().setY(c.pos.y + 1.0);
    const ride = at.clone().addScaledVector(side, 5.2 - 1.2 * e).addScaledVector(dir, -3.4 - 1.6 * e).setY(at.y + 0.9 + 0.8 * e);
    const pos = cam0.clone().lerp(ride, e2 * e2 * (3 - 2 * e2));   // from where the camera was, out to ride alongside
    return { pos, look: at.clone().lerp(bellC, 0.25 * e), fov: 52 - 6 * e };
  }, 0.2);
  const trail = [];
  let trailT = 0, phase = 'fly';
  c.flyT = 0;
  c.fly = (dt) => {
    if (dt <= 0) return;
    if (phase === 'fly') {
      c.flyT += dt;
      c.pos.addScaledVector(c.vel, dt); c.vel.y -= g * dt;
      const k = Math.min(1, c.flyT / T);
      c.char.root.rotation.set(-1.25 * Math.sin(k * Math.PI * 0.6), yaw, 0.25 * Math.sin(k * 7));   // a backward tumble
      trailT -= dt;
      if (trailT <= 0) {
        trailT = 0.035; trail.push(c.pos.clone().setY(c.pos.y + 1.0)); if (trail.length > 12) trail.shift();
        if (trail.length >= 4 && (trail.n = (trail.n || 0) + 1) % 2 === 0) {
          windTube({ points: trail.map((q) => q.clone()), dur: 0.8, radius: 0.075, seg: 0.85 });
          windTube({ points: trail.slice(-8).map((q, i) => q.clone().addScaledVector(side, 0.45 * Math.sin(i + trail.n)).setY(q.y + 0.3 * Math.cos(i + trail.n))), dur: 0.6, radius: 0.04, seg: 0.8 });
        }
      }
      if (c.flyT >= T || c.pos.distanceTo(target) < 0.25) { c.pos.copy(target); phase = 'fall'; ringBell(c, hitAt, dir); }
    } else if (phase === 'fall') {
      c.pos.addScaledVector(c.vel, dt); c.vel.y -= 26 * dt;
      const r = c.char.root.rotation; r.x += (0 - r.x) * Math.min(1, dt * 5); r.z += (0 - r.z) * Math.min(1, dt * 5);
      const gy = World.ground(c.pos.x, c.pos.z, c.pos.y + 0.5), floor = gy > -Infinity ? gy : World.spots.bellFrame.y;
      if (c.pos.y <= floor && c.vel.y < 0) {
        c.pos.y = floor; c.vel.set(0, 0, 0); phase = 'down'; r.set(0, yaw, 0);
        Audio.play('armorFall', { at: c.pos }); Audio.play('bodyFall', { at: c.pos, vol: 0.8 }); shake(0.25);
        FX.landDust(c.pos, 2.2); FX.dust(c.pos, 3, 1.4); inkRing(c.pos, { r0: 0.4, r1: 2.4, dur: 0.45, color: 0xf3ecdf });
      }
    }
  };
}
const floorAt = (v) => v.clone().setY(World.spots.bellFrame.y + 0.15);
function ringBell(c, hitAt, dir) {
  G.state = 'cutscene'; G.calm = true;
  const bell = World.spots.bellFrame.clone().setY(World.spots.bellFrame.y + 3.4);
  hitstop(0.09); impact('red', 2);
  Audio.play('bell'); Audio.play('captainLand', { vol: 0.8 }); Audio.play('rockImpact', { vol: 0.6 }); shake(0.6); rumble(1, 1, 400); Audio.music('ending', 3);
  FX.hit(hitAt, null, 2.4); flip('fx3d-parry-flash', hitAt, { size: 3, dur: 0.6 });
  // the shock: inked rings off the bell's face, a dust burst on the floor below
  windRing(hitAt, dir.clone(), { r: 0.5, r1: 2.8, travel: 2.0, dur: 0.5, tube: 0.08 });
  windRing(floorAt(hitAt), new THREE.Vector3(0, 1, 0), { r: 0.8, r1: 4.5, travel: 0.1, dur: 0.6, tube: 0.06 });
  const floor = World.spots.bellFrame.clone(); floor.x = hitAt.x; floor.z = hitAt.z;
  FX.landDust(floor, 3); FX.dust(floor, 3, 2); FX.rockBurst(floor, 1.2);
  // he bounces off and drops (the flight hook keeps him moving: no snap)
  c.vel.set(-dir.x * 2.2, 1.2, -dir.z * 2.2);
  c.char.play('knockdown', { restart: true, fade: 0.12, dur: 2.2 });
  const swing = World.bellModel || World.bellFallback;
  if (swing) { const rx0 = swing.rotation.x; let s = 0, l0 = performance.now(); const sw = () => { const n = performance.now(); s += Math.min(0.05, (n - l0) / 1000) * Math.max(0.3, Time.scale); l0 = n; swing.rotation.x = rx0 + Math.sin(s * 4.2) * 0.22 * Math.exp(-s * 0.45) * (dir.z < 0 ? -1 : 1); if (s < 8) requestAnimationFrame(sw); else swing.rotation.x = rx0; }; sw(); }
  for (let i = 0; i < 3; i++) setTimeout(() => inkRing(bell.clone().setY(World.spots.bellFrame.y), { r0: 2, r1: 10 + i * 5, dur: 2, color: 0xffe9a8 }), i * 450);
  // the camera keeps moving: round the bell, then out over the valley to the waterfall (water is next)
  setTimeout(() => { Cam.shot((t) => { const a = 0.3 + t * 0.12; return { pos: new THREE.Vector3(bell.x + Math.sin(a) * 12, bell.y + 1.5 + t * 0.2, bell.z + 12 + Math.cos(a) * 2), look: bell.clone().setY(bell.y - 0.5), fov: 55 }; }, 2.2); }, 1400);
  setTimeout(() => { Audio.play('bell', { vol: 0.6, rate: 0.98 }); }, 4600);
  setTimeout(() => {
    World.v2.waterfall.visible = true;
    const wf = World.v2.waterfall.position;
    Cam.shot((t) => ({ pos: new THREE.Vector3(17 + t * 0.5, 11 - t * 0.1, -110 - t * 0.5), look: wf.clone().setY(wf.y + 8), fov: 40 }), 3.5);
    G.flags.waterTease = true; HUD.newAb = 'water';
    setTimeout(() => { HUD.caption(ELDER, 'Hear that? The river below still remembers your name. Water is next.', 5); Audio.play('chime3', { vol: 0.5 }); }, 2000);
  }, 6200);
  setTimeout(() => {
    const secs = Math.round((performance.now() - G.stats.start) / 1000);
    document.getElementById('end-stats').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} · ${G.stats.kills} foes · ${G.stats.parries} parries · ${G.stats.takedowns} takedowns · ${G.stats.cliff} sent off the mountain`;
    document.getElementById('end-go').innerHTML = HUD_glyph('✕') + ' Play again';
    document.getElementById('ending').classList.remove('hidden'); HUD.show(false); G.state = 'ending';
  }, 12500);
}
import { glyph as HUD_glyph } from './hud.js';

// ------------------------------------------------------------------ debug / warp
export function warp(n) {
  const p = G.player;
  G.state = 'play'; G.calm = false; HUD.hideTalk(); captions = []; HUD.clearCaption(); G.lockInput = false;
  for (const e of G.enemies) if (!e.removed) e.remove();
  G.enemies = []; G.encounter = null; G.attackTokens = 0; G.boss = null; HUD.boss(null);
  Level.elderI = Level.elderPath.length; elder.root.position.copy(Level.elderPath[Level.elderPath.length - 1]);
  if (n >= 1) { Level.train = 99; if (!G.flags.gateOpen) openGate(); }
  if (n >= 2) { Object.assign(p.unlocked, { shot: true }); G.flags.attuned1 = true; G.flags.gate2Open = true; World.v2.gateSolid.off = true; World.v2.gate.position.y = -3.9; }
  if (n >= 3) { Object.assign(p.unlocked, { step: true, whirl: true }); G.flags.attuned2 = G.flags.attuned3 = true; }
  const spots = { 0: [World.spots.start, 'intro'], 1: [new THREE.Vector3(0, 0, -12), 'courtyard'], 2: [new THREE.Vector3(0, 4, -52), 'terrace'], 3: [new THREE.Vector3(0, 8, -84), 'bell'] };
  const [pos, stage] = spots[n];
  Level.stage = stage; G.flags.enc1 = n > 1; G.flags.enc3 = n > 2; G.flags.boss = false;
  G.checkpoint = { pos: pos.clone(), yaw: Math.PI, stage };
  p.spawn(pos, Math.PI);
}
export { ceremony, startEncounter, startBoss, SHRINE };
