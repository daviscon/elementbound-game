// Region 5: The Brass Gate (finale). Across the gorge from Kite Hill: the causeway, the brass
// stair, the barracks, the battlements, and the gate itself: two waves, then the Captain.
export default {
  region: 'brass',
  rooms: {
    bg1: {
      cutscene: 'brass',
      name: 'The Causeway', w: 3840, h: 1080, map: [18, 0, 2, 1], bg: { ox: 0.1, oy: 0.5, zoom: 1.1 },
      solids: [[0, 900, 1200, 180], [1200, 1000, 300, 80], [1500, 900, 2340, 180], [1900, 740, 360, 160], [540, 780, 80, 120], [3240, 780, 80, 120]],   // crenel blocks: cover from the archers
      oneways: [[2400, 640, 260]],
      hazards: [{ t: 'fire', r: [1200, 940, 300, 60] }],
      stone: { x: 3520, y: 900 },
      enemies: [],   // v14 (note 49): a rest-stone room is safe; its hook duelist and hound went to the Brass Stair
      pickups: [{ id: 'heart-bg1', t: 'heart', x: 2530, y: 330 }, { t: 'wisp', x: 400, y: 850 }, { t: 'wisp', x: 1700, y: 850 }, { t: 'wisp', x: 3300, y: 850 }],
      props: [['brazier', 300, 902, 180], ['banner', 1000, 902, 320], ['crates', 1700, 902, 160], ['drum', 2300, 902, 150], ['banner', 2900, 902, 320], ['spears', 3700, 902, 220]],
      fg: [['chains', 1300, 1200, 240], ['cannon', 3100, 1220, 300]],
      exits: [
        { side: 'left', range: [0, 1080], to: 'kh6', at: [3770, 900] },
        { side: 'right', range: [0, 1080], to: 'bg2', at: [70, 2060] },
      ],
    },
    bg2: {
      name: 'The Brass Stair', w: 1920, h: 2160, map: [20, -1, 1, 2], bg: { ox: 0.6, oy: 0.5, zoom: 1.25, art: 'shaft.brass', artDim: 0.2 },
      solids: [
        [0, 2060, 1920, 100], [600, 1040, 1320, 80],
        [1160, 0, 220, 760, 'wall'], [1500, 560, 420, 80],
      ],
      oneways: [[500, 1890, 280], [950, 1720, 280], [1400, 1550, 300], [950, 1380, 280], [500, 1210, 280], [1450, 870, 280]],
      gates: [{ id: 'branch-bg2', t: 'branch', r: [1200, 760, 140, 280] }],
      hazards: [{ t: 'spikes', r: [700, 2020, 600, 40] }],
      enemies: [{ t: 'archer', x: 1550, y: 1550 }, { t: 'shield', x: 900, y: 1040 }, { t: 'archer', x: 1700, y: 560 }, { t: 'hook', x: 400, y: 2060 }, { t: 'hound', x: 1300, y: 2060 }],   // v14: +foes from the Causeway
      pickups: [{ t: 'wisp', x: 1090, y: 1670 }, { t: 'wisp', x: 640, y: 1160 }, { t: 'wisp', x: 1590, y: 820 }],
      props: [['brazier', 200, 2062, 180], ['crates', 1600, 2062, 150], ['banner', 800, 1042, 300], ['gong', 1700, 1042, 220], ['tower', 1750, 562, 300]],
      exits: [
        { side: 'left', range: [1600, 2160], to: 'bg1', at: [3770, 900] },
        { side: 'right', range: [0, 700], to: 'bg3', at: [70, 970] },
      ],
      // v10 (note 15): taught by the situation, not a button prompt
    },
    bg3: {
      rimA: 1,   // v9 (review 9 #10): red soldiers on red banners
      name: 'The Barracks', w: 1920, h: 1080, map: [21, -1, 1, 1], bg: { kind: 'in', oy: 0.6 },
      solids: [[0, 970, 1920, 110, 'none']],
      oneways: [[300, 740, 260, 'chained'], [1360, 740, 260, 'chained']],
      boss: {
        t: 'ambush', talk: 'betray', after: 'barracksDone', y: 970, trigger: [400, 1500], barriers: [[0, 0, 40, 970], [1880, 0, 40, 970]],
        waves: [
          [{ t: 'hound', x: 600 }, { t: 'hook', x: 1400 }, { t: 'archer', x: 430, y: 740 }],   // v10: the army's new kinds mixed in
          [{ t: 'shield', x: 300 }, { t: 'shield', x: 1600 }, { t: 'archer', x: 1490, y: 740 }, { t: 'hound', x: 960 }],
        ],
        done: 'The barracks fall quiet.',
      },
      pickups: [{ t: 'bloom', x: 960, y: 900 }],
      props: [['crates', 200, 972, 160], ['spears', 700, 972, 210], ['drum', 1250, 972, 150], ['cage', 1750, 972, 230]],
      exits: [
        { side: 'left', range: [0, 1080], to: 'bg2', at: [1850, 560] },
        { side: 'right', range: [0, 1080], to: 'bg4', at: [70, 900] },
      ],
    },
    bg4: {
      name: 'The Battlements', w: 3840, h: 1080, map: [22, -1, 2, 1], bg: { ox: 0.4, oy: 0.45, zoom: 1.15 },
      solids: [
        [0, 900, 900, 180], [900, 1060, 500, 20, 'none'], [1400, 900, 800, 180], [1650, 620, 360, 280, null, 0.25],   // v8: lifted 25% so its stone reads against the night
        [2200, 1060, 400, 20, 'none'], [2600, 900, 1240, 180],
      ],
      oneways: [[1020, 740, 260, 'chained'], [2290, 720, 220, 'chained']],
      gates: [{ id: 'branch-bg4', t: 'branch', r: [1480, 760, 110, 140] }],
      // why it's here: a vaulted arch down to the powder store under the walls; thornwood has grown over it
      doors: [{ id: 'powder', kind: 'arch', dir: 'up', x: 1535, y: 900, to: 'bg6', lock: 'branch-bg4', lockText: 'Thornwood has grown over the arch.', label: 'Powder store' }],
      hazards: [{ t: 'spikes', r: [900, 1000, 500, 60] }, { t: 'spikes', r: [2200, 1000, 400, 60] }],
      stone: { x: 3500, y: 900 },
      enemies: [],   // v14 (note 49): a rest-stone room is safe (the Captain's door is next door: rest, then fight)
      pickups: [{ id: 'mark-bg4', t: 'mark', x: 1830, y: 310 }, { t: 'wisp', x: 1150, y: 690 }, { t: 'wisp', x: 2400, y: 670 }, { t: 'wisp', x: 3300, y: 850 }, { t: 'bloom', x: 3650, y: 860 }],
      props: [['tower', 300, 902, 320], ['banner', 1500, 902, 300], ['cannon', 2900, 902, 170], ['gong', 3750, 902, 220], ['brazier', 3350, 902, 170]],
      fg: [['spears', 700, 1200, 400], ['chains', 2600, 1200, 260]],
      exits: [
        { side: 'left', range: [0, 1080], to: 'bg3', at: [1850, 970] },
        { side: 'right', range: [0, 1080], to: 'bg5', at: [70, 900] },
      ],
      
    },
    bg5: {
      rimA: 1,   // v9 (review 9 #10): red soldiers on red banners
      name: 'The Brass Gate', w: 1920, h: 1080, map: [24, -1, 1, 1], bg: { ox: 0.62, oy: 0.5, zoom: 1.02 },
      // v4: two raised steps on the gate-top terrace; the Captain's fire runs along the lower floor only
      solids: [[0, 900, 1920, 180], [420, 800, 220, 100], [1520, 800, 220, 100]],   // v5: the left step moved off the entrance
      oneways: [[320, 690, 240, 'chained'], [1360, 690, 240, 'chained']],
      boss: {
        t: 'captain', x: 1480, y: 900, trigger: [260, 1920], barriers: [[0, 0, 30, 900], [1890, 0, 30, 900]],
        waves: [
          [{ t: 'shield', x: 1300 }, { t: 'parasol', x: 1150 }, { t: 'ember', x: 600 }, { t: 'archer', x: 1440, y: 690 }],
          [{ t: 'hound', x: 500 }, { t: 'hound', x: 1400 }, { t: 'archer', x: 1440, y: 690 }, { t: 'archer', x: 440, y: 690 }],
        ],
      },
      props: [['gate', 960, 904, 460], ['brazier', 620, 902, 180], ['brazier', 1300, 902, 180], ['banner', 530, 802, 300], ['banner', 1630, 802, 300]],
      exits: [{ side: 'left', range: [0, 1080], to: 'bg4', at: [3770, 900] }],
    },
    bg6: {
      // v8: sacks, chests and soldiers shared one brightness, so the room asks for a full-strength rim.
      // v9 (review 9 #5): that comment used to sit on this line and hid the room's map cell and painting.
      name: 'The Powder Store', w: 1920, h: 1080, rimA: 1, map: [22, -2, 1, 1], bg: { kind: 'in', oy: 0.5, dim: 0.2, art: 'room.powder', artDim: 0.1 },
      solids: [[0, 970, 1920, 110, 'none'], [0, 0, 1920, 60, 'ceil'], [0, 60, 40, 910, 'none'], [1880, 60, 40, 910, 'none'], [1640, 420, 240, 60, 'chained']],
      oneways: [[380, 760, 260, 'chained'], [1280, 760, 260, 'chained'], [1440, 560, 200, 'chained']],
      doors: [{ id: 'powder', kind: 'arch', dir: 'up', x: 200, y: 970, to: 'bg4', label: 'Battlements' }],   // why it's here: the vault's arch back out
      boss: {
        t: 'ambush', y: 970, trigger: [400, 1700], barriers: [[40, 0, 40, 970], [1840, 0, 40, 970]],
        waves: [
          [{ t: 'hound', x: 700 }, { t: 'hound', x: 1500 }, { t: 'archer', x: 1410, y: 760 }],
          [{ t: 'shield', x: 500 }, { t: 'potter', x: 1500 }, { t: 'moth', x: 700, y: 500 }, { t: 'hook', x: 1000 }],
        ],
        done: 'The powder store is quiet. Something glints on the high rack.',
      },
      pickups: [{ id: 'bead-bg6', t: 'bead', x: 1720, y: 340 }, { id: 'heart-bg6', t: 'heart', x: 1820, y: 340 }],
      props: [['crates', 900, 972, 180], ['crates', 1150, 972, 140], ['cannon', 600, 972, 160], ['drum', 1700, 972, 150], ['banner', 960, 600, 300]],
      exits: [],
    },
  },
};
