// @docent/core — `passage` scene plugin.
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

import type {ScenePlugin} from '@docent/kit';

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
};

export type {PassageMark, PassageScene} from './validate';
export default passagePlugin;
