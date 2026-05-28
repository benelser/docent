// @bjelser/core — `recap` scene plugin.
//
// The closing chrome move: the synthesis the film resolves to. Cluster:
// `null` (chrome scene — `recap` brackets the film alongside `frame`,
// formalizing what was argued rather than performing a cognitive move
// on its own).
//
// Migrated from packages/engine/src/scenes/RecapScene.tsx as part of
// the v3.0 plugin-architecture rip-and-replace. See ./component.tsx
// for the renderer, ./schema.ts for the spec branch, and ./validate.ts
// for the structural validator.

import type {ScenePlugin} from '@bjelser/kit';

import {RecapSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {RecapScene} from './validate';
import {validate} from './validate';

export const recapPlugin: ScenePlugin<RecapScene> = {
  kind: 'scene',
  name: 'recap',
  version: '1.0.0',
  sceneType: 'recap',
  cluster: null,
  schema,
  component: RecapSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — recap reads ruling points as
  // the narration progresses; the default chunk-level alignment every
  // TTS provider supports is sufficient. No karaoke / word-level
  // requirement.

  cue: 'a closing RULING — points the film proved, what to doubt; never a restatement.',
  signals: [],
};

export type {RecapScene} from './validate';
export default recapPlugin;
