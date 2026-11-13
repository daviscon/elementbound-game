// Region 1: Kite Hill (start and hub). The room format is documented at the top of world.js.
// The first level: wake in the Monastery Yard, meet Elder Sora-Lin, learn air at the Shrine
// of Wind, open the west shutter with a gust, fight through the West Gate and go down to the
// drowned terraces. Every later gate is already in view here: the flooded stairwell (ice),
// the cracked floor (earth), thornwood (fire) and the gorge (glide).
export default {
  region: 'kite',
  rooms: {
    kh1: {
      name: 'Monastery Yard', w: 3200, h: 1080, map: [10, 3, 2, 1], bg: { ox: 0.15, oy: 0.55, zoom: 1.08 },
      start: [620, 900],             // v4: clear of the busy wind wheel (was 420)
      solids: [
        [0, 900, 3200, 180],
        [1880, 760, 520, 140],            // the old bell terrace
      ],
      // v12 (Connor's note 35): the yard's first test of timing. The upper roof ledge is loose old tiles (it crumbles a
      // moment after you land: keep moving), and a column of wind off the bell terrace carries you (hold ✕) up to the
      // Lotus Petal on the roof. An optional climb with a reward, using only the jump.
      // v14 (Connor's note 40): the column of wind is gone and the loose roof ledge stands clear of the east exit (its old
      // wall column at the room's edge read as a dead end). The Lotus Petal sits over the loose ledge: jump, grab, keep moving.
      oneways: [[2560, 640, 240], [2800, 500, 220, 'rock', { crumble: true }], [1420, 620, 220]],
      gates: [{ id: 'shutter-west', t: 'shutter', r: [70, 480, 130, 420] }],   // the west gate: a studded door in a timber frame
      // why it's here: a wind-chime rig on a post; its rope runs to the west gate's counterweight. Kite Hill is the
      // windy monastery, so a strong gust ringing the chimes is what lifts its gates (no water here, so no water wheels).
      wheels: [{ x: 520, y: 900, gate: 'shutter-west', kind: 'chime' }],
      cutscene: 'arrival',
      villagers: [{ who: 'child', x: 1720, y: 900 }],
      stone: { x: 760, y: 900 },
      npc: { x: 1240, y: 900, auto: true, reach: 420, talks: [['shrine-air', 'afterAir'], [null, 'intro']] },
      pickups: [{ id: 'heart-kh1', t: 'heart', x: 2910, y: 390 }, { t: 'wisp', x: 1530, y: 570 }, { t: 'wisp', x: 2680, y: 590 }, { t: 'wisp', x: 3080, y: 840 }, { t: 'wisp', x: 2140, y: 700 }],
      props: [
        ['flags', 330, 902, 330], ['stonelantern', 980, 904, 200], ['baskets', 1640, 904, 150], ['bellshrine', 2150, 764, 300],
        ['lantern', 1920, 764, 210], ['bonsai', 2420, 904, 190], ['kites', 2700, 904, 220], ['flags', 3120, 902, 330, true],
      ],
      fg: [['stonelantern', 1300, 1180, 320], ['flags', 3700, 1200, 520]],   // v9 (review 9 #8): the bonsai left the lane
      exits: [
        { side: 'left', range: [0, 1080], to: 'kh7', at: [3770, 900] },
        { side: 'right', range: [0, 1080], to: 'kh2', at: [70, 970] },
      ],
      hints: [
        
        
        { r: [1400, 300, 600, 600], text: 'Hold {jump} longer to jump higher.', once: true, without: 'gust' },
        // v11 (Connor's note 25): the west/east choice, in pictures: west to the water (Drowned Steps), east to the wind shrine
        { r: [960, 600, 260, 320], post: [1090, 900], sign: true, boards: [['water', -1], ['wind', 1]] },
      ],
    },
    kh2: {
      name: 'Hall of Winds', w: 1920, h: 1080, map: [12, 3, 1, 1], bg: { kind: 'in', oy: 0.6 },
      solids: [[0, 970, 1920, 110, 'none'], [0, 0, 1920, 60, 'none']],
      oneways: [[200, 760, 260, 'walkway'], [1480, 760, 260, 'walkway']],
      shrine: { x: 960, y: 970, el: 'air' },
      npc: { x: 1300, y: 970, talks: [['shrine-air', 'afterAir'], [null, 'intro']] },
      pickups: [{ t: 'wisp', x: 330, y: 710 }, { t: 'wisp', x: 1610, y: 710 }],
      props: [['stonelantern', 560, 972, 190], ['stonelantern', 1660, 972, 190], ['chimes', 760, 600, 150], ['chimes', 1160, 600, 150]],
      fg: [['lantern', 300, 760, 260], ['lantern', 2100, 760, 260]],
      exits: [
        { side: 'left', range: [0, 1080], to: 'kh1', at: [3130, 900] },
        { side: 'right', range: [0, 1080], to: 'kh3', at: [70, 900] },
      ],
      // v10 (note 15): no instruction here; the shrine's own prompt and the attune prompt are enough
    },
    kh3: {
      villagers: [{ who: 'mapmaker', x: 820, y: 900 }],
      name: 'Chime Crossroads', w: 3840, h: 1080, map: [13, 3, 2, 1], bg: { ox: 0.6, oy: 0.5, zoom: 1.1 },
      solids: [[0, 900, 1500, 180], [1740, 900, 2100, 180]],
      // v12 (note 35): the climb to the east walkway: two of its roof ledges are loose tiles (crumble, then re-form)
      oneways: [[2480, 680, 300], [2960, 740, 240, 'rock', { crumble: true }], [3180, 580, 220, 'rock', { crumble: true }], [3440, 430, 400]],
      gates: [{ id: 'crack-kh3', t: 'crack', r: [1500, 900, 240, 60] }],
      // why it's here: the root cellar's stair under the crossroads; a grate is bolted from below until you open it from the cellar
      doors: [{ id: 'cellar', kind: 'stair', dir: 'down', x: 1900, y: 900, to: 'kh8', lock: 'door-cellar', lockText: 'A grate, bolted from below.', label: 'Cellar stair' }],
      enemies: [{ t: 'brawler', x: 2150, y: 900, o: { scripted: true } }, { t: 'slinger', x: 2640, y: 680 }, { t: 'parasol', x: 3300, y: 900 }],   // v10: the first soldier rushes Joon (the heal lesson); a Parasol Guard holds the east end
      pickups: [{ id: 'mark-kh3', t: 'mark', x: 3640, y: 170 }, { t: 'wisp', x: 700, y: 850 }, { t: 'wisp', x: 3070, y: 690 }, { t: 'wisp', x: 3290, y: 530 }, { t: 'wisp', x: 3700, y: 380 }],
      props: [['lantern', 900, 904, 220], ['sign', 1300, 904, 150], ['flags', 2000, 902, 320], ['baskets', 2900, 904, 140], ['kites', 3650, 904, 220]],
      fg: [['flags', 1500, 1220, 520], ['flags', 3420, 1220, 420, true]],   // v9: no bonsai (its cut-out carried a black triangle)
      exits: [
        { side: 'left', range: [0, 1080], to: 'kh2', at: [1850, 970] },
        { side: 'right', range: [0, 560], to: 'kh4', at: [190, 3060] },
        { side: 'right', range: [560, 1080], to: 'kh5', at: [70, 900] },
        { side: 'bottom', range: [1500, 1740], to: 'kh8', keepX: true, at: [1520, 20] },
      ],
      hints: [
        
        
        // v9 (Connor's note 8): a signpost at the fork
        { r: [2980, 600, 380, 320], post: [3150, 900], sign: true, boards: [['wind', 0], ['earth', 1]] },   // v11: pictures, not sentences: up to the gorge (wind), ahead to the quarry (stone),
      ],
    },
    kh4: {
      // v14 (Connor's note 55): the slow column of rising air up the middle is gone; the ledges were always the route up
      name: 'Kite Tower', w: 1920, h: 3240, map: [15, 0, 1, 3], bg: { kind: 'shaft', interior: true, dim: 0.3, art: 'room.kitetower', tile: 'tile.kitetower', artDim: 0.1 },
      solids: [
        [0, 3060, 1920, 180],
        [0, 0, 100, 200, 'wall'], [0, 520, 100, 2280, 'wall'],   // a dark gap in the west wall above the ledge: the Bell Loft
        [1820, 700, 100, 2360, 'wall'],
      ],
      // v14 (notes 44, 46): the high west ledge was a rock island with dangling roots; it is the mossy stone ledge out of the wall
      oneways: [
        [100, 520, 220, 'rock', { hold: 'wallL' }],
        [320, 2890, 260], [720, 2720, 260], [1150, 2550, 260], [1500, 2380, 260], [1080, 2200, 320, 'walkway'],
        [640, 2030, 260], [240, 1860, 300], [800, 1690, 240], [1250, 1520, 260], [1540, 1350, 240],
        [1150, 1180, 260], [700, 1010, 260], [300, 840, 280], [880, 700, 240], [1360, 560, 460, 'walkway'],
      ],
      enemies: [{ t: 'slinger', x: 1240, y: 2200 }, { t: 'slinger', x: 1660, y: 1350 }],
      pickups: [{ id: 'mark-kh4', t: 'mark', x: 960, y: 250 }, 
        { id: 'heart-kh4', t: 'heart', x: 210, y: 460 },
        { t: 'wisp', x: 850, y: 2670 }, { t: 'wisp', x: 370, y: 1810 }, { t: 'wisp', x: 920, y: 1640 }, { t: 'wisp', x: 830, y: 960 },
      ],
      props: [['kites', 1500, 3062, 240], ['flags', 1700, 3062, 320], ],
      fg: [['flags', 300, 3600, 600]],
      exits: [
        { side: 'left', range: [2700, 3240], to: 'kh3', at: [3720, 430] },
        { side: 'left', range: [200, 520], to: 'kh9', at: [1830, 470] },
        { side: 'right', range: [0, 700], to: 'kh6', at: [70, 900] },
      ],
      hints: [
        { r: [600, 1600, 500, 300], text: 'Too far to jump. Jump, then {dash} in the air.' },
        { r: [420, 2800, 400, 300], post: [600, 3060], sign: true, boards: [['wind', -1]] },   // v14 (note 56): the fire board pointing up read as 'fire power this way'; it only marked thornwood   // v11: up to the gorge and its thornwood (flame), west to the Bell Loft's chimes (wind),
      ],
    },
    kh5: {
      name: 'Flooded Stairwell', w: 1920, h: 2160, map: [15, 3, 1, 2], bg: { kind: 'shaft', interior: true, dim: 0.3, art: 'room.stairwell', artDim: 0, lift: 0.15, tile: 'tile.stairwell', tileSize: 700 },   // v9: the tiled wet stone wall
      solids: [
        [0, 900, 520, 200], [760, 900, 360, 200], [1120, 1040, 560, 60], [1680, 900, 240, 200], [1880, 0, 40, 900, 'none'],
        [0, 1500, 900, 660], [900, 1760, 900, 400], [1800, 1500, 120, 660],
      ],
      // v14 (Connor's note 56, soft-locked after the Rime Warden): the only way down is this stack of thin planks, and
      // nothing said so but a hint you could miss. Now holding down alone drops through (player.js), the hint stays up
      // whenever Joon is on the planks, and a plain arrow board points down at them from the top.
      oneways: [[520, 1050, 240], [520, 1200, 240], [520, 1350, 240]],
      hazards: [{ t: 'spikes', r: [1120, 990, 560, 50] }, { t: 'water', r: [900, 1540, 900, 220] }],
      // v11 (review 11 #2): the flooded stair is a gate for the guide: no crossing to the quarry road without Ice Wall
      wgaps: [{ id: 'water-kh5', t: 'water', r: [900, 1540, 900, 220] }],
      pickups: [
        { id: 'heart-kh5', t: 'heart', x: 1790, y: 850 },
        { t: 'wisp', x: 250, y: 1440 }, { t: 'wisp', x: 420, y: 1440 }, { t: 'wisp', x: 780, y: 1440 },
      ],
      props: [['stonelantern', 200, 904, 190], ['lantern', 840, 904, 200], ['sign', 640, 1502, 140]],
      exits: [
        { side: 'left', range: [0, 1100], to: 'kh3', at: [3770, 900] },
        { side: 'right', range: [1100, 1500], to: 'nq1', at: [70, 900] },
      ],
      hints: [
        { r: [500, 620, 280, 480], text: 'Thin planks: hold {down} to drop through. The way on is down, across the water.' },
        { r: [180, 600, 300, 320], post: [300, 900], sign: true, boards: [['water', 2]] },   // v14 (note 56): down to the water crossing
      ],
    },
    kh6: {
      updrafts: [[2350, 200, 240, 760]],   // kept (v14, note 55), now a fast snap: the glide over the gorge rises on it, and it lifts to the high alcove's bead
      name: 'Gorge Lookout', w: 3840, h: 1080, map: [16, 0, 2, 1], bg: { ox: 0.45, oy: 0.35, zoom: 1.15, mid: false },
      solids: [[0, 900, 1700, 180], [3200, 900, 640, 180]],
      gates: [{ id: 'branch-kh6', t: 'branch', r: [1040, 340, 150, 560] }],
      stone: { x: 480, y: 900 },
      npc: { x: 760, y: 900, need: 'boss-overseer', auto: true, talks: [[null, 'gate']] },
      pickups: [{ id: 'bead-kh6', t: 'bead', x: 2470, y: 150 }, { t: 'wisp', x: 700, y: 850 }, { t: 'wisp', x: 1500, y: 850 }, { t: 'wisp', x: 3350, y: 850 }],
      props: [['flags', 250, 902, 330], ['stonelantern', 1500, 904, 200], ['sign', 1620, 904, 150], ['kites', 3500, 904, 220], ['flags', 3750, 902, 330, true]],
      fg: [['flags', 300, 1220, 420]],   // v9 (review 9 #8): out of the lane and away from the banner
      exits: [
        { side: 'left', range: [0, 1080], to: 'kh4', at: [1700, 560] },
        { side: 'right', range: [0, 1080], to: 'bg1', at: [70, 900] },
      ],
      hints: [
        
      ],
    },
    kh7: {
      name: 'The West Gate', w: 3840, h: 1080, map: [8, 3, 2, 1], bg: { ox: 0.0, oy: 0.6, zoom: 1.12 },
      solids: [
        [0, 1000, 700, 80], [700, 900, 3140, 180],
        [1700, 760, 400, 140],
      ],
      oneways: [[2500, 680, 260], [900, 700, 260]],
      enemies: [{ t: 'brawler', x: 3000, y: 900 }, { t: 'shield', x: 1900, y: 760 }, { t: 'slinger', x: 2620, y: 680 }],
      boss: {
        t: 'ambush', y: 900, trigger: [600, 1500], barriers: [[440, 0, 40, 1000], [1640, 0, 40, 900]],
        waves: [
          [{ t: 'brawler', x: 760 }, { t: 'brawler', x: 1450 }],
          [{ t: 'parasol', x: 900 }, { t: 'brawler', x: 1350 }],   // v11 (review 11 #6): the first fight after the first power: the Parasol Guard and one soldier; the slinger waits outside the arena
          // v12 (Connor's note 34): a third wave that asks for reading, not mashing: a soldier who
          // presses (and lunges from range) while a slinger on the ledge throws; pick the slinger off first
          [{ t: 'brawler', x: 1450 }, { t: 'slinger', x: 1030, y: 700 }],
        ],
        done: 'The West Gate is clear. The terraces lie below.',
      },
      pickups: [{ t: 'wisp', x: 2200, y: 850 }, { t: 'wisp', x: 2630, y: 630 }, { t: 'wisp', x: 1030, y: 650 }],
      props: [
        ['kiln:banner', 600, 1002, 300], ['brass:crates', 1180, 904, 160], ['kiln:spears', 1800, 762, 200], ['brass:brazier', 2300, 904, 180],
        ['kiln:banner', 2760, 902, 300], ['brass:drum', 3300, 904, 160], ['flags', 3700, 902, 330],
      ],
      fg: [['kiln:fence', 2100, 1180, 260], ['brass:spears', 3500, 1200, 360]],
      exits: [
        { side: 'right', range: [0, 1080], to: 'kh1', at: [70, 900] },
        { side: 'left', range: [0, 1080], to: 'ds1', at: [3770, 560] },
      ],
      
    },
    kh8: {
      name: 'Root Cellar', w: 1920, h: 1080, map: [13, 4, 1, 1], bg: { kind: 'in', dim: 0.55, oy: 0.7, art: 'room.cellar', artDim: 0.18 },
      solids: [
        [0, 0, 1500, 60, 'ceil'], [1740, 0, 180, 60, 'ceil'], [0, 970, 1920, 110, 'none'], [1880, 60, 40, 910, 'none'],
        [0, 360, 440, 60, 'ceil'], [0, 600, 440, 60, 'walkway'],   // a root-choked alcove, high on the west wall
      ],
      gates: [{ id: 'branch-kh8', t: 'branch', r: [320, 420, 120, 180] }],
      doors: [{ id: 'cellar', kind: 'stair', dir: 'up', x: 1760, y: 970, to: 'kh3', label: 'Stair up' }],   // why it's here: the way back up; climbing it unbolts the grate
      enemies: [{ t: 'brawler', x: 1000, y: 970 }, { t: 'parasol', x: 700, y: 970 }],
      pickups: [{ id: 'bead-kh8', t: 'bead', x: 150, y: 540 }, { t: 'wisp', x: 1200, y: 920 }, { t: 'wisp', x: 1280, y: 920 }],
      props: [['baskets', 1150, 972, 150], ['baskets', 1400, 972, 120], ['stonelantern', 600, 972, 170]],
      exits: [{ side: 'left', range: [0, 1080], to: 'km1', at: [3770, 900] }],
      
    },
    kh9: {
      name: 'Bell Loft', w: 1920, h: 1080, map: [14, 0, 1, 1], bg: { kind: 'in', oy: 0.35, dim: 0.25, art: 'room.bellloft', artDim: 0.08 },
      solids: [[0, 970, 1920, 110, 'none'], [0, 0, 1920, 60, 'ceil'], [0, 60, 40, 910, 'none'], [1880, 560, 40, 410, 'none']],
      oneways: [[600, 800, 200, 'walkway'], [820, 640, 260, 'walkway'], [1290, 480, 260, 'walkway'], [1620, 470, 260, 'walkway']],
      // why it's here: a bell loft. Three wind-chime rigs share one rope to the shutter: each keeps ringing for 5 s after
      // a gust, all three at once wake the great bell and lift the shutter. Gust also rings the bell itself.
      // v11 (review 11): the middle rig moved off the bell's face, onto the low shelf left of it
      wheels: [{ x: 470, y: 970, gate: 'shutter-kh9', hold: 5, kind: 'chime' }, { x: 660, y: 800, gate: 'shutter-kh9', hold: 5, kind: 'chime' }, { x: 1420, y: 480, gate: 'shutter-kh9', hold: 5, kind: 'chime', bell: true }],
      gates: [{ id: 'shutter-kh9', t: 'shutter', r: [1560, 560, 130, 410] }],
      pickups: [{ id: 'heart-kh9', t: 'heart', x: 1790, y: 880 }, { t: 'wisp', x: 470, y: 720 }, { t: 'wisp', x: 950, y: 580 }],
      props: [['flags', 300, 330, 160], ['flags', 1250, 300, 160], ['lantern', 1100, 972, 200], ['bellshrine', 1790, 972, 260]],
      exits: [{ side: 'right', range: [60, 560], to: 'kh4', at: [180, 520] }],
      hints: [
      ],
    },
  },
};
