// Bending, v2: the air moves Joon earns (palm gust, aimed gust shot, wind blade, the
// takedown gust), the projectile system shared with enemy fire, and the slinger's lobbed fire pots.
// Effects are the hand-drawn flipbooks and white curling ribbons; no particle balls, no translucent circles.
// The v1 fire/water/earth bends stay below behind player.unlocked flags (fire: ?fire=1); they are not in
// the air-only slice.
import { fireball, fireRing, smokePuff, embers } from './fxfire.js';
import * as THREE from 'three';
import { G, hitEnemy, hurtPlayer, killEnemy, EL_COLOR, PARRY_LATE } from './state.js';
const TELL_LEAD = 0.35;   // v6: the same lead as the melee gold tell (enemies.js)
import { World } from './world.js';
import { Audio } from './audio.js';
import { palmGust as palmGust3D, takedownBurst, windTube, swingArc, impact } from './fx3d.js';
import { FX, emit, ribbon, ring, chunks, flip, flipQuad, inkRing, shake, hitstop, slowmo, rnd, Time } from './fx.js';
import { toon, addOutline } from './toon.js';
import { Cam, cameraForward } from './camera.js';
import { rumble } from './input.js';

const ray = new THREE.Raycaster();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
let scene;

// ---------------------------------------------------------------- projectiles
export function spawnProjectile(o) {
  const p = { pos: o.pos.clone(), prev: o.pos.clone(), vel: o.vel ? o.vel.clone() : new THREE.Vector3(), t: 0, life: o.life ?? 3, r: o.r ?? 0.25, ...o };
  p.pos = o.pos.clone(); p.prev = o.pos.clone();
  if (o.mesh) { scene.add(o.mesh); o.mesh.position.copy(p.pos); }
  if (o.trail) p.trail = ribbon({ src: p.pos, ...o.trail });
  if (o.sheet) p.flip = flip(o.sheet, p.pos, { size: o.sheetSize ?? 0.9, dur: 0.5, loop: true, follow: p.pos, rot: 0 });
  G.projectiles.push(p);
  return p;
}
function killProj(p) {
  p.dead = true;
  if (p.onDone) p.onDone(p);
  if (p.mesh && !p.stuck) scene.remove(p.mesh);
  if (p.trail) p.trail.dead = true;
  if (p.flip) p.flip.dead = true;
}
// segment vs vertical capsule
function segCapsule(a, b, base, h, r) {
  let best = Infinity;
  for (let i = 0; i <= 4; i++) {
    _c.lerpVectors(a, b, i / 4);
    const y = Math.max(base.y + 0.2, Math.min(base.y + h - 0.15, _c.y));
    const d = Math.hypot(_c.x - base.x, _c.y - y, _c.z - base.z);
    if (d < best) best = d;
  }
  return best < r;
}
function segPointDist(a, b, c) { const ab = _c.subVectors(b, a), l2 = ab.lengthSq(); const t = l2 ? Math.max(0, Math.min(1, _b.subVectors(c, a).dot(ab) / l2)) : 0; return _b.copy(a).addScaledVector(ab, t).distanceTo(c); }
const _ndc1 = new THREE.Vector3(), _ndc2 = new THREE.Vector3();
export function updateProjectiles(dt) {
  const cam = G.camera;
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    if (p.dead) { G.projectiles.splice(i, 1); continue; }
    p.t += dt; p.life -= dt;
    if (p.stuck) { if (p.life <= 0) { if (p.onExpire) p.onExpire(p); scene.remove(p.mesh); killProj(p); } continue; }
    p.prev.copy(p.pos);
    if (p.path) p.path(p, dt); else { if (p.grav) p.vel.y -= p.grav * dt; p.pos.addScaledVector(p.vel, dt); }
    if (p.tick) p.tick(p, dt);
    if (p.mesh) { p.mesh.position.copy(p.pos); if (p.spin) { p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.y += p.spin * 0.7 * dt; } else if (p.orient) { _a.subVectors(p.pos, p.prev); if (_a.lengthSq() > 1e-8) p.mesh.quaternion.setFromUnitVectors(UP, _a.normalize()); } }
    if (p.flip) { // fireball art points right: turn it along its screen-space motion
      _ndc1.copy(p.prev).project(cam); _ndc2.copy(p.pos).project(cam);
      const ang = Math.atan2((_ndc2.y - _ndc1.y) * cam.aspect ** -1, _ndc2.x - _ndc1.x);
      if (Math.abs(_ndc2.x - _ndc1.x) + Math.abs(_ndc2.y - _ndc1.y) > 1e-5) p.flip.s.material.rotation = ang;
    }
    // hits
    const seg = _d.subVectors(p.pos, p.prev), len = seg.length();
    let hit = null;
    if (p.owner === 'player') {
      for (const e of G.enemies) {
        if (e.dead || (p.hitSet && p.hitSet.has(e))) continue;
        if (segCapsule(p.prev, p.pos, e.pos, e.height, e.radius + p.r)) { hit = { enemy: e, point: p.pos.clone() }; break; }
      }
      for (const t of G.targets || []) if (!hit && !t.done && segPointDist(p.prev, p.pos, t.pos) < (t.r ?? 0.3) + p.r) { hit = { target: t, point: t.pos.clone() }; }
    } else if (p.owner === 'enemy' && G.player && !G.player.dead) {
      const pl = G.player;
      if (segCapsule(p.prev, p.pos, pl.pos, 1.6, 0.4 + p.r)) hit = { player: true, point: p.pos.clone() };
    }
    if (!hit && len > 1e-6) {
      ray.set(p.prev, seg.clone().normalize()); ray.far = len + p.r * 0.5;
      const hs = ray.intersectObjects(World.rayMeshes.concat(G.walls.map((w) => w.mesh)), false);
      if (hs.length) hit = { surface: true, point: hs[0].point, normal: hs[0].face ? hs[0].face.normal.clone().transformDirection(hs[0].object.matrixWorld) : UP.clone(), object: hs[0].object };
    }
    if (hit) { if (p.onHit(p, hit) !== 'pass') { if (!p.stuck) killProj(p); } }
    else if (p.life <= 0 || p.pos.y < -40) { if (p.onExpire) p.onExpire(p); killProj(p); }
  }
}

// ---------------------------------------------------------------- shared helpers
function aimDir(from) { return _a.copy(G.aimPoint).sub(from).normalize().clone(); }
function hitTarget(t, el) { if (t.onHit) t.onHit(el); }
function splash(center, radius, dmg, el, o = {}) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    _b.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
    const d = _b.distanceTo(center); if (d > radius + e.radius) continue;
    const dir = _c.subVectors(e.pos, center); dir.y = 0; dir.normalize();
    const k = 1 - Math.min(1, d / (radius + e.radius)) * 0.5;
    hitEnemy(e, { dmg: Math.round(dmg * k), knock: dir.multiplyScalar((o.knock ?? 7) * k), up: (o.up ?? 4) * k, el, heavy: true });
  }
  for (const t of G.targets || []) if (!t.done && t.pos.distanceTo(center) < radius) hitTarget(t, el);
}
const bezier = (p0, p1, p2, p3, t, out) => {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(p0, u * u * u).addScaledVector(p1, 3 * u * u * t).addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t);
};
function fireArc(p0, aim, yaw) {
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
  const dist = Math.hypot(aim.x - p0.x, aim.z - p0.z);
  // up and back over the left shoulder (away from the camera), then sweeping round onto the aim point
  const p1 = p0.clone().addScaledVector(fwd, -2.0).addScaledVector(UP, 4.6).addScaledVector(right, -3.6);
  const p2 = p0.clone().lerp(aim, 0.55).addScaledVector(UP, 3.4 + dist * 0.2).addScaledVector(right, -1.4 - dist * 0.22);
  return { p1, p2, dur: 0.7 + dist * 0.017 };
}

function wallSpot(p) {
  _a.copy(G.aimPoint); const d = Math.hypot(_a.x - p.pos.x, _a.z - p.pos.z);
  if (d > 16) { _a.sub(p.pos).setY(0).normalize().multiplyScalar(16).add(p.pos); }
  if (d < 2.2) { _a.set(p.pos.x + Math.sin(p.yaw) * 2.5, 0, p.pos.z + Math.cos(p.yaw) * 2.5); }
  const gy = World.ground(_a.x, _a.z, p.pos.y + 3, 4);
  _a.y = gy > -Infinity ? gy : p.pos.y;
  return _a.clone();
}
// ---------------------------------------------------------------- materials / meshes
let shardGeo, shardMat, rockGeo, rockMat, wallMat;
function shardMesh() { const m = new THREE.Mesh(shardGeo, shardMat); addOutline(m, 1); m.scale.set(0.11, 0.62, 0.11); return m; }

// ---------------------------------------------------------------- moves
export const Bend = {
  fire: {
    // fast jabs from alternating fists, small quick bolts straight to the reticle
    primary(p) {
      p.hand = 1 - p.hand;
      const hand = p.hand;
      p.char.params.hand = hand;
      p.char.play('castFire', { restart: true, fade: 0.05, dur: 0.28 });
      return { dur: 0.28, move: 0.75, events: [{ u: 0.3, fn: (pl) => {
        const from = pl.char.socket(hand ? 'handR' : 'handL', new THREE.Vector3());
        const dir = aimDir(from);
        Audio.play('fireJab', { at: from, vol: 0.8 });
        for (let i = 0; i < 6; i++) emit({ pos: from, vel: dir.clone().multiplyScalar(4).add(new THREE.Vector3(rnd(1), rnd(1), rnd(1))), life: 0.18, size: 0.3, size1: 0.05, color: 0xffd25a, color1: 0xff5a1c, shape: 0, drag: 6 });
        spawnProjectile({ pos: from, vel: dir.multiplyScalar(40), owner: 'player', el: 'fire', r: 0.22, life: 1.6, sheet: 'fx3d-fireball', sheetSize: 0.85,
          trail: { color: 0xff6a1c, core: 0xffe08a, width: 0.16, n: 10 },
          tick: (pr) => { if (Math.random() < 0.6) emit({ pos: pr.pos, vel: new THREE.Vector3(rnd(0.5), 0.8, rnd(0.5)), life: 0.25, size: 0.22, size1: 0.02, color: 0xffc040, color1: 0xff4a1c, shape: 0 }); },
          onHit: (pr, h) => {
            if (h.enemy) hitEnemy(h.enemy, { dmg: 6, knock: pr.vel.clone().setY(0).normalize().multiplyScalar(1.5), el: 'fire' });
            if (h.target) hitTarget(h.target, 'fire');
            FX.fireBurst(h.point, 0.6); Audio.play('fireSmall', { at: h.point, vol: 0.5 });
          } });
        rumble(0.15, 0.3, 50);
      } }] };
    },
    // the backflip: at the top of the flip a fireball flicks off the foot and sweeps round on a curved arc
    heavy(p) {
      const yaw = Math.atan2(G.aimPoint.x - p.pos.x, G.aimPoint.z - p.pos.z);
      const aim = G.aimPoint.clone(), y0 = p.pos.y, H = 1.7, dur = 0.95;
      p.char.play('backflip', { restart: true, fade: 0.08, dur });
      Audio.play('backflip', { vol: 0.9 });
      FX.dust(p.pos, 8, 0.8);
      return { dur, move: 0, faceYaw: yaw, lockFace: true, noGrav: true,
        drive: (dt, pl) => {
          const u = pl.action.t / dur, k = Math.max(0, Math.min(1, (u - 0.14) / 0.74));
          const fwd = k > 0 && k < 1 ? -1.6 : 0;
          pl.vel.x = Math.sin(yaw) * fwd; pl.vel.z = Math.cos(yaw) * fwd;
          pl.vel.y = k > 0 && k < 1 ? H * Math.PI * Math.cos(Math.PI * k) / (0.74 * dur) : (u >= 0.88 ? -8 : 0);
        },
        events: [{ u: 0.46, fn: (pl) => {
          const foot = pl.char.socket('footR', new THREE.Vector3());
          const { p1, p2, dur: fdur } = fireArc(foot, aim, yaw);
          const p0 = foot.clone();
          Audio.play('fireFlick', { at: foot });
          hitstop(0.03); shake(0.15);
          FX.fireTongue(foot, 0.8, 0.35);
          spawnProjectile({ pos: foot, owner: 'player', el: 'fire', r: 0.5, life: fdur + 0.5, sheet: 'fx3d-fireball', sheetSize: 2.0,
            trail: { color: 0xff5a1a, core: 0xfff0a0, width: 0.5, n: 26 },
            path: (pr) => { const t = Math.min(1, pr.t / fdur); bezier(p0, p1, p2, aim, t * t * (3 - 2 * t) * 0.35 + t * 0.65, pr.pos); if (t >= 1) { pr.pos.copy(aim); pr.forceHit = true; } },
            tick: (pr) => {
              if (pr.forceHit) pr.onHit(pr, { surface: true, point: pr.pos.clone() }) , killProj(pr);
            },
            onHit: (pr, h) => {
              if (pr.exploded) return; pr.exploded = true;
              const c = h.point.clone();
              if (h.enemy) hitEnemy(h.enemy, { dmg: 14, el: 'fire', heavy: true });
              splash(c, 3.4, 26, 'fire', { knock: 9, up: 5 });
              FX.fireBurst(c, 2.2); inkRing(c, { r1: 3.6, color: 0xffb050, dur: 0.5 }); FX.landDust(c, 2);
              Audio.play('fireImpact', { at: c, vol: 1 }); shake(0.45); rumble(0.7, 0.6, 180);
            } });
        } }] };
    },
  },

  water: {
    // draw a ribbon of water up from the ground, then whip a fan of 3 ice shards at the reticle
    primary(p) {
      p.char.play('castWater', { restart: true, fade: 0.08, dur: 0.62 });
      let rib = null; const src = new THREE.Vector3();
      const start = p.pos.clone().add(new THREE.Vector3(Math.sin(p.yaw) * 1.1, 0.05, Math.cos(p.yaw) * 1.1));
      return { dur: 0.62, move: 0.45,
        update: (dt, u, pl) => {
          if (u > 0.08 && u < 0.5) {
            const k = (u - 0.08) / 0.42, hand = pl.char.socket('handR', _b);
            const sp = k * Math.PI * 3;
            src.lerpVectors(start, hand, k * k).add(_c.set(Math.cos(sp) * 0.35 * (1 - k), 0, Math.sin(sp) * 0.35 * (1 - k)));
            if (!rib) { rib = ribbon({ src, color: 0x3a9ad8, core: 0xd8f6ff, width: 0.24, n: 16 }); FX.splash(start, 0.5); Audio.play('splash', { at: start, vol: 0.35 }); }
            if (Math.random() < 0.5) emit({ pos: src, vel: new THREE.Vector3(rnd(0.5), 0.5, rnd(0.5)), life: 0.3, size: 0.09, color: 0xbfefff, shape: 3, grav: 6 });
          } else if (rib && u >= 0.5) { rib.dead = true; }
        },
        events: [{ u: 0.5, fn: (pl) => {
          const from = pl.char.socket('handR', new THREE.Vector3());
          const base = aimDir(from);
          Audio.play('iceShards', { at: from });
          for (let i = -1; i <= 1; i++) {
            const dir = base.clone().applyAxisAngle(UP, i * 0.055).add(new THREE.Vector3(0, i === 0 ? 0.015 : 0, 0)).normalize();
            const m = shardMesh();
            spawnProjectile({ pos: from.clone().addScaledVector(dir, 0.2), vel: dir.multiplyScalar(46), owner: 'player', el: 'water', r: 0.16, life: 1.4, mesh: m, orient: true,
              trail: { color: 0x7fd6f0, core: 0xffffff, width: 0.12, n: 10 },
              onHit: (pr, h) => {
                if (h.enemy) { hitEnemy(h.enemy, { dmg: 7, knock: pr.vel.clone().setY(0).normalize().multiplyScalar(1.2), el: 'water' }); FX.iceBurst(h.point); Audio.play('iceShatter', { at: h.point, vol: 0.5 }); return; }
                if (h.target) { hitTarget(h.target, 'water'); FX.iceBurst(h.point); return; }
                // stick into the surface, then shatter
                pr.stuck = true; pr.life = 0.9; pr.pos.copy(h.point).addScaledVector(pr.vel.clone().normalize(), 0.12); pr.mesh.position.copy(pr.pos);
                if (pr.trail) pr.trail.dead = true;
                Audio.play('iceKnock', { at: h.point, vol: 0.4 });
                pr.onExpire = (q) => { FX.iceBurst(q.pos); Audio.play('iceShatter', { at: q.pos, vol: 0.35 }); };
              } });
          }
        } }] };
    },
    // a water whip sweeping a crescent along the aim line: hits several, pulls them toward Joon
    heavy(p) {
      const yaw = Math.atan2(G.aimPoint.x - p.pos.x, G.aimPoint.z - p.pos.z);
      p.char.play('castWhip', { restart: true, fade: 0.08, dur: 0.72 });
      let rib = null; const src = new THREE.Vector3(); const hitSet = new Set();
      return { dur: 0.72, move: 0.2, faceYaw: yaw, lockFace: true,
        update: (dt, u, pl) => {
          if (u > 0.22 && u < 0.6) {
            const k = (u - 0.22) / 0.38;
            const ang = yaw + 1.15 - k * 2.3, reach = 1 + Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5) * 7.2;
            const hand = pl.char.socket('handR', _b);
            src.set(pl.pos.x + Math.sin(ang) * reach, pl.pos.y + 1.0 + Math.sin(k * Math.PI) * 0.4, pl.pos.z + Math.cos(ang) * reach);
            if (reach < 1.5) src.lerp(hand, 0.5);
            if (!rib) { rib = ribbon({ src, color: 0x2f8fd0, core: 0xe6fbff, width: 0.3, n: 22 }); Audio.play('waterWhip', { at: pl.pos }); }
            emit({ pos: src, vel: new THREE.Vector3(rnd(1), rnd(1), rnd(1)), life: 0.4, size: 0.12, color: 0xbfefff, shape: 3, grav: 8 });
            for (const e of G.enemies) {
              if (e.dead || hitSet.has(e)) continue;
              const d = Math.hypot(e.pos.x - src.x, e.pos.z - src.z);
              if (d < 1.3 + e.radius && Math.abs(e.pos.y + 1 - src.y) < 2) {
                hitSet.add(e);
                const pull = _c.subVectors(pl.pos, e.pos).setY(0).normalize().multiplyScalar(5);
                hitEnemy(e, { dmg: 15, knock: pull.clone(), up: 3, el: 'water', heavy: true });
                FX.splash(src, 1);
              }
            }
            for (const t of G.targets || []) if (!t.done && t.pos.distanceTo(src) < 1.4) hitTarget(t, 'water');
          } else if (rib && u >= 0.6) rib.dead = true;
        }, events: [] };
    },
  },

  earth: {
    // stomp: a rock chunk pops out of the ground, then a punch launches it at the reticle
    primary(p) {
      p.char.play('castEarth', { restart: true, fade: 0.08, dur: 0.78 });
      let rock = null; const spot = new THREE.Vector3();
      return { dur: 0.78, move: 0.1,
        update: (dt, u, pl) => {
          if (rock && !rock.launched) {
            const k = Math.min(1, (pl.action.t - rock.t0) / 0.16);
            const top = rock.base.y + 1.15;
            rock.mesh.position.set(rock.base.x, rock.base.y - 0.4 + (top - rock.base.y + 0.4) * (1 - (1 - k) ** 3), rock.base.z);
            rock.mesh.rotation.y += dt * 2;
          }
        },
        events: [
          { u: 0.36, fn: (pl) => {
            spot.set(pl.pos.x + Math.sin(pl.yaw) * 1.0, pl.pos.y, pl.pos.z + Math.cos(pl.yaw) * 1.0);
            const m = new THREE.Mesh(rockGeo, rockMat); addOutline(m, 1); m.scale.setScalar(0.42); scene.add(m);
            rock = { mesh: m, base: spot.clone(), t0: pl.action.t, launched: false };
            Audio.play('stomp', { at: spot, vol: 0.6 });
            FX.dust(spot, 10, 0.9); chunks(spot, { n: 6, size: 0.1, speed: 3, up: 3 }); ring(pl.pos, { r1: 2.2, color: 0xd8c4a0, dur: 0.35 });
            shake(0.12);
          } },
          { u: 0.64, fn: (pl) => {
            if (!rock) return;
            rock.launched = true; scene.remove(rock.mesh);
            const from = rock.mesh.position.clone();
            const dir = aimDir(from);
            Audio.play('rockLaunch', { at: from });
            FX.dust(from, 6, 0.6);
            spawnProjectile({ pos: from, vel: dir.multiplyScalar(30), owner: 'player', el: 'earth', r: 0.42, life: 2, mesh: rock.mesh, spin: 9,
              trail: { color: 0xb8a684, core: 0xe8dcc0, width: 0.22, n: 10, opacity: 0.6 },
              onHit: (pr, h) => {
                if (h.enemy) hitEnemy(h.enemy, { dmg: 18, knock: pr.vel.clone().setY(0).normalize().multiplyScalar(9), up: 5, el: 'earth', heavy: true, knockdown: true });
                if (h.target) hitTarget(h.target, 'earth');
                chunks(h.point, { n: 9, size: 0.16, speed: 5 }); FX.dust(h.point, 10, 1); FX.hit(h.point, 'earth', 1.3);
                Audio.play('rockImpact', { at: h.point }); shake(0.25);
              } });
          } }] };
    },
    // charged slam: a stone wall rises at the aim point (cover that blocks fire)
    heavy(p) {
      const spot = wallSpot(p);
      const yaw = Math.atan2(spot.x - p.pos.x, spot.z - p.pos.z);
      p.char.play('castWall', { restart: true, fade: 0.08, dur: 0.9 });
      return { dur: 0.9, move: 0, faceYaw: yaw, lockFace: true, events: [{ u: p.char.hitU('castWall', 0.52), fn: (pl) => {
        Audio.play('stoneWall', { at: spot }); Audio.play('stomp', { vol: 0.6 });
        FX.dust(pl.pos, 12, 1.1); ring(pl.pos, { r1: 3, color: 0xd8c4a0 }); shake(0.35); rumble(0.8, 0.5, 220);
        raiseWall(spot, yaw);
      } }] };
    },
  },

  // ---- air (v2) ----
  // palm gust (L1 + □): both palms push a cone of wind about 4.5 m. A push of 2.5-3 m; a stunned or airborne
  // soldier goes twice as far. A soldier near an open edge goes over it.
  palmGust(p, yaw) {
    const from = p.char.socket('handL', new THREE.Vector3()).add(p.char.socket('handR', new THREE.Vector3())).multiplyScalar(0.5);
    const dir = new THREE.Vector3(Math.sin(yaw), -0.04, Math.cos(yaw)).normalize();
    Audio.play('palmGust', { at: from }); Audio.play('gust', { at: from, vol: 0.5 });
    palmGust3D(from, dir, 5.4);   // v3: real 3D wind (notes 10, 11), no card
    shake(0.06); rumble(0.4, 0.5, 70);
    const flat = dir.clone().setY(0).normalize();
    for (const e of G.enemies) {
      if (e.dead || e.takenDown) continue;
      _b.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z).sub(from);
      const d = _b.length(); if (d > 4.8 + e.radius) continue;
      if (_b.normalize().dot(dir) < Math.cos(0.62) && d > 1.3) continue;
      const loose = e.stunned || e.airborne || !e.onGround;
      const power = e.boss ? 2 : (loose ? 11 : 6.4) * (1 - Math.min(0.4, d / 12));
      if (e.guardBreak) e.guardBreak();
      hitEnemy(e, { dmg: 3, knock: flat.clone().multiplyScalar(power), up: loose ? 3 : 2.2, el: 'air', stun: 25, hs: 0.05, from: p.pos });
      e.gustT = 1.0;
    }
    for (const t of G.dummies || []) { _b.copy(t.pos).sub(p.pos).setY(0); if (_b.length() < 5 && _b.normalize().dot(flat) > 0.6) t.onHit('gust'); }
    for (const pr of G.projectiles) if (pr.owner === 'enemy' && pr.pos.distanceTo(from) < 6) { reflect(pr, flat); }
  },
  // a short blade of wind off a heavy staff strike (skill: the air-infused staff)
  windBlade(p) {
    const yaw = p.yaw, dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const from = p.pos.clone().setY(p.pos.y + 0.7).addScaledVector(dir, 1.0);
    const q = { s: { position: new THREE.Vector3() } }; swingArc(from, yaw, { r: 1.1, width: 0.09, dur: 0.3 });
    const hitSet = new Set();
    Audio.play('gustShot', { at: from, vol: 0.7 });
    spawnProjectile({ pos: from, vel: dir.clone().multiplyScalar(20), owner: 'player', r: 0.9, life: 0.5, hitSet,
      tick: (pr) => { q.s.position.copy(pr.pos); },
      onHit: (pr, h) => {
        if (h.enemy) { hitSet.add(h.enemy); hitEnemy(h.enemy, { dmg: 8, knock: dir.clone().multiplyScalar(4), el: 'air', stun: 10, from: p.pos }); return 'pass'; }
        if (h.target) { h.target.onHit && h.target.onHit('shot'); return 'pass'; }
        q.dead = true;
      }, onExpire: () => { q.dead = true; } });
  },
  // the end of a takedown: the palm gust sends the swept soldier tumbling away
  takedownGust(p, e, yaw) {
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const from = p.char.socket('handL', new THREE.Vector3()).add(p.char.socket('handR', new THREE.Vector3())).multiplyScalar(0.5);
    takedownBurst(from, dir.clone().setY(-0.1).normalize(), e.pos.clone());   // v3: 3D wind wraps him (note 10)
    impact('air', 2);
    Audio.play('palmGust', { at: from });
    if (e.takedownHit) { e.takedownHit(p, dir); return; }
    e.takenDown = false; e.invuln = false;
    e.vel.set(dir.x * 11, 4.5, dir.z * 11); e.airborne = true; e.gustT = 2;
    e.char.play(e.char.hasClip('blown') ? 'blown' : 'knockdown', { restart: true, fade: 0.05, dur: 1.3 });
    e.hp = 0; killEnemy(e, { takedown: true });
    G.stats.takedowns++;
    if (G.spawnHeart) G.spawnHeart(e.pos.clone().setY(e.pos.y + 0.8));
  },
};

// the aimed gust shot (L2 + R2): a fast ball of curling wind that goes where the reticle is
export function gustShot(p) {
  const from = p.char.socket('handR', new THREE.Vector3()).add(p.char.socket('handL', new THREE.Vector3())).multiplyScalar(0.5);
  const dir = aimDir(from);
  Audio.play('gustShot', { at: from });
  windTube({ points: [from.clone(), from.clone().addScaledVector(dir, 1.6)], dur: 0.16, radius: 0.05, seg: 0.9, curl: 0.08, turns: 1.5 });
  rumble(0.25, 0.3, 50);
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize(), up2 = new THREE.Vector3().crossVectors(side, dir).normalize();
  const srcs = [0, 1, 2].map(() => new THREE.Vector3().copy(from));
  const ribs = srcs.map((s, i) => ribbon({ src: s, color: 0xdff2f6, core: 0xffffff, width: 0.06 + i * 0.012, n: 12, opacity: 0.95 }));
  const core = flip('hit-spark-air', from, { size: 0.55, dur: 0.18, loop: true, rot: 0 });
  const pr = spawnProjectile({ pos: from, vel: dir.clone().multiplyScalar(42), owner: 'player', el: 'air', r: 0.3, life: 1.3,
    tick: (q) => {
      core.s.position.copy(q.pos);
      srcs.forEach((s, i) => { const a = q.t * 26 + i * 2.1; s.copy(q.pos).addScaledVector(side, Math.cos(a) * 0.18).addScaledVector(up2, Math.sin(a) * 0.18); });
    },
    onHit: (q, h) => {
      if (h.enemy) hitEnemy(h.enemy, { dmg: 8, knock: q.vel.clone().setY(0).normalize().multiplyScalar(h.enemy.ranged ? 9 : 5), up: h.enemy.ranged ? 4 : 1.5, el: 'air', stun: 15, from: p.pos });
      if (h.target) h.target.onHit && h.target.onHit('shot');
      flip('hit-spark-air', h.point, { size: 1.3, dur: 0.3 });
      Audio.play('gust', { at: h.point, vol: 0.45 });
    },
    onExpire: () => {} });
  const done = () => { ribs.forEach((r) => (r.dead = true)); core.dead = true; };
  pr.onDone = done;
  return pr;
}

// a projectile turned back by a gust or a parry
function reflect(pr, dir) {
  const back = pr.attacker && !pr.attacker.dead ? pr.attacker.pos.clone().setY(pr.attacker.pos.y + 1).sub(pr.pos).normalize() : dir;
  pr.vel.copy(back).multiplyScalar(Math.max(24, pr.vel.length() * 1.3)); pr.owner = 'player'; pr.reflected = true; pr.life = 2.5;
}

function gustVisual(from, dir, reach = 6) {
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize(), up2 = new THREE.Vector3().crossVectors(side, dir).normalize();
  for (let i = 0; i < 4; i++) {
    const src = from.clone(); const ph = i / 4 * Math.PI * 2, spd = reach / 0.3, spread = 0.12 + Math.random() * 0.1;
    const r = ribbon({ src, color: 0xdff2f6, core: 0xffffff, width: 0.06 + Math.random() * 0.03, n: 10, opacity: 0.95 });
    spawnProjectile({ pos: from, owner: 'fx', r: 0, life: 0.3, path: (pr, dt) => {
      const t = pr.t, rad = t * spd * spread + 0.15;
      pr.pos.copy(from).addScaledVector(dir, t * spd).addScaledVector(side, Math.cos(ph + t * 14) * rad).addScaledVector(up2, Math.sin(ph + t * 14) * rad);
      src.copy(pr.pos);
    }, onHit: () => 'pass', onExpire: () => { r.dead = true; } });
  }
}

// stone wall: cover, solid for movement, blocks fire
export function raiseWall(spot, yaw) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 0.8, 4, 2, 1), wallMat);
  const pos = m.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) { if (pos.getY(i) > 1.2) pos.setY(i, pos.getY(i) + (Math.random() - 0.3) * 0.35); pos.setX(i, pos.getX(i) + (Math.random() - 0.5) * 0.12); }
  m.geometry.computeVertexNormals();
  addOutline(m, 1.2);
  m.position.set(spot.x, spot.y - 1.4, spot.z); m.rotation.y = yaw; m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  const w = { mesh: m, base: spot.clone(), t: 0, life: 9, solids: [] };
  const fx = Math.cos(yaw), fz = -Math.sin(yaw);
  for (let i = -2; i <= 2; i++) { const cx = spot.x + fx * i * 0.85, cz = spot.z + fz * i * 0.85; const s = { x0: cx - 0.5, x1: cx + 0.5, z0: cz - 0.5, z1: cz + 0.5, y0: spot.y, y1: spot.y + 2.6 }; w.solids.push(s); World.solids.push(s); }
  G.walls.push(w);
  chunks(spot, { n: 12, size: 0.18, speed: 5, up: 5 }); FX.dust(spot, 16, 1.4); FX.landDust(spot, 2.2);
  for (const e of G.enemies) { if (e.dead) continue; if (Math.hypot(e.pos.x - spot.x, e.pos.z - spot.z) < 2.4) hitEnemy(e, { dmg: 12, up: 10, knock: new THREE.Vector3(Math.sin(yaw) * 3, 0, Math.cos(yaw) * 3), el: 'earth', heavy: true }); }
  return w;
}
export function updateWalls(dt) {
  for (let i = G.walls.length - 1; i >= 0; i--) {
    const w = G.walls[i]; w.t += dt; w.life -= dt;
    const k = Math.min(1, w.t / 0.22);
    w.mesh.position.y = w.base.y - 1.4 + 2.7 * (1 - (1 - k) ** 3) + (k < 1 ? Math.sin(w.t * 90) * 0.04 : 0);
    if (w.life < 0.6) w.mesh.position.y -= (0.6 - w.life) * 4.5;
    if (w.life <= 0) {
      scene.remove(w.mesh); for (const s of w.solids) { const j = World.solids.indexOf(s); if (j >= 0) World.solids.splice(j, 1); }
      chunks(w.base.clone().setY(w.base.y + 0.5), { n: 8, size: 0.2, speed: 3 }); G.walls.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- enemy fire
// a fire bolt: gold (a parry sends it back at the thrower; a block stops it)
export function enemyBolt(from, target, o = {}) {
  const dir = target.clone().sub(from).normalize();
  const big = o.big;
  Audio.play('enemyFireball', { at: from, vol: 0.7 });
  // v4 note 26: an inked 3D fireball (fxfire.js) instead of the sprite flipbook and ribbon
  let ball = null;
  // v6 (item 5): a held bolt (a late parry is still possible) hangs at the contact point for up to PARRY_LATE,
  // then either flies back (parry) or bursts (hurt, or the block's window ran out)
  const burst = (pr, at) => { fireRing(at, { radius: big ? 1.6 : 0.9 }); smokePuff(at, { size: big ? 0.45 : 0.3 }); embers(at, { n: big ? 6 : 4 }); Audio.play('fireSmall', { at, vol: 0.6 }); killProj(pr); };
  const hold = (pr, onExpire, extra = 0.04) => { pr.held = { vel: pr.vel.clone(), t: 0 }; pr.owner = 'held'; pr.vel.set(0, 0, 0);
    pr.path = (q, dt) => { q.held.t += dt; if (q.held.t > PARRY_LATE + extra) { q.path = null; onExpire(q); } }; };
  const release = (pr) => { pr.path = null; pr.vel.copy(pr.held.vel); pr.held = null; pr.owner = 'enemy'; reflect(pr, pr.vel.clone().negate().setY(0).normalize()); };
  const pr0 = spawnProjectile({ pos: from, vel: dir.multiplyScalar(o.speed ?? 17), owner: 'enemy', r: big ? 0.5 : 0.28, life: 4, attacker: o.attacker, parryable: true,
    tick: projTell,
    onDone: () => { if (ball) ball.kill(); },
    onHit: (pr, h) => {
      if (h.player) {
        const onLate = (res) => { if (pr.dead || !pr.held) return; if (res === 'parry') release(pr); else burst(pr, pr.pos.clone()); };
        const r = hurtPlayer(o.dmg ?? 1, pr.prev.clone(), { knock: big ? 9 : 6, sig: 'gold', attacker: o.attacker, proj: pr, lateOK: true, onLate });
        if (r === 'parry') { reflect(pr, pr.vel.clone().negate().setY(0).normalize()); return 'pass'; }
        if (r === 'pending') { hold(pr, (q) => { if (q.held) burst(q, q.pos.clone()); }, 0.15); return 'pass'; }   // tickParry settles it (onLate)
        if (r === 'block') { hold(pr, (q) => burst(q, q.pos.clone())); return 'pass'; }   // a press inside PARRY_LATE upgrades it
        if (r === false && G.player.iframes > 0) return 'pass';
      }
      if (h.enemy) hitEnemy(h.enemy, { dmg: big ? 30 : 14, el: 'fire', heavy: true, stun: 30, knock: pr.vel.clone().setY(0).normalize().multiplyScalar(5) });
      fireRing(h.point, { radius: big ? 1.6 : 0.9 }); smokePuff(h.point, { size: big ? 0.45 : 0.3 }); embers(h.point, { n: big ? 6 : 4 });
      Audio.play('fireSmall', { at: h.point, vol: 0.6 });
      if (big && G.player && G.player.pos.distanceTo(h.point) < 2.2) hurtPlayer(1, h.point.clone(), { knock: 8 });
    } });
  ball = fireball(from, { follow: pr0.pos, size: big ? 0.5 : 0.3 });
  return pr0;
}
// v6 (item 5): the gold glint on a parryable bolt 0.35 s before it reaches Joon (the same lead as the melee tell),
// once per bolt, only if it is on course to hit him. The cue sound plays once even when a whole volley glints.
const _pt = new THREE.Vector3(), _pv = new THREE.Vector3();
export function projTell(pr) {
  if (pr.glinted || pr.owner !== 'enemy' || !G.player || G.player.dead) return;
  const pl = G.player; _pt.set(pl.pos.x, pl.pos.y + 1.0, pl.pos.z).sub(pr.pos);
  const dist = _pt.length(), sp = pr.vel.length(); if (sp < 1e-3) return;
  _pv.copy(pr.vel).divideScalar(sp);
  const closing = _pt.dot(_pv); if (closing <= 0) return;
  const miss = _pt.clone().addScaledVector(_pv, -closing).length();
  if (miss > 0.4 + pr.r + 0.5) return;
  const ttc = Math.max(0, closing - (0.4 + pr.r)) / sp;
  if (ttc > TELL_LEAD) return;
  pr.glinted = true;
  // drawn over the fireball (its centre is inside the ball, which hid it), riding the bolt
  flip('fx3d-parry-flash', pr.pos, { size: pr.r > 0.4 ? 1.9 : 1.45, dur: 0.3, follow: pr.pos, depthTest: false });
  flip('fx3d-parry-flash', pr.pos, { size: 0.75, dur: 0.38, follow: pr.pos, depthTest: false });
  if (!(G.realTime - (G._projTellT ?? -9) < 0.2)) { G._projTellT = G.realTime; Audio.play('parryTell', { at: pr.pos, vol: 0.9 }); }
  (G.tellLog || (G.tellLog = [])).push({ t: G.realTime, who: 'proj', eta: ttc });
}
// a fire pot lobbed on an arc at where Joon stands: a red inked ring marks the landing (dodge it)
export function firePot(from, target, o = {}) {
  const gy = World.ground(target.x, target.z, target.y + 2);
  const land = new THREE.Vector3(target.x, gy > -Infinity ? gy : target.y, target.z);
  const T = o.time ?? 1.15;
  const v = new THREE.Vector3((land.x - from.x) / T, 0, (land.z - from.z) / T); v.y = (land.y - from.y + 0.5 * 22 * T * T) / T;
  const mark = inkRing(land, { r1: 1.7, hold: true, dur: T + 0.1, color: 0xe2574c, pulse: true });
  Audio.play('windupFire', { at: from, vol: 0.6 });
  return spawnProjectile({ pos: from, vel: v, grav: 22, owner: 'enemy', r: 0.25, life: T + 1, sheet: 'fx3d-fireball', sheetSize: 0.8, attacker: o.attacker,
    onHit: (pr, h) => {
      mark.dead = true;
      const c = h.point.clone();
      FX.fireBurst(c, 1.3); Audio.play('fireImpact', { at: c, vol: 0.7 }); shake(0.1);
      const P = G.player; if (P && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 1.8 && Math.abs(P.pos.y - c.y) < 1.2) hurtPlayer(2, c, { knock: 7, up: 3, sig: 'red' });
      // a short-lived patch of floor fire
      G.hazards.push({ x: c.x, y: c.y, z: c.z, r: 1.1, t: 2.6, fx: 0 });
    } });
}

export function initBending(sc) {
  scene = sc;
  shardGeo = new THREE.OctahedronGeometry(1, 0); shardMat = toon(0xbff0fa, { emissive: 0x6fd8f0, emissiveIntensity: 0.25 });
  rockGeo = new THREE.DodecahedronGeometry(1, 0); rockMat = toon(0x9c8566); rockMat.flatShading = true;
  wallMat = toon(0xa89276); wallMat.flatShading = true;
}
