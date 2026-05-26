// ohlcPlugin — the OHLC (Open-High-Low-Close) chart, expressed as a
// ScenePlugin per the @docent/kit §4.2 contract.
//
// Cluster: `comparison`. OHLC bars place quantified price claims on shared
// axes — the same family `chart`, `compare`, `landscape`, `quantities`,
// `prior-art`, `venn`, `probe` belong to.
//
// `requiresTtsCapabilities`: undefined — the narration walks the multi-bar
// arc at beat granularity (the depth rule fires when it doesn't). Default
// chunk-level alignment is sufficient.

import type {ScenePlugin} from '@docent/kit';

import {OhlcSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {ohlcSchema, type OhlcSceneSpec} from './schema';
import {validate} from './validate';

export const ohlcPlugin: ScenePlugin<OhlcSceneSpec> = {
  kind: 'scene',
  name: '@example/docent-finance/ohlc',
  version: '0.1.0',
  sceneType: 'ohlc',
  cluster: 'comparison',
  schema: ohlcSchema,
  component: OhlcSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
};

export type {OhlcBar, OhlcSceneSpec} from './schema';
export default ohlcPlugin;
