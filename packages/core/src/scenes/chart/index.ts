// @bjelser/core — `chart` scene plugin.
//
// The `comparison` cluster's plotted move: a labelled coordinate graph
// with line / bars / point series drawn on numeric axes. Cluster:
// `comparison` (the family for placing quantified claims on shared axes —
// chart shares it with `compare`, `landscape`, `quantities`, `prior-art`,
// `venn`, `probe`).
//
// Migrated from packages/engine/src/scenes/ChartScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. See ./component.tsx for the
// renderer, ./schema.ts for the spec branch, and ./validate.ts for the
// structural validator.

import type {ScenePlugin} from '@bjelser/kit';

import {ChartSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {ChartScene} from './validate';
import {validate} from './validate';

export const chartPlugin: ScenePlugin<ChartScene> = {
  kind: 'scene',
  name: 'chart',
  version: '1.0.0',
  sceneType: 'chart',
  cluster: 'comparison',
  schema,
  component: ChartSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — chart renders a plotted graph; the
  // narration walks the shape/value at the beat granularity (reveal / focus
  // / `set` keys), not the character. The default chunk-level alignment
  // every TTS provider supports is sufficient.

  cue: 'continuous data on numeric axes — a trend, a curve, a distribution.',
  signals: [
    {needle: 'plot data', weight: 3},
    {needle: 'plot the data', weight: 3},
    {needle: 'curve', weight: 1},
    {needle: 'distribution', weight: 2},
    {needle: 'power law', weight: 3},
    {needle: 'power-law', weight: 3},
    {needle: 'trend line', weight: 3},
    {needle: 'trendline', weight: 3},
    {needle: 'growth curve', weight: 3},
    {needle: 'decay curve', weight: 3},
    {needle: 'data points', weight: 1},
  ],
};

export type {ChartScene} from './validate';
export default chartPlugin;
