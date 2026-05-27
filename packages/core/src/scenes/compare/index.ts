// @docent/core — `compare` scene plugin.
//
// The judgement table: options across the top (columns), criteria down
// the left gutter (rows), cells in the grid. A `win` cell is
// accent-tinted, a `lose` cell is dimmed. Cluster: `comparison` (a side-
// by-side adjudication of options against criteria — the cognitive move
// is putting things next to each other and asking which wins on which
// axis).
//
// Migrated from packages/engine/src/scenes/CompareScene.tsx as part of
// the v3.0 plugin-architecture rip-and-replace. See ./component.tsx for
// the renderer, ./schema.ts for the spec branch, and ./validate.ts for
// the structural validator.

import type {ScenePlugin} from '@docent/kit';

import {CompareSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {CompareScene} from './validate';
import {validate} from './validate';

export const comparePlugin: ScenePlugin<CompareScene> = {
  kind: 'scene',
  name: 'compare',
  version: '1.0.0',
  sceneType: 'compare',
  cluster: 'comparison',
  schema,
  component: CompareSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — compare renders a static
  // judgement table; the default chunk-level alignment every TTS
  // provider supports is sufficient for the narration timing.

  cue: 'a head-to-head call as discrete table cells — options × criteria.',
  signals: [
    {needle: 'side-by-side options', weight: 4},
    {needle: 'side by side options', weight: 4},
    {needle: 'options × criteria', weight: 4},
    {needle: 'options x criteria', weight: 4},
    {needle: 'head-to-head', weight: 3},
    {needle: 'comparison table', weight: 3},
    {needle: 'feature matrix', weight: 3},
    {needle: 'side by side', weight: 2},
    {needle: 'side-by-side', weight: 2},
  ],
};

export type {
  CompareScene,
  CompareColumn,
  CompareRow,
  CompareCell,
} from './validate';
export default comparePlugin;
