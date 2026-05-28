// Judge dimensions contributed by the causal-loop scene plugin.
//
// Ported behaviorally from the `loops-explain-not-decorate` dimension in
// packages/engine/cli/judge.ts (around line 86-87):
//
//   "Loops explain — the reinforcing or balancing structure is what the
//    scene argues, not a pretty cycle."
//
// The judge surfaces this dimension only when the film carries a
// causal-loop scene; films without one mark it n/a. The kit's judge
// framework aggregates dimensions across registered plugins.

import type {JudgeDimension} from '@bjelser/kit';

const loopsExplain: JudgeDimension = {
  id: 'loops-explain-not-decorate',
  title:
    'Loops explain — the reinforcing or balancing structure is what the scene argues, not a pretty cycle',
  description:
    'A causal-loop scene exists to make the viewer SEE a feedback structure: an R loop compounds (debt → interest → more debt); a B loop self-corrects (thermostat → cool → off). The dimension fails when the scene draws a pretty ring but never argues from the R/B label — the narration recounts each variable in turn instead of naming what the feedback DOES, and the parity of the polarity glyphs goes unspoken. The dimension passes when the scene argues from the structure: a beat names the cycle as reinforcing or balancing and explains WHY (which "-" edge flips the parity, or which "+" chain compounds), the loop label R/B is the scene\'s conclusion not its decoration, and a viewer who only watched the loop centre label would still take the point.',
  rubric: [
    'Pass: the R/B label is load-bearing. At least one beat names the cycle as reinforcing or balancing and ties the label to the polarity math (the count of "-" edges, the specific edge that flips parity, or the compounding chain of "+" edges). The narration argues from what the feedback DOES, not from the existence of arrows. A viewer reading only the centre label and the narration walks away knowing whether the cycle compounds or self-corrects and why.',
    'Fail: the cycle is decoration. The narration walks the variables in turn ("then this affects that") without ever naming the loop as R or B, the parity math is unspoken, and the scene would read the same with the centre label removed. The diagram is a ring of arrows; the argument is missing.',
    'n/a: the film has no causal-loop scene.',
  ].join('\n\n'),
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [loopsExplain];

export default judgeDimensions;
