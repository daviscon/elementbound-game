// Region 3: Ninefold Quarry. Earth shrine (Earth Slam + Stone Wall), then the Quarry Colossus
// (a Stone Heart: +1 health). The quarry mouth needs the double jump; the shrine sits at the
// bottom of the lift shaft; its cracked floor drops into the Undercut and on to the pit.
export default {
  region: 'quarry',
  rooms: {
    nq1: {
      villagers: [{ who: 'carrier', x: 400, y: 900, face: 1 }],
      name: 'Quarry Mouth', w: 1920, h: 1080, map: [16, 4, 1, 1], bg: { ox: 0.05, oy: 0.5, zoom: 1.1 },
      solids: [[0, 900, 520, 180], [1290, 900, 630, 180], [1600, 600, 320, 300]],
      // why it's here: the foremen's own timbered mine passage down to the hut, chained shut until opened from the hut
      doors: [{ id: 'lift', kind: 'mine', dir: 'down', x: 280, y: 900, to: 'nq7', lock: 'door-lift', lockText: 'Chained from the far end.', label: 'Mine passage' }],
      enemies: [{ t: 'mite', x: 1350, y: 900 }, { t: 'mite', x: 1450, y: 900 }, { t: 'mite', x: 1550, y: 900 }, { t: 'hook', x: 1760, y: 600 }],   // v14: +hook from the Rope Bridges
      pickups: [{ t: 'wisp', x: 160, y: 850 }, { t: 'wisp', x: 1380, y: 850 }],
      props: [['sign', 450, 902, 150], ['picks', 1400, 902, 150], ['lamppost', 1750, 602, 230], ['rubble', 120, 902, 110]],
      fg: [],   // v5: the crane silhouette no longer stands in front of the lane
      pit: true,
      exits: [
        { side: 'left', range: [0, 1080], to: 'kh5', at: [1850, 1500] },
        { side: 'right', range: [0, 1080], to: 'nq2', at: [70, 900] },
      ],
      hints: [
      ],
    },
    nq2: {
      name: 'Rope Bridges', w: 3840, h: 1080, map: [17, 4, 2, 1], bg: { ox: 0.4, oy: 0.45, zoom: 1.12 },
      solids: [[0, 900, 600, 180], [1100, 900, 400, 180], [2060, 900, 500, 180], [2560, 600, 400, 480], [3400, 600, 440, 480]],
      pit: true,
      oneways: [[600, 900, 500, 'rope'], [2960, 600, 440, 'rope'], [1580, 700, 260, 'scaffold']],
      stone: { x: 3560, y: 600 },
      enemies: [],   // v14 (note 49): a rest-stone room is safe; its foes moved to the Quarry Mouth and the Lift Shaft
      pickups: [{ id: 'mark-nq2', t: 'mark', x: 2800, y: 300 }, { t: 'wisp', x: 850, y: 850 }, { t: 'wisp', x: 1710, y: 650 }, { t: 'wisp', x: 2150, y: 850 }, { t: 'wisp', x: 3180, y: 550 }],
      props: [['blocks', 300, 902, 130], ['barrel', 1300, 902, 150], ['barrow', 2200, 902, 130], ['crystals', 2700, 602, 140], ['lamppost', 3750, 602, 230]],
      fg: [['picks', 1000, 1200, 340], ['rubble', 3000, 1220, 260]],
      exits: [
        { side: 'left', range: [0, 1080], to: 'nq1', at: [1850, 600] },
        { side: 'right', range: [0, 1080], to: 'nq3', at: [70, 560] },
      ],
    },
    nq3: {
      name: 'Lift Shaft', w: 1920, h: 2700, map: [19, 4, 1, 3], bg: { kind: 'shaft', dim: 0.3, tile: 'tile.quarry' },
      solids: [[0, 560, 420, 120], [0, 2520, 1920, 180], [1820, 0, 100, 2200, 'wall']],
      oneways: [
        // v12 (note 35): three of the hanging loads are cracked stone that crumbles under you (it is re-hung a moment later)
        [500, 740, 260], [950, 920, 260, 'chained', { crumble: true }], [1400, 1100, 260], [950, 1280, 260], [500, 1460, 260, 'chained', { crumble: true }],
        [120, 1640, 280], [500, 1820, 260], [950, 2000, 260, 'chained', { crumble: true }], [1400, 2180, 260], [1000, 2360, 260],
      ],
      enemies: [{ t: 'slinger', x: 1530, y: 1100 }, { t: 'mite', x: 200, y: 1640 }, { t: 'mite', x: 300, y: 1640 }, { t: 'hook', x: 900, y: 2520 }, { t: 'mite', x: 1300, y: 2520 }, { t: 'mite', x: 1400, y: 2520 }, { t: 'archer', x: 1530, y: 2180 }, { t: 'shield', x: 500, y: 2520 }, { t: 'slinger', x: 1130, y: 2360 }],   // v14: +foes from the Rope Bridges and the Undercut (rest-stone rooms now)
      pickups: [{ t: 'wisp', x: 630, y: 690 }, { t: 'wisp', x: 1080, y: 1230 }, { t: 'wisp', x: 630, y: 1770 }, { t: 'wisp', x: 1530, y: 2130 }],
      props: [['crane', 200, 562, 300], ['blocks', 1500, 2522, 140], ['barrel', 400, 2522, 150], ['lamppost', 1700, 2522, 230]],
      fg: [['crane', 1700, 3100, 700]],
      exits: [
        { side: 'left', range: [0, 700], to: 'nq2', at: [3770, 600] },
        { side: 'right', range: [2200, 2700], to: 'nq4', at: [70, 970] },
      ],
      
    },
    nq4: {
      name: 'Shrine of Nine Steps', w: 1920, h: 1080, map: [20, 6, 1, 1], bg: { kind: 'in', oy: 0.6 },
      solids: [[0, 970, 1300, 110, 'none'], [1540, 970, 380, 110, 'none'], [1860, 0, 60, 970, 'none']],
      gates: [{ id: 'crack-nq4', t: 'crack', r: [1300, 970, 240, 60] }],
      shrine: { x: 700, y: 970, el: 'earth' },
      stone: { x: 330, y: 970 },
      npc: { x: 980, y: 970, talks: [[null, 'earth']] },
      pickups: [{ t: 'wisp', x: 1650, y: 920 }, { t: 'wisp', x: 1730, y: 920 }],
      props: [['crystals', 1700, 972, 140], ['barrel', 1180, 972, 140], ['lamppost', 120, 972, 230]],
      exits: [
        { side: 'left', range: [0, 1080], to: 'nq3', at: [1850, 2520] },
        { side: 'bottom', range: [1300, 1540], to: 'nq5', keepX: true, at: [1420, 20] },
      ],
      hints: [
      ],
    },
    nq5: {
      name: 'The Undercut', w: 1920, h: 1080, map: [20, 7, 1, 1], bg: { ox: 0.95, oy: 1, zoom: 1.5, dim: 0.45 },
      stone: { x: 1480, y: 900 },   // v11 (review 11 #8): a rest before the Colossus Pit
      solids: [[0, 0, 1300, 60, 'ceil'], [1540, 0, 380, 60, 'ceil'], [0, 900, 1920, 180], [0, 60, 40, 840, 'none']],
      enemies: [],   // v14 (note 49): a rest-stone room is safe; its shield bearer and slinger went to the Lift Shaft
      pickups: [{ id: 'heart-nq5', t: 'heart', x: 160, y: 850 }, { t: 'wisp', x: 900, y: 850 }, { t: 'bloom', x: 1100, y: 860 }],
      props: [['rubble', 1420, 902, 120], ['crystals', 1000, 902, 150], ['picks', 260, 902, 140]],
      fg: [['crystals', 800, 1200, 300]],
      exits: [{ side: 'right', range: [0, 1080], to: 'nq6', at: [70, 900] }],
      
    },
    nq6: {
      name: 'The Colossus Pit', w: 1920, h: 1080, map: [21, 7, 1, 1], bg: { ox: 0.85, oy: 0.4, zoom: 1.3 },
      // no planks: two stone ledges on the side walls give an Earth Slam its height
      solids: [[0, 900, 1920, 180], [40, 640, 170, 60, 'rock'], [1710, 640, 170, 60, 'rock']],
      boss: { t: 'colossus', x: 1420, y: 900, trigger: [260, 1920], barriers: [[0, 0, 40, 900], [1880, 0, 40, 900]] },
      props: [['rubble', 150, 902, 110], ['blocks', 1780, 902, 130]],   // v6: the carved face statue is gone; the tan Colossus merged with it
      fg: [['rubble', 600, 1200, 260]],
      exits: [
        { side: 'left', range: [0, 1080], to: 'nq5', at: [1850, 900] },
        { side: 'right', range: [0, 1080], to: 'nq7', at: [70, 970] },
      ],
      
    },
    nq7: {
      name: "Foreman's Hut", w: 1920, h: 1080, map: [22, 7, 1, 1], bg: { kind: 'in', oy: 0.6, art: 'room.foreman' },
      solids: [[0, 970, 1920, 110, 'none'], [1460, 0, 220, 700, 'planks']],   // v9 (review 9 #5): a plank partition, not a quarry pillar
      gates: [{ id: 'branch-nq7', t: 'branch', r: [1500, 700, 140, 270] }],
      doors: [{ id: 'lift', kind: 'mine', dir: 'up', x: 900, y: 970, to: 'nq1', label: 'Mine passage' }],   // why it's here: the short way back up to the quarry mouth
      stone: { x: 500, y: 970 },
      pickups: [{ id: 'bead-nq7', t: 'bead', x: 1780, y: 900 }, { t: 'wisp', x: 1200, y: 920 }],
      props: [['barrel', 260, 972, 150], ['sign', 1150, 972, 140], ['barrow', 1320, 972, 120]],
      exits: [{ side: 'left', range: [0, 1080], to: 'nq6', at: [1850, 900] }],
      
    },
  },
};
