// Judge dimensions contributed by the mechanism scene plugin.
//
// Ported behaviorally from the `motion-load-bearing` dimension in
// packages/engine/cli/judge.ts (around line 88-89):
//
//   "Motion is load-bearing — what the viewer learns comes from watching
//    the thing operate, not from words describing it."
//
// The judge surfaces this dimension only when the film carries a mechanism
// scene; films without one mark it n/a. The kit's judge framework aggregates
// dimensions across registered plugins.

import type {JudgeDimension} from '@bjelser/kit';

const motionLoadBearing: JudgeDimension = {
  id: 'motion-load-bearing',
  title:
    'Motion is load-bearing — what the viewer learns comes from watching the thing operate, not from words describing it',
  description:
    'A mechanism scene exists to let the viewer SEE the thing run. The dimension fails when the motion is decoration: the narration spells out in words what the diagram already shows, the freezes are absent, and the scene would read just as well as a still figure. The dimension passes when the motion makes the argument — a freeze pauses on a phase the narration calls out, a beat lets the motion play unaccompanied, or the narration explicitly directs the viewer\'s attention to what is moving.',
  rubric: [
    'Pass: the motion carries the argument. At least one beat either (a) freezes the motion on a named phase the narration discusses, (b) is short enough that the motion plays largely unaccompanied, or (c) directs attention to the visual state ("watch the cursor settle", "now the loop closes", "pause here at phase 2"). The viewer\'s learning comes from the motion, not from words describing the motion.',
    'Fail: the motion is decoration. Every beat over-narrates what the diagram already shows; the scene would read identically as a still figure. The freezes array is empty AND no beat is short AND no beat references the visual state. The motion is wallpaper.',
    'n/a: the film has no mechanism scene.',
  ].join('\n\n'),
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [
  motionLoadBearing,
];

export default judgeDimensions;
