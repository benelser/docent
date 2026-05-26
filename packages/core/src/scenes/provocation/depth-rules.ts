// Depth rules contributed by the `provocation` scene.
//
// `provocation-specific` — the unresolved must be a SPECIFIC question, not
// a vague gesture. Filler patterns ("more research is needed", "future
// work", "this needs more study") are rejected. The strong version reads
// as a question (opens with an interrogative — Whether/How/Why/What/Under
// what/To what extent) and is ≥ 8 words; a shorter or non-question-shaped
// unresolved is a gesture rather than a real handed-off problem.
//
// Mirrors the `provocation-specific` rule in
// packages/engine/cli/depthcheck.ts (v2.5.x, around line 776).
//
// The big-idea mutual-exclusion contract (a provocation film is exempt
// from the big-idea requirement) is a FILM-LEVEL rule that belongs to the
// big-idea plugin / the kit's cross-scene depthcheck framework, not to
// this scene plugin. We do NOT duplicate it here.

import type {DepthFinding, DepthRule} from '@docent/kit';

import type {ProvocationScene} from './validate';

// Filler patterns — each is a gesture, not a question. The strong version
// names a specific operationally-shaped question.
const FILLER =
  /^(more\s+research|future\s+work|this\s+(needs|requires|deserves|merits)|further\s+(work|study|investigation)|the\s+jury\s+is\s+still\s+out|time\s+will\s+tell|we\s+(don'?t|do\s+not)\s+(know|yet|fully)\s*$|stay\s+tuned|watch\s+this\s+space|to\s+be\s+continued|tbd|tbc)/i;

// A specific question reads as a question — opens with an interrogative or
// names a specific subject of the unresolved.
const QUESTION_SHAPE =
  /^(whether|how|why|what|when|where|which|under what|to what extent|by how much|at what scale|in which|in what)\b/i;

const provocationSpecific: DepthRule<ProvocationScene> = {
  id: 'provocation-specific',
  description:
    'Provocation specific — the unresolved is a SPECIFIC question ("Whether X under Y" passes; "More research is needed" fails)',
  severity: 'error',
  scope: 'scene',
  check(scene, ctx): DepthFinding | null {
    const unresolved = (scene.unresolved ?? '').trim();
    const isFiller = FILLER.test(unresolved);
    const words = unresolved.split(/\s+/).filter(Boolean).length;
    const isQuestionShaped = QUESTION_SHAPE.test(unresolved);
    const longEnough = words >= 8;
    const ok = !isFiller && isQuestionShaped && longEnough;

    if (ok) return null;

    const pathPrefix =
      ctx.sceneIndex !== undefined
        ? `scenes[${ctx.sceneIndex}].unresolved`
        : 'provocation.unresolved';

    const message = isFiller
      ? 'unresolved reads as a filler gesture — name the specific question instead (e.g. "Whether the cluster-wide rebalancer can be made incremental without sacrificing the latency invariant")'
      : !isQuestionShaped
        ? 'unresolved does not read as a question — start with an interrogative (Whether / How / Why / What / Under what / To what extent)'
        : `unresolved is only ${words} words — a specific open question needs more shape (≥ 8 words)`;

    return {
      ruleId: 'provocation-specific',
      path: pathPrefix,
      message,
      severity: 'error',
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<ProvocationScene>> = [
  provocationSpecific,
];

export default depthRules;
