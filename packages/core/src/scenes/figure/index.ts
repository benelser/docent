// @bjelser/core — `figure` scene plugin.
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

import type {ScenePlugin} from '@bjelser/kit';

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

  cue: 'the IMAGE is the artifact — a painting, a chart screenshot, a photograph; annotated by region.',
  signals: [
    {needle: 'image with regions', weight: 4},
    {needle: 'diagram annotation', weight: 4},
    {needle: 'annotate the image', weight: 4},
    {needle: 'annotated regions', weight: 3},
    {needle: 'still image', weight: 3},
    {needle: 'photograph', weight: 2},
    {needle: 'painting', weight: 2},
    {needle: 'chart screenshot', weight: 3},
  ],
};

export type {FigureCallout, FigureScene} from './validate';
export default figurePlugin;
