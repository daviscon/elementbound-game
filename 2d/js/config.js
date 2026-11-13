// Shared constants: screen, physics, palettes, moves.

export const W = 1920, H = 1080, DT = 1 / 60;
export const SAVE_KEY = 'elementbound-mv-save-v3';

export const PHYS = {
  gravity: 3000,
  fallGravity: 4200,  // heavier on the way down
  apexGravity: 1900,  // a little hang at the top while jump is held
  apexBand: 120,
  maxFall: 1500,
  runSpeed: 520,
  groundAccel: 5200,
  airAccel: 3600,
  jumpV: 1165,        // single jump ≈ 215 px high
  doubleJumpV: 1050,  // + ≈ 184 px
  jumpCut: 0.45,      // variable jump height: velocity multiplier on early release
  coyote: 0.10,
  jumpBuffer: 0.12,
  dashSpeed: 1300,
  dashTime: 0.20,     // ≈ 260 px (v4: was 0.16, measured 173 px)
  dashCooldown: 0.38,
  glideFall: 130,     // glide fall-speed cap
  slamSpeed: 2100,
  wallSlide: 210,     // Stone Grip: slide speed on a wall
  wallJumpVx: 640,
  wallJumpVy: 1080,
  sprintMul: 1.6,     // v10 (Connor's note 17): hold the dash button to keep running at 1.6x
};

export const INK = '#1d1420';

// Region palettes for code-drawn platforms, and the map colour.
export const REGIONS = {
  kite: {
    name: 'Kite Hill', color: '#e8924a', bg: 'bg.kite',
    pal: { fill: '#8d6f8e', top: '#c9a38f', shade: '#6b5374', ink: '#2a1c2e', line: '#7a5f80', sky: ['#7b5aa6', '#f08a5d', '#f6c38b'], far: '#9a7fb0', wash: 'rgba(120,80,120,0.10)' },
  },
  drowned: {
    name: 'The Drowned Steps', color: '#3fa79a', bg: 'bg.drowned',
    pal: { fill: '#5d857c', top: '#86b46a', shade: '#44665f', ink: '#16302c', line: '#507368', sky: ['#5f8f8f', '#8fbdb2', '#bfe0cf'], far: '#4c7d78', wash: 'rgba(60,110,110,0.10)' },
  },
  quarry: {
    name: 'Ninefold Quarry', color: '#c9a04e', bg: 'bg.quarry',
    pal: { fill: '#c2a06a', top: '#e6cc94', shade: '#9c7c4d', ink: '#3b2917', line: '#ad8c59', sky: ['#e2a56a', '#f2c891', '#f7e0b5'], far: '#b08a5e', wash: 'rgba(150,110,60,0.08)' },
  },
  kiln: {
    name: 'Kilnmouth', color: '#b8433a', bg: 'bg.kiln',
    pal: { fill: '#7b4b43', top: '#a4675a', shade: '#59332f', ink: '#261213', line: '#693d37', sky: ['#5a2630', '#a8443c', '#d9774a'], far: '#5e3336', wash: 'rgba(90,30,30,0.12)' },
  },
  brass: {
    name: 'The Brass Gate', color: '#7d6f9a', bg: 'bg.brass',
    pal: { fill: '#3b3946', top: '#b08d3c', shade: '#2a2833', ink: '#100e16', line: '#33313d', sky: ['#2a2233', '#7a3b2e', '#d9692e'], far: '#2c2a36', wash: 'rgba(20,16,30,0.14)' },
  },
};

export const ELEMENTS = {
  air: { name: 'Air', color: '#d7eef2', dark: '#7fb6c4' },
  water: { name: 'Water', color: '#4aa3d8', dark: '#2a6f9e' },
  earth: { name: 'Earth', color: '#c39a5b', dark: '#7d5a2c' },
  fire: { name: 'Fire', color: '#f0742a', dark: '#a8371c' },
};

// The 8 element moves. Costs are % of the Breath bar.
export const MOVES = {
  // v10 (Connor's note 13): Breath only comes back from defeated foes and rest, so every move costs more and commits
  gust: { name: 'Gust', el: 'air', cost: 25, desc: 'A ball of air flies from the palm. Strong at mid range, big knockback.' },
  deflect: { name: 'Deflect', el: 'air', cost: 10, desc: 'A split-second turn of the palms. Time it as a blow lands; catch a shot and aim it back with the stick.' },
  whip: { name: 'Water Whip', el: 'water', cost: 30, desc: 'A long lash of water. Strong at mid range; drags foes in.' },
  icewall: { name: 'Ice Wall', el: 'water', cost: 25, desc: 'Raises a wall of ice. Blocks shots. You can stand on it, even over water.' },
  slam: { name: 'Earth Slam', el: 'earth', cost: 35, desc: 'Smash down from the air. Breaks cracked floors.' },
  stonewall: { name: 'Stone Wall', el: 'earth', cost: 30, desc: 'A slab rises from the ground. Blocks shots, launches soldiers.' },
  fireblast: { name: 'Fire Blast', el: 'fire', cost: 30, desc: 'Fast burning shot. Sets thornwood alight.' },
  flamering: { name: 'Flame Ring', el: 'fire', cost: 40, desc: 'A shield of flame that eats fireballs and burns on touch.' },
};
export const MOVE_ORDER = ['gust', 'deflect', 'whip', 'icewall', 'slam', 'stonewall', 'fireblast', 'flamering'];
export const SLOT_ACTIONS = ['m0', 'm1', 'm2', 'm3']; // L1 L2 R1 R2 / 1 2 3 4

// Lessons shown at shrines and after trial guardians.
export const LESSONS = {
  air: { title: 'The Shrine of Wind', el: 'air', items: [
    { name: 'Gust', move: 'gust' }, { name: 'Deflect', move: 'deflect' },
    { name: 'Dash', action: 'dash', text: 'A burst of air at your back. Works in the air, once per jump.' }] },
  water: { title: 'The Sunken Shrine', el: 'water', items: [
    { name: 'Water Whip', move: 'whip' }, { name: 'Ice Wall', move: 'icewall' }] },
  earth: { title: 'The Shrine of Nine Steps', el: 'earth', items: [
    { name: 'Earth Slam', move: 'slam' }, { name: 'Stone Wall', move: 'stonewall' }] },
  fire: { title: 'The Ember Shrine', el: 'fire', items: [
    { name: 'Fire Blast', move: 'fireblast' }, { name: 'Flame Ring', move: 'flamering' }] },
  doublejump: { title: 'The Rime Warden yields', el: 'air', items: [
    { name: 'Double Jump', action: 'jump', text: 'Press jump again in the air. The wind gives you a second step.' }] },
  glide: { title: 'The Kiln Overseer falls', el: 'air', items: [
    { name: 'Glide', action: 'jump', hold: true, text: 'Hold jump in the air. Air pushed from your palms carries you across wide gaps.' }] },
  heart: { title: 'The Colossus kneels', el: 'earth', items: [
    { name: 'Stone Grip', keys: 'toward a wall, {jump}', text: 'Hold toward a wall in the air to cling and slide. Jump to kick off it.' },
    { name: 'Stone Heart', text: 'Your health grows by one.' }] },
};

// The Fourfold Path: one branch per element, the air branch is the core. Spirit Marks buy
// nodes; a node needs the one above it in its branch. Icons index ui-skill-icons.png
// (0 dash, 1 feather, 2 lotus, 3 petal, 4 pearl, 5 orbit, 6 wave, 7 stone, 8 flame, 9 jade charm).
export const SKILLS = [
  { id: 'swiftwind', el: 'air', cost: 1, icon: 0, name: 'Swift Wind', desc: 'Dash recovers faster and carries a little further.' },
  { id: 'stillmind', el: 'air', cost: 1, icon: 2, name: 'Still Mind', desc: 'Mending costs less Breath: 80 instead of a full bar.', needs: 'swiftwind' },
  { id: 'echo', el: 'air', cost: 2, icon: 5, name: 'Echo of the Bell', desc: 'A wider deflect window, and a caught shot hangs longer while you aim it.', needs: 'stillmind' },
  { id: 'secondwind', el: 'air', cost: 2, icon: 1, name: 'Second Wind', desc: 'Dash twice before you land.', needs: 'echo' },
  { id: 'deepwell', el: 'water', cost: 1, icon: 4, name: 'Deep Well', desc: 'Your Breath bar grows by 25.' },
  { id: 'glacier', el: 'water', cost: 1, icon: 6, name: 'Glacier', desc: 'Ice walls stand half as long again and take more hits.', needs: 'deepwell' },
  { id: 'bulwark', el: 'earth', cost: 1, icon: 7, name: 'Bulwark', desc: 'Stone walls stand longer and take more hits.' },
  { id: 'tremor', el: 'earth', cost: 2, icon: 7, name: 'Tremor', desc: 'Earth Slam\'s shock reaches 40% further.', needs: 'bulwark' },
  { id: 'emberring', el: 'fire', cost: 1, icon: 8, name: 'Ember Ring', desc: 'Flame Ring costs 10 less Breath.' },
  { id: 'kindling', el: 'fire', cost: 2, icon: 8, name: 'Kindling', desc: 'Fire Blast pierces up to three foes and sets them burning.', needs: 'emberring' },
];
