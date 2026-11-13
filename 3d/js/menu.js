// The pause menu, pad first: D-pad or left stick moves, ✕ confirms, ○ goes back, Options closes.
// Pages: Resume · Skills (the small air skill tree, bought with beads) · Moves · Restart from checkpoint · Settings.
import { G } from './state.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { glyph, G_ } from './hud.js';
import { tglyph } from './touch-icons.js';

const $ = (id) => document.getElementById(id);
export const SKILLS = [
  { id: 'blade', name: 'Air-infused staff', desc: 'Heavy strikes [R2] send a short wind blade (15 Breath).', cost: 60 },
  { id: 'flyKick', name: 'Rising flying kick', desc: 'After the 1st or 2nd light strike, [R2] launches the soldier.', cost: 40 },
  { id: 'gustCD', name: 'Quick palm', desc: 'Palm Gust [L1+□] recovers 25% faster.', cost: 50 },
  { id: 'parry', name: 'Still water', desc: 'A wider parry window for [L1].', cost: 50 },
  { id: 'heart', name: 'One more heart', desc: 'One more heart, filled.', cost: 70 },
];
const ROOT = ['Resume', 'Skills', 'Moves', 'Controls', 'Restart from checkpoint', 'Settings', ...(/[?&]debug/.test(location.search) ? ['Effects lab'] : [])];   // release: the fx lab is a dev tool (?debug only)
// v4 note 27: both schemes side by side (pad glyphs and keyboard-and-mouse keys), whatever device is in use
const PADI = (s) => s.split('+').map((k) => `<img class="g" src="assets/ui/cut/pad-${{ '✕': 'cross', '○': 'circle', '□': 'square', '△': 'triangle', OPTIONS: 'options', LS: 'ls', RS: 'rs', DPAD: 'dpad' }[k] || k}.png" alt="${k}">`).join('<span>+</span>');
const KEYS = (s) => s.split(' / ').map((k) => /^(LMB|RMB|MMB)$/.test(k) ? `<span class="kb mouse m${k[0]}"><b></b></span>` : /^hold LMB$/.test(k) ? `<span class="kbw">hold</span><span class="kb mouse mL"><b></b></span>` : `<span class="kb">${k}</span>`).join(' ');
const CONTROLS = [['Move', 'LS', 'W A S D'], ['Camera', 'RS', 'Mouse'], ['Light strike', 'R1', 'LMB'], ['Heavy strike', 'R2', 'hold LMB / Mouse 4 / F'], ['Jump · in the air + light: slam', '✕', 'Space'], ['Dodge roll / Wind-Step', '○', 'Shift'], ['Guard · parry', 'L1', 'Q'], ['Aim · fire', 'L2+R2', 'RMB / LMB'], ['Palm Gust', 'L1+□', '1 / Z'], ['Double Jump · jump again in the air', '✕', 'Space'], ['Lock on · takedown', 'R3', 'MMB / Tab'], ['Interact', '△', 'E'], ['Show the way', 'DPAD', 'H'], ['Pause', 'OPTIONS', 'Esc']];
// v7 note 43: the third column, the on-screen touch button for each row ('' = not on touch)
const TOUCHC = ['stick', 'drag', 'light', 'heavy', 'jump', 'dodge', 'guard', 'aim', 'gust', 'jump', 'lock', 'interact', 'guide', 'pause'];

export const Menu = {
  page: 'root', sel: 0, open: false, onRestart: null, onClose: null,
  show() { this.skip = true; this.open = true; this.page = 'root'; this.sel = 0; $('pause').classList.remove('hidden'); this.render(); },
  hide() { this.open = false; $('pause').classList.add('hidden'); },
  items() {
    const p = G.player;
    if (this.page === 'root') return ROOT.map((t) => ({ t }));
    if (this.page === 'skills') return SKILLS.map((s) => ({ t: s.name, s, owned: !!p.skills[s.id], can: p.beads >= s.cost }));
    if (this.page === 'settings') return [
      { t: 'Camera speed (pad)', v: Input.camSpeed.toFixed(1) + '×', k: 'cam' },
      { t: 'Mouse sensitivity', v: (Input.sens / 0.0022).toFixed(1) + '×', k: 'sens' },
      { t: 'Invert camera Y', v: Input.invertY ? 'On' : 'Off', k: 'inv' },
      { t: 'Vibration', v: Input.vibration ? 'On' : 'Off', k: 'vib' },
      { t: 'Quality', v: window.__game && window.__game.quality === 'mobile' ? 'Mobile' : 'High', k: 'q' },
      ...(G.touch ? [{ t: 'Touch camera speed', v: (Input.touchSens / 0.0062).toFixed(1) + '×', k: 'tsens' }] : []),
    ];
    return [];
  },
  render() {
    const p = G.player, items = this.items();
    const titles = { root: 'Paused', skills: 'Air skills', moves: 'Moves', controls: 'Controls', settings: 'Settings' };
    $('menu-title').textContent = titles[this.page];
    let html = '';
    if (this.page === 'controls') {
      html = `<div class="ctl"><span class="h">Action</span><span class="h">Pad</span><span class="h">Keyboard and mouse</span><span class="h">Touch</span>` + CONTROLS.map(([a, p, k], i) => `<span>${a}</span><span>${PADI(p)}</span><span>${KEYS(k)}</span><span>${TOUCHC[i] ? tglyph(TOUCHC[i]) : '–'}</span>`).join('') + `</div><div id="menu-desc">Prompts follow the last device you touched.</div>`;
    } else if (this.page === 'moves') {
      const rows = [['Move / camera', '[LS] / [RS]'], ['Light strike (chain it)', '[R1]'], ['Heavy strike · after the 3rd light: sweep', '[R2]'], ['Jump', '[✕]'], ['Jump, then light strike: plunging slam', '[✕] [R1]'], ['Guard · tap just before a gold hit: parry', '[L1]'], ['Dodge roll', '[○]'], ['Palm Gust', '[L1+□]']];
      if (p.unlocked.shot) rows.push(['Aimed Gust', '[L2+R2]']);
      if (p.unlocked.step) rows.push(['Wind-Step (through red attacks)', '[○]']);
      if (p.unlocked.whirl) rows.push(['Double Jump · jump again in the air', '[✕] [✕]']);
      rows.push(['Lock on · takedown on a stunned foe', '[R3]'], ['Interact / talk', '[△]']);
      html = rows.map(([a, b]) => `<div class="mv"><span>${a}</span><span>${G_(b)}</span></div>`).join('');
      html += `<div id="menu-desc">Gold signal: parry or block it. Red signal: dodge it.</div>`;
    } else {
      html = items.map((it, i) => {
        const sel = i === this.sel ? ' sel' : '';
        if (this.page === 'skills') return `<div class="mi${sel}${it.owned ? '' : it.can ? '' : ' dim'}" data-i="${i}"><span>${it.t}</span><span class="cost">${it.owned ? '<span class="val">learned</span>' : `<img src="assets/ui/cut/bead.png" alt="">${it.s.cost}`}</span></div>`;
        return `<div class="mi${sel}" data-i="${i}"><span>${it.t}</span>${it.v ? `<span class="val">◀ ${it.v} ▶</span>` : ''}</div>`;
      }).join('');
      if (this.page === 'skills') html = `<div class="mv" style="border:0"><span>Beads</span><span class="cost"><img src="assets/ui/cut/bead.png" style="height:18px" alt=""> ${p.beads}</span></div>` + html + `<div id="menu-desc">${G_(items[this.sel].s.desc)}</div>`;
    }
    $('menu-body').innerHTML = html;
    const foot = this.page === 'root' ? `${glyph('✕')} choose &nbsp; ${glyph('OPTIONS')} resume` : this.page === 'settings' ? `${glyph('DPAD')} change &nbsp; ${glyph('BACK')} back` : this.page === 'skills' ? `${glyph('✕')} learn &nbsp; ${glyph('BACK')} back` : `${glyph('BACK')} back`;
    $('menu-foot').innerHTML = Input.usingTouch ? `<span class="tback" data-menu="back">${this.page === 'root' ? 'Resume' : '‹ Back'}</span>` : foot;   // v7: a tappable back / close
  },
  move(d) { const n = this.items().length; if (!n) return; this.sel = (this.sel + d + n) % n; Audio.play('menuMove'); this.render(); },
  update() {
    if (!this.open) return;
    if (this.skip) { if (!Input.down('back') && !Input.down('pause')) this.skip = false; return; }   // v4: Esc both pauses and goes back; the press that opened the menu must not close it
    if (Input.menu('menuUp')) this.move(-1);
    if (Input.menu('menuDown')) this.move(1);
    if (this.page === 'settings' && (Input.menu('menuLeft') || Input.menu('menuRight'))) {
      const d = Input.menu('menuLeft') ? -1 : 1, it = this.items()[this.sel];
      if (it.k === 'cam') Input.camSpeed = Math.max(0.4, Math.min(2, +(Input.camSpeed + d * 0.2).toFixed(1)));
      if (it.k === 'sens') Input.sens = 0.0022 * Math.max(0.2, Math.min(3, +((Input.sens / 0.0022) + d * 0.2).toFixed(1)));
      if (it.k === 'inv') Input.invertY = !Input.invertY;
      if (it.k === 'vib') Input.vibration = !Input.vibration;
      if (it.k === 'q') this.quality();
      if (it.k === 'tsens') Input.touchSens = 0.0062 * Math.max(0.4, Math.min(2.4, +((Input.touchSens / 0.0062) + d * 0.2).toFixed(1)));
      Audio.play('menuMove'); this.render(); this.save();
    }
    if (Input.pressed('confirm')) this.confirm();
    else if (Input.pressed('back')) this.back();
  },
  back() { if (this.page === 'root') { this.onClose && this.onClose(); } else { this.sel = { skills: 1, moves: 2, controls: 3, settings: 5 }[this.page] ?? 0; this.page = 'root'; Audio.play('menuBack'); this.render(); } },
  // v7 note 43: a tap on an item selects and confirms it
  tap(i) { if (!this.open || i < 0 || i >= this.items().length) return; this.sel = i; this.render(); this.confirm(); },
  confirm() {
    const p = G.player;
    if (this.page === 'root') {
      const t = ROOT[this.sel];
      Audio.play('menuConfirm');
      if (t === 'Resume') { this.onClose && this.onClose(); return; }
      if (t === 'Skills') { this.page = 'skills'; this.sel = 0; }
      if (t === 'Moves') { this.page = 'moves'; this.sel = 0; }
      if (t === 'Settings') { this.page = 'settings'; this.sel = 0; }
      if (t === 'Controls') { this.page = 'controls'; this.sel = 0; }
      if (t === 'Restart from checkpoint') { this.onRestart && this.onRestart(); return; }
      if (t === 'Effects lab') { location.href = 'fx-lab.html'; return; }
      this.render(); return;
    }
    if (this.page === 'skills') {
      const it = this.items()[this.sel];
      if (it.owned) return;
      if (!it.can) { Audio.play('noBreath', { vol: 0.5 }); return; }
      p.beads -= it.s.cost; p.skills[it.s.id] = true;
      if (it.s.id === 'heart') { p.maxHp += 2; p.hp = p.maxHp; }
      Audio.play('unlock', { vol: 0.6 }); this.render();
    }
    if (this.page === 'settings') { const it = this.items()[this.sel]; if (it.k === 'inv') Input.invertY = !Input.invertY; if (it.k === 'vib') Input.vibration = !Input.vibration; if (it.k === 'cam') Input.camSpeed = Input.camSpeed >= 2 ? 0.4 : +(Input.camSpeed + 0.2).toFixed(1); if (it.k === 'sens') Input.sens = Input.sens >= 0.0022 * 3 ? 0.0022 * 0.4 : Input.sens + 0.0022 * 0.2; if (it.k === 'q') this.quality(); if (it.k === 'tsens') Input.touchSens = Input.touchSens >= 0.0062 * 2.4 ? 0.0062 * 0.4 : Input.touchSens + 0.0062 * 0.2; Audio.play('menuMove'); this.render(); this.save(); }
  },
  quality() { const g = window.__game; if (g && g.setQuality) g.setQuality(g.quality === 'mobile' ? 'high' : 'mobile'); },
  save() { try { localStorage.setItem('eb3d-settings', JSON.stringify({ cam: Input.camSpeed, inv: Input.invertY, vib: Input.vibration, sens: Input.sens, tsens: Input.touchSens })); } catch {} },
  load() { try { const s = JSON.parse(localStorage.getItem('eb3d-settings') || '{}'); if (s.cam) Input.camSpeed = s.cam; Input.invertY = !!s.inv; if (s.vib === false) Input.vibration = false; if (s.sens) Input.sens = s.sens; if (s.tsens) Input.touchSens = s.tsens; } catch {} },
};
