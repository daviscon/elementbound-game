// Everything anyone says, and the cutscene stills. All original.
// A talk is a list of lines. A line is a string (spoken by the talk's `who`, default the Elder)
// or [who, text]. `again` replaces the lines the second time; `sets` sets a flag when it ends.

export const SPEAKERS = {
  elder: { name: 'Elder Sora-Lin', portrait: 'portrait.elder', color: '#bfe9f2' },
  joon: { name: 'Joon', portrait: 'portrait.hero', color: '#ffe9a8' },
  ren: { name: 'Mother Ren', portrait: 'portrait.ren', color: '#7fd0e6' },
  tamsin: { name: 'Old Tamsin', portrait: 'portrait.tamsin', color: '#e6cc94' },
  kesh: { name: 'Kesh', portrait: 'portrait.kesh', color: '#ffb37a' },
  mapmaker: { name: 'The Mapmaker', portrait: 'portrait.mapmaker', color: '#d9c7ff' },
  captain: { name: 'The Captain', portrait: 'portrait.captain', color: '#ff8a6a' },
  child: { name: 'Kite child', villager: 0, color: '#f3ecdf' },
  fisher: { name: 'Old fisherman', villager: 1, color: '#f3ecdf' },
  carrier: { name: 'Stone carrier', villager: 2, color: '#f3ecdf' },
  potter: { name: 'Potter', villager: 3, color: '#f3ecdf' },
};

export const TALKS = {
  // v10 (Connor's note 20): taught once, by situation, after the first real knock in Kite Hill
  teachHeal: {
    lines: ['Breathe, Joon. Press {heal} and let the air bind you. A full breath mends three wounds, even in the air.'],
  },
  intro: {
    lines: [
      'Joon. Smoke on the lower road. The Captain\'s lantern-bearers will reach the monastery gate by dusk.',
      "You have only ever moved the air. That is not all you are. The wind has waited a long time for you to listen.",
      ['joon', 'Me? Elder, I can barely keep a kite up.'],
      'Then learn. Go into the Shrine of Wind, just east of here. Breathe with it. Then come back to me.',
    ],
    again: ['The Shrine of Wind is through the hall to the east. Breathe first. Then fight.'],
  },
  afterAir: {
    lines: [
      'Good. Air gives way, then comes back stronger. Don\'t fight the current. Ride it.',
      'They have taken the West Gate and dammed the river below it. The terraces drowned overnight.',
      'The old masters of the other three paths are still out there. Find them. Each will test you before they teach you.',
      'Mother Ren keeps the water shrine below the gate. Break their line and go down to her.',
    ],
    again: ['The West Gate, Joon. Past the crossroads. Mother Ren waits below it.'],
  },
  water: {
    lines: [
      ['ren', 'So this is the boy who runs everywhere. Sit. No, sit properly.'],
      ['ren', 'Look at the water in the bowl. It never breaks the stone. It waits, and the stone gives.'],
      ['joon', 'I came to learn to fight, Mother Ren.'],
      ['ren', 'You came to learn to wait. Fighting is what happens when you finally stop waiting.'],
      ['ren', 'A guardian of reeds keeps my old sluice to the west. Freeze what you need, climb, and make it yield.'],
      'When you can step on the wind twice, come home, Joon.',
    ],
    again: [['ren', 'The Rime Warden guards the frozen sluice beyond the river channels. Ice will carry you there.']],
  },
  earth: {
    lines: [
      ['tamsin', 'Wind-boy. My crew dug nine terraces into this hill by hand. You will not float through my lesson.'],
      ['tamsin', 'Stand still. Let your weight become your strength. Strike down from above, and cracked stone gives way.'],
      ['joon', 'And the thing in the pit?'],
      ['tamsin', 'It slept since the day they closed the quarry. Their drums woke it. Only a blow like mine will make it kneel.'],
      'Earth is the hardest lesson for one born to the wind. Listen to her.',
    ],
    again: [['tamsin', 'Rise, then fall like a mountain. That is all the Colossus understands.']],
  },
  fire: {
    lines: [
      ['kesh', 'Don\'t look at me like that. Yes, I fired their kilns and carried their lanterns. I walked away from it.'],
      ['kesh', 'They taught me fire was a hammer. It isn\'t. It\'s breath, kept close. Control, not destruction.'],
      ['joon', 'Why help me?'],
      ['kesh', 'Because somebody has to remember what fire was for. Keep it close and it warms. Let it rule you and it burns everything you love.'],
      'The thornwood they grew across our roads will burn now, Joon. So will the way to the Brass Gate, once the wind carries you over the gorge.',
    ],
    again: [['kesh', 'The Overseer keeps the furnace yard. Beat him and the wind will carry you over the gorge.']],
  },
  gate: {
    lines: [
      'There it is. The Brass Gate. Their Captain has never lost a duel.',
      ['joon', 'Kesh said he would meet us here.'],
      'Kesh went ahead last night. He hasn\'t come back. Be careful who you trust behind those walls.',
      'Air, water, earth, fire. One breath. Go.',
    ],
    again: ['Air, water, earth, fire. One breath. Go.'],
  },
  betray: {
    lines: [
      ['kesh', 'I\'m sorry, Joon. They found my sister. The Captain said one boy for one girl.'],
      ['joon', 'Kesh, don\'t...'],
      ['kesh', 'Bar the doors.'],
    ],
  },
  barracksDone: {
    lines: [['joon', 'He\'s gone. Fine. I go through the gate alone, then.']],
  },
  captain: {
    lines: [
      ['captain', 'The kite boy. They told me you had learned three new tricks.'],
      ['captain', 'I have been burning down monasteries since before you could walk. Come and show me.'],
    ],
  },
  keshReturns: {
    lines: [
      ['kesh', 'Joon! She\'s free. His own guards let her go when I told them what he ordered.'],
      ['kesh', 'Fire is control. Watch.'],
      ['captain', 'Traitor!'],
      ['kesh', 'His flames are mine now. Finish it.'],
    ],
  },
  ending: {
    lines: [
      'The gate is open. Listen: the river is running again.',
      ['kesh', 'And the army is going home. Most of them were farmers once.'],
      'Four elements, one breath. The Fourfold has come home to the mountain.',
      ['joon', 'Elder... the sun is coming up.'],
      'Rest now, Joon. Tomorrow we start rebuilding.',
    ],
  },
  // townsfolk
  child: { who: 'child', lines: ['My kite came down when the smoke went up. Is the wind angry with us?', ['joon', 'No. I think it was waiting for someone.']], again: ['Fly high, Joon!'] },
  fisher: { who: 'fisher', lines: ['The steps were dry when I was a boy. Mind the reeds down there. Some of them bite.', 'Hit them from the side after they snap. Or flip them with water, if you have the knack.'], again: ['Some of the reeds bite. Remember that.'] },
  carrier: { who: 'carrier', lines: ['They took the quarry in a morning. The big one in the pit took longer to wake.', 'The little rock-mites curl up and roll. Jump them, or put a wall in the way.'], again: ['Jump the rolling ones.'] },
  potter: { who: 'potter', lines: ['Shh. Don\'t run on the road. The hounds hear running.', 'They hate water. Hate it. And a wall in front of them stops them dead.'], again: ['Water and walls. That\'s all I know about hounds.'] },
  mapmaker: {
    who: 'mapmaker',
    lines: [
      'Ah, a traveller with mud on his boots. I draw what the army hasn\'t burned yet.',
      'Your map fills itself in as you walk now. I only sell the odd thing I find on the road.',
      'And take these pins. Mark what you can\'t reach yet, and come back for it later.',
    ],
    again: ['Pins, a chart of the rest stones, the odd petal I found in a ditch. Have a look.'],
  },
};

// Townsfolk who stand in rooms (data: villagers: [{ who, x, y, need? }]).
export const VILLAGERS = {
  child: { talk: 'child', frame: 0 },
  fisher: { talk: 'fisher', frame: 1 },
  carrier: { talk: 'carrier', frame: 2 },
  potter: { talk: 'potter', frame: 3 },
  mapmaker: { talk: 'mapmaker', shop: true, label: 'Browse maps' },
};

// Cutscenes: stills with a caption each; pan: [x0, y0, zoom0, x1, y1, zoom1] (0..1 crops).
// crop: how much of the image height to use (the story paintings have a band at the bottom).
// v13: stills still painted with the pre-redesign Joon. While one is listed here (and has not been replaced live, see
// Assets.stamp), its slides use panOld, which keeps the camera on the army and the road so the old Joon stays out of
// frame. Remove a still from this set when its redrawn painting lands.
export const OLD_STORY_ART = new Set([]);   // v13 14:42: story-01 to 07 repainted with the new designs, so no still needs the fallback
export const CUTSCENES = {
  arrival: [
    { img: 'story.army', caption: 'At dusk the Brass Gate\'s army climbed the old pilgrims\' road to Kite Hill.', pan: [0.6, 0.3, 1.15, 0.8, 0.4, 1.3], panOld: [0.9, 0.3, 1.6, 1.0, 0.4, 1.75], crop: 0.84 },
    { img: 'story.army', caption: 'From the monastery wall, Elder Sora-Lin watched the torches come. Beside her, Joon watched her face.', pan: [0.0, 0.3, 1.5, 0.1, 0.35, 1.7], panOld: [0.72, 0.05, 1.8, 0.86, 0.2, 2.0], crop: 0.84 },
  ],
  brass: [
    { img: 'bg.brass', caption: 'Across the gorge, the Brass Gate. Behind it, the Captain\'s camp, and every road off the mountain.', pan: [0.3, 0.5, 1.1, 0.7, 0.45, 1.25] },
  ],
  // img can list stand-ins: the first one that exists is shown. The new stills (story-05,
  // story-06) show Joon in his real outfit; until they arrive the old slides stay.
  sunrise: [
    { img: ['story.terraces', 'bg.drowned'], caption: 'The army went home along the river road. Some of them stopped to help drain the terraces.', pan: [0.2, 0.4, 1.1, 0.6, 0.5, 1.2] },
    { img: ['story.kites', 'bg.kite'], caption: 'And on the first clear morning, the kites went up over Kite Hill again.', pan: [0.5, 0.4, 1.05, 0.5, 0.3, 1.15] },
  ],
  // after Glide: its own painting (story-07) when it exists, else the Kilnmouth painting with the same pan
  windroad: [
    { img: ['story.windroad', 'bg.kiln'], caption: 'High above the furnace yards, the wind took hold of Joon and did not let go.', pan: [0.5, 0.0, 1.05, 0.5, 0.05, 1.15] },   // v7: holds the top, where Joon is
    { img: ['story.windroad', 'bg.kiln'], caption: 'Every stone he had rested at hummed below him. The wind road was open.', pan: [0.3, 0.4, 1.2, 0.7, 0.4, 1.3] },
  ],
};
