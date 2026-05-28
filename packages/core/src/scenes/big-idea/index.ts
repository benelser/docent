// @bjelser/core — `big-idea` scene plugin.
//
// The takeaway scene: the single sentence the viewer should leave with —
// the claim that survives if everything else is forgotten. Cluster:
// `narrative` (a rhetorical move, sitting alongside epigraph, passage,
// figure, demonstrate, provocation, concession, objection — the family of
// scenes that earn their keep by the words on screen and the position
// they hold in the film's argument).
//
// Migrated from packages/engine/src/scenes/BigIdeaScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. See ./component.tsx for the
// renderer, ./schema.ts for the spec branch, ./validate.ts for the
// structural validator, and ./depth-rules.ts for the contract shape rule.

import type {ScenePlugin} from '@bjelser/kit';

import {BigIdeaSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {BigIdeaScene} from './validate';
import {validate} from './validate';

export const bigIdeaPlugin: ScenePlugin<BigIdeaScene> = {
  kind: 'scene',
  name: 'big-idea',
  version: '1.0.0',
  sceneType: 'big-idea',
  cluster: 'narrative',
  schema,
  component: BigIdeaSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — the takeaway is a held sentence
  // with narration playing beneath; no word-level alignment required.

  cue: 'one held sentence the viewer should leave with; sits before recap (explainer films).',
  signals: [
    {needle: 'the big idea', weight: 4},
    {needle: 'one held sentence', weight: 4},
    {needle: 'the takeaway', weight: 3},
    {needle: 'the central claim', weight: 2},
  ],
};

export type {BigIdeaAnchor, BigIdeaScene} from './validate';
export default bigIdeaPlugin;
