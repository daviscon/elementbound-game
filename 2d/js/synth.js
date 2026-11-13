// Procedural sound effects, rendered once into AudioBuffers when audio starts.
// They fill every gap the recorded files leave (footsteps, swings, doors, enemy barks,
// UI ticks, pickups, ambience beds) and replace the three files that were too quiet to
// rescue (land, punch hit, menu move). Each generator writes mono samples; `v` asks for a
// variant so repeated sounds (footsteps, hits) don't stamp.

const SR = 44100;
let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const noise = () => rand() * 2 - 1;

// --- tiny DSP kit -----------------------------------------------------------------------
function buf(sec) { return new Float32Array(Math.ceil(sec * SR)); }
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));      // attack then exponential decay
function lp(x, hz) { let y = 0; const k = 1 - Math.exp(-2 * Math.PI * hz / SR); for (let i = 0; i < x.length; i++) x[i] = y += (x[i] - y) * k; return x; }
function hp(x, hz) { let y = 0, px = 0; const k = Math.exp(-2 * Math.PI * hz / SR); for (let i = 0; i < x.length; i++) { const v = x[i]; y = k * (y + v - px); px = v; x[i] = y; } return x; }
// state-variable band-pass whose centre can move: hz(t)
function bp(x, hz, q = 2) {
  let low = 0, band = 0;
  for (let i = 0; i < x.length; i++) {
    const f = 2 * Math.sin(Math.PI * Math.min(0.24 * SR, typeof hz === 'function' ? hz(i / SR) : hz) / SR);
    low += f * band; const high = x[i] - low - band / q; band += f * high; x[i] = band;
  }
  return x;
}
function add(dst, src, at = 0, g = 1) { const o = Math.floor(at * SR); for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * g; return dst; }
function norm(x, peak = 0.7) { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m; return x; }
function fadeEnds(x, a = 0.004, b = 0.02) { const na = a * SR, nb = b * SR; for (let i = 0; i < na && i < x.length; i++) x[i] *= i / na; for (let i = 0; i < nb && i < x.length; i++) x[x.length - 1 - i] *= i / nb; return x; }

// a pitched tone: f(t) Hz, shape 'sin' | 'tri' | 'saw' | 'sq', amplitude envelope e(t)
function tone(sec, f, e, shape = 'sin') {
  const x = buf(sec); let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR; ph += (typeof f === 'function' ? f(t) : f) / SR; const p = ph % 1;
    const s = shape === 'sin' ? Math.sin(2 * Math.PI * p) : shape === 'tri' ? 1 - 4 * Math.abs(p - 0.5) : shape === 'saw' ? 2 * p - 1 : p < 0.5 ? 1 : -1;
    x[i] = s * e(t);
  }
  return x;
}
function nz(sec, e) { const x = buf(sec); for (let i = 0; i < x.length; i++) x[i] = noise() * e(i / SR); return x; }
const bell = (f, sec, d, g = 1) => { const x = tone(sec, f, (t) => env(t, 0.002, d) * g); add(x, tone(sec, f * 2.76, (t) => env(t, 0.002, d * 0.4) * g * 0.35)); add(x, tone(sec, f * 5.4, (t) => env(t, 0.001, d * 0.15) * g * 0.15)); return x; };
function arp(notes, gap, d, sec) { const x = buf(sec); notes.forEach((f, i) => add(x, bell(f, sec - i * gap, d), i * gap)); return x; }
const thump = (sec, f0, f1, d, g = 1) => tone(sec, (t) => f1 + (f0 - f1) * Math.exp(-t / (d * 0.5)), (t) => env(t, 0.002, d) * g);

// --- the sounds --------------------------------------------------------------------------
const GEN = {
  hit(v) { const x = thump(0.22, 180 + v * 20, 55, 0.07); add(x, lp(nz(0.08, (t) => env(t, 0.001, 0.018)), 3200), 0, 0.9); add(x, hp(nz(0.02, (t) => env(t, 0, 0.004)), 2000), 0, 0.6); return x; },
  'hit-heavy'(v) { const x = thump(0.4, 140 + v * 10, 38, 0.13); add(x, lp(nz(0.18, (t) => env(t, 0.001, 0.04)), 2200), 0, 1); add(x, hp(nz(0.03, (t) => env(t, 0, 0.006)), 1500), 0, 0.7); return x; },
  swing(v) { return bp(nz(0.2, (t) => Math.sin(Math.PI * Math.min(1, t / 0.17)) ** 2), (t) => 700 + t * 9000 + v * 200, 3); },
  'swing-big'(v) { return bp(nz(0.3, (t) => Math.sin(Math.PI * Math.min(1, t / 0.26)) ** 2), (t) => 400 + t * 6000 + v * 150, 2.5); },
  dash() { const x = bp(nz(0.22, (t) => env(t, 0.01, 0.07)), (t) => 2400 - t * 6000, 2); add(x, lp(nz(0.22, (t) => env(t, 0.005, 0.05)), 500), 0, 0.6); return x; },
  jump2() { return bp(nz(0.25, (t) => env(t, 0.01, 0.06)), (t) => 900 + t * 5000, 4); },
  land(v) { const x = thump(0.2, 110 + v * 10, 42, 0.05); add(x, lp(nz(0.12, (t) => env(t, 0.001, 0.025)), 900 + v * 100), 0, 0.9); return x; },
  'land-hard'() { const x = thump(0.35, 95, 32, 0.1); add(x, lp(nz(0.25, (t) => env(t, 0.001, 0.05)), 1200), 0, 1); return x; },
  'step-stone'(v) { const x = lp(nz(0.07, (t) => env(t, 0.001, 0.012)), 1800 + v * 300); add(x, thump(0.07, 160, 80, 0.015), 0, 0.5); return x; },
  'step-wood'(v) { const x = bp(nz(0.08, (t) => env(t, 0.001, 0.015)), 650 + v * 80, 6); add(x, thump(0.08, 220, 140, 0.02), 0, 0.6); return x; },
  'step-gravel'(v) { const x = buf(0.1); for (let k = 0; k < 5; k++) add(x, hp(nz(0.02, (t) => env(t, 0, 0.003)), 2500), rand() * 0.06, 0.5 + rand() * 0.5); add(x, lp(nz(0.08, (t) => env(t, 0.001, 0.02)), 900), 0, 0.5); return x; },
  'step-water'(v) { return bp(nz(0.16, (t) => env(t, 0.004, 0.05)), (t) => 1400 + v * 200 - t * 3000, 3); },
  'step-metal'(v) { const x = bell(780 + v * 60, 0.15, 0.03, 0.4); add(x, lp(nz(0.05, (t) => env(t, 0, 0.01)), 3000)); return x; },
  'ui-move'() { return tone(0.06, 1180, (t) => env(t, 0.002, 0.015), 'tri'); },
  talk(v) { const x = bp(nz(0.04, (t) => env(t, 0.001, 0.008)), 1700 + v * 150, 5); add(x, tone(0.04, 620 + v * 40, (t) => env(t, 0.001, 0.01), 'tri'), 0, 0.5); return x; },
  'no-breath'() { return tone(0.14, (t) => 240 - t * 400, (t) => env(t, 0.002, 0.04), 'tri'); },
  'map-open'() { return bp(nz(0.2, (t) => Math.sin(Math.PI * Math.min(1, t / 0.18))), (t) => 2500 + t * 4000, 1.5); },
  'map-close'() { return bp(nz(0.18, (t) => Math.sin(Math.PI * Math.min(1, t / 0.16))), (t) => 3500 - t * 6000, 1.5); },
  door() { const x = lp(tone(0.7, (t) => 70 + Math.sin(t * 40) * 6 + t * 30, (t) => Math.sin(Math.PI * Math.min(1, t / 0.55)) * 0.5, 'saw'), 900); add(x, thump(0.25, 120, 45, 0.07), 0.48); return x; },
  shutter() { const x = buf(1.2); for (let k = 0; k < 14; k++) add(x, bp(nz(0.05, (t) => env(t, 0, 0.012)), 900 + rand() * 500, 4), k * 0.075 + rand() * 0.02, 0.8); add(x, lp(nz(1.2, (t) => Math.sin(Math.PI * t / 1.2) * 0.4), 300)); add(x, thump(0.3, 110, 40, 0.08), 0.95, 1.2); return x; },
  wheel() { const x = buf(1.0); let t0 = 0; for (let k = 0; k < 22; k++) { add(x, bp(nz(0.03, (t) => env(t, 0, 0.006)), 2200, 5), t0, 0.7); t0 += 0.08 * Math.exp(-k * 0.09); } add(x, bp(nz(1.0, (t) => env(t, 0.2, 0.4) * 0.5), 600, 1)); return x; },
  gate() { const x = lp(nz(2.0, (t) => Math.sin(Math.PI * Math.min(1, t / 1.8)) * 0.5), 250); add(x, bell(110, 2.0, 0.6, 0.6)); add(x, thump(0.4, 90, 30, 0.12), 1.6, 1.3); return x; },
  splash(v) { const x = bp(nz(0.4, (t) => env(t, 0.003, 0.09)), (t) => 1800 - t * 2000, 1.5); for (let k = 0; k < 4; k++) add(x, tone(0.06, (t) => 500 + rand() * 600 + t * 4000, (t) => env(t, 0.002, 0.012)), 0.05 + rand() * 0.2, 0.3); return x; },
  clank(v) { const x = buf(0.35); [520, 1340, 2210, 3110].forEach((f, i) => add(x, tone(0.35, f + v * 30, (t) => env(t, 0.001, 0.09 / (1 + i * 0.4))), 0, 0.5 / (1 + i * 0.3))); add(x, hp(nz(0.03, (t) => env(t, 0, 0.004)), 1800), 0, 0.8); return x; },
  mace() { const x = GEN['swing-big'](0); add(x, GEN['hit-heavy'](0), 0.16, 1.1); return x; },
  'bow-draw'() { const x = buf(0.55); for (let k = 0; k < 18; k++) add(x, bp(nz(0.025, (t) => env(t, 0, 0.006)), 500 + k * 30, 6), k * 0.028 + rand() * 0.008, 0.4 + k * 0.03); return x; },
  arrow() { const x = bp(nz(0.18, (t) => env(t, 0.003, 0.05)), (t) => 3000 - t * 8000, 2); add(x, tone(0.06, 180, (t) => env(t, 0.001, 0.01), 'tri'), 0, 0.6); return x; },
  'arrow-hit'() { const x = thump(0.14, 260, 120, 0.03); add(x, bp(nz(0.1, (t) => env(t, 0, 0.02)), 1100, 4), 0, 0.6); return x; },
  growl() { return lp(tone(0.6, (t) => 62 + Math.sin(t * 9) * 6, (t) => Math.sin(Math.PI * Math.min(1, t / 0.55)) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 23)), 'saw'), 700); },
  bark() { const x = lp(tone(0.22, (t) => 260 - t * 500, (t) => env(t, 0.005, 0.06), 'saw'), 1600); add(x, bp(nz(0.2, (t) => env(t, 0.005, 0.05)), 900, 2), 0, 0.5); return x; },
  skid() { return bp(nz(0.45, (t) => env(t, 0.01, 0.15)), (t) => 1400 - t * 1200, 2); },
  snap() { const x = buf(0.25); add(x, hp(nz(0.02, (t) => env(t, 0, 0.003)), 2500)); add(x, hp(nz(0.02, (t) => env(t, 0, 0.003)), 2000), 0.05); add(x, thump(0.15, 300, 120, 0.03), 0.05, 0.8); return x; },
  chitter() { const x = buf(0.3); for (let k = 0; k < 9; k++) add(x, bp(nz(0.02, (t) => env(t, 0, 0.004)), 3000 + rand() * 1500, 6), k * 0.03, 0.7); return x; },
  roll() { const x = lp(nz(0.6, (t) => 0.6 + 0.4 * Math.sin(t * 40)), 220); for (let k = 0; k < 10; k++) add(x, lp(nz(0.03, (t) => env(t, 0, 0.006)), 1500), rand() * 0.55, 0.4); return x; },
  'thud-wall'() { const x = thump(0.3, 130, 40, 0.07); add(x, lp(nz(0.15, (t) => env(t, 0, 0.03)), 1400)); return x; },
  flutter() { return bp(nz(0.5, (t) => Math.sin(Math.PI * t / 0.5) * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 17))), 700, 1); },
  shriek() { const x = tone(0.4, (t) => 1900 - t * 2200, (t) => env(t, 0.02, 0.12) * 0.5, 'tri'); add(x, bp(nz(0.4, (t) => env(t, 0.02, 0.1)), 2500, 3), 0, 0.5); return x; },
  pounce() { return bp(nz(0.3, (t) => env(t, 0.02, 0.08)), (t) => 600 + t * 5000, 2); },
  petal() { return arp([523, 659, 784, 1046], 0.09, 0.4, 1.1); },
  pearl() { return arp([784, 988, 1175, 1568, 1976], 0.07, 0.45, 1.2); },
  bloom() { return arp([659, 880], 0.1, 0.3, 0.6); },
  piece() { return arp([880, 1175], 0.08, 0.25, 0.5); },
  bead(v) { return bell(1500 + v * 120, 0.25, 0.06, 0.6); },
  heal() { const x = buf(0.9); for (let k = 0; k < 6; k++) add(x, bell(440 * Math.pow(1.26, k), 0.5, 0.12, 0.6), k * 0.07); add(x, bp(nz(0.9, (t) => Math.sin(Math.PI * t / 0.9) * 0.4), (t) => 800 + t * 3000, 2)); return x; },
  focus() { return bp(nz(1.0, (t) => Math.min(1, t / 0.9) * 0.6), (t) => 300 + t * 1200, 3); },
  knockout() { const x = arp([660, 587, 494, 392, 330], 0.17, 0.5, 1.8); add(x, thump(0.4, 100, 40, 0.1), 0.3); return x; },
  lowhp() { const x = buf(0.6); add(x, thump(0.2, 70, 45, 0.05)); add(x, thump(0.2, 65, 40, 0.05), 0.2, 0.7); return x; },
  barrier() { const x = thump(0.6, 90, 30, 0.15, 1.2); add(x, GEN.clank(0), 0.01, 0.6); add(x, lp(nz(0.5, (t) => env(t, 0.001, 0.12)), 600), 0, 0.6); return x; },
  'wave-clear'() { const x = arp([523, 659, 784], 0.06, 0.6, 1.2); add(x, bell(1046, 1.0, 0.5, 0.6), 0.2); return x; },
  save() { const x = buf(2.0); [[220, 1], [221.5, 0.8], [597, 0.4], [1122, 0.2]].forEach(([f, g]) => add(x, tone(2.0, f, (t) => env(t, 0.01, 0.7) * g))); return x; },
  fanfare() { const x = arp([392, 523, 659, 784], 0.12, 0.6, 2.0); [523, 659, 784].forEach((f) => add(x, tone(1.4, f, (t) => env(t, 0.05, 0.5) * 0.3, 'tri'), 0.55)); return x; },
  ledge() { const x = lp(nz(0.1, (t) => env(t, 0.002, 0.02)), 1500); add(x, thump(0.1, 200, 110, 0.02), 0, 0.6); return x; },
  climb() { return bp(nz(0.3, (t) => Math.sin(Math.PI * t / 0.3)), (t) => 500 + t * 2000, 2); },
  slide() { return bp(nz(0.5, (t) => 0.6), 1600, 1.2); },
  walljump() { const x = GEN.jump2(0); add(x, GEN['step-stone'](1), 0, 0.8); return x; },
  parry() { const x = bell(1760, 0.6, 0.12, 0.9); add(x, bell(2637, 0.6, 0.08, 0.6)); add(x, hp(nz(0.03, (t) => env(t, 0, 0.005)), 3000), 0, 0.8); add(x, bp(nz(0.3, (t) => env(t, 0.01, 0.08)), (t) => 3000 - t * 5000, 2), 0.02, 0.5); return x; },
  block() { return GEN.clank(2); },
  sting() { const x = thump(1.8, 60, 28, 0.6, 1.2); add(x, bp(nz(1.8, (t) => Math.min(1, t / 1.5) * env(t, 1.5, 0.15)), (t) => 200 + t * 1500, 2), 0, 0.6); add(x, bell(110, 1.8, 0.8, 0.5)); return x; },
  phase() { const x = thump(1.4, 70, 30, 0.4, 1.2); add(x, bell(220, 1.4, 0.5, 0.6)); add(x, bell(330, 1.4, 0.5, 0.4), 0.1); return x; },
  'boss-defeat'() { const x = thump(2.5, 80, 25, 0.8, 1.3); add(x, arp([784, 659, 523, 392], 0.22, 0.7, 2.2), 0.3, 0.7); return x; },
  gameover() { const x = buf(3.0); [[220, 0], [196, 0.4], [175, 0.8], [147, 1.2]].forEach(([f, at]) => add(x, tone(1.8, f, (t) => env(t, 0.05, 0.5) * 0.5, 'tri'), at)); return lp(x, 1500); },
  'slam-rise'() { return bp(nz(0.35, (t) => env(t, 0.03, 0.1)), (t) => 300 + t * 3000, 3); },
  burn() { const x = buf(0.6); for (let k = 0; k < 14; k++) add(x, hp(nz(0.015, (t) => env(t, 0, 0.003)), 2500), rand() * 0.55, rand()); add(x, lp(nz(0.6, (t) => Math.sin(Math.PI * t / 0.6) * 0.3), 400)); return x; },
  // loops (fade-free so they can repeat)
  'glide-loop'() { return lp(nz(1.6, () => 0.5), 700); },
  'slide-loop'() { return bp(nz(0.8, () => 0.5), 1700, 1.2); },
  'roll-loop'() { return lp(nz(1.0, (t) => 0.6 + 0.3 * Math.sin(t * 2 * Math.PI * 12)), 260); },
};

// Ambience beds: 12 s, built so the last second crossfades into the first (seamless loop).
const AMB = {
  kite(t) { return { lp: 500 + 300 * Math.sin(t * 0.7), g: 0.4 + 0.25 * Math.sin(t * 0.37) }; },
  drowned(t) { return { lp: 900, g: 0.35 + 0.1 * Math.sin(t * 1.3) }; },
  quarry(t) { return { lp: 380 + 120 * Math.sin(t * 0.5), g: 0.35 + 0.2 * Math.sin(t * 0.29) }; },
  kiln(t) { return { lp: 160, g: 0.6 + 0.1 * Math.sin(t * 2.1) }; },
  brass(t) { return { lp: 450 + 200 * Math.sin(t * 0.6), g: 0.4 + 0.2 * Math.sin(t * 0.33) }; },
};
function ambience(region) {
  const sec = 13, x = buf(sec), f = AMB[region];
  let y = 0;
  for (let i = 0; i < x.length; i++) { const t = i / SR, p = f(t), k = 1 - Math.exp(-2 * Math.PI * p.lp / SR); y += (noise() - y) * k; x[i] = y * p.g * 3; }
  const ev = (g, at, gain) => add(x, g, at, gain);
  for (let k = 0; k < 14; k++) {
    const at = rand() * (sec - 1.5);
    if (region === 'kite') ev(bell(1200 + rand() * 900, 1.2, 0.5, 0.08), at, 1);
    if (region === 'drowned') { ev(tone(0.08, (t) => 400 + rand() * 300 + t * 3000, (t) => env(t, 0.002, 0.02) * 0.15), at, 1); if (k % 3 === 0) ev(lp(tone(0.25, (t) => 180 + Math.sin(t * 60) * 30, (t) => env(t, 0.01, 0.06) * 0.08, 'saw'), 800), at + 0.3, 1); }
    if (region === 'quarry') { ev(hp(nz(0.03, (t) => env(t, 0, 0.005) * 0.12), 2000), at, 1); if (k % 4 === 0) ev(bell(2400, 0.3, 0.04, 0.05), at, 1); }
    if (region === 'kiln') ev(hp(nz(0.02, (t) => env(t, 0, 0.004) * 0.2), 2500), at, 1);
    if (region === 'brass' && k % 3 === 0) ev(thump(0.5, 80, 40, 0.12, 0.2), at, 1);
  }
  // seamless: fold the last second over the first
  const n = SR, out = x.subarray(0, x.length - n);
  for (let i = 0; i < n; i++) { const k = i / n; out[i] = out[i] * k + x[x.length - n + i] * (1 - k); }
  return norm(out, 0.35);
}

const VARIANTS = { hit: 3, 'hit-heavy': 2, swing: 3, land: 2, 'step-stone': 3, 'step-wood': 3, 'step-gravel': 3, 'step-water': 3, 'step-metal': 3, talk: 3, splash: 2, clank: 2, bead: 3 };
const LOOPS = new Set(['glide-loop', 'slide-loop', 'roll-loop']);

// Render everything into AudioBuffers on `ctx`. Returns { name: [AudioBuffer, ...] }.
export function renderSynth(ctx) {
  const out = {};
  const mk = (data) => { const b = ctx.createBuffer(1, data.length, SR); b.copyToChannel(data, 0); return b; };
  for (const name in GEN) {
    const n = VARIANTS[name] || 1, list = [];
    for (let v = 0; v < n; v++) { seed = 1 + v * 7919 + name.length * 31; const d = GEN[name](v); list.push(mk(LOOPS.has(name) ? norm(d, 0.6) : fadeEnds(norm(d, 0.7)))); }
    out[name] = list;
  }
  for (const r in AMB) { seed = 99 + r.length; out['amb-' + r] = [mk(ambience(r))]; }
  return out;
}
export const SYNTH_NAMES = Object.keys(GEN);
