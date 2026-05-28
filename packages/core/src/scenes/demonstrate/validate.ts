// Per-scene structural validation for the `demonstrate` scene.
//
// Mirrors the v2.5.x engine's per-scene-type validate.ts entry for
// demonstrate (packages/engine/cli/validate.ts:2533):
//
//     demonstrate: () => (typeof sc.clip !== 'string' || !sc.clip.trim()
//       ? 'demonstrate requires a clip path'
//       : null),
//
// The demonstrate scene shows the phenomenon itself — a screen-capture
// clip framed in a device-style panel with narration over it. The clip
// reference is the load-bearing field; without it the scene degrades to
// a centred placeholder. The placeholder is intentional graceful
// degradation at *render* time (no crash on a missing file), but at the
// *spec authoring* time the absence of a `clip` is an error — a
// demonstrate scene without a clip has nothing to demonstrate.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

export interface DemonstrateScene extends Scene {
  type: 'demonstrate';
  clip?: string;
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: DemonstrateScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;

  if (typeof scene.clip !== 'string' || !scene.clip.trim()) {
    issues.push({
      path: `${at}.clip`,
      message: 'demonstrate requires a clip path',
      severity: 'error',
      code: 'demonstrate/missing-clip',
    });
  }

  return issues;
};

export default validate;
