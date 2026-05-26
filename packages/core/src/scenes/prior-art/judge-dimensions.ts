// judge-dimensions — the AR-mode judge dimensions contributed by the
// prior-art scene plugin.
//
// MIGRATED from `packages/engine/cli/judge.ts` (v2.5.x) DEPTH_DIMENSIONS.
// The two AR-mode dimensions the prior-art scene's presence pins:
//   - `novelty-named`    — the film says what is *new*, not what the
//                          components are. (Whole-AR-film signal, but
//                          *only meaningful* when a prior-art scene is
//                          present to anchor what the novelty argues
//                          against — so it ships under this plugin.)
//   - `prior-art-honest` — prior systems named with version/year,
//                          divergence is dimensional.
//
// Per the strategy doc §4.2: each ScenePlugin contributes its own judge
// dimensions; the engine's `judge` framework aggregates them across
// every registered plugin. The prompt scaffolding the judge sees is the
// `rubric` field; here we port the v2.5.x labels into the rubric verbatim
// so the LLM judge gets the same instruction.

import type {JudgeDimension} from '@docent/kit';

/**
 * Novelty named — the film says what is *new*, not what the components
 * are. PR films mark this `n/a` (the judge contract); AR films must pass.
 */
const noveltyNamed: JudgeDimension = {
  id: 'novelty-named',
  title:
    'Novelty named — the film says what is *new*, not what the components are',
  description:
    'AR-mode dimension. The film must surface a clear claim of what is novel about the subject — not a tour of its parts.',
  rubric:
    'Novelty named — the film says what is *new*, not what the components are. ' +
    'AR-mode dimension; PR films mark n/a. A pass: the film names the new line ' +
    '(the dimension the subject argues from) in plain words. A fail: the film ' +
    'describes the components, the parts, the steps — but never says what about ' +
    'them is new. The novelty statement on the prior-art scene is the canonical ' +
    'evidence; check that the film reads it (in narration or chrome) and that ' +
    'the rest of the scenes do not just enumerate the parts.',
};

/**
 * Prior art honest — prior systems named with version/year, divergence is
 * dimensional. The scene-anchored AR judgement: did the film survey real
 * prior systems, name them concretely (version/year), and place its
 * divergence dimensionally rather than evaluatively.
 */
const priorArtHonest: JudgeDimension = {
  id: 'prior-art-honest',
  title:
    'Prior art honest — prior systems named with version/year, divergence is dimensional',
  description:
    'AR-mode dimension. The prior-art survey must name real systems with version/year context and place the subject\'s divergence dimensionally — never as "X is better than Y".',
  rubric:
    'Prior art honest — prior systems named with version/year, divergence is ' +
    'dimensional. AR-mode dimension; PR films mark n/a. A pass: the prior-art ' +
    'scene names 2-4 prior systems with concrete version/year context (e.g. ' +
    '"Raft 2014", "etcd v3.x"); each row is a TRADE-OFF, not a quality; the ' +
    'novelty statement names a dimensional difference ("X is a runtime ' +
    'decision; Y was admission-time"). A fail: prior systems are unversioned ' +
    'or vague ("older databases", "earlier work"); rows name qualities ' +
    '("speed", "scale") instead of choices ("storage layout", "indexing ' +
    'strategy"); the novelty reads as a verdict ("X is better", "X wins") ' +
    'rather than a trade-off.',
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [
  noveltyNamed,
  priorArtHonest,
];
