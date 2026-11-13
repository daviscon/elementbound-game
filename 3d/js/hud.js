// The HUD, v2: the 2D game's painted cel UI, small and in the corners.
//  top-left: hearts (ui-hearts cells), the Breath brush stroke, beads    top-centre: the boss stroke
//  bottom-right: learned abilities (brass medallions) with their buttons and a cooldown wipe
//  over enemies: the gold/red attack signal, a small painted health stroke (v4), the R3 finisher prompt under 20%
//  hints: one ink-outlined line with painted button glyphs, shown once each, fading after 4 s
//  hurt: the lost heart shakes and a thin ink vignette flashes on the side the hit came from
import * as THREE from 'three';
import { G } from './state.js';
import { Cam, LOCK } from './camera.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { tglyph, TOUCHMAP } from './touch-icons.js';

const $ = (id) => document.getElementById(id);
const CUT = 'assets/ui/cut/';
// pad glyph names -> painted pieces; keyboard equivalents for when no pad is in use
const PADG = { '✕': 'cross', '○': 'circle', '□': 'square', '△': 'triangle', L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2', L3: 'L3', R3: 'R3', OPTIONS: 'options', BACK: 'circle', LS: 'ls', RS: 'rs', DPAD: 'dpad' };
// v4 note 27: the PC scheme (keys drawn as keycaps, the mouse as a painted mouse with the button lit)
const KB = { '✕': 'Space', '○': 'Shift', '□': '', '△': 'E', L1: 'Q', R1: 'LMB', L2: 'RMB', R2: 'Hold LMB', L3: '', R3: 'MMB', OPTIONS: 'Esc', BACK: 'Backspace', LS: 'WASD', RS: 'Mouse', DPAD: 'H', 'L1+□': '1', 'L1+△': '2', 'L2+R2': 'RMB+LMB' };
const MOUSE = { LMB: 'L', RMB: 'R', MMB: 'M', 'Hold LMB': 'L' };
function kbGlyph(k) {
  if (MOUSE[k]) return `${k === 'Hold LMB' ? '<span class="kbw">hold</span>' : ''}<span class="kb mouse m${MOUSE[k]}"><b></b></span>`;
  return `<span class="kb">${k}</span>`;
}
export function glyph(spec) {
  // v7 note 43: touch glyphs (the on-screen button's painted icon) when the last input was a touch
  if (Input.usingTouch) { if (TOUCHMAP[spec]) return tglyph(TOUCHMAP[spec]); return spec.split('+').map((s) => TOUCHMAP[s] ? tglyph(TOUCHMAP[s]) : s).join('<span>+</span>'); }
  const pad = Input.usingPad;   // v4: the LAST device used decides, even with a pad plugged in
  if (!pad) { if (KB[spec] !== undefined) return KB[spec].split('+').map(kbGlyph).join('<span>+</span>'); return spec.split('+').map((s) => kbGlyph(KB[s] || s)).join('<span>+</span>'); }
  return spec.split('+').map((s) => PADG[s] ? `<img class="g" src="${CUT}pad-${PADG[s]}.png" alt="${s}">` : s).join('<span>+</span>');
}
// replace [L1+□] style tokens in a string with glyphs
export const G_ = (s) => s.replace(/\[([^\]]+)\]/g, (m, k) => glyph(k));

const ABIL = {
  gust: { icon: 'ab-gust', keys: 'L1+□', name: 'Palm Gust' },
  shot: { icon: 'ab-shot', keys: 'L2+R2', name: 'Aimed Gust' },
  step: { icon: 'ab-step', keys: '○', name: 'Wind-Step' },
  whirl: { icon: 'ab-whirl', keys: 'L1+△', name: 'Whirlwind Lift' },
  blade: { icon: 'ab-blade', keys: 'R2', name: 'Wind Blade' },
  water: { icon: 'ab-water-lock', keys: '', name: 'Water' },
};

export const HUD = {
  raw: {}, lastPad: null,
  // v4 note 27: when the player switches between the pad and keyboard-and-mouse, every visible prompt redraws
  relabel() {
    if (this.raw.hint) $('hint').innerHTML = G_(this.raw.hint);
    if (this.raw.goal) $('goal-text').innerHTML = G_(this.raw.goal);
    if (this.raw.cap) $('cap-text').innerHTML = G_(this.raw.cap);
    if (this.talkFull !== undefined && $('talk-next')) $('talk-next').innerHTML = glyph('✕');
    this.abShown = '';   // the ability medallions rebuild their keys
    this.onRelabel && this.onRelabel();
  },
  shownHp: -1, hintT: 0, tagT: 0, capT: 0, threats: [], abShown: '', markEls: new Map(),
  init() { G.hud = this; },
  show(on) { $('hud').classList.toggle('hidden', !on); },
  hitmark() { const h = $('hitmark'); h.classList.remove('show'); void h.offsetWidth; h.classList.add('show'); },
  noBreath() { const b = $('breath'); b.classList.remove('low'); void b.offsetWidth; b.classList.add('low'); },
  // a one-line hint; text may contain [L1+□] glyph tokens
  hint(text, t = 4) { if (G.clean) return; this.raw.hint = text; $('hint').innerHTML = G_(text); $('hint').classList.add('show'); this.hintT = t; },
  hintOnce(key, text, t = 4) { if (G.seenHints.has(key)) return; G.seenHints.add(key); this.hint(text, typeof t === 'number' ? t : 4.5); },
  clearHint() { $('hint').classList.remove('show'); this.hintT = 0; },
  // v7 note 40: a lesson done: a gold check pops in front of the goal line
  goalDone() { const el = $('goal-text'); if (!el.innerHTML) return; el.innerHTML = '<span class="tickmark">✓</span>' + el.innerHTML; $('goal').classList.add('show', 'done'); this.goalT = Math.max(this.goalT || 0, 1.2); setTimeout(() => $('goal').classList.remove('done'), 700); },
  goal(text, t = 6) { if (G.clean || !text) return; this.raw.goal = text; $('goal-text').innerHTML = G_(text); $('goal').classList.add('show'); this.goalT = t; },
  tag(text, t = 2) { $('tag').textContent = text; $('tag').classList.add('show'); this.tagT = t; },
  area(title, sub = '') { if (G.clean) return; $('area-title').textContent = title; $('area-sub').textContent = sub; $('area').classList.add('show'); clearTimeout(this._areaT); this._areaT = setTimeout(() => $('area').classList.remove('show'), 3200); },
  card(title, sub) { this.area(title, sub); },
  caption(who, text, t = 4) { this.raw.cap = text; $('cap-who').textContent = who ? who + ':' : ''; $('cap-text').innerHTML = G_(text); $('caption').classList.add('show'); this.capT = t; },
  clearCaption() { $('caption').classList.remove('show'); this.capT = 0; },
  boss(e) { $('boss').classList.toggle('hidden', !e); this.bossE = e; },
  hurt(from) {
    const p = G.player; let side = 'b';
    if (from && p) { const dx = from.x - p.pos.x, dz = from.z - p.pos.z; const a = Math.atan2(dx, dz) - (Cam.yaw + Math.PI); const s = Math.sin(a); side = Math.abs(s) < 0.4 ? 'b' : s > 0 ? 'l' : 'r'; }
    const v = $('vig-' + side); v.classList.add('on'); void v.offsetWidth; setTimeout(() => v.classList.remove('on'), 60);
  },
  healed() { this.gainFx = true; },
  damage() {},
  threat(e, kind) { this.threats = this.threats.filter((t) => t.e !== e); this.threats.push({ e, t: 1.0, kind }); },
  beads(n) {
    const pop = $('bead-pop'); pop.textContent = '+' + n; pop.classList.remove('show'); void pop.offsetWidth; pop.classList.add('show');
    Audio.play('bead', { vol: 0.6 });
  },
  takedownReady(e) { if (!G.seenHints.has('takedown')) this.hintOnce('takedown', 'He is reeling! [R3] to finish him', 4); },
  clearTakedown() {},
  parry() { this.hintOnce('parried', '<b>Parry!</b> Parries fill his stun meter fast', 2.5); },
  combat(on) {},
  used(ab) { const el = document.querySelector(`.ab[data-ab="${ab}"]`); if (el) { el.classList.remove('used'); void el.offsetWidth; el.classList.add('used'); } },
  cooldownNope(ab) { const el = document.querySelector(`.ab[data-ab="${ab}"]`); if (el) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); } },
  // the attunement card on the painted scroll; the medallion then paints into the corner
  unlock(ab, how) {
    const A = ABIL[ab];
    $('cer-icon').src = CUT + A.icon + '.png'; $('cer-title').textContent = A.name; $('cer-how').innerHTML = G_(how);
    const c = $('ceremony'); c.classList.remove('hidden'); const card = c.querySelector('.card'); card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    clearTimeout(this._cerT); this._cerT = setTimeout(() => c.classList.add('hidden'), 6400);
    this.newAb = ab;
  },
  talk(who, text, portrait) {
    this.clearHint(); $('talk').classList.remove('hidden'); $('talk-name').textContent = who; $('talk-portrait').style.backgroundImage = `url(${portrait})`;
    this.talkFull = text; this.talkN = 0; $('talk-text').textContent = ''; $('talk-next').innerHTML = glyph('✕');
  },
  talkDone() { return this.talkN >= (this.talkFull || '').length; },
  talkSkip() { this.talkN = this.talkFull.length; $('talk-text').textContent = this.talkFull; },
  hideTalk() { $('talk').classList.add('hidden'); this.talkFull = null; },

  renderAbilities(p) {
    const list = ['gust', 'shot', 'step', 'whirl'].filter((k) => p.unlocked[k]);
    if (p.skills.blade) list.push('blade');
    if (G.flags.waterTease) list.push('water');
    const key = list.join(',') + (Input.usingTouch ? 't' : Input.usingPad ? 'p' : 'k');
    if (key === this.abShown) return;
    this.abShown = key;
    $('abilities').innerHTML = list.map((k) => `<div class="ab${this.newAb === k ? ' new' : ''}" data-ab="${k}"><div class="med"><img src="${CUT}${ABIL[k].icon}.png" alt=""><div class="cd"></div></div><div class="keys">${ABIL[k].keys ? glyph(ABIL[k].keys) : ''}</div></div>`).join('');
    this.newAb = null;
  },

  update(dt) {
    const sch = Input.usingTouch ? 't' : Input.usingPad ? 'p' : 'k';   // v7: touch is a third scheme
    if (sch !== this.lastPad) { this.lastPad = sch; this.relabel(); }
    const p = G.player; if (!p) return;
    // hearts: 2 hp each
    if (p.hp !== this.shownHp || p.maxHp !== this.maxShown || this.gainFx) {
      const lost = p.hp < this.shownHp && this.shownHp > 0, gain = this.gainFx; this.gainFx = false;
      const n = Math.ceil(p.maxHp / 2); let html = '';
      for (let i = 0; i < n; i++) {
        const v = Math.max(0, Math.min(2, p.hp - i * 2));
        const cell = v === 2 ? 'heart-full' : v === 1 ? 'heart-half' : 'heart-empty';
        const shake = lost && Math.ceil(this.shownHp / 2) - 1 === i ? ' lost' : '';
        html += `<img class="${shake}${gain && v > 0 && Math.ceil(p.hp / 2) - 1 === i ? ' gain' : ''}" src="${CUT}${gain && Math.ceil(p.hp / 2) - 1 === i ? 'heart-gain' : cell}.png" alt="">`;
      }
      $('hearts').innerHTML = html;
      if (gain) setTimeout(() => { this.shownHp = -1; }, 500);
      this.shownHp = p.hp; this.maxShown = p.maxHp;
    }
    $('breath-clip').style.width = (14 + (p.breath / p.maxBreath) * 86) + '%';
    $('bead-n').textContent = p.beads;
    // abilities and cooldown wipes
    this.renderAbilities(p);
    for (const el of document.querySelectorAll('.ab')) {
      const k = el.dataset.ab, cd = p.cd[k], mx = p.cdMax[k] * (k === 'gust' && p.skills.gustCD ? 0.75 : 1);
      el.querySelector('.cd').style.setProperty('--k', cd && mx ? (cd / mx).toFixed(3) : 0);
    }
    // reticle: only while aiming the gust shot
    const r = $('reticle'); r.classList.toggle('hidden', !p.aiming); r.classList.toggle('on-target', !!G.aimTarget);
    $('ret-img').src = CUT + (G.aimTarget ? 'ret-lock' : 'ret-open') + '.png';
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) $('hint').classList.remove('show'); }
    if (this.tagT > 0) { this.tagT -= dt; if (this.tagT <= 0) $('tag').classList.remove('show'); }
    if (this.goalT > 0) { this.goalT -= dt; if (this.goalT <= 0) $('goal').classList.remove('show'); }
    if (this.capT > 0) { this.capT -= dt; if (this.capT <= 0) $('caption').classList.remove('show'); }
    if (this.talkFull && this.talkN < this.talkFull.length) {
      const before = Math.floor(this.talkN); this.talkN = Math.min(this.talkFull.length, this.talkN + dt * 55);
      if (Math.floor(this.talkN) !== before) { $('talk-text').textContent = this.talkFull.slice(0, Math.floor(this.talkN)); if (Math.floor(this.talkN) % 3 === 0) Audio.play('tick', { vol: 0.5 }); }
    }
    if (this.bossE) { const k = Math.max(0, this.bossE.hp / this.bossE.maxHp) * 100; $('boss-clip').style.width = k + '%'; $('boss-lag').style.width = (k * 0.88) + '%'; }
    const cam = G.camera, W = innerWidth, H = innerHeight, v = new THREE.Vector3();
    // lock-on marker
    const lk = $('lock');
    if (G.lockTarget && !G.lockTarget.dead) {
      const e = G.lockTarget; v.set(e.pos.x, e.pos.y + e.height * 0.55, e.pos.z).project(cam);
      let sx = (v.x + 1) / 2, sy = (1 - v.y) / 2;
      // v7 note 42: on a switch the marker slides across from the old target (0.18 s, eased)
      const sl = LOCK.slide; if (sl) { sl.t += dt; const k = Math.min(1, sl.t / 0.18), e2 = 1 - (1 - k) * (1 - k); sx = sl.x + (sx - sl.x) * e2; sy = sl.y + (sy - sl.y) * e2; if (k >= 1) LOCK.slide = null; }
      lk.classList.remove('hidden'); lk.style.left = (sx * W) + 'px'; lk.style.top = (sy * H) + 'px';
    } else { lk.classList.add('hidden'); if (G.lockTarget && G.lockTarget.dead) G.lockTarget = null; }
    // marks over enemies
    const seen = new Set();
    for (const e of G.enemies.concat(G.extraMarks || [])) {
      if (e.dead || e.removed || e.falling) continue;
      // v4 (note 22): a small painted health stroke when he is hurt or targeted; no stance meter
      const hurt = !e.boss && e.maxHp && (e.hp < e.maxHp - 0.5 || G.lockTarget === e);
      const show = e.sig || e.stunned || hurt || (e.boss && e.stun > 0.5);
      if (!show) continue;
      v.set(e.pos.x, e.pos.y + e.height + 0.35, e.pos.z).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      seen.add(e);
      let el = this.markEls.get(e);
      if (!el) { el = document.createElement('div'); el.className = 'mk'; el.innerHTML = `<img class="sig hidden" alt=""><div class="ehp" style="position:relative;width:80px;height:19px;margin-top:1px"><div class="lag" style="position:absolute;left:7%;top:7px;height:5px;width:86%;background:rgba(255,211,138,.75);border-radius:3px;transition:width .6s ease-in .3s"></div><div class="clip" style="position:absolute;left:0;top:0;height:19px;width:100%;overflow:hidden"><img src="${CUT}boss-fill.png" alt="" style="width:80px;height:19px;display:block"></div><img src="${CUT}boss-frame.png" alt="" style="position:absolute;left:0;top:0;width:80px;height:19px"><i style="position:absolute;left:20%;top:4px;width:2px;height:11px;background:#1d1620;opacity:.7"></i></div><img class="r3 hidden" src="${CUT}pad-R3.png" alt="">`; $('marks').appendChild(el); this.markEls.set(e, el); }
      el.style.left = ((v.x + 1) / 2 * W) + 'px'; el.style.top = ((1 - v.y) / 2 * H) + 'px';
      const sig = el.querySelector('.sig');
      if (e.sig) { const src = CUT + 'sig-' + e.sig + '.png'; if (sig.dataset.k !== e.sig) { sig.src = src; sig.dataset.k = e.sig; sig.classList.remove('pop'); void sig.offsetWidth; sig.classList.add('pop'); } sig.classList.remove('hidden'); }
      else { sig.classList.add('hidden'); sig.dataset.k = ''; }
      const hb = el.querySelector('.ehp'); hb.style.display = e.boss || !e.maxHp || !hurt ? 'none' : '';
      if (!e.boss && e.maxHp) { const k = Math.max(0, Math.min(1, e.hp / e.maxHp)); hb.querySelector('.clip').style.width = (k * 100) + '%'; hb.querySelector('.lag').style.width = (k * 86) + '%'; }
      const r3 = el.querySelector('.r3'); r3.classList.toggle('hidden', !e.stunned);
      if (e.stunned) r3.src = CUT + 'pad-R3.png'; r3.style.filter = Input.usingPad ? '' : 'none'; r3.title = Input.usingPad ? 'R3' : 'MMB';
    }
    for (const [e, el] of this.markEls) if (!seen.has(e)) { el.remove(); this.markEls.delete(e); }
    // edge arrows for wind-ups that start off-screen, gold or red to match
    this.threats = this.threats.filter((t) => (t.t -= dt) > 0 && !t.e.dead);
    let html = '';
    for (const t of this.threats) {
      const e = t.e; v.set(e.pos.x, e.pos.y + 1, e.pos.z).project(cam);
      if (v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.9) continue;
      const ang = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z) - (Cam.yaw + Math.PI);
      html += `<div class="threat ${t.kind || 'gold'}" style="transform: rotate(${-ang}rad); opacity:${Math.min(1, t.t * 3)}"><i></i></div>`;
    }
    $('threats').innerHTML = html;
  },
};
export { ABIL };
