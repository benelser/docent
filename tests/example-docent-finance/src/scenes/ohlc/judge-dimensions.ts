// Judge dimensions for the ohlc scene.
//
// The judge grades a rendered film against these dimensions. Two dimensions
// for ohlc — both real, neither a stub:
//
//   - `ohlc-volume-narrated` — when a scene ships `volume` data, does the
//     narration NAME what the volume tells us, or is it decoration alongside
//     the price bars?
//   - `ohlc-trend-named` — does the narration name the direction (up / down /
//     consolidation) of the arc the bars depict?

import type {JudgeDimension} from '@docent/kit';

const volumeNarrated: JudgeDimension = {
  id: 'ohlc-volume-narrated',
  title: 'Volume is narrated, not decorated',
  description:
    'When the OHLC scene ships per-bar volume, the narration explains what the volume reveals (conviction, capitulation, divergence) — it is not painted on screen and left unread.',
  weight: 0.6,
  rubric: [
    "Read the scene's bars: do any carry a `volume` field?",
    '- If NO volume data is shipped, score this dimension N/A.',
    '- If volume IS shipped, check whether ANY beat\'s narration references',
    '  volume directly ("volume picked up", "high volume", "conviction",',
    '  "capitulation", "thin", "heavy session", etc.).',
    '  - YES → score: 1.0 (volume is a load-bearing claim).',
    '  - NO  → score: 0.0 (volume is decoration; either narrate it or drop it).',
  ].join('\n'),
};

const trendNamed: JudgeDimension = {
  id: 'ohlc-trend-named',
  title: 'The trend is named, not implied',
  description:
    'An OHLC chart only earns its width when the narration names the shape: an uptrend, a sell-off, a reversal, a consolidation. A film that leaves the viewer to infer the direction has wasted the chart.',
  weight: 1.0,
  rubric: `Read the beat narrations for this OHLC scene.
- Does ANY beat name a directional claim about the arc — "uptrend",
  "rally", "sell-off", "decline", "consolidation", "breakout",
  "reversal"?
  - YES → 1.0
  - NO  → 0.0 — the scene shows bars but the script never tells the
                viewer what shape to see.`,
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [
  volumeNarrated,
  trendNamed,
];

export default judgeDimensions;
