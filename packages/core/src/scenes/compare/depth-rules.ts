// Depthcheck rules for the `compare` scene.
//
// The v2.5.x engine's depthcheck.ts carries NO compare-specific depth
// rules. compare scenes inherit the film-wide rules (narration shape,
// beat cadence, recap discipline, embed-load-bearing) the engine
// applies across every scene — those rules live on the depth-check
// framework itself, not on individual scene plugins.
//
// The closest thing to a compare-specific depth check in v2.5.x is the
// `embed-load-bearing` rule, which fires film-wide whenever a scene
// carries an `embed` (in any host: landscape, timeline, journey-map,
// tree, structure, OR compare) and no beat narrates the embed's
// slot/inner ids. That rule lives on the central framework (see
// packages/engine/cli/depthcheck.ts:collectEmbeds, which already walks
// compare.rows[].cells[].embed).
//
// We declare an EMPTY array so the plugin honors the depthcheck contract
// (per the strategy doc §11.5: every scene declares its depth rules —
// that declaration is the contract; an empty list is a valid honoring)
// while adding no scene-specific rules. If a future build wants a
// compare-specific depth rule (e.g. "every compare scene names ONE
// winning column in the narration, not three"), this is where it lands.

import type {DepthRule} from '@docent/kit';

import type {CompareScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<CompareScene>> = [];

export default depthRules;
