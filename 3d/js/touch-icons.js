// v7 note 43: the touch glyphs. Each on-screen button's icon as inline SVG (cream strokes, drawn on the painted
// stone disc in CSS), shared by the buttons themselves (touch.js) and every prompt (hud.js glyph()).
// No imports, so hud.js and touch.js can both use it without an import cycle.
const S = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const TICON = {
  light: S('<path d="M5 19 L17 7"/><path d="M15 5 L19 9"/><path d="M8 9 C11 5 16 4 20 5" class="t"/>'),
  heavy: S('<path d="M4 18 L15 7"/><path d="M8 20 L19 9"/><path d="M14 3 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4z" class="f"/>'),
  jump: S('<path d="M12 20 V6"/><path d="M6 11 L12 5 L18 11"/><path d="M6 21 H18" class="t"/>'),
  dodge: S('<path d="M5 15 A7 7 0 1 1 12 19"/><path d="M8 19 H12.5 V14.5"/>'),
  guard: S('<path d="M12 3 L19 6 V11 C19 16 15.5 19.5 12 21 C8.5 19.5 5 16 5 11 V6 Z"/>'),
  lock: S('<circle cx="12" cy="12" r="6.5"/><path d="M12 2 V6 M12 18 V22 M2 12 H6 M18 12 H22"/><circle cx="12" cy="12" r="1.4" class="f"/>'),
  gust: S('<path d="M3 9 H14 A3 3 0 1 0 11 6"/><path d="M3 14 H18 A3 3 0 1 1 15 17"/><path d="M3 19 H9" class="t"/>'),
  interact: S('<path d="M8 12 V6.5 a1.5 1.5 0 0 1 3 0 V11 V4.5 a1.5 1.5 0 0 1 3 0 V11 V6 a1.5 1.5 0 0 1 3 0 V14 C17 18 15 21 11.5 21 C8.5 21 7 19 5.5 16 L4.3 13.6 a1.4 1.4 0 0 1 2.4 -1.4 Z"/>'),
  pause: S('<path d="M9 6 V18 M15 6 V18"/>'),
  guide: S('<circle cx="12" cy="12" r="8"/><path d="M15.5 8.5 L13 13 L8.5 15.5 L11 11 Z" class="f"/>'),
  aim: S('<circle cx="12" cy="12" r="7.5"/><path d="M12 2.5 V7 M12 17 V21.5 M2.5 12 H7 M17 12 H21.5"/><path d="M10 12 H14 M12 10 V14" class="t"/>'),
  back: S('<path d="M15 5 L8 12 L15 19"/>'),
  stick: S('<circle cx="12" cy="12" r="9" class="t"/><circle cx="12" cy="12" r="4.5" class="f"/>'),
  drag: S('<path d="M4 12 H20 M7 9 L4 12 L7 15 M17 9 L20 12 L17 15"/><circle cx="12" cy="12" r="2" class="f"/>'),
};
export const TNAME = { light: 'Attack', heavy: 'Heavy', jump: 'Jump', dodge: 'Dodge', guard: 'Guard', lock: 'Lock on', gust: 'Palm Gust', interact: 'Interact', pause: 'Pause', guide: 'Show the way', aim: 'Aim', back: 'Back', stick: 'left thumb', drag: 'drag' };
// pad tokens used in prompts -> on-screen button
export const TOUCHMAP = { '✕': 'jump', '○': 'dodge', '△': 'interact', '□': 'gust', L1: 'guard', R1: 'light', R2: 'heavy', L2: 'aim', R3: 'lock', L3: 'lock', OPTIONS: 'pause', BACK: 'back', LS: 'stick', RS: 'drag', DPAD: 'guide', 'L1+□': 'gust' };   // L2+R2 -> aim + heavy
// a small painted disc with the button's icon (the stick and the drag get a word, as on the Controls page)
export function tglyph(act) {
  const ic = TICON[act]; if (!ic) return `<span class="kb">${act}</span>`;
  const word = act === 'stick' ? '<span class="tgw">left thumb</span>' : act === 'drag' ? '<span class="tgw">drag</span>' : '';
  return `<span class="tg tg-${act}" title="${TNAME[act]}">${ic}</span>${word}`;
}
