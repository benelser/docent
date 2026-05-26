// Depthcheck rules for the `probe` scene.
//
// The v2.5.x engine's depthcheck.ts carries NO probe-specific rules
// (search for 'probe' in packages/engine/cli/depthcheck.ts returns no
// hits). Probe scenes inherit the film-wide rules (narration-shape,
// beat-cadence, recap discipline) the engine applies across every scene —
// those rules live on the depth-check framework itself, not on individual
// scene plugins.
//
// We declare an EMPTY array so the plugin honors the depthcheck contract
// (every ScenePlugin "must declare" its rules — per the strategy doc
// §11.5, the contract is what enforces quality on the open library) while
// adding no scene-specific rules. If a future build wants a probe-specific
// depth rule (e.g. "at least one variation must `flip`, so the probe
// surfaces a genuine sensitivity, not a no-op sweep"), this is where it
// lands.

import type {DepthRule} from '@docent/kit';

import type {ProbeScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<ProbeScene>> = [];

export default depthRules;
