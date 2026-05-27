// @docent/core — `provocation` scene plugin.
//
// The rhetorical move: an incomplete closing that hands the open question
// to the viewer. The right ending for a research-frontier or open-policy
// film. Cluster: `narrative` (the closing rhetorical gesture; mutually
// exclusive with `big-idea` — a film either COMMITS to a takeaway or
// HANDS OFF an open question).
//
// Migrated from packages/engine/src/scenes/ProvocationScene.tsx as part
// of the v3.0 plugin-architecture rip-and-replace. See ./component.tsx for
// the renderer, ./schema.ts for the spec branch, ./validate.ts for the
// structural validator, ./depth-rules.ts for the `provocation-specific`
// depthcheck rule, and ./judge-dimensions.ts for the
// `provocation-load-bearing` judge dimension.
//
// The big-idea mutual-exclusion contract and the absolute-last-scene
// position contract are film-wide rules owned by the kit's cross-scene
// validator / depthcheck framework, not by this plugin.

import type {ScenePlugin} from '@docent/kit';

import {ProvocationSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {ProvocationScene} from './validate';
import {validate} from './validate';

export const provocationPlugin: ScenePlugin<ProvocationScene> = {
  kind: 'scene',
  name: 'provocation',
  version: '1.0.0',
  sceneType: 'provocation',
  cluster: 'narrative',
  schema,
  component: ProvocationSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — provocation renders body text with
  // chunk-level narration; no word-level karaoke alignment required.

  cue: 'the right ending is "we don\\\'t know yet" — a question-shaped hand-off, the final scene.',
  signals: [
    {needle: 'open question', weight: 4},
    {needle: 'leave unresolved', weight: 4},
    {needle: 'unresolved question', weight: 4},
    {needle: 'we don\'t know yet', weight: 4},
    {needle: 'we do not know yet', weight: 4},
    {needle: 'hand off to the viewer', weight: 3},
    {needle: 'frontier question', weight: 3},
    {needle: 'unsettled', weight: 2},
  ],
};

export type {ProvocationScene} from './validate';
export default provocationPlugin;
