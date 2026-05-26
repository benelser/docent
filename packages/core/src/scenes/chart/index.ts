// @docent/core — `chart` scene plugin.
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

import type {ScenePlugin} from '@docent/kit';

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
};

export type {ChartScene} from './validate';
export default chartPlugin;
