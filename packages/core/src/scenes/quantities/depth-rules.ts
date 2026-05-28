// Depth rules contributed by the `quantities` scene type.
//
// MIGRATED from `packages/engine/cli/depthcheck.ts`. As of v2.5.x, the
// depthcheck pass had NO quantities-specific rules — the quantified-claim
// depth bar was enforced at the film level (the "every film earns its keep
// with a quantified claim" rule), not the scene level. The array is
// intentionally empty in v1; future quantities-specific rules (e.g. "every
// metric must be reached by at least one beat's `set` directive") slot in
// here without touching the protocol.

import type {DepthRule, Scene} from '@bjelser/kit';

export const depthRules: ReadonlyArray<DepthRule<Scene>> = [];

export default depthRules;
