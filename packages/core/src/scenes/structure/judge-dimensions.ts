// Judge dimensions for the `structure` scene.
//
// The v2.5.x engine's judge.ts carries no structure-specific judge
// dimensions. The judge surface today is film-wide: the LLM grader weighs
// the whole film against the survey-template depth bar, with structure
// scenes counted in the same rubric as every other scene type.
//
// We declare an EMPTY array so the plugin honors the contract (per the
// strategy doc §11.5: every scene declares its judge dimensions — that
// declaration is the contract; an empty list is a valid honoring) while
// adding no scene-specific dimensions. If a future build wants a
// structure-specific judge axis (e.g. "every edge's kind matches the
// rhetorical move the narration makes — a `causes` edge narrates causation,
// an `entails` edge narrates necessity"), this is where it lands.

import type {JudgeDimension} from '@bjelser/kit';

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [];

export default judgeDimensions;
