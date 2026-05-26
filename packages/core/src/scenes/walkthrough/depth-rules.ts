// Depthcheck rules for the `walkthrough` scene.
//
// The v2.5.x engine's depthcheck.ts carries NO walkthrough-specific
// rules (grep `walkthrough` in packages/engine/cli/depthcheck.ts returns
// nothing). Walkthrough scenes inherit the film-wide rules
// (narration-shape, beat-cadence, recap discipline) the engine applies
// across every scene — those rules live on the depthcheck framework
// itself, not on individual scene plugins.
//
// We declare an EMPTY array so the plugin honors the depthcheck contract
// (every ScenePlugin "must declare" its rules — per the strategy doc
// §11.5, the contract is what enforces quality on the open library)
// while adding no scene-specific rules. If a future build wants a
// walkthrough-specific depth rule (e.g. "every walkthrough surfaces a
// reply, not just a forward chain"), this is where it lands.

import type {DepthRule} from '@docent/kit';

import type {WalkthroughScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<WalkthroughScene>> = [];

export default depthRules;
