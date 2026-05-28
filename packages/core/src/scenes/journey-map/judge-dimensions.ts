// Judge dimensions for the `journey-map` scene.
//
// MIGRATED from packages/engine/cli/judge.ts (line 84-85): the v2.5.x
// engine carries a single journey-map-flavoured judge dimension —
// `experience-is-load-bearing`. When the film carries a journey-map, the
// LLM grader weighs whether the emotional arc is the argument (pain and
// delight specific, not vague) rather than decoration. Films with no
// journey-map mark this n/a.
//
// In the plugin world, this dimension travels WITH the scene plugin: the
// judge framework only surfaces it when at least one journey-map scene
// appears in the spec, so the n/a semantics fall out of the registry
// dispatch.

import type {JudgeDimension} from '@bjelser/kit';

const experienceIsLoadBearing: JudgeDimension = {
  id: 'experience-is-load-bearing',
  title:
    'Experience is load-bearing — the emotional arc is the argument; pain and delight are specific, not vague',
  description:
    "When the film carries a journey-map, the emotional arc must do work. The judge grades whether the arc reasons (the highs and lows track a real shape the film argues from) and whether the specifics — touchpoints, pain points — are concrete (a real screen, a real friction, a real moment) rather than vague feelings.",
  rubric:
    'Does the journey-map reason from experience, or does it decorate? Check: do the curve highs and lows track a shape the film argues from? Are the touchpoints / pain points specific enough that a reader could find them in the real artifact (a screen, a doc, a conversation)? A journey-map that flatters or that lists vague feelings fails this dimension.',
};

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [
  experienceIsLoadBearing,
];

export default judgeDimensions;
