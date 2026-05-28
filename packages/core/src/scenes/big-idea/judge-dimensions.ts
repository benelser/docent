// big-idea — judge dimensions.
//
// The v2.5.x engine's judge.ts carries no big-idea-specific judge dimension —
// the rhetorical-primitive dimensions in judge.ts (lines 113–116) cover
// epigraph, concession, objection, and provocation, but the big-idea contract
// is enforced entirely by the regex-shaped `big-idea-shape` depth rule
// (≤ 20 words, period, no filler).
//
// We declare an EMPTY array so the plugin honours the contract — every
// ScenePlugin "must declare" its judge dimensions (per the strategy doc
// §11.5: the declaration is the contract; an empty list is a valid
// honouring). If a future build wants a big-idea-specific judge axis (e.g.
// "the takeaway is the FILM'S claim, not a generic platitude that could open
// any deck on the topic"), this is where it lands.

import type {JudgeDimension} from '@bjelser/kit';

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [];

export default judgeDimensions;
