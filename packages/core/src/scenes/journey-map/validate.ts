// Per-scene structural validation for the `journey-map` scene.
//
// MIGRATED from packages/engine/cli/validate.ts (the journey-map branch,
// lines ~1797-1873). The HARD-FAIL contracts in the v2.5.x validator are
// preserved verbatim:
//   - 3-8 stages (a journey with fewer has no arc; with more it ceases to
//     read).
//   - each stage is an object with non-empty `id` and `label`.
//   - `sub` (when present) is a non-empty string.
//   - `emotion` is from the closed JourneyEmotion allowlist.
//   - `curveValue` is a finite number in [0..1].
//   - `touchpoints` / `painPoints` (when present) are arrays of non-empty
//     strings.
//   - stage ids are unique within the scene.
//
// JSON Schema (./schema.ts) covers the array-bound and per-field type
// checks; this validator adds the cross-field shape — the duplicate-id
// check, the per-element string-trim that JSON Schema can't express, and
// the union of all required fields in a single readable issue path. The two
// layers compose: JSON Schema fails fast on type errors, this validator
// surfaces the structural contract failures the v2.5.x renderer relied on.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

// Closed allowlist — the engine's JOURNEY_EMOTIONS constant, preserved
// byte-equivalently from packages/engine/cli/validate.ts line 20.
const JOURNEY_EMOTIONS = [
  'delight',
  'curiosity',
  'satisfaction',
  'neutral',
  'fatigue',
  'frustration',
  'pain',
] as const;

export type JourneyEmotion = (typeof JOURNEY_EMOTIONS)[number];

export interface JourneyStage {
  id: string;
  label: string;
  sub?: string;
  emotion: JourneyEmotion;
  curveValue: number;
  touchpoints?: string[];
  painPoints?: string[];
  // Sprint B — compositional grammar. A journey-map stage may carry an
  // embedded scene tableau drawn inside the stage tile. Allowlist:
  // causal-loop | mechanism | compare. Treated as opaque here; the
  // component's embed renderer is a colocated stub until the shared
  // EmbeddedScene primitive migrates.
  embed?: unknown;
}

export interface JourneyMapScene extends Scene {
  type: 'journey-map';
  journeyStages?: JourneyStage[];
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: JourneyMapScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;

  if (!Array.isArray(scene.journeyStages)) {
    issues.push({
      path: `${at}.journeyStages`,
      message:
        'journey-map requires a journeyStages array (3-8 stages along the journey)',
      severity: 'error',
      code: 'journey-map/missing-stages',
    });
    return issues;
  }

  const stages = scene.journeyStages;
  if (stages.length < 3 || stages.length > 8) {
    issues.push({
      path: `${at}.journeyStages`,
      message: `journey-map requires 3-8 stages — ${stages.length} is ${
        stages.length < 3
          ? 'too few (the arc has no shape)'
          : 'too many (the journey ceases to read)'
      }`,
      severity: 'error',
      code: 'journey-map/stage-count',
    });
  }

  const stageIds = new Set<string>();
  stages.forEach((js, k) => {
    const jAt = `${at}.journeyStages[${k}]`;
    if (!js || typeof js !== 'object') {
      issues.push({
        path: jAt,
        message:
          'journey stage must be an object {id, label, emotion, curveValue, ...}',
        severity: 'error',
        code: 'journey-map/stage-shape',
      });
      return;
    }
    if (typeof js.id !== 'string' || !js.id.trim()) {
      issues.push({
        path: `${jAt}.id`,
        message: 'missing or empty string',
        severity: 'error',
        code: 'journey-map/stage-id',
      });
    } else if (stageIds.has(js.id)) {
      issues.push({
        path: `${jAt}.id`,
        message: `duplicate journey stage id "${js.id}"`,
        severity: 'error',
        code: 'journey-map/duplicate-stage-id',
      });
    } else {
      stageIds.add(js.id);
    }
    if (typeof js.label !== 'string' || !js.label.trim()) {
      issues.push({
        path: `${jAt}.label`,
        message: 'missing or empty string',
        severity: 'error',
        code: 'journey-map/stage-label',
      });
    }
    if (js.sub !== undefined && (typeof js.sub !== 'string' || !js.sub.trim())) {
      issues.push({
        path: `${jAt}.sub`,
        message: 'sub must be a non-empty string when present',
        severity: 'error',
        code: 'journey-map/stage-sub',
      });
    }
    if (
      typeof js.emotion !== 'string' ||
      !(JOURNEY_EMOTIONS as readonly string[]).includes(js.emotion)
    ) {
      issues.push({
        path: `${jAt}.emotion`,
        message: `not a valid emotion — one of: ${JOURNEY_EMOTIONS.join(', ')}`,
        severity: 'error',
        code: 'journey-map/stage-emotion',
      });
    }
    if (
      typeof js.curveValue !== 'number' ||
      !Number.isFinite(js.curveValue) ||
      js.curveValue < 0 ||
      js.curveValue > 1
    ) {
      issues.push({
        path: `${jAt}.curveValue`,
        message:
          'curveValue must be a number in [0..1] (1 = best emotion, 0 = worst)',
        severity: 'error',
        code: 'journey-map/stage-curve-value',
      });
    }
    for (const f of ['touchpoints', 'painPoints'] as const) {
      const v = (js as unknown as Record<string, unknown>)[f];
      if (v === undefined) continue;
      if (!Array.isArray(v)) {
        issues.push({
          path: `${jAt}.${f}`,
          message: `${f} must be an array of short strings`,
          severity: 'error',
          code: `journey-map/stage-${f}`,
        });
        continue;
      }
      v.forEach((s, si) => {
        if (typeof s !== 'string' || !s.trim()) {
          issues.push({
            path: `${jAt}.${f}[${si}]`,
            message: 'must be a non-empty string',
            severity: 'error',
            code: `journey-map/stage-${f}-item`,
          });
        }
      });
    }
  });

  return issues;
};

export default validate;
