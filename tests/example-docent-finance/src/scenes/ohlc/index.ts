// ohlcPlugin — the OHLC (Open-High-Low-Close) chart, expressed as a
// ScenePlugin per the @bjelser/kit §4.2 contract.
//
// Cluster: `comparison`. OHLC bars place quantified price claims on shared
// axes — the same family `chart`, `compare`, `landscape`, `quantities`,
// `prior-art`, `venn`, `probe` belong to.
//
// `requiresTtsCapabilities`: undefined — the narration walks the multi-bar
// arc at beat granularity (the depth rule fires when it doesn't). Default
// chunk-level alignment is sufficient.

import type {ScenePlugin} from '@bjelser/kit';

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

  // Cue surfaced by `docent scene-fit list` and consumed by the agent
  // layer's prompts. Names what survey language pulls this scene in.
  cue: 'price action across multiple bars — the argument reads the SHAPE of the arc (trend, reversal, consolidation), not a single tick.',

  // Selection signals for `docent scene-fit recommend`. Each match
  // contributes the declared weight to ohlc's score. Tuning:
  //   4 — distinctive language; ohlc-only phrasing
  //   3 — strong domain hint
  //   2 — financial-instrument adjacency
  //   1 — circumstantial, contributes only with stronger evidence
  signals: [
    {needle: 'ohlc bars', weight: 4},
    {needle: 'open-high-low-close', weight: 4},
    {needle: 'price action', weight: 3},
    {needle: 'bar chart of prices', weight: 4},
    {needle: 'multi-bar arc', weight: 4},
    {needle: 'trend line on prices', weight: 3},
    {needle: 'price reversal', weight: 3},
    {needle: 'consolidation pattern', weight: 3},
    {needle: 'support level', weight: 2},
    {needle: 'resistance level', weight: 2},
    {needle: 'price chart', weight: 2},
    {needle: 'trading session', weight: 1},
    {needle: 'ticker', weight: 1},
  ],
};

export type {OhlcBar, OhlcSceneSpec} from './schema';
export default ohlcPlugin;
