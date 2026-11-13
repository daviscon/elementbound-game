// One fixed step of the whole game. No DOM in here, so it can also run headless in tests.
import { G } from './game.js';
import { Input } from './input.js';
import { updateRoom } from './world.js';
import { updatePlayer, readPresses } from './player.js';
import { updateMoves } from './moves.js';
import { updateEnemies } from './enemies.js';
import { updateFight } from './bosses.js';
import { updateFx } from './fx.js';
import * as Flow from './flow.js';
import * as UI from './ui.js';
import { Sound } from './audio.js';
import { updateAttune } from './attune.js';
import { W } from './config.js';

export const noticeHead = () => (G.bossCard ? 'boss' : G.toast ? 'toast' : G.card && !(G.card.small && G.card.t > 3.6) ? 'card' : G.banner ? 'banner' : null);

// v12 (Connor's note 32): a menu over play freezes the world. Game time (every animation, water, wisp and flicker drawn
// from G.time) stops; the menus animate on G.uiTime. The music keeps playing on its own audio clock, 6 dB down; game
// sounds that were ringing pause where they are and resume on the way out; held loops stop.
const MENUS = new Set(['pause', 'map', 'equip', 'shop', 'recall']);
export function step(dt) {
  const menu = MENUS.has(G.state) && !!G.room;
  if (!menu) G.time += dt;
  G.uiTime = (G.uiTime || 0) + dt;
  // v8: the mix follows the view (stereo placement)
  if (G.cam) { Sound.view.x = G.cam.x; Sound.view.w = W; }
  Sound.menu(menu);
  if (G.fade) {
    const f = G.fade;
    f.t += dt;
    if (!f.done && f.t >= f.dur / 2) { if (f.hold && f.hold()) f.t = f.dur / 2; else { f.done = true; f.mid(); } }   // v9: a door waits for its region's art
    if (f.t >= f.dur && G.fade === f) G.fade = null;
  }
  switch (G.state) {
    case 'title': UI.updateTitle(); break;
    case 'play': stepPlay(dt); break;
    case 'lesson': UI.updateLesson(dt); break;
    case 'talk': UI.updateTalk(dt); updateFx(dt); Flow.updateTalkSlide(dt); break;   // v6: effects finish under a talk (a phase ring no longer freezes over it)
    case 'equip': UI.updateEquip(); break;
    case 'pause': UI.updatePause(); break;
    case 'map': UI.updateMap(); break;
    case 'ending': UI.updateEnding(dt); break;
    case 'recall': UI.updateRecall(); break;
    case 'cutscene': UI.updateCutscene(dt); break;
    case 'shop': UI.updateShop(); break;
  }
}

function stepPlay(dt) {
  // v5: one message at a time at the top of the screen. The boss card, then a toast, then the
  // region card, then a banner: only the head of that queue is shown and only its clock runs.
  const head = noticeHead();
  if (head === 'toast' && (G.toast.t -= dt) <= 0) G.toast = null;
  if (head === 'banner' && (G.banner.t -= dt) <= 0) G.banner = null;
  if (head === 'card' && (G.card.t += dt) > 3.6) G.card = null;
  if (head === 'boss' && (G.bossCard.t += dt) > 3) G.bossCard = null;
  if (G.boss && G.boss.line && (G.boss.line.t += dt) > 2.6) G.boss.line = null;
  if (G.hurtGlow > 0) G.hurtGlow = Math.max(0, G.hurtGlow - dt / 0.4);
  if (G.jadeT > 0) G.jadeT -= dt;
  G.shake *= 0.86; if (G.shake < 0.4) G.shake = 0;
  for (let i = G.pops.length - 1; i >= 0; i--) if ((G.pops[i].t += dt) > 0.9) G.pops.splice(i, 1);
  readPresses();                            // presses are kept through hit-stop and fades
  if (G.fade) return;                       // the world holds still while the screen fades
  if (Input.pressed.pause) { UI.openPause(); return; }
  if (G.aim) Flow.updateAim(dt);            // v10 (note 16): aiming a caught shot runs in real time
  if (G.attune) updateAttune(dt);           // v10 (note 11): the attunement runs in real time too
  if (Input.pressed.map) { UI.openMap('play'); return; }
  // v14 (Hollow Knight's I): the inventory, the meditation screen read-only; moves and the Path change at a stone
  if (Input.pressed.tab && !G.boss && !(G.room && G.room.fight)) { Flow.openEquip('Look only: change moves and walk the Path at a meditation stone.', true); return; }
  if (G.hitstop > 0) { G.hitstop -= dt; return; }
  // slow motion (the killing blow): the world runs at 30% for a moment
  if (G.slowT > 0) { G.slowT -= dt; if (G.slowT <= 0) G.slowK = null; G.slowAcc = (G.slowAcc || 0) + (G.slowK || 0.3); if (G.slowAcc < 1) return; G.slowAcc -= 1; }

  const due = [];
  for (let i = G.later.length - 1; i >= 0; i--) { const l = G.later[i]; l.t -= dt; if (l.t <= 0) { G.later.splice(i, 1); due.push(l); } }
  for (const l of due) l.fn();
  if (G.state !== 'play') return;

  G.save.time = (G.save.time || 0) + dt;
  updateRoom(dt);
  updatePlayer(dt);
  updateMoves(dt);
  updateEnemies(dt);
  updateFight(dt);
  Flow.updateNpc(dt);
  Flow.updatePickups(dt);
  Flow.updateGuide(dt);   // v9: the guide wisp
  Flow.updateTalkSlide(dt);   // v9: also outside talks (parting at a boss's defeat)
  updateFx(dt);
  Flow.updateCamera(dt);
}
