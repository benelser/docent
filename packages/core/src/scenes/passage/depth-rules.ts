// Depthcheck rules for the `passage` scene.
//
// The v2.5.x engine's depthcheck.ts carries NO passage-specific rules
// (search for 'passage' in packages/engine/cli/depthcheck.ts returns
// only one unrelated hit inside the epigraph-on-point rule comment).
// Passage scenes inherit the film-wide rules (narration-shape,
// beat-cadence, recap discipline) the engine applies across every scene
// — those rules live on the depth-check framework itself, not on
// individual scene plugins.
//
// We declare an EMPTY array so the plugin honors the depthcheck
// contract (every ScenePlugin "must declare" its rules — per the
// strategy doc §11.5, the contract is what enforces quality on the
// open library) while adding no scene-specific rules. If a future
// build wants a passage-specific depth rule (e.g. "every mark earns
// its highlight — the note adds substance the quote does not already
// carry"), this is where it lands.

import type {DepthRule} from '@bjelser/kit';

import type {PassageScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<PassageScene>> = [];

export default depthRules;
