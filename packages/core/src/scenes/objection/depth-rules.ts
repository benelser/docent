// Depth rules contributed by the `objection` scene.
//
// objection-steelmanned — the objection must be ≥ 12 words AND not
// evaluative, AND the refutationStrength must match the refutation's
// rhetorical force. The structural validator owns the hard-fail; this
// depth rule layers the same checks as a depth signal (the structural
// rule HARD-FAILs; the depth rule SURFACES the same failure for the
// `docent depthcheck` report).
//
// Mirrors the `objection-steelmanned` rule in
// packages/engine/cli/depthcheck.ts (v2.5.x, around line 734).

import type {DepthFinding, DepthRule} from '@bjelser/kit';

import type {ObjectionSpec} from './component';

// The strong-version contract: the objection cites a MECHANISM
// (under-states / cost / fails / under-counts / overstates etc.), not
// a verdict adjective.
const EVALUATIVE_OBJECTION =
  /\b(weak|bad|wrong|naive|simplistic|unconvincing|flawed|inadequate|insufficient|incorrect|fragile|untenable)\b/i;

const MECHANISM_HANDLE =
  /\b(under[- ]?state|under[- ]?count|over[- ]?state|over[- ]?fit|miss(es)?|ignore|ignores|ignored|skip|elide|under[- ]?model|cost|trade[- ]?off|fails? to|cannot account|does not account|breaks? down|assumes?|conflates?|inflates?|deflates?|reduces?|collapses?|over[- ]?counts?|under[- ]?counts?|over[- ]?simplifies?|treats? as|equates? with|category error|status|substitutes? for|relies on|depends on|cannot|never)\b/i;

// partial refutation must visibly carry a concession word.
const HONESTY =
  /\b(partly|partial|to an extent|in part|some of this|this is true|grants?|concedes?|conceding|admit|admittedly|fair point|the objection holds|the critic is right|to that extent|insofar as)\b/i;

const objectionSteelmanned: DepthRule<ObjectionSpec> = {
  id: 'objection-steelmanned',
  description:
    "Objection steelmanned — ≥ 12 words, cites a mechanism (not an evaluative adjective), refutationStrength matches the refutation's force",
  severity: 'error',
  scope: 'scene',
  check(scene, ctx): DepthFinding | null {
    const objection = (scene.objection ?? '').trim();
    const refutation = (scene.refutation ?? '').trim();
    const strength = scene.refutationStrength;
    const words = objection.split(/\s+/).filter(Boolean).length;

    const wordsOk = words >= 12;
    const mechanismOk =
      MECHANISM_HANDLE.test(objection) && !EVALUATIVE_OBJECTION.test(objection);
    const strengthMatches =
      strength === 'full'
        ? true
        : strength === 'partial'
          ? HONESTY.test(refutation)
          : false;

    const ok = wordsOk && mechanismOk && strengthMatches;
    if (ok) return null;

    const pathPrefix =
      ctx.sceneIndex !== undefined ? `scenes[${ctx.sceneIndex}]` : 'objection';

    const message = !wordsOk
      ? `objection is ${words} words — a steelman is ≥ 12; shorter is a slogan`
      : !mechanismOk
        ? 'objection reads as evaluative ("this argument is weak") — restate as a mechanism the objection cites (under-states cost X, misses failure-mode Y)'
        : 'refutationStrength is "partial" but the refutation reads as full — name what the objection gets right (use "partly", "in part", "concede") or set refutationStrength to "full"';

    return {
      ruleId: 'objection-steelmanned',
      path: pathPrefix,
      message,
      severity: 'error',
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<ObjectionSpec>> = [
  objectionSteelmanned,
];

export default depthRules;
