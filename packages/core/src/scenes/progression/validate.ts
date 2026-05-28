// Per-scene structural validation for the `progression` scene.
//
// Lifted from packages/engine/cli/validate.ts. Two rules the schema can't
// express cleanly:
//
//   1. **body required** — every progression scene must carry at least one
//      stage. Mirrors the v2.5.x `requiredBody.progression` rule
//      (validate.ts line 2495): "progression requires at least 1 stage".
//      Without a stage the scene renders a void with audio playing over
//      it — the same failure mode the engine's body-required gate catches
//      for every list scene.
//
//   2. **track is 0 or 1** — when `Scene.stages[].track` is set, it must
//      be exactly the literal 0 or 1 (the two braided lanes). Lifted from
//      validate.ts line 641: a value other than 0/1 is "a braided lane
//      sneaking in", the same shape the schema enum catches for `flow`.
//      The schema already enforces this via `"enum": [0, 1]`, but we
//      surface it here too so the validator's error matches the engine's
//      message verbatim (the depthcheck harness consumes both).
//
// The `flow` enum is enforced by the schema (closed enum `linear`/`cycle`/
// `braided`/`iterate`); no per-validator check needed for that field.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

/**
 * A single progression stage — the per-type shape the renderer reads off
 * `Scene.stages[]`. The kit treats every plugin-owned field as opaque
 * (`Scene` carries an open index signature), so the per-scene type narrows
 * the shape for the plugin's own use.
 */
export interface ProgressionStage {
  id: string;
  label: string;
  sub?: string;
  duration?: string;
  gate?: boolean;
  /** 0 or 1 — which of the two parallel lanes in `flow: 'braided'`. */
  track?: 0 | 1;
}

export type ProgressionFlow = 'linear' | 'cycle' | 'braided' | 'iterate';

export interface ProgressionScene extends Scene {
  type: 'progression';
  stages?: ProgressionStage[];
  flow?: ProgressionFlow;
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: ProgressionScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;

  // Body required — at least one stage. Without it the scene renders a void
  // with audio playing over the void; the validator's job to prevent.
  const stages = Array.isArray(scene.stages) ? scene.stages : [];
  if (stages.length < 1) {
    issues.push({
      path: `${at}.stages`,
      message: 'progression requires at least 1 stage (the body the narration speaks to)',
      severity: 'error',
      code: 'progression/missing-stages',
    });
  }

  // Per-stage track check — must be the literal 0 or 1 when present. The
  // engine's renderer falls back to lane 0 for any other value, so this is a
  // soft warning (the schema also catches it); we surface it so the spec
  // author sees the same message both layers emit.
  stages.forEach((st, k) => {
    if (st === null || typeof st !== 'object') return;
    if (st.track !== undefined && st.track !== 0 && st.track !== 1) {
      issues.push({
        path: `${at}.stages[${k}].track`,
        message: 'track must be 0 or 1 (a braided lane)',
        severity: 'warning',
        code: 'progression/bad-track',
      });
    }
  });

  return issues;
};

export default validate;
