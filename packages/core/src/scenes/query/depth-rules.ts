// Depthcheck rules for the `query` scene.
//
// No scene-specific depth rules at this seam — `query` scenes inherit the
// film-wide rules (narration-shape, beat-cadence, recap discipline) the
// engine applies across every scene. The empty array honors the
// ScenePlugin contract (every scene declares its rules; an empty list is a
// valid honoring) while leaving room for a future rule like "every query
// scene's last beat reveals the full query AND lands a value" — the depth
// bar a real observability lunch-and-learn would want enforced.

import type {DepthRule} from '@bjelser/kit';

import type {QueryScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<QueryScene>> = [];

export default depthRules;
