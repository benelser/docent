// Per-scene structural validation for the `closeup` scene.
//
// Migrated from packages/engine/cli/validate.ts (the `closeup` entry in
// the requiredBody table — lines 2513-2518): a closeup must carry either
// `code` (the source listing) or `file` (the file reference label). The
// JSON Schema (see ./schema.ts) cannot express the OR — the schema marks
// both as optional and this validator pins the cross-field invariant.
//
// In practice every closeup in the existing films ships both fields:
// `file` populates the macOS-style window-chrome title; `code` is the
// listing the renderer tokenises and highlights. The v2.5.x requirement
// is "either or", which we preserve.
//
// Beat-level invariants (`highlight: [first, last]` line ranges, `note`
// annotations) are typed by the spec but not bounded against `code` —
// the v2.5.x renderer silently clamps out-of-range highlights via its
// `lineNo >= hl[0] && lineNo <= hl[1]` check. We add a warning when a
// beat's highlight reaches past the code's line count so a spec author
// catches a stale range.

import type {Beat, Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

export interface CloseupScene extends Scene {
  type: 'closeup';
  code?: string;
  lang?: string;
  file?: string;
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: CloseupScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;

  const hasCode = typeof scene.code === 'string' && scene.code.trim().length > 0;
  const hasFile = typeof scene.file === 'string' && scene.file.trim().length > 0;

  if (!hasCode && !hasFile) {
    issues.push({
      path: `${at}`,
      message: 'closeup requires either code or file',
      severity: 'error',
      code: 'closeup/missing-body',
    });
    return issues;
  }

  // If a code body is present, surface beat highlights that point past the
  // end of the listing — a stale range silently renders as "no
  // highlight" in the v2.5.x renderer; we promote that to a warning.
  if (hasCode) {
    const code = (scene.code ?? '').replace(/\s+$/, '');
    const lineCount = code.split('\n').length;
    const beats = Array.isArray(scene.beats) ? scene.beats : [];
    beats.forEach((b: Beat, j: number) => {
      const hl = (b as {highlight?: [number, number]}).highlight;
      if (!Array.isArray(hl) || hl.length !== 2) return;
      const [lo, hi] = hl;
      if (typeof lo !== 'number' || typeof hi !== 'number') return;
      if (lo < 1 || hi < 1 || lo > lineCount || hi > lineCount) {
        issues.push({
          path: `${at}.beats[${j}].highlight`,
          message: `closeup beat highlight [${lo}, ${hi}] points past the code body (${lineCount} lines); the renderer will draw no spotlight`,
          severity: 'warning',
          code: 'closeup/stale-highlight',
        });
      }
      if (lo > hi) {
        issues.push({
          path: `${at}.beats[${j}].highlight`,
          message: `closeup beat highlight [${lo}, ${hi}] is reversed (first > last); swap the endpoints`,
          severity: 'warning',
          code: 'closeup/reversed-highlight',
        });
      }
    });
  }

  return issues;
};

export default validate;
