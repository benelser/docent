// @docent/core — `journey-map` scene plugin.
//
// The UX/service-design move: a person's emotional arc across 3-8 stages.
// Cluster: `experience` (the human's felt path through a system, not its
// connectivity / its timeline / its categorisation).
//
// Migrated from packages/engine/src/scenes/JourneyMapScene.tsx as part of
// the v3.0 plugin-architecture rip-and-replace. See ./component.tsx for
// the renderer, ./schema.ts for the spec branch, ./validate.ts for the
// structural validator, ./depth-rules.ts for the two cross-scene depth
// findings (`journey-asymmetric`, `journey-specifics`), and
// ./judge-dimensions.ts for the `experience-is-load-bearing` judge axis.

import type {ScenePlugin} from '@docent/kit';

import {JourneyMapSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {JourneyMapScene} from './validate';
import {validate} from './validate';

export const journeyMapPlugin: ScenePlugin<JourneyMapScene> = {
  kind: 'scene',
  name: 'journey-map',
  version: '1.0.0',
  sceneType: 'journey-map',
  cluster: 'experience',
  schema,
  component: JourneyMapSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — journey-map narrates over the arc
  // at beat granularity; word-level alignment is not required.
};

export type {JourneyEmotion, JourneyMapScene, JourneyStage} from './validate';
export default journeyMapPlugin;
