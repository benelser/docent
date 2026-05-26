// depth-rules — the venn depth contract.
//
// MIGRATED from `packages/engine/cli/depthcheck.ts` (v2.5.x) — the
// `const venns = spec.scenes.filter((sc) => sc.type === 'venn')` block.
// Behaviour preserved: same rule id (`intersection-honest`), same label,
// same regex (EVALUATIVE_INTERSECTION).
//
// One scene-scoped rule (runs on every `venn` scene; the engine's
// depthcheck aggregator dispatches by `scope: 'scene'`):
//   - `intersection-honest` — the venn claim names what the overlap
//                              PROVES, not that the overlap is "dangerous"/
//                              "risky"/etc. (the verdict-shaped vocabulary
//                              that betrays an evaluation instead of a
//                              mechanism inside the overlap).

import type {DepthRule} from '@docent/kit';

import type {VennScene} from './validate';

/**
 * Reject evaluative venn-intersection claims — the trap parallel to
 * EVALUATIVE_NOVELTY in prior-art. "the overlap is dangerous" / "this
 * combination is risky" is a FAIL (an evaluation of the overlap); "data
 * plus tools plus untrusted input exfiltrate because no token carries
 * provenance" is a PASS (the mechanism the intersection PROVES). The
 * claim must name what lives in the overlap and why, not deliver a
 * verdict about its character.
 *
 * Verbatim from `packages/engine/cli/depthcheck.ts`.
 */
const EVALUATIVE_INTERSECTION =
  /\b(dangerous|risky|unsafe|safe|bad|good|catastrophic|harmful|terrible|important|crucial|critical|fascinating|interesting)\b/i;

/**
 * Intersection honest — the venn claim names what the overlap PROVES,
 * not that the overlap is "dangerous"/"risky". Like EVALUATIVE_NOVELTY
 * for prior-art, this is a regex floor: it catches the verdict-shaped
 * vocabulary that betrays an evaluation about the intersection instead
 * of a mechanism inside it. The judge (Layer 3) catches the subtle cases
 * this regex cannot.
 */
const intersectionHonest: DepthRule<VennScene> = {
  id: 'intersection-honest',
  description:
    'Intersection honest — the venn claim names what the overlap PROVES, not that the overlap is "dangerous"/"risky"',
  severity: 'error',
  scope: 'scene',
  check(scene, ctx) {
    if (scene.type !== 'venn') return null;
    const claim = (scene.novelty?.claim ?? '').trim();
    const evaluative = EVALUATIVE_INTERSECTION.test(claim);
    if (claim && !evaluative) return null;
    return {
      ruleId: 'intersection-honest',
      path: `scenes[${ctx.sceneIndex ?? '?'}].novelty.claim`,
      severity: 'error',
      message: !claim
        ? 'venn scene has an empty novelty claim'
        : `claim reads as evaluative ("dangerous"/"risky"/etc.) — restate as a mechanism: what lives ONLY in the intersection and WHY`,
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<VennScene>> = [
  intersectionHonest,
];

export default depthRules;
