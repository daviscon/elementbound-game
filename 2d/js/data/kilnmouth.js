// Region 4: Kilnmouth. Fire shrine (Fire Blast + Flame Ring), the Kiln Overseer (Glide).
// In through the Root Cellar tunnel, along the potters' row, up the chimney shaft to the
// Ember Shrine; then back down to burn through to the drying yards and the furnace.
export default {
  region: 'kiln',
  rooms: {
    km1: {
      name: 'Kiln Road', w: 3840, h: 1080, map: [11, 5, 2, 1], bg: { ox: 0.5, oy: 0.5, zoom: 1.1 },
      solids: [[3000, 900, 840, 180], [2700, 1000, 300, 80], [1900, 900, 800, 180], [1500, 740, 400, 340], [0, 900, 1500, 180]],
      oneways: [[560, 680, 260, 'rack'], [2180, 690, 240, 'rack'], [2900, 600, 220, 'rack']],
      // v12 (Connor's note 35): the road runs over the kiln's floor vents: two burst in turn (0.9 s of flame every 2.4 s,
      // half a cycle apart), so crossing is a matter of timing, not speed
      hazards: [{ t: 'fire', r: [2700, 940, 300, 60] }, { t: 'fire', r: [2150, 860, 150, 40], every: [2.4, 0.9, 0] }, { t: 'fire', r: [2450, 860, 150, 40], every: [2.4, 0.9, 1.2] }],
      // why it's here: the Overseer's furnace gate (a boss door, kept as a door on purpose), barred until he falls
      doors: [{ id: 'kilnyard', kind: 'boss', art: 'furnace', x: 3420, y: 900, to: 'km6', lock: 'door-kilnyard', label: 'Furnace gate' }],
      enemies: [{ t: 'hound', x: 2300, y: 900 }, { t: 'archer', x: 1700, y: 740 }, { t: 'brawler', x: 900, y: 900 }, { t: 'ember', x: 380, y: 900 }],   // v10: an Ember Slinger behind a brawler
      pickups: [{ t: 'wisp', x: 3150, y: 850 }, { t: 'wisp', x: 2050, y: 850 }, { t: 'wisp', x: 1200, y: 850 }],
      props: [['banner', 3700, 902, 300], ['pots', 3150, 902, 170], ['cart', 2300, 902, 160], ['brazier', 1600, 742, 170], ['logs', 1100, 902, 110], ['banner', 600, 902, 300], ['spears', 200, 902, 200]],
      fg: [['fence', 2900, 1200, 300], ['pots', 1000, 1220, 360]],
      exits: [
        { side: 'right', range: [0, 1080], to: 'kh8', at: [70, 970] },
        { side: 'left', range: [0, 1080], to: 'km3', at: [3770, 900] },
      ],
      
    },
    km3: {
      villagers: [{ who: 'potter', x: 3600, y: 900 }],
      name: "Potters' Row", w: 3840, h: 1080, map: [9, 5, 2, 1], bg: { ox: 0.2, oy: 0.5, zoom: 1.15 },
      solids: [[0, 900, 1800, 180], [2040, 900, 1800, 180], [700, 740, 380, 160, 'kilntop'], [2600, 740, 380, 160, 'kilntop']],
      oneways: [[1200, 600, 260, 'rack'], [2900, 560, 260, 'rack']],
      gates: [{ id: 'crack-km3', t: 'crack', r: [1800, 900, 240, 60] }],
      // why it's here: steps down into a potter's clay cellar under the row; grated from below until opened from inside
      doors: [{ id: 'pcellar', kind: 'stair', dir: 'down', x: 2400, y: 900, to: 'km7', lock: 'door-pcellar', lockText: 'A grate, bolted from below.', label: 'Cellar steps' }],
      enemies: [{ t: 'brawler', x: 3200, y: 900 }, { t: 'archer', x: 3020, y: 560 }, { t: 'hound', x: 1500, y: 900 }, { t: 'archer', x: 1330, y: 600 }, { t: 'ember', x: 400, y: 900 }],
      pickups: [{ id: 'heart-km3', t: 'heart', x: 3020, y: 260 }, { t: 'wisp', x: 890, y: 690 }, { t: 'wisp', x: 2790, y: 690 }, { t: 'wisp', x: 3030, y: 510 }],
      props: [['pots', 200, 902, 180], ['wheel', 560, 902, 120], ['vase', 1150, 902, 150], ['bellows', 1600, 902, 160], ['logs', 2250, 902, 110], ['brazier', 3400, 902, 170], ['pots', 3700, 902, 180]],
      fg: [['vase', 1400, 1220, 380], ['logs', 3000, 1220, 260]],
      exits: [
        { side: 'right', range: [0, 1080], to: 'km1', at: [70, 900] },
        { side: 'left', range: [0, 1080], to: 'km2', at: [1850, 2520] },
        { side: 'bottom', range: [1800, 2040], to: 'km7', at: [960, 20] },
      ],
      
    },
    km2: {
      name: 'Chimney Shaft', w: 1920, h: 2700, map: [8, 4, 1, 3], bg: { kind: 'shaft', dim: 0.3, tile: 'tile.kiln' },
      solids: [
        [0, 2520, 1920, 180], [1820, 0, 100, 2200, 'wall'],
        [0, 700, 100, 640, 'wall'], [0, 1600, 100, 920, 'wall'],
        [100, 1600, 300, 80, 'kilntop'], [100, 520, 400, 60, 'kilntop'],
      ],
      oneways: [
        [1350, 2350, 300, 'rack'], [900, 2180, 300, 'rack'], [450, 2010, 300, 'rack'], [900, 1840, 300, 'rack'], [450, 1770, 260, 'rack'],
        [1350, 1670, 300, 'rack'], [900, 1500, 300, 'rack'], [450, 1330, 300, 'rack'], [900, 1160, 300, 'rack'], [1350, 990, 300, 'rack'],
        [900, 820, 300, 'rack'], [400, 650, 300, 'rack'],
      ],
      gates: [{ id: 'branch-km2', t: 'branch', r: [100, 1340, 130, 260] }],
      hazards: [{ t: 'fire', r: [700, 2470, 420, 50] }],
      enemies: [{ t: 'moth', x: 700, y: 1900 }, { t: 'moth', x: 1200, y: 1300 }, { t: 'moth', x: 900, y: 700 }, { t: 'ember', x: 400, y: 2520 }, { t: 'hound', x: 1200, y: 2520 }, { t: 'brawler', x: 1600, y: 2520 }, { t: 'moth', x: 1300, y: 1500 }],   // v14: +foes from the Drying Yards
      pickups: [{ t: 'wisp', x: 1500, y: 2300 }, { t: 'wisp', x: 600, y: 1960 }, { t: 'wisp', x: 1050, y: 1110 }, { t: 'wisp', x: 550, y: 600 }],
      props: [['logs', 1500, 2522, 110], ['bellows', 300, 2522, 160]],
      fg: [['banner', 1500, 3100, 700]],
      exits: [
        { side: 'right', range: [2200, 2700], to: 'km3', at: [70, 900] },
        { side: 'left', range: [0, 700], to: 'km4', at: [1850, 970] },
        { side: 'left', range: [1340, 1600], to: 'km5', at: [3770, 900] },
      ],
      hints: [
        { r: [100, 1400, 420, 200], text: "Thornwood chokes the side flue. Fists won't clear it. Fire would.", without: 'fireblast' },
        { r: [130, 2260, 420, 300], post: [300, 2520], sign: true, boards: [['fire', 0], ['fire', -1]] },   // v11: up to the Ember Shrine, west past the thornwood,
      ],
    },
    km4: {
      name: 'Ember Shrine', w: 1920, h: 1080, map: [7, 4, 1, 1], bg: { kind: 'in', oy: 0.6 },
      solids: [[0, 970, 1920, 110, 'none'], [0, 0, 330, 690, 'wall']],
      gates: [{ id: 'branch-km4', t: 'branch', r: [200, 690, 130, 280] }],
      shrine: { x: 900, y: 970, el: 'fire' },
      stone: { x: 560, y: 970 },
      npc: { x: 1180, y: 970, talks: [[null, 'fire']] },
      pickups: [{ id: 'heart-km4', t: 'heart', x: 90, y: 900 }, { t: 'wisp', x: 1450, y: 920 }, { t: 'wisp', x: 1530, y: 920 }],
      props: [['pots', 1500, 972, 170], ['logs', 1700, 972, 100], ['brazier', 1300, 972, 150]],
      exits: [{ side: 'right', range: [0, 1080], to: 'km2', at: [200, 520] }],
      
    },
    km5: {
      name: 'The Drying Yards', w: 3840, h: 1080, map: [6, 6, 2, 1], bg: { ox: 0.7, oy: 0.5, zoom: 1.15 },
      stone: { x: 420, y: 900 },   // v11 (review 11 #8): a rest before the Overseer, a few steps from his door
      solids: [
        [0, 900, 700, 180], [1000, 900, 900, 180], [2200, 900, 1640, 180],
        [700, 1040, 300, 40, 'none'], [1900, 1040, 300, 40, 'none'], [2900, 700, 400, 200, 'kilntop'],
      ],
      oneways: [[760, 700, 200, 'rack'], [1950, 660, 220, 'rack'], [1300, 640, 260, 'rack']],
      // v12 (note 35): drying-yard vents in the middle floor fire in a rolling rhythm (left, middle, right)
      hazards: [{ t: 'fire', r: [700, 960, 300, 80] }, { t: 'fire', r: [1900, 960, 300, 80] },
        { t: 'fire', r: [1150, 860, 140, 40], every: [2.7, 0.9, 0] }, { t: 'fire', r: [1420, 860, 140, 40], every: [2.7, 0.9, 0.9] }, { t: 'fire', r: [1690, 860, 140, 40], every: [2.7, 0.9, 1.8] }],
      enemies: [],   // v14 (note 49): a rest-stone room is safe; its hound, brawler and a moth went to the Chimney Shaft
      pickups: [{ id: 'mark-km5', t: 'mark', x: 3100, y: 390 }, { t: 'wisp', x: 860, y: 650 }, { t: 'wisp', x: 2060, y: 610 }, { t: 'wisp', x: 3600, y: 850 }, { t: 'bloom', x: 2400, y: 860 }],
      props: [['spears', 300, 902, 200], ['logs', 1150, 902, 110], ['cart', 1700, 902, 160], ['pots', 2500, 902, 170], ['bellows', 3500, 902, 160], ['banner', 3780, 902, 300]],
      fg: [['fence', 1500, 1200, 300], ['spears', 3200, 1220, 420]],
      exits: [
        { side: 'right', range: [0, 1080], to: 'km2', at: [150, 1600] },
        { side: 'left', range: [0, 1080], to: 'km6', at: [1850, 970] },
      ],
    },
    km6: {
      name: "The Overseer's Furnace", w: 1920, h: 1080, map: [5, 6, 1, 1], bg: { kind: 'in', oy: 0.55 },
      // a raised kiln top in the middle: the charging punch stops dead against it
      solids: [[0, 970, 1920, 110, 'none'], [840, 850, 240, 120, 'kilntop']],
      oneways: [[220, 740, 240, 'rack'], [1460, 740, 240, 'rack']],
      doors: [{ id: 'kilnyard', kind: 'boss', art: 'furnace', x: 1780, y: 970, to: 'km1', lock: 'boss-overseer', label: 'Furnace gate' }],   // why it's here: the arena's way out once the Overseer falls
      boss: { t: 'overseer', x: 600, y: 970, trigger: [0, 1500], barriers: [[0, 0, 40, 970], [1880, 0, 40, 970]] },
      props: [['bellows', 150, 972, 170], ['logs', 1780, 972, 110], ['pots', 1650, 972, 160]],
      exits: [{ side: 'right', range: [0, 1080], to: 'km5', at: [70, 900] }],
      
    },
    km7: {
      name: "Potter's Cellar", w: 1920, h: 1080, map: [10, 6, 1, 1], bg: { kind: 'in', dim: 0.5, oy: 0.7, art: 'room.pottercellar', artDim: 0.12 },
      solids: [[0, 0, 840, 60, 'none'], [1080, 0, 840, 60, 'none'], [0, 970, 1920, 110, 'none'], [0, 60, 40, 910, 'none'], [1880, 60, 40, 910, 'none']],
      oneways: [[200, 620, 260, 'rack'], [700, 780, 220, 'rack']],
      doors: [{ id: 'pcellar', kind: 'stair', dir: 'up', x: 1650, y: 970, to: 'km3', label: 'Steps up' }],   // why it's here: the cellar's steps back up to the row
      enemies: [{ t: 'hound', x: 1200, y: 970 }, { t: 'moth', x: 1500, y: 600 }],
      pickups: [{ id: 'bead-km7', t: 'bead', x: 330, y: 540 }, { t: 'wisp', x: 800, y: 730 }],
      props: [['pots', 120, 972, 180], ['vase', 500, 972, 150], ['pots', 1000, 972, 160], ['logs', 1350, 972, 100]],
      exits: [],
    },
  },
};
