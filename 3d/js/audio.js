// Web Audio: one-shot SFX (with pitch variation and simple distance/pan from the listener), music with
// cross-fades, and an ambience bed. Every play is logged (name, time) for test recordings.
const A = 'assets/audio/';
// name -> file(s) (several = random pick)
const SFX = {
  step: ['sfx-step-stone-1', 'sfx-step-stone-2', 'sfx-step-stone'], jump: 'sfx5-jump', land: 'sfx-land-v4', landHard: 'sfx-land-hard',
  punch: ['sfx-punch-hit', 'sfx-punch-hit-2', 'sfx-punch-hit-3'], hitHeavy: 'sfx-hit-heavy', swing: 'sfx-swing', swingHeavy: 'sfx-swing-heavy',
  soldierHurt: 'sfx-soldier-hurt', soldierDefeat: 'sfx-soldier-defeat', soldierAlert: 'sfx-soldier-alert', soldierStep: 'sfx-soldier-step',
  enemyFireball: 'sfx-enemy-fireball', windupFire: 'sfx-boss-windup-fire', windupHeavy: 'sfx-boss-windup-heavy',
  fireJab: 'sfx3-fire-jab', fireFlick: 'sfx3-fire-flick', backflip: 'sfx3-backflip', fireImpact: 'sfx3-fire-impact', fireSmall: 'sfx-fireball-impact',
  iceShards: 'sfx3-ice-shards', iceShatter: 'sfx-ice-shatter-v6', iceKnock: 'sfx-ice-knock', waterWhip: 'sfx3-water-whip', splash: 'sfx-splash',
  rockLaunch: 'sfx3-rock-launch', rockImpact: 'sfx-boulder-impact', stoneWall: 'sfx3-stone-wall', stomp: 'sfx-earth-slam', crumble: 'sfx-floor-break',
  gust: 'sfx3-gust', whirlwind: 'sfx3-whirlwind', cliffFall: 'sfx3-cliff-fall',
  dodge: 'sfx-dash-v5', hurt: 'sfx-player-hurt-v4', noBreath: 'sfx-no-breath',
  captainRoar: 'sfx3-captain-roar', captainIntro: 'sfx-captain-intro', captainDash: 'sfx-captain-dash', captainLeap: 'sfx-captain-leap', captainLand: 'sfx-captain-land',
  phase: 'sfx-phase-change-v5', floorBreak: 'sfx-floor-break', quake: 'sfx-quake-warning', flameRing: 'sfx-flame-ring', bossDefeat: 'sfx-boss-defeat', bossCard: 'sfx-boss-card',
  bell: 'sfx3-bell-toll', talk: 'sfx-talk-elder', tick: 'sfx-text-tick-v5', confirm: 'sfx-ui-confirm-v4', waveClear: 'sfx-wave-clear', bodyFall: 'sfx-body-fall', armorFall: 'sfx-armor-fall',
  chime: 'sfx-oneshot-kite-chime', bird: 'sfx-oneshot-kite-bird', gameover: 'sfx-gameover', pauseOpen: 'sfx-pause-open', pauseClose: 'sfx-pause-close', victory: 'sfx-victory-breath',
  sting: 'sfx-sting', switch: 'sfx-wheel-spin', skid: 'sfx-skid', thud: 'sfx-thud-wall', gate: 'sfx-gate-slam',
  // v2 (ElevenLabs, picked with earshot: assets/audio/SFX-NOTES.md)
  jingle: ['sfx4-ring-jingle-1', 'sfx4-ring-jingle-2', 'sfx4-ring-jingle-3'], staffWhoosh: 'sfx4-staff-whoosh', staffWhooshHeavy: 'sfx4-staff-whoosh-heavy',
  staffHit: ['sfx4-staff-hit-1', 'sfx4-staff-hit-2'], staffHitHeavy: 'sfx4-staff-hit-heavy', parry: 'sfx4-parry', block: 'sfx4-block',
  sigGold: 'sfx4-signal-gold', sigRed: 'sfx4-signal-red', staffDraw: 'sfx4-staff-draw', attune: 'sfx5-attune', unlock: 'sfx4-unlock',
  windStep: 'sfx4-wind-step', gustShot: 'sfx4-gust-shot', palmGust: 'sfx5-palm-gust', takedown: 'sfx4-takedown', dazed: 'sfx4-dazed',
  bead: 'sfx4-bead', wheelSpin: 'sfx4-wheel-spin', gateWinch: 'sfx4-gate-winch', chime1: 'sfx4-chime-1', chime2: 'sfx4-chime-2', chime3: 'sfx4-chime-3',
  chestOpen: 'sfx4-chest-open', cloudPuff: 'sfx5-cloud-puff', shieldBlock: 'sfx4-shield-block', glaiveSwing: 'sfx4-glaive-swing',
  menuMove: 'sfx4-menu-move', menuConfirm: 'sfx4-menu-confirm', menuBack: 'sfx4-menu-back', heartGain: 'sfx4-heart-gain',
  // v4 soldiers (ElevenLabs, best of 3 by earshot rank, z +5.2)
  fireWhip: 'sfx6-fire-whip',
  // v5 (ElevenLabs, picked with earshot rank: tell z +2.5 of 3, whooshes z +5.5/+4.2/+3.3 all 'strong')
  parryTell: 'sfx7-parry-tell',
  // v6 (ElevenLabs, 3 takes each, earshot rank: p2 'a man shouting' z +5.9 (the z +6.9 take read as 'a cow mooing'), p3 z +7.1)
  captainRoarP2: 'sfx8-captain-roar-p2', captainRoarP3: 'sfx8-captain-roar-p3', fireWhoosh: ['sfx7-fire-whoosh-1', 'sfx7-fire-whoosh-2', 'sfx7-fire-whoosh-3'],
  // v7 note 41 (ElevenLabs, 5-7 takes each, earshot rank: form z +3.2, throw z +4.1, shatter z +5.8; trimmed to t=0)
  icicleForm: 'sfx9-icicle-form', icicleThrow: 'sfx9-icicle-throw', icicleShatter: 'sfx9-icicle-shatter',
};
const VOL = { icicleForm: 0.95, icicleThrow: 1.0, icicleShatter: 1.0, captainRoarP2: 0.75, captainRoarP3: 0.8, parryTell: 0.75, fireWhoosh: 0.6, step: 0.28, soldierStep: 0.2, tick: 0.25, switch: 0.35, land: 0.55, swing: 0.5, bell: 1.0, captainRoar: 0.9,
  jingle: 0.45, staffWhoosh: 0.7, staffWhooshHeavy: 0.75, staffHit: 0.9, staffHitHeavy: 0.95, parry: 0.9, block: 0.85, sigGold: 0.7, sigRed: 0.75,
  attune: 0.55, unlock: 0.5, palmGust: 0.55, chime1: 0.35, chime2: 0.6, chime3: 0.6, menuMove: 0.45, menuConfirm: 0.4, menuBack: 0.45, heartGain: 0.5, bead: 0.6, dazed: 0.6, staffDraw: 0.95, cloudPuff: 1.6, jump: 0.9 };   // v3: cloud-puff is ~4 LU quieter than the old file
const MUSIC = { hill: 'music-kite-hill', captain: 'music-captain', ending: 'music-ending', title: 'music-title' };

export const Audio = {
  ctx: null, buffers: {}, master: null, sfxBus: null, musicBus: null, log: [], listener: { x: 0, y: 0, z: 0, yaw: 0 }, cur: null, muted: false,
  async init() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.42; this.musicBus.connect(this.master);
    const files = new Set();
    for (const v of Object.values(SFX)) (Array.isArray(v) ? v : [v]).forEach((f) => files.add(f));
    for (const f of Object.values(MUSIC)) files.add(f);
    files.add('sfx3-ambience-wind');   // planner 11:40: the old 2D loop had breaths and thuds in it (Connor heard "grunting")
    await Promise.all([...files].map(async (f) => {
      try { const r = await fetch(A + f + '.mp3'); const ab = await r.arrayBuffer(); this.buffers[f] = await ctx.decodeAudioData(ab); } catch { /* missing file: silent */ }
    }));
  },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); },
  get running() { return !!this.ctx && this.ctx.state === 'running'; },
  play(name, o = {}) {
    if (this.log.length > 2000) this.log.shift();
    let f = SFX[name]; if (Array.isArray(f)) f = f[(Math.random() * f.length) | 0];
    // v6: [name, start time incl. delay, file, gain] so test recordings can rebuild the soundtrack offline
    this.log.push([name, performance.now() / 1000 + (o.delay || 0), f, +((o.vol ?? 1) * (VOL[name] ?? 0.8)).toFixed(3)]);
    if (!this.ctx) return;
    const buf = this.buffers[f]; if (!buf) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = (o.rate || 1) * (1 + (o.vary ?? 0.06) * (Math.random() * 2 - 1));
    const g = this.ctx.createGain();
    let vol = (o.vol ?? 1) * (VOL[name] ?? 0.8);
    let node = g;
    if (o.at) {
      const L = this.listener, dx = o.at.x - L.x, dz = o.at.z - L.z, d = Math.hypot(dx, o.at.y - L.y, dz);
      vol *= Math.min(1, 7 / Math.max(7, d)) ** 1.2;
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        const side = Math.cos(L.yaw) * dx - Math.sin(L.yaw) * dz;   // + right
        p.pan.value = Math.max(-0.7, Math.min(0.7, side / Math.max(4, d)));
        g.connect(p); node = p;
      }
    }
    g.gain.value = vol;
    src.connect(g); node.connect(this.sfxBus);
    src.start(this.ctx.currentTime + (o.delay || 0));
    return src;
  },
  music(name, fade = 1.5) {
    if (!this.ctx || this.cur?.name === name) return;
    const t = this.ctx.currentTime;
    if (this.cur) { const c = this.cur; c.g.gain.cancelScheduledValues(t); c.g.gain.setValueAtTime(c.g.gain.value, t); c.g.gain.linearRampToValueAtTime(0, t + fade); setTimeout(() => { try { c.src.stop(); } catch {} }, fade * 1000 + 100); }
    this.cur = null;
    const buf = this.buffers[MUSIC[name]]; if (!buf) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = name !== 'ending';
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fade);
    src.connect(g); g.connect(this.musicBus); src.start();
    this.cur = { name, src, g };
  },
  duck(amount = 0.4, time = 1.5) {
    if (!this.ctx) return; const t = this.ctx.currentTime, gm = this.musicBus.gain;
    gm.cancelScheduledValues(t); gm.setValueAtTime(gm.value, t); gm.linearRampToValueAtTime(0.42 * amount, t + 0.1); gm.linearRampToValueAtTime(0.42, t + time);
  },
  ambience() {
    if (!this.ctx || this.amb) return; const buf = this.buffers['sfx3-ambience-wind']; if (!buf) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true; const g = this.ctx.createGain(); g.gain.value = 0.9;
    src.connect(g); g.connect(this.master); src.start(); this.amb = src;
  },
  setRate(r) { /* slow-motion pitch on music */ if (this.cur) this.cur.src.playbackRate.value = 0.75 + 0.25 * r; },
};
