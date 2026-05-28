// Depthcheck rules for the `chart` scene.
//
// The v2.5.x engine's depthcheck.ts carries NO chart-specific rules
// (grepping for 'chart' in packages/engine/cli/depthcheck.ts returns
// nothing). Chart scenes inherit the film-wide rules (narration-shape,
// beat-cadence, claim discipline) the engine applies across every scene —
// those rules live on the depth-check framework itself, not on individual
// scene plugins.
//
// We declare an EMPTY array so the plugin honors the depthcheck contract
// (every ScenePlugin "must declare" its rules — per the strategy doc
// §11.5, the contract is what enforces quality on the open library) while
// adding no scene-specific rules. If a future build wants a chart-specific
// depth rule (e.g. "every chart names what the y-axis is measuring, not
// just `y`"), this is where it lands.

import type {DepthRule} from '@bjelser/kit';

import type {ChartScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<ChartScene>> = [];

export default depthRules;
