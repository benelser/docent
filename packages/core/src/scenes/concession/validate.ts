// Per-scene structural validator for `concession`.
//
// The validation contract mirrors the `concession`-specific block in
// packages/engine/cli/validate.ts (v2.5.x, around line 2324):
//
//   - `scope` must be a non-empty array of non-empty strings (the IN
//     SCOPE column; what the film argues about).
//   - `outOfScope` must be an array of ≥ 2 non-empty strings. A single
//     set-aside is a footnote; the cut needs to be visible as a cut. The
//     depth rule `concession-non-trivial` layers the tautology + short-
//     item checks on top of these structural shape requirements.
//   - `reason` (optional) must be a non-empty string when present.
//
// Film-level cross-scene ordering (concession must sit AFTER the frame
// scene if any, and BEFORE any claim scene) is owned by the kit's
// cross-scene validator and is not duplicated here.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

// The plugin-owned fields on the concession scene spec. The kit's `Scene`
// keeps plugin-owned fields opaque (`[key: string]: unknown`); we narrow
// here so the per-scene validator + depth rule keep precise types.
export interface ConcessionScene extends Scene {
  type: 'concession';
  scope?: string[];
  outOfScope?: string[];
  reason?: string;
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: ConcessionScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;

  if (!Array.isArray(scene.scope) || scene.scope.length < 1) {
    issues.push({
      path: `${at}.scope`,
      message:
        'concession requires a non-empty scope array — the IN SCOPE column (what the film argues about)',
      severity: 'error',
      code: 'concession/scope-required',
    });
  } else {
    scene.scope.forEach((s: unknown, k: number) => {
      if (typeof s !== 'string' || !s.trim()) {
        issues.push({
          path: `${at}.scope[${k}]`,
          message: 'scope item must be a non-empty string',
          severity: 'error',
          code: 'concession/scope-item-empty',
        });
      }
    });
  }

  if (!Array.isArray(scene.outOfScope) || scene.outOfScope.length < 2) {
    issues.push({
      path: `${at}.outOfScope`,
      message:
        'concession requires at least 2 outOfScope items (a single set-aside is a footnote; the cut needs to be visible as a cut)',
      severity: 'error',
      code: 'concession/outOfScope-insufficient',
    });
  } else {
    scene.outOfScope.forEach((s: unknown, k: number) => {
      if (typeof s !== 'string' || !s.trim()) {
        issues.push({
          path: `${at}.outOfScope[${k}]`,
          message: 'outOfScope item must be a non-empty string',
          severity: 'error',
          code: 'concession/outOfScope-item-empty',
        });
      }
    });
  }

  if (
    scene.reason !== undefined &&
    (typeof scene.reason !== 'string' || !scene.reason.trim())
  ) {
    issues.push({
      path: `${at}.reason`,
      message: 'reason must be a non-empty string when present',
      severity: 'error',
      code: 'concession/reason-empty',
    });
  }

  return issues;
};

export default validate;
