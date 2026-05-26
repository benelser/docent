// @docent/core — `landscape` scene plugin.
//
// The quadrant-analysis primitive: N options plotted on M dimensions in
// 2-D. Cluster: `comparison` — landscape sits in the same family as
// `compare`, `quantities`, `chart`, `prior-art`, and `venn`: scenes whose
// cognitive move is to set options/values/positions side by side so the
// viewer can read the field.
//
// Migrated from packages/engine/src/scenes/LandscapeScene.tsx as part of
// the v3.0 plugin-architecture rip-and-replace. See ./component.tsx for
// the renderer, ./schema.ts for the spec branch, ./validate.ts for the
// structural validator, ./depth-rules.ts for the depthcheck contract
// (axis-asymmetric + landscape-spread), and ./judge-dimensions.ts for
// the LLM-judge axis (quadrant-honest).

import type {ScenePlugin} from '@docent/kit';

import {LandscapeSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {LandscapeScene} from './validate';
import {validate} from './validate';

export const landscapePlugin: ScenePlugin<LandscapeScene> = {
  kind: 'scene',
  name: 'landscape',
  version: '1.0.0',
  sceneType: 'landscape',
  cluster: 'comparison',
  schema,
  component: LandscapeSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — landscape narrates over markers,
  // not karaoke word-aligned passage text; the default chunk-level
  // alignment every TTS provider supports is sufficient.
};

export type {
  LandscapeAxisSpec,
  LandscapeQuadrants,
  LandscapeScene,
  LandscapeSubjectSpec,
} from './validate';
export default landscapePlugin;
