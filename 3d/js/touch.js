// v7 (Connor's note 43): Roblox-style touch controls, painted in the game's own UI.
//  left third, lower area: a floating thumbstick that appears where the thumb lands -> Input.move
//  anywhere else that is not a button: drag the camera -> Input.look (radians, Input.touchSens per CSS px)
//  bottom-right: a big Attack with Jump / Heavy / Dodge / Guard around it; above: Gust, Lock, Interact
//  top-right: Show the way and Pause. Buttons are real inputs: input.js ORs Input.touchHeld into the same
//  per-frame action state the pad and keyboard use, so press / hold / release behave identically.
// Activates on (pointer: coarse), on the first touchstart, or with ?touch / ?mobile. Also: the rotate card in
// portrait, the Safari audio unlock, tap-to-begin, tap-to-skip a caption, tap menus, and the Mobile quality preset.
import { G } from './state.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Menu } from './menu.js';
import { TICON, TNAME } from './touch-icons.js';

const qs = new URLSearchParams(location.search);
const FORCED = qs.has('touch') || qs.has('mobile');
const $ = (id) => document.getElementById(id);
export const Touch = { active: false, quality: 'high', stick: null, cam: null, rotate: false };
const touches = new Map();         // identifier -> record
const held = new Map();            // action -> number of fingers on it
let ctx = null;                    // { renderer, sun, resize, setPause }

// ------------------------------------------------------------------ quality presets
export function setQuality(q) {
  Touch.quality = q = q === 'mobile' ? 'mobile' : 'high';
  window.__fxCap = q === 'mobile' ? 900 : 0;      // fx.js: fewer live particles
  if (!ctx) return;
  const { renderer, sun, resize } = ctx;
  renderer.setPixelRatio(q === 'mobile' ? Math.min(devicePixelRatio, 1) : Math.min(devicePixelRatio, 1.5));
  const n = q === 'mobile' ? 1024 : 2048;
  if (sun && sun.shadow.mapSize.x !== n) { sun.shadow.mapSize.set(n, n); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  resize && resize();
  try { localStorage.setItem('eb3d-quality', q); } catch {}
}

// ------------------------------------------------------------------ DOM
const BTN = (act, cls = '') => `<div class="tb ${cls}" data-act="${act}" aria-label="${TNAME[act]}">${act === 'gust' ? `<img src="assets/ui/cut/ab-${act}.png" alt=""><i class="cd"></i>` : TICON[act]}</div>`;
function build() {
  const d = document.createElement('div'); d.id = 'touch'; d.className = 'off';
  d.innerHTML = `<div id="t-stick"><div id="t-base"></div><div id="t-knob"></div></div>
    <div id="t-top">${BTN('guide', 'sm')}${BTN('pause', 'sm')}</div>
    <div id="t-pad">${BTN('light', 'big')}${BTN('jump')}${BTN('heavy')}${BTN('dodge')}${BTN('guard')}${BTN('aim')}
      ${BTN('gust', 'air')}${BTN('lock', 'air')}${BTN('interact', 'air')}</div>`;
  document.body.appendChild(d);
  const r = document.createElement('div'); r.id = 'rotate'; r.className = 'hidden';
  r.innerHTML = `<div class="card"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="22" y="8" width="20" height="36" rx="4"/><path d="M14 50 A22 22 0 0 0 50 50" class="t"/><path d="M44 44 L50 50 L56 44" class="t"/></svg><div class="t1">Rotate your phone</div><div class="t2">Kite Hill plays in landscape</div></div>`;
  document.body.appendChild(r);
}

export function enableTouch() {
  if (Touch.active) return;
  Touch.active = true; G.touch = true;
  document.body.classList.add('touch');
  if (!$('touch')) build();
  let saved = null; try { saved = localStorage.getItem('eb3d-quality'); } catch {}
  setQuality(FORCED && qs.has('mobile') ? 'mobile' : saved || 'mobile');
  scheme(true);
  const ln = $('load-note'); if (ln && G.ready) ln.textContent = 'Tap anywhere to begin · best in landscape';
}

function scheme(on) { if (on) { Input.usingTouch = true; Input.usingPad = false; Input.lastTouchT = performance.now(); } }

// ------------------------------------------------------------------ audio: Safari needs a gesture-time start
function unlockAudio() {
  if (Audio.running) return;
  try { Audio.init(); Audio.resume(); const c = Audio.ctx; if (c) { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } } catch {}
}

// ------------------------------------------------------------------ buttons
function press(act, el, on) {
  const n = (held.get(act) || 0) + (on ? 1 : -1);
  if (n > 0) { held.set(act, n); Input.touchHeld.add(act); } else { held.delete(act); Input.touchHeld.delete(act); }
  if (on) Input.touchPulse.set(act, 1);       // a tap shorter than a frame still registers once
  el && el.classList.toggle('down', n > 0);
}
const pulse = (...acts) => { for (const a of acts) Input.touchPulse.set(a, 1); };

// ------------------------------------------------------------------ stick
const stickR = () => 52 * Math.min(1.5, Math.max(0.8, innerHeight / 390));
function stickDraw(rec) {
  const s = $('t-stick'); if (!s) return;
  if (!rec) { s.classList.remove('live'); s.style.left = ''; s.style.top = ''; $('t-knob').style.transform = ''; return; }
  s.classList.add('live'); s.style.left = rec.x0 + 'px'; s.style.top = rec.y0 + 'px';
  $('t-knob').style.transform = `translate(${Input.touchMove.x * stickR()}px, ${-Input.touchMove.y * stickR()}px)`;
}
function stickUpdate(rec) {
  const R = stickR(); let dx = rec.x - rec.x0, dy = rec.y - rec.y0; const l = Math.hypot(dx, dy);
  // the base follows a thumb that drifts far past the rim (as Roblox does), so the stick never feels stuck
  if (l > R * 1.6) { const k = (l - R * 1.6) / l; rec.x0 += dx * k; rec.y0 += dy * k; dx = rec.x - rec.x0; dy = rec.y - rec.y0; }
  let m = Math.min(1, Math.hypot(dx, dy) / R); const a = Math.atan2(-dy, dx);
  const DZ = 0.14; m = m < DZ ? 0 : (m - DZ) / (1 - DZ);
  Input.touchMove.x = Math.cos(a) * m; Input.touchMove.y = Math.sin(a) * m; Input.touchMove.on = true;
  stickDraw(rec);
}

// ------------------------------------------------------------------ touch events (each finger by identifier)
const inGame = () => G.started && !G.paused && G.state !== 'title' && G.state !== 'ending' && !Touch.rotate;
function onStart(e) {
  if (!Touch.active) enableTouch();
  e.preventDefault();
  scheme(true);
  for (const t of e.changedTouches) {
    const tg = t.target && t.target.closest ? t.target : document.body;
    const rec = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY, t0: performance.now(), tg, kind: 'tap' };
    touches.set(t.identifier, rec);
    if (Touch.rotate) continue;
    const b = tg.closest('#touch [data-act]');
    if (b && inGame() && !b.classList.contains('gone')) { rec.kind = 'btn'; rec.act = b.dataset.act; rec.el = b; press(rec.act, b, true); continue; }
    if (!inGame()) { if (tg.closest('#menu-body')) rec.kind = 'scroll'; continue; }
    if (!Touch.stick && t.clientX < innerWidth * 0.36 && t.clientY > innerHeight * 0.28) { rec.kind = 'stick'; Touch.stick = rec; stickUpdate(rec); continue; }
    if (!Touch.cam) { rec.kind = 'cam'; Touch.cam = rec; }
  }
}
function onMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const rec = touches.get(t.identifier); if (!rec) continue;
    rec.x = t.clientX; rec.y = t.clientY;
    const dx = rec.x - rec.lx, dy = rec.y - rec.ly; rec.lx = rec.x; rec.ly = rec.y;
    if (rec.kind === 'stick') stickUpdate(rec);
    else if (rec.kind === 'cam') { Input.touchLook.x += dx * Input.touchSens; Input.touchLook.y += dy * Input.touchSens; }
    else if (rec.kind === 'scroll') { const mb = $('menu-body'); if (mb) mb.scrollTop -= dy; }
    else if (rec.kind === 'btn') {
      // sliding off a button lets go of it (sliding between buttons is not needed for this layout)
      const over = document.elementFromPoint(rec.x, rec.y); if (over && rec.el.contains(over)) continue;
      const r = rec.el.getBoundingClientRect(), pad = r.width * 0.35;
      if (rec.x < r.left - pad || rec.x > r.right + pad || rec.y < r.top - pad || rec.y > r.bottom + pad) { press(rec.act, rec.el, false); rec.kind = 'dead'; }
    }
  }
}
function onEnd(e) {
  e.preventDefault();
  unlockAudio();
  for (const t of e.changedTouches) {
    const rec = touches.get(t.identifier); if (!rec) continue;
    touches.delete(t.identifier);
    const tap = Math.hypot(rec.x - rec.x0, rec.y - rec.y0) < 14 && (performance.now() - rec.t0 < 450 || G.state === 'title' || G.state === 'ending' || G.paused) && e.type === 'touchend';
    if (rec.kind === 'btn') press(rec.act, rec.el, false);
    else if (rec.kind === 'stick') { Touch.stick = null; Input.touchMove.x = Input.touchMove.y = 0; Input.touchMove.on = false; stickDraw(null); }
    else if (rec.kind === 'cam') { Touch.cam = null; if (tap && ($('caption').classList.contains('show') || !$('talk').classList.contains('hidden'))) pulse('interact', 'confirm'); }
    else if ((rec.kind === 'tap' || rec.kind === 'scroll') && tap && !Touch.rotate) tapUI(rec);
  }
}
// taps on screens: the title begins, the ending restarts, the pause menu selects + confirms, Back goes back
function tapUI(rec) {
  const tg = rec.tg;
  if (G.paused && Menu.open) {
    const bk = tg.closest('[data-menu]'); if (bk) { Menu.back(); return; }
    const mi = tg.closest('.mi[data-i]'); if (mi) { Menu.tap(+mi.dataset.i); return; }
    if (!tg.closest('.panel')) Menu.back();       // a tap outside the scroll goes back / resumes
    return;
  }
  if (G.state === 'title' || G.state === 'ending' || tg.closest('#talk')) pulse('confirm');
}

// ------------------------------------------------------------------ per frame: visibility, cooldowns, rotate card
let lastVis = '', lastAvail = '';
function tick() {
  requestAnimationFrame(tick);
  if (!Touch.active) return;
  const portrait = innerHeight > innerWidth * 1.05;
  if (portrait !== Touch.rotate) {
    Touch.rotate = portrait; $('rotate').classList.toggle('hidden', !portrait);
    if (portrait) { releaseAll(); if (G.state === 'play' && G.started && !G.paused && ctx && ctx.setPause) ctx.setPause(true); }
  }
  const vis = inGame() && Input.usingTouch ? 'on' : 'off';
  if (vis !== lastVis) { lastVis = vis; $('touch').className = vis; if (vis === 'off') releaseAll(); }
  const ln = $('load-note'); if (ln && /PlayStation/.test(ln.textContent)) ln.textContent = 'Tap anywhere to begin · play in landscape';
  const p = G.player; if (!p || vis === 'off') return;
  const avail = ['shot'].filter((k) => !p.unlocked[k]).join(',');
  if (avail !== lastAvail) { lastAvail = avail; document.querySelector('#touch [data-act="aim"]').classList.toggle('gone', !p.unlocked.shot); }
  for (const k of ['gust']) {
    const el = document.querySelector(`#touch [data-act="${k}"] .cd`); if (!el) continue;
    const cd = p.cd && p.cd[k], mx = p.cdMax && p.cdMax[k]; el.style.setProperty('--k', cd && mx ? (cd / mx).toFixed(3) : 0);
  }
  // Interact glows when something usable is near or a prompt asks for it
  const L = window.__game && window.__game.Level, hint = $('hint');
  const hot = !!(L && L.promptNear) || (hint.classList.contains('show') && /tg-interact/.test(hint.innerHTML)) || $('caption').classList.contains('show');
  document.querySelector('#touch [data-act="interact"]').classList.toggle('hot', hot);
}
function releaseAll() {
  for (const rec of touches.values()) { if (rec.kind === 'btn') press(rec.act, rec.el, false); }
  for (const rec of touches.values()) rec.kind = 'dead';
  Touch.stick = Touch.cam = null; Input.touchMove.x = Input.touchMove.y = 0; Input.touchMove.on = false; stickDraw(null);
  held.clear(); Input.touchHeld.clear(); document.querySelectorAll('#touch .down').forEach((el) => el.classList.remove('down'));
}

// ------------------------------------------------------------------ boot
export function initTouch(c) {
  ctx = c;
  const opt = { passive: false, capture: true };
  document.addEventListener('touchstart', onStart, opt);
  document.addEventListener('touchmove', onMove, opt);
  document.addEventListener('touchend', onEnd, opt);
  document.addEventListener('touchcancel', onEnd, opt);
  // no pinch zoom or double-tap zoom on iOS Safari
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), opt);
  document.addEventListener('dblclick', (e) => e.preventDefault(), opt);
  let coarse = false; try { coarse = matchMedia('(pointer: coarse)').matches; } catch {}
  let saved = null; try { saved = localStorage.getItem('eb3d-quality'); } catch {}
  if (coarse || FORCED) enableTouch();
  else setQuality(saved === 'mobile' ? 'mobile' : 'high');
  if (qs.has('mobile') || qs.has('touch')) setQuality('mobile');
  const g = window.__game;
  if (g) {
    g.touch = Touch; g.setQuality = setQuality; g.enableTouch = enableTouch;
    Object.defineProperty(g, 'quality', { get: () => Touch.quality, set: (v) => setQuality(v), configurable: true });
  }
  requestAnimationFrame(tick);
}
