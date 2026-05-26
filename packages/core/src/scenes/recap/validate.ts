// Per-scene structural validation for the `recap` scene.
//
// Mirrors the v2.5.x engine's required-body table entry for recap
// (packages/engine/cli/validate.ts:2491):
//   recap: () => (arrLen(sc.points) < 3
//     ? 'recap requires at least 3 points (the body the narration speaks to)'
//     : null),
//
// The recap is a chrome scene that brackets the film alongside `frame`.
// Its only structural invariant is the body — the ruling points the
// narration speaks to. Fewer than 3 is a list, not a synthesis.
//
// Position contracts that involve `recap` (the recap must be the LAST
// scene in an explainer film; the big-idea sits immediately before it;
// objection must precede the recap) are film-wide rules and stay on the
// engine's spec-level validator, not on this per-scene plugin.

import type {Scene, SceneIssue, SceneValidationContext} from '@docent/kit';

export interface RecapScene extends Scene {
  type: 'recap';
  points?: string[];
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: RecapScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;

  const points = Array.isArray(scene.points) ? scene.points : [];
  if (points.length < 3) {
    issues.push({
      path: `${at}.points`,
      message:
        'recap requires at least 3 points (the body the narration speaks to)',
      severity: 'error',
      code: 'recap/insufficient-points',
    });
    return issues;
  }

  // Surface any non-string / empty point — schema catches the type but a
  // per-scene structural pass surfaces a clearer message at the exact
  // index. The renderer reads each point as a string and would render an
  // empty row; surface that as an error.
  points.forEach((p, i) => {
    if (typeof p !== 'string' || !p.trim()) {
      issues.push({
        path: `${at}.points[${i}]`,
        message:
          'recap point must be a non-empty string — the ruling claim the narration speaks to',
        severity: 'error',
        code: 'recap/empty-point',
      });
    }
  });

  return issues;
};

export default validate;
