// Room kits: the platform and prop sheets, cut into pieces by tools/slice-kits.js
// (assets/derived/kits.json holds each piece's box, its flat top and its solid span).
//
// A piece is referenced as { kit: 'kite-hill', set: 'platforms', i: 0 } or, inside room data,
// by its name in the room's region ('ledge', 'rock', 'lantern', ...).
//
// How pieces become geometry:
//   * a solid rectangle is skinned with its region's ground piece (or wall piece for tall
//     rects): the piece's flat top row sits exactly on the rectangle's top, so what you
//     see is what you stand on. Grass tufts and finials poke above it.
//   * one-way platforms are drawn with a floating piece (rock, chained block, rack...)
//     whose flat top is the platform's top.
//   * gates use their gate pieces (cracked slab, branch wall / barricade, brass gate).
//   * water uses the water strip, fire the hot coals, spikes the spike row.

export const SLUG = { kite: 'kite-hill', drowned: 'drowned-steps', quarry: 'ninefold-quarry', kiln: 'kilnmouth', brass: 'brass-gate' };
const BY_SLUG = Object.fromEntries(Object.entries(SLUG).map(([k, v]) => [v, k]));

export const PLATFORMS = {
  kite: ['ledge', 'rock', 'walkway', 'pillar', 'crack', 'branch'],
  drowned: ['ledge', 'stone', 'bridge', 'pillar', 'water', 'highledge'],
  quarry: ['ledge', 'chained', 'scaffold', 'wall', 'crack', 'cart'],
  kiln: ['ledge', 'rack', 'kilntop', 'wall', 'branch', 'coals'],
  brass: ['ledge', 'chained', 'elevator', 'wall', 'gate', 'spikes'],
};
export const PROPS = {
  kite: ['lantern', 'stonelantern', 'flags', 'chimes', 'baskets', 'bellshrine', 'bonsai', 'stone', 'sign', 'kites'],
  drowned: ['reeds', 'lilies', 'stonelantern', 'trap', 'boat', 'spiritstone', 'wheel', 'willow', 'spout', 'hay'],
  quarry: ['picks', 'rubble', 'blocks', 'crane', 'lamppost', 'barrel', 'facestone', 'barrow', 'sign', 'crystals'],
  kiln: ['pots', 'wheel', 'vase', 'logs', 'bellows', 'banner', 'brazier', 'cart', 'spears', 'fence'],
  brass: ['brazier', 'drum', 'spears', 'crates', 'cage', 'banner', 'gong', 'cannon', 'tower', 'chains'],
};

// What each region uses for each job. [region, name] pairs so a region can borrow.
export const ROLES = {
  kite: { ground: ['kite', 'ledge'], wall: ['kite', 'pillar'], float: ['kite', 'rock'], oneway: ['kite', 'rock'], bridge: ['kite', 'walkway'], crack: ['kite', 'crack'], branch: ['kite', 'branch'], water: ['drowned', 'water'], fire: ['kiln', 'coals'], spikes: ['brass', 'spikes'] },
  drowned: { ground: ['drowned', 'ledge'], wall: ['drowned', 'pillar'], float: ['drowned', 'stone'], oneway: ['drowned', 'bridge'], bridge: ['drowned', 'bridge'], crack: ['quarry', 'crack'], branch: ['kite', 'branch'], water: ['drowned', 'water'], fire: ['kiln', 'coals'], spikes: ['brass', 'spikes'] },
  quarry: { ground: ['quarry', 'ledge'], wall: ['quarry', 'wall'], float: ['quarry', 'crack'], oneway: ['quarry', 'chained'], bridge: ['quarry', 'scaffold'], crack: ['quarry', 'crack'], branch: ['kite', 'branch'], water: ['drowned', 'water'], fire: ['kiln', 'coals'], spikes: ['brass', 'spikes'] },
  kiln: { ground: ['kiln', 'ledge'], wall: ['kiln', 'wall'], float: ['kiln', 'kilntop'], oneway: ['kiln', 'rack'], bridge: ['kiln', 'rack'], crack: ['quarry', 'crack'], branch: ['kiln', 'branch'], water: ['drowned', 'water'], fire: ['kiln', 'coals'], spikes: ['brass', 'spikes'] },
  brass: { ground: ['brass', 'ledge'], wall: ['brass', 'wall'], float: ['brass', 'chained'], oneway: ['brass', 'chained'], bridge: ['brass', 'chained'], crack: ['quarry', 'crack'], branch: ['kiln', 'branch'], water: ['drowned', 'water'], fire: ['kiln', 'coals'], spikes: ['brass', 'spikes'] },
};

// Hand corrections where the measured flat top isn't the standing surface.
// v12: the frozen waterfall's flat top was read at the top of the fall; the ledge is half way down, the whole width
const EXTRA_FIX = { 'ice/arena/3': { top: 0.54, sx: 0.02, sw: 0.95 } };
const TOP_FIX = { 'brass-gate/platforms/2': 0.86, 'brass-gate/platforms/1': 0.8, 'ninefold-quarry/platforms/1': 0.7 };

import { loadImage, loadWebpIndex, REL, RELMAN } from './assets.js';
export const Kits = {
  data: null, imgs: {}, ready: false, _dark: new Map(),

  async load() {
    if (REL) {   // v15: the release build carries the merged cuts in its manifest
      await loadWebpIndex(); this.data = (RELMAN && RELMAN.kits) || {};
      await Promise.all(Object.entries(this.data).map(async ([k, d]) => { const img = await loadImage(d.src); if (img) this.imgs[k] = img; }));
      this.ready = true; return;
    }
    try {
      const res = await fetch('assets/derived/kits.json', { cache: 'no-store' });
      this.data = await res.json();
      // v10 (Connor's note 12): pieces cut by their own alpha shapes and repacked apart, so no box clips a neighbour
      try { const r10 = await fetch('assets/derived/kits-c10.json', { cache: 'no-store' }); if (r10.ok && !/[?&]oldkits/.test(location.search)) Object.assign(this.data, await r10.json()); } catch { /* the v9 cut */ }
      // v12 (Connor's notes 29 and 39): the grounded Drowned Steps kit and the ice-arena kit, sliced by tools/slice-kits-c12.js
      try { const r12 = await fetch('assets/derived/kits-c12.json', { cache: 'no-store' }); if (r12.ok) Object.assign(this.data, await r12.json()); } catch { /* held pieces fall back to the kit */ }
      // v13: the planner's style-1 redraws of the same two kits (same layout, same piece order), sliced by tools/slice-kits-c13.js;
      // the Drowned Steps cliff shelf's top was re-measured below its new tree. ?c12kits=1 shows the v12 cut.
      try { const r13 = await fetch('assets/derived/kits-c13.json', { cache: 'no-store' }); if (r13.ok && !/[?&]c12kits/.test(location.search)) Object.assign(this.data, await r13.json()); } catch { /* the v12 cut stays */ }
    } catch (err) { console.warn('kits.json missing, run: node tools/slice-kits.js', err); return; }
    await loadWebpIndex();   // v9 (review 9 #12): the kit sheets come as WebP too
    await Promise.all(Object.entries(this.data).map(async ([k, d]) => { const img = await loadImage(d.src); if (img) this.imgs[k] = img; }));
    this.ready = true;
  },

  // ref: {kit, set, i} | [region, name] | 'name' (with region) -> piece record or null
  piece(ref, region) {
    if (!this.ready || !ref) return null;
    let slug, set, i;
    if (Array.isArray(ref)) ref = { region: ref[0], name: ref[1] };
    if (typeof ref === 'string') ref = { region, name: ref };
    if (ref.kit) { slug = ref.kit; set = ref.set; i = ref.i; }
    else {
      const r = ref.region;
      slug = SLUG[r];
      i = PLATFORMS[r].indexOf(ref.name); set = 'platforms';
      if (i < 0) { i = PROPS[r].indexOf(ref.name); set = 'props'; }
      if (i < 0) return null;
    }
    const key = `${slug}/${set}`, d = this.data[key], img = this.imgs[key];
    if (!d || !img || !d.pieces[i]) return null;
    const p = d.pieces[i], fix = TOP_FIX[`${key}/${i}`];
    return { img, key: `${key}/${i}`, ...p, top: fix ? Math.round(p.h * fix) : p.top };
  },

  // v12: a piece from one of the extra kits by index ('drowned-steps/grounded', 'ice/arena')
  extra(key, i) {
    if (!this.ready) return null;
    const d = this.data[key], img = this.imgs[key];
    if (!d || !img || !d.pieces[i]) return null;
    const pc = { img, key: key + '/' + i, ...d.pieces[i] }, fx = EXTRA_FIX[key + '/' + i];
    if (fx) { pc.top = Math.round(pc.h * fx.top); pc.sx = Math.round(pc.w * fx.sx); pc.sw = Math.round(pc.w * fx.sw); }
    return pc;
  },

  role(region, job) { const r = ROLES[region] || ROLES.kite; return this.piece(r[job]); },

  // Whole piece, scaled by s, with its flat top at (cx, topY), centred on cx.
  drawAtTop(ctx, pc, cx, topY, s, o = {}) {
    const w = pc.w * s, h = pc.h * s;
    const src = o.dark ? this._darkened(pc, o.dark) : pc.img, sx = o.dark ? 0 : pc.x, sy = o.dark ? 0 : pc.y;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    if (o.flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); cx = 0; }
    ctx.drawImage(src, sx, sy, pc.w, pc.h, cx - w / 2, topY - pc.top * s, w, h);
    ctx.restore();
  },
  // Piece stretched over a rect (used for gates and props sized by height).
  drawRect(ctx, pc, x, y, w, h, o = {}) {
    const src = o.dark ? this._darkened(pc, o.dark) : pc.img, sx = o.dark ? 0 : pc.x, sy = o.dark ? 0 : pc.y;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    if (o.flip) { ctx.translate(x + w / 2, 0); ctx.scale(-1, 1); x = -w / 2; }
    ctx.drawImage(src, sx, sy, pc.w, pc.h, x, y, w, h);
    ctx.restore();
  },

  // A darkened copy of a piece for foreground silhouettes.
  _darkened(pc, a) {
    const id = pc.key + '|' + a;
    let c = this._dark.get(id);
    if (!c) {
      c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h;
      const x = c.getContext('2d');
      x.drawImage(pc.img, pc.x, pc.y, pc.w, pc.h, 0, 0, pc.w, pc.h);
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = `rgba(16,10,22,${a})`; x.fillRect(0, 0, pc.w, pc.h);
      this._dark.set(id, c);
    }
    return c;
  },

  // --- solid skins -------------------------------------------------------------------
  // Ground: the piece is cut into left cap / middle / right cap. Its top band (flat top plus
  // the rock face under it) is tiled along the rect; deeper rects are filled with the
  // piece's body texture and fade to shadow.
  drawGround(ctx, pc, r, s, o = {}) {
    const capW = Math.round(pc.w * 0.2), midW = pc.w - capW * 2;
    const band = Math.min(pc.h - pc.top, Math.round((pc.h - pc.top) * 0.72));   // rows of piece under the top line we use
    const bandH = band * s, topY = r.y - pc.top * s;
    const deep = r.h > bandH - 6;
    if (deep) {
      const body = o.body || pc;   // a taller piece (the region's wall) tiles with less repetition
      this._fillBody(ctx, body, { x: r.x, y: r.y + bandH * 0.55, w: r.w, h: r.h - bandH * 0.55 }, o.bodyScale || s, o.fade !== false, o.fadeTop);
    }
    const rows = pc.top + (deep ? band : pc.h - pc.top);
    const dh = rows * s;
    // v14 (Connor's note 45): over a deep block the band's lowest rows fade out (a baked copy), so the grassy top melts
    // into the stone body below instead of ending on a hard line
    const src = deep ? this._fadedBand(pc, rows) : null, SX = src ? 0 : pc.x, SY = src ? 0 : pc.y, IMG = src || pc.img;
    const L = o.capL !== false, R = o.capR !== false;
    const cw = capW * s, ox = 10;
    let x = r.x - (L ? ox : 0), end = r.x + r.w + (R ? ox : 0);
    if (L) { ctx.drawImage(IMG, SX, SY, capW, rows, x, topY, cw, dh); x += cw; }
    const stopAt = end - (R ? cw : 0);
    const mw = midW * s;
    while (x < stopAt - 0.5) {
      const take = Math.min(mw, stopAt - x);
      ctx.drawImage(IMG, SX + capW, SY, (take / mw) * midW, rows, x, topY, take, dh);
      x += take;
    }
    if (R) ctx.drawImage(IMG, SX + pc.w - capW, SY, capW, rows, stopAt, topY, cw, dh);
  },

  _fadedBand(pc, rows) {
    this._fb = this._fb || new WeakMap();
    let per = this._fb.get(pc.img); if (!per) { per = new Map(); this._fb.set(pc.img, per); }
    const key = pc.x + ':' + pc.y + ':' + pc.w + ':' + rows;
    if (per.has(key)) return per.get(key);
    let c = null;
    try {
      c = document.createElement('canvas'); c.width = pc.w; c.height = rows;
      const x = c.getContext('2d'); x.drawImage(pc.img, pc.x, pc.y, pc.w, rows, 0, 0, pc.w, rows);
      x.globalCompositeOperation = 'destination-out';
      const f0 = pc.top + (rows - pc.top) * 0.55, g = x.createLinearGradient(0, f0, 0, rows);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      x.fillStyle = g; x.fillRect(0, f0, pc.w, rows - f0);
    } catch { c = null; }
    per.set(key, c);
    return c;
  },
  _seamless(ctx, pc, bx, by, bw, bh) {
    this._sl = this._sl || new WeakMap();
    let per = this._sl.get(pc.img); if (!per) { per = new Map(); this._sl.set(pc.img, per); }
    const key = bx + ':' + by + ':' + bw + ':' + bh;
    if (per.has(key)) return per.get(key);
    let pat = null;
    try {
      const mk = () => { const c = document.createElement('canvas'); c.width = bw; c.height = bh; return c; };
      const shifted = mk(), sx = shifted.getContext('2d'), hw = Math.floor(bw / 2), hh = Math.floor(bh / 2);
      for (const [dx, dy] of [[0, 0], [-bw, 0], [0, -bh], [-bw, -bh]]) sx.drawImage(pc.img, bx, by, bw, bh, hw + dx, hh + dy, bw, bh);
      const top = mk(), tx = top.getContext('2d');
      tx.drawImage(pc.img, bx, by, bw, bh, 0, 0, bw, bh);
      tx.globalCompositeOperation = 'destination-in';
      const gx = tx.createLinearGradient(0, 0, bw, 0); gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.28, 'rgba(0,0,0,1)'); gx.addColorStop(0.72, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
      tx.fillStyle = gx; tx.fillRect(0, 0, bw, bh);
      const gy = tx.createLinearGradient(0, 0, 0, bh); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.28, 'rgba(0,0,0,1)'); gy.addColorStop(0.72, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
      tx.fillStyle = gy; tx.fillRect(0, 0, bw, bh);
      sx.drawImage(top, 0, 0);
      pat = ctx.createPattern(shifted, 'repeat');
    } catch { pat = null; }
    per.set(key, pat);
    return pat;
  },

  _fillBody(ctx, pc, r, s, fade, fadeTop) {
    // body texture: the middle of the piece, below its top band
    const tall = pc.h > pc.w;
    const bx = pc.x + Math.round(pc.w * (tall ? 0.12 : 0.28)), bw = Math.round(pc.w * (tall ? 0.76 : 0.44));
    const by = pc.y + pc.top + Math.round((pc.h - pc.top) * (tall ? 0.2 : 0.3)), bh = Math.max(8, Math.round((pc.h - pc.top) * (tall ? 0.6 : 0.4)));
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    // v14 (Connor's note 45: "the floor graphic doesn't line up and looks messy"): the body is one seamless texture,
    // baked once per piece (offset by half and cross-faded so its edges meet themselves), laid as a pattern anchored to
    // the world, so neighbouring blocks, steps and walls share the same stone with no tile seams and no offsets.
    const pat = this._seamless(ctx, pc, bx, by, bw, bh);
    if (pat) { pat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0])); ctx.fillStyle = pat; ctx.fillRect(r.x, r.y, r.w, r.h); }
    else {
      const tw = bw * s, th = bh * s, sy = th - 1, sx = tw - 1, y0 = Math.floor(r.y / sy) * sy;
      for (let y = y0; y < r.y + r.h; y += sy) { const row = Math.round(y / sy), x0 = Math.floor(r.x / sx) * sx - (row & 1) * tw * 0.5 - sx; for (let x = x0; x < r.x + r.w; x += sx) ctx.drawImage(pc.img, bx, by, bw, bh, x, y, tw, th); }
    }
    r = fadeTop != null ? { x: r.x, y: Math.min(r.y, fadeTop), w: r.w, h: r.h + Math.max(0, r.y - fadeTop) } : r;
    if (fade) {
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + Math.min(r.h, 420));
      g.addColorStop(0, 'rgba(18,10,22,0.0)'); g.addColorStop(0.35, 'rgba(18,10,22,0.35)'); g.addColorStop(1, 'rgba(18,10,22,0.82)');
      ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
  },

  // Wall: the piece scaled to the rect's width; its top segment caps the wall and the body
  // rows repeat down the rect.
  drawWall(ctx, pc, r, o = {}) {
    const s = r.w / pc.sw;
    const x = r.x - pc.sx * s, w = pc.w * s;
    const topRows = Math.min(pc.h, Math.round(pc.top + (pc.h - pc.top) * 0.35));
    const bodyY = pc.y + topRows, bodyRows = Math.max(8, Math.round((pc.h - topRows) * 0.6));
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 4, r.y - pc.top * s - 4, w + 8, r.h + pc.top * s + 4); ctx.clip();
    let y = r.y - pc.top * s;
    if (o.capTop !== false) { ctx.drawImage(pc.img, pc.x, pc.y, pc.w, topRows, x, y, w, topRows * s); y += topRows * s - 1; }
    else y = r.y;
    while (y < r.y + r.h) { ctx.drawImage(pc.img, pc.x, bodyY, pc.w, bodyRows, x, y, w, bodyRows * s); y += bodyRows * s - 1; }
    ctx.restore();
  },

  // A strip piece (water, coals, spikes) tiled across a width, its flat top at topY.
  drawStrip(ctx, pc, x0, w, topY, hTarget, o = {}) {
    const s = hTarget / (pc.h - pc.top * 0.5), tw = pc.w * s;
    const off = o.scroll ? ((o.scroll % tw) + tw) % tw : 0;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, topY - pc.top * s - 30, w, pc.h * s + 60); ctx.clip();
    for (let x = x0 - off; x < x0 + w; x += tw - 2) ctx.drawImage(pc.img, pc.x, pc.y, pc.w, pc.h, x, topY - pc.top * s, tw, pc.h * s);
    ctx.restore();
  },
};

export const regionOfSlug = (slug) => BY_SLUG[slug];
