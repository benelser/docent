// Depthcheck rules for the `structure` scene.
//
// The v2.5.x engine's depthcheck.ts carries no structure-specific rules.
// Structure scenes inherit the film-wide rules (narration-shape,
// beat-cadence, recap discipline) the engine applies across every scene
// — those rules live on the depth-check framework itself, not on individual
// scene plugins. Structure does participate in the cross-scene compositional
// grammar (the EMBED_ALLOWLIST check, the position contracts that pin
// concession/objection/prior-art relative to the first structure scene),
// but those are film-level concerns enforced by the engine's spec-wide
// validator, not by the structure plugin's own depth rules.
//
// We declare an EMPTY array so the plugin honors the depthcheck contract
// (every ScenePlugin "must declare" its rules — per the strategy doc §11.5)
// while adding no scene-specific rules. If a future build wants a
// structure-specific depth rule (e.g. "every structure narrates the
// relationship the line asserts, not just the existence of the line"),
// this is where it lands.

import type {DepthRule} from '@bjelser/kit';

import type {StructureScene} from './_types';

export const depthRules: ReadonlyArray<DepthRule<StructureScene>> = [];

export default depthRules;
