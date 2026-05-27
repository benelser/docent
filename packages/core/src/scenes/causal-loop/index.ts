// @docent/core — `causal-loop` scene plugin.
//
// The system-dynamics primitive: feedback diagrams. Variables sit as
// labelled discs arranged in a ring; directed edges between them carry a
// polarity glyph (+/-); one or more loops overlay the diagram and are
// labelled reinforcing (R, even '-' count — the cycle compounds) or
// balancing (B, odd — the cycle self-corrects). The validator enforces the
// labelling math — the label cannot lie.
//
// Cognitive cluster: `flow` — control flow, data flow, state transitions,
// pipelines, cycles, feedback loops, processes. Causal-loop is the
// archetype of "what does this system do over time when something nudges
// it": a debt spiral compounding, a thermostat compensating, a market
// oscillating.
//
// Migrated from packages/engine/src/scenes/CausalLoopScene.tsx as part of
// the v3.0 plugin-architecture rip-and-replace. See ./component.tsx for
// the renderer, ./schema.ts for the spec branch, and ./validate.ts for
// the structural validator.

import type {ScenePlugin} from '@docent/kit';

import {CausalLoopSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {CausalLoopScene} from './validate';
import {validate} from './validate';

export const causalLoopPlugin: ScenePlugin<CausalLoopScene> = {
  kind: 'scene',
  name: 'causal-loop',
  version: '1.0.0',
  sceneType: 'causal-loop',
  cluster: 'flow',
  schema,
  component: CausalLoopSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — a causal-loop scene narrates
  // R/B verdicts at beat granularity; the default chunk-level alignment
  // every TTS provider supports is sufficient. No karaoke / word-level
  // reveal is needed.

  cue: 'variables influencing each other in a closed cycle — reinforcing or balancing dynamics.',
  signals: [
    {needle: 'feedback loop', weight: 4},
    {needle: 'causal loop', weight: 4},
    {needle: 'self-reinforcing', weight: 4},
    {needle: 'self reinforcing', weight: 3},
    {needle: 'reinforcing loop', weight: 4},
    {needle: 'balancing loop', weight: 4},
    {needle: 'vicious cycle', weight: 3},
    {needle: 'virtuous cycle', weight: 3},
    {needle: 'compounds', weight: 2},
    {needle: 'compounding', weight: 2},
    {needle: 'positive feedback', weight: 3},
    {needle: 'negative feedback', weight: 3},
    {needle: 'flywheel', weight: 2},
    {needle: 'polarity', weight: 2},
  ],
};

export type {
  CausalEdge,
  CausalLoop,
  CausalLoopScene,
  CausalVariable,
} from './validate';
export {schema} from './schema';
export {validate} from './validate';
export {depthRules} from './depth-rules';
export {judgeDimensions} from './judge-dimensions';
export {CausalLoopSceneComponent} from './component';
export default causalLoopPlugin;
