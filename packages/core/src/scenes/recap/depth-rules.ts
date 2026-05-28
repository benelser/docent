// Depthcheck rules for the `recap` scene.
//
// The v2.5.x engine's depthcheck.ts carries NO recap-specific scene
// rules — the only mention (line 290) is the FILM-wide "honest closing
// scorecard" rule that scans the LAST recap-or-tension scene's
// narration for a named fragility (the SCORECARD regex on narrationOf).
// That rule lives on the depth-check framework itself, not on this
// per-scene plugin, because it reasons across the WHOLE film (which
// scene is the closer) — it cannot run as a per-scene rule with only a
// recap scene in hand.
//
// Position contracts that involve `recap` (must be the last scene in an
// explainer; the big-idea sits immediately before it; objection must
// precede the recap) are likewise film-wide structural rules enforced
// by the engine's spec-level validator, not per-scene depth rules.
//
// We declare an EMPTY array so the plugin honors the depthcheck
// contract (per the strategy doc §11.5, every scene declares its rules)
// while adding no scene-specific rules. If a future build wants a
// recap-specific depth rule (e.g. "every point reads as a synthesis,
// not a restatement"), this is where it lands.

import type {DepthRule} from '@bjelser/kit';

import type {RecapScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<RecapScene>> = [];

export default depthRules;
