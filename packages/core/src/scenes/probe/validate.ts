// Per-scene structural validation for the `probe` scene.
//
// MIGRATED from `packages/engine/cli/validate.ts` (v2.5.x) — the probe entry
// in the `requiredBody` switch is:
//
//     probe: () => (arrLen(sc.variations) < 1
//       ? 'probe requires at least 1 variation against the baseline'
//       : null)
//
// The hard-fail contract is preserved: a probe with zero variations is not
// a probe — it is a single state, with no interrogation against a
// counterfactual. We surface that as a SceneIssue.
//
// We also add a small set of cross-field invariants that strengthen the
// schema (which can't express them):
//
//   - Each variation has a unique non-empty `id` (beats focus this id).
//   - `flips`, when present, is a boolean (the engine's component uses
//     `v.flips === true` strict-equality; surfacing a typo here is cheaper
//     than letting it silently default to the muted "held" tag).
//   - When a baseline is present, both `label` and `outcome` are non-empty
//     strings (an empty baseline row is the visible failure mode the
//     renderer can't recover from).

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

/**
 * The probe scene's per-spec shape. Probe scenes carry a single optional
 * baseline (label → outcome, pinned at the top) and an ordered list of
 * variations — each a perturbation of the baseline, with a resulting
 * outcome, optionally marked as `flips: true` when the perturbation flips
 * the outcome to the opposite signal (rose marker).
 */
export interface ProbeVariation {
  id: string;
  label: string;
  change: string;
  outcome: string;
  flips?: boolean;
}

export interface ProbeBaseline {
  label: string;
  outcome: string;
}

export interface ProbeScene extends Scene {
  type: 'probe';
  kicker?: string;
  heading?: string;
  baseline?: ProbeBaseline;
  variations?: ProbeVariation[];
}

export const validate = (
  scene: ProbeScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;

  // ---- variations (hard-fail body contract) -------------------------------
  if (!Array.isArray(scene.variations) || scene.variations.length < 1) {
    issues.push({
      path: `${at}.variations`,
      message: 'probe requires at least 1 variation against the baseline',
      severity: 'error',
      code: 'probe/missing-variations',
    });
  } else {
    const seenIds = new Set<string>();
    scene.variations.forEach((rawV: unknown, k: number) => {
      const vAt = `${at}.variations[${k}]`;
      if (!rawV || typeof rawV !== 'object') {
        issues.push({
          path: vAt,
          message:
            'variation must be an object {id, label, change, outcome, flips?}',
          severity: 'error',
          code: 'probe/bad-variation',
        });
        return;
      }
      const v = rawV as Record<string, unknown>;
      if (typeof v.id !== 'string' || !v.id.trim()) {
        issues.push({
          path: `${vAt}.id`,
          message:
            'variation requires a non-empty `id` (beats focus this id)',
          severity: 'error',
          code: 'probe/missing-id',
        });
      } else if (seenIds.has(v.id)) {
        issues.push({
          path: `${vAt}.id`,
          message: `duplicate variation id "${v.id}"`,
          severity: 'error',
          code: 'probe/duplicate-id',
        });
      } else {
        seenIds.add(v.id);
      }
      if (typeof v.label !== 'string' || !v.label.trim()) {
        issues.push({
          path: `${vAt}.label`,
          message: 'variation requires a non-empty `label`',
          severity: 'error',
          code: 'probe/missing-label',
        });
      }
      if (typeof v.change !== 'string' || !v.change.trim()) {
        issues.push({
          path: `${vAt}.change`,
          message:
            'variation requires a non-empty `change` (the input that is perturbed)',
          severity: 'error',
          code: 'probe/missing-change',
        });
      }
      if (typeof v.outcome !== 'string' || !v.outcome.trim()) {
        issues.push({
          path: `${vAt}.outcome`,
          message:
            'variation requires a non-empty `outcome` (the resulting consequence)',
          severity: 'error',
          code: 'probe/missing-outcome',
        });
      }
      if (v.flips !== undefined && typeof v.flips !== 'boolean') {
        issues.push({
          path: `${vAt}.flips`,
          message:
            '`flips` must be a boolean when present — the renderer uses strict-equality (`flips === true`) to light the rose marker',
          severity: 'warning',
          code: 'probe/bad-flips',
        });
      }
    });
  }

  // ---- baseline (optional but if present must be well-formed) -------------
  if (scene.baseline !== undefined) {
    const b = scene.baseline as unknown as Record<string, unknown>;
    if (!b || typeof b !== 'object') {
      issues.push({
        path: `${at}.baseline`,
        message: 'baseline must be an object {label, outcome}',
        severity: 'error',
        code: 'probe/bad-baseline',
      });
    } else {
      if (typeof b.label !== 'string' || !b.label.trim()) {
        issues.push({
          path: `${at}.baseline.label`,
          message:
            'baseline requires a non-empty `label` (the input the variations perturb)',
          severity: 'error',
          code: 'probe/missing-baseline-label',
        });
      }
      if (typeof b.outcome !== 'string' || !b.outcome.trim()) {
        issues.push({
          path: `${at}.baseline.outcome`,
          message:
            'baseline requires a non-empty `outcome` (the result the variations are measured against)',
          severity: 'error',
          code: 'probe/missing-baseline-outcome',
        });
      }
    }
  }

  return issues;
};

export default validate;
