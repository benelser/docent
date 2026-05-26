// Judge dimensions for the `frame` scene.
//
// The v2.5.x engine's judge.ts carries no frame-specific judge dimensions.
// The frame is chrome (cluster: null) — it sets up the subject but
// performs no cognitive move, so the judge's per-scene rubrics
// (the cognitive cluster move's quality) do not apply to it. The judge
// surface today is film-wide: the LLM grader weighs the whole film
// against the survey-template depth bar.
//
// We declare an EMPTY array so the plugin honors the contract (per
// strategy doc §11.5: every scene declares its judge dimensions — the
// declaration is the contract; an empty list is a valid honoring) while
// adding no scene-specific dimensions. If a future build wants a frame-
// specific judge axis (e.g. "the title earns the cognitive scenes that
// follow"), this is where it lands.

import type {JudgeDimension} from '@docent/kit';

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [];

export default judgeDimensions;
