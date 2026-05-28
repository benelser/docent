// Per-scene structural validation for the ohlc scene.
//
// The JSON Schema already enforces shape (bars count, fields present); this
// validator owns the SEMANTIC checks JSON Schema can't express cleanly:
//
//   - high ≥ max(open, close)
//   - low  ≤ min(open, close)
//   - all four prices are finite numbers
//
// The depth bar: "the ARC of the bars is the argument." Validation here
// keeps a single malformed bar from silently mis-drawing the shape that
// scene's narration is reading.

import type {SceneIssue, SceneValidationContext} from '@bjelser/kit';

import type {OhlcSceneSpec} from './schema';

const isFiniteNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export const validate = (
  scene: OhlcSceneSpec,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;

  if (!Array.isArray(scene.bars) || scene.bars.length < 5) {
    issues.push({
      path: `${at}.bars`,
      message: 'ohlc requires at least 5 bars — an ARC needs a shape, not a snapshot',
      severity: 'error',
    });
    return issues;
  }
  if (scene.bars.length > 20) {
    issues.push({
      path: `${at}.bars`,
      message: `${scene.bars.length} bars — keep to 20 or fewer; denser charts belong in a different scene type`,
      severity: 'warning',
    });
  }

  scene.bars.forEach((bar, i) => {
    const bAt = `${at}.bars[${i}]`;
    for (const f of ['open', 'high', 'low', 'close'] as const) {
      if (!isFiniteNum(bar[f])) {
        issues.push({
          path: `${bAt}.${f}`,
          message: `${f} must be a finite number`,
          severity: 'error',
        });
      }
    }
    if (
      isFiniteNum(bar.open) &&
      isFiniteNum(bar.high) &&
      isFiniteNum(bar.low) &&
      isFiniteNum(bar.close)
    ) {
      const maxBody = Math.max(bar.open, bar.close);
      const minBody = Math.min(bar.open, bar.close);
      if (bar.high < maxBody) {
        issues.push({
          path: `${bAt}.high`,
          message: `high (${bar.high}) is below max(open,close) (${maxBody}) — a high that doesn't cover the body is malformed`,
          severity: 'error',
        });
      }
      if (bar.low > minBody) {
        issues.push({
          path: `${bAt}.low`,
          message: `low (${bar.low}) is above min(open,close) (${minBody}) — a low that doesn't reach the body is malformed`,
          severity: 'error',
        });
      }
    }
    if (bar.volume !== undefined && !isFiniteNum(bar.volume)) {
      issues.push({
        path: `${bAt}.volume`,
        message: 'volume must be a finite number when present',
        severity: 'error',
      });
    }
  });

  return issues;
};

export default validate;
