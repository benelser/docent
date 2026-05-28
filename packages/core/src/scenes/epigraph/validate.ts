// epigraph — per-scene structural validation.
//
// Hard-fail shape contract: a quote is required; attribution is required;
// epigraphTreatment, when present, must be 'block' or 'pull'. A quote longer
// than 60 words emits a warning — the typographic register is a small breath,
// not a paragraph.
//
// Migrated from `packages/engine/cli/validate.ts` (the `sc.type === 'epigraph'`
// block plus the "fields on the wrong scene type" complement). The cross-scene
// position contracts (at most one per film; at index 0 or right after the
// frame scene) stay in the engine's film-level validator.

import type {Scene} from '@bjelser/kit';
import type {SceneIssue, SceneValidationContext} from '@bjelser/kit';

interface EpigraphScene extends Scene {
  type: 'epigraph';
  quote?: unknown;
  attribution?: unknown;
  epigraphTreatment?: unknown;
}

export function validate(
  scene: EpigraphScene,
  ctx: SceneValidationContext,
): SceneIssue[] {
  const issues: SceneIssue[] = [];
  const at = ``;

  if (typeof scene.quote !== 'string' || !scene.quote.trim()) {
    issues.push({
      path: `${at}.quote`,
      message:
        'an epigraph requires a non-empty quote — the cited passage that opens the film',
      severity: 'error',
    });
  } else {
    const words = scene.quote.trim().split(/\s+/).filter(Boolean).length;
    if (words > 60) {
      issues.push({
        path: `${at}.quote`,
        message: `the quote is ${words} words — keep epigraph quotes to ≤ 60 words (the typographic register is a small breath, not a paragraph)`,
        severity: 'warning',
      });
    }
  }

  if (typeof scene.attribution !== 'string' || !scene.attribution.trim()) {
    issues.push({
      path: `${at}.attribution`,
      message:
        'an epigraph requires an attribution — who said it; a bare quote with no source span fails the depth contract',
      severity: 'error',
    });
  }

  if (
    scene.epigraphTreatment !== undefined &&
    scene.epigraphTreatment !== 'block' &&
    scene.epigraphTreatment !== 'pull'
  ) {
    issues.push({
      path: `${at}.epigraphTreatment`,
      message: 'epigraphTreatment must be "block" or "pull"',
      severity: 'error',
    });
  }

  return issues;
}
