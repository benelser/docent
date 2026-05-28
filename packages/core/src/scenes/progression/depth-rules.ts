// Depthcheck rules for the `progression` scene.
//
// The v2.5.x engine's depthcheck.ts carries NO progression-specific rules
// (a search for 'progression' across packages/engine/cli/depthcheck.ts
// returns only one hit inside a non-related comment about tree
// degeneracy — "a chain is a list (or a progression), not a hierarchy").
// Progression scenes inherit the film-wide rules (narration-shape, beat-
// cadence, recap discipline) the engine applies across every scene — those
// rules live on the depth-check framework itself, not on individual scene
// plugins.
//
// We declare an EMPTY array so the plugin honors the depthcheck contract
// (every ScenePlugin "must declare" its rules — per the strategy doc
// §11.5, the contract is what enforces quality on the open library) while
// adding no scene-specific rules. If a future build wants a progression-
// specific depth rule (e.g. "every braided flow uses both lanes" or "a
// gate stage carries narration that names the milestone"), this is where
// it lands.

import type {DepthRule} from '@bjelser/kit';

import type {ProgressionScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<ProgressionScene>> = [];

export default depthRules;
