// v3 (Connor's note 7): the way forward is always readable.
//  - the objective line (top right) appears when the goal changes, when the player stands lost for a while,
//    and on D-pad ↑
//  - the active shrine sends up a slow column of wind you can see from across the level
//  - D-pad ↑ (or standing idle out of combat) sends a wisp of wind along the route to the next goal
import * as THREE from 'three';
import { G } from './state.js';
import { World } from './world.js';
import { Level, lessonGoal } from './level.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { windTube } from './fx3d.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// the main route, south to north (the wisp follows these so it never cuts through a wall)
const ROUTE = [V(0, 0, 22), V(0, 0, 16.4), V(0, 0, 12), V(0, 0, 0), V(0, 0, -9), V(0, 0, -12), V(0, 0, -26), V(0, 0, -40.5), V(0, 0.8, -44.2), V(0, 2.3, -46.2), V(0, 4, -51.5), V(0, 4, -62), V(0, 4, -73), V(0, 4, -77.2), V(0, 6.3, -79.2), V(0, 8, -84), V(0, 8, -90)];

export function currentGoal() {
  const F = G.flags, W = World.v2, p = G.player;
  if (G.state !== 'play') return null;
  if (G.encounter && !G.encounter.done) return { fight: true, text: G.encounter.id === 'boss' ? null : 'Clear the soldiers' };
  switch (Level.stage) {
    case 'intro': { const l = lessonGoal(); return l ? { ...l, lesson: true } : { pos: World.spots.post, text: null, quiet: true }; }
    case 'courtyard': return { pos: V(0, 0, -24), text: 'Through the gate, into the courtyard' };
    case 'shrine1': return { pos: W.shrines[0].pos, text: 'Attune at the wind shrine by the stairs [△]', shrine: 0 };
    case 'stairs': return F.gate2Open ? { pos: V(0, 4, -52), text: 'Up the broken stairs: [✕] jump the ledge' } : { pos: W.wheel.group.getWorldPosition(new THREE.Vector3()), text: 'Spin the wind-wheel over the gate: three aimed gusts [L2+R2]', wheel: true };
    case 'terrace': return { pos: V(0, 4, -58), text: 'Up to the terrace' };
    case 'shrine2': return { pos: W.shrines[1].pos, text: 'Attune at the terrace shrine [△]', shrine: 1 };
    case 'terrace2': return { pos: V(0, 4, -64), text: 'Hold the terrace' };
    case 'bell':
      if (!F.attuned3) return { pos: W.shrines[2].pos, text: 'Attune at the shrine by the fallen bell stairs [△]', shrine: 2 };
      if (!F.boss) return { pos: V(0, 8, -88), text: 'Double jump up the fallen stairs: [✕], then [✕] again in the air' };
      return null;
  }
  return null;
}

// the polyline from the player to the goal along the route
function pathTo(goal) {
  const p = G.player.pos, pts = [p.clone().setY(p.y + 1.2)];
  const ahead = goal.z < p.z;
  if (ahead) for (const n of ROUTE) if (n.z < p.z - 1.5 && n.z > goal.z + 1.5) pts.push(n.clone().setY(n.y + 1.2));
  if (!ahead) for (const n of [...ROUTE].reverse()) if (n.z > p.z + 1.5 && n.z < goal.z - 1.5) pts.push(n.clone().setY(n.y + 1.2));
  pts.push(goal.clone().setY(goal.y + 1.4));
  return pts;
}

export const Guide = {
  key: '', idleT: 0, beacon: null, beaconFor: -1, wispT: 0, lastD: 1e9, stuckT: 0,
  show(force) {
    const g = currentGoal(); if (!g) return;
    if (g.text) HUD.goal(g.text, g.lesson ? 999 : 6);
    if (g.pos && G.player.pos.distanceTo(g.pos) > 2.5) this.wisp(g.pos);   // v7: no stub of wind when he is already there
  },
  // a wisp of wind that runs along the route to the goal (3D tube ribbons, toon-shaded, inked)
  wisp(goal) {
    if (this.wispT > 0) return; this.wispT = 2.2;
    let pts = pathTo(goal);
    // v7: start the wind 1.6 m ahead of Joon toward the goal, so it never fills the lens from behind him
    if (pts.length >= 2) { const a = pts[0], b = pts[1], d = a.distanceTo(b); if (d > 2.2) pts[0] = a.clone().lerp(b, 1.6 / d); else pts = pts.slice(1); }
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    for (let i = 0; i < 2; i++) windTube({ curve, len, dur: Math.min(3.2, 0.9 + len / 14), delay: i * 0.18, radius: 0.05 - i * 0.012, curl: 0.22 + i * 0.1, phase: i * 2.4, seg: Math.min(0.35, 7 / len) });
  },
  update(dt) {
    this.wispT -= dt;
    const g = currentGoal();
    const key = g ? (g.text || '') + (g.shrine ?? '') : '';
    if (key !== this.key) { this.key = key; this.idleT = 0; this.stuckT = 0; this.lastD = 1e9; if (g && g.text && !g.fight) setTimeout(() => { if (this.key === key) this.show(); }, 1600); }
    // the active shrine: a column of wind you can see from afar
    const want = g && g.shrine !== undefined ? g.shrine : -1;
    if (want !== this.beaconFor) { if (this.beacon) this.beacon.dead = true; this.beacon = null; this.beaconFor = want; if (want >= 0) this.beacon = beaconAt(World.v2.shrines[want].pos); }
    if (this.beacon) this.beacon.update(dt);
    shrineLooks(this.beaconFor, dt);
    if (G.state !== 'play' || !g || g.fight || g.quiet) return;
    if (Input.pressed('guide')) { this.wispT = 0; this.show(true); }
    // v7 note 40: in the lessons, a breadcrumb of wind runs to the ring every 3 s while Joon is away from it
    if (g.lesson && g.pos && this.wispT <= 0 && G.player.pos.distanceTo(g.pos) > 2.2) { this.wisp(g.pos); this.wispT = 3; }
    // lost: standing still, or not getting closer, for a while
    const p = G.player, sp = Math.hypot(p.vel.x, p.vel.z);
    this.idleT = sp < 0.5 && !p.combat ? this.idleT + dt : 0;
    if (g.pos) { const d = p.pos.distanceTo(g.pos); if (d < this.lastD - 3) { this.lastD = d; this.stuckT = 0; } else this.stuckT += dt; }
    if (this.idleT > 10 || this.stuckT > 28) { this.idleT = 0; this.stuckT = 0; this.lastD = 1e9; this.show(); HUD.hintOnce('guide', '[DPAD] ↑ the wind shows the way', 4); }
  },
};

// v4 (note 16): only the next goal draws the eye. A sleeping shrine is dark, dull stone with no wind; the awake one
// keeps its wind column and breathes a soft pale-teal pulse; a shrine already attuned rests, lit but calm.
const SLEEP = new THREE.Color(0.42, 0.42, 0.5), AWAKE_GLOW = new THREE.Color(0.35, 0.55, 0.55);
let lookT = 0;
function shrineLooks(awake, dt) {
  const W = World.v2; if (!W || !W.shrines) return;
  lookT += dt;
  W.shrines.forEach((sh, i) => {
    const root = sh.model || sh.group; if (!root) return;
    if (sh.lookRoot !== root) {   // own the materials (GLB clones share them), remember the painted colours
      sh.lookRoot = root; sh.lookMats = [];
      root.traverse((o) => { if (!o.isMesh || o.userData.isOutline || !o.material || !o.material.color) return; o.material = o.material.clone(); o.material.userData.base = o.material.color.clone(); if (!o.material.emissive) return; sh.lookMats.push(o.material); });
    }
    const attuned = G.flags['attuned' + (i + 1)], on = i === awake;
    const pulse = on ? 0.5 + 0.5 * Math.sin(lookT * 2.4) : 0;
    for (const m of sh.lookMats) {
      if (on || attuned) m.color.copy(m.userData.base); else m.color.copy(m.userData.base).multiply(SLEEP);
      m.emissive.copy(AWAKE_GLOW).multiplyScalar(on ? 0.12 + pulse * 0.28 : 0);
    }
  });
}

// three wind ribbons spiralling up from the shrine, again and again
function beaconAt(pos) {
  const b = { dead: false, t: 0, next: 0, k: 0 };
  b.update = (dt) => {
    if (b.dead) return; b.t += dt; b.next -= dt;
    if (b.next <= 0) {
      b.next = 0.9; b.k++;
      const pts = []; const r0 = 0.9, turns = 1.6, ph = b.k * 2.1;
      for (let i = 0; i <= 24; i++) { const u = i / 24, a = ph + u * turns * Math.PI * 2, r = r0 * (1 - u * 0.55); pts.push(new THREE.Vector3(pos.x + Math.cos(a) * r, pos.y + 0.6 + u * 6.5, pos.z + Math.sin(a) * r)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      windTube({ curve, len: curve.getLength(), dur: 2.6, radius: 0.07, curl: 0, seg: 0.45, far: true });
    }
  };
  return b;
}
