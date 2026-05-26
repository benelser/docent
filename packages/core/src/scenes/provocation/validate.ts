// Per-scene structural validator for `provocation`.
//
// `provocation` is the rhetorical scene where the film deliberately closes
// with an open question. The validation contract mirrors the
// `provocation`-specific block in packages/engine/cli/validate.ts (v2.5.x,
// around line 2452):
//
//   - `unresolved` must be a non-empty string (the question the film
//     deliberately doesn't answer).
//   - `why`        must be a non-empty string (why the film leaves this
//     open).
//   - `invitation` must be a non-empty string (what the viewer is invited
//     to do with the open question).
//
// Film-level cross-scene ordering (provocation must be the ABSOLUTE LAST
// scene of the film; provocation is mutually exclusive with big-idea — a
// film either COMMITS or HANDS OFF, never both) is owned by the kit's
// cross-scene validator and is NOT duplicated here.

import type {Scene, SceneIssue, SceneValidationContext} from '@docent/kit';

/**
 * The provocation scene's spec. Plugin-owned fields layered on the kit's
 * `Scene`.
 *
 * `kicker` and `heading` are common scene fields read by the component
 * (they thread to SceneFrame's chrome); the kit treats them as opaque
 * extras on `Scene`, so we surface them on the local type for ergonomic
 * access.
 */
export interface ProvocationScene extends Scene {
  type: 'provocation';
  unresolved?: string;
  why?: string;
  invitation?: string;
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: ProvocationScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;

  if (typeof scene.unresolved !== 'string' || !scene.unresolved.trim()) {
    issues.push({
      path: `${at}.unresolved`,
      message:
        "provocation requires a non-empty unresolved — the question the film deliberately doesn't answer",
      severity: 'error',
      code: 'provocation.unresolved.required',
    });
  }

  if (typeof scene.why !== 'string' || !scene.why.trim()) {
    issues.push({
      path: `${at}.why`,
      message:
        'provocation requires a non-empty why — why the film leaves this open',
      severity: 'error',
      code: 'provocation.why.required',
    });
  }

  if (typeof scene.invitation !== 'string' || !scene.invitation.trim()) {
    issues.push({
      path: `${at}.invitation`,
      message:
        'provocation requires a non-empty invitation — what the viewer is invited to do with the open question',
      severity: 'error',
      code: 'provocation.invitation.required',
    });
  }

  return issues;
};

export default validate;
