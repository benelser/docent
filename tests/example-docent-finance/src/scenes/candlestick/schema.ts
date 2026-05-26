// CandlestickSceneSpec — the per-scene-type shape for the single-bar
// close-reading scene.
//
// Where `ohlc` shows the ARC, `candlestick` zooms into ONE bar. The depth
// move: read THIS day, name what it tells us — the wick length, the body
// position, the close relative to the open. The narration's job is the
// close-read of one trading session.

import type {JSONSchema7} from 'json-schema';

import type {Scene} from '@docent/kit';

import type {OhlcBar} from '../ohlc/schema';

export interface CandlestickSceneSpec extends Scene {
  readonly type: 'candlestick';
  readonly kicker?: string;
  readonly title?: string;
  readonly subtitle?: string;
  /** The one bar being close-read. */
  readonly bar: OhlcBar;
  /** Optional annotation rendered alongside the bar (e.g. "doji", "hammer"). */
  readonly pattern?: string;
  /** Optional annotation describing the pattern's meaning. */
  readonly patternNote?: string;
}

export const candlestickSchema: JSONSchema7 = {
  type: 'object',
  required: ['type', 'bar'],
  properties: {
    type: {const: 'candlestick'},
    id: {type: 'string'},
    kicker: {type: 'string'},
    title: {type: 'string'},
    subtitle: {type: 'string'},
    pattern: {type: 'string'},
    patternNote: {type: 'string'},
    bar: {
      type: 'object',
      required: ['open', 'high', 'low', 'close'],
      properties: {
        label: {type: 'string'},
        open: {type: 'number'},
        high: {type: 'number'},
        low: {type: 'number'},
        close: {type: 'number'},
        volume: {type: 'number', minimum: 0},
      },
    },
    beats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {type: 'string'},
          narration: {type: 'string'},
        },
      },
    },
  },
};
