// Depthcheck rules for the `demonstrate` scene.
//
// The v2.5.x engine's depthcheck.ts carries NO demonstrate-specific
// rules — demonstrate scenes inherit the film-wide rules
// (narration-shape, beat-cadence, recap discipline) the engine applies
// across every scene. Those rules live on the depth-check framework
// itself, not on individual scene plugins.
//
// We declare an EMPTY array so the plugin honors the depthcheck
// contract (every ScenePlugin "must declare" its rules — per the
// strategy doc §11.5, the contract is what enforces quality on the open
// library) while adding no scene-specific rules. If a future build
// wants a demonstrate-specific depth rule (e.g. "the narration
// describes what the viewer is seeing, not what they should infer"),
// this is where it lands.

import type {DepthRule} from '@bjelser/kit';

import type {DemonstrateScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<DemonstrateScene>> = [];

export default depthRules;
