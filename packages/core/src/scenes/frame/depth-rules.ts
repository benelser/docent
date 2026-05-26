// Depthcheck rules for the `frame` scene.
//
// The v2.5.x engine's depthcheck.ts carries NO frame-specific rules. The
// frame is a chrome scene (cluster: null) — it brackets the film but
// performs no cognitive move, so the depth bar (one idea per scene, the
// interrogation the survey templates enforce) does not apply to it.
// Film-wide rules (narration-shape, beat-cadence, scene-position
// contracts) live on the depthcheck framework itself, not on the frame
// plugin.
//
// We declare an EMPTY array so the plugin honors the depthcheck contract
// (per strategy doc §11.5: every scene declares its depth rules — the
// declaration is the contract; an empty list is a valid honoring) while
// adding no scene-specific rules. If a future build wants a frame-
// specific depth rule (e.g. "every frame title states the subject in
// fewer than 8 words"), this is where it lands.

import type {DepthRule} from '@docent/kit';

import type {FrameScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<FrameScene>> = [];

export default depthRules;
