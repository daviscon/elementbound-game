// Unified input. The PlayStation pad and keyboard-and-mouse are both first-class (v4 note 27); the last device
// used decides which glyphs every prompt shows (Input.usingPad), switching live.
// Actions are polled per frame: down(a), pressed(a) (this frame), released(a), heldT[a].
// Menu actions (menuUp/Down/Left/Right) repeat while held, so menus work from the D-pad or the stick.
//
// Pad layout (v3, Connor's note 8): ✕ jump · ○ dodge / roll (the Wind-Step once learned) · △ interact
// R1 light · R2 heavy (aimed gust while L2 is held) · L1 guard/parry · L2 aim
// L1+□ palm gust · L1+△ whirlwind lift (in the air: a jump extender) · R3 lock-on / takedown · Options pause.
const PAD = { cross: 0, circle: 1, square: 2, triangle: 3, L1: 4, R1: 5, L2: 6, R2: 7, share: 8, options: 9, L3: 10, R3: 11, up: 12, down: 13, left: 14, right: 15 };
const keys = new Set(), mouse = new Set();
let mdx = 0, mdy = 0;
const state = {}, prev = {};
const rep = {};
export const Input = {
  move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, usingPad: false, padConnected: false, locked: false, sens: 0.0022, padSens: 3.2, invertY: false, camSpeed: 1, vibration: true,
  injected: new Set(),
  // v7 note 43: touch. touchHeld = on-screen buttons held (action names), touchPulse = one-frame taps,
  // touchMove = the floating stick (x right, y forward, 0..1), touchLook = drag radians since the last poll
  usingTouch: false, lastTouchT: -1e9, touchSens: 0.0062, touchHeld: new Set(), touchPulse: new Map(), touchMove: { x: 0, y: 0, on: false }, touchLook: { x: 0, y: 0 },
  get lastScheme() { return this.usingTouch ? 'touch' : this.usingPad ? 'pad' : 'kbm'; },
  down: (a) => !!state[a], pressed: (a) => !!state[a] && !prev[a], released: (a) => !state[a] && !!prev[a],
  heldT: {}, onPadChange: null, onAnyPadPress: null,
};

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    keys.add(e.code); Input.usingPad = false; Input.usingTouch = false;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  canvas.addEventListener('mousedown', (e) => { if (performance.now() - Input.lastTouchT < 900) return; mouse.add(e.button); Input.usingPad = false; Input.usingTouch = false; if (e.button === 1 || e.button > 2) e.preventDefault(); });
  // the thumb buttons would otherwise navigate the page back/forward
  addEventListener('mouseup', (e) => { if (e.button > 2) e.preventDefault(); });
  addEventListener('auxclick', (e) => { if (e.button > 2) e.preventDefault(); });
  addEventListener('mouseup', (e) => mouse.delete(e.button));
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => { if (Input.locked) { mdx += e.movementX; mdy += e.movementY; if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) { Input.usingPad = false; Input.usingTouch = false; } } });
  addEventListener('blur', () => { keys.clear(); mouse.clear(); });
  document.addEventListener('pointerlockchange', () => { Input.locked = document.pointerLockElement === canvas; });
}

const dz = (v, d = 0.16) => Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d);
let hadPad = false, lastAx = [];
let lmbT = 0, lmbHeavy = false;
export const LMB_HOLD = 0.28;

export function pollInput(dt) {
  for (const k in state) prev[k] = state[k];
  const K = (c) => keys.has(c) || Input.injected.has(c);
  const Mb = (b) => mouse.has(b) || Input.injected.has('Mouse' + b);
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const gp = pads.find((p) => p.mapping === 'standard') || pads[0];
  // connection changes (polled, since some browsers only report a pad once a button is pressed)
  if (!!gp !== hadPad) { hadPad = !!gp; Input.padConnected = hadPad; if (hadPad) Input.usingPad = true; Input.onPadChange && Input.onPadChange(hadPad); }
  const B = (i) => !!(gp && gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.35));
  const anyBtn = gp && gp.buttons.some((b) => b.pressed);
  if (gp && (anyBtn || gp.axes.some((a) => Math.abs(a) > 0.3))) {
    // v7: a resting or drifting stick must not steal the scheme back from touch; a press or a real stick move does
    if (!Input.usingTouch || anyBtn || gp.axes.some((a, i) => Math.abs(a - (lastAx[i] || 0)) > 0.2)) { Input.usingPad = true; Input.usingTouch = false; }
  }
  lastAx = gp ? [...gp.axes] : [];
  if (anyBtn && Input.onAnyPadPress) Input.onAnyPadPress();
  const L1 = B(PAD.L1);
  const aimHeld = Mb(2) || B(PAD.L2) || Input.touchHeld.has('aim');   // v7: the touch Aim button (held)
  state.aim = aimHeld;
  // v4 note 27, the PC scheme: tap LMB = light (on release, so a hold can become the heavy); hold LMB 0.28 s
  // or tap a mouse thumb button = heavy; RMB held = aim, then LMB fires the aimed gust at once.
  const lmb = Mb(0);
  if (lmb && !aimHeld) { lmbT += dt; } 
  const lmbTap = !lmb && lmbT > 0 && lmbT < LMB_HOLD && !lmbHeavy;
  const lmbHold = lmb && !aimHeld && lmbT >= LMB_HOLD && !lmbHeavy;
  if (lmbHold) lmbHeavy = true;
  if (!lmb) { lmbT = 0; lmbHeavy = false; }
  Input.lmbCharge = lmb && !aimHeld && !lmbHeavy ? Math.min(1, lmbT / LMB_HOLD) : 0;
  state.light = lmbTap || K('KeyJ') || B(PAD.R1);
  state.heavy = lmbHold || Mb(3) || Mb(4) || K('KeyF') || K('KeyK') || (lmb && aimHeld) || B(PAD.R2);
  state.guard = L1 || K('KeyQ') || K('KeyL');
  state.jump = K('Space') || B(PAD.cross);
  state.dodge = K('ShiftLeft') || K('ShiftRight') || K('KeyC') || B(PAD.circle);
  state.gust = (L1 && B(PAD.square)) || K('Digit1') || K('KeyZ') || K('KeyG');
  state.whirl = (L1 && B(PAD.triangle)) || K('Digit2') || K('KeyX') || K('KeyV');
  state.lock = K('Tab') || Mb(1) || B(PAD.R3);
  state.interact = K('KeyE') || (!L1 && B(PAD.triangle));
  state.pause = K('Escape') || K('KeyP') || B(PAD.options);
  state.guide = K('KeyH') || B(PAD.up);   // v3: the wind shows the way to the next goal
  // menus and dialogue: ✕ confirms, ○ goes back
  state.confirm = K('Enter') || K('Space') || K('KeyE') || B(PAD.cross);
  state.fireflip = K('KeyR') || (B(PAD.L2) && B(PAD.square));   // the parked fire backflip (?fire=1)
  state.back = K('Escape') || K('Backspace') || B(PAD.circle);
  // v7 note 43: the on-screen touch buttons, ORed into the same actions (identical press / hold / release)
  for (const a of ['light', 'heavy', 'guard', 'jump', 'dodge', 'gust', 'whirl', 'lock', 'interact', 'pause', 'guide', 'confirm', 'back']) if (Input.touchHeld.has(a) || Input.touchPulse.has(a)) state[a] = true;
  // v7: while the touch Aim is held, Heavy or Attack fires the aimed gust (the pad's L2 + R2)
  if (aimHeld && Input.touchHeld.has('aim') && (state.light || state.heavy) && ['light', 'heavy'].some((a) => Input.touchHeld.has(a) || Input.touchPulse.has(a))) state.heavy = true;
  for (const [a, n] of Input.touchPulse) if (n <= 1) Input.touchPulse.delete(a); else Input.touchPulse.set(a, n - 1);
  const ly = gp ? gp.axes[1] : 0, lx = gp ? gp.axes[0] : 0;
  const mU = B(PAD.up) || ly < -0.6 || K('ArrowUp') || K('KeyW'), mD = B(PAD.down) || ly > 0.6 || K('ArrowDown') || K('KeyS');
  const mL = B(PAD.left) || lx < -0.6 || K('ArrowLeft') || K('KeyA'), mR = B(PAD.right) || lx > 0.6 || K('ArrowRight') || K('KeyD');
  // key repeat for menu directions: one step at once, then after 0.35 s one every 0.11 s
  for (const [name, on] of [['menuUp', mU], ['menuDown', mD], ['menuLeft', mL], ['menuRight', mR]]) {
    if (!on) { rep[name] = 0; state[name] = false; prev[name] = false; continue; }
    const t0 = rep[name] || 0, t1 = t0 + dt; rep[name] = t1;
    const fire = t0 === 0 || (t1 > 0.35 && Math.floor((t1 - 0.35) / 0.11) !== Math.floor(Math.max(0, t0 - 0.35) / 0.11)) || (t0 <= 0.35 && t1 > 0.35);
    state[name] = fire; prev[name] = false;
  }
  for (const k in state) Input.heldT[k] = state[k] ? (Input.heldT[k] || 0) + dt : 0;
  // movement
  let mx = (K('KeyD') ? 1 : 0) - (K('KeyA') ? 1 : 0), my = (K('KeyW') ? 1 : 0) - (K('KeyS') ? 1 : 0);
  if (gp) { const ax = dz(gp.axes[0]), ay = dz(gp.axes[1]); if (ax || ay) { mx = ax; my = -ay; } }
  if (Input.touchMove.on) { mx = Input.touchMove.x; my = Input.touchMove.y; }
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  Input.move.x = mx; Input.move.y = my;
  // look (radians this frame)
  let lx2 = mdx * Input.sens, ly2 = mdy * Input.sens; mdx = mdy = 0;
  if (K('ArrowLeft')) lx2 -= 2.2 * dt; if (K('ArrowRight')) lx2 += 2.2 * dt; if (K('ArrowUp')) ly2 -= 1.6 * dt; if (K('ArrowDown')) ly2 += 1.6 * dt;
  if (gp) {
    const rx = dz(gp.axes[2], 0.12), ry = dz(gp.axes[3], 0.12);
    // response curve: fine control near centre, fast turns at the edge
    const cv = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.7);
    const k = Input.padSens * Input.camSpeed * dt * (aimHeld ? 0.55 : 1);
    lx2 += cv(rx) * k; ly2 += cv(ry) * k * 0.7;
  }
  if (aimHeld && !Input.usingPad) { lx2 *= 0.75; ly2 *= 0.75; }
  const tk = aimHeld ? 0.6 : 1; lx2 += Input.touchLook.x * tk; ly2 += Input.touchLook.y * tk; Input.touchLook.x = Input.touchLook.y = 0;   // touch drag (radians)
  Input.look.x = lx2; Input.look.y = ly2 * (Input.invertY ? -1 : 1);
  Input.gamepad = gp;
}
// pressed() for menu repeats (they are edge-free by design)
Input.menu = (a) => !!state[a];

// rumble presets: light 0.2/40 ms, heavy 0.6/90 ms, parry 0.8/60 ms, hurt 1.0/150 ms
export function rumble(strong = 0.5, weak = 0.5, ms = 120) {
  const gp = Input.gamepad;
  if (!Input.vibration) return;
  try { if (gp && gp.vibrationActuator) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch {}
}
export { PAD };
