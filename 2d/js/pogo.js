// v14 (Connor's note 53: "every single enemy can be cheesed by just pogoing it non-stop"). The pogo stays a skill (the
// heel always springs off a body), but every foe has an answer to it, the Silksong way:
//  1. Diminishing returns: consecutive pogos on the SAME foe without touching the ground deal 100%, 70%, 40%, then
//     nothing (a dull clink). Landing resets the chain.
//  2. Anti-air: a foe with Joon hanging over it (within 1.5 body widths, for 0.4 s, or after 2 pogos in a row) answers.
//     A 0.25 s tell first (a gold-and-red flare and chevron over its head, the game's signal colours), then:
//       soldiers, hook duelist, archer, slinger, pot lobber: a strike straight up (spear thrust, fire jab, shot, pot)
//       shield bearer: the shield goes up over his head for 1.2 s (a pogo glances off, no damage)
//       parasol guard: the parasol spins (a pogo is blocked and its burning rim hurts)
//       snapper: snaps upward; mite and hound: hop away from under him
//  3. Guardians shake you off: the Rime Warden punches straight up after 2 pogos (note 63: an uppercut, not code spikes);
//     the Overseer vents flame upward, the Colossus shrugs off a burst of rock, the Captain a rising flame kick.
// v14 (Connor's note 57: no code-drawn shapes): every tell and answer is drawn from sprites: its own pose sheet when it
// exists (soldier-antiair, enemy-shieldbearer-shieldup, enemy-parasol-guard-spin, boss-rime-warden-uppercut) and its own
// effect strip (fx/antiair-tell, fx/fire-jab-up); until those land, from strips already in the game (a gold-tinted
// spark, the upward strike arc, the floor-vent flames, the deflect ring, the flame ring, the ice pillar, the shatter).
import { G, burst, shake, clamp } from './game.js';
import { Sound } from './audio.js';
import { Assets } from './assets.js';

const FALLOFF = [1, 0.7, 0.4, 0];
// ?pogo0=1 turns all of this off (the v13 behaviour), for the before/after fight-bot numbers
const OFF = typeof location !== 'undefined' && /[?&]pogo0=1/.test(location.search);
const TELL = 0.25;
const KIND = {
  brawler: 'spear', hook: 'spear', archer: 'shot', slinger: 'fire', potter: 'pot', ember: 'fire',
  shield: 'guard', parasol: 'spin', snapper: 'snap', mite: 'hop', hound: 'hop',
  reed: 'uppercut', overseer: 'vent', colossus: 'rocks', captain: 'kick',
};
const FIRE = { fire: 1, pot: 1, spin: 1, vent: 1, kick: 1 };

// called by the down-strike when the heel meets a foe: returns the damage multiplier for this pogo
export function pogoHit(p, e) {
  if (OFF) return 1;
  const n = p.pogoOn === e ? p.pogoN + 1 : 1;
  p.pogoOn = e; p.pogoN = n;
  e.pogoHits = (e.pogoHitsT > 0 ? e.pogoHits || 0 : 0) + 1; e.pogoHitsT = 1.2;
  const k = FALLOFF[Math.min(n, FALLOFF.length) - 1];
  if (k === 0) { Sound.sfx('clank', { rate: 1.5, vol: 0.55, gap: 0.08 }); burst(p.x, p.y + 30, 5, { color: ['#ffffff', '#cfd6dc'], min: 60, max: 200, life: 0.22, size: 6 }); }
  return k;
}
// is the heel blocked outright (raised shield, spinning parasol, the Warden's spikes)? true = no damage at all
export function pogoBlocked(e) {
  if (OFF) return false;
  if (e.guardUp > 0 || e.spinT > 0) { Sound.sfx('clank', { rate: 1.1, vol: 0.8, gap: 0.08 }); return true; }
  if (e.upperT > 0) { Sound.sfx('ice-knock', { gap: 0.08 }); return true; }
  return false;
}
export function pogoLanded(p) { p.pogoOn = null; p.pogoN = 0; }

// per foe, every frame (alive, not in an entrance)
export function antiAir(e, dt, p) {
  if (OFF) return;
  if (e.pogoHitsT > 0) e.pogoHitsT -= dt;
  if (e.guardUp > 0) e.guardUp -= dt;
  if (e.spinT > 0) e.spinT -= dt;
  if (e.upperT > 0) e.upperT -= dt;
  if (e.aaCd > 0) e.aaCd -= dt;
  const kind = KIND[e.boss ? e.kind : e.type];
  if (!kind || e.dead || p.dead || e.state === 'intro' || e.state === 'enter' || e.state === 'phase') { e.aa = null; return; }
  const reach = Math.max(e.w * 1.5, 110), top = e.y - e.h;
  const above = !p.onGround && Math.abs(p.x - e.x) < reach && p.y < top + 40 && p.y > top - 520;
  e.aaOver = above ? (e.aaOver || 0) + dt : Math.max(0, (e.aaOver || 0) - dt * 2);
  if (kind === 'uppercut') {   // the Warden: two pogos in a row and he punches straight up
    if (e.pogoHits >= 2 && !(e.upperT > 0) && !(e.aaCd > 0)) { e.aa = { t: 0, kind }; e.pogoHits = 0; Sound.sfx('rime-cry', { rate: 1.3, vol: 0.5 }); }
  } else if (!e.aa && !(e.aaCd > 0) && (e.aaOver > 0.4 || e.pogoHits >= 2)) { e.aa = { t: 0, kind }; e.pogoHits = 0; Sound.sfx('aa-tell', { x: e.x, gap: 0.2, vol: 0.9 }); }
  const a = e.aa; if (!a) return;
  a.t += dt;
  if (a.t < TELL || a.fired) { if (a.t > TELL + 0.35) { e.aa = null; e.aaCd = e.boss ? 2.4 : 1.6; } return; }
  a.fired = true; a.fx = clamp(p.x, e.x - reach, e.x + reach);
  const from = { fromX: e.x };
  if (kind === 'guard') { e.guardUp = 1.2; Sound.sfx('clank', { rate: 0.8, vol: 0.6 }); return; }
  if (kind === 'uppercut') { e.upperT = 0.45; Sound.sfx('rime-slam', { rate: 1.25, vol: 0.8 }); Sound.sfx('ice-crack', { vol: 0.6 }); shake(6);
    G.hurts.push({ x: e.x - e.w * 0.45, y: top - 300, w: e.w * 0.9, h: 330, t: 0.3, delay: 0, dmg: 1, kind: 'aa', aaKind: 'uppercut', ...from }); return; }
  if (kind === 'hop') { const d = Math.sign(e.x - p.x) || 1; e.vx = d * 420; e.vy = -620; e.onGround = false; Sound.sfx('enemy-shove', { x: e.x, gap: 0.2 }); return; }
  if (kind === 'spin') e.spinT = 0.7;
  const big = e.boss ? 1.6 : 1, w = 110 * big, h = (kind === 'snap' ? 170 : 260) * big;
  const hx = e.x;
  G.hurts.push({ x: hx - w / 2, y: top - h + 30, w, h, t: 0.2, delay: 0, dmg: 1, kind: 'aa', aaKind: kind, ...from });
  Sound.sfx(FIRE[kind] ? 'aa-fire' : kind === 'rocks' ? 'stone-crumble' : 'aa-thrust', { x: e.x, gap: 0.1 });   // v15: the answers' own sounds
  if (e.boss) shake(5);
}
// the spikes ride the Warden's shoulders
export function followHurts() {
  for (const h of G.hurts) if (h.aaFollow) { const e = h.aaFollow; if (e.dead || !(e.spikesT > 0)) { h.t = 0; continue; } h.x = e.x - e.w * 0.55; h.y = e.y - e.h - 90; }
}

// v14 (note 57): the pose a foe holds while it answers, from its own sheet when that exists: [sheet key, frame] or null
export function aaPose(e) {
  if (OFF || e.dead) return null;
  const a = e.aa, k = e.boss ? e.kind : e.type;
  if ((k === 'brawler' || k === 'slinger') && a && a.t < TELL + 0.35 && Assets.has('soldier.antiair')) return ['soldier.antiair', Math.min(7, Math.floor(a.t / (TELL + 0.35) * 8))];
  if (k === 'shield' && (e.guardUp > 0 || (a && !a.fired)) && Assets.has('shield.shieldup')) return ['shield.shieldup', e.guardUp > 0 ? Math.min(7, 2 + Math.floor((1.2 - e.guardUp) / 0.07)) : Math.min(1, Math.floor(a.t / TELL * 2))];
  if (k === 'parasol' && (e.spinT > 0 || (a && !a.fired)) && Assets.has('parasol.spin')) return ['parasol.spin', Math.floor(G.time * 16) % 8];
  // v16 (Connor's note 75): the other guardians answer on their own antiair sheet (0-2 the tell, 3-7 the answer)
  const AA = { overseer: 'overseer.antiair', colossus: 'colossus.antiair', captain: 'captain2.antiair' }[k];
  if (AA && a && a.t < TELL + 0.35 && Assets.has(AA)) return [AA, a.t < TELL ? Math.min(2, Math.floor(a.t / TELL * 3)) : Math.min(7, 3 + Math.floor((a.t - TELL) / 0.07))];
  if (k === 'reed' && (e.upperT > 0 || (a && !a.fired))) {
    if (Assets.has('reed.uppercut')) return ['reed.uppercut', e.upperT > 0 ? Math.min(7, 3 + Math.floor((0.45 - e.upperT) / 0.09)) : Math.min(2, Math.floor(a.t / TELL * 3))];
    if (Assets.has('reed.windup')) return ['reed.windup', e.upperT > 0 ? 3 : Math.min(2, Math.floor(a.t / TELL * 3))];   // until it lands: the fists come up
  }
  return null;
}

// drawn over the foes, all from strips: the tell over the head, then each answer's effect
export function drawAntiAir(ctx) {
  if (OFF) return;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const top = e.y - e.h, a = e.aa;
    // v15 (note 68): the Warden shows no tell icon; his tell is the shoulder drop in his own uppercut sheet
    if (a && !a.fired && !(e.boss && (e.kind === 'reed' ? Assets.has('reed.uppercut') : Assets.has((e.kind === 'captain' ? 'captain2' : e.kind) + '.antiair')))) {   // v16: no icon over a guardian whose own sheet shows the tell   // the tell: its own glint strip, or a gold-tinted spark until it lands
      const f = Math.min(7, Math.floor(a.t / TELL * 8));
      if (!Assets.drawFx(ctx, 'fx.antiairtell', f, e.x, top - 6, 150, 1, { anchor: 'bottom' })) Assets.drawFx(ctx, 'fx.sparksmall', f, e.x, top - 50, 150, 1, { tint: 'rgba(255,196,60,0.85)', blend: 'lighter' });
    }
    if (e.guardUp > 0 && !Assets.has('shield.shieldup')) Assets.drawFx(ctx, 'fx.deflect', Math.floor(G.time * 12) % 8, e.x, top - 10, 170, 1, { sy: 0.45, tint: 'rgba(226,169,59,0.6)' });
    if (e.spinT > 0 && !Assets.has('parasol.spin')) Assets.drawFx(ctx, 'fx.flamering', Math.floor(G.time * 14) % 8, e.x, top - 60, 190, 1, { sy: 0.4 });
  }
  for (const h of G.hurts) {
    if (h.kind !== 'aa') continue;
    const k = 1 - Math.max(0, h.t) / 0.2, f = Math.min(7, Math.floor(k * 8)), cx = h.x + h.w / 2, y1 = h.y + h.h;
    if (FIRE[h.aaKind]) { if (!Assets.drawFx(ctx, 'fx.firejab', f, cx, y1, h.h * 1.1, 1, { anchor: 'bottom' })) Assets.drawFx(ctx, 'fx.ventfire', f, cx, y1, h.h * 1.15, 1, { anchor: 'bottom' }); }
    else if (h.aaKind === 'rocks') Assets.drawFx(ctx, 'fx.shatter', f, cx, y1 - h.h * 0.4, h.h * 0.9, 1);
    else if (h.aaKind === 'uppercut' && Assets.has('reed.uppercut')) { /* v15 (note 68): only the punch itself, no ice off the fist */ }
    else if (h.aaKind === 'uppercut') { const ff = Math.min(7, Math.floor((1 - Math.max(0, h.t) / 0.3) * 8)); Assets.drawFx(ctx, 'fx.icepillar', Math.min(5, ff), cx, y1, h.h * 1.2, 1, { anchor: 'bottom', alpha: 0.95 }); }
    else if (!(h.aaKind === 'spear' && Assets.has('soldier.antiair'))) Assets.drawFx(ctx, 'fx.arcup', f, cx, y1 - h.h * 0.55, h.h * 1.1, 1);
  }
}
