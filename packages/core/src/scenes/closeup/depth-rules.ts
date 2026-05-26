// Depthcheck rules for the `closeup` scene.
//
// The v2.5.x engine's depthcheck.ts carries NO closeup-specific rules
// (grep for 'closeup' in packages/engine/cli/depthcheck.ts returns no
// hits). Closeup scenes inherit the film-wide rules (narration-shape,
// beat-cadence, recap discipline) the engine applies across every scene
// — those rules live on the depth-check framework itself, not on
// individual scene plugins.
//
// We declare an EMPTY array so the plugin honors the depthcheck contract
// (every ScenePlugin "must declare" its rules — per the strategy doc
// §11.5, the contract is what enforces quality on the open library)
// while adding no scene-specific rules. If a future build wants a
// closeup-specific depth rule (e.g. "every closeup highlights at least
// one line range — narration without a spotlight is a tour, not a
// review"), this is where it lands.

import type {DepthRule} from '@docent/kit';

import type {CloseupScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<CloseupScene>> = [];

export default depthRules;
