// @docent/core — `venn` scene plugin.
//
// The overlap-analysis move: 2 or 3 named sets rendered as overlapping
// circles, every region addressable by id so beats reveal/focus one zone
// at a time, and a named `novelty` region whose claim states what the
// intersection PROVES (not "the overlap is dangerous", but "X + Y + Z
// together exfiltrate because no token has provenance"). Cluster:
// `comparison` (places subjects against each other on set membership,
// the family that includes `compare`, `landscape`, `quantities`, `chart`,
// `prior-art`, `probe`).
//
// Migrated from packages/engine/src/scenes/VennScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. See ./component.tsx for the
// renderer, ./schema.ts for the spec branch, ./validate.ts for the
// structural validator, ./depth-rules.ts for the intersection-honest
// regex rule, and ./judge-dimensions.ts for the intersection-named LLM
// judge dimension.

import type {ScenePlugin} from '@docent/kit';

import {VennSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {VennScene} from './validate';
import {validate} from './validate';

export const vennPlugin: ScenePlugin<VennScene> = {
  kind: 'scene',
  name: 'venn',
  version: '1.0.0',
  sceneType: 'venn',
  cluster: 'comparison',
  schema,
  component: VennSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — venn narration walks one region
  // at a time, bound to the BEAT (reveal/focus) not the character, so the
  // default chunk-level alignment every TTS provider supports is sufficient.
};

export type {VennNovelty, VennRegion, VennScene, VennSet} from './validate';
export default vennPlugin;
