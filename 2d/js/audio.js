// Web Audio: music, ambience and SFX buses with their own volumes.
// Files come from assets/derived/audio/ (level-matched copies made by tools/normalize-audio.sh;
// the originals in assets/audio/ are the fallback). Gaps are filled by procedural sounds
// (js/synth.js). Music loops by scheduling the next copy on the audio clock and crossfading;
// changing tracks crossfades too. SFX get a slight random pitch so repeats don't sound stamped.
// Everything here is a no-op without Web Audio, so the game also runs headless.
import { renderSynth } from './synth.js';
import { MIX12 } from './data/mix-c12.js';
import { REL, RELMAN, loadWebpIndex } from './assets.js';

const DIRS = ['assets/derived/audio/', 'assets/audio/'];
const PREFS_KEY = 'elementbound-mv-audio-v3';
const XFADE = 1.6;      // seconds, track changes
const LOOP_XF = 0.6;    // seconds, loop seam

// The one place loudness is balanced (files are all peak -3 dB, music -16 LUFS).
const SFX_VOL = {
  'punch-hit': 0.35, jump: 0.45, land: 0.5, dash: 0.55, 'player-hurt': 0.75, 'enemy-fireball': 0.45, 'enemy-defeat': 0.6,
  'wisp-pickup': 0.35, 'branch-burn': 0.6, 'floor-break': 0.75, shrine: 0.7, meditation: 0.6, 'ui-move': 0.3, 'ui-confirm': 0.45,
  'colossus-roar': 0.7, 'warden-cry': 0.7, 'stone-wall': 0.7, 'ice-wall': 0.6, 'earth-slam': 0.85, gust: 0.65, whip: 0.6, deflect: 0.6,
  'fire-blast': 0.6, 'flame-ring': 0.55,
  // synth
  hit: 0.85, 'hit-heavy': 0.95, swing: 0.35, 'swing-big': 0.45, 'step-stone': 0.22, 'step-wood': 0.25, 'step-gravel': 0.22, 'step-water': 0.3, 'step-metal': 0.16,
  talk: 0.22, 'no-breath': 0.5, 'map-open': 0.35, 'map-close': 0.3, door: 0.6, shutter: 0.65, wheel: 0.5, gate: 0.7, splash: 0.5, clank: 0.6,
  mace: 0.7, 'bow-draw': 0.45, arrow: 0.45, 'arrow-hit': 0.5, growl: 0.55, bark: 0.5, skid: 0.4, snap: 0.6, chitter: 0.35, roll: 0.4, 'thud-wall': 0.55,
  flutter: 0.3, shriek: 0.4, pounce: 0.5, petal: 0.6, pearl: 0.6, bloom: 0.5, piece: 0.55, bead: 0.35, heal: 0.6, focus: 0.4, knockout: 0.7, lowhp: 0.35,
  barrier: 0.7, 'wave-clear': 0.6, save: 0.55, fanfare: 0.6, ledge: 0.45, climb: 0.35, slide: 0.3, walljump: 0.45, parry: 0.75, block: 0.6,
  sting: 0.8, phase: 0.8, 'boss-defeat': 0.85, gameover: 0.6, 'slam-rise': 0.5, burn: 0.4, jump2: 0.45,
  // cycle 4: recorded (ElevenLabs) sounds for events that were silent or borrowed
  'room-wipe': 0.28, 'respawn-wake': 0.55, 'cutscene-page': 0.4, 'text-tick': 0.2, 'ice-shatter': 0.5, 'stone-crumble': 0.95,
  'soldier-step': 0.16, 'hound-paws': 0.22, 'soldier-hurt': 0.45, 'soldier-defeat': 0.55, 'overseer-roar': 0.75, 'overseer-vent': 0.6,
  'floor-vent-fire': 0.5, 'captain-intro': 0.7, 'captain-slash': 0.5, 'captain-dash': 0.6, 'spout-warn': 0.4, 'water-spout': 0.55,
  'wave-slam': 0.6, 'boulder-impact': 0.5, 'fireball-impact': 0.35, 'wind-road': 0.8, pin: 0.7, 'skill-learn': 0.6, 'shop-buy': 0.75,
  'region-card': 0.4, 'boss-card': 0.7, 'phase-change': 0.75, 'boss-defeat-rec': 0.8, 'heal-breath': 0.45, 'knockout-rec': 0.6,
  'parry-rec': 0.65, 'guard-break': 0.6, 'downstrike-bounce': 0.45, 'wall-kick': 0.4, 'ledge-grab': 0.6, 'jade-pickup': 0.3,
  'lotus-petal': 0.6, 'door-slide': 0.5, 'brass-gate-open': 0.75, 'wheel-spin': 0.5, 'shutter-open': 0.8, 'splash-rec': 0.5,
  'swing-rec': 0.3, 'swing-heavy': 0.4, 'punch-hit-2': 0.4, 'punch-hit-3': 0.5,
  // cycle 5: recorded files for every event that was still synth (loudness-matched copies in
  // assets/derived/audio, one-shots about -18 to -22 LUFS, UI -24, beds -26), so these levels
  // only say how prominent each event should be.
  'step-stone': 0.32, 'step-wood': 0.34, 'step-gravel': 0.3, 'step-water': 0.36, 'step-metal': 0.26,
  hit: 0.55, 'hit-heavy': 0.7, talk: 0.32, 'ui-move': 0.4, dash: 0.5, jump2: 0.45, 'land-hard': 0.7,
  heal: 0.6, focus: 0.45, lowhp: 0.5, 'no-breath': 0.5, climb: 0.45, skid: 0.4, 'slam-rise': 0.5, block: 0.6, burn: 0.4,
  mace: 0.6, 'bow-draw': 0.45, arrow: 0.45, 'arrow-hit': 0.5, growl: 0.5, bark: 0.42, pounce: 0.5, snap: 0.55, chitter: 0.4,
  'thud-wall': 0.55, flutter: 0.35, shriek: 0.4, clank: 0.5, barrier: 0.7, gate: 0.7, 'wave-clear': 0.6, save: 0.55,
  fanfare: 0.6, sting: 0.75, gameover: 0.6, 'map-open': 0.5, 'map-close': 0.45, pearl: 0.6, bloom: 0.5, piece: 0.55,
};
// The cycle-5 re-recordings (the old files were too quiet or started late) under -v5 names.
for (const [k, v] of Object.entries({ 'stone-crumble': 0.7, 'text-tick': 0.3, 'ledge-grab': 0.55, ledge: 0.5, pin: 0.6, 'shop-buy': 0.65, 'shutter-open': 0.7, shutter: 0.65,
  'wind-road': 0.7, knockout: 0.7, 'knockout-rec': 0.6, parry: 0.75, 'parry-rec': 0.65, 'wall-kick': 0.5, walljump: 0.5, 'ice-wall': 0.6, phase: 0.7, 'phase-change': 0.7 })) SFX_VOL[k] = v;
// Recorded replacements made in cycle 4 (the v3 files were thin); same event names.
// Name -> file name (without sfx- and .mp3).
const ALIAS = {
  whip: 'whip-v4', 'wisp-pickup': 'wisp-pickup-v4', 'ui-confirm': 'ui-confirm-v4', 'enemy-defeat': 'enemy-defeat-v4', 'player-hurt': 'player-hurt-v4b', land: 'land-v4',
  bead: 'jade-pickup', walljump: 'wall-kick', ledge: 'ledge-grab', door: 'door-slide', wheel: 'wheel-spin', shutter: 'shutter-open',
  'swing-big': 'swing-heavy', petal: 'lotus-petal', phase: 'phase-change',
  'boss-defeat-rec': 'boss-defeat', 'knockout-rec': 'knockout-v5', 'parry-rec': 'parry-v5', 'splash-rec': 'splash', 'swing-rec': 'swing',
  // cycle 5 re-recordings
  dash: 'dash-v5', 'ui-move': 'ui-move-v5', 'ice-wall': 'ice-wall-v5', phase: 'phase-change-v5', 'phase-change': 'phase-change-v5',
  'stone-crumble': 'stone-crumble-v5', 'text-tick': 'text-tick-v5', ledge: 'ledge-grab-v5', 'ledge-grab': 'ledge-grab-v5', pin: 'pin-v5',
  'shop-buy': 'shop-buy-v5', shutter: 'shutter-open-v5', 'shutter-open': 'shutter-open-v5', 'wind-road': 'wind-road-v5',
  knockout: 'knockout-v5', parry: 'parry-v5', walljump: 'wall-kick-v5', 'wall-kick': 'wall-kick-v5',
};
const C5 = ['step-stone', 'step-wood', 'step-gravel', 'step-water', 'step-metal', 'hit', 'hit-heavy', 'talk', 'jump2', 'land-hard',
  'heal', 'focus', 'lowhp', 'no-breath', 'climb', 'skid', 'slam-rise', 'block', 'burn', 'glide-loop', 'slide-loop',
  'mace', 'bow-draw', 'arrow', 'arrow-hit', 'growl', 'bark', 'pounce', 'snap', 'chitter', 'roll-loop', 'thud-wall', 'flutter', 'shriek', 'clank',
  'barrier', 'gate', 'wave-clear', 'save', 'fanfare', 'sting', 'gameover', 'map-open', 'map-close', 'pearl', 'bloom', 'piece', 'ambience-shrine'];
// Cycle 6: this cycle's recordings (assets/derived/audio, -18 to -24 LUFS) and how loud each event sits.
const C6 = ['reed-creak', 'reed-sink', 'colossus-crumble', 'armor-fall', 'armor-kneel', 'boss-windup-heavy', 'boss-windup-fire', 'boss-windup-blade',
  'captain-leap', 'captain-land', 'boulder-throw', 'quake-warning', 'boss-step-heavy', 'boss-step-armor', 'turn-skid', 'wall-grab', 'glide-open',
  'water-enter', 'water-exit', 'pause-open', 'pause-close', 'tab-switch', 'equip-set', 'gate-slam', 'gate-open', 'step-stone-1', 'step-stone-2', 'ice-shatter-v6'];
Object.assign(SFX_VOL, {
  'reed-creak': 0.75, 'reed-sink': 0.75, 'colossus-crumble': 0.85, 'armor-fall': 0.8, 'armor-kneel': 0.7, 'boss-windup-heavy': 0.6, 'boss-windup-fire': 0.6,
  'boss-windup-blade': 0.5, 'captain-leap': 0.55, 'captain-land': 0.7, 'boulder-throw': 0.6, 'quake-warning': 0.75, 'boss-step-heavy': 0.5, 'boss-step-armor': 0.45,
  'turn-skid': 0.42, 'wall-grab': 0.5, 'glide-open': 0.5, 'water-enter': 0.55, 'water-exit': 0.5, 'pause-open': 0.5, 'pause-close': 0.45, 'tab-switch': 0.5,
  'equip-set': 0.5, 'gate-slam': 0.85, 'gate-open': 0.7, 'step-stone-1': 0.36, 'step-stone-2': 0.36,
});
ALIAS['ice-shatter'] = 'ice-shatter-v6';
// Cycle 7: this cycle's recordings (review 7 sound list S1 to S15).
const C7 = ['drop-through', 'satchel-drop', 'satchel-recover', 'shop-open', 'shop-deny', 'toast', 'victory-breath', 'elder-arrive',
  'soldier-alert', 'ice-knock'];   // v8: the kite takes are no longer used (no kite)
Object.assign(SFX_VOL, {
  'drop-through': 0.5, 'satchel-drop': 0.6, 'satchel-recover': 0.7, 'shop-open': 0.55, 'shop-deny': 0.55, toast: 0.5,
  'victory-breath': 0.75, 'elder-arrive': 0.6, 'kite-open': 0.6, 'soldier-alert': 0.55, 'ice-knock': 0.7,
});
// Cycle 8: this cycle's recordings (review 8 sound list 1 to 19). There is no kite: the glide opens with a push
// of air from the palms and holds the plain wind loop again (sfx-glide-loop).
const C8 = ['glide-push', 'flip', 'body-bump', 'body-fall', 'talk-young', 'talk-elder', 'talk-armor', 'banner', 'furnace-door'];
Object.assign(SFX_VOL, {
  'glide-push': 0.55, 'glide-open': 0.55, flip: 0.7, 'body-bump': 0.45, 'body-fall': 0.7, 'talk-young': 0.42, 'talk-elder': 0.45, 'talk-armor': 0.5,
  banner: 0.5, 'furnace-door': 0.8,
});
ALIAS['glide-open'] = 'glide-push';
// Cycle 9: review 9's sound list (1 to 8) and the sounds Connor's playtest notes call for (bell, chimes, hearts, shop, guide wisp).
const C9 = ['wave-spawn', 'colossus-stagger', 'glide-close', 'captain-skid', 'spike-hit', 'fire-scorch', 'run-stop', 'enemy-shove',
  'bell-ring', 'chimes-spin', 'heart-break', 'heart-fill', 'bead-count', 'shop-fly', 'scroll-unroll', 'wisp-guide'];
Object.assign(SFX_VOL, {
  'wave-spawn': 0.69, 'colossus-stagger': 0.97, 'glide-close': 0.52, 'captain-skid': 0.74, 'spike-hit': 1, 'fire-scorch': 0.74, 'run-stop': 0.53,
  'enemy-shove': 0.44, 'bell-ring': 0.9, 'chimes-spin': 0.7, 'heart-break': 1, 'heart-fill': 0.7, 'bead-count': 0.63, 'shop-fly': 0.63,
  'scroll-unroll': 0.65, 'wisp-guide': 0.5,
});
// Cycle 10: Connor's round-2 notes (the attunement, the new foes, the sprint, the aimed deflect, Still Breath on △, the
// full rest) and review 10's sound list: replacements for the weak matches, a sound per strike direction, gates and
// passages, layered bending and a phase sound per element. Files in assets/derived/audio, -19 to -24 LUFS.
const C10 = ['attune-pulse', 'attune-burst', 'power-gong', 'dash-through', 'sprint-skid', 'sprint-start', 'deflect-catch', 'deflect-release',
  'deflect-miss', 'parasol-clang', 'parasol-off', 'hook-parry', 'hook-lunge', 'fire-flask-throw', 'ground-fire', 'pot-lob', 'pot-shatter',
  'heal-tick', 'rest-chime', 'breath-gain', 'enemy-turn', 'swing-up', 'swing-diag', 'swing-down', 'gate-sluice', 'passage-stair', 'passage-arch',
  'phase-water', 'phase-earth', 'phase-fire', 'phase-brass', 'attune-drone-loop', 'ground-fire-loop'];
Object.assign(SFX_VOL, {
  'attune-pulse': 0.7, 'attune-burst': 0.9, 'power-gong': 0.95, 'dash-through': 0.55, 'sprint-skid': 0.6, 'sprint-start': 0.45, 'deflect-catch': 0.85,
  'deflect-release': 0.85, 'deflect-miss': 0.5, 'parasol-clang': 0.85, 'parasol-off': 0.8, 'hook-parry': 0.75, 'hook-lunge': 0.6, 'fire-flask-throw': 0.55,
  'ground-fire': 0.6, 'pot-lob': 0.55, 'pot-shatter': 0.85, 'heal-tick': 0.6, 'rest-chime': 0.75, 'breath-gain': 0.45, 'enemy-turn': 0.45,
  'swing-up': 0.35, 'swing-diag': 0.3, 'swing-down': 0.4, 'gate-sluice': 0.8, 'passage-stair': 0.75, 'passage-arch': 0.8,
  'phase-water': 0.85, 'phase-earth': 0.85, 'phase-fire': 0.85, 'phase-brass': 0.85,
});
const LOOP_VOL_C10 = { 'attune-drone-loop': 0.45, 'ground-fire-loop': 0.32 };
// review 10's replacements (earshot match against each job, z in CHANGELOG): same event names, new files
Object.assign(ALIAS, {
  dash: 'dash-v10', jump: 'jump-v10', land: 'land-v10', hit: 'hit-v10', 'punch-hit': 'punch-hit-v10', 'punch-hit-2': 'punch-hit-2-v10',
  'punch-hit-3': 'punch-hit-3-v10', 'downstrike-bounce': 'downstrike-bounce-v10', deflect: 'deflect-v10', ledge: 'ledge-grab-v10',
  'ledge-grab': 'ledge-grab-v10', 'wall-grab': 'wall-grab-v10', walljump: 'wall-kick-v10', 'wall-kick': 'wall-kick-v10',
  'enemy-defeat': 'enemy-defeat-v10', heal: 'heal-v10', 'bell-ring': 'bell-ring-v10', gust: 'gust-v10', whip: 'whip-v10',
  'earth-slam': 'earth-slam-v10', 'stone-wall': 'stone-wall-v10', 'fire-blast': 'fire-blast-v10', 'flame-ring': 'flame-ring-v10',
  'ice-wall': 'ice-wall-v10', 'map-ink': 'scroll-unroll',
});
// the new files are level-matched, so the old per-file trims for these events no longer apply
// Random distant one-shots between the beds' steady sound, per region (8 to 20 s apart, about -34, placed left or right).
const ONESHOTS = {
  kite: ['oneshot-kite-chime', 'oneshot-kite-bird'], drowned: ['oneshot-drowned-frog', 'oneshot-drowned-drip'],
  quarry: ['oneshot-quarry-pick', 'oneshot-quarry-rockfall'], kiln: ['oneshot-kiln-hammer', 'oneshot-kiln-pop'],
  brass: ['oneshot-brass-drum', 'oneshot-brass-chain'],
};
for (const l of Object.values(ONESHOTS)) for (const n of l) SFX_VOL[n] = 0.4;
// v6 mix: review 6 measured every event's effective level (file loudness + play volume) and found a
// 26 dB spread. This trims each event into its band (one-shot moves -24 to -28, impacts -21 to -24,
// boss cries -19 to -21, loops -30 to -34, UI -28 to -30). dB on top of SFX_VOL / LOOP_VOL.
const TRIM_DB = {
  'room-wipe': 7.6, 'boulder-impact': 12.8, 'ui-move': 3.7, land: 4.7, 'fireball-impact': 7.7, 'map-open': 3, 'map-close': 3,
  swing: 5.9, 'swing-rec': 5.9, walljump: 4.9, 'wall-kick': 4.9, 'enemy-defeat': 6.5, 'overseer-roar': -2.5, 'colossus-roar': -0.7, 'captain-dash': -3,
  'player-hurt': -1.6, 'earth-slam': -0.9, 'floor-vent-fire': -2.9,
  'slide-loop': 9, 'glide-loop': 6, 'roll-loop': 6.8, 'waterfall-loop': -6.1,
  // v7 (review 7 #1): the hero's own hits were 8 to 11 dB under the music. Every impact now lands in -21 to -24,
  // the combo finisher loudest; the whip and the stone wall come down out of boss-roar territory.
  'punch-hit': 7, 'punch-hit-2': 7.5, 'punch-hit-3': 11.5, hit: 4.5, 'swing-big': 5, 'land-hard': 5.5, 'downstrike-bounce': 6,
  'guard-break': 6.5, splash: 5, 'stone-crumble': 5, 'quake-warning': 5, 'wall-grab': 4.5, 'turn-skid': 3, 'boss-step-armor': 5,
  'hound-paws': 4, 'branch-burn': 4, 'brass-gate-open': 4, whip: -4.5, 'stone-wall': -4,
  'step-stone': 3.5, 'step-stone-1': 3.5, 'step-stone-2': 3.5, 'step-wood': 3, 'step-gravel': 4, 'step-water': 3, 'step-metal': 4,
  // v7 recordings (assets/derived/audio)
  'ice-knock': 3.5, toast: 6,
  // v8 (review 8 #11): the Warden's warnings sit above the music; quiet UI and steps come up into their bands
  'spout-warn': 7, 'reed-creak': 5, 'soldier-step': 16, 'pause-open': 4, 'pause-close': 4, 'tab-switch': 3.5, 'region-card': 3,
  'ui-confirm': 2.5, 'wisp-pickup': 2.5, flip: 3, banner: 2,
  // v9 (review 9 sound list): quiet outliers lifted into their bands
  'shop-deny': 3, burn: 4, 'arrow-hit': 3, 'soldier-hurt': 2, 'equip-set': 2, 'elder-arrive': 3, 'fire-hazard-loop': 2,
};
TRIM_DB['glide-loop'] += 3;
// v10: the replacement files are level-matched, so the old per-file trims for these events no longer apply
for (const k of ['land', 'hit', 'punch-hit', 'punch-hit-2', 'punch-hit-3', 'downstrike-bounce', 'walljump', 'wall-kick', 'wall-grab', 'enemy-defeat', 'whip', 'stone-wall', 'earth-slam']) delete TRIM_DB[k];
// v11 (review 11, audio): the Colossus fight pushed hardest into the limiter (390 clipped samples): its three loudest down 2 dB
for (const k of ['colossus-roar', 'boulder-impact', 'earth-slam']) TRIM_DB[k] = (TRIM_DB[k] || 0) - 2;
const AMB_BUS = 1.58;
const HIT_FAMILY = new Set(['hit', 'hit-heavy', 'punch-hit', 'punch-hit-2', 'punch-hit-3', 'soldier-hurt', 'block', 'clank', 'hook-parry', 'parasol-clang']);
const STEPS = /^(step-|soldier-step|hound-paws)/;
// v12 (Connor's note 30): the last word on loudness. tools/c12/mix.py measured every event's effective level with earshot
// (file LUFS + play volume + trims) and put each inside its category's band (js/data/mix-c12.js); dB on top of the rest.
// v12 (note 30): the music bus sits 2.5 dB lower (calm play measured music at about -17.6 LUFS out; Connor's target is -20)
const MUSIC_K = 0.6;
const trim = (name) => Math.pow(10, ((TRIM_DB[name] || 0) + (MIX12[name] || 0)) / 20);
// Loops: the file's tail is crossfaded (equal power, 0.3 s) into its head once, so the wrap has no
// gap or click (MP3 padding left a short hole at each seam with plain src.loop).
const SEAMLESS = new WeakMap();
function seamless(ctx, buf, xf = 0.3) {
  if (!buf) return buf;
  if (SEAMLESS.has(buf)) return SEAMLESS.get(buf);
  const n = Math.floor(xf * buf.sampleRate);
  if (buf.length < n * 3) { SEAMLESS.set(buf, buf); return buf; }
  const len = buf.length - n, out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const a = buf.getChannelData(c), o = out.getChannelData(c);
    o.set(a.subarray(0, len));
    for (let i = 0; i < n; i++) { const k = i / n; o[i] = a[i] * Math.sin(k * Math.PI / 2) + a[len + i] * Math.cos(k * Math.PI / 2); }
  }
  SEAMLESS.set(buf, out);
  return out;
}
// Cycle 11: review 11's sound list (ElevenLabs, 3+ takes each, picked by earshot match; prompts and scores in
// tools/sfx-c11/STATUS.md). Replacements for the "no" and "weak" matches keep their event names; new events below.
Object.assign(ALIAS, {
  dash: 'dash-v11', jump: 'jump-v11', 'downstrike-bounce': 'downstrike-bounce-v11', ledge: 'ledge-grab-v11', 'ledge-grab': 'ledge-grab-v11',
  'swing-up': 'swing-up-v11', 'stone-wall': 'stone-wall-v11', 'ice-wall': 'ice-wall-v11', 'parasol-clang': 'parasol-clang-v11',
  'fire-flask-throw': 'fire-flask-throw-v11', 'ground-fire': 'ground-fire-v11', 'pot-shatter': 'pot-shatter-v11', 'pot-lob': 'pot-lob-v11',
  'rest-chime': 'rest-chime-v11', 'heal-tick': 'heal-tick-v11', 'attune-pulse': 'attune-pulse-v11', 'sprint-start': 'sprint-start-v11',
  'deflect-miss': 'deflect-miss-v11',
  // kept: dash-through (no take beat the v10 file) and breath-gain (the v10 file matched better, +4.3 against +3.3)
});
const C11 = ['barrier-refuse-thorn', 'barrier-refuse-stone', 'barrier-refuse-water', 'parasol-open', 'parasol-ram', 'pot-whistle', 'hook-step',
  'sprint-step-1', 'sprint-step-2', 'air-hang', 'post-rise', 'sign-creak', 'boss-flinch', 'enemy-idle-shift'];
Object.assign(SFX_VOL, {
  'barrier-refuse-thorn': 0.7, 'barrier-refuse-stone': 0.7, 'barrier-refuse-water': 0.7, 'parasol-open': 0.6, 'parasol-ram': 0.7, 'pot-whistle': 0.5,
  'hook-step': 0.4, 'sprint-step-1': 0.38, 'sprint-step-2': 0.38, 'air-hang': 0.45, 'post-rise': 0.75, 'sign-creak': 0.4, 'boss-flinch': 0.75,
  'enemy-idle-shift': 0.28,
});
ONESHOTS.quarry = ['oneshot-quarry-pick', 'oneshot-quarry-rockfall-v11']; ONESHOTS.kiln = ['oneshot-kiln-hammer', 'oneshot-kiln-pop-v11'];
ONESHOTS.drowned = ['oneshot-drowned-frog', 'oneshot-drowned-drip', 'oneshot-drowned-heron-v11'];
for (const n of ['oneshot-quarry-rockfall-v11', 'oneshot-kiln-pop-v11', 'oneshot-drowned-heron-v11']) SFX_VOL[n] = 0.4;
// Cycle 12: Connor's round-4 notes. The Rime Warden and its melting ice, the soldiers' guard, the hazard respawn, the
// drowning foe, the kiln vents and a new updraft bed. Files level-matched in assets/derived/audio (tools/normalize-audio-c12.sh).
const C12 = ['ice-crack', 'ice-break', 'ice-reform', 'rime-slam', 'ice-spike-wave', 'icicle-warn', 'icicle-fall', 'rime-cry', 'rime-rise',
  'rime-defeat', 'rime-sweep', 'frozen-wave', 'guard-raise', 'guard-counter', 'player-recoil', 'tile-crumble', 'hazard-respawn', 'enemy-drown',
  'vent-burst'];
Object.assign(SFX_VOL, {
  'ice-crack': 0.75, 'ice-break': 0.8, 'ice-reform': 0.55, 'rime-slam': 0.9, 'ice-spike-wave': 0.8, 'icicle-warn': 0.7, 'icicle-fall': 0.75,
  'rime-cry': 0.85, 'rime-rise': 0.85, 'rime-defeat': 0.9, 'rime-sweep': 0.75, 'frozen-wave': 0.85, 'guard-raise': 0.7, 'guard-counter': 0.7,
  'player-recoil': 0.65, 'tile-crumble': 0.65, 'hazard-respawn': 0.6, 'enemy-drown': 0.7, 'vent-burst': 0.7,
});
ALIAS['updraft-loop'] = 'updraft-loop-v12';
// Cycle 13: the impact frame's sting (ElevenLabs, best of 4 by earshot rank, -18.4 LUFS level-matched).
const C13 = ['impact-frame', 'aa-tell'];   // v14: the anti-air tell (note 53), ElevenLabs, ranked best of 3 by earshot (z +4.0), -22 LUFS
SFX_VOL['impact-frame'] = 0.8;
// Cycle 15 (the sound pass: "every time anything happens... pretty chill and not super loud"): the Round 6 sprite effects'
// own sounds. ElevenLabs, 3 to 5 takes each, best by earshot rank, trimmed to the key frame and level-matched (-20 to -23 LUFS,
// tools/normalize-audio-c15.sh; takes and scores in tools/sfx-c15/, notes in tools/c15/NOTES-sound.md). Played under the music.
const C15 = ['warden-cast-ground', 'warden-cast-sky', 'warden-cast-rush', 'crystal-rush', 'frost-crack', 'slab-melt', 'arch-open', 'pot-throw',
  'pot-burst', 'aa-thrust', 'aa-fire', 'heal-ring', 'post-hit'];
Object.assign(SFX_VOL, {
  'warden-cast-ground': 0.75, 'warden-cast-sky': 0.8, 'warden-cast-rush': 0.75, 'crystal-rush': 0.75, 'frost-crack': 0.6, 'slab-melt': 0.7,
  'arch-open': 0.75, 'pot-throw': 0.55, 'pot-burst': 0.65, 'aa-thrust': 0.6, 'aa-fire': 0.6, 'heal-ring': 0.6, 'post-hit': 0.6,
});
// Cycle 16 (Connor's notes 73, 75): the side gate sliding up and each guardian's new phase beat. ElevenLabs, 3 takes each,
// best by earshot rank (tools/sfx-c16/rank.out), level-matched by tools/normalize-audio-c16.sh.
const C16 = ['side-gate', 'colossus-phase', 'overseer-phase', 'captain-phase'];
Object.assign(SFX_VOL, { 'side-gate': 0.6, 'colossus-phase': 0.7, 'overseer-phase': 0.65, 'captain-phase': 0.65 });
const fileOf = (name) => 'sfx-' + (ALIAS[name] || name);
// v15 (the chill pass): per-name minimum gaps between starts for the events that can fire in bursts, and the small
// one-shots that give way first when many voices are already ringing
const GAP15 = { hit: 0.05, 'hit-heavy': 0.06, 'ice-crack': 0.06, 'frost-crack': 0.08, 'ice-reform': 0.06, 'stone-crumble': 0.08, 'thud-wall': 0.08,
  clank: 0.06, 'enemy-fireball': 0.08, 'fireball-impact': 0.06, burn: 0.1, 'ice-knock': 0.06, 'arrow-hit': 0.06, 'heal-tick': 0.1, 'swing': 0.05 };
// v15: seconds of lead-in skipped so the sound's attack meets its key frame (the gust's push leaves the palm at 0.16 s but
// its file swells to half level at 0.37 s; the deflect, the flame ring and the slam's rise all start on the frame they are cast)
const SKIP15 = { gust: 0.2, deflect: 0.14, 'flame-ring': 0.1, 'slam-rise': 0.14 };
const LOW15 = new Set(['enemy-idle-shift', 'chitter', 'flutter', 'burn', 'breath-gain', 'enemy-turn', 'text-tick', 'talk', 'sign-creak', 'body-bump', 'air-hang']);
// Loaded as soon as audio starts, so the first play is never silent.
const PRELOAD = ['jump', 'dash', 'punch-hit', 'gust', 'deflect', 'ice-wall', 'earth-slam', 'stone-wall', 'fire-blast', 'flame-ring', 'enemy-fireball',
  'branch-burn', 'floor-break', 'shrine', 'meditation', 'colossus-roar', 'warden-cry', ...Object.keys(ALIAS),
  ...['room-wipe', 'respawn-wake', 'cutscene-page', 'text-tick', 'ice-shatter', 'stone-crumble', 'soldier-step', 'hound-paws', 'soldier-hurt',
    'soldier-defeat', 'overseer-roar', 'overseer-vent', 'floor-vent-fire', 'captain-intro', 'captain-slash', 'captain-dash', 'spout-warn',
    'water-spout', 'wave-slam', 'boulder-impact', 'fireball-impact', 'wind-road', 'pin', 'skill-learn', 'shop-buy', 'region-card', 'boss-card',
    'phase-change', 'heal-breath', 'guard-break', 'downstrike-bounce', 'wall-kick', 'ledge-grab', 'jade-pickup', 'lotus-petal', 'door-slide',
    'brass-gate-open', 'wheel-spin', 'shutter-open', 'swing-heavy', 'punch-hit-2', 'punch-hit-3',
    'updraft-loop', 'waterfall-loop', 'furnace-loop', 'fire-hazard-loop', 'splash', 'parry', 'knockout', 'boss-defeat', 'swing'], ...C5, ...C6, ...C7, ...C8, ...C9, ...C10, ...C11, ...C12, ...C13, ...C15, ...C16];
// Recorded region ambience (cycle 4); the synth beds stay underneath, quieter.
// v5: 14 s beds (three takes joined) instead of 5 s loops, and a calm bed for the shrine interiors.
const AMB_FILE = { kite: 'ambience-kite-hill-v5', drowned: 'ambience-drowned-steps-v5', quarry: 'ambience-ninefold-quarry-v5', kiln: 'ambience-kilnmouth-v5', brass: 'ambience-brass-gate-v5', shrine: 'ambience-shrine',
  // v6: halls and cellars get their own quiet bed, and every boss fight a tense one under the music
  interior: 'ambience-interior', arena: 'ambience-arena' };
// v7: 14 s beds for the arena, the halls and the shrines (the 5 s loops were audible as loops once the beds came up)
Object.assign(AMB_FILE, { interior: 'ambience-interior-v7', arena: 'ambience-arena-v7', shrine: 'ambience-shrine-v7' });
// per-bed trim so all beds sit together (the arena take is quieter after the limiter)
const AMB_TRIM = { arena: 1.5, shrine: 1.2 };
// v11 (review 11 #9): new region beds (three 5 s takes crossfaded to 13.5 s, -24 LUFS) and 4 dB up, so each region's
// own air is heard under the music (the beds measured 6 to 7 dB under it)
Object.assign(AMB_FILE, { kite: 'ambience-kite-hill-v11', drowned: 'ambience-drowned-steps-v11', quarry: 'ambience-ninefold-quarry-v11', kiln: 'ambience-kilnmouth-v11', brass: 'ambience-brass-gate-v11' });
for (const r of ['kite', 'drowned', 'quarry', 'kiln', 'brass']) AMB_TRIM[r] = 1.58;
// A track whose file is missing falls back to the one it replaced.
const TRACK_FALLBACK = { 'brass-gate': 'boss', ending: 'title' };
// Synth beats the file for these (the files were too quiet to rescue, or badly timed).
const PREFER_SYNTH = new Set();   // v5: dash and ui-move have good recorded takes now
const LOOP_VOL = { ...LOOP_VOL_C10, 'glide-loop': 0.22, 'slide-loop': 0.18, 'roll-loop': 0.3, 'updraft-loop': 0.3, 'waterfall-loop': 0.35, 'furnace-loop': 0.35, 'fire-hazard-loop': 0.28 };

export const Sound = {
  ctx: null, music: null, sfxBus: null, buffers: {}, loading: {}, synth: {}, prefs: { music: 0.6, sfx: 0.8, shake: 1, rumble: 1 },
  track: null, cur: null, unlocked: false, last: {}, loops: {}, amb: null, ambWant: null,

  init() {
    try { Object.assign(this.prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch { /* defaults */ }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    this._AC = AC;
    const unlock = () => {
      if (!this.ctx) this._create();
      else if (this.ctx.state !== 'running') this.ctx.resume();
      this.unlocked = true;
    };
    for (const ev of ['keydown', 'pointerdown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
  },

  _create() {
    this.ctx = new this._AC();
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    // v8 (review 8 #11): the music goes through a low-pass that closes to 900 Hz while a menu is open
    // v12 (note 32): and a menu gain after it, so a menu dips the music 6 dB with one smooth ramp (the volume
    // setting and the death/cutscene ducks stay on this.music, so nothing ever cancels anything else's ramp)
    this.menuGain = this.ctx.createGain();
    try { this.lp = this.ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000; this.lp.Q.value = 0.5; this.music.connect(this.lp); this.lp.connect(this.menuGain); }
    catch { this.lp = null; this.music.connect(this.menuGain); }
    this.menuGain.connect(this.master);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
    this.ambBus = this.ctx.createGain(); this.ambBus.connect(this.master);
    // v6: a gentle safety limiter on the master, so stacked boss sounds never clip after the level trims
    try {
      const lim = this.ctx.createDynamicsCompressor();
      lim.threshold.value = -6; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.2;
      // v12 (note 30): a hard ceiling after it (earshot measured +4.6 dBTP on a real-play capture): -4 dB, ratio 20, 1 ms
      const ceil = this.ctx.createDynamicsCompressor();
      ceil.threshold.value = -4; ceil.knee.value = 0; ceil.ratio.value = 20; ceil.attack.value = 0.001; ceil.release.value = 0.1;
      // and last, a 4x-oversampled soft clipper that never lets a sample past -1 dBFS (transparent below about -6 dBFS)
      const clip = this.ctx.createWaveShaper(), N = 2048, curve = new Float32Array(N), C = 0.8;   // v15: ceiling -1.9 dBFS (was 0.89, -1 dBFS): the capture read 0.0 dBTP
      for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1, a = Math.abs(x); curve[i] = Math.sign(x) * (a < 0.5 ? a : 0.5 + (C - 0.5) * Math.tanh((a - 0.5) / (C - 0.5))); }
      clip.curve = curve; clip.oversample = '4x';
      this.master.disconnect(); this.master.connect(lim); lim.connect(ceil); ceil.connect(clip); clip.connect(this.ctx.destination); this.out = clip;
    } catch { /* fine without */ }
    this.applyVolume();
    try { this.synth = renderSynth(this.ctx); } catch (e) { console.warn('synth failed', e); }
    const want = this.track; this.track = null;
    if (want) this.play(want);
    for (const n of PRELOAD) this._get(fileOf(n));
    for (const l of Object.values(ONESHOTS)) for (const n of l) this._get('sfx-' + n);
    this._oneshot();
    Promise.all(Object.values(AMB_FILE).map((f) => this._get('sfx-' + f))).then(() => { if (this.ambWant) { const a = this.ambWant; this.ambWant = null; this.ambience(a); } });
  },

  nudge() {
    if (!this._AC) return;
    if (!this.ctx) { try { this._create(); } catch { /* not allowed yet */ } }
    else if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  },

  get locked() { return !!this._AC && (!this.ctx || this.ctx.state !== 'running'); },

  applyVolume() {
    if (!this.ctx) return;
    this.music.gain.value = this.prefs.music * MUSIC_K; this._duckLevel = 1;
    this.sfxBus.gain.value = this.prefs.sfx;
    this.ambBus.gain.value = this.prefs.sfx * AMB_BUS;   // v7: was 0.55. v10 (review 10 #7): +4 dB, the beds were 14 dB under the effects
    this.master.gain.value = 1.05;   // v15 (the chill pass): -3.1 dB, so the limiters stop flattening every hit (was 1.5). v10: +2.5 dB; v11: +2.5 dB more (1.78). v12 (note 30): 1.5: real play measured -11.2 LUFS integrated and +4.1 dBTP
  },
  // Dip the music (death, cutscene moments) and bring it back.
  // v13: a stop-down for the impact frame: the music drops to 15% at once, holds 0.16 s, then comes back to where it
  // was over 0.35 s (earshot critique: 4 of 7 reference films drop the sound out right before a big hit). A later
  // duck() cancels this, so boss defeats and the pause menu keep control of the music.
  stopDown(hold = 0.16, depth = 0.15) {   // v15: depth, so a hurt can take a gentler dip (0.5) than an impact frame
    if (!this.ctx) return;
    const now = this.ctx.currentTime, g = this.music.gain, cur = g.value, v = this.prefs.music * MUSIC_K * (this._duckLevel ?? 1);   // back to the level a duck() asked for, never a mid-ramp value
    g.cancelScheduledValues(now); g.setValueAtTime(cur, now); g.linearRampToValueAtTime(cur * depth, now + 0.015);
    g.setValueAtTime(cur * depth, now + hold); g.linearRampToValueAtTime(v, now + hold + 0.35);
  },
  duck(level, sec = 0.6) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, g = this.music.gain;
    this._duckLevel = level;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(this.prefs.music * MUSIC_K * level, now + sec);
  },
  setVolume(bus, v) {
    this.prefs[bus] = Math.max(0, Math.min(1, Math.round(v * 10) / 10));
    this.applyVolume();
    this.savePrefs();
  },
  savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* fine */ } },

  _get(name) {
    if (!this.ctx) return Promise.resolve(null);
    if (name in this.buffers) return Promise.resolve(this.buffers[name]);
    if (!this.loading[name] && REL) {   // v15: the release build lists its mp3s; a name it lacks is left to the synth
      this.loading[name] = loadWebpIndex().then(() => { const u = RELMAN && RELMAN.audio[name]; const get = (n) => fetch(u).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => (n < 2 ? new Promise((ok) => setTimeout(ok, 800)).then(() => get(n + 1)) : null)); return u ? get(0) : null; })
        .then((ab) => (ab ? new Promise((ok) => this.ctx.decodeAudioData(ab, ok, () => ok(null))) : null)).then((buf) => { this.buffers[name] = buf; return buf; });
    }
    if (!this.loading[name]) {
      const tryDir = (i) => (i >= DIRS.length ? Promise.resolve(null) : fetch(DIRS[i] + name + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
        .then((ab) => (ab ? new Promise((ok) => this.ctx.decodeAudioData(ab, ok, () => ok(null))) : null))
        .then((b) => b || tryDir(i + 1)));
      this.loading[name] = tryDir(0).then((buf) => { this.buffers[name] = buf; return buf; });
    }
    return this.loading[name];
  },

  // --- sfx ----------------------------------------------------------------------------
  sfx(name, o = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    let buf = PREFER_SYNTH.has(name) ? null : this.buffers[fileOf(name)];
    if (!buf) {
      const s = this.synth[name] || this.synth[name.replace(/-rec$/, '')];
      this._get(fileOf(name));   // fetch the recording for next time
      if (s) buf = s[(Math.random() * s.length) | 0];
      else return;
    }
    const now = this.ctx.currentTime, at = now + (o.delay || 0);
    // v15: the gap is measured between the times the sounds START (a staggered delay is no longer swallowed), per-name gaps
    if (this.last[name] != null && Math.abs(at - this.last[name]) < (o.gap ?? GAP15[name] ?? 0.04)) return;  // no machine-gun stacking
    // v15 (chill mix): at most 3 copies of one sound ringing at once, 18 voices in all (footsteps and small one-shots give
    // way first, at 12); the same sound again within 0.35 s comes in 2 dB softer each time (down to -6 dB)
    const live = (this._live || []).filter((v) => now - v.at < v.buf.duration / v.rate);
    if (live.filter((v) => v.name === name).length >= 3) return;
    if (live.length >= 18 || (live.length >= 12 && (STEPS.test(name) || LOW15.has(name)))) return;
    const rp = this._rep || (this._rep = {}), r0 = rp[name], rep = r0 && at - r0.t < 0.35 ? Math.min(3, r0.n + 1) : 0;
    rp[name] = { t: at, n: rep };
    // v10 (review 10 #7): at most 3 hit-family sounds within 60 ms, and no footsteps under a hit in a fight
    const fam = HIT_FAMILY.has(name);
    if (fam || STEPS.test(name)) {
      this._recent = (this._recent || []).filter((r) => now - r < 0.06);
      if (fam && this._recent.length >= 3) return;
      if (!fam && this._fight && this._recent.length) return;
      if (fam) this._recent.push(now);
    }
    this.last[name] = at;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * (o.pitch ?? 0.06));
    // v15: +-1 dB of random level on every play, so a run of one sound never sounds stamped
    g.gain.value = (o.vol ?? 1) * (SFX_VOL[name] ?? 0.6) * trim(name) * Math.pow(0.79, rep) * (0.89 + Math.random() * 0.22);
    src.connect(g);
    // v8 (review 8 #11): a sound with a source position is placed left or right by where it is on screen
    const pan = o.pan ?? (o.x != null ? this.panOf(o.x) : 0);
    if (pan && this.ctx.createStereoPanner) { const sp = this.ctx.createStereoPanner(); sp.pan.value = pan; g.connect(sp); sp.connect(o.bus || this.sfxBus); }
    else g.connect(o.bus || this.sfxBus);
    const from = Math.min(buf.duration * 0.5, o.from ?? SKIP15[name] ?? 0);   // v15: start past a slow lead-in so the push lands on the release frame
    src.start(at, from);
    if (!this._menu) this._track(src, buf, src.playbackRate.value, g, at - from / src.playbackRate.value, name);   // v12: game sounds pause with the game
  },
  // the listener sits at the middle of the view (set every step by the game); +-0.7 at the screen edges
  // v12: the whole mix as a table, for tools/c12/mix.py (event, file, play volume, trims, loop or not)
  mixTable() {
    const ev = new Set([...Object.keys(SFX_VOL), ...Object.keys(LOOP_VOL)]);
    return [...ev].map((n) => ({ name: n, file: fileOf(n), vol: LOOP_VOL[n] ?? SFX_VOL[n] ?? 0.6, trimDb: TRIM_DB[n] || 0, mixDb: MIX12[n] || 0, loop: n in LOOP_VOL }));
  },
  view: { x: 0, w: 1920 },
  panOf(x) { const k = (x - (this.view.x + this.view.w / 2)) / (this.view.w / 2); return Math.max(-0.7, Math.min(0.7, k * 0.7)); },
  // v12 (Connor's note 32): pause pauses. On a menu: the music dips 6 dB (and softens a little) on the audio clock, the
  // ambience dips with it, held loops stop (the game asks for them again each frame once play resumes), and every game
  // sound still ringing is stopped where it is and restarted from that point on the way out. Menu sounds play as normal.
  menu(on) {
    if (!this.ctx || this._menu === on) return;
    this._menu = on;
    const now = this.ctx.currentTime;
    this.menuGain.gain.setTargetAtTime(on ? 0.5 : 1, now, 0.08);
    if (this.lp) this.lp.frequency.setTargetAtTime(on ? 3200 : 20000, now, on ? 0.08 : 0.15);
    this._muffled = on;
    this.ambBus.gain.setTargetAtTime(on ? this.prefs.sfx * AMB_BUS * 0.4 : this.prefs.sfx * AMB_BUS, now, 0.08);
    if (on) {
      this.stopLoops();
      this._held = [];
      for (const v of this._live || []) {
        const off = (now - v.at) * v.rate;
        if (off >= 0 && off < v.buf.duration - 0.03) { try { v.src.stop(); } catch { /* done */ } this._held.push({ ...v, off }); }
      }
      this._live = [];
    } else {
      for (const v of this._held || []) {
        const src = this.ctx.createBufferSource(); src.buffer = v.buf; src.playbackRate.value = v.rate; src.connect(v.out);
        src.start(now + 0.01, Math.max(0, v.off));
        this._track(src, v.buf, v.rate, v.out, now + 0.01 - v.off / v.rate, v.name);
      }
      this._held = [];
    }
  },
  _track(src, buf, rate, out, at, name) {
    const v = { src, buf, rate, out, at, name };
    (this._live = this._live || []).push(v);
    src.onended = () => { const i = this._live.indexOf(v); if (i >= 0) this._live.splice(i, 1); };
  },
  muffle(on) {
    if (!this.lp || this._muffled === on) return;
    this._muffled = on;
    const now = this.ctx.currentTime;
    this.lp.frequency.cancelScheduledValues(now);
    this.lp.frequency.setTargetAtTime(on ? 900 : 20000, now, on ? 0.08 : 0.15);
  },
  // Region one-shots: a distant sound now and then, only while the region's own bed is playing (not in halls or fights).
  _oneshot() {
    clearTimeout(this._osT);
    this._osT = setTimeout(() => {
      const r = this.amb && this.amb.region, list = ONESHOTS[r];
      if (list && this.ctx.state === 'running' && !this._muffled) {
        const n = list[(Math.random() * list.length) | 0];
        if (this.buffers['sfx-' + n]) this.sfx(n, { bus: this.ambBus, pan: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.45), pitch: 0.04, gap: 4 });
        else this._get('sfx-' + n);
      }
      this._oneshot();
    }, 8000 + Math.random() * 12000);
  },

  // A held sound (glide wind, wall slide, a rolling mite): call every frame with on/off.
  loop(name, on, vol = 1, rate = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    let l = this.loops[name];
    if (on && !l) {
      const file = this.buffers[fileOf(name)], s = file ? [file] : this.synth[name]; if (!file) this._get(fileOf(name)); if (!s) return;
      const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
      src.buffer = file ? seamless(this.ctx, s[0]) : s[0]; src.loop = true; g.gain.value = 0.0001;
      src.connect(g); g.connect(this.sfxBus); src.start();
      l = this.loops[name] = { src, g, on: false };
    }
    if (!l || l.on === on && Math.abs((l.vol || 0) - vol) < 0.05) return;
    l.on = on; l.vol = vol;
    const now = this.ctx.currentTime, target = on ? (LOOP_VOL[name] ?? 0.3) * vol * trim(name) : 0.0001;
    l.g.gain.setTargetAtTime(target, now, on ? 0.05 : 0.08);
    l.src.playbackRate.setTargetAtTime(rate, now, 0.1);
  },
  stopLoops() { for (const k in this.loops) this.loop(k, false); },

  // Region ambience bed: a synth bed per region, plus the recorded Kite Hill file, quietly.
  ambience(region) {
    if (!this.ctx || !this.synth['amb-kite']) { this.ambWant = region; return; }
    if (this.amb && this.amb.region === region) return;
    this.ambTarget = region;
    if (region && !this.synth['amb-' + region] && !this.buffers['sfx-' + AMB_FILE[region]]) this._get('sfx-' + AMB_FILE[region]).then((b) => { if (b && this.ambTarget === region) { this.amb = null; this.ambience(region); } });
    const now = this.ctx.currentTime;
    if (this.amb) {
      for (const a of [this.amb, this.amb.extra]) if (a) { try { a.g.gain.cancelScheduledValues(now); a.g.gain.setTargetAtTime(0.0001, now, 0.5); a.src.stop(now + 3); } catch { /* */ } }
    }
    this.amb = null;
    if (!region) return;
    const mk = (buf, vol) => { const src = this.ctx.createBufferSource(), g = this.ctx.createGain(); src.buffer = seamless(this.ctx, buf, 0.5); src.loop = true; g.gain.value = 0.0001; g.gain.setTargetAtTime(vol, now, 0.8); src.connect(g); g.connect(this.ambBus); src.start(); return { src, g }; };
    const file = this.buffers['sfx-' + AMB_FILE[region]], syn = this.synth['amb-' + region];
    if (!file && !syn) return;
    // the recorded bed leads (all at -26 LUFS now); the synth bed sits quietly underneath for body
    if (syn) this.amb = { region, ...mk(syn[0], file ? 0.16 : 0.5) };
    const bv = 0.85 * (AMB_TRIM[region] || 1);   // v7: was 0.6
    if (file) { if (this.amb) this.amb.extra = mk(file, bv); else this.amb = { region, ...mk(file, bv) }; }
  },

  // Boss fights: the region bed drops to 30% under the boss music.
  ambDuck(level) {
    if (!this.ctx) return;
    this._fight = level < 1;
    this.ambBus.gain.setTargetAtTime(this.prefs.sfx * AMB_BUS * level, this.ctx.currentTime, 0.4);
    // v10 (review 10 #7): effects 2 dB down in a boss fight, so the sum stops overloading the limiter
    this.sfxBus.gain.setTargetAtTime(this.prefs.sfx * (this._fight ? 0.79 : 1), this.ctx.currentTime, 0.4);
  },

  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    if (!this.prefs.rumble) return;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.vibrationActuator) p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
    } catch { /* no rumble */ }
  },

  // --- music --------------------------------------------------------------------------
  play(track) {
    if (this.track === track && (this.cur || !this.ctx)) return;
    this.track = track;
    if (!this.ctx) return;
    const cur = this.cur;
    if (cur) this._fadeOut(cur, XFADE);
    this.cur = null;
    if (!track) return;
    this._get('music-' + track).then((buf) => {
      if (this.track !== track) return;
      if (!buf) { if (TRACK_FALLBACK[track]) { this.track = null; this.play(TRACK_FALLBACK[track]); } return; }
      this.cur = { track, buf, voices: [] };
      this._voice(this.cur, cur ? XFADE : 0.6, this.ctx.currentTime);
    });
  },

  // Each copy starts at an exact audio-clock time; a timer only has to wake up some time in
  // the 3 s before the seam to book the next copy, so tab throttling can't drop the music.
  _voice(c, fadeIn, at) {
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = c.buf; src.connect(g); g.connect(this.music);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(1, at + fadeIn);
    src.start(at);
    const v = { src, g, start: at };
    c.voices.push(v);
    const seam = at + c.buf.duration - LOOP_XF;
    g.gain.setValueAtTime(1, seam);
    g.gain.linearRampToValueAtTime(0.0001, seam + LOOP_XF);
    src.stop(seam + LOOP_XF + 0.05);
    v.timer = setTimeout(() => {
      if (this.cur !== c) return;
      c.voices = c.voices.filter((x) => x !== v || this.ctx.currentTime < seam + LOOP_XF);
      this._voice(c, LOOP_XF, Math.max(seam, this.ctx.currentTime + 0.02));
    }, Math.max(0, (seam - this.ctx.currentTime - 3) * 1000));
  },

  _fadeOut(c, sec) {
    const now = this.ctx.currentTime;
    for (const v of c.voices) {
      clearTimeout(v.timer);
      try {
        v.g.gain.cancelScheduledValues(now);
        v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), now);
        v.g.gain.linearRampToValueAtTime(0.0001, now + sec);
        v.src.stop(now + sec + 0.05);
      } catch { /* already stopped */ }
    }
  },
};

// Which track a room plays: the boss tracks during fights, the region's own otherwise.
// The Brass Gate has its own march (cycle 4); without the file it falls back to the old shared boss track.
export const REGION_TRACK = { kite: 'kite-hill', drowned: 'drowned-steps', quarry: 'ninefold-quarry', kiln: 'kilnmouth', brass: 'brass-gate' };
export const BOSS_TRACK = { reed: 'boss-warden', colossus: 'boss-colossus', overseer: 'boss-overseer', captain: 'captain' };
