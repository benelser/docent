// @bjelser/core — `passage` scene plugin.
//
// Annotates a plain-text artifact (a poem, prose, a primary-source
// document) by phrase. The annotation unit is a `mark` — a span
// (`quote`) located in the text, underlined/highlighted, with a short
// `note` pinned beside it. Beats activate marks through the existing
// reveal/focus model.
//
// Cluster: `narrative`. A passage carries an artifact through the film:
// the scene exists to *read* a primary source, not to compare or
// diagram it. Per the docent scene grammar, a quoted text belongs in
// `passage`, not `closeup` (code) or `figure` (image).
//
// Migrated from packages/engine/src/scenes/PassageScene.tsx as part of
// the v3.0 plugin-architecture rip-and-replace. See ./component.tsx
// for the renderer, ./schema.ts for the spec branch, ./validate.ts for
// the structural validator.

import type {ScenePlugin} from '@bjelser/kit';

import {PassageSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {PassageScene} from './validate';
import {validate} from './validate';

export const passagePlugin: ScenePlugin<PassageScene> = {
  kind: 'scene',
  name: 'passage',
  version: '1.0.0',
  sceneType: 'passage',
  cluster: 'narrative',
  schema,
  component: PassageSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — the v2.5.x passage renderer
  // activates marks per BEAT (reveal/focus), not per word. Karaoke
  // word-alignment would be a different scene-type ("read-along");
  // this passage scene's reveal model rides on the same beat boundaries
  // every scene uses, so the default chunk-level alignment every TTS
  // provider supports is sufficient.

  cue: 'the SOURCE TEXT is the artifact — a poem, a quote, a statute; annotated by phrase.',
  signals: [
    {needle: 'prose passage', weight: 4},
    {needle: 'close reading', weight: 4},
    {needle: 'close-reading', weight: 4},
    {needle: 'the source text', weight: 4},
    {needle: 'quoted text', weight: 3},
    {needle: 'annotated by phrase', weight: 4},
    {needle: 'poem', weight: 3},
    {needle: 'stanza', weight: 3},
    {needle: 'verse', weight: 2},
    {needle: 'primary source', weight: 2},
  ],
};

export type {PassageMark, PassageScene} from './validate';
export default passagePlugin;
