// Game flow: starting, room changes, respawns, interactions, pickups, camera, hints.
import { G, newSave, persist, setFlag, flag, clamp, lerp, shake, hitstop, burst, toast, banner, later, rnd, addFx } from './game.js';
import { W, H, MOVES, MOVE_ORDER, LESSONS, REGIONS } from './config.js';
import { ROOMS, buildRoom, rebuildCol, pointSolid, rectFree, exitBlocked } from './world.js';
import { newPlayer, resetPlayerState, addBreath, nearInteract } from './player.js';
import { spawnEnemy } from './enemies.js';
import { Sound, REGION_TRACK, BOSS_TRACK } from './audio.js';
import { popText } from './game.js';
import { TALKS, VILLAGERS, CUTSCENES } from './story.js';
import { Assets } from './assets.js';
import { Input } from './input.js';
import { hudFly } from './ui.js';
import { releaseShot } from './enemies.js';
import { startAttune } from './attune.js';

// --- start / rooms -------------------------------------------------------------------
export function startGame(fresh) {
  if (fresh || !G.save) { G.save = newSave(); }
  G.save.started = true; persist();
  G.player = newPlayer();
  G.player.hp = G.save.maxHp;
  G.state = 'play'; G.menu = null; G.lesson = null; G.room = null;
  enterRoom(G.save.room, G.save.x, G.save.y);
}

export function enterRoom(id, x, y, o = {}) {
  const prev = G.room, room = buildRoom(id), p = G.player;
  for (const r of Assets.near(ROOMS, id, ['boss-reed', 'boss-colossus', 'boss-overseer'].filter((b) => flag(b)).length)) if (REGION_TRACK[r]) Sound._get('music-' + REGION_TRACK[r]);   // v15: this region's art and music, and the next one's, load as the player approaches
  if (prev && KILLED[prev.id]) KILLED[prev.id].t = G.time;      // the 90 s count starts when you leave
  G.room = room;
  for (const k of ['enemies', 'shots', 'hurts', 'pillars', 'pickups', 'fx', 'parts', 'zones', 'later']) G[k].length = 0;
  G.boss = null; G.bossCard = null; G.bossIntro = null; G.banner = null;
  G.aim = null; G.attune = null; G.doorWalk = null; G.teachHeal = null;   // a lesson left unfinished comes again on the next knock
  for (const d of room.def.pickups || []) {
    if (d.id && flag(d.id)) continue;
    if (d.t === 'wisp') continue;   // v10 (Connor's note 13): no Breath lying about the world; it comes from defeated foes
    G.pickups.push({ t: d.t, id: d.id, x: d.x, y: d.y, hx: d.x, hy: d.y, respawn: 0, seed: rnd(6) });
  }
  // enemies stay beaten for 90 s, or until you meditate
  const mem = KILLED[id], keep = mem && G.time - mem.t < 90 && mem.since === meditations;
  G.killed = keep ? mem.idx : new Set();
  // v14 (Connor's note 49): a rest stone's room is safe, like a Silksong bench: nothing spawns there (the room data
  // moved those foes to the rooms around it), so waking at a stone is never waking into a fight
  if (!room.def.stone || room.def.boss) (room.def.enemies || []).forEach((d, i) => { if (!G.killed.has(i)) spawnEnemy(d.t, d.x, d.y, { spawnIdx: i, ...(d.o || {}) }); });
  if (room.shrine && flag('shrine-' + room.shrine.el)) spawnTrial(room.shrine.el);   // v10: the trial post waits until it falls
  KILLED[id] = { t: G.time, idx: G.killed, since: meditations };
  resetPlayerState(p);
  p.x = x; p.y = y; p.safe.x = x; p.safe.y = y; p.dead = false;
  if (o.face) p.face = o.face;
  if (o.vy) p.vy = o.vy;
  if (!G.save.visited[id]) G.progressAt = G.playT || 0;   // v9: a new room is progress
  G.save.visited[id] = 1; G.enteredAt = G.time; G.guide = null;
  // Elder Sora-Lin, if she is here (and has reason to be)
  G.npc = null;
  const n = room.def.npc;
  if (n && (!n.need || flag(n.need)) && (!n.gone || !flag(n.gone))) G.npc = { x: n.x, y: n.y, face: -1, animT: rnd(2), def: n };
  G.villagers = (room.def.villagers || []).filter((v) => (!v.need || flag(v.need)) && (!v.gone || !flag(v.gone))).map((v) => ({ ...v, def: { ...VILLAGERS[v.who], ...v }, animT: rnd(3), face: v.face || -1 }));
  rebuildCol();
  G.zoom = 1;
  updateCamera(0, true);
  roomMusic();
  roomAmbience();
  // region name card on entering a region; a quiet room-name line otherwise
  if (o.respawn) G.card = null;   // v7: a fall is quiet: no card at all, the toast already said it
  else if (!prev || prev.region !== room.region) { G.card = { region: room.reg.name, room: room.name, t: 0, color: room.reg.color }; Sound.sfx('region-card', { delay: 0.2 }); }
  else G.card = { room: room.name, t: 1.4, small: true, color: room.reg.color };
  if (room.def.cutscene && !flag('cut-' + room.def.cutscene)) later(0.3, () => openCutscene(room.def.cutscene));
}
const KILLED = {};
let meditations = 0;

export function roomMusic() {
  const room = G.room;
  if (!room) return;
  const def = room.def.boss;
  const fight = def && def.t !== 'ambush' && room.fight && room.fight.phase !== 'done' && !flag('boss-' + def.t);
  if (fight) Sound.play(BOSS_TRACK[def.t] || 'boss');
  else Sound.play(room.def.music || REGION_TRACK[room.region]);
  roomAmbience(fight);
  Sound.ambDuck(fight ? 0.6 : 1);
}
// v5: shrine interiors have their own calm bed. v6: other halls and cellars get a quiet interior bed
// (the outdoor wind no longer plays indoors), and a boss fight swaps the region bed for a tense one.
export function roomAmbience(fight = false) {
  const room = G.room, inside = room.def.bg && room.def.bg.kind === 'in';
  Sound.ambience(fight ? 'arena' : room.shrine && inside ? 'shrine' : inside ? 'interior' : room.region);
}

// Which of the Elder's talks fits right now: the first entry whose flag is set.
export function npcTalk(n = G.npc) {
  if (!n) return null;
  for (const [need, key] of n.def.talks) if (!need || flag(need)) return key;
  return null;
}
// v7 (review 7 #2): a talk never starts with Joon standing on the speaker. Too close, he steps back to
// 130 px over 0.2 s; both turn to face each other.
export function faceSpeaker(o) {
  const p = G.player;
  if (!o || !p) return;
  const side = p.x < o.x ? -1 : 1, dx = Math.abs(p.x - o.x);
  p.face = -side; o.face = side; p.vx = 0;
  if (dx < 110) {
    const to = o.x + side * 130;
    if (rectFree({ x: to - p.w / 2, y: p.y - p.h + 4, w: p.w, h: p.h - 8 }, true)) G.talkSlide = { from: p.x, to, t: 0 };
  }
}
export function updateTalkSlide(dt) {
  const s = G.talkSlide, p = G.player;
  if (!s || !p) return;
  const dur = s.dur || 0.2;
  s.t = Math.min(dur, s.t + dt); const k = Math.max(0, s.t) / dur, e = 1 - (1 - k) * (1 - k);
  p.x = s.from + (s.to - s.from) * e;
  if (s.t >= dur) G.talkSlide = null;
}
export function openTalk(key, then = null) {
  const T = TALKS[key];
  if (!T) { if (then) then(); return; }
  const seen = flag('talk-' + key);
  G.talk = { key, lines: seen && T.again ? T.again : T.lines, i: 0, t: 0, then, who: T.who || 'elder', still: T.still || null };
  G.state = 'talk';
  Sound.sfx('cutscene-page', { vol: 0.9 }); Sound.sfx('ui-confirm', { vol: 0.4, delay: 0.16 });   // v15: the page as the box opens, the click as it settles
}
export function closeTalk() {
  const tk = G.talk;
  setFlag('talk-' + tk.key);
  const T = TALKS[tk.key];
  if (T && T.sets) setFlag(T.sets);
  G.talk = null; G.state = 'play';
  if (tk.then) tk.then();
}
export function updateNpc(dt) {
  const n = G.npc, p = G.player;
  if (!n) return;
  n.animT += dt;
  // v7: someone walking in to a mark (Sora-Lin after the Captain) arrives, then speaks
  if (n.walkTo != null) {
    const d = n.walkTo - n.x, st = (n.walkSpeed || 220) * dt;
    n.face = Math.sign(d) || n.face; n.walking = true;
    if ((n.stepSnd = (n.stepSnd || 0) - dt) <= 0) { n.stepSnd = 1.45; Sound.sfx('elder-arrive', { pitch: 0.03 }); }   // cloth shoes and the staff
    if (Math.abs(d) <= st) { n.x = n.walkTo; n.walkTo = null; n.walking = false; n.face = p.x < n.x ? -1 : 1; if (n.onArrive) n.onArrive(); }
    else n.x += Math.sign(d) * st;
    return;
  }
  if (Math.abs(p.x - n.x) > 30) n.face = p.x < n.x ? -1 : 1;
  // she calls out the first time you come near, if this talk is new
  const key = npcTalk(n);
  if (n.def.auto && key && !flag('talk-' + key) && !p.dead && p.onGround && Math.abs(p.x - n.x) < (n.def.reach || 340) && Math.abs(p.y - n.y) < 200 && !G.fade) {
    p.vx = 0; faceSpeaker(n);
    openTalk(key);
  }
}

export function transition(to, x, y, o = {}) {
  if (G.fade) return;
  const side = o.face ? o.face : 0;
  const keep = { vx: G.player.vx };
  Sound.sfx('room-wipe', { rate: side ? 1 : 0.85, gap: 0.2 });
  G.fade = { t: 0, dur: side ? 0.32 : 0.4, done: false, wipe: side, hold: () => !Assets.regionReady(ROOMS[to].region), region: (Assets.want(ROOMS[to].region), ROOMS[to].region), mid: () => { enterRoom(to, x, y, o); if (side) G.player.vx = keep.vx; } };
}

// Leaving through an edge, falling into a pit, or walking into the room's limits.
export function checkEdges() {
  const p = G.player, room = G.room;
  if (G.fade) return;
  // a locked fight (boss or ambush) is a closed room: nothing can carry Joon out through an exit
  if (room.barriers.length || (G.boss && !G.boss.enemy.dead)) {
    const lo = room.barriers.length ? Math.min(...room.barriers.map((b) => b.x + b.w)) + p.w / 2 : 30;
    const hi = room.barriers.length >= 2 ? Math.max(...room.barriers.map((b) => b.x)) - p.w / 2 : room.w - 30;
    if (p.x < lo || p.x > hi) { p.x = clamp(p.x, lo, hi); p.vx = 0; }
  }
  const side = p.x < 24 ? 'left' : p.x > room.w - 24 ? 'right' : null;
  if (side) {
    const ex = room.exits.find((e) => e.side === side && p.y > e.range[0] && p.y <= e.range[1]);
    // knocked back into an exit: stay in the room
    if (ex && p.hurtT <= 0) { transition(ex.to, ex.at[0], ex.at[1], { face: side === 'left' ? -1 : 1 }); return; }
    p.x = clamp(p.x, 30, room.w - 30); p.vx = 0;
  }
  if (p.y - p.h > room.h + 20) {
    const ex = room.exits.find((e) => e.side === 'bottom' && p.x > e.range[0] && p.x < e.range[1]);
    if (ex) transition(ex.to, ex.keepX ? clamp(p.x, ex.range[0] + 40, ex.range[1] - 40) : ex.at[0], ex.at[1], { vy: 600 });
    else hazardHit('pit');
  }
}

// Water, thorns, fire, pits: lose one health and go back to the last safe footing.
export function hazardHit(type) {
  const p = G.player;
  if (p.dead || G.fade || p.hazT > 0) return;
  // v5: thrown clear in the hurt pose (a small pop up) for 0.3 s, then the quick dip back to safe ground
  p.hp -= 1; p.flash = 0.2; p.hurtT = 0.45; p.hazT = 0.3;   // v6: the hurt pose holds through the dip (no idle pose on the spikes)
  p.inv = Math.max(p.inv, 0.6); G.hurtGlow = 1;   // v10 (review 10 #5): this sat behind the comment above and never ran
  p.vy = -500; p.vx = -p.face * 120; p.onGround = false; p.atk = null; p.dashT = 0; p.ledge = null; p.wall = 0; p.slam = null;
  shake(10); hitstop(0.08); Sound.rumble(0.5, 0.5, 150);
  Sound.sfx('player-hurt');
  if (type === 'fire') Sound.sfx('fire-scorch');                        // v9 (review 9 sounds 5 and 6): what you touched
  else if (type !== 'water' && type !== 'pit') Sound.sfx('spike-hit');
  if (type === 'water') { Sound.sfx('splash'); Sound.sfx('water-enter', { vol: 0.7 }); addFx('splash', p.x, p.y + 10, { dur: 0.55, size: 170, anchor: 'bottom' }); }
  const col = type === 'water' ? ['#bfe9f2', '#3fa7b8', '#ffffff'] : type === 'fire' ? ['#ffd36b', '#f0742a'] : ['#ffffff', '#e2574c'];
  burst(p.x, Math.min(p.y - 40, G.room.h - 20), 16, { color: col, min: 120, max: 520, angle: -Math.PI / 2, spread: 1.1, life: 0.6, size: 12 });
  if (p.hp <= 0) { playerDied({ hazard: true }); return; }
  const room = G.room;
  later(type === 'pit' ? 0 : 0.3, () => {
    if (G.room !== room || p.dead) return;
    G.fade = {
      t: 0, dur: 0.3, done: false, mid: () => {   // a quick dip (0.15 s out, 0.15 s in) around the move back to safe ground
        resetPlayerState(p); p.hazT = 0;
        p.x = p.safe.x; p.y = p.safe.y; p.inv = 1.3;
        updateCamera(0, true);
        Sound.sfx('hazard-respawn', { delay: 0.05 });   // v12 (note 35): the wind sets him back on the last safe ledge
      },
    };
  });
}

export function playerDied(o = {}) {
  const p = G.player;
  if (p.dead) return;
  p.dead = true; p.deadT = 0; p.hp = 0; p.slam = null; p.atk = null; p.ring = 0; p.ledge = null; p.wall = 0;
  hitstop(0.12); G.slowT = 0.4; shake(18); Sound.rumble(1, 0.8, 300); Sound.stopLoops(); Sound.duck(0.25, 1.2);
  Sound.sfx('knockout'); Sound.sfx('gameover', { delay: 0.6 });
  const s = G.save;
  s.deaths = (s.deaths || 0) + 1;
  // the jade you carried stays where you fell; reach it again to take it back (once)
  if (s.jade > 0) { s.satchel = { room: G.room.id, x: p.safe.x, y: p.safe.y, jade: s.jade }; s.jade = 0; G.satchelAt = G.time + 2; Sound.sfx('satchel-drop', { delay: 0.45 }); }   // v7: heard as it falls
  persist();
  G.card = null; G.banner = null; G.bossCard = null;   // the death card jumps the queue and clears it
  toast('Fallen', '', 2.0);   // v11: one word; the satchel on the ground says the rest
  // v6: a fall on spikes, thorns or fire fades 0.6 s sooner, so the body never lies on the tips for long
  later(o.hazard ? 1.3 : 1.9, () => {
    G.fade = {
      t: 0, dur: 1.2, done: false, mid: () => {   // 0.6 s to black, 0.6 s back
        const s = G.save;
        G.player = newPlayer();
        G.player.hp = s.maxHp; G.player.breath = maxBreath(); G.player.wakeT = 0.6;   // v11 (review 11 #6): waking at a stone is a full rest
        G.player.inv = 2;   // v14 (Connor's note 49): 2 s of grace on waking, like a Silksong bench
        G.room = null;
        meditations++;
        enterRoom(s.room, s.x, s.y, { respawn: true });
        G.respawnT = G.time;   // v7: hints wait 6 s after a respawn
        Sound.duck(1, 2.0); Sound.sfx('respawn-wake', { delay: 0.3 });
        // v6: soft light behind Joon (additive, 0.55), not a cut-out cone over him
        addFx('respawn', s.x, s.y + 6, { dur: 1.2, size: 260, anchor: 'bottom', behind: true, alpha: 0.55, blend: 'lighter', fadeOut: 0.4 });
      },
    };
  });
}

// --- interactions ----------------------------------------------------------------------
export function interact() {
  const n = nearInteract(), p = G.player, s = G.save, room = G.room;
  if (!n || G.fade) return;
  if (n.type === 'stone') {
    if (room.meditated) { openEquip(''); return; }
    // first press: sit and breathe (saves, heals, enemies return); a second press opens the menu
    s.room = room.id; s.x = n.obj.x; s.y = n.obj.y;
    p.hp = s.maxHp; p.vx = 0; p.x = n.obj.x + (p.x < n.obj.x ? -70 : 70); p.face = p.x < n.obj.x ? 1 : -1;
    p.meditT = 1.4; room.meditated = true; meditations++;
    persist();
    burst(n.obj.x, n.obj.y - 120, 18, { color: ['#ffffff', '#d7eef2', '#ffe9a8'], min: 40, max: 260, up: 120, grav: -200, life: 0.9, size: 10 });
    // v10 (Connor's note 21): a full rest: every heart, all Breath, the respawn point, and the map is inked in
    Sound.sfx('meditation'); Sound.sfx('rest-chime', { delay: 0.35 }); Sound.sfx('save', { delay: 0.9, vol: 0.6 });
    p.breath = maxBreath();
    const ch = s.charted || (s.charted = {}); let inked = 0;
    for (const id in s.visited) if (!ch[id]) { ch[id] = 1; inked++; }
    persist();
    later(0.5, () => toast('Rested', '', 2.0));   // v11 (note 15): a name, not a sentence
    if (inked) later(0.9, () => Sound.sfx('map-ink', { vol: 0.8 }));
  } else if (n.type === 'npc') {
    faceSpeaker(n.obj);
    openTalk(npcTalk());
  } else if (n.type === 'villager') {
    const v = n.obj;
    if (v.who !== 'mapmaker') faceSpeaker(v);   // the Mapmaker stays behind the stall
    if (v.def.shop) openTalk(v.def.talk, () => openShop());
    else openTalk(v.def.talk);
  } else if (n.type === 'satchel') {
    const sat = s.satchel;
    s.jade += sat.jade; s.satchel = null; persist();
    Sound.sfx('satchel-recover');   // v11 (note 15): the beads fly to the counter; no pop word
    for (let i = 0; i < Math.min(14, sat.jade); i++) hudFly('bead', sat.x - G.cam.x + rnd(-40, 40), sat.y - 60 - G.cam.y + rnd(-30, 30), { dur: 0.4 + i * 0.05 });
    burst(sat.x, sat.y - 40, 16, { color: ['#9be0a8', '#ffffff'], min: 60, max: 300, life: 0.6, size: 9 });
  } else if (n.type === 'shrine') {
    // v10 (Connor's note 11): the first time, kneel and attune; afterwards it is a place to recall the lesson
    const el = n.obj.el;
    if (!flag('shrine-' + el)) startAttune({ power: el, x: n.obj.x, then: () => learnShrine(el, () => spawnTrial(el, true)) });
    else learnShrine(el);
  } else {
    const d = n.obj;
    if (d.lock && !flag(d.lock)) { banner(d.lockText || 'Barred from the other side.'); shake(3); Sound.sfx('thud-wall', { vol: 0.6 }); return; }
    setFlag('door-' + d.id);
    const other = (ROOMS[d.to].doors || []).find((q) => q.id === d.id);
    // v10 (review 10 #2): the sound is what the door is: the iron sluice, a stair, an arch or a mine passage
    if (other) { Sound.sfx(d.art === 'furnace' ? 'furnace-door' : d.art === 'sluice' ? 'gate-sluice' : d.kind === 'stair' ? 'passage-stair' : d.kind === 'arch' || d.kind === 'mine' ? 'passage-arch' : 'door'); if (d.kind === 'boss') { shake(4); Sound.rumble(0.3, 0.4, 300); }
      // v10 (review 10 #2): Joon walks into the opening (the bars of a boss gate rise as he goes), then the fade
      d.raiseAt = G.time; G.doorWalk = { d, other, t: 0, dur: d.kind === 'boss' ? 0.6 : 0.45 }; }
  }
}

// v10 (Connor's note 11): right after the lesson, a trial post in the shrine that only the new power can move.
// Training posts are wrapped in straw and a paper charm in the element's colour; anything else just knocks on wood.
const TRIAL_X = { kh2: 1500, ds3: 1450, nq4: 1080, km4: 1500 };
export function spawnTrial(el, drop = false) {
  const room = G.room; if (!room.shrine || room.shrine.el !== el || flag('trial-' + el) || G.enemies.some((e) => e.type === 'post')) return;
  const x = TRIAL_X[room.id] || room.shrine.x + 500;
  const e = spawnEnemy('post', x, drop ? room.shrine.y - 500 : room.shrine.y, { el, trialFlag: 'trial-' + el });
  if (drop) { e.dropIn = 1; e.vy = 200; }
  Sound.sfx('post-rise', { x });   // v11: the trial post knocks into place
}
function learnShrine(el, after = null) {
  const s = G.save, p = G.player;
  const fresh = MOVE_ORDER.filter((m) => MOVES[m].el === el && !s.moves.includes(m));
  let unslotted = false;
  for (const m of fresh) {
    s.moves.push(m);
    const free = s.slots.indexOf(null);
    if (free >= 0) s.slots[free] = m; else unslotted = true;
  }
  setFlag('shrine-' + el);
  if (el === 'air') s.abil.dash = true;
  p.hp = s.maxHp;
  persist();
  p.breath = maxBreath();
  if (fresh.length) { shake(6); burst(p.x, p.y - 90, 24, { color: ['#ffffff', '#ffe9a8'], min: 60, max: 420, life: 0.8, size: 12, grav: -100 }); }
  Sound.sfx('shrine');
  const equip = unslotted ? () => openEquip('New moves learned. Choose which four to carry.') : null;
  // the Elder waits at every shrine; she speaks once the lesson is read
  const talk = G.npc && fresh.length ? npcTalk() : null;
  const next = () => { if (equip) equip(); if (after) after(); };
  openLesson(el, talk ? () => openTalk(talk, next) : next);
}

export function openLesson(id, then = null) {
  G.lesson = { id, ...LESSONS[id], t: 0, then };
  G.state = 'lesson';
  const L = G.save.lessons || (G.save.lessons = []);
  if (!L.includes(id)) { L.push(id); persist(); }
  G.save.lastLesson = id;
  Sound.sfx('fanfare'); Sound.sfx('skill-learn', { delay: 0.35, vol: 0.8 });
}

export function openEquip(note = '', view = false) {
  G.menu = { type: 'equip', sel: 0, mode: 'grid', slot: 0, note, t: 0, view };   // v14: view = the inventory (I), read-only away from a stone
  G.state = 'equip';
}

export function startEnding() {
  G.menu = { type: 'ending', t: 0 };
  G.state = 'ending';
  Sound.play('ending'); Sound.ambience(null); Sound.stopLoops();
}

// Cutscene: illustrated stills with captions, a slow pan and zoom.
export function openCutscene(id, then = null) {
  // resolve each slide's painting; slides marked need are dropped while their art is missing
  const C = (CUTSCENES[id] || []).map((sl) => ({ ...sl, img: [].concat(sl.img).find((k) => Assets.has(k)) || [].concat(sl.img).pop() }))
    .filter((sl) => !sl.need || Assets.has(sl.img));
  if (!C.length) { if (then) then(); return; }
  setFlag('cut-' + id);
  Sound.sfx('cutscene-page', { rate: 0.9 });
  G.cut = { id, slides: C, i: 0, t: 0, then };
  G.state = 'cutscene';
}
export function openShop() { G.menu = { type: 'shop', sel: 0, t: 0, note: '' }; G.state = 'shop'; Sound.sfx('shop-open'); }

// --- pickups ---------------------------------------------------------------------------
export function updatePickups(dt) {
  const p = G.player, s = G.save;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i];
    if (k.respawn > 0) { k.respawn -= dt; continue; }
    if (k.dropped) {
      k.life -= dt;
      if (k.life <= 0) { G.pickups.splice(i, 1); continue; }
      k.vy += 1700 * dt; k.x += k.vx * dt; k.y += k.vy * dt;
      if (k.vy > 0 && pointSolid(k.x, k.y + 22)) { k.vy = 0; k.vx *= 0.86; }
    }
    if (p.dead) continue;
    const dx = p.x - k.x, dy = p.y - 75 - k.y, d = Math.hypot(dx, dy);
    if (k.t === 'wisp') {
      // v10: a defeated foe's wisps rise, then fly to Joon wherever he is in the room
      if (k.homeT != null) { k.homeT -= dt; if (k.homeT <= 0 && d > 1) { const sp = (900 + 1400 * Math.min(1, -k.homeT)) * dt; k.x += (dx / d) * Math.min(sp, d); k.y += (dy / d) * Math.min(sp, d); k.vx *= 0.8; k.vy = Math.min(k.vy, 0) * 0.8; k.life = Math.max(k.life, 2); } }
      else if (d < 190 && d > 1) { const sp = 950 * dt; k.x += (dx / d) * Math.min(sp, d); k.y += (dy / d) * Math.min(sp, d); }
      if (d < 60) {
        addBreath(k.dropped ? 8 : 10);
        Sound.sfx('breath-gain', { gap: 0.05, vol: 0.7 });
        burst(k.x, k.y, 6, { color: ['#eafcff', '#bfe9f2'], min: 40, max: 220, life: 0.35, size: 8, grav: 0 });
        if (k.dropped) G.pickups.splice(i, 1); else { k.respawn = 9; k.x = k.hx; k.y = k.hy; }
      }
    } else if (k.t === 'heart' && d < 90) {
      // a Lotus Petal piece: four of them make a whole petal (+1 health)
      s.pieces = (s.pieces || 0) + 1; setFlag(k.id);
      const whole = s.pieces % 4 === 0;
      if (whole) { s.maxHp += 1; p.hp = s.maxHp; }
      persist();
      hitstop(0.12); shake(6);
      burst(k.x, k.y, 20, { color: ['#ffffff', '#e2574c', '#ffb3a6'], min: 60, max: 380, life: 0.7, size: 12 });
      if (whole) toast('Lotus Petal', '', 2.6);
      else toast(`Lotus Petal ${s.pieces % 4}/4`, '', 2.4);
      Sound.sfx(whole ? 'fanfare' : 'petal');
      G.pickups.splice(i, 1);
    } else if (k.t === 'bead' && d < 90) {
      s.maxBreath = (s.maxBreath || 100) + 25; p.breath = maxBreath(); setFlag(k.id); persist();
      hitstop(0.12); shake(6);
      burst(k.x, k.y, 20, { color: ['#ffffff', '#bfe9f2', '#7fb6c4'], min: 60, max: 380, life: 0.7, size: 12 });
      toast('Wind Pearl', '', 2.6);
      Sound.sfx('pearl');
      G.pickups.splice(i, 1);
    } else if (k.t === 'mark' && d < 90) {
      s.marks = (s.marks || 0) + 1; setFlag(k.id); persist();
      hitstop(0.12); shake(6);
      burst(k.x, k.y, 20, { color: ['#ffffff', '#9be0a8', '#ffe9a8'], min: 60, max: 380, life: 0.7, size: 12 });
      toast('Spirit Mark', '', 2.6);
      Sound.sfx('fanfare');
      G.pickups.splice(i, 1);
    } else if (k.t === 'jade') {
      if (k.life < 13.5 && d < 220 && d > 1) { const sp = 1100 * dt; k.x += (dx / d) * Math.min(sp, d); k.y += (dy / d) * Math.min(sp, d); }
      if (d < 50) { s.jade = (s.jade || 0) + 1; Sound.sfx('bead', { gap: 0.02 }); G.jadeT = 1.5; G.pickups.splice(i, 1); hudFly('bead', k.x - G.cam.x, k.y - G.cam.y); }   // v9: the bead flies to the counter
    } else if (k.t === 'bloom' && d < 80) {
      if (p.hp >= s.maxHp) continue;
      p.hp = Math.min(s.maxHp, p.hp + 1);
      burst(k.x, k.y, 12, { color: ['#ffffff', '#ffb3a6', '#9be08a'], min: 60, max: 260, life: 0.5, size: 10 });
      Sound.sfx('bloom');
      G.pickups.splice(i, 1);
    }
  }
}

// --- camera ----------------------------------------------------------------------------
let look = 0, lookY = 0, lookHold = 0, lookDir = 0;
export function updateCamera(dt, snap = false) {
  const p = G.player, room = G.room, c = G.cam;
  // lead by where you are going, not where you face; a small dead zone so a turn doesn't swing the view
  const want = Math.abs(p.vx) > 60 ? clamp(p.vx * 0.42, -220, 220) : look;
  look = snap ? p.face * 110 : lerp(look, want, Math.min(1, dt * 4));
  // camera zoom (boss intros) eases back to 1
  if (!snap) G.zoom = lerp(G.zoom, G.zoomTarget || 1, Math.min(1, dt * 3)); else G.zoom = 1;
  if (G.zoomHold > 0) G.zoomHold -= dt; else G.zoomTarget = 1;
  for (const g of room.gates) if (!g.open && Math.abs(g.x - p.x) < 700 && Math.abs(g.y - p.y) < 500 && !G.save.seen[g.id]) G.save.seen[g.id] = g.t;
  let lo = 0, hi = room.w - W;
  // inside a walled arena the view holds on the arena
  if (room.barriers.length >= 2 && room.w > W) {
    lo = clamp(Math.min(...room.barriers.map((b) => b.x)), 0, room.w - W);
    hi = clamp(Math.max(...room.barriers.map((b) => b.x + b.w)) - W, lo, room.w - W);
  }
  const tx = clamp(p.x + look - W / 2, lo, Math.max(lo, hi));
  // v7: standing still and holding up or down for half a second looks 200 px that way (the shafts)
  const still = p.onGround && Math.abs(p.vx) < 30 && !p.atk && !(p.healT > 0) && G.state === 'play';
  const hold = still && Input.held.up && !Input.held.down ? -1 : still && Input.held.down && !Input.held.up && !Input.held.interact ? 1 : 0;
  lookHold = hold && hold === lookDir ? lookHold + dt : 0; lookDir = hold;
  const peek = lookHold > 0.5 ? hold * 200 : 0;
  if (!snap) lookY = lerp(lookY, p.vy > 900 ? 160 : peek, Math.min(1, dt * (peek ? 2.5 : 3)));   // peek down on a long fall
  // v8 (review 8 #8): clamp first, then look, then clamp again, so looking works at the top and bottom of a shaft
  const maxY = Math.max(0, room.h - H), ty = clamp(clamp(p.y - H * (room.h > H ? 0.58 : 0.62), 0, maxY) + lookY, 0, maxY);
  if (snap) { c.x = tx; c.y = ty; return; }
  c.x = lerp(c.x, tx, Math.min(1, dt * 10));
  c.y = lerp(c.y, ty, Math.min(1, dt * 6));
}

// --- hints -----------------------------------------------------------------------------
export function hasAbility(k) {
  const s = G.save;
  return k === 'glide' ? s.abil.glide : k === 'doubleJump' ? s.abil.doubleJump : s.moves.includes(k);
}
export function activeHint() {
  const p = G.player, room = G.room;
  if (p.dead || room.fight && room.fight.phase !== 'done') return null;
  if (G.respawnT != null && G.time - G.respawnT < 6) return null;   // v7: let the player breathe after a fall
  // v5: never during a fight, with an enemy close, or while someone is talking
  if (G.boss || G.talk || G.enemies.some((e) => !e.dead && Math.abs(e.x - p.x) < 900 && Math.abs(e.y - p.y) < 700)) return null;
  for (const h of room.hints) {
    if (h.need && !hasAbility(h.need)) continue;
    if (h.without && hasAbility(h.without)) continue;
    if (h.until && flag(h.until)) continue;
    if (p.x > h.r.x && p.x < h.r.x + h.r.w && p.y - 60 > h.r.y && p.y - 60 < h.r.y + h.r.h) {
      // each hint shows at most twice per save, then never again
      const key = room.id + ':' + room.hints.indexOf(h), seen = G.save.hintSeen = G.save.hintSeen || {};
      if (G.lastHint !== key) { G.lastHint = key; G.hintT = 0; seen[key] = (seen[key] || 0) + 1; }
      G.hintT = (G.hintT || 0) + 1 / 60;
      if (h.sign) return h.text ? h : null;   // v9: a signpost reads every time you stand at it (v11: picture boards say nothing)
      return seen[key] <= 2 && G.hintT < 5 ? h : null;   // at most 5 s a time, twice per save
    }
  }
  G.lastHint = null;
  return null;
}

// --- v9 (Connor's note 8): where to go next -----------------------------------------------
// The Elder's counsel: one goal at a time, read from the save. `room` is where it is done; `near` is a short
// line about the way there.
const GOALS = [
  { done: 'shrine-air', short: 'the Shrine of Wind waits east of the yard', room: 'kh2', text: 'Kneel at the Shrine of Wind in the Hall of Winds.', near: 'East of the Monastery Yard.' },
  { done: 'shutter-west', short: 'ring the chimes by the yard\'s west gate', room: 'kh1', text: 'Ring the chimes by the west gate with a Gust.', near: 'The rig stands by the west shutter of the Monastery Yard.' },
  { done: 'ambush-kh7', short: 'the West Gate must be won first', room: 'kh7', text: 'Break the lantern-bearers\' hold on the West Gate.', near: 'Through the west shutter.' },
  { done: 'shrine-water', short: 'Mother Ren waits in the Drowned Steps', room: 'ds3', text: 'Find Mother Ren in the Drowned Steps.', near: 'West from the Monastery Yard, through the West Gate and down the terraces.' },
  { done: 'boss-reed', short: 'the Rime Warden waits at the Frozen Sluice', room: 'ds6', text: 'Face the Rime Warden at the Frozen Sluice.', near: 'West of the Sunken Shrine, past the River Channels.' },
  { done: 'shrine-earth', short: 'Old Tamsin waits in the quarry, back east past the Monastery Yard', room: 'nq4', text: 'Find Old Tamsin in Ninefold Quarry.', near: 'Back to the Monastery Yard, then east through Chime Crossroads to the Flooded Stairwell: raise ice on the water to cross.' },
  { done: 'boss-colossus', short: 'the Colossus sleeps under the quarry', room: 'nq6', text: 'Wake the Colossus in the pit under the quarry.', near: 'Break the cracked floor in the Shrine of Nine Steps.' },
  { done: 'shrine-fire', short: 'Kesh waits in Kilnmouth, under Chime Crossroads', room: 'km4', text: 'Find Kesh in Kilnmouth.', near: 'Break the cracked flagstones in Chime Crossroads; the cellar tunnel runs west.' },
  { done: 'boss-overseer', short: 'the Overseer\'s furnace lies west of the Drying Yards', room: 'km6', text: 'Stop the Overseer at his furnace.', near: 'West through the Drying Yards.' },
  { done: 'boss-captain', short: 'the Captain holds the Brass Gate beyond the gorge', room: 'bg5', text: 'Cross the gorge and face the Captain at the Brass Gate.', near: 'Burn the thornwood at the Gorge Lookout, then glide.' },
];
export function currentGoal() {
  const s = G.save; if (!s) return null;
  return GOALS.find((g) => !s.flags[g.done]) || null;
}
// Shortest way through the rooms from `from` to `to` (exits, and passages that are open). Returns the first step:
// { to, exit } or { to, door }, or null.
// v10 (review 10 #1): a way behind a gate Joon can't open yet (a cracked floor without Earth Slam, thornwood without Fire
// Blast, a shutter without Gust) is closed to the guide. A gate lies across a way when it stands between where Joon
// comes into the room and the exit (or, for a floor exit, over it).
const GATE_MOVE = { crack: 'slam', branch: 'fireblast', shutter: 'gust', water: 'icewall' };   // v11: water gaps are gates too (review 11 #2)
const roomGates = (d) => [...(d.gates || []), ...(d.wgaps || [])];
export const gateOpenable = (g) => flag(g.id) || (GATE_MOVE[g.t] && G.save.moves.includes(GATE_MOVE[g.t]));
function gateAcross(d, g, entryX, st) {
  const [gx, gy, gw, gh] = g.r;
  if (st.exit && st.exit.side === 'bottom') return g.t === 'crack' && gx < st.exit.range[1] && gx + gw > st.exit.range[0];
  if (g.t === 'crack') return false;
  // v11: a water gap lies across any way that runs over it (it sits in a trough, so the exit's height doesn't matter)
  if (g.t === 'water') { const ex = st.door ? st.door.x : st.exit.side === 'left' ? 0 : d.w; return gx + gw > Math.min(entryX, ex) && gx < Math.max(entryX, ex); }
  // a thornwood or shutter up on a ledge is a side way, not the way: only one standing on the lowest floor there closes it
  const cx = gx + gw / 2, floors = (d.solids || []).filter((q) => cx > q[0] && cx < q[0] + q[2] && q[1] >= gy).map((q) => q[1]);
  if (floors.length && Math.abs(Math.max(...floors) - (gy + gh)) > 60) return false;
  const ex = st.door ? st.door.x : st.exit.side === 'left' ? 0 : d.w, lo = Math.min(entryX, ex), hi = Math.max(entryX, ex);
  if (gx + gw < lo || gx > hi) return false;
  if (st.exit) { const [r0, r1] = st.exit.range; if (gy > r1 || gy + gh < r0) return false; }
  return true;
}
// v12 (note 28): ways that need a movement power, not a gate (the solver and the guide both read this)
const ABIL_EDGE = { 'kh6>bg1': 'glide' };
export function routeStep(from, to, entry = G.player ? G.player.x : 0) {
  if (from === to) return null;
  const prev = { [from]: null }, q = [[from, entry]];
  while (q.length) {
    const [id, ex] = q.shift(), d = ROOMS[id];
    const steps = [...(d.exits || []).map((e) => ({ to: e.to, exit: e, at: e.at && e.at[0] })), ...(d.doors || []).filter((x) => !x.lock || flag(x.lock)).map((x) => ({ to: x.to, door: x, at: ((ROOMS[x.to] && ROOMS[x.to].doors) || []).find((o) => o.id === x.id)?.x }))];
    for (const st of steps) {
      if (!ROOMS[st.to] || st.to in prev) continue;
      if (st.exit && exitBlocked(id, st.exit)) continue;   // v12: a blockage is a wall
      if (ABIL_EDGE[id + '>' + st.to] && !G.save.abil[ABIL_EDGE[id + '>' + st.to]]) continue;   // v12: a gap only a power crosses
      const shut = roomGates(d).find((g) => !gateOpenable({ id: g.id, t: g.t }) && gateAcross(d, g, ex, st));
      if (shut) continue;
      prev[st.to] = { id, st };
      if (st.to === to) { let c = to; while (prev[c].id !== from) c = prev[c].id; return prev[c].st; }
      q.push([st.to, st.at ?? ROOMS[st.to].w / 2]);
    }
  }
  return null;
}
// Where in this room the way on lies (for the guide wisp and the exit glow).
export function wayPoint(step) {
  const p = G.player, room = G.room;
  if (step.door) return { x: step.door.x, y: step.door.y - 130 };
  const e = step.exit;
  if (e.side === 'bottom') return { x: (e.range[0] + e.range[1]) / 2, y: room.h - 60 };
  return { x: e.side === 'left' ? 50 : room.w - 50, y: clamp(p.y - 110, e.range[0] + 70, e.range[1] - 50) };
}
// After about a minute with no new room and no new flag, a wisp of wind drifts toward the way on.
export function updateGuide(dt) {
  const p = G.player;
  if (!p || G.state !== 'play' || p.dead) return;
  G.playT = (G.playT || 0) + dt;
  if (G.progressAt == null) G.progressAt = G.playT;
  const w = G.guide;
  if (w) {
    if (w.room !== G.room.id) { G.guide = null; return; }
    w.t += dt;
    const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy), ahead = Math.hypot(w.x - p.x, w.y - (p.y - 100));
    const sp = ahead > 520 ? 40 : d < 30 ? 0 : 300;
    if (d > 1) { w.x += dx / d * Math.min(d, sp * dt); w.y += dy / d * Math.min(d, sp * dt) + Math.sin(w.t * 3) * 20 * dt; }
    if (Math.random() < 0.5) G.parts.push({ x: w.x + rnd(-10, 10), y: w.y + rnd(-10, 10), vx: rnd(-30, 30), vy: rnd(-40, 10), life: 0.7, max: 0.7, size: rnd(4, 8), color: '#eafcff', grav: 0 });
    if (d < 40) w.arrivedT = (w.arrivedT || 0) + dt;
    if (w.arrivedT > 5 || w.t > 40) G.guide = null;
    return;
  }
  barrierSeen(p);
  const now = G.wispAt && G.playT >= G.wispAt;
  if ((G.playT - G.progressAt < 60 && !now) || G.boss || G.room.fight || G.enemies.some((e) => !e.dead && Math.abs(e.x - p.x) < 900)) return;
  const goal = currentGoal(); if (!goal) return;
  const step = routeStep(G.room.id, goal.room);
  const wp = step ? wayPoint(step) : goal.room === G.room.id ? goalSpot(goal) : null;
  if (!wp) return;
  G.progressAt = G.playT - 30;   // the next wisp comes 30 s after this one if nothing changes
  G.wispAt = 0;
  G.guide = { room: G.room.id, x: p.x + p.face * 60, y: p.y - 150, tx: wp.x, ty: wp.y, t: 0 };
  Sound.sfx('wisp-guide', { x: p.x });
}
// v11 (Connor's note 25, review 11 #2): a barrier Joon can't open yet says so, once per kind, and sends him on.
// The Elder's line is what it needs, then the current goal's short form; the barrier keeps a painted mark from then on
// (world.js drawBarrierMark) and the wisp sets off toward the way on as soon as the line is closed.
export const GATE_MARK = { branch: 'fire', crack: 'earth', shutter: 'wind', water: 'water' };
const GATE_LINE = { branch: 'That bramble needs fire.', crack: 'That stone wants a heavier hand.', shutter: 'Only wind turns those chimes.', water: 'Too deep to wade. Water must be taught to hold you.' };
const REFUSE_SFX = { branch: 'barrier-refuse-thorn', crack: 'barrier-refuse-stone', shutter: 'barrier-refuse-stone', water: 'barrier-refuse-water' };
export function closedBarriers(room = G.room) {
  const d = ROOMS[room.id] || {};
  const list = room.gates.filter((g) => !g.open && !g.lifting && GATE_MOVE[g.t]).map((g) => ({ id: g.id, t: g.t, x: g.x, y: g.y, w: g.w, h: g.h }));
  for (const q of d.wgaps || []) if (!G.save.moves.includes('icewall')) list.push({ id: q.id, t: 'water', x: q.r[0], y: q.r[1], w: q.r[2], h: q.r[3] });
  return list.filter((g) => !gateOpenable(g));
}
function barrierSeen(p) {
  // v11: a signpost's boards creak once as Joon reaches them
  for (const h of G.room.hints) if (h.post && Math.abs(h.post[0] - p.x) < 110 && Math.abs(h.post[1] - p.y) < 120) { if (G.signCreak !== h) { G.signCreak = h; Sound.sfx('sign-creak', { x: h.post[0] }); } } else if (G.signCreak === h) G.signCreak = null;
  if (G.talk || G.attune || G.boss || fightingNear(p)) return;
  for (const g of closedBarriers()) {
    const dx = Math.max(g.x - p.x, 0, p.x - (g.x + g.w)), dy = Math.max(g.y - (p.y - 60), 0, (p.y - 60) - (g.y + g.h));
    if (Math.hypot(dx, dy) > 170) continue;
    if (!flag('seen-' + g.id)) setFlag('seen-' + g.id);
    if (G.time > (G.refuseAt || 0) && Math.hypot(dx, dy) < 40) { G.refuseAt = G.time + 3; Sound.sfx(REFUSE_SFX[g.t] || 'thud-wall', { x: g.x + g.w / 2, vol: 0.8 }); }
    if (flag('told-' + g.t)) continue;
    setFlag('told-' + g.t);
    const goal = currentGoal(), sh = goal && goal.short ? goal.short : '';
    TALKS.barrier = { lines: [GATE_LINE[g.t] + (sh ? ' Not yet: ' + sh[0].toUpperCase() + sh.slice(1) + '.' : ' Not yet.')] };
    G.flagMarkT = { id: g.id, t: 0 };
    openTalk('barrier', () => { G.wispAt = G.playT + 0.6; });
    return;
  }
}
const fightingNear = (p) => !!(G.room.fight && G.room.fight.phase !== 'done') || !!G.teachHeal || G.enemies.some((e) => !e.dead && !e.boss && e.type !== 'post' && Math.abs(e.x - p.x) < 800 && Math.abs(e.y - p.y) < 600);   // never mid-fight: the line waits for a quiet moment
function goalSpot(goal) {
  const d = ROOMS[goal.room];
  if (d.shrine) return { x: d.shrine.x, y: d.shrine.y - 160 };
  if (d.boss) return { x: d.boss.x || d.w / 2, y: (d.boss.y || 900) - 160 };
  if (d.wheels) return { x: d.wheels[0].x, y: d.wheels[0].y - 160 };
  return null;
}

// v10 (Connor's note 16): while a caught shot hangs, the stick aims it (free aim on a stick, 8 ways on the D-pad or
// keys); it flies when the window ends or on a strike. The world crawls at 12% meanwhile.
export function updateAim(dt) {
  const a = G.aim, I = Input, p = G.player;
  if (!a || !p || p.dead) { G.aim = null; return; }
  a.t += dt;
  const st = I.stick;
  if (st && st.mag > 0.35) { const m = Math.hypot(st.x, st.y); a.ax = st.x / m; a.ay = st.y / m; }
  else { const dx = (I.held.right ? 1 : 0) - (I.held.left ? 1 : 0), dy = (I.held.down ? 1 : 0) - (I.held.up ? 1 : 0); if (dx || dy) { const m = Math.hypot(dx, dy); a.ax = dx / m; a.ay = dy / m; } }
  if (Math.abs(a.ax) > 0.2) p.face = Math.sign(a.ax);
  G.slowT = 0.05; G.slowK = 0.12;
  if (a.t >= a.dur || (a.t > 0.1 && I.pressed.attack)) { p.atkBuf = 0; releaseShot(); }
}

// v10 (Connor's note 20): the Elder teaches Still Breath by situation, once, after the first real knock in Kite Hill.
// v11 (note 24, review 11 #1): the lesson no longer stops time. Joon gets 1.5 s of safety, the living foes are pushed
// back a step and may not START a new attack for up to 4 s (bodies, hurt states and shots all keep moving), and the
// lesson ends on the first heal, when his hearts are full, or after 6 s, whichever comes first. No prompt bar.
export function teachHeal() {
  const p = G.player;
  if (flag('taught-heal') || G.teachHeal || p.dead || !G.save.moves.length) return;
  G.teachHeal = { t: 0 };
  p.breath = Math.max(p.breath, maxBreath());
  later(0.5, () => {
    if (!G.teachHeal || p.dead) return;
    openTalk('teachHeal', () => {
      if (!G.teachHeal) return;
      G.teachHeal.t = 0; p.inv = Math.max(p.inv, 1.5);
      for (const e of G.enemies) if (!e.dead && !e.boss) { const d = Math.sign(e.x - p.x) || 1; e.vx = d * 420; e.holdT = Math.max(e.holdT || 0, 0.6); }
    });
  });
}
export function healTaught() {
  if (!G.teachHeal) return;
  G.teachHeal = null; setFlag('taught-heal');
}

export const maxBreath = () => ((G.save && G.save.maxBreath) || 100) + (G.save && G.save.skills && G.save.skills.deepwell ? 25 : 0);
export const regionOf = (id) => REGIONS[ROOMS[id].region];
