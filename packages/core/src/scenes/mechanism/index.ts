// mechanism — a working diagram in continuous motion that lets the viewer SEE
// how a thing operates. The motion is generated procedurally from closed
// primitives (cycle / oscillate / descend / iterate); the author names the
// kind of motion and the parts it visits, the engine owns the animation.
//
// Cognitive cluster: `flow` — control flow, data flow, state transitions,
// pipelines, cycles, feedback loops, processes. Mechanism is the prototype
// of "watch this thing run": a feedback loop converging, a thermostat
// compensating, gradient descent walking, a state machine cycling.
//
// Migrated from packages/engine/src/scenes/MechanismScene.tsx per the Phase B
// template (`docs/design/migration-brief-templates.md` §Template 1). The
// component, schema, validator, depth rules, and judge dimensions are each
// faithful ports of the corresponding behaviour in the engine monolith.

import type {ScenePlugin, Scene} from '@bjelser/kit';

import {Component, type MechanismScene} from './component';
import {schema} from './schema';
import {validate} from './validate';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';

export {
  Component,
  type MechanismScene,
  type MechanismPart,
  type MechanismMotion,
  type MechanismPhaseFreeze,
} from './component';
export {schema} from './schema';
export {validate} from './validate';
export {depthRules} from './depth-rules';
export {judgeDimensions} from './judge-dimensions';

/**
 * The mechanism ScenePlugin. Registered with the engine via `engine.use()`;
 * dispatched through `engine.scenes.get('mechanism').component` at render
 * time.
 *
 * `requiresTtsCapabilities` is left undefined: mechanism scenes do not need
 * word-level alignment — the motion carries the argument, not the words.
 */
export const mechanismPlugin: ScenePlugin<Scene> = {
  kind: 'scene',
  name: 'mechanism',
  version: '1.0.0',
  sceneType: 'mechanism',
  cluster: 'flow',
  schema,
  component: Component as ScenePlugin<Scene>['component'],
  validate,
  depthRules,
  judgeDimensions,

  cue: 'parts arranged in a working motion — feedback loop iterating, state machine cycling.',
  signals: [
    {needle: 'working motion', weight: 4},
    {needle: 'cycle through phases', weight: 4},
    {needle: 'iterate through', weight: 3},
    {needle: 'iterates through', weight: 3},
    {needle: 'state machine', weight: 3},
    {needle: 'state cycle', weight: 3},
    {needle: 'oscillate', weight: 3},
    {needle: 'thermostat', weight: 3},
    {needle: 'gradient descent', weight: 3},
    {needle: 'how it operates', weight: 3},
    {needle: 'in continuous motion', weight: 4},
    {needle: 'animated mechanism', weight: 4},
    {needle: 'pump', weight: 1},
    {needle: 'engine cycle', weight: 3},
  ],
};

export default mechanismPlugin;
