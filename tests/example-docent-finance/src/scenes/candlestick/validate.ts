// Per-scene structural validation for the candlestick scene.
//
// Same semantic checks as `ohlc.validate` — high ≥ max(open,close),
// low ≤ min(open,close), finite numbers — applied to the single bar.

import type {SceneIssue, SceneValidationContext} from '@bjelser/kit';

import type {CandlestickSceneSpec} from './schema';

const isFiniteNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export const validate = (
  scene: CandlestickSceneSpec,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}].bar`;
  const bar = scene.bar;
  if (!bar || typeof bar !== 'object') {
    issues.push({
      path: at,
      message: 'candlestick requires a single `bar: {open,high,low,close}` object',
      severity: 'error',
    });
    return issues;
  }
  for (const f of ['open', 'high', 'low', 'close'] as const) {
    if (!isFiniteNum(bar[f])) {
      issues.push({
        path: `${at}.${f}`,
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
        path: `${at}.high`,
        message: `high (${bar.high}) is below max(open,close) (${maxBody})`,
        severity: 'error',
      });
    }
    if (bar.low > minBody) {
      issues.push({
        path: `${at}.low`,
        message: `low (${bar.low}) is above min(open,close) (${minBody})`,
        severity: 'error',
      });
    }
  }
  return issues;
};

export default validate;
