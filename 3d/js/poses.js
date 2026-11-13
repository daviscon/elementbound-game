// Procedural pose library, in the canonical T-pose frame (faces +Z, left = +X, up = +Y).
// Angles are degrees, Euler XYZ (Z applied first). Arms are written in left-arm terms and mirrored
// for the right (y and z flip). Conventions for a hanging arm: X negative swings it forward;
// forearm Y negative (left) bends the elbow forward. Thigh X negative lifts the leg forward,
// shin X positive bends the knee. Spine X positive leans forward, Y twists toward the left.
// Each pose: fn(u 0..1, params, t) -> { b: {bone: [x,y,z]}, h: [hip offset metres] }.
export const LEG_BONES = ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const UPPER = new Set(['castFire', 'castWater', 'throwFire', 'aim', 'castAirLight']);
export const isUpperOnly = (s) => UPPER.has(s);

const S = Math.sin, C = Math.cos, TAU = Math.PI * 2;
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mir = (a) => [a[0], -a[1], -a[2]];
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// build a pose from left-side arm/leg values (mirrored to the right unless given)
function P(o) {
  const b = {};
  const set = (n, v) => { if (v) b[n] = v; };
  set('Hips', o.hips); set('Spine02', o.sp0); set('Spine01', o.sp1); set('Spine', o.sp2); set('neck', o.neck); set('Head', o.head);
  set('LeftShoulder', o.shL); set('RightShoulder', o.shR ? mir(o.shR) : null);
  set('LeftArm', o.armL); set('RightArm', o.armR ? mir(o.armR) : null);
  set('LeftForeArm', o.foreL); set('RightForeArm', o.foreR ? mir(o.foreR) : null);
  set('LeftHand', o.handL); set('RightHand', o.handR ? mir(o.handR) : null);
  set('LeftUpLeg', o.thL); set('RightUpLeg', o.thR ? mir(o.thR) : null);
  set('LeftLeg', o.shinL); set('RightLeg', o.shinR ? mir(o.shinR) : null);
  set('LeftFoot', o.ftL); set('RightFoot', o.ftR ? mir(o.ftR) : null);
  return { b, h: o.h || [0, 0, 0] };
}
// blend two option objects key by key (missing = zero)
function mixO(a, b, k) {
  const o = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[key] || [0, 0, 0], vb = b[key] || [0, 0, 0];
    o[key] = lerp3(va, vb, k);
  }
  return o;
}
// keyframes: [[u, opts], ...] eased between
function KF(frames, u) {
  if (u <= frames[0][0]) return frames[0][1];
  for (let i = 0; i < frames.length - 1; i++) {
    const [u0, a] = frames[i], [u1, b] = frames[i + 1];
    if (u <= u1) return mixO(a, b, ease((u - u0) / (u1 - u0)));
  }
  return frames[frames.length - 1][1];
}

// ---- base stances ----
const GUARD = {   // light fighting stance: rooted, fists up
  hips: [0, 18, 0], sp0: [4, -6, 0], sp1: [5, -6, 0], sp2: [4, -4, 0], neck: [-4, 8, 0], head: [-6, 6, 0],
  armL: [-48, 10, -66], foreL: [0, -105, 0], handL: [0, 0, 10],
  armR: [-28, -12, -70], foreR: [0, -118, 0], handR: [0, 0, 10],
  thL: [-14, 18, 10], shinL: [22, 0, 0], ftL: [-6, -10, 0],
  thR: [8, -14, 8], shinR: [20, 0, 0], ftR: [-12, 10, 0], h: [0, -0.07, 0],
};
const RELAX = {
  sp0: [2, 0, 0], sp1: [2, 0, 0], sp2: [1, 0, 0], head: [-2, 0, 0],
  armL: [4, 0, -74], foreL: [0, -18, 0], armR: [4, 0, -74], foreR: [0, -18, 0],
  thL: [-2, 0, 3], shinL: [4, 0, 0], thR: [-2, 0, 3], shinR: [4, 0, 0], h: [0, -0.01, 0],
};
function breathe(o, t, amt = 1) {
  const s = S(t * 2.4) * amt;
  const r = { ...o };
  r.sp1 = [(o.sp1 || [0, 0, 0])[0] + s * 1.5, (o.sp1 || [0, 0, 0])[1], (o.sp1 || [0, 0, 0])[2]];
  r.armL = [(o.armL || [0, 0, 0])[0], (o.armL || [0, 0, 0])[1], (o.armL || [0, 0, 0])[2] - s * 2];
  r.armR = [(o.armR || [0, 0, 0])[0], (o.armR || [0, 0, 0])[1], (o.armR || [0, 0, 0])[2] - s * 2];
  r.h = [(o.h || [0, 0, 0])[0], (o.h || [0, 0, 0])[1] + s * 0.008, (o.h || [0, 0, 0])[2]];
  return r;
}

// locomotion cycle: ph 0..1 = one full stride (two steps)
function gait(ph, amp, lean, t, p) {
  const a = ph * TAU;
  const sL = S(a), sR = S(a + Math.PI);
  const knee = (s, c) => 8 + amp * 62 * Math.max(0, -c) + amp * 14 * Math.max(0, s);
  const cL = C(a), cR = C(a + Math.PI);
  const bob = -0.02 - amp * 0.05 + Math.abs(C(a)) * amp * 0.06;
  const tw = S(a) * 10 * amp;
  return {
    hips: [lean * 0.3, -tw, -p.lean * 0.4], sp0: [4 + lean * 0.4, tw * 0.6, 0], sp1: [3 + lean * 0.4, tw * 0.6, p.lean * 0.3], sp2: [2, tw * 0.4, 0], neck: [-lean * 0.4, 0, 0], head: [-lean * 0.5, 0, 0],
    thL: [-sL * 38 * amp - amp * 6, 0, 3], shinL: [knee(sL, cL), 0, 0], ftL: [sL * 12 * amp - 6 * amp, 0, 0],
    thR: [-sR * 38 * amp - amp * 6, 0, 3], shinR: [knee(sR, cR), 0, 0], ftR: [sR * 12 * amp - 6 * amp, 0, 0],
    armL: [sR * 42 * amp + 8, 0, -76 + amp * 4], foreL: [0, -25 - 55 * amp - Math.max(0, -sR) * 25 * amp, 0],
    armR: [sL * 42 * amp + 8, 0, -76 + amp * 4], foreR: [0, -25 - 55 * amp - Math.max(0, -sL) * 25 * amp, 0],
    h: [0, bob, 0],
  };
}

const punchArm = (k) => ({ arm: [lerp(-48, -86, k), lerp(10, -4, k), lerp(-66, -86, k)], fore: [0, lerp(-105, -4, k), 0] });

export const POSES = {
  idle: { loop: true, dur: 2.6, fn: (u, p, t) => P(breathe(p.relaxed ? RELAX : GUARD, t)) },
  calm: { loop: true, dur: 2.6, fn: (u, p, t) => P(breathe(RELAX, t)) },
  // stunned: swaying on the spot, head down, arms loose
  dazed: { loop: true, dur: 2.0, fn: (u, p, t) => P({ ...RELAX, hips: [0, S(t * 2.2) * 8, S(t * 1.6) * 6], sp0: [10, 0, S(t * 1.6) * -5], sp1: [12, S(t * 2.2) * 6, S(t * 1.6) * -6], sp2: [8, 0, 0], neck: [18, 0, S(t * 1.9) * 8], head: [16 + S(t * 3) * 4, S(t * 1.3) * 10, S(t * 1.9) * 10],
    armL: [10, 0, -70 + S(t * 2.2) * 6], foreL: [0, -20, 0], armR: [10, 0, -70 - S(t * 2.2) * 6], foreR: [0, -20, 0], thL: [-8, 0, 4], shinL: [14, 0, 0], thR: [-6, 0, 4], shinR: [12, 0, 0], h: [S(t * 1.6) * 0.03, -0.06, 0] }) },
  aim: { loop: true, dur: 2.6, fn: (u, p, t) => {
    const g = breathe(GUARD, t, 0.5), pitch = p.aimPitch || 0;
    return P({ ...g, sp1: [5 - pitch * 0.4, -14, 0], sp2: [4 - pitch * 0.4, -10, 0], head: [-6 - pitch * 0.3, 18, 0],
      armL: [-80 - pitch * 0.6, 4, -82], foreL: [0, -30, 0], handL: [0, 0, 18] });
  } },
  walk: { loop: true, dur: 1.0, fn: (u, p, t) => P(gait(u, 0.55, 6, t, p)) },
  run: { loop: true, dur: 0.66, fn: (u, p, t) => P(gait(u, 1, 16, t, p)) },
  jump: { dur: 0.5, fn: (u) => P(KF([[0, { sp1: [8, 0, 0], thL: [-40, 0, 6], shinL: [60, 0, 0], thR: [-10, 0, 4], shinR: [30, 0, 0], armL: [-40, 0, -40], foreL: [0, -40, 0], armR: [-20, 0, -50], foreR: [0, -40, 0] }],
    [1, { sp1: [4, 0, 0], thL: [-60, 0, 6], shinL: [95, 0, 0], thR: [-30, 0, 4], shinR: [80, 0, 0], armL: [-20, 0, -35], foreL: [0, -60, 0], armR: [-10, 0, -40], foreR: [0, -60, 0] }]], u)) },
  fall: { loop: true, dur: 0.8, fn: (u, p, t) => P({ sp1: [-4, 0, 0], head: [8, 0, 0], thL: [-30, 0, 8], shinL: [40, 0, 0], thR: [-8, 0, 6], shinR: [30, 0, 0],
    armL: [-10 + S(t * 9) * 5, 0, -30], foreL: [0, -30, 0], armR: [-10 - S(t * 9) * 5, 0, -30], foreR: [0, -30, 0] }) },
  land: { dur: 0.22, fn: (u) => { const k = S(u * Math.PI) ; return P(mixO(GUARD, { ...GUARD, sp1: [22, -6, 0], thL: [-50, 18, 10], shinL: [80, 0, 0], thR: [-40, -14, 8], shinR: [80, 0, 0], ftL: [20, 0, 0], ftR: [20, 0, 0], h: [0, -0.32, 0] }, k)); } },
  roll: { dur: 0.48, fn: (u) => {
    const k = clamp01((u - 0.05) / 0.85);
    return P({ hips: [ease(k) * 360, 0, 0], sp0: [30, 0, 0], sp1: [30, 0, 0], sp2: [20, 0, 0], head: [30, 0, 0],
      thL: [-110, 0, 6], shinL: [130, 0, 0], thR: [-100, 0, 6], shinR: [130, 0, 0], armL: [-60, 0, -40], foreL: [0, -100, 0], armR: [-60, 0, -40], foreR: [0, -100, 0],
      h: [0, -0.5 * S(k * Math.PI) - 0.05, 0] });
  } },
  // melee string: jab (left), cross (right), front kick (right), launcher (rising kick)
  punch1: { dur: 0.32, fn: (u) => { const k = u < 0.2 ? -0.15 * (u / 0.2) : u < 0.42 ? (u - 0.2) / 0.22 : 1 - (u - 0.42) / 0.58 * 0.95; const a = punchArm(k);
    return P({ ...GUARD, hips: [0, 18 + 16 * k, 0], sp1: [6, -6 - 26 * k, 0], sp2: [6, -6 - 12 * k, 0], armL: a.arm, foreL: a.fore, h: [0, -0.08, 0.05 * k] }); } },
  punch2: { dur: 0.36, fn: (u) => { const k = u < 0.22 ? -0.2 * (u / 0.22) : u < 0.45 ? (u - 0.22) / 0.23 : 1 - (u - 0.45) / 0.55 * 0.95; const a = punchArm(k);
    return P({ ...GUARD, hips: [0, 18 - 46 * k, 0], sp1: [8, -6 + 34 * k, 0], sp2: [6, 14 * k, 0], armR: a.arm, foreR: a.fore, thR: [8 - 10 * k, -14, 8], ftR: [-12, 10 + 30 * k, 0], h: [0, -0.1, 0.08 * k] }); } },
  kick: { dur: 0.5, fn: (u) => P(KF([[0, GUARD],
    [0.22, { ...GUARD, sp1: [-6, 10, 0], thR: [-70, 0, 10], shinR: [110, 0, 0], ftR: [10, 0, 0], thL: [-6, 18, 6], shinL: [16, 0, 0], armR: [-10, 0, -60], foreR: [0, -60, 0] }],
    [0.4, { ...GUARD, sp1: [-18, 14, 0], sp2: [-6, 0, 0], thR: [-105, 0, 6], shinR: [6, 0, 0], ftR: [30, 0, 0], thL: [0, 18, 6], shinL: [10, 0, 0], armL: [-20, 0, -50], armR: [20, 0, -40], foreR: [0, -20, 0], h: [0, -0.02, 0.06] }],
    [0.62, { ...GUARD, sp1: [-10, 10, 0], thR: [-60, 0, 8], shinR: [90, 0, 0] }], [1, GUARD]], u)) },
  launcher: { dur: 0.62, fn: (u) => P(KF([[0, { ...GUARD, sp1: [16, 0, 0], thL: [-40, 18, 10], shinL: [70, 0, 0], thR: [-30, -14, 8], shinR: [70, 0, 0], h: [0, -0.25, 0] }],
    [0.3, { ...GUARD, sp1: [-20, 0, 0], sp2: [-10, 0, 0], thR: [-150, 0, 4], shinR: [10, 0, 0], ftR: [40, 0, 0], thL: [6, 0, 6], shinL: [10, 0, 0], armL: [20, 0, -40], armR: [20, 0, -40], h: [0, 0.08, 0] }],
    [0.55, { ...GUARD, sp1: [-10, 0, 0], thR: [-90, 0, 6], shinR: [60, 0, 0] }], [1, GUARD]], u)) },
  hurt: { dur: 0.36, fn: (u) => { const k = S(Math.min(1, u * 1.6) * Math.PI) ; return P(mixO(GUARD, { ...GUARD, sp0: [-14, 10, 0], sp1: [-20, 14, 0], sp2: [-10, 0, 0], head: [-18, 0, 0], armL: [0, 0, -40], armR: [0, 0, -40], h: [0, -0.04, -0.1] }, k)); } },
  knockdown: { dur: 1.4, fn: (u) => { const k = ease(Math.min(1, u * 3)); const up = clamp01((u - 0.7) / 0.3);
    const down = { hips: [-88, 0, 0], sp1: [-6, 0, 0], head: [20, 0, 0], armL: [0, 0, -30], foreL: [0, -20, 0], armR: [0, 0, -30], foreR: [0, -20, 0], thL: [-20, 0, 8], shinL: [30, 0, 0], thR: [-40, 0, 8], shinR: [60, 0, 0], h: [0, -0.78, -0.35] };
    return P(mixO(mixO(GUARD, down, k), GUARD, ease(up))); } },
  dead: { dur: 0.9, fn: (u) => { const k = ease(Math.min(1, u * 1.3));
    return P(mixO(GUARD, { hips: [-90, 0, 8], sp1: [-6, 0, 0], head: [16, 30, 0], armL: [0, 0, -20], foreL: [0, -20, 0], armR: [10, 0, -10], foreR: [0, -10, 0], thL: [-10, 0, 10], shinL: [20, 0, 0], thR: [-30, 0, 4], shinR: [50, 0, 0], h: [0, -0.8, -0.4] }, k)); } },
  flail: { loop: true, dur: 0.5, fn: (u, p, t) => P({ hips: [-30, 0, S(t * 7) * 20], sp1: [-20, 0, 0], head: [-20, 0, 0], armL: [S(t * 20) * 50, 0, 20], foreL: [0, -40, 0], armR: [-S(t * 20) * 50, 0, 20], foreR: [0, -40, 0],
    thL: [-30 + S(t * 16) * 30, 0, 10], shinL: [50, 0, 0], thR: [-30 - S(t * 16) * 30, 0, 10], shinR: [50, 0, 0] }) },

  // ---- bending ----
  // Fire primary (Northern Shaolin): a fast straight jab, alternating fists (p.hand)
  castFire: { dur: 0.28, fn: (u, p) => { const k = u < 0.15 ? -0.2 : u < 0.35 ? (u - 0.15) / 0.2 : 1 - (u - 0.35) / 0.65 * 0.9; const a = punchArm(k); const pitch = p.aimPitch || 0;
    const right = p.hand === 1;
    const o = { ...GUARD, hips: [0, right ? 18 - 30 * k : 18 + 14 * k, 0], sp1: [6 - pitch * 0.3, right ? 20 * k - 10 : -26 * k - 10, 0], sp2: [6 - pitch * 0.3, -8, 0], head: [-6 - pitch * 0.3, 14, 0], h: [0, -0.09, 0.04 * k] };
    const arm = [a.arm[0] - pitch * 0.7 * k, a.arm[1], a.arm[2]];
    if (right) { o.armR = arm; o.foreR = a.fore; } else { o.armL = arm; o.foreL = a.fore; }
    return P(o); } },
  // Fire heavy: the backflip, the right foot flicks at the top (u ~0.45)
  backflip: { dur: 0.95, fn: (u) => {
    const crouch = { ...GUARD, sp1: [24, 0, 0], thL: [-60, 10, 8], shinL: [100, 0, 0], thR: [-60, -10, 8], shinR: [100, 0, 0], armL: [30, 0, -40], armR: [30, 0, -40], foreL: [0, -30, 0], foreR: [0, -30, 0], h: [0, -0.32, 0] };
    const flip = clamp01((u - 0.16) / 0.62);
    const tuck = S(clamp01((u - 0.12) / 0.75) * Math.PI);
    const kickK = clamp01(1 - Math.abs(u - 0.46) / 0.12);
    const air = { hips: [-ease(flip) * 360, 0, 0], sp1: [10, 0, 0], sp2: [10, 0, 0], head: [-10, 0, 0],
      armL: [-40, 0, -10], foreL: [0, -30, 0], armR: [-40, 0, -10], foreR: [0, -30, 0],
      thL: [-100 * tuck, 0, 8], shinL: [130 * tuck, 0, 0], thR: [lerp(-90 * tuck, -150, kickK), 0, 8], shinR: [lerp(120 * tuck, 0, kickK), 0, 0], ftR: [lerp(0, 40, kickK), 0, 0], h: [0, 0, 0] };
    if (u < 0.16) return P(mixO(GUARD, crouch, ease(u / 0.16)));
    if (u < 0.86) return P(mixO(crouch, air, ease(Math.min(1, (u - 0.16) / 0.08))));
    const land = { ...crouch, sp1: [30, 0, 0], h: [0, -0.28, 0] };
    return P(u < 0.93 ? mixO(air, land, ease((u - 0.86) / 0.07)) : mixO(land, GUARD, ease((u - 0.93) / 0.07)));
  } },
  // Water primary (Tai chi): both hands draw water up from the ground, then the right hand whips forward
  castWater: { dur: 0.62, fn: (u, p) => { const pitch = p.aimPitch || 0;
    return P(KF([[0, GUARD],
      [0.3, { ...GUARD, sp1: [20, 10, 0], sp2: [8, 0, 0], armL: [-30, 0, -70], foreL: [0, -30, 0], handL: [0, 0, 40], armR: [-30, 0, -70], foreR: [0, -30, 0], handR: [0, 0, 40], thL: [-30, 18, 10], shinL: [50, 0, 0], thR: [-20, -14, 8], shinR: [50, 0, 0], h: [0, -0.2, 0] }],
      [0.52, { ...GUARD, sp1: [-2 - pitch * 0.3, -20, 0], sp2: [-4, -6, 0], armL: [-60, 0, -30], foreL: [0, -60, 0], armR: [-90 - pitch * 0.6, 0, -60], foreR: [0, -10, 0], handR: [0, 0, -20], h: [0, -0.08, 0.05] }],
      [1, GUARD]], u)); } },
  // Water heavy: the whip, a wide horizontal sweep of the right arm
  castWhip: { dur: 0.72, fn: (u) => P(KF([[0, GUARD],
    [0.28, { ...GUARD, hips: [0, 50, 0], sp1: [6, 40, 0], sp2: [4, 20, 0], armR: [-80, 60, -90], foreR: [0, -40, 0], armL: [-20, 0, -60], h: [0, -0.12, 0] }],
    [0.55, { ...GUARD, hips: [0, -30, 0], sp1: [8, -40, 0], sp2: [4, -20, 0], armR: [-80, -50, -90], foreR: [0, -6, 0], armL: [-10, 0, -50], h: [0, -0.16, 0.06] }],
    [1, GUARD]], u)) },
  // Earth primary (Hung Gar): lift and stomp the right foot, then a straight right punch
  castEarth: { dur: 0.78, fn: (u, p) => { const pitch = p.aimPitch || 0; const horse = { ...GUARD, hips: [0, 0, 0], sp1: [6, 0, 0], thL: [-46, 30, 22], shinL: [70, 0, 0], thR: [-46, -30, 22], shinR: [70, 0, 0], ftL: [-10, 0, 0], ftR: [-10, 0, 0], armL: [-20, 0, -60], foreL: [0, -110, 0], armR: [-20, 0, -60], foreR: [0, -110, 0], h: [0, -0.28, 0] };
    return P(KF([[0, GUARD],
      [0.22, { ...GUARD, thR: [-80, 0, 10], shinR: [90, 0, 0], sp1: [-4, 0, 0], armL: [-30, 0, -40], armR: [-30, 0, -40], h: [0, 0.02, 0] }],
      [0.36, horse],
      [0.5, horse],
      [0.64, { ...horse, hips: [0, -30, 0], sp1: [4 - pitch * 0.3, 26, 0], armR: [-88 - pitch * 0.6, 0, -86], foreR: [0, -4, 0], h: [0, -0.26, 0.06] }],
      [1, GUARD]], u)); } },
  // Earth heavy: both fists raise high, then slam to the ground
  castWall: { dur: 0.9, fn: (u) => P(KF([[0, GUARD],
    [0.35, { ...GUARD, sp1: [-14, 0, 0], sp2: [-8, 0, 0], head: [-10, 0, 0], armL: [-150, 0, -40], foreL: [0, -60, 0], armR: [-150, 0, -40], foreR: [0, -60, 0], h: [0, 0.03, 0] }],
    [0.52, { ...GUARD, sp0: [20, 0, 0], sp1: [30, 0, 0], sp2: [16, 0, 0], armL: [-60, 0, -70], foreL: [0, -10, 0], armR: [-60, 0, -70], foreR: [0, -10, 0], thL: [-70, 30, 20], shinL: [100, 0, 0], thR: [-50, -30, 20], shinR: [90, 0, 0], h: [0, -0.45, 0.05] }],
    [0.75, { ...GUARD, sp1: [24, 0, 0], armL: [-60, 0, -70], armR: [-60, 0, -70], thL: [-60, 30, 20], shinL: [90, 0, 0], thR: [-50, -30, 20], shinR: [90, 0, 0], h: [0, -0.4, 0.05] }],
    [1, GUARD]], u)) },
  // Air primary (Baguazhang): coil, circle the palms, push both open palms forward
  castAir: { dur: 0.56, fn: (u, p) => { const pitch = p.aimPitch || 0;
    return P(KF([[0, GUARD],
      [0.3, { ...GUARD, hips: [0, 40, 0], sp1: [4, 40, 0], sp2: [2, 20, 0], armL: [-60, 30, -60], foreL: [0, -90, 0], handL: [0, 0, 50], armR: [-40, 0, -60], foreR: [0, -110, 0], handR: [0, 0, 50], thL: [-30, 18, 10], shinL: [40, 0, 0], h: [0, -0.14, 0] }],
      [0.5, { ...GUARD, hips: [0, -6, 0], sp1: [2 - pitch * 0.3, -10, 0], sp2: [0, 0, 0], armL: [-84 - pitch * 0.5, -10, -80], foreL: [0, -12, 0], handL: [0, 0, 70], armR: [-84 - pitch * 0.5, -10, -80], foreR: [0, -12, 0], handR: [0, 0, 70], thL: [-34, 18, 10], shinL: [30, 0, 0], thR: [10, -14, 8], shinR: [8, 0, 0], h: [0, -0.12, 0.12] }],
      [1, GUARD]], u)); } },
  // Air heavy: the whirlwind spin jump, arms out
  whirl: { dur: 1.1, fn: (u) => { const k = clamp01(u / 0.85);
    return P({ hips: [0, -ease(k) * 720, 0], sp1: [-6, 0, 0], head: [-6, 0, 0], armL: [-10, 0, 10 + 20 * S(u * 9)], foreL: [0, -20, 0], handL: [0, 0, 40], armR: [-10, 0, 10 - 20 * S(u * 9)], foreR: [0, -20, 0], handR: [0, 0, 40],
      thL: [-40, 0, 14], shinL: [70, 0, 0], thR: [-10, 0, 14], shinR: [40, 0, 0], h: [0, 0, 0] }); } },
  // enemies: overhead fire throw with the right hand (wind-up holds the glowing fist back)
  throwFire: { dur: 0.5, fn: (u) => P(KF([[0, { ...GUARD, sp1: [-8, 30, 0], armR: [60, 0, -10], foreR: [0, -90, 0], h: [0, -0.06, 0] }],
    [0.4, { ...GUARD, sp1: [16, -24, 0], armR: [-100, 0, -80], foreR: [0, -6, 0], h: [0, -0.1, 0.06] }], [1, GUARD]], u)) },
  windupThrow: { loop: true, dur: 1, fn: (u, p, t) => P({ ...GUARD, sp1: [-8, 30, 0], armR: [60 + S(t * 20) * 3, 0, -10], foreR: [0, -90, 0], h: [0, -0.06, 0] }) },
  windupPunch: { loop: true, dur: 1, fn: (u, p, t) => P({ ...GUARD, hips: [0, 40, 0], sp1: [0, 30, 0], armR: [20, 0, -60], foreR: [0, -120, 0], thL: [-30, 18, 10], shinL: [40, 0, 0], h: [0, -0.12, -0.05 + S(t * 24) * 0.005] }) },
  // captain
  roar: { dur: 1.5, fn: (u, p, t) => { const k = S(clamp01(u / 0.9) * Math.PI * 0.5) * (u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1);
    return P(mixO(GUARD, { sp0: [-10, 0, 0], sp1: [-16, 0, 0], sp2: [-10, 0, 0], neck: [-14, 0, 0], head: [-20 + S(t * 30) * 2, 0, 0], armL: [-20, 30, -10], foreL: [0, -40, 0], armR: [-20, 30, -10], foreR: [0, -40, 0], thL: [-30, 20, 14], shinL: [40, 0, 0], thR: [-30, -20, 14], shinR: [40, 0, 0], h: [0, -0.14, 0] }, k)); } },
  slash: { dur: 0.6, fn: (u) => P(KF([[0, { ...GUARD, hips: [0, 40, 0], sp1: [-6, 40, 0], armR: [-100, 60, -30], foreR: [0, -30, 0], h: [0, -0.06, 0] }],
    [0.35, { ...GUARD, hips: [0, -40, 0], sp1: [14, -40, 0], armR: [-90, -40, -80], foreR: [0, -6, 0], thL: [-40, 18, 10], shinL: [40, 0, 0], h: [0, -0.18, 0.12] }], [1, GUARD]], u)) },
  windupSlash: { loop: true, dur: 1, fn: (u, p, t) => P({ ...GUARD, hips: [0, 40, 0], sp1: [-6, 40, 0], armR: [-100 + S(t * 25) * 3, 60, -30], foreR: [0, -30, 0], h: [0, -0.06, 0] }) },
  slam: { dur: 1.0, fn: (u) => P(KF([[0, { ...GUARD, sp1: [20, 0, 0], thL: [-50, 18, 10], shinL: [80, 0, 0], thR: [-50, -14, 8], shinR: [80, 0, 0], h: [0, -0.3, 0] }],
    [0.3, { ...GUARD, sp1: [-14, 0, 0], armL: [-160, 0, -30], foreL: [0, -40, 0], armR: [-160, 0, -30], foreR: [0, -40, 0], thL: [-60, 0, 10], shinL: [90, 0, 0], thR: [-30, 0, 8], shinR: [60, 0, 0] }],
    [0.62, { ...GUARD, sp0: [24, 0, 0], sp1: [30, 0, 0], armL: [-50, 0, -60], foreL: [0, -10, 0], armR: [-50, 0, -60], foreR: [0, -10, 0], thL: [-70, 30, 20], shinL: [100, 0, 0], thR: [-50, -30, 20], shinR: [90, 0, 0], h: [0, -0.4, 0.05] }],
    [1, GUARD]], u)) },
  talk: { loop: true, dur: 3, fn: (u, p, t) => P({ ...RELAX, sp1: [6, 0, 0], head: [S(t * 1.3) * 4, S(t * 0.7) * 6, 0], armL: [-30, 0, -70], foreL: [0, -100, 0], armR: [-30, 0, -70], foreR: [0, -100, 0], handR: [0, 0, 10 + S(t * 2) * 10] }) },
};
