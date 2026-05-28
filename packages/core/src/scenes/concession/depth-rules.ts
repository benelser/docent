// Depth rules contributed by the `concession` scene.
//
// concession-non-trivial — outOfScope must be ≥ 2 items (the structural
// validator catches less than 2) AND must NOT be tautological. A
// tautological set-aside is one of the regex-shaped fillers that drains
// the concession of meaning ("not relevant", "out of scope", "anything
// else"). Short items below ~3 words read as labels not boundaries.
//
// Mirrors the `concession-non-trivial` rule in
// packages/engine/cli/depthcheck.ts (v2.5.x, around line 701). The
// structural validator owns the ≥ 2 hard-fail; this depth rule layers the
// tautology + short-item checks as a depth signal AND repeats the
// count check so the `docent depthcheck` report carries the full picture
// in a single rule.

import type {DepthFinding, DepthRule} from '@bjelser/kit';

import type {ConcessionScene} from './validate';

// Tautological / filler patterns — each is a phrase that says "I am
// setting aside the things I am setting aside", not a concrete boundary
// line. The strong version names what is left out by NAME.
const TAUTOLOGICAL =
  /^\s*(not\s+(relevant|relevant\s+here|in\s+scope|covered|discussed)|out\s+of\s+scope|anything\s+else|other\s+things|the\s+rest|everything\s+else|nothing\s+else|miscellaneous)\.?\s*$/i;

// Short items below ~3 words read as labels not boundaries.
const SHORT_LIMIT = 3;

const concessionNonTrivial: DepthRule<ConcessionScene> = {
  id: 'concession-non-trivial',
  description:
    'Concession non-trivial — at least 2 outOfScope items, none tautological ("not relevant" fails; "historical OS forks before 2018" passes)',
  severity: 'error',
  scope: 'scene',
  check(scene, ctx): DepthFinding | null {
    const out = scene.outOfScope ?? [];
    const tautologicalItems = out.filter(
      (s) => typeof s === 'string' && TAUTOLOGICAL.test(s),
    );
    const shortItems = out.filter(
      (s) =>
        typeof s === 'string' &&
        s.trim().split(/\s+/).filter(Boolean).length < SHORT_LIMIT,
    );
    const ok =
      out.length >= 2 && tautologicalItems.length === 0 && shortItems.length === 0;
    if (ok) return null;

    const pathPrefix =
      ctx.sceneIndex !== undefined
        ? `scenes[${ctx.sceneIndex}].outOfScope`
        : 'concession.outOfScope';

    const message =
      out.length < 2
        ? `only ${out.length} out-of-scope item(s) — a single set-aside is a footnote; the cut needs to be visible as a cut`
        : tautologicalItems.length > 0
          ? `tautological item(s): ${tautologicalItems.map((x) => `"${x}"`).join(', ')} — name what is left out by NAME (e.g. "historical OS forks before 2018")`
          : `item(s) shorter than ${SHORT_LIMIT} words: ${shortItems.map((x) => `"${x}"`).join(', ')} — a boundary needs more than a label`;

    return {
      ruleId: 'concession-non-trivial',
      path: pathPrefix,
      message,
      severity: 'error',
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<ConcessionScene>> = [
  concessionNonTrivial,
];

export default depthRules;
