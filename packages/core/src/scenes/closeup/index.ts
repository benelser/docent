// @docent/core — `closeup` scene plugin.
//
// The "annotate a code artifact" move: a deep-dive on real source where
// a macOS-style window holds the listing, Prism highlights its tokens,
// and beats spotlight one line range at a time with a single-line
// accent annotation underneath. Cluster: `experience` (the viewer
// *experiences* the artifact close-up — same family as journey-map,
// where the cognitive move is putting the viewer inside the subject).
//
// Migrated from packages/engine/src/scenes/CloseupScene.tsx as part of
// the v3.0 plugin-architecture rip-and-replace. See ./component.tsx for
// the renderer, ./schema.ts for the spec branch, and ./validate.ts for
// the structural validator.

import type {ScenePlugin} from '@docent/kit';

import {CloseupSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {CloseupScene} from './validate';
import {validate} from './validate';

export const closeupPlugin: ScenePlugin<CloseupScene> = {
  kind: 'scene',
  name: 'closeup',
  version: '1.0.0',
  sceneType: 'closeup',
  cluster: 'experience',
  schema,
  component: CloseupSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — closeup renders code with
  // range-level highlight spotlights, not karaoke word-aligned passage
  // text; the default chunk-level alignment every TTS provider supports
  // is sufficient.

  cue: 'a specific code or text span needs to land at the line level (annotated artifact).',
  signals: [
    {needle: 'load-bearing line', weight: 3},
    {needle: 'load-bearing function', weight: 3},
    {needle: 'load-bearing change', weight: 3},
    {needle: 'at the line level', weight: 4},
    {needle: 'function-level', weight: 2},
    {needle: 'comparator', weight: 1},
    {needle: 'annotate the function', weight: 4},
  ],
};

export type {CloseupScene} from './validate';
export default closeupPlugin;
