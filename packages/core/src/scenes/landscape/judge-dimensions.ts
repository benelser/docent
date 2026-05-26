// Judge dimensions for the `landscape` scene.
//
// Ported from packages/engine/cli/judge.ts (around line 92-93). The
// engine's judge ledger names ONE landscape-specific dimension:
//
//   quadrant-honest — positions are argued, not asserted; the trade-off
//                     the axes name is real.
//
// The rubric is the prompt scaffold the LLM judge reads when grading a
// rendered film that carries a landscape scene. A landscape that doesn't
// carry the argument — markers placed by intuition, axes named for
// convenience, quadrants used as decoration — fails this dimension even
// when every structural check passes.

import type {JudgeDimension} from '@docent/kit';

const quadrantHonest: JudgeDimension = {
  id: 'quadrant-honest',
  title:
    'Quadrant honest — positions are argued, not asserted; the trade-off the axes name is real',
  description:
    'When a landscape scene appears, the film owes the viewer two things: (1) the two axes name a genuine, distinct trade-off the field actually carries — not two restatements of the same dimension, and not a marketing dyad. (2) every subject sits at a position the narration earns. A marker placed by intuition (or by aesthetic balance — "spread them out so the slide looks even") fails this dimension even when the spread numerically passes the spread depth rule.',
  rubric:
    'A landscape scene fails this dimension when: the axes restate one trade-off in two phrasings ("simple/complex" on x and "easy/hard" on y); a subject\'s position is unargued ("we put it there because"); the quadrant labels are decorative ("the sweet spot") instead of mechanism-naming ("the only quadrant a small team can ship from"); the narration sweeps across the plane without naming why each subject sits where it sits. It passes when: each axis is a real tension the field carries, distinct from the other; each subject\'s position is justified by a property the film has established; the quadrants name what *only lives there*; and the narration argues *from* the geometry — "X clusters with Y because they share Z; W is alone in the bottom-right because it traded P for Q".',
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [
  quadrantHonest,
];

export default judgeDimensions;
