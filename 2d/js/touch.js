// v15: touch controls, Roblox style (owner: "a lot of people will be using mobile").
// Left: a floating thumbstick wherever the thumb lands in the left 40% of the screen. Right: a big Jump, a big Strike,
// Dash, the four bending slots in an arc above them, Heal beside the arc, and Use when there is something to use.
// Map, Bag and Pause sit small at the top. Every menu has its own touch path (tap an item, tap to go on, or a small
// d-pad with Select / Back). All of it is UI chrome drawn on the game canvas in screen space, sized in real CSS
// pixels (a 96 px Jump on a 390 px tall phone), so it is the same size under the thumb on every screen.
//
// Everything goes through Input (Input.touch / Input.tap / Input.touchStick, a source of its own beside the
// keyboard, the pad and the bots' virtual input), so coyote time, the jump buffer, aiming and the pogo behave
// exactly as they do on a pad. Shown on a touch device (coarse pointer) or after the first touch; hidden again as
// soon as a key or the pad is used (Input.lastDevice).
import { G, clamp, flag } from './game.js';
import { W, H, SLOT_ACTIONS, MOVES, ELEMENTS, INK } from './config.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { nearInteract, healCost } from './player.js';
import { moveCost } from './moves.js';
import * as D from './draw.js';
import * as UI from './ui.js';

const CREAM = '#f3ecdf';
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export const Touch = {
  canvas: null,
  owned: new Map(),     // touch identifier -> { kind: 'stick' | 'btn' | 'tap', btn, ... }
  holds: {},            // action -> how many fingers hold it
  stick: null,          // { id, bx, by, x, y } in canvas px
  buttons: [],          // laid out every frame for the current screen
  rotateEl: null,
  seen: false,          // a touch has happened on this page

  get active() { return Input.lastDevice === 'touch' || (Input.lastDevice == null && coarse()); },

  init(canvas) {
    this.canvas = canvas;
    const opt = { passive: false };
    document.addEventListener('touchstart', (e) => this.onStart(e), opt);
    document.addEventListener('touchmove', (e) => this.onMove(e), opt);
    document.addEventListener('touchend', (e) => this.onEnd(e), opt);
    document.addEventListener('touchcancel', (e) => this.onEnd(e), opt);
    for (const ev of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault(), opt);
    window.addEventListener('keydown', () => this.release());
    window.addEventListener('resize', () => this.checkRotate());
    window.addEventListener('orientationchange', () => setTimeout(() => this.checkRotate(), 200));
    this.checkRotate();
  },

  // --- geometry -------------------------------------------------------------------------------------------
  metrics() {
    const r = this.canvas.getBoundingClientRect();
    const k = W / (r.width || W);                                       // canvas px per CSS px
    const u = clamp((window.innerHeight || 390) / 390, 1, 1.5);         // phones 1, tablets a bit bigger
    return { r, k, s: k * u };                                          // s: canvas px per "design px"
  },
  toCanvas(t) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (t.clientX - r.left) * W / (r.width || W), y: (t.clientY - r.top) * H / (r.height || H) };
  },

  // The buttons for whatever is on screen. Offsets are design px (CSS px on a 390 px tall phone) from a corner.
  layout() {
    const { s } = this.metrics(), B = [];
    const br = (dx, dy, r, o) => B.push({ x: W - dx * s, y: H - dy * s, r: r * s, ...o });
    const bl = (dx, dy, r, o) => B.push({ x: dx * s, y: H - dy * s, r: r * s, ...o });
    const tr = (dx, dy, r, o) => B.push({ x: W - dx * s, y: dy * s, r: r * s, ...o });
    const st = G.state, p = G.player, sv = G.save;
    const dpad = (hold = true) => {
      for (const [a, dx, dy, g] of [['up', 82, 126, '▲'], ['down', 82, 38, '▼'], ['left', 38, 82, '◀'], ['right', 126, 82, '▶']]) bl(dx, dy, 23, { act: a, glyph: g, col: '#c8ffd8', small: true, hold });
    };
    this.mode = 'none';
    if (!this.active || G.state === 'loading') return B;
    if (st === 'play' && G.room && p) {
      this.mode = 'play';
      br(70, 70, 48, { act: 'jump', id: 'jump', label: 'Jump', col: '#8fb8ff', icon: 'jump' });
      br(172, 52, 40, { act: 'attack', id: 'strike', label: 'Strike', col: '#f3a3d6', icon: 'strike' });
      if (sv.abil.dash) br(62, 172, 31, { act: 'dash', id: 'dash', label: 'Dash', col: '#ff9b7b', icon: 'dash' });
      if (sv.moves.length) [12, 38, 64, 90].forEach((deg, i) => {
        const a = deg * Math.PI / 180;
        br(70 + 165 * Math.cos(a), 70 + 165 * Math.sin(a), 26, { act: SLOT_ACTIONS[i], id: 'slot' + i, slot: i, col: '#bfe9f2' });
      });
      if (sv.moves.length || flag('taught-heal')) br(296, 158, 27, { act: 'heal', id: 'heal', label: 'Heal', col: '#ffb3a6', icon: 'heal' });
      const near = !p.dead ? nearInteract() : null;
      if (near && !G.boss) br(292, 60, 34, { act: 'interact', id: 'use', label: near.label.length > 10 ? 'Use' : near.label, col: '#66e3b4', icon: 'use', pop: true });
      tr(30, 54, 19, { act: 'pause', id: 'pause', icon: 'pause', col: '#ffe9a8', small: true });
      tr(78, 54, 19, { act: 'map', id: 'map', glyph: 'Map', col: '#ffe9a8', small: true });
      if (!G.boss && !(G.room.fight)) tr(126, 54, 19, { act: 'tab', id: 'bag', glyph: 'Bag', col: '#ffe9a8', small: true });
    } else if (st === 'map') {
      this.mode = 'menu'; dpad();
      br(70, 62, 34, { act: 'back', label: 'Close', col: '#c9bfae' });
      br(160, 52, 28, { act: 'pin', label: 'Pin', col: '#ffe9a8' });
    } else if (st === 'equip' || st === 'shop') {
      this.mode = 'menu'; dpad();
      br(70, 70, 38, { act: 'confirm', label: st === 'shop' ? 'Buy' : 'Select', col: '#ffe9a8' });
      br(166, 50, 30, { act: 'back', label: 'Back', col: '#c9bfae' });
      if (st === 'equip') br(62, 166, 28, { act: 'tab', label: 'Tab', col: '#bfe9f2' });
    } else if (st === 'recall') {
      this.mode = 'menu';
      bl(46, 60, 30, { act: 'left', glyph: '◀', col: '#c8ffd8' }); bl(120, 60, 30, { act: 'right', glyph: '▶', col: '#c8ffd8' });
      br(70, 62, 34, { act: 'back', label: 'Close', col: '#c9bfae' });
    } else if (st === 'pause') {
      this.mode = 'items';
      tr(46, 46, 30, { act: 'back', label: 'Back', col: '#c9bfae' });
    } else if (st === 'title') {
      this.mode = 'items';
      if (G.controls) tr(46, 46, 30, { act: 'back', label: 'Back', col: '#c9bfae' });
    } else this.mode = 'tap';   // talk, lesson, cutscene, ending: a tap anywhere goes on
    return B;
  },

  hit(x, y) {
    let best = null, bd = 1e9;
    for (const b of this.buttons) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r * 1.22 && d - b.r < bd) { best = b; bd = d - b.r; }
    }
    return best;
  },

  // --- events ---------------------------------------------------------------------------------------------
  onStart(e) {
    e.preventDefault();
    Sound.nudge();                         // Safari: audio may only start inside a touch handler
    const wasActive = this.active;
    this.seen = true;
    Input.lastDevice = 'touch';
    if (!wasActive) this.buttons = this.layout();
    this.checkRotate();
    if (this.rotating) return;
    for (const t of e.changedTouches) {
      const { x, y } = this.toCanvas(t);
      const b = this.hit(x, y);
      if (b) {
        this.owned.set(t.identifier, { kind: 'btn', btn: b, id: b.id || b.act });
        if (b.act) this.hold(b.act, true);
        b.downT = performance.now();
        continue;
      }
      if (this.mode === 'play' && x < W * 0.4 && y > H * 0.22 && !this.stick) {
        const { s } = this.metrics(), R = 58 * s;
        const bx = clamp(x, R + 8, W * 0.4), by = clamp(y, R + 8, H - R - 8);
        this.stick = { id: t.identifier, bx, by, x, y, R };
        this.owned.set(t.identifier, { kind: 'stick' });
        this.updateStick();
        continue;
      }
      if (this.mode === 'items' || this.mode === 'tap' || this.mode === 'menu') {
        let used = false;
        try { used = UI.touchTap ? UI.touchTap(x, y) : false; } catch (err) { console.warn(err); }
        if (!used && this.mode !== 'menu') Input.tap('confirm', 2);
        this.owned.set(t.identifier, { kind: 'tap' });
      }
    }
  },
  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const o = this.owned.get(t.identifier);
      if (!o) continue;
      if (o.kind === 'stick' && this.stick) {
        const { x, y } = this.toCanvas(t), st = this.stick;
        st.x = x; st.y = y;
        // Roblox style: pulled past the ring, the ring follows the thumb
        const dx = x - st.bx, dy = y - st.by, d = Math.hypot(dx, dy), max = st.R * 1.35;
        if (d > max) { st.bx = x - dx / d * max; st.by = y - dy / d * max; }
        this.updateStick();
      }
    }
  },
  onEnd(e) {
    e.preventDefault();
    Sound.nudge();
    for (const t of e.changedTouches) {
      const o = this.owned.get(t.identifier);
      if (!o) continue;
      this.owned.delete(t.identifier);
      if (o.kind === 'btn' && o.btn.act) this.hold(o.btn.act, false);
      if (o.kind === 'stick') { this.stick = null; this.updateStick(); }
    }
  },
  hold(act, on) {
    this.holds[act] = Math.max(0, (this.holds[act] || 0) + (on ? 1 : -1));
    if (on) Input.tap(act, 2);           // a tap shorter than a frame still lands
    Input.touch(act, this.holds[act] > 0);
    if (on && (act === 'confirm' || act === 'back') && G.state !== 'play') Sound.nudge();
  },
  // stick -> left / right / up / down and Input.stick, with the pad's dead zone and walk band
  updateStick() {
    const st = this.stick;
    let L = false, R = false, U = false, Dn = false;
    if (st) {
      const ax = clamp((st.x - st.bx) / st.R, -1.4, 1.4), ay = clamp((st.y - st.by) / st.R, -1.4, 1.4), mag = Math.min(1, Math.hypot(ax, ay));
      const nx = clamp(ax, -1, 1), ny = clamp(ay, -1, 1);
      if (mag > 0.25) { L = nx < -0.3; R = nx > 0.3; U = ny < -0.55; Dn = ny > 0.55; }
      Input.touchStick(mag > 0.25 ? { x: nx, y: ny, mag } : null, mag > 0.25 && Math.abs(nx) < 0.6);
    } else Input.touchStick(null, false);
    for (const [a, v] of [['left', L], ['right', R], ['up', U], ['down', Dn]]) if (!!(this.holds['stick-' + a]) !== v) { this.holds['stick-' + a] = v ? 1 : 0; Input.touch(a, v || (this.holds[a] || 0) > 0); }
  },
  release() {
    this.owned.clear(); this.stick = null; this.holds = {};
    Input.clearTouch();
  },

  // --- portrait: a "turn your phone" card (DOM, so it fills the whole screen whatever the canvas does) ----------
  checkRotate() {
    const want = (this.seen || coarse()) && window.innerHeight > window.innerWidth * 1.05;
    if (want && !this.rotateEl) {
      const el = document.createElement('div');
      el.id = 'rotate';
      el.innerHTML = `<div class="rc"><svg viewBox="0 0 120 120" width="120" height="120"><g class="ph"><rect x="38" y="14" width="44" height="80" rx="9" fill="#2c2334" stroke="#f3ecdf" stroke-width="5"/><circle cx="60" cy="84" r="4" fill="#bfe9f2"/></g><path d="M22 96 a44 44 0 0 0 30 18" fill="none" stroke="#ffe9a8" stroke-width="5" stroke-linecap="round"/><path d="M47 108 l6 6 -8 3" fill="none" stroke="#ffe9a8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div class="t1">Turn your phone sideways</div><div class="t2">Elementbound plays in landscape.</div></div>`;
      const css = document.createElement('style');
      css.textContent = `#rotate{position:fixed;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:rgba(14,11,18,0.94);touch-action:none}
        #rotate .rc{background:#e9dcc0;border:6px solid #1d1420;border-radius:28px;padding:28px 30px 26px;text-align:center;max-width:78vw;box-shadow:0 10px 0 rgba(0,0,0,0.35);font-family:"Avenir Next","Futura","Trebuchet MS","Segoe UI",sans-serif}
        #rotate svg{background:#1d1420;border-radius:50%;padding:6px}
        #rotate .ph{transform-origin:60px 54px;animation:rot 2.4s ease-in-out infinite}
        @keyframes rot{0%,20%{transform:rotate(0)}55%,85%{transform:rotate(-90deg)}100%{transform:rotate(0)}}
        #rotate .t1{font-weight:800;font-size:24px;color:#2c2334;margin-top:14px}
        #rotate .t2{font-weight:600;font-size:16px;color:#6b5a4a;margin-top:6px}`;
      el.appendChild(css);
      document.body.appendChild(el);
      this.rotateEl = el;
      this.release();
      if (G.state === 'play' && G.room) try { UI.openPause(); } catch { /* not yet */ }
    } else if (!want && this.rotateEl) { this.rotateEl.remove(); this.rotateEl = null; }
    this.rotating = !!this.rotateEl;
  },

  // --- drawing (screen space, on top of everything) ------------------------------------------------------------
  draw(ctx) {
    const was = Input.touchUI;
    Input.touchUI = this.active;
    if (was && !Input.touchUI && (this.owned.size || this.stick)) this.release();
    this.buttons = this.layout();
    // a finger keeps the button it landed on even if that button's layout object was rebuilt
    for (const o of this.owned.values()) if (o.kind === 'btn') { const nb = this.buttons.find((b) => (b.id || b.act) === o.id); if (nb) { nb.down = true; o.btn = nb; } }
    if (!Input.touchUI || G.state === 'loading') return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.mode === 'play') this.drawStick(ctx);
    for (const b of this.buttons) this.drawButton(ctx, b);
    ctx.restore();
  },
  drawStick(ctx) {
    const { s } = this.metrics(), st = this.stick;
    if (!st) {   // a faint resting ring, so a new player knows where the thumb goes
      const x = 110 * s, y = H - 104 * s, R = 50 * s;
      ctx.globalAlpha = 0.32;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fillStyle = 'rgba(29,20,32,0.5)'; ctx.fill(); ctx.lineWidth = 3 * s; ctx.strokeStyle = CREAM; ctx.setLineDash([7 * s, 7 * s]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, y, 20 * s, 0, 7); D.inked(ctx, 'rgba(243,236,223,0.6)', 2.5 * s);
      ctx.globalAlpha = 1;
      return;
    }
    const dx = st.x - st.bx, dy = st.y - st.by, d = Math.hypot(dx, dy), m = Math.min(d, st.R), kx = st.bx + (d ? dx / d * m : 0), ky = st.by + (d ? dy / d * m : 0);
    ctx.beginPath(); ctx.arc(st.bx, st.by, st.R, 0, 7); ctx.fillStyle = 'rgba(29,20,32,0.42)'; ctx.fill(); ctx.lineWidth = 2.5 * s; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(st.bx, st.by, st.R - 3 * s, 0, 7); ctx.lineWidth = 1.6 * s; ctx.strokeStyle = 'rgba(200,255,216,0.55)'; ctx.stroke();
    // the four directions, lit when that way is held
    for (const [a, ang] of [['up', -Math.PI / 2], ['down', Math.PI / 2], ['left', Math.PI], ['right', 0]]) {
      const on = Input.held[a], px = st.bx + Math.cos(ang) * st.R * 0.78, py = st.by + Math.sin(ang) * st.R * 0.78;
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(5 * s, 0); ctx.lineTo(-3 * s, -5 * s); ctx.lineTo(-3 * s, 5 * s); ctx.closePath();
      ctx.fillStyle = on ? '#c8ffd8' : 'rgba(243,236,223,0.35)'; ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(kx, ky, 25 * s, 0, 7); D.inked(ctx, 'rgba(243,236,223,0.82)', 2.6 * s);
    ctx.beginPath(); ctx.arc(kx - 6 * s, ky - 7 * s, 8 * s, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  },
  drawButton(ctx, b) {
    const { s } = this.metrics(), p = G.player;
    const down = b.down || (b.act && Input.held[b.act] && this.holds[b.act] > 0);
    let dim = false, ring = null, ringCol = b.col, icon = null;
    if (b.slot != null) {
      const id = G.save.slots[b.slot];
      if (!id) dim = true;
      else { const cost = moveCost(id); icon = id; ringCol = ELEMENTS[MOVES[id].el].color; ring = cost > 0 ? Math.min(1, p.breath / cost) : 1; if (p.breath < cost) dim = true; }
    }
    if (b.id === 'heal') { ring = Math.min(1, p.breath / healCost()); dim = p.breath < healCost() || p.hp >= G.save.maxHp; }
    const pop = b.pop ? Math.min(1, (performance.now() - (b.popT || (b.popT = this.popAt(b)))) / 160) : 1;
    const r = b.r * (down ? 0.92 : 1) * (0.6 + 0.4 * pop), x = b.x, y = b.y;
    ctx.save();
    const fade = this.mode === 'menu' || this.mode === 'items' ? 0.62 : 0.82;   // over a menu: lighter, so the page shows through
    ctx.globalAlpha = (dim ? 0.45 : down ? 0.95 : fade) * pop;
    // the painted disc: a soft shadow, the dark body, the ink edge, a coloured rim and a highlight
    ctx.beginPath(); ctx.arc(x, y + r * 0.08, r, 0, 7); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, down ? 'rgba(90,70,96,0.95)' : 'rgba(64,50,72,0.78)'); g.addColorStop(1, down ? 'rgba(40,28,46,0.95)' : 'rgba(29,20,32,0.7)');
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = Math.max(3, r * 0.08); ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, 7); ctx.lineWidth = Math.max(2, r * 0.06); ctx.strokeStyle = down ? '#fff8e4' : D.hexA(b.col, 0.75); ctx.stroke();
    if (ring != null) {   // Breath toward the cost: a full ring means it can be cast now
      ctx.beginPath(); ctx.arc(x, y, r * 0.93, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ring); ctx.lineWidth = Math.max(3, r * 0.12); ctx.lineCap = 'round'; ctx.strokeStyle = ringCol; ctx.stroke(); ctx.lineCap = 'butt';
    }
    if (b.slot != null && p.castLock > 0 && p.castLockMax) {   // the cast's recovery sweeping away
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.castLock / p.castLockMax)); ctx.closePath(); ctx.fillStyle = 'rgba(14,8,18,0.55)'; ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(x - r * 0.25, y - r * 0.45, r * 0.42, r * 0.2, -0.4, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fill();
    ctx.globalAlpha = (dim ? 0.55 : 1) * pop;
    // what is on it
    const lab = b.label, ty = lab ? y - r * 0.16 : y;
    if (icon) D.moveIcon(ctx, icon, x, y, r * 0.68, {});
    else if (b.slot != null) { ctx.setLineDash([5 * s, 5 * s]); ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 7); ctx.lineWidth = 2 * s; ctx.strokeStyle = 'rgba(243,236,223,0.4)'; ctx.stroke(); ctx.setLineDash([]); }
    else if (b.icon === 'heal') UI.drawHeart(ctx, x, ty, r * 0.36, 1);
    else if (b.icon) this.drawIcon(ctx, b.icon, x, ty, r * 0.42, b.col);
    else if (b.glyph) { ctx.font = D.font(Math.round(b.glyph.length > 1 ? r * 0.62 : r * 0.7), 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = r * 0.14; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(b.glyph, x, y + 1); ctx.fillStyle = CREAM; ctx.fillText(b.glyph, x, y + 1); }
    if (lab) {
      const px = Math.round(Math.max(13 * s, r * (b.icon ? 0.3 : 0.4)));
      ctx.font = D.font(px, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      const ly = b.icon ? y + r * 0.5 : y + 1;
      ctx.lineWidth = px * 0.3; ctx.strokeStyle = INK; ctx.strokeText(lab, x, ly); ctx.fillStyle = CREAM; ctx.fillText(lab, x, ly);
    }
    if (b.slot != null) {   // the slot number, small, on the rim
      const nx = x + r * 0.72, ny = y - r * 0.72;
      ctx.beginPath(); ctx.arc(nx, ny, r * 0.3, 0, 7); D.inked(ctx, '#f3ecdf', Math.max(2, r * 0.07));
      ctx.font = D.font(Math.round(r * 0.36), 800); ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(b.slot + 1), nx, ny + 1);
    }
    ctx.restore();
  },
  popAt(b) { this._pops = this._pops || {}; const k = b.id + ':' + b.label; if (!this._pops[k] || performance.now() - this._pops[k].last > 400) this._pops[k] = { t: performance.now() }; this._pops[k].last = performance.now(); return this._pops[k].t; },
  drawIcon(ctx, kind, x, y, r, col) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stroke = (w) => { ctx.lineWidth = w + r * 0.16; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = w; ctx.strokeStyle = CREAM; ctx.stroke(); };
    ctx.beginPath();
    if (kind === 'jump') { ctx.moveTo(x - r * 0.75, y + r * 0.35); ctx.lineTo(x, y - r * 0.4); ctx.lineTo(x + r * 0.75, y + r * 0.35); stroke(r * 0.26); }
    else if (kind === 'strike') { ctx.arc(x - r * 0.5, y + r * 0.6, r * 1.15, -1.45, -0.15); stroke(r * 0.24); ctx.beginPath(); ctx.arc(x + r * 0.62, y + r * 0.42, r * 0.12, 0, 7); ctx.fillStyle = col; ctx.fill(); }
    else if (kind === 'dash') { for (const o of [-0.45, 0.25]) { ctx.beginPath(); ctx.moveTo(x + r * (o - 0.2), y - r * 0.55); ctx.lineTo(x + r * (o + 0.35), y); ctx.lineTo(x + r * (o - 0.2), y + r * 0.55); stroke(r * 0.22); } }
    else if (kind === 'use') { ctx.arc(x, y - r * 0.1, r * 0.5, 0, 7); stroke(r * 0.2); ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 0.14, 0, 7); ctx.fillStyle = col; ctx.fill(); }
    else if (kind === 'pause') { for (const o of [-0.32, 0.32]) { ctx.beginPath(); ctx.moveTo(x + r * o, y - r * 0.55); ctx.lineTo(x + r * o, y + r * 0.55); stroke(r * 0.3); } }
    ctx.restore();
  },
};
