// Depthcheck rules for the `live-browser` scene.
//
// Empty for v1. A `live-browser` scene's "depth" lives at the cascade
// boundary — was the capture FRESH (against running infrastructure) or
// did it short-circuit to a cached clip whose underlying URL hasn't been
// validated? That's a build-stage concern surfaced by the
// `live-capture-stage`'s manifest, not a depthcheck rule.
//
// A future depth rule worth landing: "every action in `actions[]` advances
// the visible state of the page" — i.e. flag a script that's a long
// `wait` followed by one `screenshot` (a passive recording dressed up as
// computer use). The signal would have to come from the captured clip's
// per-frame diff, not the spec, so it lives downstream of the recorder.

import type {DepthRule} from '@bjelser/kit';

import type {LiveBrowserScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<LiveBrowserScene>> = [];

export default depthRules;
