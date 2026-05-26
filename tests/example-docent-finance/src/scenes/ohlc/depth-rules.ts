// Depthcheck rules for the ohlc scene.
//
// The depth bar: "a film INTERROGATES, it does not admire." For an ohlc
// scene, the test is *not* "are there bars on screen" — it's "is the arc
// of the bars LOAD-BEARING, or is the chart decoration the narration could
// equally well do without?"
//
// One rule per principle. Stub-arrays were not the assignment; these are
// the real contract.

import type {DepthRule} from '@docent/kit';

import type {OhlcSceneSpec} from './schema';

/**
 * `ohlc-arc-load-bearing` — the headline rule. A scene that ships an OHLC
 * chart must *use* the multi-bar arc in narration. The rule fires when none
 * of the beat narrations reference the words that signal arc-reading:
 *
 *   - "trend"   / "trends"
 *   - "rally"   / "rallies"
 *   - "decline" / "declines"
 *   - "shape"
 *   - "arc"
 *   - "from <bar-label> to <bar-label>"
 *   - "first" + "last" (the canonical bar-range reading)
 *
 * If none of these appear, the chart is decoration: the narration could be
 * read with a single bar on screen and lose nothing. Either rewrite the
 * narration to read the arc, or downsize to a `candlestick` scene.
 */
const arcLoadBearing: DepthRule<OhlcSceneSpec> = {
  id: 'ohlc-arc-load-bearing',
  description:
    'the chart\'s argument should require the OHLC arc — narration must read the shape across bars, not just name one bar',
  severity: 'warning',
  scope: 'scene',
  check(scene, ctx) {
    const beats = Array.isArray(scene.beats) ? scene.beats : [];
    if (beats.length === 0) return null;
    const blob = beats
      .map((b) => (typeof b?.narration === 'string' ? b.narration : ''))
      .join(' ')
      .toLowerCase();
    const arcSignals = [
      'trend',
      'rally',
      'rallie',
      'decline',
      'shape',
      ' arc',
      'over the',
      'across',
      'from ',
      'climb',
      'fall',
      'drop',
      'spike',
      'sell-off',
      'selloff',
      'reversal',
    ];
    const hits = arcSignals.filter((s) => blob.includes(s));
    if (hits.length === 0) {
      return {
        ruleId: 'ohlc-arc-load-bearing',
        path: `scenes[${ctx.sceneIndex ?? '?'}].beats`,
        message:
          'no beat narration references the arc of the bars — the chart looks decorative',
        severity: 'warning',
        suggestion:
          'either name the trend/rally/decline/reversal the bars depict, or downsize to a `candlestick` (single-bar) scene',
      };
    }
    return null;
  },
};

export const depthRules: ReadonlyArray<DepthRule<OhlcSceneSpec>> = [
  arcLoadBearing,
];

export default depthRules;
