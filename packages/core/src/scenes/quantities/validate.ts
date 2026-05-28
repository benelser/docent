// Per-scene structural validator for `quantities`.
//
// MIGRATED from `packages/engine/cli/validate.ts` — the `quantities` branch
// of the `requiredBody` dispatch table. The rule: every quantities scene
// must carry at least one of `figures`, `matrix.cells`, or `metrics` —
// otherwise the scene renders narration over a void.
//
// JSON Schema CANNOT express this constraint cleanly because it's a
// disjunction across optional sibling fields; we enforce it here, as the
// ScenePlugin's structural validator.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

const arrLen = (a: unknown): number => (Array.isArray(a) ? a.length : 0);

export function validate(
  scene: Scene,
  ctx: SceneValidationContext,
): SceneIssue[] {
  const issues: SceneIssue[] = [];

  const sc = scene as Record<string, unknown>;
  const matrix = sc.matrix as Record<string, unknown> | undefined;
  const hasFigs = arrLen(sc.figures) >= 1;
  const hasMatrix = !!matrix && arrLen(matrix.cells) >= 1;
  const hasMetrics = arrLen(sc.metrics) >= 1;

  if (!hasFigs && !hasMatrix && !hasMetrics) {
    issues.push({
      path: `scenes[${ctx.sceneIndex}]`,
      message:
        'quantities requires at least one of figures, matrix.cells, or metrics',
      severity: 'error',
      code: 'quantities/empty-body',
    });
  }

  return issues;
}

export default validate;
