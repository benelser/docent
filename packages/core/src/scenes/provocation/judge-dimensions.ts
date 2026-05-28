// Judge dimensions contributed by the `provocation` scene.
//
// `provocation-load-bearing` — the unresolved question FOLLOWS FROM what
// the film argued; not bolted on as a generic "what's next". The
// depthcheck rule (`provocation-specific`) catches the regex-shaped
// failures (filler patterns, question shape, word count); this dimension
// catches what only judgement can — whether the open question is the
// natural next problem the film's argument poses, or whether it is a
// generic gesture bolted on so the film can claim humility about its own
// limits.
//
// Mirrors the `provocation-load-bearing` entry in
// packages/engine/cli/judge.ts (v2.5.x, around line 116).
//
// Films with no provocation scene mark the dimension n/a.

import type {JudgeDimension} from '@bjelser/kit';

const provocationLoadBearing: JudgeDimension = {
  id: 'provocation-load-bearing',
  title: 'Provocation load-bearing',
  description:
    "The unresolved question FOLLOWS FROM what the film argued; not bolted on as a generic \"what's next\".",
  rubric: [
    'Score 5 — the unresolved is the natural next problem the film\'s',
    '  argument poses: an informed viewer reading the preceding scenes would',
    '  arrive at this exact question. The why names a specific reason the',
    '  film cannot answer it (a measurement gap, an unresolved trade-off, a',
    '  pending decision); the invitation hands the viewer something concrete',
    '  to do (a position to take, an experiment to run, a constraint to',
    '  test).',
    'Score 3 — the unresolved is in the right neighbourhood but generic;',
    '  it asks a real question but not THE question this film\'s argument',
    '  uniquely opens. The invitation is plausible but soft.',
    'Score 1 — bolted on. The provocation is a generic "what\'s next"',
    '  gesture that could close any film of this kind; it does not follow',
    '  from what was argued. The why and invitation read as filler ("more',
    '  work is needed", "stay tuned"), or the unresolved restates a claim',
    '  the film already made.',
    'Mark n/a when the film carries no provocation scene.',
  ].join('\n'),
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [
  provocationLoadBearing,
];

export default judgeDimensions;
