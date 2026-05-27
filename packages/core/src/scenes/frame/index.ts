// @docent/core — `frame` scene plugin.
//
// The opening chrome of every film: the faux-prompt setup, hero title,
// optional tagline, optional footnote. Cluster: `null` — frame is a
// chrome scene that brackets the film but performs no cognitive move
// (per the 7-cluster taxonomy, only `frame` and `recap` carry the null
// cluster).
//
// Migrated from packages/engine/src/scenes/FrameScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. See ./component.tsx for the
// renderer, ./schema.ts for the spec branch, and ./validate.ts for the
// structural validator (the v2.5.x rule: title is required).

import type {ScenePlugin} from '@docent/kit';

import {FrameSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {FrameScene} from './validate';
import {validate} from './validate';

export const framePlugin: ScenePlugin<FrameScene> = {
  kind: 'scene',
  name: 'frame',
  version: '1.0.0',
  sceneType: 'frame',
  cluster: null,
  schema,
  component: FrameSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — frame renders narrated chrome
  // (title/tagline/footnote spring in over short beats); the default
  // chunk-level alignment every TTS provider supports is sufficient.

  cue: 'the film\'s opening commitment — title, tagline, footnote. Every film opens with one.',
  signals: [],
};

export type {FrameScene} from './validate';
export default framePlugin;
