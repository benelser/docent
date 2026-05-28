// Judge dimensions for the `tension` scene.
//
// The v2.5.x engine's judge.ts carries no tension-specific judge dimensions
// (a grep over packages/engine/cli/judge.ts for 'tension' returns nothing).
// The judge surface is film-wide: the LLM grader weighs the whole film
// against the survey-template depth bar, with tension scenes counted into
// the same rubric as every other scene type.
//
// We declare an EMPTY array so the plugin honors the contract (per the
// strategy doc §11.5: every scene declares its judge dimensions — that
// declaration is the contract; an empty list is a valid honoring) while
// adding no scene-specific dimensions. If a future build wants a tension-
// specific judge axis (e.g. "the verdict adjudicates — names a disposition
// and a residual risk"), this is where it lands.

import type {JudgeDimension} from '@bjelser/kit';

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [];

export default judgeDimensions;
