// @docent/core — `progression` scene plugin.
//
// An ordered timeline track: stages laid along a path, each a marker with
// a label, sub, and optional segment duration. The `flow` field picks the
// topology (linear / cycle / braided / iterate). Cluster: `time` — the
// scene whose native shape is *stages along a path*; the timeline cousin
// that shows actual dates lives separately under the same cluster.
//
// Migrated from packages/engine/src/scenes/ProgressionScene.tsx as part of
// the v3.0 plugin-architecture rip-and-replace. See ./component.tsx for
// the renderer, ./schema.ts for the spec branch, and ./validate.ts for
// the structural validator (the "at least 1 stage" body-required rule
// plus the per-stage track-is-0-or-1 check).

import type {ScenePlugin} from '@docent/kit';

import {ProgressionSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {ProgressionScene} from './validate';
import {validate} from './validate';

export const progressionPlugin: ScenePlugin<ProgressionScene> = {
  kind: 'scene',
  name: 'progression',
  version: '1.0.0',
  sceneType: 'progression',
  cluster: 'time',
  schema,
  component: ProgressionSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — progression renders stages along
  // a track with beat-driven reveals and a Narration overlay that plays
  // alongside; it does NOT need word-level alignment. The default chunk-
  // level alignment every TTS provider supports is sufficient.

  cue: 'the order matters but the dates don\'t (ordinal stages along a track).',
  signals: [
    {needle: 'ordinal stages', weight: 4},
    {needle: 'staged process', weight: 3},
    {needle: 'stages of the', weight: 2},
    {needle: 'pipeline stages', weight: 3},
    {needle: 'phases of', weight: 2},
  ],
};

export type {ProgressionScene, ProgressionStage, ProgressionFlow} from './validate';
export default progressionPlugin;
