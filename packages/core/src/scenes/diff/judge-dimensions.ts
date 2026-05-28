// Judge dimensions for the `diff` scene.
//
// The v2.5.x engine's judge.ts carries no diff-specific judge dimensions.
// The judge surface today is film-wide: the LLM grader weighs the whole
// film against the survey-template depth bar, with diff scenes counted in
// the same rubric as every other scene type.
//
// We declare an EMPTY array so the plugin honors the contract (per the
// strategy doc §11.5: every scene declares its judge dimensions — that
// declaration is the contract; an empty list is a valid honoring) while
// adding no scene-specific dimensions. If a future build wants a
// diff-specific judge axis (e.g. "the before→after isolates the
// load-bearing change, not the noise"), this is where it lands.

import type {JudgeDimension} from '@bjelser/kit';

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [];

export default judgeDimensions;
