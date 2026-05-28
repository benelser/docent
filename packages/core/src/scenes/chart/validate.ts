// Per-scene structural validation for the `chart` scene.
//
// MIGRATED from packages/engine/cli/validate.ts (v2.5.x): the `checkAxis`
// block applied to chart scenes, the per-series shape checks, and the
// `requiredBody.chart` rule ("chart requires at least 1 series"). Behaviour
// is preserved — same hard-fail conditions, same warnings, same messages.
//
// The film-level `CLAIM_SCENE_TYPES` contracts (concession/objection
// ordering relative to claim scenes — of which chart is one) live at the
// film-level checker, not here.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

// The closed allowlist of named functions a `line` series may plot.
// Anything outside this list is rejected: the author names a shape, the
// engine owns the math. There is no expression evaluator.
const CHART_FNS = ['linear', 'x^2', 'sqrt', 'sin', 'exp', 'log', 'reciprocal'] as const;
const SERIES_KINDS = ['line', 'bars', 'point'] as const;
const ACCENTS = ['blue', 'cyan', 'green', 'amber', 'rose', 'violet'] as const;
const MAX_BARS = 8;
const MAX_TICKS = 10;

export interface ChartAxis {
  kind?: string;
  label?: string;
  min?: number;
  max?: number;
  ticks?: number;
}

export interface ChartSeries {
  id?: string;
  kind?: string;
  accent?: string;
  fn?: string;
  points?: unknown;
  data?: unknown;
  bind?: string;
  along?: string;
}

export interface ChartScene extends Scene {
  type: 'chart';
  xAxis?: ChartAxis;
  yAxis?: ChartAxis;
  series?: ChartSeries[];
  kicker?: string;
  heading?: string;
}

const isFiniteNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export const validate = (
  scene: ChartScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;

  // ----- axes ----------------------------------------------------------------
  // Each axis is a labelled domain (kind/label/min/max [/ticks]). `kind:
  // 'chart'` is the discriminator that narrows `Scene.xAxis`/`yAxis` from the
  // widened `axis | landscape-axis` union at the renderer.
  const checkAxis = (axis: unknown, axisAt: string): void => {
    if (axis === undefined) return;
    if (!axis || typeof axis !== 'object') {
      issues.push({
        path: axisAt,
        message: 'axis must be an object {kind: "chart", label, min, max, ticks?}',
        severity: 'error',
      });
      return;
    }
    const a = axis as Record<string, unknown>;
    if (a.kind !== 'chart') {
      issues.push({
        path: `${axisAt}.kind`,
        message:
          'chart scene requires `axis.kind: "chart"` (the discriminator that narrows the union)',
        severity: 'error',
      });
    }
    if (typeof a.label !== 'string' || !a.label.trim()) {
      issues.push({
        path: `${axisAt}.label`,
        message: 'missing or empty string',
        severity: 'error',
      });
    }
    for (const f of ['min', 'max'] as const) {
      if (!isFiniteNum(a[f])) {
        issues.push({
          path: `${axisAt}.${f}`,
          message: 'must be a finite number',
          severity: 'error',
        });
      }
    }
    if (isFiniteNum(a.min) && isFiniteNum(a.max) && a.min >= a.max) {
      issues.push({
        path: `${axisAt}.max`,
        message: 'max must be greater than min',
        severity: 'error',
      });
    }
    if (a.ticks !== undefined) {
      if (typeof a.ticks !== 'number' || !Number.isInteger(a.ticks) || a.ticks < 2) {
        issues.push({
          path: `${axisAt}.ticks`,
          message: 'ticks must be an integer ≥ 2',
          severity: 'error',
        });
      } else if (a.ticks > MAX_TICKS) {
        issues.push({
          path: `${axisAt}.ticks`,
          severity: 'warning',
          message: `${a.ticks} ticks is dense — ${MAX_TICKS} or fewer reads cleanly`,
        });
      }
    }
  };

  checkAxis(scene.xAxis, `${at}.xAxis`);
  checkAxis(scene.yAxis, `${at}.yAxis`);

  // ----- series --------------------------------------------------------------
  // `requiredBody.chart`: a chart with no series isn't a chart. Per-series
  // shape contracts mirror v2.5.x exactly.
  const series = scene.series;
  if (series !== undefined && !Array.isArray(series)) {
    issues.push({
      path: `${at}.series`,
      message: 'series must be an array',
      severity: 'error',
    });
  } else if (!Array.isArray(series) || series.length < 1) {
    issues.push({
      path: `${at}.series`,
      message: 'chart requires at least 1 series',
      severity: 'error',
    });
  } else {
    const seriesIds = new Set<string>();
    series.forEach((rawSe: unknown, k: number) => {
      const seAt = `${at}.series[${k}]`;
      if (!rawSe || typeof rawSe !== 'object') {
        issues.push({path: seAt, message: 'series must be an object', severity: 'error'});
        return;
      }
      const se = rawSe as Record<string, unknown>;
      if (typeof se.id !== 'string' || !se.id.trim()) {
        issues.push({
          path: `${seAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
        });
      } else if (seriesIds.has(se.id)) {
        issues.push({
          path: `${seAt}.id`,
          message: `duplicate series id "${se.id}"`,
          severity: 'error',
        });
      } else {
        seriesIds.add(se.id);
      }
      if (typeof se.kind !== 'string' || !(SERIES_KINDS as readonly string[]).includes(se.kind)) {
        issues.push({
          path: `${seAt}.kind`,
          message: `not a valid kind — one of: ${SERIES_KINDS.join(', ')}`,
          severity: 'error',
        });
      }
      if (
        se.accent !== undefined &&
        (typeof se.accent !== 'string' || !(ACCENTS as readonly string[]).includes(se.accent))
      ) {
        issues.push({
          path: `${seAt}.accent`,
          message: `unknown accent "${String(se.accent)}"`,
          severity: 'error',
        });
      }
      if (se.kind === 'line') {
        const hasFn = se.fn !== undefined;
        const hasPoints = se.points !== undefined;
        if (!hasFn && !hasPoints) {
          issues.push({
            path: seAt,
            message: 'a line series needs either `fn` or `points`',
            severity: 'error',
          });
        }
        if (
          hasFn &&
          (typeof se.fn !== 'string' || !(CHART_FNS as readonly string[]).includes(se.fn))
        ) {
          issues.push({
            path: `${seAt}.fn`,
            message: `not an allowed fn — one of: ${CHART_FNS.join(', ')}`,
            severity: 'error',
          });
        }
        if (hasPoints) {
          const pts = se.points;
          if (!Array.isArray(pts) || pts.length < 2) {
            issues.push({
              path: `${seAt}.points`,
              message: 'points must be an array of ≥ 2 [x, y] pairs',
              severity: 'error',
            });
          } else {
            pts.forEach((p: unknown, pi: number) => {
              if (
                !Array.isArray(p) ||
                p.length !== 2 ||
                typeof p[0] !== 'number' ||
                typeof p[1] !== 'number'
              ) {
                issues.push({
                  path: `${seAt}.points[${pi}]`,
                  message: 'must be a [number, number] pair',
                  severity: 'error',
                });
              }
            });
          }
        }
      } else if (se.kind === 'bars') {
        const data = se.data;
        if (!Array.isArray(data) || data.length === 0) {
          issues.push({
            path: `${seAt}.data`,
            message: 'a bars series needs a non-empty `data` array',
            severity: 'error',
          });
        } else {
          if (data.length > MAX_BARS) {
            issues.push({
              path: `${seAt}.data`,
              severity: 'warning',
              message: `${data.length} bars is dense — ${MAX_BARS} or fewer reads cleanly`,
            });
          }
          data.forEach((rawD: unknown, di: number) => {
            const dAt = `${seAt}.data[${di}]`;
            if (!rawD || typeof rawD !== 'object') {
              issues.push({
                path: dAt,
                message: 'datum must be an object {label, value}',
                severity: 'error',
              });
              return;
            }
            const d = rawD as Record<string, unknown>;
            if (typeof d.label !== 'string' || !d.label.trim()) {
              issues.push({
                path: `${dAt}.label`,
                message: 'missing or empty string',
                severity: 'error',
              });
            }
            if (!isFiniteNum(d.value)) {
              issues.push({
                path: `${dAt}.value`,
                message: 'must be a finite number',
                severity: 'error',
              });
            }
          });
        }
      } else if (se.kind === 'point') {
        if (
          se.bind !== undefined &&
          (typeof se.bind !== 'string' || !se.bind.trim())
        ) {
          issues.push({
            path: `${seAt}.bind`,
            message: 'bind must be a non-empty string naming a `set` key',
            severity: 'error',
          });
        }
        if (
          se.along !== undefined &&
          (typeof se.along !== 'string' || !se.along.trim())
        ) {
          issues.push({
            path: `${seAt}.along`,
            message: 'along must be a non-empty string naming a line series id',
            severity: 'error',
          });
        }
      }
    });
  }

  return issues;
};

export default validate;
