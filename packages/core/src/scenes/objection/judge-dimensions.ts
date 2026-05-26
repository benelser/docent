// Judge dimensions contributed by the `objection` scene.
//
// objection-real — the objection cites a real counterposition, not a weak
// opponent the film invented to defeat. The depthcheck rule
// (`objection-steelmanned`) catches the regex-shaped failures (word count,
// evaluative adjectives, partial-without-concession); this dimension
// catches what only judgement can — whether the objection corresponds to
// an actual counterposition someone holds, or whether it is a strawman
// the film bolted on to be seen "engaging with critics".
//
// Mirrors the `objection-real` entry in
// packages/engine/cli/judge.ts (v2.5.x, around line 115).
//
// Films with no objection scene mark the dimension n/a.

import type {JudgeDimension} from '@docent/kit';

const objectionReal: JudgeDimension = {
  id: 'objection-real',
  title: 'Objection real',
  description:
    'The objection cites a real counterposition, not a weak opponent the film invented to defeat.',
  rubric: [
    'Score 5 — the objection names a counterposition a real critic would hold;',
    '  it identifies a specific mechanism (cost, missed failure mode,',
    '  conflation, category error) that an informed reader would press the',
    '  film on. The refutation engages with that mechanism, not a softer',
    '  version of it.',
    'Score 3 — the objection is plausible but generic; it points roughly in',
    '  the direction of a real critique without naming a specific mechanism.',
    'Score 1 — strawman. The objection is invented to be defeated: an',
    '  evaluative slogan ("this argument is weak"), a position no informed',
    '  reader actually holds, or a softened version of the real critique so',
    '  the film can claim engagement without taking the hit.',
    'Mark n/a when the film carries no objection scene.',
  ].join('\n'),
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [objectionReal];

export default judgeDimensions;
