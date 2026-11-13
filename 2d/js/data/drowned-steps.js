// Region 2: The Drowned Steps. Water shrine (Whip + Ice Wall), the Reed Warden (Double Jump).
// Down the flooded terraces from the West Gate, down the falls, into the sunken shrine; ice
// carries you over the river channels to the old sluice where the Reed Warden waits.
export default {
  region: 'drowned',
  rooms: {
    ds1: {
      villagers: [{ who: 'fisher', x: 3500, y: 560 }],
      name: 'Terrace Descent', w: 3840, h: 1080, map: [6, 3, 2, 1], bg: { ox: 0.2, oy: 0.4, zoom: 1.1 },
      solids: [
        [3200, 560, 640, 520], [2640, 760, 560, 320], [2000, 560, 640, 520],
        [1200, 730, 800, 350], [0, 900, 1200, 180],
      ],
      // v14 (Connor's notes 44, 45): the vine-hung high ledge was two mirrored rock arches standing on the floor (the
      // "pillars facing the wrong way") with a stray vine above; it is one mossy stone ledge on its own pillar now
      oneways: [[100, 570, 400]],
      hazards: [{ t: 'water', r: [2640, 600, 560, 160] }],
      // why it's here: the old sluice gate the Reed Warden guards (a boss door), wound shut until it is beaten
      doors: [{ id: 'tide', kind: 'boss', art: 'sluice', x: 920, y: 900, to: 'ds6', lock: 'door-tide', label: 'Sluice gate' }],
      enemies: [{ t: 'brawler', x: 2250, y: 560 }, { t: 'potter', x: 1420, y: 730 }, { t: 'snapper', x: 640, y: 900 }, { t: 'brawler', x: 2500, y: 560 }],   // v14: +1 brawler from the River Channels (a rest-stone room now)   // v10: a Pot Lobber on the terrace
      pickups: [
        { id: 'heart-ds1', t: 'heart', x: 300, y: 500 },
        { t: 'wisp', x: 3420, y: 510 }, { t: 'wisp', x: 2100, y: 510 }, { t: 'wisp', x: 1080, y: 850 },
      ],
      props: [
        ['reeds', 3700, 562, 220], ['stonelantern', 3350, 562, 190], ['hay', 2450, 562, 110],
        ['lilies', 1600, 732, 90], ['trap', 1300, 732, 120], ['reeds', 120, 902, 220], ['spiritstone', 700, 902, 200],
      ],
      fg: [['reeds', 2900, 1200, 420], ['willow', 600, 1220, 520]],
      exits: [
        { side: 'right', range: [0, 1080], to: 'kh7', at: [70, 1000] },
        { side: 'left', range: [0, 1080], to: 'ds2', at: [1800, 560] },
      ],
      hints: [
        { r: [980, 640, 260, 300], post: [1120, 900], sign: true, boards: [['water', -1]] },   // v11: west to Paddy Falls and the water shrine,
      ],
    },
    ds2: {
      name: 'Paddy Falls', w: 1920, h: 2700, map: [5, 3, 1, 3], bg: { kind: 'shaft', dim: 0.3, tile: 'tile.drowned' },
      solids: [[1480, 560, 440, 120], [0, 2520, 700, 180], [1300, 2520, 620, 180]],
      // v12 (Connor's notes 29 and 31): a stone shaft with the falls down its face. Every platform is held: stone ledges
      // out of the side walls and plank walkways whose posts stand on the walkway or the pool floor below. A zigzag of
      // short drops with no long fall, so going back up is a climb, not a wall.
      oneways: [
        [1060, 760, 300], [560, 940, 300], [0, 1120, 380], [560, 1300, 300, 'bridge', { crumble: true }], [1060, 1480, 300], [1520, 1660, 400],
        [1060, 1840, 300, 'bridge', { crumble: true }], [560, 2020, 300], [330, 2200, 260], [640, 2360, 280],   // v12 (note 35): two rotten walkways give way: keep moving
      ],
      hazards: [{ t: 'water', r: [700, 2540, 600, 160] }],
      enemies: [{ t: 'potter', x: 1740, y: 1660 }, { t: 'snapper', x: 1600, y: 2520 }, { t: 'snapper', x: 420, y: 2520 }, { t: 'potter', x: 1210, y: 1480 }],   // v14: +snapper, +potter from the River Channels
      pickups: [{ t: 'wisp', x: 300, y: 1050 }, { t: 'wisp', x: 1240, y: 1410 }, { t: 'wisp', x: 300, y: 2130 }, { t: 'wisp', x: 1500, y: 2470 }],
      props: [['spout', 1700, 562, 200], ['wheel', 1390, 2522, 300]   /* a water wheel turned by the falls' pool, at its edge */, ['reeds', 520, 2522, 200], ['stonelantern', 330, 2522, 170], ['lilies', 1000, 2560, 80]],
      // the way to the Sunken Shrine: light pours out of the bottom-left opening under a carved arch (read from the top)
      shrineLight: { x: 0, y: 2520, side: 'left' },
      hints: [{ r: [1480, 380, 440, 200], post: [1580, 560], sign: true, boards: [['water', 2]] }],   // top of the shaft: down to the water shrine
      fg: [['willow', 200, 3000, 640]],
      exits: [
        { side: 'right', range: [0, 700], to: 'ds1', at: [70, 900] },
        { side: 'left', range: [2300, 2700], to: 'ds3', at: [1850, 970] },
      ],
      
    },
    ds3: {
      name: 'Sunken Shrine', w: 1920, h: 1080, map: [4, 5, 1, 1], bg: { kind: 'in', oy: 0.55 },
      solids: [[0, 970, 1920, 110, 'none'], [0, 650, 360, 320]],
      shrine: { x: 860, y: 970, el: 'water' },
      stone: { x: 1350, y: 970 },
      npc: { x: 1120, y: 970, talks: [[null, 'water']] },
      pickups: [{ t: 'wisp', x: 520, y: 920 }, { t: 'wisp', x: 1600, y: 920 }],
      props: [['stonelantern', 560, 972, 180], ['lilies', 1700, 980, 80], ['reeds', 1840, 972, 200]],
      fg: [['reeds', 300, 1240, 400]],
      exits: [
        { side: 'right', range: [0, 1080], to: 'ds2', at: [70, 2520] },
        { side: 'left', range: [0, 650], to: 'ds4', at: [3770, 500] },
      ],
      hints: [
      ],
    },
    ds4: {
      name: 'River Channels', w: 3840, h: 1080, map: [2, 5, 2, 1], bg: { ox: 0.3, oy: 0.75, zoom: 1.2 },
      solids: [
        [3300, 500, 540, 580], [2500, 760, 800, 320], [2000, 500, 500, 580],
        [1150, 760, 850, 320], [0, 500, 1150, 580],
      ],
      hazards: [{ t: 'water', r: [2500, 540, 800, 220] }, { t: 'water', r: [1150, 540, 850, 220] }],
      stone: { x: 220, y: 500 },
      // v14 (note 49): a rest stone's room is safe: its potter, brawler and two snappers moved to Terrace Descent and Paddy Falls
      pickups: [{ id: 'mark-ds4', t: 'mark', x: 2320, y: 200 }, 
        { t: 'wisp', x: 3480, y: 450 }, { t: 'wisp', x: 3560, y: 450 }, { t: 'wisp', x: 3640, y: 450 },
        { t: 'wisp', x: 2080, y: 450 }, { t: 'wisp', x: 2160, y: 450 }, { t: 'wisp', x: 2420, y: 450 },
        { t: 'wisp', x: 1040, y: 450 }, { t: 'wisp', x: 960, y: 450 }, { t: 'wisp', x: 880, y: 450 },
      ],
      props: [['boat', 2800, 560, 120], ['reeds', 3700, 502, 220], ['stonelantern', 2250, 502, 180], ['trap', 1000, 502, 110]],
      fg: [['reeds', 1500, 820, 420], ['reeds', 3300, 820, 420]],
      exits: [
        { side: 'right', range: [0, 1080], to: 'ds3', at: [70, 650] },
        { side: 'left', range: [0, 1080], to: 'ds6', at: [1850, 900] },
      ],
      hints: [
      ],
    },
    ds6: {
      name: 'The Frozen Sluice', w: 1920, h: 1080, map: [1, 5, 1, 1], bg: { ox: 0.72, oy: 0.5, zoom: 1.35 },
      solids: [[0, 900, 1920, 180]],
      // v14 (Connor's note 51): no columns, chains or frozen falls under the ledges any more: four floating slabs of ice.
      // Each cracks the moment Joon lands, melts and falls away 1.2 s later (0.85 s once the Warden is angry) and re-forms
      // about 4 s after. All four sit low enough (top 600 to 690, the floor is 900) that the ice pillars (360 tall) and the
      // icicles reach them, so they are for jumping round and over the Warden, never for waiting him out.
      oneways: [
        [170, 690, 210, 'ice', { hold: 'float', melt: true }], [640, 600, 200, 'ice', { hold: 'float', melt: true }],
        [1080, 600, 200, 'ice', { hold: 'float', melt: true }], [1540, 690, 210, 'ice', { hold: 'float', melt: true }],
      ],
      frost: true,
      // v14 (Connor's note 54): the way west to the Reed Marsh was a bare wall behind the arena's barrier. Now it is a carved
      // stone arch sealed with ice while the Warden stands; when he falls the ice cracks, melts away and lets the light through.
      exitArch: { side: 'left', y: 900, seal: 'boss-reed' },
      doors: [{ id: 'tide', kind: 'boss', art: 'sluice', x: 1780, y: 900, to: 'ds1', lock: 'boss-reed', label: 'Sluice gate' }],   // why it's here: the arena's way out once the Warden falls
      boss: { t: 'reed', x: 520, y: 900, trigger: [0, 1500], barriers: [[0, 0, 40, 900], [1880, 0, 40, 900]] },
      props: [['spiritstone', 200, 902, 220], ['stonelantern', 1500, 902, 170]],
      fg: [['willow', 2200, 1240, 560]],
      exits: [
        { side: 'right', range: [0, 1080], to: 'ds4', at: [70, 500] },
        { side: 'left', range: [0, 1080], to: 'ds5', at: [2810, 900] },
      ],
      
    },
    ds5: {
      name: 'Reed Marsh', w: 2880, h: 1080, map: [0, 5, 1, 1], bg: { ox: 0.9, oy: 0.6, zoom: 1.2 },
      solids: [
        [0, 900, 700, 180], [2200, 900, 680, 180], [960, 880, 180, 40, 'stone'], [1400, 860, 180, 60, 'stone'], [1820, 880, 180, 40, 'stone'],
        [0, 0, 260, 600, 'wall'],
      ],
      oneways: [[1950, 640, 240, 'bridge'], [2420, 420, 260, 'bridge']],
      hazards: [{ t: 'water', r: [700, 920, 1500, 160] }],
      gates: [{ id: 'branch-ds5', t: 'branch', r: [270, 600, 130, 300] }],
      pickups: [
        { id: 'heart-ds5', t: 'heart', x: 2550, y: 350 },
        { id: 'bead-ds5', t: 'bead', x: 130, y: 840 },
        { t: 'wisp', x: 1050, y: 830 }, { t: 'wisp', x: 1490, y: 800 }, { t: 'wisp', x: 2070, y: 590 },
      ],
      enemies: [{ t: 'potter', x: 2500, y: 900 }, { t: 'snapper', x: 500, y: 900 }, { t: 'snapper', x: 2350, y: 900 }],
      props: [['reeds', 600, 902, 230], ['boat', 1200, 940, 120], ['hay', 450, 902, 100], ['lilies', 1650, 935, 70]],
      fg: [['reeds', 900, 1200, 440], ['reeds', 2600, 1200, 440]],
      exits: [{ side: 'right', range: [0, 1080], to: 'ds6', at: [70, 900] }],
      // v11 (Connor's note 25): the thornwood west of here waits for fire; this board points back east, to the quarry
      hints: [{ r: [2380, 600, 300, 320], post: [2520, 900], sign: true, boards: [['earth', 1]] }],
    },
  },
};
