// @docent/core — `diff` scene plugin.
//
// The PR-review move: a unified diff. Cluster: `flow` (control/data-flow
// changes — what the patch alters in the system's behavior, not its
// connectivity or its timeline).
//
// Migrated from packages/engine/src/scenes/DiffScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. See ./component.tsx for the
// renderer, ./schema.ts for the spec branch, and ./validate.ts for the
// structural validator.

import type {ScenePlugin} from '@docent/kit';

import {DiffSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {DiffScene} from './validate';
import {validate} from './validate';

export const diffPlugin: ScenePlugin<DiffScene> = {
  kind: 'scene',
  name: 'diff',
  version: '1.0.0',
  sceneType: 'diff',
  cluster: 'flow',
  schema,
  component: DiffSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — diff renders code, not karaoke
  // word-aligned passage text; the default chunk-level alignment every
  // TTS provider supports is sufficient.

  cue: 'the argument is "this changed" (before / after, side by side; PR films).',
  signals: [
    {needle: 'before / after', weight: 4},
    {needle: 'before/after', weight: 3},
    {needle: 'before and after', weight: 3},
    {needle: 'pull request', weight: 2},
    {needle: 'the diff', weight: 2},
  ],
};

export type {DiffScene} from './validate';
export default diffPlugin;
