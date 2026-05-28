// Judge dimensions for the candlestick scene.
//
// The judge grades against one dimension here — whether the close-read
// is real or pro-forma. A candlestick scene that names the wick is doing
// the close-up; a scene that just states "the price went up" is not.

import type {JudgeDimension} from '@bjelser/kit';

const closeReadEarned: JudgeDimension = {
  id: 'candlestick-close-read-earned',
  title: 'The close-up earns its width',
  description:
    'A candlestick scene zooms into ONE bar — the screen real estate only pays off when the narration names a structural feature: the wick, the body, the open/close, or a named pattern (doji, hammer, engulfing).',
  weight: 1.0,
  rubric: `Read the candlestick scene's beats.
- Does ANY beat name a structural feature?
  - The wick (its length, what rejection it shows)
  - The body (open ↔ close, its size, what conviction it implies)
  - A named pattern (doji, hammer, shooting star, engulfing)
  - The open or close as a level
- YES → 1.0 — a real close-read.
- The narration only says "price went up" / "price went down" → 0.0 — a
  candlestick is wasted on a directional gloss.`,
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [
  closeReadEarned,
];

export default judgeDimensions;
