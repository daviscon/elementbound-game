// Keyboard + Gamepad (standard mapping) folded into named actions.
// held[a]: down right now. pressed[a] / released[a]: edge since the last consumed step.

// v15 (owner note 71, "I don't know how to hit"): arrows move, aim and look (Up also interacts beside a door, an NPC
// or a stone: player.js); Space jump; Z strike (with Up / Down for the up-strike and the pogo); X or Shift dash;
// A S D F the four bending slots (A is a plain tap now: the tap/hold-A focus trick is gone); Q heal; E interacts;
// Tab map; I inventory; Esc pause. Z and Space also confirm in menus, X and Esc go back. A second set keeps working
// where it doesn't collide: W up, J strike, K dash, Enter confirm, 1-4 slots, M map, P pin, Backspace back.
const KEYMAP = {
  ArrowLeft: ['left'], ArrowRight: ['right'], ArrowUp: ['up'], ArrowDown: ['down'],
  Space: ['jump', 'confirm'], KeyZ: ['attack', 'confirm'], KeyX: ['dash', 'back'], ShiftLeft: ['dash'], ShiftRight: ['dash'],
  KeyA: ['m0'], KeyS: ['m1'], KeyD: ['m2'], KeyF: ['m3'], KeyQ: ['heal'], KeyE: ['interact'],
  Tab: ['map'], KeyI: ['tab'], Escape: ['pause', 'back'],
  KeyW: ['up'], KeyJ: ['attack'], KeyK: ['dash'], Enter: ['confirm'], KeyP: ['pin'],
  Digit1: ['m0'], Digit2: ['m1'], Digit3: ['m2'], Digit4: ['m3'],
  Backspace: ['back'], KeyM: ['map'],
};
// Standard gamepad: 0 ✕, 1 ○, 2 □, 3 △, 4 L1, 5 R1, 6 L2, 7 R2, 9 Options, 12-15 D-pad.
const PADMAP = {
  0: ['jump', 'confirm'], 1: ['dash', 'back'], 2: ['attack'], 3: ['interact'],
  4: ['m0'], 6: ['m1'], 5: ['m2'], 7: ['m3'], 9: ['pause'], 8: ['map'], 17: ['map'],
  12: ['up'], 13: ['down'], 14: ['left'], 15: ['right'], 10: ['tab'],   // v10 (note 20): R3 no longer heals; hold △
};
const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'dash', 'attack', 'interact', 'm0', 'm1', 'm2', 'm3', 'pause', 'confirm', 'back', 'map', 'heal', 'tab', 'pin'];

export const Input = {
  held: {}, pressed: {}, released: {},
  padConnected: false,
  noPad: false,          // ?nopad=1: ignore controllers (automated checks on a machine with a pad in use)
  anyPressed: false,
  walk: false,           // stick pushed only part way: walk
  lastDevice: null,      // v15: 'kb' | 'pad' | 'touch', whichever was used last (prompts and the touch overlay follow it)
  touchUI: false,        // v15: the on-screen touch controls are showing (touch.js keeps this current)
  // _virt: bots and debug. _touch: the on-screen touch controls (touch.js), with _tstick its thumbstick and
  // _tpulse the actions a tap holds down for a couple of steps (so a quick tap is never lost between frames).
  _kb: {}, _pad: {}, _virt: {}, _touch: {}, _tpulse: {}, _tstick: null, _twalk: false, _keysDown: new Set(),

  init(target) {
    for (const a of ACTIONS) { this.held[a] = false; this._kb[a] = 0; this._pad[a] = false; this._virt[a] = false; this._touch[a] = false; this._tpulse[a] = 0; }
    window.addEventListener('keydown', (e) => {
      const acts = KEYMAP[e.code];
      if (!acts) return;
      e.preventDefault();
      this.lastDevice = 'kb';
      if (this._keysDown.has(e.code)) return;
      this._keysDown.add(e.code);
      for (const a of acts) this._kb[a]++;
      this._refresh();
    });
    window.addEventListener('keyup', (e) => {
      const acts = KEYMAP[e.code];
      if (!acts || !this._keysDown.has(e.code)) return;
      this._keysDown.delete(e.code);
      for (const a of acts) this._kb[a] = Math.max(0, this._kb[a] - 1);
      this._refresh();
    });
    window.addEventListener('blur', () => {
      this._keysDown.clear();
      for (const a of ACTIONS) { this._kb[a] = 0; this._touch[a] = false; }
      this._tstick = null;
      this._refresh();
    });
    window.addEventListener('gamepadconnected', () => { this.padConnected = true; });
    window.addEventListener('gamepaddisconnected', () => { this.padConnected = this._findPad() != null; });
  },

  _findPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  },

  // Call once per animation frame.
  poll() {
    const pad = this.noPad ? null : this._findPad();
    this.padConnected = !!pad;
    const next = {};
    for (const a of ACTIONS) next[a] = false;
    if (pad) {
      let used = false;
      for (const idx in PADMAP) {
        const b = pad.buttons[idx];
        if (b && (b.pressed || b.value > 0.5)) { used = true; for (const a of PADMAP[idx]) next[a] = true; }
      }
      // radial dead zone, then a walk band below 60% deflection
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0, mag = Math.hypot(ax, ay);
      if (mag > 0.25) {
        used = true;
        if (ax < -0.3) next.left = true;
        if (ax > 0.3) next.right = true;
        if (ay < -0.55) next.up = true;
        if (ay > 0.55) next.down = true;
      }
      if (used) this.lastDevice = 'pad';
      this.stick = mag > 0.25 ? { x: ax, y: ay, mag } : null;   // v9: raw stick for the attack direction buckets
      const dpad = pad.buttons[14] && pad.buttons[14].pressed || pad.buttons[15] && pad.buttons[15].pressed;
      this.walk = !dpad && mag > 0.25 && Math.abs(ax) < 0.6;
    } else { this.walk = false; this.stick = null; }
    // v15: the touch thumbstick stands in for the pad's stick while it is held
    if (this._tstick && !this.stick) { this.stick = this._tstick; this.walk = this._twalk; }
    this._pad = next;
    this._refresh();
  },

  _refresh() {
    for (const a of ACTIONS) {
      const now = this._kb[a] > 0 || this._pad[a] || this._virt[a] || this._touch[a] || this._tpulse[a] > 0;
      if (now && !this.held[a]) { this.pressed[a] = true; this.anyPressed = true; }
      if (!now && this.held[a]) this.released[a] = true;
      this.held[a] = now;
    }
  },

  // Call after each fixed update step so edges are seen exactly once.
  consume() {
    let pulsed = false;
    for (const a of ACTIONS) if (this._tpulse[a] > 0 && --this._tpulse[a] === 0) pulsed = true;
    if (pulsed) this._refresh();
    for (const a of ACTIONS) { this.pressed[a] = false; this.released[a] = false; }
    this.anyPressed = false;
  },

  // Virtual input (debug / automated playtests).
  set(action, down) { this._virt[action] = !!down; this._refresh(); },
  clearVirtual() { for (const a of ACTIONS) this._virt[a] = false; this._refresh(); },
  // Touch input (touch.js): held while a finger is on a button; tap() holds an action for `steps` fixed steps.
  touch(action, down) { if (action in this._touch) { this._touch[action] = !!down; this.lastDevice = 'touch'; this._refresh(); } },
  tap(action, steps = 2) { if (action in this._tpulse) { this._tpulse[action] = Math.max(this._tpulse[action], steps); this.lastDevice = 'touch'; this._refresh(); } },
  touchStick(st, walk) {
    this._tstick = st; this._twalk = !!walk; if (st) this.lastDevice = 'touch';
    if (!this.padConnected || this.noPad) { this.stick = st; this.walk = !!(st && walk); }   // live at once, not only at the next poll
  },
  clearTouch() { for (const a of ACTIONS) this._touch[a] = false; this._tstick = null; this._refresh(); },

  // v9 (Connor's note 6): which way a strike goes. With the stick: 45 degree buckets around straight up past a dead
  // zone; with the D-pad or keys: up alone is up, up plus a side is the up-diagonal. Returns 'up' | 'diag' | 'down' | null.
  aimDir() {
    const st = this.stick;
    if (st && st.mag > 0.5 && !(this.held.up && this._kb.up) ) {
      const a = Math.atan2(st.x, -st.y) * 180 / Math.PI;   // 0 = straight up, 90 = right
      if (Math.abs(a) <= 22.5) return 'up';
      if (Math.abs(a) <= 67.5) return 'diag';
      if (Math.abs(a) >= 135) return 'down';
      return null;
    }
    if (this.held.up && !this.held.down) return this.held.left || this.held.right ? 'diag' : 'up';
    if (this.held.down && !this.held.up) return 'down';
    return null;
  },

  // The device prompts are written for: the last one used (a pad that is merely plugged in still counts as the pad).
  device() { return this.lastDevice === 'touch' || (this.lastDevice == null && this.touchUI) ? 'touch' : this.lastDevice === 'kb' ? 'kb' : this.padConnected ? 'pad' : 'kb'; },
  // Label for an action on the current device (or on a given one: the Controls page shows all three).
  label(action, dev = this.device()) {
    const t = LABELS[dev] || LABELS.kb;
    return t[action] || action;
  },
};

// v15: touch labels are the names painted on the on-screen buttons (draw.js shows them as round touch glyphs).
const LABELS = {
  pad: { jump: '✕', dash: '○', attack: '□', interact: '△', m0: 'L1', m1: 'L2', m2: 'R1', m3: 'R2', pause: 'OPTIONS', confirm: '✕', back: '○', move: 'Stick', down: '↓', up: '↑', map: 'TOUCHPAD', heal: '△', tab: 'L3', pin: '□', left: '←', right: '→' },
  kb: { jump: 'Space', dash: 'X', attack: 'Z', interact: 'E', m0: 'A', m1: 'S', m2: 'D', m3: 'F', pause: 'Esc', confirm: 'Z', back: 'X', move: '← →', down: '↓', up: '↑', map: 'Tab', heal: 'Q', tab: 'I', pin: 'P', left: '←', right: '→' },
  touch: { jump: 'Jump', dash: 'Dash', attack: 'Strike', interact: 'Use', m0: 'Bend 1', m1: 'Bend 2', m2: 'Bend 3', m3: 'Bend 4', pause: 'Pause', confirm: 'Tap', back: 'Back', move: 'Stick', down: 'Stick ↓', up: 'Stick ↑', map: 'Map', heal: 'Heal', tab: 'Bag', pin: 'Pin', left: '◀', right: '▶' },
};
