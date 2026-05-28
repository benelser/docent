// Per-scene structural validation for the `frame` scene.
//
// The v2.5.x engine's per-scene-type validate.ts entry for frame enforces
// a single structural invariant (packages/engine/cli/validate.ts:2535):
//
//   frame: () => (typeof sc.title !== 'string' || !sc.title.trim()
//     ? 'frame requires a title'
//     : null),
//
// The title is the load-bearing visual of the scene — without it there
// is nothing to set up the subject. JSON Schema (see ./schema.ts) also
// carries the `title` requirement (`required: ['title']` + `minLength:
// 1`); this validator surfaces the same check with a friendlier path and
// code so spec authors hit a clear error when they author by hand and
// forget the title.
//
// `tagline` and `footnote` are optional — the renderer no-ops them when
// absent. `kicker` lives on the common scene shape (the chrome label) and
// is not enforced here.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

export interface FrameScene extends Scene {
  type: 'frame';
  title?: string;
  tagline?: string;
  footnote?: string;
  kicker?: string;
}

export const validate = (
  scene: FrameScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;

  const title = typeof scene.title === 'string' ? scene.title : '';
  if (!title.trim()) {
    issues.push({
      path: `${at}.title`,
      message: 'frame requires a title (the load-bearing hero text — the subject of the film)',
      severity: 'error',
      code: 'frame/missing-title',
    });
  }

  return issues;
};

export default validate;
