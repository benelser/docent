// Per-scene structural validator for `query`.
//
// JSON Schema enforces the closed shape (required dialect / query / result;
// result.value of unknown JSON type). This validator pins the cross-field
// invariants the schema can't express:
//
//   1. result.value MUST type-match result.kind (counter/gauge → number;
//      table → 2-D string matrix; timeseries → number[]). A mismatch
//      silently renders as "no value" in the v2.5-derived renderer; we
//      promote it to a hard error so an author catches the typo at
//      validate time.
//   2. Every line's revealId is unique within the scene. Duplicates
//      collide on the renderer's reveal-set lookup (the second wins) and
//      the second line never appears.
//   3. Every beat's `reveal` ids that LOOK like a query-line revealId
//      (start with `q-` by convention, or simply: don't resolve to any
//      other id in the spec) should resolve to an actual line — a stale
//      reveal id silently no-ops. Warn (not error) because beats may also
//      reveal table-row ids or note ids in future extensions.

import type {Beat, Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

export interface QueryLine {
  text: string;
  revealId?: string;
  note?: string;
}

export interface QueryResult {
  kind: 'counter' | 'gauge' | 'table' | 'timeseries';
  value: number | ReadonlyArray<number> | ReadonlyArray<ReadonlyArray<string>>;
  unit?: string;
  label?: string;
  bind?: string;
  threshold?: number;
  format?: 'int' | 'float1' | 'percent';
}

export interface QueryScene extends Scene {
  type: 'query';
  dialect: 'promql' | 'logql' | 'sql' | 'jql' | 'kql';
  query: ReadonlyArray<QueryLine>;
  result: QueryResult;
  kicker?: string;
  heading?: string;
}

const isNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const is2DStringMatrix = (v: unknown): v is ReadonlyArray<ReadonlyArray<string>> =>
  Array.isArray(v) &&
  v.every(
    (row) =>
      Array.isArray(row) && (row as unknown[]).every((c) => typeof c === 'string'),
  );

const isNumberArray = (v: unknown): v is ReadonlyArray<number> =>
  Array.isArray(v) && v.every((x) => isNumber(x));

export const validate = (
  scene: QueryScene,
  _ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];

  // --- 1. result.value type matches result.kind ---------------------------
  const {result} = scene;
  if (result) {
    const kind = result.kind;
    const value = result.value as unknown;
    if (kind === 'counter' || kind === 'gauge') {
      if (!isNumber(value)) {
        issues.push({
          path: `result.value`,
          message: `query result.kind="${kind}" requires result.value to be a number; got ${typeof value}`,
          severity: 'error',
          code: 'query/result-value-type',
        });
      }
      if (kind === 'gauge' && isNumber(value) && (value < 0 || value > 1)) {
        // A gauge value outside [0..1] renders past the swept arc; warn the
        // author so a percent intended as 94 (not 0.94) gets caught.
        issues.push({
          path: `result.value`,
          message: `query gauge value ${value} is outside [0, 1]; the arc fill saturates and the gauge stops being legible. If you meant a percent, divide by 100 (0.94, not 94).`,
          severity: 'warning',
          code: 'query/gauge-value-range',
        });
      }
    } else if (kind === 'timeseries') {
      if (!isNumberArray(value)) {
        issues.push({
          path: `result.value`,
          message: `query result.kind="timeseries" requires result.value to be an array of numbers`,
          severity: 'error',
          code: 'query/result-value-type',
        });
      }
    } else if (kind === 'table') {
      if (!is2DStringMatrix(value)) {
        issues.push({
          path: `result.value`,
          message: `query result.kind="table" requires result.value to be a 2-D string matrix (rows × cols)`,
          severity: 'error',
          code: 'query/result-value-type',
        });
      }
    }
  }

  // --- 2. revealId uniqueness across query lines --------------------------
  const lines = Array.isArray(scene.query) ? scene.query : [];
  const seen = new Set<string>();
  const lineRevealIds = new Set<string>();
  lines.forEach((line, i) => {
    const rid = line?.revealId;
    if (typeof rid === 'string' && rid.length > 0) {
      if (seen.has(rid)) {
        issues.push({
          path: `query[${i}].revealId`,
          message: `query line revealId "${rid}" is reused; the second collides with the first and won't reveal independently`,
          severity: 'error',
          code: 'query/duplicate-reveal-id',
        });
      }
      seen.add(rid);
      lineRevealIds.add(rid);
    }
  });

  // --- 3. beat reveal ids resolve to a line -------------------------------
  // A stale reveal id silently no-ops in the renderer — warn so the author
  // catches it. Beats that reveal table-row ids (a future extension) will
  // also surface as warnings, which is the right side of the trade-off: a
  // false-positive warning is easier to dismiss than a silently-blank scene.
  const beats = Array.isArray(scene.beats) ? (scene.beats as Beat[]) : [];
  beats.forEach((b, bi) => {
    const reveal = b.reveal;
    if (!Array.isArray(reveal)) return;
    reveal.forEach((rid, ri) => {
      if (typeof rid !== 'string') return;
      if (!lineRevealIds.has(rid)) {
        issues.push({
          path: `beats[${bi}].reveal[${ri}]`,
          message: `query beat reveals "${rid}" but no query line declares that revealId — the renderer will reveal nothing for this id`,
          severity: 'warning',
          code: 'query/stale-reveal-id',
        });
      }
    });
  });

  return issues;
};

export default validate;
