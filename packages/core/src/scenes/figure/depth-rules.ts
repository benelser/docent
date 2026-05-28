// Depthcheck rules for the `figure` scene.
//
// The v2.5.x engine's depthcheck.ts carries NO figure-specific rules. The
// only `figure`-adjacent hit in depthcheck.ts (line 122) reads
// `e?.figures` — that's the `quantities` scene's array of figure cards,
// not this scene type. Figure scenes inherit the film-wide rules
// (narration-shape, beat-cadence, recap discipline) the engine applies
// across every scene — those rules live on the depth-check framework
// itself, not on individual scene plugins.
//
// We declare an EMPTY array so the plugin honors the depthcheck contract
// (every ScenePlugin "must declare" its rules — per the strategy doc
// §11.5, the contract is what enforces quality on the open library) while
// adding no scene-specific rules. If a future build wants a
// figure-specific depth rule (e.g. "every callout note is anchored to a
// region the eye can find", or "no figure dwells on the image alone —
// the callouts must do work"), this is where it lands.

import type {DepthRule} from '@bjelser/kit';

import type {FigureScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<FigureScene>> = [];

export default depthRules;
