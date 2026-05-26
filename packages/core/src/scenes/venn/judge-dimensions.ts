// judge-dimensions — the judge dimension contributed by the venn scene
// plugin.
//
// MIGRATED from `packages/engine/cli/judge.ts` (v2.5.x) DEPTH_DIMENSIONS.
// The single venn-anchored dimension:
//   - `intersection-named` — when the film carries a venn, the
//                            intersection must name a MECHANISM, not just
//                            assert that the overlap exists. Films with
//                            no venn scene mark this n/a.
//
// Per the strategy doc §4.2: each ScenePlugin contributes its own judge
// dimensions; the engine's `judge` framework aggregates them across
// every registered plugin. The prompt scaffolding the judge sees is the
// `rubric` field; here we port the v2.5.x label into the rubric verbatim
// so the LLM judge gets the same instruction.

import type {JudgeDimension} from '@docent/kit';

/**
 * Intersection named — when the film carries a venn, the intersection
 * must name what the overlap PROVES, not just that the overlap exists.
 * The scene-anchored judgement: did the film argue from the mechanism
 * inside the overlap, or did it merely point to the overlap and call
 * it dangerous?
 */
const intersectionNamed: JudgeDimension = {
  id: 'intersection-named',
  title:
    'Intersection named — the film argues from what the overlap PROVES, not that the overlap exists',
  description:
    'Scene-anchored dimension; only meaningful when the film carries a venn scene. Films with no venn mark this n/a. A pass: the novelty claim names a mechanism inside the overlap. A fail: the claim is evaluative ("dangerous"/"risky") or merely points to the overlap without saying what lives there.',
  rubric:
    'Intersection named — the film argues from what the overlap PROVES, not that the ' +
    'overlap exists. Scene-anchored dimension; only meaningful when the film carries a ' +
    'venn scene. Films with no venn mark this n/a. A pass: the novelty claim names a ' +
    'MECHANISM inside the overlap — e.g. "data + tools + untrusted input exfiltrate ' +
    'because no token carries provenance". A fail: the claim is evaluative ' +
    '("dangerous", "risky", "critical", "important") or merely points to the overlap ' +
    'without saying what lives there or why. The regex floor (Layer 2) catches the ' +
    'verdict-shaped vocabulary; this dimension catches the subtler cases where the ' +
    'claim is technically non-evaluative but still fails to name a mechanism.',
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [
  intersectionNamed,
];

export default judgeDimensions;
