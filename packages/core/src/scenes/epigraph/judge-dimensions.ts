// epigraph — judge dimensions.
//
// `epigraph-earned` — the Layer-3 judgement dimension. The regex-shaped
// failures are caught by `epigraph-on-point` in depth-rules; this dimension
// catches what only judgement can: does the rest of the film argue WITH the
// quote, or merely decorate FROM it.
//
// Migrated from `packages/engine/cli/judge.ts` — the `epigraph-earned` entry
// in the rhetorical-primitive judge dimensions block.

import type {JudgeDimension} from '@bjelser/kit';

const epigraphEarned: JudgeDimension = {
  id: 'epigraph-earned',
  title: 'Epigraph earned',
  description:
    'The rest of the film ARGUES WITH the quote, not merely decorates from it. A film that opens with a cited authority must engage that authority — quote it back, push against it, qualify it. An epigraph that the film never returns to is decoration; it fails the dimension.',
  rubric: [
    '5 — The quote is a load-bearing premise. Later scenes name the source span, qualify the claim, or push against it. Removing the epigraph would weaken the film\'s argument.',
    '4 — The film clearly engages the quote at least once after the opening; the engagement is specific (a node, a beat, a line of narration).',
    '3 — The film references the quote\'s subject but not the quote itself. The epigraph sets a tone the film honors without arguing with it.',
    '2 — The quote opens the film but never recurs. Tone-setting only.',
    '1 — The quote is decoration. Could be replaced with any other quote on the same topic without changing the film.',
    'n/a — The film has no epigraph scene.',
  ].join('\n'),
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [epigraphEarned];
