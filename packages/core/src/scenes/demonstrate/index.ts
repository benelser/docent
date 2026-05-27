// @docent/core — `demonstrate` scene plugin.
//
// The docent move that *plays the phenomenon itself*: an embedded
// screen-capture clip inside a device-style window panel, with the
// narration over it. Cluster: `narrative` — demonstrate is the
// recorded-instance counterpart to passage and figure (the close-text
// and image annotation scenes); the three together form the
// "annotate the artefact" narrative cluster.
//
// Migrated from packages/engine/src/scenes/DemonstrateScene.tsx as
// part of the v3.0 plugin-architecture rip-and-replace. See
// ./component.tsx for the renderer, ./schema.ts for the spec branch,
// and ./validate.ts for the structural validator.

import type {ScenePlugin} from '@docent/kit';

import {DemonstrateSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {DemonstrateScene} from './validate';
import {validate} from './validate';

export const demonstratePlugin: ScenePlugin<DemonstrateScene> = {
  kind: 'scene',
  name: 'demonstrate',
  version: '1.0.0',
  sceneType: 'demonstrate',
  cluster: 'narrative',
  schema,
  component: DemonstrateSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — demonstrate plays a video clip
  // with narration laid over the panel; chunk-level alignment (every
  // TTS provider supports it) is sufficient. There is no karaoke-style
  // word-aligned reveal on this scene.

  cue: 'only the moving image conveys it — a Manim render, a UI demo, a phenomenon in motion.',
  signals: [
    {needle: 'video clip', weight: 4},
    {needle: 'manim render', weight: 4},
    {needle: 'ui demo', weight: 4},
    {needle: 'screen capture', weight: 3},
    {needle: 'demo recording', weight: 3},
    {needle: 'play it back', weight: 2},
  ],
};

export type {DemonstrateScene} from './validate';
export default demonstratePlugin;
