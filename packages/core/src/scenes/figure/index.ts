// @docent/core — `figure` scene plugin.
//
// The narrative move: annotate a still image (a painting, a map, a
// photograph, an experimental stimulus) with labelled markers pinned to
// normalized regions. Cluster: `narrative` — the scene reveals an
// argument *over* a primary visual artifact, beat by beat, in the same
// family as `passage` (annotated text) and `demonstrate` (annotated
// video).
//
// Migrated from packages/engine/src/scenes/FigureScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. See ./component.tsx for the
// renderer, ./schema.ts for the spec branch, and ./validate.ts for the
// structural validator.

import type {ScenePlugin} from '@docent/kit';

import {FigureSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {FigureScene} from './validate';
import {validate} from './validate';

export const figurePlugin: ScenePlugin<FigureScene> = {
  kind: 'scene',
  name: 'figure',
  version: '1.0.0',
  sceneType: 'figure',
  cluster: 'narrative',
  schema,
  component: FigureSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — figure narrates the image at
  // the standard beat granularity; it does not need word-level karaoke
  // alignment like passage does. The default chunk-level alignment
  // every TTS provider supports is sufficient.
};

export type {FigureCallout, FigureScene} from './validate';
export default figurePlugin;
