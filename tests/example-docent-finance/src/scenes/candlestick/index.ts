// candlestickPlugin — single-bar close-reading, expressed as a ScenePlugin.
//
// Cluster: `comparison`. The plugin shares the comparison family with `ohlc`
// (and `chart`, `compare`, etc.) but ships its own depth rule and judge
// dimension — the close-read is its argument, not the arc.

import type {ScenePlugin} from '@docent/kit';

import {CandlestickSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {candlestickSchema, type CandlestickSceneSpec} from './schema';
import {validate} from './validate';

export const candlestickPlugin: ScenePlugin<CandlestickSceneSpec> = {
  kind: 'scene',
  name: '@example/docent-finance/candlestick',
  version: '0.1.0',
  sceneType: 'candlestick',
  cluster: 'comparison',
  schema: candlestickSchema,
  component: CandlestickSceneComponent,
  validate,
  depthRules,
  judgeDimensions,

  cue: 'a single bar earns the screen — the argument names a structural feature (wick, body, open, close, pattern) the eye is supposed to read.',

  signals: [
    {needle: 'candlestick', weight: 4},
    {needle: 'candle pattern', weight: 4},
    {needle: 'doji', weight: 4},
    {needle: 'hammer pattern', weight: 4},
    {needle: 'engulfing pattern', weight: 4},
    {needle: 'wick length', weight: 3},
    {needle: 'long wick', weight: 3},
    {needle: 'real body', weight: 3},
    {needle: 'single bar', weight: 2},
    {needle: 'price bar', weight: 2},
    {needle: 'session close', weight: 2},
  ],
};

export type {CandlestickSceneSpec} from './schema';
export default candlestickPlugin;
