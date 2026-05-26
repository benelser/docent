// Depthcheck rules for the `diff` scene.
//
// The v2.5.x engine's depthcheck.ts carries NO diff-specific rules (search
// for 'diff' in packages/engine/cli/depthcheck.ts returns only one hit
// inside a non-related comment). Diff scenes inherit the film-wide rules
// (narration-shape, beat-cadence, recap discipline) the engine applies
// across every scene — those rules live on the depth-check framework
// itself, not on individual scene plugins.
//
// We declare an EMPTY array so the plugin honors the depthcheck contract
// (every ScenePlugin "must declare" its rules — per the strategy doc
// §11.5, the contract is what enforces quality on the open library) while
// adding no scene-specific rules. If a future build wants a diff-specific
// depth rule (e.g. "every diff narrates the ripple, not just the change"),
// this is where it lands.

import type {DepthRule} from '@docent/kit';

import type {DiffScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<DiffScene>> = [];

export default depthRules;
