// Per-scene structural validator for `objection`.
//
// objection is the rhetorical scene where the film argues against itself,
// then refutes. The validation contract mirrors the `objection`-specific
// block in packages/engine/cli/validate.ts (v2.5.x, around line 2368):
//
//   - `claim` must be a non-empty string (what the film has been arguing).
//   - `objection` must be a non-empty string AND ≥ 12 words AND not
//     evaluative ("this argument is weak"). A steelman cites a MECHANISM
//     the objection points to, not a verdict adjective about the argument.
//   - `refutation` must be a non-empty string (the film's response).
//   - `refutationStrength` must be 'partial' or 'full'. When 'partial', the
//     refutation must visibly carry a concession marker (partly, in part,
//     concede, to that extent, …) — a film that says `partial` but writes a
//     complete rebuttal is being dishonest about its own concession.
//   - `evidence` (optional) must be an array of non-empty strings.
//
// Film-level cross-scene ordering (objection must sit AFTER at least one
// claim scene and BEFORE the closing recap/big-idea/provocation) is owned
// by the kit's cross-scene validator and is not duplicated here.

import type {SceneIssue, SceneValidationContext} from '@bjelser/kit';

import type {ObjectionSpec} from './component';

// Evaluative-shape rejection — the strong-version contract: the objection
// must say WHAT is wrong, mechanistically, not deliver a verdict about the
// argument's character. Same regex shape as `EVALUATIVE_NOVELTY` in the
// engine's depthcheck.
const EVALUATIVE_OBJECTION =
  /^\s*(this|the)\s+(argument|claim|paper|film|case|view|analysis|approach|design|system|review)\s+(is|seems|appears|reads as|feels|comes across as|sounds)\s+(weak|bad|wrong|unconvincing|flawed|broken|broken|naive|simplistic|incorrect|fragile|untenable|inadequate|insufficient)\b/i;

// A `partial` refutation must visibly carry a concession word — a film that
// says `partial` but writes a complete refutation is being dishonest about
// its own concession.
const HONESTY =
  /\b(partly|partial|to an extent|in part|some of this|this is true|grants?|concedes?|conceding|admit|admittedly|fair point|the objection holds|the critic is right|to that extent|insofar as)\b/i;

export function validate(
  scene: ObjectionSpec,
  _ctx: SceneValidationContext,
): SceneIssue[] {
  const issues: SceneIssue[] = [];

  if (typeof scene.claim !== 'string' || !scene.claim.trim()) {
    issues.push({
      path: 'claim',
      message:
        'objection requires a non-empty claim — what the film has been arguing',
      severity: 'error',
      code: 'objection.claim.required',
    });
  }

  if (typeof scene.objection !== 'string' || !scene.objection.trim()) {
    issues.push({
      path: 'objection',
      message:
        'objection requires a non-empty objection — the steelman against the claim',
      severity: 'error',
      code: 'objection.objection.required',
    });
  } else {
    const words = scene.objection.trim().split(/\s+/).filter(Boolean).length;
    if (words < 12) {
      issues.push({
        path: 'objection',
        message: `the objection is ${words} words — a steelmanned objection is at least 12 words; shorter is a slogan, not a counterargument`,
        severity: 'error',
        code: 'objection.objection.too-short',
      });
    }
    if (EVALUATIVE_OBJECTION.test(scene.objection)) {
      issues.push({
        path: 'objection',
        message:
          'the objection reads as evaluative ("this argument is weak") — restate as a mechanism the objection cites (e.g. "the argument under-states the cost of cluster-wide synchronization in production")',
        severity: 'error',
        code: 'objection.objection.evaluative',
      });
    }
  }

  if (typeof scene.refutation !== 'string' || !scene.refutation.trim()) {
    issues.push({
      path: 'refutation',
      message:
        "objection requires a non-empty refutation — the film's response",
      severity: 'error',
      code: 'objection.refutation.required',
    });
  }

  if (
    scene.refutationStrength !== 'partial' &&
    scene.refutationStrength !== 'full'
  ) {
    issues.push({
      path: 'refutationStrength',
      message:
        'refutationStrength must be "partial" (admits the objection partly holds) or "full"',
      severity: 'error',
      code: 'objection.refutationStrength.invalid',
    });
  } else if (
    scene.refutationStrength === 'partial' &&
    typeof scene.refutation === 'string' &&
    scene.refutation.trim().length > 0
  ) {
    if (!HONESTY.test(scene.refutation)) {
      issues.push({
        path: 'refutation',
        message:
          'refutationStrength is "partial" but the refutation reads as a full rebuttal — name what the objection gets RIGHT (use "partly", "in part", "concede", "to that extent") or set refutationStrength to "full"',
        severity: 'error',
        code: 'objection.refutation.partial-not-honest',
      });
    }
  }

  if (scene.evidence !== undefined) {
    if (!Array.isArray(scene.evidence)) {
      issues.push({
        path: 'evidence',
        message: 'evidence must be an array of non-empty strings',
        severity: 'error',
        code: 'objection.evidence.invalid',
      });
    } else {
      scene.evidence.forEach((e: unknown, k: number) => {
        if (typeof e !== 'string' || !e.trim()) {
          issues.push({
            path: `evidence[${k}]`,
            message: 'evidence item must be a non-empty string',
            severity: 'error',
            code: 'objection.evidence.item-empty',
          });
        }
      });
    }
  }

  return issues;
}

export default validate;
