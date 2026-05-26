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
};

export type {CandlestickSceneSpec} from './schema';
export default candlestickPlugin;
