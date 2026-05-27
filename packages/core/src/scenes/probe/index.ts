// @docent/core — `probe` scene plugin.
//
// The interrogation move: vary one input, follow the consequence. A
// baseline pinned at the top, then a row per variation — the perturbed
// input, an arrow, the resulting outcome, and a flip indicator. Cluster:
// `comparison` (probe places variations against a baseline on the
// outcome axis — same family as compare, landscape, quantities, chart,
// venn, prior-art).
//
// Migrated from packages/engine/src/scenes/ProbeScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. See ./component.tsx for the
// renderer, ./schema.ts for the spec branch, ./validate.ts for the
// structural validator, ./depth-rules.ts and ./judge-dimensions.ts for the
// (currently empty) per-scene depth + judge contracts.

import type {ScenePlugin} from '@docent/kit';

import {ProbeSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {ProbeScene} from './validate';
import {validate} from './validate';

export const probePlugin: ScenePlugin<ProbeScene> = {
  kind: 'scene',
  name: 'probe',
  version: '1.0.0',
  sceneType: 'probe',
  cluster: 'comparison',
  schema,
  component: ProbeSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — probe variations reveal at
  // beat granularity (the numeric `reveal` cadence drives entrance);
  // the narration plays alongside without per-word synchronization, so
  // the default chunk-level alignment every TTS provider supports is
  // sufficient.

  cue: 'vary ONE input and follow the consequence — sensitivity analysis, perturbation, what-if.',
  signals: [
    {needle: 'sensitivity analysis', weight: 4},
    {needle: 'what if', weight: 2},
    {needle: 'what-if', weight: 3},
    {needle: 'perturbation', weight: 4},
    {needle: 'vary one input', weight: 4},
    {needle: 'turn the knob', weight: 3},
    {needle: 'parameter sweep', weight: 4},
    {needle: 'dial up', weight: 1},
  ],
};

export type {ProbeScene} from './validate';
export default probePlugin;
