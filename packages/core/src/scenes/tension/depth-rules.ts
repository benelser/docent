// Depthcheck rules for the `tension` scene.
//
// The v2.5.x engine's depthcheck.ts carries several tension-related rules —
// `tension-scene` (does the FILM contain at least one tension?),
// `risk-node` (PR films must surface ≥ 1 risk node anywhere in the film),
// `adjudication` (the verdict text adjudicates rather than recaps),
// `tradeoff` and `scorecard` (AR/explainer films name a trade-off and an
// honest closing fragility). All of these are FILM-WIDE rules: they look at
// the whole spec (`spec.scenes.filter(sc => sc.type === 'tension')`,
// `narrationOf(tensions)`, …), not at a single tension scene in isolation.
//
// Per the strategy doc §11.5, per-scene depth rules ride with the scene
// plugin; FILM-wide rules live on the depthcheck framework itself (or on a
// chrome/feature plugin once the framework registry is in place). The
// tension plugin therefore declares an EMPTY scene-local depth rules array
// — the film-wide rules continue to apply at the cascade level.
//
// If a future build wants a tension-specific scene-local rule (e.g. "a
// tension scene with > 4 nodes loses legibility"), this is where it lands.

import type {DepthRule} from '@docent/kit';

import type {TensionScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<TensionScene>> = [];

export default depthRules;
