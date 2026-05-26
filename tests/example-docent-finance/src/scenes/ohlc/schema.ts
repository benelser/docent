// OhlcSceneSpec — the per-scene-type shape declared by the ohlc plugin.
//
// An OHLC scene plots a series of Open-High-Low-Close bars (the classic
// price-action chart). The kit's `Engine.schema()` composes this into one
// branch of the discriminated `oneOf` on `scene.type`.

import type {JSONSchema7} from 'json-schema';

import type {Scene} from '@docent/kit';

/** One price bar. */
export interface OhlcBar {
  /** Optional label (e.g. "Mon", "Q1", "2024-01-02"). */
  readonly label?: string;
  /** The bar's open price. */
  readonly open: number;
  /** The bar's high. Must be ≥ max(open, close). */
  readonly high: number;
  /** The bar's low. Must be ≤ min(open, close). */
  readonly low: number;
  /** The bar's close price. */
  readonly close: number;
  /** Optional volume (drawn as a small bar under the price bar). */
  readonly volume?: number;
}

export interface OhlcSceneSpec extends Scene {
  readonly type: 'ohlc';
  /** Optional eyebrow above the title (e.g. "01 // PRICE ACTION"). */
  readonly kicker?: string;
  /** Big title (e.g. "AAPL — last 10 sessions"). */
  readonly title?: string;
  /** Sub-line under the title. */
  readonly subtitle?: string;
  /** Optional y-axis label (e.g. "$/share"). */
  readonly yLabel?: string;
  /** The bars to plot — 5..20 inclusive. */
  readonly bars: ReadonlyArray<OhlcBar>;
}

export const ohlcSchema: JSONSchema7 = {
  type: 'object',
  required: ['type', 'bars'],
  properties: {
    type: {const: 'ohlc'},
    id: {type: 'string'},
    kicker: {type: 'string'},
    title: {type: 'string'},
    subtitle: {type: 'string'},
    yLabel: {type: 'string'},
    bars: {
      type: 'array',
      minItems: 5,
      maxItems: 20,
      items: {
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
