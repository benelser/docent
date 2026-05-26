// Depthcheck rules for the candlestick scene.
//
// The depth bar: a candlestick scene only earns its width when the narration
// CLOSE-READS the bar. A scene that shows a single bar and never names the
// wick, body, open, close, or pattern has wasted the close-up.

import type {DepthRule} from '@docent/kit';

import type {CandlestickSceneSpec} from './schema';

/**
 * `candlestick-close-read` — the headline rule. A candlestick scene must
 * have at least one beat that NAMES a structural feature of the bar (wick,
 * body, open, close, high, low, doji, hammer, engulfing, etc.). Otherwise
 * the close-up is decoration.
 */
const closeRead: DepthRule<CandlestickSceneSpec> = {
  id: 'candlestick-close-read',
  description:
    'the candlestick close-up earns its width only when the narration names a structural feature (wick, body, open, close, pattern) of the bar',
  severity: 'warning',
  scope: 'scene',
  check(scene, ctx) {
    const beats = Array.isArray(scene.beats) ? scene.beats : [];
    if (beats.length === 0) return null;
    const blob = beats
      .map((b) => (typeof b?.narration === 'string' ? b.narration : ''))
      .join(' ')
      .toLowerCase();
    const closeReadSignals = [
      'wick',
      'body',
      ' open',
      'close ',
      'closes ',
      ' high',
      ' low',
      'doji',
      'hammer',
      'engulf',
      'shooting star',
      'pattern',
      'reject',
      'pierce',
    ];
    const hit = closeReadSignals.some((s) => blob.includes(s));
    if (!hit) {
      return {
        ruleId: 'candlestick-close-read',
        path: `scenes[${ctx.sceneIndex ?? '?'}].beats`,
        message:
          'no beat narration close-reads the bar — wick, body, open/close, or a named pattern',
        severity: 'warning',
        suggestion:
          'name what the wick or body is saying — a long upper wick is rejection, an engulfing body is reversal, a doji is indecision',
      };
    }
    return null;
  },
};

export const depthRules: ReadonlyArray<DepthRule<CandlestickSceneSpec>> = [
  closeRead,
];

export default depthRules;
