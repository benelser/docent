// Judge dimensions contributed by the `concession` scene.
//
// scope-honest — the concession honestly narrows; the film does not sneak
// claims about out-of-scope items back in later. The depthcheck rule
// (`concession-non-trivial`) catches the regex-shaped failures (count,
// tautologies, short labels); this dimension catches what only judgement
// can — whether the film respects its own line after drawing it.
//
// Mirrors the `scope-honest` entry in packages/engine/cli/judge.ts
// (v2.5.x, around line 114).
//
// Films with no concession scene mark the dimension n/a.

import type {JudgeDimension} from '@bjelser/kit';

const scopeHonest: JudgeDimension = {
  id: 'scope-honest',
  title: 'Scope honest',
  description:
    'The concession honestly narrows; the film does not sneak claims about out-of-scope items back in later.',
  rubric: [
    'Score 5 — the concession draws a load-bearing line; the out-of-scope',
    '  items name concrete things by NAME (not tautological fillers); the',
    '  rest of the film respects the line and does not quietly reintroduce',
    '  claims about set-aside items in later scenes.',
    'Score 3 — the concession is real but soft. The boundary is named but',
    '  later scenes brush against an out-of-scope item without explicitly',
    '  withdrawing the concession.',
    'Score 1 — performative concession. Either the out-of-scope list is',
    '  tautological/short ("not relevant", "other things"), or the film',
    '  draws a line and then crosses it — claims about set-aside items',
    '  reappear in later scenes as if the concession were not made.',
    'Mark n/a when the film carries no concession scene.',
  ].join('\n'),
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [scopeHonest];

export default judgeDimensions;
