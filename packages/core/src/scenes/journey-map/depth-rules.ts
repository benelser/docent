// Depthcheck rules for the `journey-map` scene.
//
// MIGRATED from packages/engine/cli/depthcheck.ts (the journey-map block,
// lines ~446-484). The v2.5.x engine surfaced two journey-map-specific
// depth findings:
//
//   1. `journey-asymmetric` — the curve must visibly rise AND fall. At
//      least one stage's curveValue ≥ 0.7 (a real high) AND at least one
//      ≤ 0.3 (a real low). A journey-map all-delight or all-pain is not a
//      journey; it is a verdict in disguise.
//
//   2. `journey-specifics` — at least half the stages must name either
//      `touchpoints` or `painPoints`. A journey without specifics is just
//      a list of feelings.
//
// Both rules run per-scene (scope: 'scene'). The empty-stages case is left
// to the structural validator (./validate.ts owns that error); these rules
// short-circuit to a pass when there are zero stages so they don't double-
// report.

import type {DepthRule} from '@bjelser/kit';

import type {JourneyMapScene} from './validate';

const journeyAsymmetric: DepthRule<JourneyMapScene> = {
  id: 'journey-asymmetric',
  description:
    'Journey-map emotional arc — at least one high (≥ 0.7) AND one low (≤ 0.3); a flat curve is not a journey',
  severity: 'error',
  scope: 'scene',
  check(scene) {
    const stages = scene.journeyStages ?? [];
    // The structural validator owns the empty-stages error; skip here so we
    // don't double-report.
    if (stages.length === 0) return null;
    const high = stages.some((s) => s.curveValue >= 0.7);
    const low = stages.some((s) => s.curveValue <= 0.3);
    if (high && low) return null;
    const message =
      !high && !low
        ? 'the curve is flat — every stage sits in the middle band; not a journey'
        : !high
          ? 'no stage reaches the top of the curve (≥ 0.7) — the journey has no payoff or relief'
          : 'no stage reaches the bottom of the curve (≤ 0.3) — the journey has no friction; a journey-map that flatters is not a journey';
    return {
      ruleId: 'journey-asymmetric',
      path: 'journeyStages',
      message,
      severity: 'error',
    };
  },
};

const journeySpecifics: DepthRule<JourneyMapScene> = {
  id: 'journey-specifics',
  description:
    'Journey-map specifics — at least half the stages name touchpoints or pain points',
  severity: 'error',
  scope: 'scene',
  check(scene) {
    const stages = scene.journeyStages ?? [];
    if (stages.length === 0) return null;
    const documented = stages.filter(
      (s) => (s.touchpoints?.length ?? 0) > 0 || (s.painPoints?.length ?? 0) > 0,
    ).length;
    const ratio = documented / stages.length;
    if (ratio >= 0.5) return null;
    return {
      ruleId: 'journey-specifics',
      path: 'journeyStages',
      message: `only ${documented}/${stages.length} stages have any touchpoint or pain-point — a journey without specifics is just a list of feelings`,
      severity: 'error',
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<JourneyMapScene>> = [
  journeyAsymmetric,
  journeySpecifics,
];

export default depthRules;
