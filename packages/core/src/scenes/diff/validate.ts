// Per-scene structural validation for the `diff` scene.
//
// The v2.5.x engine's per-scene-type validate.ts entry for diff returns
// null (line 2541: `diff: () => null` in packages/engine/cli/validate.ts).
// The diff scene's required body is the `code` string itself; JSON Schema
// (see ./schema.ts) carries that requirement. There are no cross-field
// invariants beyond schema today.
//
// This validator surfaces a single structural check the schema can't
// express: every non-empty line of `code` should begin with a recognized
// marker (`+`, `-`, or ` `). The v2.5.x renderer silently treats any
// other leading char as context (passes the line through with no tint);
// in the plugin world we surface a warning so the spec author can fix it.

import type {Scene, SceneIssue, SceneValidationContext} from '@docent/kit';

export interface DiffScene extends Scene {
  type: 'diff';
  code?: string;
  lang?: string;
  file?: string;
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: DiffScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;

  const code = typeof scene.code === 'string' ? scene.code : '';
  if (!code.trim()) {
    issues.push({
      path: `${at}.code`,
      message: 'diff requires a non-empty `code` body (a unified diff)',
      severity: 'error',
      code: 'diff/missing-code',
    });
    return issues;
  }

  // Walk the lines; flag any that don't begin with '+', '-', or ' '. An
  // empty line is fine (it's a blank context row in the diff).
  const lines = code.replace(/\s+$/, '').split('\n');
  lines.forEach((line, i) => {
    if (line.length === 0) return;
    const m = line[0];
    if (m !== '+' && m !== '-' && m !== ' ') {
      issues.push({
        path: `${at}.code[line ${i + 1}]`,
        message: `diff line ${i + 1} does not start with '+', '-', or ' ' (got ${JSON.stringify(m)}); the marker is required so the renderer can tint add/remove rows and compute hunk stats`,
        severity: 'warning',
        code: 'diff/unmarked-line',
      });
    }
  });

  return issues;
};

export default validate;
