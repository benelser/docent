// Depthcheck rules for the `waterfall` scene.
//
// Empty — we honor the depthcheck contract (every ScenePlugin declares its
// rules) without adding scene-specific rules in v1. Future work could add:
//   - "a waterfall with one focus beat must surface the focused span's
//     attributes — a focus without an attributes panel is a wasted move"
//   - "a waterfall earns its keep with at least one error or
//     hallucination_flag — a happy-path waterfall is decorative"
// Those land here when authored films justify them.

import type {DepthRule} from '@bjelser/kit';

import type {WaterfallScene} from './validate';

export const depthRules: ReadonlyArray<DepthRule<WaterfallScene>> = [];

export default depthRules;
