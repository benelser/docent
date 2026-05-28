// epigraph — the ScenePlugin export.
//
// Migrated from packages/engine/src/scenes/EpigraphScene.tsx. The cluster is
// `narrative`: an epigraph is a rhetorical move — the film enters its argument
// by quoting a tradition, so the rest of the film can argue with it.
//
// The plugin's `component` wraps the renderer in a thin adapter that takes
// the kit's `SceneRenderProps<EpigraphSceneSpec>` and threads the scene's
// per-type fields + the resolved style into the renderer. D.1 (Film.tsx →
// registry dispatch) brings the engine's SceneFrame + Narration wrappers
// back around the rendered body once those primitives migrate to the kit.

import React from 'react';
import type {Scene, ScenePlugin, SceneRenderProps} from '@bjelser/kit';

import {EpigraphSceneRenderer} from './component';
import {schema} from './schema';
import {validate} from './validate';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';

// The plugin-owned fields on the scene spec. The kit's `Scene` keeps
// plugin-owned fields opaque (`[key: string]: unknown`); we narrow here so the
// per-scene validator + depth rule keep precise types.
export interface EpigraphSceneSpec extends Scene {
  type: 'epigraph';
  quote: string;
  attribution: string;
  epigraphTreatment?: 'block' | 'pull';
  kicker?: string;
  heading?: string;
}

// Adapter — bridges the kit's `SceneRenderProps<EpigraphSceneSpec>` into the
// renderer's narrow shape (just the scene fields it actually reads plus the
// resolved style). The adapter is the only piece D.1 will touch — once the
// scene shell (SceneFrame + Narration) moves into the engine's registry
// dispatch, the adapter becomes a one-line passthrough.
const EpigraphSceneAdapter: React.FC<SceneRenderProps<EpigraphSceneSpec>> = ({
  scene,
  common,
}) => {
  const inner: {
    quote?: string;
    attribution?: string;
    epigraphTreatment?: 'block' | 'pull';
  } = {
    quote: scene.quote,
    attribution: scene.attribution,
  };
  if (scene.epigraphTreatment !== undefined) {
    inner.epigraphTreatment = scene.epigraphTreatment;
  }
  return React.createElement(EpigraphSceneRenderer, {
    scene: inner,
    style: common.style,
  });
};

export const epigraphPlugin: ScenePlugin<EpigraphSceneSpec> = {
  kind: 'scene',
  name: 'epigraph',
  version: '1.0.0',
  sceneType: 'epigraph',
  cluster: 'narrative',
  schema,
  component: EpigraphSceneAdapter,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities — an epigraph does not need word-level alignment;
  // the narration plays beneath a static typographic scene.

  cue: 'anchor in a tradition — a cited authority opens the film and the argument argues with it.',
  signals: [
    {needle: 'cited authority', weight: 4},
    {needle: 'opens with a quote', weight: 4},
    {needle: 'opens the film', weight: 3},
    {needle: 'anchor in a tradition', weight: 4},
    {needle: 'quoted authority', weight: 3},
    {needle: 'in the words of', weight: 2},
  ],
};

export default epigraphPlugin;
