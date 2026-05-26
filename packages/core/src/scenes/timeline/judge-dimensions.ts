// Judge dimensions for the `timeline` scene.
//
// Migrated from packages/engine/cli/judge.ts — the `time-is-load-bearing`
// dimension. When the film carries a timeline, the gaps between events
// must be part of the argument, not decoration. A timeline whose events
// could just as well be a progression (ordinal stages) — where the
// proportional distance between dates does no work — fails this dimension.
// Films with no timeline mark this n/a.

import type {JudgeDimension} from '@docent/kit';

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [
  {
    id: 'time-is-load-bearing',
    title: 'Time is load-bearing',
    description:
      'When the film carries a timeline, the gaps between events must be part of the argument, not decoration. A timeline whose proportional date-spacing does no narrative work could have been a progression; the judge grades whether the dates earn their axis.',
    rubric:
      'Score 5/5 when the film argues from the gaps — the seven years between two events, the long gap that makes the next move surprising, the era a span carries. Score 3/5 when the dates are accurate but the gaps do no work (the same scene reads identically as a progression). Score 1/5 when the dates are decoration. Mark n/a when the film carries no timeline scene.',
  },
];

export default judgeDimensions;
