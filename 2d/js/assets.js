// Asset manifest + loader.
// Every entry is optional: if the PNG exists it is used, otherwise callers get `null`
// and draw the code-drawn placeholder (see placeholders.js). New files dropped into
// assets/ are picked up on reload, and by a light re-scan every 20 s while playing.
//
// Sheets are 8 frames in ONE horizontal row. At load time the poses of a character
// sheet are cut out by shape (see segmentPoses) and each sheet is measured:
// per-frame opaque bounding boxes, the sheet's lowest opaque row (the foot line, which
// gets aligned to the ground) and the tallest frame (used to normalise on-screen size,
// because the generated sheets don't all share one character scale).

const C = 'assets/chars/', F = 'assets/fx/', B = 'assets/bg/', RM = 'assets/rooms/', U = 'assets/ui/', DV = 'assets/derived/';

// Characters: every sheet is 8 poses in one row, drawn at its own scale. Each sheet is
// normalised to its character's TARGET standing height: the sheet's reference height is the
// median opaque height of its 8 frames, times `pose` for sheets whose median pose is not
// upright (a crouched hurt sheet, a lunging dash). Feet go on the ground (each frame's
// lowest opaque row). `flip` = the sheet faces left.
export const TARGET = { ren: 204, tamsin: 200, kesh: 198, mapmaker: 196, hero: 192, soldier: 206, captain: 262, elder: 200, reed: 360, colossus: 360, overseer: 330, shield: 226, archer: 200, moth: 130, snapper: 120, mite: 82, hound: 150, villager: 196 };
const ch = (who, anim, o = {}) => ({ src: C + `${o.file || who}-${anim}.png`, kind: 'char', frames: 8, who, ...o });

export const MANIFEST = {
  // Region backdrops (2688x1520), interiors, vertical shafts (1520x2688) and the midground strips.
  'bg.kite': { src: B + 'kite-hill.png', kind: 'bg' },
  'bg.drowned': { src: B + 'drowned-steps.png', kind: 'bg' },
  'bg.quarry': { src: B + 'ninefold-quarry.png', kind: 'bg' },
  'bg.kiln': { src: B + 'kilnmouth.png', kind: 'bg' },
  'bg.brass': { src: B + 'brass-gate.png', kind: 'bg' },
  'in.kite': { src: RM + 'room-interior-kite-hill.png', kind: 'bg' },
  'in.drowned': { src: RM + 'room-interior-drowned-steps.png', kind: 'bg' },
  'in.quarry': { src: RM + 'room-interior-ninefold-quarry.png', kind: 'bg' },
  'in.kiln': { src: RM + 'room-interior-kilnmouth.png', kind: 'bg' },
  'in.brass': { src: RM + 'room-interior-brass-gate.png', kind: 'bg' },
  'shaft.kite': { src: RM + 'room-shaft-kite-hill.png', kind: 'bg' },
  'shaft.drowned': { src: RM + 'room-shaft-drowned-steps.png', kind: 'bg' },
  'shaft.quarry': { src: RM + 'room-shaft-ninefold-quarry.png', kind: 'bg' },
  'shaft.kiln': { src: RM + 'room-shaft-kilnmouth.png', kind: 'bg' },
  'mid.kite': { src: RM + 'mid-kite-hill.png', kind: 'bg' },
  'mid.drowned': { src: RM + 'mid-drowned-steps.png', kind: 'bg' },
  'mid.quarry': { src: RM + 'mid-ninefold-quarry.png', kind: 'bg' },
  'mid.kiln': { src: RM + 'mid-kilnmouth.png', kind: 'bg' },
  'mid.brass': { src: RM + 'mid-brass-gate.png', kind: 'bg' },
  'ui.title': { src: U + 'screen-title.png', kind: 'bg' },
  'ui.icons': { src: U + 'ui-move-icons.png', kind: 'bg' },
  'portrait.elder': { src: C + 'npc-elder-portrait.png', kind: 'bg' },
  'portrait.hero': { src: C + 'hero-portrait.png', kind: 'bg' },
  'portrait.captain': { src: C + 'captain-redesign-portrait.png', kind: 'bg' },
  'portrait.reed': { src: C + 'boss-rime-warden-portrait.png', kind: 'bg' },   // v12 (note 39): the Rime Warden
  'portrait.colossus': { src: C + 'boss-quarry-colossus-portrait.png', kind: 'bg' },
  'portrait.overseer': { src: C + 'boss-kiln-overseer-portrait.png', kind: 'bg' },

  // Hero (Joon).
  'hero.idle': ch('hero', 'idle'),
  'hero.run': ch('hero', 'run', { pose: 0.93 }),
  'hero.jump': ch('hero', 'jump'),
  'hero.attack': ch('hero', 'attack', { pose: 0.98 }),
  'hero.dash': ch('hero', 'dash', { pose: 0.98 }),
  'hero.hurt': ch('hero', 'hurt'),
  'hero.glide': ch('hero', 'glide', { pose: 1.0 }),   // v13: the redesign glides more upright (1.12 drew him 217 px against a 193 px idle)   // v9: the A1 sheet lies forward on the air, so its frames are shorter; this keeps Joon his own size   // v8: the redrawn sheet (palms down on the air, knees tucked)
  'hero.cast': ch('hero', 'cast'),
  'hero.knockout': ch('hero', 'knockout', { pose: 0.75 }),
  'hero.meditate': ch('hero', 'meditate', { pose: 0.85 }),
  'hero.downstrike': ch('hero', 'downstrike'),
  'hero.heal': ch('hero', 'heal'),
  'hero.ledge': ch('hero', 'ledge-climb', { pose: 1.05 }),
  'hero.wall': ch('hero', 'wall-cling-jump'),
  // v7 (review 7 A3, A4): the breath after a boss, and strikes in the air with the knees tucked
  'hero.victory': ch('hero', 'victory'),
  'hero.airattack': ch('hero', 'air-attack', { pose: 0.88 }),   // v13: 0.76 drew the redesign 149 px tall, a head smaller than the jump

  // New fire-army troops and wild things (all drawn facing left).
  // v10: the army's new sheets (brass and indigo, review 10 A18 to A21) face right
  'shield.walk': ch('shield', 'walk', { file: 'enemy-shieldbearer' }),
  'shield.attack': ch('shield', 'attack', { file: 'enemy-shieldbearer' }),
  'archer.shoot': ch('archer', 'shoot', { file: 'enemy-ember-archer' }),
  'moth.fly': ch('moth', 'fly', { file: 'enemy-cinder-moth', flip: true }),
  'snapper.walk': ch('snapper', 'walk', { file: 'enemy-reed-snapper', flip: true }),
  'mite.walk': ch('mite', 'walk', { file: 'enemy-quarry-mite', flip: true, pose: 1 }),
  'hound.run': ch('hound', 'run', { file: 'enemy-kiln-hound' }),
  'hound.pounce': ch('hound', 'pounce', { file: 'enemy-kiln-hound' }),
  // v8 (review 8 A3 to A5, A23): knocked-out sheets for the ordinary enemies (fallback: the old tumble)
  'hound.defeat': ch('hound', 'defeat', { file: 'enemy-kiln-hound', flip: true, refFrame: 0 }),
  'shield.defeat': ch('shield', 'defeat', { file: 'enemy-shieldbearer', refFrame: 0 }),
  'archer.defeat': ch('archer', 'defeat', { file: 'enemy-ember-archer', flip: true, refFrame: 0 }),
  'soldier.defeat': ch('soldier', 'defeat', { refFrame: 0 }),

  // Townsfolk: one sheet of four (kite child, fisherman, stone carrier, potter).
  'villager.lineup': { src: C + 'npc-villagers-lineup.png', kind: 'char', frames: 4, who: 'villager' },
  'portrait.kesh': { src: C + 'npc-kesh-portrait.png', kind: 'bg' },
  'portrait.mapmaker': { src: C + 'npc-mapmaker-portrait.png', kind: 'bg' },
  'portrait.ren': { src: C + 'npc-mother-ren-portrait.png', kind: 'bg' },
  'portrait.tamsin': { src: C + 'npc-old-tamsin-portrait.png', kind: 'bg' },
  'portrait.shield': { src: C + 'enemy-shieldbearer-portrait.png', kind: 'bg' },
  'portrait.soldier': { src: C + 'soldier-portrait.png', kind: 'bg' },
  'ui.skills': { src: U + 'ui-skill-icons.png', kind: 'bg' },
  'story.army': { src: 'assets/story/story-01-army-arrives.png', kind: 'bg' },
  // (v5 originality pass: the three old stills and the old ending screen are no longer loaded)

  // Fire soldiers (brawler / slinger). The walk sheet is drawn bigger than the idle one;
  // normalising both to TARGET.soldier evens that out.
  'soldier.idle': ch('soldier', 'idle'),
  'soldier.walk': ch('soldier', 'walk'),
  'soldier.attack': ch('soldier', 'attack'),
  'soldier.hurt': ch('soldier', 'hurt'),

  // The Captain: only the redesign is loaded (v5 dropped the retired red-and-gold sheets).

  // Elder Sora-Lin.
  'elder.idle': ch('elder', 'idle', { file: 'npc-elder' }),

  // Trial guardians (all drawn facing left).
  // v12 (Connor's note 39): the Rime Warden's sheets (they face right, 8 poses spaced apart, a soft frost halo cut off)
  'reed.idle': ch('reed', 'idle', { file: 'boss-rime-warden', workH: 1152, cut: 60, refFrame: 0 }),
  // v14 (Connor's notes 57, 61, 63): round-6 sprites, each used the moment its file lands (same names as requested in
  // review-14/ASSET-REQUESTS.md). Until then the game uses art already in it, never a code shape.
  'reed.castground': ch('reed', 'cast-ground', { file: 'boss-rime-warden', workH: 1152, cut: 60, refFrame: 0 }),
  'reed.castsky': ch('reed', 'cast-sky', { file: 'boss-rime-warden', workH: 1152, cut: 60, refFrame: 0 }),
  'reed.castrush': ch('reed', 'cast-rush', { file: 'boss-rime-warden', workH: 1152, cut: 60, refFrame: 0 }),
  'reed.uppercut': ch('reed', 'uppercut', { file: 'boss-rime-warden', workH: 1152, cut: 60, refFrame: 0 }),
  'soldier.antiair': ch('soldier', 'antiair'),
  // v16 (Connor's note 75): the Warden treatment for the other three guardians: a tell sheet per move and a pogo answer,
  // used the moment each file lands (the dev listing keeps a missing one from 404ing)
  'overseer.castcone': ch('overseer', 'cast-cone', { file: 'boss-kiln-overseer', workH: 1152, cut: 60, srcH: 620 }),
  'overseer.castpunch': ch('overseer', 'cast-punch', { file: 'boss-kiln-overseer', workH: 1152, cut: 60, srcH: 620 }),
  'overseer.castfan': ch('overseer', 'cast-fan', { file: 'boss-kiln-overseer', workH: 1152, cut: 60, srcH: 620 }),
  'overseer.castvents': ch('overseer', 'cast-vents', { file: 'boss-kiln-overseer', workH: 1152, cut: 60, srcH: 620 }),
  'overseer.antiair': ch('overseer', 'antiair', { file: 'boss-kiln-overseer', workH: 1152, cut: 60, srcH: 620 }),
  'colossus.castslam': ch('colossus', 'cast-slam', { file: 'boss-quarry-colossus', workH: 1152, cut: 60, srcH: 620 }),
  'colossus.casttoss': ch('colossus', 'cast-toss', { file: 'boss-quarry-colossus', workH: 1152, cut: 60, srcH: 620 }),
  'colossus.castquake': ch('colossus', 'cast-quake', { file: 'boss-quarry-colossus', workH: 1152, cut: 60, srcH: 620 }),
  'colossus.antiair': ch('colossus', 'antiair', { file: 'boss-quarry-colossus', workH: 1152, cut: 60, srcH: 620 }),
  'captain2.castcombo': ch('captain', 'cast-combo', { file: 'captain-redesign', workH: 1152, cut: 60, srcH: 620 }),
  'captain2.castvolley': ch('captain', 'cast-volley', { file: 'captain-redesign', workH: 1152, cut: 60, srcH: 620 }),
  'captain2.castleap': ch('captain', 'cast-leap', { file: 'captain-redesign', workH: 1152, cut: 60, srcH: 620 }),
  'captain2.castdash': ch('captain', 'cast-dash', { file: 'captain-redesign', workH: 1152, cut: 60, srcH: 620 }),
  'captain2.antiair': ch('captain', 'antiair', { file: 'captain-redesign', workH: 1152, cut: 60, srcH: 620 }),
  'shield.shieldup': ch('shield', 'shieldup', { file: 'enemy-shieldbearer', refFrame: 0, cut: 120, erode: 1 }),
  'parasol.spin': ch('soldier', 'spin', { file: 'enemy-parasol-guard', refFrame: 0, cut: 120, erode: 1 }),
  'fx.firepot': { src: F + 'fire-pot.png', kind: 'fx', frames: 8, cut: 150 },   // a dark red/green keying halo round the pot
  'fx.firepotburst': { src: F + 'fire-pot-burst.png', kind: 'fx', frames: 8, cut: 60 },
  'fx.frosttell': { src: F + 'frost-crack-tell.png', kind: 'fx', frames: 8, cut: 60, keepCyan: true },
  'fx.antiairtell': { src: F + 'antiair-tell.png', kind: 'fx', frames: 8 },
  'fx.firejab': { src: F + 'fire-jab-up.png', kind: 'fx', frames: 8 },
  'fx.attunering': { src: F + 'attune-ring.png', kind: 'fx', frames: 8 },
  'fx.crystalrush': { src: F + 'crystal-rush.png', kind: 'fx', frames: 8 },
  'fx.particles': { src: F + 'particles.png', kind: 'fx', frames: 8, nofeather: true },
  'prop.trainingpost': { src: 'assets/props/training-post.png', kind: 'fx', frames: 8, nofeather: true },
  'fx.aimdot': { src: F + 'aim-dots.png', kind: 'bg' },
  'prop.plankwall': { src: 'assets/props/plank-wall.png', kind: 'bg' },
  'prop.ceiling-kite': { src: 'assets/props/ceiling-kite.png', kind: 'bg' },
  'prop.ceiling-brass': { src: 'assets/props/ceiling-brass.png', kind: 'bg' },
  'prop.ceiling-quarry': { src: 'assets/props/ceiling-quarry.png', kind: 'bg' },
  'prop.ceiling-drowned': { src: 'assets/props/ceiling-drowned.png', kind: 'bg' },   // v15
  'prop.ceiling-kiln': { src: 'assets/props/ceiling-kiln.png', kind: 'bg' },   // v15
  'prop.passage-kite': { src: 'assets/props/passage-kite.png', kind: 'fx', frames: 2, nofeather: true },
  'prop.passage-drowned': { src: 'assets/props/passage-drowned.png', kind: 'fx', frames: 2, nofeather: true },
  'prop.passage-quarry': { src: 'assets/props/passage-quarry.png', kind: 'fx', frames: 2, nofeather: true },
  'prop.passage-kiln': { src: 'assets/props/passage-kiln.png', kind: 'fx', frames: 2, nofeather: true },
  'prop.passage-brass': { src: 'assets/props/passage-brass.png', kind: 'fx', frames: 2, nofeather: true },
  'prop.shrineopening': { src: 'assets/props/shrine-opening.png', kind: 'bg' },
  'fx.groundwarn': { src: F + 'ground-warning.png', kind: 'fx', frames: 8 },
  'fx.healring': { src: F + 'heal-ring.png', kind: 'fx', frames: 8 },
  'fx.exitchevron': { src: U + 'exit-chevron.png', kind: 'fx', frames: 8 },
  'prop.iceslab': { src: 'assets/props/ice-slab-melt.png', kind: 'fx', frames: 8, nofeather: true },
  'prop.kit7-kite': { src: 'assets/props/platform-kit-kite-r7.png', kind: 'fx', frames: 6, nofeather: true },   // v16 (note 72)
  'prop.kit7-drowned': { src: 'assets/props/platform-kit-drowned-r7.png', kind: 'fx', frames: 6, nofeather: true, keyMagenta: true },   // v16 (note 72)
  'prop.kit7-quarry': { src: 'assets/props/platform-kit-quarry-r7.png', kind: 'fx', frames: 6, nofeather: true },   // v16 (note 72)
  'prop.kit7-kiln': { src: 'assets/props/platform-kit-kiln-r7.png', kind: 'fx', frames: 6, nofeather: true },   // v16 (note 72)
  'prop.kit7-brass': { src: 'assets/props/platform-kit-brass-r7.png', kind: 'fx', frames: 6, nofeather: true },   // v16 (note 72)
  'prop.sideexit-kite': { src: 'assets/props/side-exit-kite.png', kind: 'fx', frames: 2, nofeather: true },   // v16 (note 73)
  'prop.sideexit-drowned': { src: 'assets/props/side-exit-drowned.png', kind: 'fx', frames: 2, nofeather: true },   // v16 (note 73)
  'prop.sideexit-quarry': { src: 'assets/props/side-exit-quarry.png', kind: 'fx', frames: 2, nofeather: true },   // v16 (note 73)
  'prop.sideexit-kiln': { src: 'assets/props/side-exit-kiln.png', kind: 'fx', frames: 2, nofeather: true },   // v16 (note 73)
  'prop.sideexit-brass': { src: 'assets/props/side-exit-brass.png', kind: 'fx', frames: 2, nofeather: true },   // v16 (note 73)
  'prop.icearch': { src: 'assets/props/ice-sealed-arch.png', kind: 'fx', frames: 8, nofeather: true },
  'prop.hangchain': { src: 'assets/props/hang-chain.png', kind: 'bg' },
  'prop.hangrope': { src: 'assets/props/hang-rope.png', kind: 'bg' },
  'prop.ledgecracks': { src: 'assets/props/ledge-cracks.png', kind: 'fx', frames: 4, nofeather: true },
  'reed.attack': ch('reed', 'attack', { file: 'boss-rime-warden', workH: 1152, cut: 60, refFrame: 0 }),
  'reed.windup': ch('reed', 'windup', { file: 'boss-rime-warden', workH: 1152, cut: 60, refFrame: 0 }),
  'colossus.walk': ch('colossus', 'walk', { file: 'boss-quarry-colossus', srcH: 620 }),   // v16 (note 75): the redraw, facing right, body 620 px of 1152
  'colossus.attack': ch('colossus', 'attack', { file: 'boss-quarry-colossus', srcH: 620 }),   // v16 (note 75): the redraw, facing right, body 620 px of 1152
  'overseer.walk': ch('overseer', 'walk', { file: 'boss-kiln-overseer', srcH: 620 }),   // v16 (note 75): the redesign, facing right, body 620 px of 1152
  'overseer.attack': ch('overseer', 'attack', { file: 'boss-kiln-overseer', srcH: 620 }),   // v16 (note 75): the redesign, facing right, body 620 px of 1152

  // Element-move effects and world effects (8x1 sheets, 384 px cells).
  'fx.gust': { src: F + 'gust.png', kind: 'fx', frames: 8 },
  'fx.deflect': { src: F + 'deflect.png', kind: 'fx', frames: 8 },
  'fx.whip': { src: F + 'whip.png', kind: 'fx', frames: 8 },
  // v13: the Rime Warden's ink-brush ice (from the planner; the code-drawn shapes stay as the fallback until they land)
  'fx.icespikes': { src: F + 'ice-spike-wave.png', kind: 'fx', frames: 8 },
  'fx.icicle': { src: F + 'icicle-fall.png', kind: 'fx', frames: 8 },
  'fx.frozenwave': { src: F + 'frozen-wave.png', kind: 'fx', frames: 8 },
  'fx.icepillar': { src: F + 'ice-pillar-rise.png', kind: 'fx', frames: 8 },
  'fx.icewall': { src: F + 'ice-wall.png', kind: 'fx', frames: 8 },
  'fx.slam': { src: F + 'earth-slam.png', kind: 'fx', frames: 8 },
  'fx.stonewall': { src: F + 'stone-wall.png', kind: 'fx', frames: 8 },
  'fx.fireblast': { src: F + 'fire-blast.png', kind: 'fx', frames: 8 },
  'fx.flamering': { src: F + 'flame-ring.png', kind: 'fx', frames: 8 },
  'fx.fireball': { src: DV + 'fireball.png', kind: 'fx', frames: 8 },   // white sheet keyed out by tools/derive.js
  'fx.spark': { src: F + 'hit-spark.png', kind: 'fx', frames: 8 },
  'fx.wisp': { src: F + 'breath-wisp.png', kind: 'fx', frames: 8 },
  'fx.burn': { src: F + 'branch-burn.png', kind: 'fx', frames: 8 },
  'fx.floorbreak': { src: F + 'floor-break.png', kind: 'fx', frames: 8 },
  'fx.dust': { src: F + 'landing-dust.png', kind: 'fx', frames: 8 },
  'fx.poof': { src: F + 'defeat-poof.png', kind: 'fx', frames: 8 },

  // Cycle 4 requests (review-4/ASSET-REQUESTS.md). Each is optional: until the file arrives
  // the game draws a painted fallback made from the sheets above (see js/fx.js).
  'fx.strikearc': { src: F + 'strike-arc.png', kind: 'fx', frames: 8 },
  'fx.strikearcheavy': { src: F + 'strike-arc-heavy.png', kind: 'fx', frames: 8 },
  'fx.arcside': { src: F + 'strike-arc-side.png', kind: 'fx', frames: 8 },   // v11 (C4)
  'fx.arcup': { src: F + 'strike-arc-up.png', kind: 'fx', frames: 8 },
  'fx.arcdown': { src: F + 'strike-arc-down.png', kind: 'fx', frames: 8 },
  'fx.sprintdust': { src: F + 'sprint-dust.png', kind: 'fx', frames: 8 },   // v11 (C2)
  'fx.phaseburst-brass': { src: F + 'phase-burst-brass.png', kind: 'fx', frames: 8, margin: 0.045, cut: 110 },   // v11 (C5)
  'hero.sprint': ch('hero', 'sprint'),   // v11 (B1 to B3)
  'hero.skid': ch('hero', 'skid'),
  'hero.aircast': ch('hero', 'air-cast'),
  'fx.hitspark-air': { src: F + 'hit-spark-air.png', kind: 'fx', frames: 8 },
  'fx.hitspark-water': { src: F + 'hit-spark-water.png', kind: 'fx', frames: 8 },
  'fx.hitspark-earth': { src: F + 'hit-spark-earth.png', kind: 'fx', frames: 8 },
  'fx.hitspark-fire': { src: F + 'hit-spark-fire.png', kind: 'fx', frames: 8 },
  'fx.airring': { src: F + 'air-ring.png', kind: 'fx', frames: 8 },
  'fx.dashstreak': { src: F + 'dash-streak.png', kind: 'fx', frames: 8 },
  'fx.waterspout': { src: F + 'water-spout.png', kind: 'fx', frames: 8 },
  'fx.spoutwarn': { src: F + 'spout-warning.png', kind: 'fx', frames: 8 },
  'fx.shockwave': { src: F + 'ground-shockwave.png', kind: 'fx', frames: 8 },
  'fx.ventfire': { src: F + 'floor-vent-fire.png', kind: 'fx', frames: 8 },
  'fx.steam': { src: F + 'steam-vent.png', kind: 'fx', frames: 8 },
  'fx.daze': { src: F + 'daze-swirl.png', kind: 'fx', frames: 8 },
  'fx.blockspark': { src: F + 'block-spark.png', kind: 'fx', frames: 8 },
  'fx.guardbreak': { src: F + 'guard-break.png', kind: 'fx', frames: 8 },
  'fx.downtrail': { src: F + 'downstrike-trail.png', kind: 'fx', frames: 8 },
  'fx.dustsmall': { src: F + 'dust-small.png', kind: 'fx', frames: 8 },
  'fx.skid': { src: F + 'skid-dust.png', kind: 'fx', frames: 8 },
  'fx.splash': { src: F + 'splash.png', kind: 'fx', frames: 8 },
  'fx.shatter': { src: F + 'boulder-shatter.png', kind: 'fx', frames: 8 },
  'fx.respawn': { src: F + 'respawn-light.png', kind: 'fx', frames: 8 },
  // cycle 6 requests (review-6/ASSET-REQUESTS.md)
  'fx.watersurface': { src: F + 'water-surface.png', kind: 'fx', frames: 8 },
  'fx.waterrise': { src: F + 'water-rise.png', kind: 'fx', frames: 8 },
  'fx.iceshatter': { src: F + 'ice-shatter.png', kind: 'fx', frames: 8 },
  'fx.collapsedust': { src: F + 'collapse-dust.png', kind: 'fx', frames: 8 },
  // v7 requests (review-7/ASSET-REQUESTS.md A19 to A21)
  'ui.chips': { src: F + 'debris-chips.png', kind: 'bg' },   // drawn by hand in fx.js (tall cells)
  'fx.sparksmall': { src: F + 'spark-small.png', kind: 'fx', frames: 8 },
  'fx.jumpring': { src: F + 'jump-ring.png', kind: 'fx', frames: 8 },
  // v8 (review 8 A24, A25): air lines under the gliding palms; the small low defeat puff
  'fx.glidestreaks': { src: F + 'glide-streaks.png', kind: 'fx', frames: 8 },
  'fx.defeatpoofsmall': { src: F + 'defeat-poof-small.png', kind: 'fx', frames: 8 },
  // hero sheets requested this cycle
  'hero.cast-air': ch('hero', 'cast-air'),
  'hero.cast-water': ch('hero', 'cast-water'),
  'hero.cast-earth': ch('hero', 'cast-earth'),
  'hero.cast-fire': ch('hero', 'cast-fire'),
  'hero.finisher': ch('hero', 'attack-finisher', { pose: 0.98 }),
  'hero.turn': ch('hero', 'turn', { pose: 0.95 }),
  'hero.land': ch('hero', 'land', { pose: 0.85 }),
  'hero.cling': ch('hero', 'wall-cling'),
  // bosses and people
  'overseer.vent': ch('overseer', 'vent', { file: 'boss-kiln-overseer', srcH: 620 }),   // v16 (note 75): the redesign, facing right, body 620 px of 1152
  'overseer.defeat': ch('overseer', 'defeat', { file: 'boss-kiln-overseer', srcH: 620 }),   // v16 (note 75): the redesign, facing right, body 620 px of 1152
  'overseer.idle': ch('overseer', 'idle', { file: 'boss-kiln-overseer', srcH: 620 }),   // v16 (note 75): the redesign, facing right, body 620 px of 1152
  'colossus.idle': ch('colossus', 'idle', { file: 'boss-quarry-colossus', srcH: 620 }),   // v16 (note 75): the redraw, facing right, body 620 px of 1152
  'reed.hurt': ch('reed', 'hurt', { file: 'boss-rime-warden', workH: 1152, cut: 60, pose: 0.95 }),
  'reed.rise': ch('reed', 'rise', { file: 'boss-rime-warden', workH: 1152, cut: 60, refFrame: 7, groundLine: true, gaps: true }),   // the rise and defeat sheets carry a thin ground line under the poses: masked at load
  'reed.defeat': ch('reed', 'defeat', { file: 'boss-rime-warden', workH: 1152, cut: 60, refFrame: 0, groundLine: true, gaps: true }),
  'colossus.stagger': ch('colossus', 'stagger', { file: 'boss-quarry-colossus', srcH: 620 }),   // v16 (note 75): the redraw, facing right, body 620 px of 1152
  'colossus.defeat': ch('colossus', 'defeat', { file: 'boss-quarry-colossus', srcH: 620 }),   // v16 (note 75): the redraw, facing right, body 620 px of 1152
  'captain.walk': ch('captain', 'walk', { flip: true }),
  // The Captain's original redesign (brass scales, indigo coat, lantern pole). When these
  // sheets are present they replace the old look everywhere, portrait included.
  'captain2.idle': ch('captain', 'idle', { file: 'captain-redesign', srcH: 620 }),   // v16 (note 75): the glaive redraw, facing right, body 620 px of 1152
  'captain2.walk': ch('captain', 'walk', { file: 'captain-redesign', srcH: 620 }),   // v16 (note 75): the glaive redraw, facing right, body 620 px of 1152
  'captain2.attack': ch('captain', 'attack', { file: 'captain-redesign', srcH: 620 }),   // v16 (note 75): the glaive redraw, facing right, body 620 px of 1152
  'captain2.dash': ch('captain', 'dash', { file: 'captain-redesign', srcH: 620 }),   // v16 (note 75): the glaive redraw, facing right, body 620 px of 1152
  'captain2.defeat': ch('captain', 'defeat', { file: 'captain-redesign', srcH: 620 }),   // v16 (note 75): the glaive redraw, facing right, body 620 px of 1152
  'captain2.hurt': ch('captain', 'hurt', { file: 'captain-redesign', srcH: 620 }),   // v16 (note 75): the glaive redraw, facing right, body 620 px of 1152
  'portrait.captain2': { src: C + 'captain-redesign-portrait.png', kind: 'bg' },
  'captain.defeat': ch('captain', 'defeat', { flip: true, pose: 0.8 }),
  'kesh.idle': ch('kesh', 'idle', { file: 'npc-kesh' }),   // v6: the redesigned kiln-worker Kesh
  // v5: the masters stand in the world as themselves (their full-figure portraits, until idle sheets arrive)
  'ren.stand': { src: C + 'npc-mother-ren-portrait.png', kind: 'char', frames: 1, who: 'ren' },
  'tamsin.stand': { src: C + 'npc-old-tamsin-portrait.png', kind: 'char', frames: 1, who: 'tamsin' },
  'kesh.stand': { src: C + 'npc-kesh-portrait.png', kind: 'char', frames: 1, who: 'kesh' },
  'mapmaker.stand': { src: C + 'npc-mapmaker-portrait.png', kind: 'char', frames: 1, who: 'mapmaker' },
  'ren.idle': ch('ren', 'idle', { file: 'npc-master-ren' }),
  'tamsin.idle': ch('tamsin', 'idle', { file: 'npc-master-tamsin' }),
  'mapmaker.idle': ch('villager', 'idle', { file: 'npc-mapmaker', pose: 0.7 }),
  'prop.stall': { src: 'assets/props/prop-mapmaker-stall.png', kind: 'bg' },
  'prop.jade': { src: 'assets/props/pickup-jade.png', kind: 'bg' },
  'prop.satchel': { src: 'assets/props/pickup-satchel.png', kind: 'bg' },
  'prop.bloom': { src: 'assets/props/pickup-bloom.png', kind: 'bg' },
  'prop.bubble': { src: 'assets/props/prompt-bubble.png', kind: 'bg' },
  // v8 (review 8 A14 to A18): one painted indoor platform per region
  'plat.kite.in': { src: RM + 'platform-kite-hill-interior.png', kind: 'bg' },
  'plat.drowned.in': { src: RM + 'platform-drowned-steps-interior.png', kind: 'bg' },
  'plat.quarry.in': { src: RM + 'platform-ninefold-quarry-interior.png', kind: 'bg' },
  'plat.kiln.in': { src: RM + 'platform-kilnmouth-interior.png', kind: 'bg' },
  'plat.brass.in': { src: RM + 'platform-brass-gate-interior.png', kind: 'bg' },
  'prop.furnacedoor': { src: 'assets/props/prop-furnace-door.png', kind: 'bg' },   // v8 (review 8 A19)
  'ui.frame': { src: U + 'ui-panel-frame.png', kind: 'bg' },
  'ui.talkframe': { src: U + 'ui-talk-frame.png', kind: 'bg' },
  // v8 (review 8 A20 to A22): painted backings for the Fourfold Path, the wind road and the map
  'ui.pathboard': { src: U + 'ui-path-board.png', kind: 'bg' },
  'ui.windroad': { src: U + 'ui-wind-road.png', kind: 'bg' },
  'ui.parchment': { src: U + 'map-parchment.png', kind: 'bg' },   // v15: the new map's parchment (was ui-map-parchment.png)
  // v15 (note 70): the illustrated map (traced from tools/c15/map/map-layout.png, 2048 x 951), its parchment, its icons
  'ui.mapworld': { src: U + 'map-world.png', kind: 'bg', maxDim: 4096 },
  'ui.mapicons2': { src: U + 'map-icons.png', kind: 'bg' },
  'ui.bosscard': { src: U + 'ui-boss-card.png', kind: 'bg' },
  'story.terraces': { src: 'assets/story/story-05-terraces.png', kind: 'bg' },
  'story.kites': { src: 'assets/story/story-06-kites.png', kind: 'bg' },
  'story.windroad': { src: 'assets/story/story-07-wind-road.png', kind: 'bg' },
  'shaft.brass': { src: RM + 'room-shaft-brass-gate.png', kind: 'bg' },
  // v7: rooms with their own painting (review 7 A10 to A15), named by the room's bg.art
  'room.kitetower': { src: RM + 'room-kite-tower.png', kind: 'bg' },
  'room.stairwell': { src: RM + 'room-flooded-stairwell.png', kind: 'bg' },
  'room.cellar': { src: RM + 'room-root-cellar.png', kind: 'bg' },
  'room.bellloft': { src: RM + 'room-bell-loft.png', kind: 'bg' },
  'room.foreman': { src: RM + 'room-foremans-hut.png', kind: 'bg' },
  'room.powder': { src: RM + 'room-powder-store.png', kind: 'bg' },
  'bg.kite2': { src: B + 'kite-hill-2.png', kind: 'bg' },
  'bg.kite3': { src: B + 'kite-hill-3.png', kind: 'bg' },
  'bg.drowned2': { src: B + 'drowned-steps-2.png', kind: 'bg' },
  'bg.drowned3': { src: B + 'drowned-steps-3.png', kind: 'bg' },
  'bg.quarry2': { src: B + 'ninefold-quarry-2.png', kind: 'bg' },
  'bg.quarry3': { src: B + 'ninefold-quarry-3.png', kind: 'bg' },
  'bg.kiln2': { src: B + 'kilnmouth-2.png', kind: 'bg' },
  'bg.kiln3': { src: B + 'kilnmouth-3.png', kind: 'bg' },
  'bg.brass2': { src: B + 'brass-gate-2.png', kind: 'bg' },
  'bg.brass3': { src: B + 'brass-gate-3.png', kind: 'bg' },
  'arena.reed': { src: B + 'arena-reed-warden.png', kind: 'bg' },
  'arena.colossus': { src: B + 'arena-quarry-colossus.png', kind: 'bg' },
  'arena.overseer': { src: B + 'arena-kiln-overseer.png', kind: 'bg' },
  'arena.captain': { src: B + 'arena-brass-gate-top.png', kind: 'bg' },
  // v9: Connor's playtest notes (13 Nov) and review 9's art requests. Each is drawn in code until its file arrives.
  'ui.hearts': { src: U + 'ui-hearts.png', kind: 'bg' },           // full, half, empty, gain flash (4 cells in a row)
  'ui.bead': { src: U + 'ui-bead-icon.png', kind: 'bg' },
  'ui.shopcloth': { src: U + 'ui-shop-cloth.png', kind: 'bg' },
  'prop.windchime': { src: 'assets/props/prop-wind-chime-gong.png', kind: 'bg' },
  'prop.blockages': { src: 'assets/props/prop-blockages.png', kind: 'bg', cut: 128 },   // rubble, beam, grate, boulder, thorns (5 cells)
  'prop.waterbank': { src: 'assets/props/prop-water-bank.png', kind: 'bg' },
  'tile.stairwell': { src: RM + 'room-tile-stairwell.png', kind: 'bg' },
  // v10: Connor's round-2 notes (11 to 21). Each is drawn in code until its file arrives.
  'ui.powercard': { src: U + 'ui-power-card.png', kind: 'bg' },
  'fx.burningground': { src: F + 'fx-burning-ground.png', kind: 'fx', frames: 8 },
  // v10 (note 14): the four new foes, and the soldier's hurt and defeat on one sheet (frames 1-4 hurt, 5-8 defeat)
  'parasol.walk': ch('soldier', 'walk', { file: 'enemy-parasol-guard' }),
  'hook.attack': ch('soldier', 'attack', { file: 'enemy-hook-duelist', refFrame: 0 }),
  'ember.throw': ch('soldier', 'throw', { file: 'enemy-ember-slinger', refFrame: 0 }),
  'potter.throw': ch('archer', 'throw', { file: 'enemy-pot-lobber', refFrame: 0 }),
  // v13: 'soldier.hurtdefeat' (soldier-hurt-defeat.png, the old blue v12 soldier) is no longer loaded; the redesign has its own hurt and defeat
  'snapper.flipped': ch('snapper', 'flipped', { file: 'enemy-reed-snapper', refFrame: 0, pose: 0.8 }),
  'fx.phaseburst-water': { src: F + 'phase-burst-water.png', kind: 'fx', frames: 8, margin: 0.045, cut: 110 },
  'fx.phaseburst-earth': { src: F + 'phase-burst-earth.png', kind: 'fx', frames: 8, margin: 0.045, cut: 110 },
  'fx.phaseburst-fire': { src: F + 'phase-burst-fire.png', kind: 'fx', frames: 8, margin: 0.045, cut: 110 },
  'prop.thornwoodgate': { src: 'assets/props/prop-thornwood-gate.png', kind: 'bg', cut: 110, maxDim: 1400 },
  'tile.kitetower': { src: RM + 'room-tile-kite-tower.png', kind: 'bg' },
  'tile.drowned': { src: RM + 'room-tile-drowned-steps.png', kind: 'bg' },
  'tile.quarry': { src: RM + 'room-tile-ninefold-quarry.png', kind: 'bg' },
  'tile.kiln': { src: RM + 'room-tile-kilnmouth.png', kind: 'bg' },
  'tile.brass': { src: RM + 'room-tile-brass-gate.png', kind: 'bg' },
  'hero.attackup': ch('hero', 'attack-up'),
  'hero.attackdiag': ch('hero', 'attack-diag'),
  'hero.runstartstop': ch('hero', 'run-start-stop', { pose: 0.95 }),
  'fx.updraft': { src: F + 'updraft-column.png', kind: 'fx', frames: 8 },
  'fx.hazardflames': { src: F + 'hazard-flames.png', kind: 'fx', frames: 8 },
  'spikes.kite': { src: RM + 'hazard-spikes-kite-hill.png', kind: 'bg' },
  'spikes.drowned': { src: RM + 'hazard-spikes-drowned-steps.png', kind: 'bg' },
  'spikes.quarry': { src: RM + 'hazard-spikes-ninefold-quarry.png', kind: 'bg' },
  'spikes.kiln': { src: RM + 'hazard-spikes-kilnmouth.png', kind: 'bg' },
  'spikes.brass': { src: RM + 'hazard-spikes-brass-gate.png', kind: 'bg' },
  'room.pottercellar': { src: RM + 'room-potters-cellar.png', kind: 'bg' },
  // v11 (Connor's note 26, review 11 #3, art A1 to A27): every enemy animates in every state. `cut` drops the soft halo
  // (alpha under the cut) the planner's sheets carry, then a 1 px erode trims the pale rim (review 11 #8).
  'parasol.idle': ch('soldier', 'idle', { file: 'enemy-parasol-guard', refFrame: 0, cut: 120, erode: 1 }),
  'parasol.attack': ch('soldier', 'attack', { file: 'enemy-parasol-guard', refFrame: 0, cut: 120, erode: 1 }),
  'parasol.hurt': ch('soldier', 'hurt', { file: 'enemy-parasol-guard', refFrame: 0, cut: 120, erode: 1 }),
  'parasol.barewalk': ch('soldier', 'bare-walk', { file: 'enemy-parasol-guard', refFrame: 0, pose: 0.82, cut: 120, erode: 1 }),
  'parasol.defeat': ch('soldier', 'defeat', { file: 'enemy-parasol-guard', refFrame: 0, cut: 120, erode: 1 }),
  'hook.idle': ch('soldier', 'idle', { file: 'enemy-hook-duelist', refFrame: 0, cut: 120, erode: 1 }),
  'hook.walk': ch('soldier', 'walk', { file: 'enemy-hook-duelist', refFrame: 0, cut: 120, erode: 1 }),
  'hook.hurt': ch('soldier', 'hurt', { file: 'enemy-hook-duelist', refFrame: 0, cut: 120, erode: 1 }),
  'hook.defeat': ch('soldier', 'defeat', { file: 'enemy-hook-duelist', refFrame: 0, cut: 120, erode: 1 }),
  'ember.idle': ch('soldier', 'idle', { file: 'enemy-ember-slinger', refFrame: 0, cut: 120, erode: 1 }),
  'ember.walk': ch('soldier', 'walk', { file: 'enemy-ember-slinger', refFrame: 0, cut: 120, erode: 1 }),
  'ember.hurt': ch('soldier', 'hurt', { file: 'enemy-ember-slinger', refFrame: 0, cut: 120, erode: 1 }),
  'ember.defeat': ch('soldier', 'defeat', { file: 'enemy-ember-slinger', refFrame: 0, cut: 120, erode: 1 }),
  'potter.idle': ch('archer', 'idle', { file: 'enemy-pot-lobber', refFrame: 0, cut: 120, erode: 1 }),
  'potter.hurt': ch('archer', 'hurt', { file: 'enemy-pot-lobber', refFrame: 0, cut: 120, erode: 1 }),
  'potter.defeat': ch('archer', 'defeat', { file: 'enemy-pot-lobber', refFrame: 0, cut: 120, erode: 1 }),
  'shield.idle': ch('shield', 'idle', { file: 'enemy-shieldbearer', refFrame: 0, cut: 120, erode: 1 }),
  'shield.hurt': ch('shield', 'hurt', { file: 'enemy-shieldbearer', refFrame: 0, cut: 120, erode: 1 }),
  'archer.idle': ch('archer', 'idle', { file: 'enemy-ember-archer', refFrame: 0, cut: 120, erode: 1 }),
  'archer.hurt': ch('archer', 'hurt', { file: 'enemy-ember-archer', refFrame: 0, cut: 120, erode: 1 }),
  'hound.idle': ch('hound', 'idle', { file: 'enemy-kiln-hound', refFrame: 0, cut: 120, erode: 1 }),
  'hound.hurt': ch('hound', 'hurt', { file: 'enemy-kiln-hound', refFrame: 0, cut: 120, erode: 1 }),
  'moth.defeat': ch('moth', 'defeat', { file: 'enemy-cinder-moth', flip: true, refFrame: 0, cut: 120 }),
  'snapper.idle': ch('snapper', 'idle', { file: 'enemy-reed-snapper', flip: true, refFrame: 0, cut: 120 }),   // v13: back to its own idle once the style-1 redraw landed (15:50)
  'snapper.defeat': ch('snapper', 'defeat', { file: 'enemy-reed-snapper', flip: true, refFrame: 0, cut: 120 }),
  'mite.idle': ch('mite', 'idle', { file: 'enemy-quarry-mite', refFrame: 0, cut: 120 }),
  'mite.defeat': ch('mite', 'defeat', { file: 'enemy-quarry-mite', flip: true, refFrame: 0, cut: 120 }),
  // v11 (review 11 D1 to D5, D11 to D14): props at their true shape, picked up when they land
  'prop.gateframetall': { src: 'assets/props/prop-gate-frame-tall.png', kind: 'bg', cut: 110, maxDim: 1100 },
  'prop.gatedoortall': { src: 'assets/props/prop-gate-door-tall.png', kind: 'bg', cut: 110, maxDim: 1100 },
  'prop.thornwood-tall': { src: 'assets/props/prop-thornwood-gate-tall.png', kind: 'bg', cut: 110, maxDim: 1100 },
  'prop.thornwood-mid': { src: 'assets/props/prop-thornwood-gate-mid.png', kind: 'bg', cut: 110, maxDim: 1100 },
  'prop.thornwood-low': { src: 'assets/props/prop-thornwood-gate-low.png', kind: 'bg', cut: 110, maxDim: 1100 },
  'prop.trialposts': { src: 'assets/props/prop-trial-posts.png', kind: 'bg', cut: 110, maxDim: 1800 },   // v11 (D14): air, water, earth, fire
  'prop.stairup': { src: 'assets/props/prop-stair-up.png', kind: 'bg', cut: 110, maxDim: 1100 },
  'prop.stairdown': { src: 'assets/props/prop-stair-down.png', kind: 'bg', cut: 110, maxDim: 1100 },
  // v11 (review 11 D6 to D10): the "not yet" brush marks and the picture signpost (code-painted marks until they land)
  'mark.fire': { src: 'assets/props/mark-fire.png', kind: 'bg', cut: 110, maxDim: 1100 },
  'mark.earth': { src: 'assets/props/mark-earth.png', kind: 'bg', cut: 110, maxDim: 1100 },
  'mark.water': { src: 'assets/props/mark-water.png', kind: 'bg', cut: 110, maxDim: 1100 },
  'mark.wind': { src: 'assets/props/mark-wind.png', kind: 'bg', cut: 110, maxDim: 1100 },
  'prop.signpost': { src: 'assets/props/prop-signpost.png', kind: 'bg', cut: 110, maxDim: 1100 },
};

// v13: the code-drawn outline and grade are OFF by default (Connor, 14:25: the redrawn ink-brush art carries its own
// outlines and a second line would fight it). ?ink=1 turns them back on for comparison.
const NOINK = !(typeof location !== 'undefined' && /[?&]ink=1/.test(location.search));
const INK = '#1d1620', INK_PX = 3;
const OLDSCALE = typeof location !== 'undefined' && /[?&]c13scale=1/.test(location.search);   // v14: before/after shots of note 50
const CHAR_WORK_H = 576; // working resolution for character cells
const ALPHA_T = 48;

// v9 (review 9 #12): a WebP copy (tools/make-webp.sh, about a seventh of the size) is used when the index lists it;
// the PNG is the fallback, so new art works the moment it lands.
let WEBP = null;
let WEBP10 = null;
let WEBP11 = null;
let WEBP13 = null;   // v13: the CHARACTER REDESIGN sheets (assets/derived/img-c13/, tools/make-webp-c13.sh)
let WEBP12 = null;   // v12: art new or replaced this cycle (assets/derived/img-c12/, tools/make-webp-c12.sh)   // v11: art new or replaced this cycle (assets/derived/img-c11/, tools/make-webp-c11.sh)
const WEBP_STALE = new Set();   // v10: a v9 WebP whose PNG changed and had no fresh copy yet (filled by the rescan)
// v15 (release build): tools/build-release.sh writes release-manifest.json (every file the game may ask for: slim WebP
// at the size it is drawn, the mp3s, the merged kit cuts) and sets window.EB_RELEASE in release/index.html. Then nothing
// is listed, HEAD-checked or re-scanned: a file not in the manifest is simply not there (no 404s on a static host).
export const REL = typeof window !== 'undefined' && !!window.EB_RELEASE;
export let RELMAN = null;
export async function loadWebpIndex() {
  if (WEBP) return;
  if (loadWebpIndex.p) return loadWebpIndex.p;
  if (REL) {
    loadWebpIndex.p = (async () => {
      try { const r = await fetch('release-manifest.json'); RELMAN = r.ok ? await r.json() : null; } catch { RELMAN = null; }
      RELMAN = RELMAN || { img: {}, audio: {}, kits: {} };
      WEBP = WEBP10 = WEBP11 = WEBP12 = WEBP13 = new Set();
    })();
    return loadWebpIndex.p;
  }
  loadWebpIndex.p = (async () => {
    try { const r = await fetch(DV + 'img/index.json', { cache: 'no-store' }); WEBP = new Set(r.ok ? await r.json() : []); } catch { WEBP = new Set(); }
    // v10: art that arrived or changed this cycle has its WebP in img-c10/ (the v9 copies are left as they were)
    try { const r = await fetch(DV + 'img-c10/index.json', { cache: 'no-store' }); WEBP10 = new Set(r.ok ? await r.json() : []); } catch { WEBP10 = new Set(); }
    try { const r = await fetch(DV + 'img-c11/index.json', { cache: 'no-store' }); WEBP11 = new Set(r.ok ? await r.json() : []); } catch { WEBP11 = new Set(); }
    try { const r = await fetch(DV + 'img-c13/index.json', { cache: 'no-store' }); WEBP13 = new Set(r.ok ? await r.json() : []); } catch { WEBP13 = new Set(); }
    try { const r = await fetch(DV + 'img-c12/index.json', { cache: 'no-store' }); WEBP12 = new Set(r.ok ? await r.json() : []); } catch { WEBP12 = new Set(); }
  })();
  return loadWebpIndex.p;
}
// v13: art is replaced in place while the game runs (same filenames). Whichever is newer wins: the PNG or its WebP copy,
// by the server's Last-Modified. The PNG's stamp is kept per key so the rescan can see it change (startRescan).
const lastMod = async (u) => { try { const r = await fetch(u, { method: 'HEAD', cache: 'no-store' }); return r.ok ? Date.parse(r.headers.get('last-modified')) || 0 : 0; } catch { return 0; } };
export async function loadImage(src, info = {}) {
  if (REL) {
    const u = RELMAN && RELMAN.img[src];
    if (!u) return null;
    // a dropped connection on a real network gets two more tries (0.5 s, then 1.5 s later) before the placeholder shows
    const one = (n) => new Promise((resolve) => { const img = new Image(); img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(img)); img.onerror = () => resolve(n < 2 ? new Promise((ok) => setTimeout(ok, 500 + n * 1000)).then(() => one(n + 1)) : null); img.src = u; });
    return one(0);
  }
  const rel = src.replace(/^assets\//, '').replace(/\.png$/, '.webp');
  const tryOne = (u) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = u; });
  const nowebp = /[?&]nowebp/.test(location.search);
  const url = nowebp ? null : WEBP13 && WEBP13.has(rel) ? DV + 'img-c13/' + rel : WEBP12 && WEBP12.has(rel) ? DV + 'img-c12/' + rel : WEBP11 && WEBP11.has(rel) ? DV + 'img-c11/' + rel : WEBP10 && WEBP10.has(rel) ? DV + 'img-c10/' + rel : WEBP && WEBP.has(rel) && !WEBP_STALE.has(rel) ? DV + 'img/' + rel : null;
  const [tp, tw] = await Promise.all([lastMod(src), url ? lastMod(url) : 0]);
  info.lm = tp;
  const png = () => tryOne(tp ? src + '?v=' + tp : src);
  if (url && !(tp && tw && tp > tw)) return tryOne(url).then((img) => img || png());
  return png().then((img) => img || (url ? tryOne(url) : null));
}
// v9 (review 9 #12): what the first rooms need loads before the title; the other regions, the bosses and the
// story stills follow in the background (a door into a region waits behind its fade until they are in).
const LATE = [/^(reed|colossus|overseer|captain|captain2|arena|story|ren|tamsin|kesh|hound|archer|moth|mite|snapper)\./,
  /^(bg|in|shaft|mid|spikes|plat|tile)\.(drowned|quarry|kiln|brass)/, /^room\.(foreman|powder|pottercellar)/, /^portrait\.(reed|colossus|overseer|captain)/];
export const isLate = (key) => key !== 'story.army' && LATE.some((r) => r.test(key));   // v15: the New Game still is in before the title
// v15: the late art is grouped by the region that first needs it, in the order the game is played. A region is ready
// when its group and every group before it are in (an enemy first met in the quarry also walks the kiln and the fort).
// Groups load as the player approaches (Assets.want), one region ahead; dev builds and ?preload=1 stream them all.
export const LATE_ORDER = ['drowned', 'quarry', 'kiln', 'brass', 'misc'];
const REGION_OF = [[/drowned|^reed\.|^(arena|portrait)\.reed|^snapper\.|^ren\./, 'drowned'], [/quarry|colossus|^mite\.|^archer\.|^tamsin\.|foreman/, 'quarry'],
  [/kiln|overseer|^hound\.|^moth\.|^kesh\.|pottercellar/, 'kiln'], [/brass|captain|powder/, 'brass']];
export const regionOf = (key) => { for (const [r, g] of REGION_OF) if (r.test(key)) return g; return 'misc'; };

// Ask the dev server for a directory listing so missing files never cause a 404.
// Returns a Set of file names, or null when no listing is available.
async function listDir(dir) {
  try {
    const res = await fetch(dir, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const names = new Set();
    for (const m of text.matchAll(/href="([^"?#]+\.png)"/gi)) names.add(decodeURIComponent(m[1].split('/').pop()));
    return names;
  } catch { return null; }
}

// The generated character sheets hold 8 poses in a row, but not on an exact grid: a
// lunge or a fallen body is wider than an eighth of the sheet and its flames reach over
// the next pose. So poses are found by shape instead: flood-fill the opaque pixels into
// connected blobs, take the n biggest as the bodies, hand every small loose blob (sparks,
// dash streaks) to the nearest body, and re-pack each pose into its own cell, centred
// on the body's legs. Returns null when it can't find n separate bodies.
function segmentPoses(src, w, h, n) {
  const px = src.data, lab = new Int32Array(w * h), stack = new Int32Array(w * h);
  const comps = [null];
  const solid = (q) => !lab[q] && px[q * 4 + 3] > ALPHA_T;
  for (let i = 0; i < w * h; i++) {
    if (!solid(i)) continue;
    const c = { id: comps.length, area: 0, x0: w, x1: -1, y0: h, y1: -1, owner: -1 };
    let sp = 0;
    stack[sp++] = i; lab[i] = c.id;
    while (sp) {
      const q = stack[--sp], x = q % w, y = (q / w) | 0;
      c.area++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x > 0 && solid(q - 1)) { lab[q - 1] = c.id; stack[sp++] = q - 1; }
      if (x < w - 1 && solid(q + 1)) { lab[q + 1] = c.id; stack[sp++] = q + 1; }
      if (y > 0 && solid(q - w)) { lab[q - w] = c.id; stack[sp++] = q - w; }
      if (y < h - 1 && solid(q + w)) { lab[q + w] = c.id; stack[sp++] = q + w; }
    }
    comps.push(c);
  }
  const bySize = comps.slice(1).sort((a, b) => b.area - a.area);
  if (bySize.length < n || bySize[n - 1].area < bySize[0].area * 0.2) return null;
  const bodies = bySize.slice(0, n).sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1));
  bodies.forEach((b, f) => { b.owner = f; });
  for (const c of bySize.slice(n)) {
    if (c.area < 6) continue;
    let best = -1, bd = (w / n) * 0.5;
    for (const b of bodies) {
      const d = Math.hypot(Math.max(0, b.x0 - c.x1, c.x0 - b.x1), Math.max(0, b.y0 - c.y1, c.y0 - b.y1));
      if (d < bd) { bd = d; best = b.owner; }
    }
    c.owner = best;
  }
  // soft outline pixels sit just under the threshold: grow each blob by two pixels
  for (let pass = 0; pass < 2; pass++) {
    const add = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1, q = y * w + 1; x < w - 1; x++, q++) {
        if (lab[q] || !px[q * 4 + 3]) continue;
        const l = lab[q - 1] || lab[q + 1] || lab[q - w] || lab[q + w];
        if (l) add.push(q, l);
      }
    }
    for (let i = 0; i < add.length; i += 2) lab[add[i]] = add[i + 1];
  }
  // anchor = where the legs are, so a punching arm doesn't drag the body backwards
  const anchor = bodies.map((b) => {
    let sum = 0, cnt = 0;
    for (let y = Math.round(b.y0 + (b.y1 - b.y0) * 0.4); y <= b.y1; y++) {
      for (let x = b.x0, q = y * w + b.x0; x <= b.x1; x++, q++) if (lab[q] === b.id) { sum += x; cnt++; }
    }
    return Math.round(cnt ? sum / cnt : (b.x0 + b.x1) / 2);
  });
  let half = 0;
  for (const c of comps) if (c && c.owner >= 0) half = Math.max(half, anchor[c.owner] - c.x0, c.x1 - anchor[c.owner]);
  const fw = (half + 4) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = fw * n; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const out = ctx.createImageData(canvas.width, h), o = out.data;
  for (let y = 0, q = 0; y < h; y++) {
    for (let x = 0; x < w; x++, q++) {
      const l = lab[q];
      if (!l) continue;
      const f = comps[l].owner;
      if (f < 0) continue;
      const d = (y * canvas.width + f * fw + fw / 2 + x - anchor[f]) * 4, s4 = q * 4;
      o[d] = px[s4]; o[d + 1] = px[s4 + 1]; o[d + 2] = px[s4 + 2]; o[d + 3] = px[s4 + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
  return { canvas, ctx, data: out, fw };
}

// Shrink the opaque area by n px: each pass keeps the smallest alpha of a pixel and its four neighbours.
function erodeAlpha(canvas, n) {
  const x = canvas.getContext('2d'), w = canvas.width, h = canvas.height, im = x.getImageData(0, 0, w, h), d = im.data;
  let a = new Uint8ClampedArray(w * h); for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
  for (let k = 0; k < n; k++) {
    const b = new Uint8ClampedArray(a);
    for (let y = 1; y < h - 1; y++) for (let i = 1; i < w - 1; i++) { const q = y * w + i; b[q] = Math.min(a[q], a[q - 1], a[q + 1], a[q - w], a[q + w]); }
    a = b;
  }
  for (let i = 0; i < w * h; i++) d[i * 4 + 3] = a[i];
  x.putImageData(im, 0, 0);
}
// v11 (review 11 #4, #11): the planner's props carry a soft pale halo; drop alpha under the cut and keep a working copy
// no bigger than maxDim (they arrive at up to 2688 px and are drawn at a few hundred)
function cleanProp(img, e) {
  const k = Math.min(1, (e.maxDim || 1200) / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
  if (e.cut) { const im = x.getImageData(0, 0, c.width, c.height), d = im.data; for (let i = 3; i < d.length; i += 4) if (d[i] < e.cut) d[i] = 0; x.putImageData(im, 0, 0); }
  return c;
}
// v12 (Connor's note 33): a sheet whose poses can't be cut apart by shape is no longer sliced on the grid (that cut a
// pose that runs past its cell off with a straight edge). The cuts go down the emptiest column near each grid line
// instead, and every pose is re-packed into a cell wide enough for all of them, keeping its place relative to the
// middle of its old cell, so the animation moves as drawn and nothing is cropped. Sheets where two poses truly touch
// (the best cut still crosses paint) are listed in Assets.touching for the redraw list.
export const TOUCHING = [];
function splitByColumns(canvas, data, fw, fh, n, name) {
  const W0 = canvas.width, px = data.data, cols = new Int32Array(W0);
  for (let y = 0; y < fh; y++) for (let x = 0, p = y * W0 * 4 + 3; x < W0; x++, p += 4) if (px[p] > ALPHA_T) cols[x]++;
  // first try the empty columns: runs of paint between gaps, the smallest merged into a neighbour until there are n
  let segs = [], st = -1, mass = 0;
  for (let x = 0; x <= W0; x++) {
    const on = x < W0 && cols[x] > 0;
    if (on) { if (st < 0) { st = x; mass = 0; } mass += cols[x]; } else if (st >= 0) { segs.push({ a: st, b: x, mass }); st = -1; }
  }
  while (segs.length > n) {
    let k = 0; segs.forEach((g, i) => { if (g.mass < segs[k].mass) k = i; });
    const g = segs[k], L = segs[k - 1], R = segs[k + 1];
    const into = !L ? R : !R ? L : (g.a - L.b <= R.a - g.b ? L : R);
    into.a = Math.min(into.a, g.a); into.b = Math.max(into.b, g.b); into.mass += g.mass; segs.splice(k, 1);
  }
  if (segs.length === n) {
    const cuts = [0]; for (let i = 1; i < n; i++) cuts.push(Math.round((segs[i - 1].b + segs[i].a) / 2)); cuts.push(W0);
    return repackCuts(canvas, cuts, fw, fh, n, segs.map((g) => (g.a + g.b) / 2));
  }
  const cuts = [0];
  let crossed = 0;
  for (let i = 1; i < n; i++) {
    const g = i * fw, r = Math.round(fw * 0.4);
    let best = g, bv = Infinity;
    for (let x = Math.max(cuts[i - 1] + 8, g - r); x <= Math.min(W0 - 8, g + r); x++) { const v = cols[x] * 1000 + Math.abs(x - g); if (v < bv) { bv = v; best = x; } }
    if (cols[best] > 0) crossed++;
    cuts.push(best);
  }
  cuts.push(W0);
  if (crossed) TOUCHING.push(name + ' (' + crossed + ' cut' + (crossed > 1 ? 's' : '') + ' cross paint)');
  return { ...repackCuts(canvas, cuts, fw, fh, n, null), touch: crossed > 0 };
}
// each pose between its cuts goes into a cell wide enough for every pose; it keeps its place relative to the middle of
// its old grid cell (or, for poses found by their gaps, it is centred on its own paint)
function repackCuts(canvas, cuts, fw, fh, n, centres) {
  const mid = (f) => (centres ? centres[f] : f * fw + fw / 2);
  let half = fw / 2;
  for (let f = 0; f < n; f++) { const c = mid(f); half = Math.max(half, c - cuts[f], cuts[f + 1] - c); }
  const nfw = Math.ceil(half + 6) * 2;
  const out = document.createElement('canvas'); out.width = nfw * n; out.height = fh;
  const octx = out.getContext('2d', { willReadFrequently: true });
  for (let f = 0; f < n; f++) {
    const c = mid(f), a = cuts[f], b = cuts[f + 1];
    octx.drawImage(canvas, a, 0, b - a, fh, f * nfw + nfw / 2 - (c - a), 0, b - a, fh);
  }
  return { canvas: out, ctx: octx, data: octx.getImageData(0, 0, out.width, fh), fw: nfw };
}
// v12 (Connor's note 36): no flipbook effect may show a straight edge, whatever the art does. Each cell's alpha fades
// to 0 over its outer 24 px (scaled to the cell), so a flame or a ring that reaches its cell's side melts away instead.
function featherCells(px, W0, fw, fh, n, m = 24) {
  const k = Math.max(6, Math.round(m * fw / 384));
  for (let y = 0; y < fh; y++) {
    const ey = Math.min(y, fh - 1 - y);
    for (let x = 0; x < W0; x++) {
      const cx = x % fw, e = Math.min(cx, fw - 1 - cx, ey);
      if (e >= k) continue;
      const q = (y * W0 + x) * 4 + 3; px[q] = px[q] * (e / k) * (e / k) | 0;
    }
  }
}
function processSheet(img, entry) {
  const n = entry.frames;
  const srcFw = img.width / n;
  // v14 (Connor's note 50): a sheet can ask for a bigger working canvas. The Rime Warden's poses fill only part of their
  // 1152 px cells; halved to 576 its body was about 150 px tall and drawn at 361 (2.4x up: grainy). Kept at full size.
  // v14 (round 6): never a working canvas wider than 4,096 px (the Warden's rush sheet is 5,776: over weak GPUs' limit)
  const k = Math.min(entry.kind === 'char' ? Math.min(1, ((!OLDSCALE && entry.workH) || CHAR_WORK_H) / img.height) : 1, 4096 / img.width);
  let fw = Math.round(srcFw * k);
  const fh = Math.round(img.height * k);
  let canvas = document.createElement('canvas');
  canvas.width = fw * n; canvas.height = fh;
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  for (let i = 0; i < n; i++) ctx.drawImage(img, i * srcFw, 0, srcFw, img.height, i * fw, 0, fw, fh);
  let data = ctx.getImageData(0, 0, canvas.width, fh);
  // v12 (note 39): a thin ground line drawn under all the poses (the Rime Warden's rise and defeat): any row that is
  // opaque across more than half the sheet, plus a row either side, is cleared before the poses are cut apart
  if (entry.groundLine) {
    // in the lowest fifth of the sheet, paint that is no more than 9 px tall (a line, not a foot) is cleared
    const d = data.data, W0 = canvas.width, y0 = Math.floor(fh * 0.8);
    for (let x = 0; x < W0; x++) {
      let y = y0;
      while (y < fh) {
        if (d[(y * W0 + x) * 4 + 3] <= 20) { y++; continue; }
        let e = y; while (e < fh && d[(e * W0 + x) * 4 + 3] > 20) e++;
        let top = y; while (top > 0 && d[((top - 1) * W0 + x) * 4 + 3] > 20) top--;
        if (e - top <= 9) for (let yy = top; yy < e; yy++) d[(yy * W0 + x) * 4 + 3] = 0;
        y = e;
      }
    }
  }
  const seg = entry.kind === 'char' && !entry.gaps ? segmentPoses(data, canvas.width, fh, n) : null;   // v12: gaps = cut on the empty columns
  let touch = false;
  if (seg) ({ canvas, ctx, data, fw } = seg);
  else if (entry.kind === 'char') ({ canvas, ctx, data, fw, touch = false } = splitByColumns(canvas, data, fw, fh, n, entry.src.split('/').pop()));
  const px = data.data;
  let feathered = false;
  // v14 (Connor's note 65: "a random square pops up in the middle of the boss with a watermark image in it"): the phase
  // bursts were painted with a square border round every cell (water) or a grey textured haze across the strip (earth),
  // and played over the boss at each phase change. margin clears a band round each cell; cut (below) drops the haze.
  // v14 (round 6): the frost-crack tell is painted on its own grey stone slab; keep only the cyan cracks, glow and motes
  // (blue clearly above red), so it lies over the real floor with no second slab
  // v16 (planner): the drowned r7 kit carries a faint magenta keying fringe on its slab edges: drop magenta-hued pixels
  if (entry.keyMagenta) { for (let i = 0; i < px.length; i += 4) { const r = px[i], g = px[i + 1], b = px[i + 2]; if (px[i + 3] && r > 110 && b > 90 && g < Math.min(r, b) * 0.72) px[i + 3] = 0; } }
  if (entry.keepCyan) { for (let i = 0; i < px.length; i += 4) { const r = px[i], g = px[i + 1], b = px[i + 2]; if (!(b - r > 45 && b > 120)) px[i + 3] = 0; } }
  if (entry.margin) { const W0 = canvas.width, m = Math.round(Math.min(fw, fh) * entry.margin); for (let y = 0; y < fh; y++) for (let x = 0; x < W0; x++) { const cx = x % fw; if (cx < m || cx >= fw - m || y < m || y >= fh - m) px[(y * W0 + x) * 4 + 3] = 0; } }
  if (entry.kind === 'fx' && !entry.nofeather) { featherCells(px, canvas.width, fw, fh, n); feathered = true; }
  const frames = [];
  let dirty = !!entry.keyMagenta;   // v16: the magenta key is written back too
  // v11 (review 11 #3, #8): drop the soft halo before measuring, so it neither shows nor sizes the frame
  if (entry.cut) { for (let i = 3; i < px.length; i += 4) if (px[i] < entry.cut) px[i] = 0; dirty = true; }
  for (let f = 0; f < n; f++) {
    const cols = new Int32Array(fw);
    for (let y = 0; y < fh; y++) {
      let p = (y * canvas.width + f * fw) * 4 + 3;
      for (let x = 0; x < fw; x++, p += 4) if (px[p] > ALPHA_T) cols[x]++;
    }
    if (entry.kind === 'char' && !seg) {
      // Fallback for sheets whose poses touch: slice on the grid. Neighbouring poses
      // bleed over the cell edge; any small run of columns that touches the edge and
      // isn't the body is erased.
      const runs = [];
      let start = -1, gap = 0, mass = 0, last = -1;
      for (let x = 0; x <= fw; x++) {
        const on = x < fw && cols[x] > 0;
        if (on) { if (start < 0) { start = x; mass = 0; } mass += cols[x]; last = x; gap = 0; }
        else if (start >= 0 && (++gap > 5 || x === fw)) { runs.push({ a: start, b: last, mass }); start = -1; }
      }
      if (runs.length > 1) {
        const main = runs.reduce((m, r) => (r.mass > m.mass ? r : m), runs[0]);
        for (const r of runs) {
          if (r === main || r.mass > main.mass * 0.25) continue;
          if (r.a > 2 && r.b < fw - 3) continue; // floating bits inside the cell (dash streaks) stay
          for (let y = 0; y < fh; y++) {
            let p = (y * canvas.width + f * fw + r.a) * 4 + 3;
            for (let x = r.a; x <= r.b; x++, p += 4) px[p] = 0;
          }
          for (let x = r.a; x <= r.b; x++) cols[x] = 0;
          dirty = true;
        }
      }
    }
    let x0 = fw, x1 = -1, y0 = fh, y1 = -1;
    for (let x = 0; x < fw; x++) if (cols[x] > 0) { if (x < x0) x0 = x; x1 = x; }
    for (let y = 0; y < fh; y++) {
      let p = (y * canvas.width + f * fw + Math.max(0, x0)) * 4 + 3, hit = false;
      for (let x = x0; x <= x1; x++, p += 4) if (px[p] > ALPHA_T) { hit = true; break; }
      if (hit) { if (y < y0) y0 = y; y1 = y; }
    }
    if (x1 < 0) { x0 = 0; x1 = fw - 1; y0 = 0; y1 = fh - 1; }
    frames.push({ x0, y0, x1, y1 });
  }
  if (dirty || feathered) ctx.putImageData(data, 0, 0);
  const foot = Math.max(...frames.map((b) => b.y1));          // lowest opaque row of the sheet
  const maxH = Math.max(...frames.map((b) => b.y1 - b.y0 + 1)); // tallest frame
  const hs = frames.map((b) => b.y1 - b.y0 + 1).sort((a, b) => a - b);
  const refH = (hs[(n - 1) >> 1] + hs[n >> 1]) / 2;              // median frame height
  const ux0 = Math.min(...frames.map((b) => b.x0)), ux1 = Math.max(...frames.map((b) => b.x1));
  const uy0 = Math.min(...frames.map((b) => b.y0));
  if (entry.erode) erodeAlpha(canvas, entry.erode);   // v9 (review 9 #10): trims a pale cut-out line off the edge
  return { canvas, fw, fh, n, frames, foot, maxH, refH, seg: !!seg, touch, union: { x0: ux0, y0: uy0, x1: ux1, y1: foot } };
}

export const Assets = {
  touching: TOUCHING,
  items: {},     // key -> processed asset (only for files that exist)
  progress: 0,
  ready: false,
  _tints: new Map(),
  _scratch: null,
  _known: new Set(),

  allLoaded: false,
  async load() {
    await loadWebpIndex();
    await this._scan(true, (k) => !isLate(k));
    this.ready = true;
    this._lateTotal = Object.keys(MANIFEST).filter(isLate).length || 1; this._lateN = 0;
    this._groups = {}; this._queue = [];
    this.lateDone = new Promise((ok) => { this._lateOk = ok; }).then(() => { this.allLoaded = true; });
    const all = !REL || /[?&]preload/.test(location.search);
    if (all) this.loadAll(); else this.want('drowned');   // the next region is fetched while the title is up
  },
  // v15: ask for a region's art (and everything before it in LATE_ORDER); returns a promise for when it is in
  want(region) {
    if (!this._groups) return Promise.resolve();
    const upto = LATE_ORDER.indexOf(region === 'kite' ? 'drowned' : region);
    if (upto < 0) return Promise.resolve();
    const ps = LATE_ORDER.slice(0, upto + 1).map((g) => this._group(g));
    return Promise.all(ps);
  },
  loadAll() { return this.want('misc'); },
  regionProgress(region) {
    const upto = LATE_ORDER.indexOf(region), keys = Object.keys(MANIFEST).filter((k) => isLate(k) && LATE_ORDER.indexOf(regionOf(k)) <= upto);
    return keys.length ? keys.filter((k) => this._tried && this._tried.has(k)).length / keys.length : 1;
  },
  regionReady(region) {
    if (region === 'kite' || this.allLoaded) return true;
    const upto = LATE_ORDER.indexOf(region);
    return !!this._groups && LATE_ORDER.slice(0, upto + 1).every((g) => this._groups[g] && this._groups[g].done);
  },
  // groups load one after another (so the nearest region is not starved by the far ones)
  _group(g) {
    if (this._groups[g]) return this._groups[g].p;
    const rec = this._groups[g] = { done: false };
    const prev = this._chain || Promise.resolve();
    rec.p = this._chain = prev.then(() => this._scan(true, (k) => isLate(k) && regionOf(k) === g, 2)).then(() => {
      rec.done = true;
      if (LATE_ORDER.every((x) => this._groups[x] && this._groups[x].done)) { this.lateProgress = 1; this._lateOk(); }
    });
    return rec.p;
  },
  // v15: entering a room asks for its own region and every region one exit or door away
  // (upto: the furthest region in LATE_ORDER worth fetching ahead, by story progress; the room's own region always loads)
  near(rooms, id, upto = 99) {
    const d = rooms[id], out = new Set(); if (!d) return out;
    out.add(d.region);
    for (const x of [...(d.exits || []), ...(d.doors || [])]) if (x.to && rooms[x.to] && LATE_ORDER.indexOf(rooms[x.to].region) <= upto) out.add(rooms[x.to].region);
    if (this._groups) for (const r of out) this.want(r);
    return out;
  },

  async _scan(first, only = null, quiet = false) {
    const dirs = {};
    if (REL) { for (const src in RELMAN.img) { const d = src.slice(0, src.lastIndexOf('/') + 1); (dirs[d] = dirs[d] || new Set()).add(src.slice(d.length)); } }
    else for (const d of [C, F, B, RM, U, DV, 'assets/story/', 'assets/props/']) dirs[d] = await listDir(d);
    if (REL && !first) return;
    const listings = Object.values(dirs).some(Boolean);   // the server lists folders: a missing folder is just empty
    const todo = [];
    for (const key in MANIFEST) {
      if (this.items[key] || (only && !only(key))) continue;
      const e = MANIFEST[key];
      const dir = e.src.slice(0, e.src.lastIndexOf('/') + 1), name = e.src.slice(dir.length);
      const listing = dirs[dir];
      // With a listing we only request files that exist (no 404 noise).
      // Without one (a server with no directory index) we just try on the first pass.
      if (listing ? listing.has(name) : first && !listings) todo.push(key);
    }
    let done = 0;
    await Promise.all(todo.map(async (key) => {
      const e = MANIFEST[key];
      const info = {}, img = await loadImage(e.src, info);
      // v15: art that arrives during play is cut one sheet per frame, so a region streaming in never stalls the game
      if (img && quiet) { const prev = this._cutQ || Promise.resolve(); let go; this._cutQ = new Promise((ok) => { go = ok; }); await prev; await new Promise((ok) => (typeof requestAnimationFrame !== 'undefined' && !document.hidden ? requestAnimationFrame(() => setTimeout(ok, 0)) : setTimeout(ok, 0))); setTimeout(go, 0); }
      if (img) {
        this.stamp[key] = info.lm;
        try { this.items[key] = e.kind === 'bg' ? { img: e.cut || e.maxDim ? cleanProp(img, e) : img } : processSheet(img, e); }
        catch (err) { console.warn('asset failed to process, using placeholder:', key, err); }
      }
      (this._tried = this._tried || new Set()).add(key);
      done++; if (!quiet) this.progress = done / todo.length; else if (quiet === 2) this.lateProgress = Math.min(0.99, ++this._lateN / this._lateTotal); else this.lateProgress = done / todo.length;
    }));
    if (!quiet) this.progress = 1;
  },

  // v13: every 20 s, re-read the fresh list; a sheet whose PNG was replaced since it loaded is dropped and reloaded,
  // so the planner's redrawn art swaps in while the game runs (the old sheet stays on screen until the new one is cut).
  startRescan() {
    if (REL) return;   // v15: a release build never changes under the player
    setInterval(async () => {
      if (this._busy) return; this._busy = true;
      try {
        const keys = Object.keys(this.items).filter((k) => MANIFEST[k] && this.stamp[k]);
        for (let i = 0; i < keys.length; i += 24) {
          const part = keys.slice(i, i + 24), lms = await Promise.all(part.map((k) => lastMod(MANIFEST[k].src)));
          for (let j = 0; j < part.length; j++) {
            const key = part[j], lm = lms[j];
            if (!lm || lm === this.stamp[key]) continue;
            const e = MANIFEST[key], info = {}, img = await loadImage(e.src, info);
            if (!img) continue;
            try { const it = e.kind === 'bg' ? { img: e.cut || e.maxDim ? cleanProp(img, e) : img } : processSheet(img, e); this.items[key] = it; this.stamp[key] = info.lm || lm; if (!NOINK && e.kind === 'char') this._ink(key); this._tints.forEach((_, id) => { if (id.startsWith(key + '|')) this._tints.delete(id); }); this.swapped = (this.swapped || 0) + 1; }
            catch (err) { console.warn('replaced asset failed to process, keeping the old one:', key, err); this.stamp[key] = lm; }
          }
        }
        await this._scan(false);
      } finally { this._busy = false; }
    }, 20000);
  },
  stamp: {},

  get(key) { return (key === 'portrait.captain' && this.items['portrait.captain2']) || this.items[key] || null; },
  // Sheet pixels -> screen pixels for a character sheet (see TARGET above).
  scaleOf(key) {
    const it = this.items[key], e = MANIFEST[key];
    if (e.h) return e.h / it.maxH;
    // v16 (note 75): srcH = the standing figure's height in the 1152 px source cell, for tell sheets whose first frame is a
    // crouch or a leap (every cast sheet of one guardian is drawn at one scale, not each by its own first frame)
    if (e.srcH) return TARGET[e.who] * (e.pose || 1) / (e.srcH * it.fh / 1152);
    // v6: refFrame = size the sheet by one upright frame (a collapse whose first frame must match the walk sheet)
    if (e.refFrame != null && it.frames[e.refFrame]) { const b = it.frames[e.refFrame]; return TARGET[e.who] * (e.pose || 1) / (b.y1 - b.y0 + 1); }
    return (TARGET[e.who] * (e.pose || 1)) / it.refH;
  },
  // Opaque height of a frame on screen (used to place health bars, hit sparks).
  heightOf(key, frame = 0) {
    const it = this.items[key]; if (!it) return 0;
    const b = it.frames[((frame % it.n) + it.n) % it.n];
    return (b.y1 - b.y0 + 1) * this.scaleOf(key);
  },
  has(key) { return !!this.items[key]; },
  // v9: a 'bg' image laid out as n cells in a row (hearts, blockages): each cell trimmed to what is painted in it.
  // dropRing: the piece with the biggest outline is a frame drawn around the cell's subject, and is left out.
  // Returns [{ sx, sy, sw, sh }] in source pixels, cached per image.
  cells(key, n, o = {}) {
    const it = this.items[key]; if (!it) return null;
    if (it._cells) return it._cells;
    const img = it.img, k = Math.min(1, 220 / (img.width / n)), cw = Math.round(img.width / n * k), chh = Math.round(img.height * k);
    const c = document.createElement('canvas'); c.width = cw * n; c.height = chh;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
    const data = x.getImageData(0, 0, c.width, c.height).data, out = [];
    for (let ci = 0; ci < n; ci++) {
      const lab = new Int32Array(cw * chh), comps = [];
      const op = (i, j) => data[(j * c.width + ci * cw + i) * 4 + 3] > 100;
      for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) {
        if (lab[j * cw + i] || !op(i, j)) continue;
        const cp = { x0: i, x1: i, y0: j, y1: j, area: 0 }, st = [j * cw + i]; lab[j * cw + i] = comps.length + 1;
        while (st.length) {
          const q = st.pop(), qi = q % cw, qj = (q / cw) | 0; cp.area++;
          if (qi < cp.x0) cp.x0 = qi; if (qi > cp.x1) cp.x1 = qi; if (qj < cp.y0) cp.y0 = qj; if (qj > cp.y1) cp.y1 = qj;
          for (const [a, b] of [[qi - 1, qj], [qi + 1, qj], [qi, qj - 1], [qi, qj + 1]]) if (a >= 0 && b >= 0 && a < cw && b < chh && !lab[b * cw + a] && op(a, b)) { lab[b * cw + a] = comps.length + 1; st.push(b * cw + a); }
        }
        comps.push(cp);
      }
      let keep = comps.slice();
      if (o.dropRing && keep.length > 1) { const big = keep.reduce((m, q) => ((q.x1 - q.x0) * (q.y1 - q.y0) > (m.x1 - m.x0) * (m.y1 - m.y0) ? q : m)); keep = keep.filter((q) => q !== big); }
      const maxA = Math.max(1, ...keep.map((q) => q.area));
      keep = keep.filter((q) => q.area > maxA * 0.04 && q.x0 > 0 && q.x1 < cw - 1 || q.area > maxA * 0.5);
      if (!keep.length) { out.push({ sx: ci * img.width / n, sy: 0, sw: img.width / n, sh: img.height }); continue; }
      const b = keep.reduce((m, q) => ({ x0: Math.min(m.x0, q.x0), x1: Math.max(m.x1, q.x1), y0: Math.min(m.y0, q.y0), y1: Math.max(m.y1, q.y1) }), { x0: 1e9, x1: -1, y0: 1e9, y1: -1 });
      out.push({ sx: (ci * cw + b.x0) / k, sy: b.y0 / k, sw: (b.x1 - b.x0 + 1) / k, sh: (b.y1 - b.y0 + 1) / k });
    }
    return (it._cells = out);
  },
  // Draw a trimmed cell so its bottom centre sits at (x, y), h px tall (or w px wide when h is null).
  drawCell(ctx, key, n, i, x, y, h, o = {}) {
    const cs = this.cells(key, n, o); if (!cs) return false;
    const c = cs[i], s = h != null ? h / c.sh : o.w / c.sw, w = c.sw * s, hh = c.sh * s;
    ctx.save(); if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    if (o.flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
    ctx.drawImage(this.items[key].img, c.sx, c.sy, c.sw, c.sh, x - w / 2, o.center ? y - hh / 2 : y - hh, w, hh);
    ctx.restore(); return true;
  },
  // How far a frame's art reaches in front of its anchor (facing right), in screen pixels.
  reachOf(key, frame = 0) {
    const it = this.items[key]; if (!it) return 0;
    const b = it.frames[((frame % it.n) + it.n) % it.n];
    return (b.x1 + 1 - it.fw / 2) * this.scaleOf(key);
  },

  _scratchFor(w, h) {
    if (!this._scratch) this._scratch = document.createElement('canvas');
    const s = this._scratch;
    if (s.width < w || s.height < h) { s.width = Math.max(s.width, w); s.height = Math.max(s.height, h); }
    return s;
  },

  // v13 (the 2D style pass): the cel look of the 3D game. Each character sheet gets, once, on its first draw, a
  // consistent ink outline round its outer silhouette (#1d1620, about 3 px on screen at 1080p, whatever the sheet's
  // scale) and a gentle saturation and contrast lift, baked into its work canvas (no extra canvas kept, nothing extra
  // per frame). Backgrounds are never touched. ?noink=1 shows the sheets as they were (the before/after shots).
  _ink(key) {
    const it = this.items[key]; it.inked = true;
    if (NOINK) return;
    const cv = it.canvas, w = cv.width, h = cv.height, r = Math.max(2, Math.min(10, INK_PX / this.scaleOf(key)));
    const sil = document.createElement('canvas'); sil.width = w; sil.height = h;
    const sx = sil.getContext('2d'); sx.drawImage(cv, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = INK; sx.fillRect(0, 0, w, h);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const x = out.getContext('2d');
    for (let f = 0; f < it.n; f++) {
      x.save(); x.beginPath(); x.rect(f * it.fw, 0, it.fw, h); x.clip();   // the outline never spills into the next pose's cell
      for (let a = 0; a < 12; a++) x.drawImage(sil, Math.cos(a * Math.PI / 6) * r, Math.sin(a * Math.PI / 6) * r);
      x.restore();
    }
    x.filter = 'saturate(1.22) contrast(1.07)';
    x.drawImage(cv, 0, 0);
    x.filter = 'none';
    it.canvas = out; this._tints.forEach((_, id) => { if (id.startsWith(key + '|')) this._tints.delete(id); });
  },
  // Warm the outlines in idle time after loading, so a sheet's first appearance never hitches.
  warmInk(sync = false) {
    if (NOINK) return;
    const keys = Object.keys(this.items).filter((k) => MANIFEST[k] && MANIFEST[k].kind === 'char' && !this.items[k].inked);
    if (sync) { for (const k of keys) this._ink(k); return; }   // behind the loading screen: no hitch later
    const next = () => { const t0 = performance.now(); while (keys.length && performance.now() - t0 < 8) { const k = keys.shift(); if (this.items[k] && !this.items[k].inked) this._ink(k); } if (keys.length) (window.requestIdleCallback || setTimeout)(next); };
    next();
  },

  // Tinted copy of a whole sheet (slinger / Captain variants), cached.
  _tinted(key, tint) {
    const id = key + '|' + tint;
    let c = this._tints.get(id);
    if (!c) {
      const it = this.items[key];
      c = document.createElement('canvas');
      c.width = it.canvas.width; c.height = it.canvas.height;
      const x = c.getContext('2d');
      x.drawImage(it.canvas, 0, 0);
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = tint;
      x.fillRect(0, 0, c.width, c.height);
      this._tints.set(id, c);
    }
    return c;
  },

  // Draw one frame of a character sheet with its foot line at (x, feetY).
  // o: { flash 0..1, alpha, tint 'rgba()', scale, rot }
  // Returns false when the sheet is missing so the caller can draw a placeholder.
  drawChar(ctx, key, frame, x, feetY, face, o = {}) {
    const it = this.items[key];
    if (!it) return false;
    const e = MANIFEST[key];
    const f = ((frame % it.n) + it.n) % it.n;
    const s = this.scaleOf(key) * (o.scale || 1), ssx = o.sx || 1, ssy = o.sy || 1;
    const footRow = e.align === 'sheet' ? it.foot : it.frames[f].y1;
    if (!it.inked) this._ink(key);
    const src = o.tint ? this._tinted(key, o.tint) : it.canvas, sx = f * it.fw;
    ctx.save();
    ctx.imageSmoothingQuality = 'high';   // v14 (note 50): good downscaling for every sheet
    ctx.translate(x, feetY);
    if (this.inkMode) ctx.filter = this.inkMode === 'light' ? 'brightness(0) invert(0.93) sepia(0.25)' : 'brightness(0)';   // v13: an impact frame draws the fighters as black ink
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale((face < 0 ? -1 : 1) * (e.flip ? -1 : 1) * ssx, ssy);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    const dx = -it.fw / 2 * s, dy = -footRow * s, dw = it.fw * s, dh = it.fh * s;
    // a rim of light around the outline (enemies on busy paintings): the silhouette in one
    // colour, nudged out a few pixels, under the art
    if (o.rim && !this.inkMode) {
      const sil = this._tinted(key, o.rim), r = (key.startsWith('colossus.') ? 1.5 : 3) / ssx, a0 = ctx.globalAlpha;   // v7: half width on the Colossus (it read as a sticker)
      ctx.globalAlpha = a0 * (o.rimA || 0.55);
      for (const [ox, oy] of [[-r, 0], [r, 0], [0, -r], [0, r]]) ctx.drawImage(sil, sx, 0, it.fw, it.fh, dx + ox, dy + oy, dw, dh);
      ctx.globalAlpha = a0;
    }
    ctx.drawImage(src, sx, 0, it.fw, it.fh, dx, dy, dw, dh);
    // hit flash: the art brightens (additive light), it is never painted over
    if (o.flash > 0 && !this.inkMode) {
      const sc = this._scratchFor(it.fw, it.fh), x2 = sc.getContext('2d');
      x2.globalCompositeOperation = 'copy';
      x2.drawImage(src, sx, 0, it.fw, it.fh, 0, 0, it.fw, it.fh);
      x2.globalCompositeOperation = 'source-atop';
      x2.fillStyle = `rgb(${o.flashColor || '255,250,240'})`;
      x2.fillRect(0, 0, it.fw, it.fh);
      x2.globalCompositeOperation = 'source-over';
      // v5: 'screen' at 28% lifts the art toward the colour without burning it to white; the ink outlines stay
      // v8: flashOver paints the colour straight over the body (the hero's solid white first beat of a hit)
      ctx.globalCompositeOperation = o.flashOver ? 'source-over' : 'screen';
      ctx.globalAlpha *= Math.min(o.flashMax || 0.28, o.flash);
      ctx.drawImage(sc, 0, 0, it.fw, it.fh, dx, dy, dw, dh);
    }
    ctx.restore();
    return true;
  },

  // Draw one FX frame. `size` = on-screen size of the (square) cell.
  // anchor: 'center' (cell centre at x,y), 'left' (cell's left-middle at x,y),
  // 'bottom' (sheet's lowest opaque row, centred, at x,y).
  drawFx(ctx, key, frame, x, y, size, face = 1, o = {}) {
    const it = this.items[key];
    if (!it) return false;
    const f = Math.max(0, Math.min(it.n - 1, frame | 0));
    const s = size / it.fh;
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(face < 0 ? -1 : 1, 1);
    if (o.sy || o.sx) ctx.scale(o.sx || 1, o.sy || 1);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    if (o.blend) ctx.globalCompositeOperation = o.blend;
    let dx = -it.fw / 2 * s, dy = -it.fh / 2 * s;
    if (o.anchor === 'left') dx = 0;
    if (o.anchor === 'bottom') dy = -it.foot * s;
    // v5: the water sheet is a hard royal blue; wash it into the game's own pale teal
    const tint = o.tint || (key === 'fx.whip' ? 'rgba(150,215,225,0.45)' : null);
    ctx.drawImage(tint ? this._tinted(key, tint) : it.canvas, f * it.fw, 0, it.fw, it.fh, dx, dy, it.fw * s, it.fh * s);
    ctx.restore();
    return true;
  },

  // v14 (round 6): draw a strip frame by its painted box, not its cell: scaled so frame refF's box is `w` wide, and placed
  // by the box's centre ('center') or bottom middle ('bottom'). The round-6 strips sit small in tall cells.
  drawFxBox(ctx, key, frame, x, y, w, face = 1, o = {}) {
    const it = this.items[key];
    if (!it || !it.frames) return false;
    const f = Math.max(0, Math.min(it.n - 1, frame | 0)), rb = it.frames[o.refF ?? 0] || it.frames[f], b = it.frames[f];
    if (!rb || !b) return false;
    const s = w / Math.max(1, rb.x1 - rb.x0 + 1), bx = (b.x0 + b.x1 + 1) / 2, by = o.anchor === 'bottom' ? b.y1 + 1 : (b.y0 + b.y1 + 1) / 2;
    ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); ctx.scale(face < 0 ? -1 : 1, 1);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.drawImage(o.tint ? this._tinted(key, o.tint) : it.canvas, f * it.fw, 0, it.fw, it.fh, -bx * s, -by * s, it.fw * s, it.fh * s);
    ctx.restore();
    return true;
  },

  // Fit a frame onto a world rect (used for ice / stone walls): the hold frame's
  // opaque box is scaled to the rect's width, bottoms aligned.
  drawFxFit(ctx, key, frame, holdFrame, r, o = {}) {
    const it = this.items[key];
    if (!it) return false;
    const hb = it.frames[holdFrame], f = Math.max(0, Math.min(it.n - 1, frame | 0));
    const s = (r.w * (o.over || 1.12)) / (hb.x1 - hb.x0 + 1);
    const cx = (hb.x0 + hb.x1 + 1) / 2;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.drawImage(it.canvas, f * it.fw, 0, it.fw, it.fh, r.x + r.w / 2 - cx * s, r.y + (o.h || r.h) - (hb.y1 + 1) * s + (o.sink || 0), it.fw * s, it.fh * s);
    ctx.restore();
    return true;
  },
};
