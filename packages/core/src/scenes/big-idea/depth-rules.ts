// big-idea — depth rules.
//
// `big-idea-shape` — the takeaway sentence must honour the rigid contract:
// ≤ 20 words, ends with a period, must not start with 'This is' / 'It is'
// (a filler opening). The contract is what gives the scene its weight — a
// 40-word sentence with no closing period is a summary, not a takeaway.
//
// The film-wide "exactly one big-idea per explainer" rule is enforced by
// the engine's film-level depthcheck (it depends on `meta.prompt` to detect
// explainer mode and on the presence/absence of a `provocation` scene to
// know whether the big-idea is required). This file carries only the
// per-scene SHAPE check: any big-idea scene that exists must honour the
// contract, regardless of mode.
//
// Migrated from `packages/engine/cli/depthcheck.ts` — the `big-idea-shape`
// finding inside the `big-idea contract` block (lines 810–848). The
// grandfathered-films exemption stays at the film level (it's a meta-id
// allowlist, not a per-scene check).

import type {DepthFinding, DepthRule} from '@bjelser/kit';

import type {BigIdeaScene} from './validate';

// The filler-opening regex mirrors the v2.5.x engine's `BIG_IDEA_FILLER`
// (depthcheck.ts line 202). A statement that opens with 'This is' or 'It is'
// reads as a filler — a takeaway must commit, not introduce.
const BIG_IDEA_FILLER = /^\s*(this is|it is)\b/i;

const bigIdeaShape: DepthRule<BigIdeaScene> = {
  id: 'big-idea-shape',
  description:
    "Big Idea — one sentence (≤ 20 words), ends with a period, no filler opening ('This is' / 'It is')",
  severity: 'error',
  scope: 'scene',
  check(scene, ctx): DepthFinding | null {
    const path =
      ctx.sceneIndex !== undefined
        ? `scenes[${ctx.sceneIndex}].statement`
        : 'scenes[*].statement';

    const statement = (scene.statement ?? '').trim();
    const words = statement.split(/\s+/).filter(Boolean).length;
    const endsWithPeriod = /\.$/.test(statement);
    const filler = BIG_IDEA_FILLER.test(statement);
    const ok = statement.length > 0 && words <= 20 && endsWithPeriod && !filler;

    if (ok) return null;

    const reasons: string[] = [];
    if (!statement) reasons.push('statement is empty');
    if (words > 20) reasons.push(`${words} words (> 20)`);
    if (!endsWithPeriod) reasons.push('statement does not end with a period');
    if (filler) {
      reasons.push("statement starts with 'This is' / 'It is' — a filler opening");
    }

    return {
      ruleId: 'big-idea-shape',
      path,
      message: `the big-idea sentence fails the contract: ${reasons.join('; ')}`,
      severity: 'error',
      suggestion:
        'Rewrite as ONE sentence ≤ 20 words ending with a period. Commit to the claim — drop "This is" / "It is" leads; name the takeaway directly.',
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<BigIdeaScene>> = [bigIdeaShape];

export default depthRules;
