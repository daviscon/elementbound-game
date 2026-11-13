// v15 (Connor's note 70: the map is "super ugly"): a Silksong-style map. The world is one illustrated parchment painting
// (ui/map-world.png, traced from tools/c15/map/map-layout.png, so its pixels line up with the rooms' map cells), hidden
// under parchment fog (ui/map-parchment.png) except where Joon has walked: a room reveals itself the moment he enters it,
// and the rooms its exits lead to show faintly through the fog. Icons (ui/map-icons.png, 8 cells: rest stone, boss crest,
// shrine, door, Joon, locked gate, pickup, pin) sit at the real positions. Only washes, light and UI chrome are code.
import { G, clamp } from './game.js';
import { W, REGIONS } from './config.js';
import { ROOMS } from './world.js';
import { Assets } from './assets.js';
import { Input } from './input.js';
import * as D from './draw.js';
import * as Flow from './flow.js';

const LAYOUT_W = 2048, MARGIN = 1.5;   // tools/c15/maplayout.mjs: pixel = (mapCell - grid0 + MARGIN) * cell
let grid = null;
function layout() {
  if (grid) return grid;
  const ids = Object.keys(ROOMS).filter((id) => ROOMS[id].map);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const id of ids) { const c = ROOMS[id].map; x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0] + c[2]); y1 = Math.max(y1, c[1] + c[3]); }
  const cell = LAYOUT_W / (x1 - x0 + MARGIN * 2);
  grid = { ids, x0, y0, cell, h: Math.round((y1 - y0 + MARGIN * 2) * cell) };
  return grid;
}
// a room's rect in layout pixels (the same gap the layout render used)
function roomPx(id) {
  const g = layout(), m = ROOMS[id].map, gap = g.cell * 0.06;
  return { x: (m[0] - g.x0 + MARGIN) * g.cell + gap, y: (m[1] - g.y0 + MARGIN) * g.cell + gap, w: m[2] * g.cell - gap * 2, h: m[3] * g.cell - gap * 2 };
}

export const worldMapReady = () => Assets.has('ui.mapworld');

let fogCv = null;
// Returns false (the old map draws) until the painted map has landed.
export function drawWorldMap(ctx, m) {
  const art = Assets.get('ui.mapworld'); if (!art) return false;
  const s = G.save, t = G.uiTime || 0, g = layout(), parch = Assets.get('ui.parchment'), icons = Assets.get('ui.mapicons2');
  // the band the map sits in, under the title bar
  const BX = 140, BY = 226, BW = 1640, BH = 580;
  const fit = Math.min(BW / LAYOUT_W, BH / g.h), z = fit * clamp(m.zoom || 1, 1, 3);
  let ox = BX + (BW - LAYOUT_W * z) / 2, oy = BY + (BH - g.h * z) / 2;
  if ((m.zoom || 1) > 1.001 && G.room && ROOMS[G.room.id].map) {   // zoomed: centre on where Joon is, then pan
    const r = roomPx(G.room.id), k = Math.min(1, (m.zoom - 1) / 0.6);
    ox += (BX + BW / 2 - (ox + (r.x + r.w / 2) * z)) * k - (m.pan || 0) * BW;
    oy += (BY + BH / 2 - (oy + (r.y + r.h / 2) * z)) * k;
  }
  const P = (x, y) => [ox + x * z, oy + y * z];
  const visited = (id) => !!s.visited[id] || (G.room && G.room.id === id);
  const hinted = new Set();
  for (const id of g.ids) if (visited(id)) for (const e of [...(ROOMS[id].exits || []), ...(ROOMS[id].doors || [])]) if (ROOMS[e.to] && ROOMS[e.to].map && !visited(e.to)) hinted.add(e.to);

  ctx.save();
  D.rr(ctx, BX - 10, BY - 10, BW + 20, BH + 20, 18); ctx.clip();
  if (parch) ctx.drawImage(parch.img, BX - 10, BY - 10, BW + 20, BH + 20); else { ctx.fillStyle = '#e9dcc0'; ctx.fillRect(BX - 10, BY - 10, BW + 20, BH + 20); }
  ctx.drawImage(art.img, ox, oy, LAYOUT_W * z, g.h * z);
  // the fog: parchment over everything, with soft holes where Joon has been (and faint ones where his exits lead)
  const fw = Math.ceil(BW + 20), fh = Math.ceil(BH + 20);
  if (!fogCv) fogCv = document.createElement('canvas');
  if (fogCv.width !== fw || fogCv.height !== fh) { fogCv.width = fw; fogCv.height = fh; }
  const f = fogCv.getContext('2d');
  f.globalCompositeOperation = 'source-over'; f.filter = 'none'; f.globalAlpha = 1;
  f.clearRect(0, 0, fw, fh);
  if (parch) f.drawImage(parch.img, 0, 0, fw, fh); else { f.fillStyle = '#e4d5b5'; f.fillRect(0, 0, fw, fh); }
  f.globalCompositeOperation = 'destination-out'; f.filter = `blur(${Math.max(6, g.cell * z * 0.35)}px)`;
  const hole = (id, a) => { const r = roomPx(id), pad = g.cell * 0.55; f.globalAlpha = a; f.fillStyle = '#000'; f.fillRect(ox - BX + 10 + (r.x - pad) * z, oy - BY + 10 + (r.y - pad) * z, (r.w + pad * 2) * z, (r.h + pad * 2) * z); };
  for (const id of g.ids) if (visited(id)) hole(id, 1);
  for (const id of hinted) hole(id, 0.32);
  f.filter = 'none'; f.globalAlpha = 1; f.globalCompositeOperation = 'source-over';
  ctx.drawImage(fogCv, BX - 10, BY - 10);

  // icons, from the painted sheet: each is the square in the middle of its cell
  const icon = (i, x, y, sz, a = 1) => {
    if (!icons) return; const cw = icons.img.width / 8, side = Math.min(cw, icons.img.height), sy = (icons.img.height - side) / 2;
    ctx.save(); ctx.globalAlpha *= a; ctx.drawImage(icons.img, i * cw + (cw - side) / 2, sy, side, side, x - sz / 2, y - sz / 2, sz, sz); ctx.restore();
  };
  const isz = clamp(g.cell * z * 0.62, 26, 58);
  const at = (id, wx, wy) => { const r = roomPx(id), d = ROOMS[id]; return P(r.x + clamp(wx / d.w, 0.1, 0.9) * r.w, r.y + clamp(wy / d.h, 0.2, 0.85) * r.h); };
  for (const id of g.ids) {
    if (!visited(id)) continue;
    const d = ROOMS[id];
    for (const dr of d.doors || []) { const locked = dr.lock && !s.flags[dr.lock]; icon(locked ? 5 : 3, ...at(id, dr.x, dr.y - 60), isz * 0.8); }
    for (const k of d.pickups || []) if (k.id && !s.flags[k.id] && k.t !== 'wisp') icon(6, ...at(id, k.x, k.y), isz * 0.7);
    if (d.stone) icon(0, ...at(id, d.stone.x, d.stone.y - 40), isz);
    if (d.shrine) icon(2, ...at(id, d.shrine.x, d.shrine.y - 60), isz);
    if (d.boss && d.boss.t !== 'ambush') icon(1, ...at(id, d.boss.x || d.w / 2, (d.boss.y || d.h) - 140), isz * 1.1, s.flags['boss-' + d.boss.t] ? 0.45 : 1);
    if ((s.pins || []).includes(id)) { const r = roomPx(id); icon(7, ...P(r.x + r.w - g.cell * 0.2, r.y + g.cell * 0.2), isz * 0.8); }
  }
  // with the Wayfinder's chart: every rest stone, found or not, faintly
  if (s.flags['shop-wayfinder']) for (const id of g.ids) if (!visited(id) && ROOMS[id].stone) icon(0, ...at(id, ROOMS[id].stone.x, ROOMS[id].stone.y - 40), isz * 0.85, 0.6);
  // the Elder's goal: a pulsing gold ring (UI chrome) on its room, found or not
  const goal = Flow.currentGoal();
  if (goal && ROOMS[goal.room] && ROOMS[goal.room].map) {
    const r = roomPx(goal.room), [x, y] = P(r.x, r.y), k = 0.5 + 0.5 * Math.sin(t * 4);
    D.rr(ctx, x - 6, y - 6, r.w * z + 12, r.h * z + 12, 12); ctx.lineWidth = 5; ctx.strokeStyle = `rgba(214,160,40,${0.5 + 0.45 * k})`; ctx.stroke();
  }
  // the satchel Joon dropped
  if (s.satchel && ROOMS[s.satchel.room] && visited(s.satchel.room)) icon(6, ...at(s.satchel.room, s.satchel.x, s.satchel.y - 40), isz, 0.9);
  // Joon himself, bobbing, with the you-are-here pin over him
  if (G.room && ROOMS[G.room.id].map) {
    const [x, y] = at(G.room.id, G.player.x, G.player.y - 80), k = Math.sin(t * 5);
    icon(4, x, y, isz * 1.05);
    icon(7, x, y - isz * 0.85 + k * 4, isz * 0.8);
  }
  // each region's name once, over the rooms of it you have walked
  for (const key of Object.keys(REGIONS)) {
    const mine = g.ids.filter((id) => ROOMS[id].region === key && visited(id)); if (!mine.length) continue;
    let x0 = 1e9, x1 = -1e9, y1 = -1e9; for (const id of mine) { const r = roomPx(id); x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    const [cx, cy] = P((x0 + x1) / 2, y1 + g.cell * 0.55);
    ctx.font = D.font(clamp(g.cell * z * 0.5, 20, 34), 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(243,232,205,0.85)'; ctx.strokeText(REGIONS[key].name, cx, cy);
    ctx.fillStyle = '#3a2418'; ctx.fillText(REGIONS[key].name, cx, cy);
  }
  ctx.restore();
  // a brushed frame round the sheet (UI chrome)
  D.rr(ctx, BX - 10, BY - 10, BW + 20, BH + 20, 18); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(60,38,24,0.85)'; ctx.stroke();

  const ids = g.ids, seen = ids.filter((id) => visited(id));
  const txt = (str, x, y, size, col, align = 'left', weight = 700) => { ctx.font = D.font(size, weight); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(str, x, y); };
  txt(`${seen.length} of ${ids.length} rooms found`, 1750, 150, 24, '#6b5a4a', 'right', 600);
  if (G.room) txt(`You are in ${G.room.name}, ${G.room.reg.name}`, 1750, 182, 22, '#2c2334', 'right', 700);
  if (goal) txt('Elder Sora-Lin: ' + goal.text, W / 2, 850, 24, '#8a5a12', 'center', 700);
  if (m.note && (m.noteT -= 1 / 60) > 0) txt(m.note, W / 2, 884, 22, '#9a2e2a', 'center', 700);
  const foot = `[[${Input.label('up')}]][[${Input.label('down')}]] Zoom  [[${Input.label('left')}]][[${Input.label('right')}]] Pan  [[${Input.label('pin')}]] Pin  [[${Input.label('back')}]] Close`;
  D.richText(ctx, foot, 1770 - D.richWidth(ctx, foot, 22), 935, 22, '#2c2334');
  return true;
}
