// Per-scene structural validator for the `compare` scene.
//
// Ported from packages/engine/cli/validate.ts. The engine's per-scene
// shape rule for compare is:
//
//   compare: () => (arrLen(sc.columns) < 1 || arrLen(sc.rows) < 1
//     ? 'compare requires at least 1 column and 1 row' : null)
//
// We additionally surface two structural invariants the schema can
// express only awkwardly but the renderer relies on:
//
//   - row.cells.length should equal columns.length (the renderer reads
//     cells positionally; a row shorter than the columns falls back to
//     '—' for the missing cells but loses the verdict/embed slot — a
//     warning so the author can fix it).
//   - column and row ids must be unique within the scene (beats reference
//     row ids via `focus`; a duplicate row id breaks the focus lookup).
//
// The Sprint-B embed allowlist (`compare.cells[].embed` → quantities |
// chart | venn) and the embed-host-discipline cross-scene rule are
// enforced by the engine-wide embed validator that walks every scene,
// not by this per-scene validator.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

// The per-type narrowing of `Scene` for compare. The kit's `Scene` carries
// an open index signature; we narrow only the fields this validator and
// the component read.
export interface CompareColumn {
  id: string;
  label: string;
  sub?: string;
}

export interface CompareCell {
  text: string;
  verdict?: 'win' | 'lose' | 'neutral';
  embed?: {type: string; caption?: string; [key: string]: unknown};
}

export interface CompareRow {
  id: string;
  label: string;
  cells: CompareCell[];
}

export interface CompareScene extends Scene {
  type: 'compare';
  columns?: CompareColumn[];
  rows?: CompareRow[];
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: CompareScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;

  const columns = Array.isArray(scene.columns) ? scene.columns : [];
  const rows = Array.isArray(scene.rows) ? scene.rows : [];

  // ----- minimal-body check (the engine's per-type shape rule) -------------
  if (columns.length < 1 || rows.length < 1) {
    issues.push({
      path: at,
      severity: 'error',
      message: 'compare requires at least 1 column and 1 row',
      code: 'compare/empty-table',
    });
    // Don't pile on further findings — the body is the load-bearing
    // shape; everything else assumes it.
    return issues;
  }

  // ----- column id uniqueness ----------------------------------------------
  const seenCol = new Set<string>();
  columns.forEach((c, ci) => {
    if (typeof c?.id !== 'string' || !c.id.trim()) {
      issues.push({
        path: `${at}.columns[${ci}].id`,
        severity: 'error',
        message: 'missing or empty string',
        code: 'compare/column-id-missing',
      });
      return;
    }
    if (seenCol.has(c.id)) {
      issues.push({
        path: `${at}.columns[${ci}].id`,
        severity: 'error',
        message: `duplicate column id "${c.id}" — every column id must be unique within the scene`,
        code: 'compare/column-id-duplicate',
      });
    } else {
      seenCol.add(c.id);
    }
  });

  // ----- row id uniqueness + cell-count parity -----------------------------
  const seenRow = new Set<string>();
  rows.forEach((r, ri) => {
    const rAt = `${at}.rows[${ri}]`;
    if (typeof r?.id !== 'string' || !r.id.trim()) {
      issues.push({
        path: `${rAt}.id`,
        severity: 'error',
        message: 'missing or empty string',
        code: 'compare/row-id-missing',
      });
    } else if (seenRow.has(r.id)) {
      issues.push({
        path: `${rAt}.id`,
        severity: 'error',
        message: `duplicate row id "${r.id}" — every row id must be unique within the scene (beats reference rows by id via \`focus\`)`,
        code: 'compare/row-id-duplicate',
      });
    } else {
      seenRow.add(r.id);
    }

    const cells = Array.isArray(r?.cells) ? r.cells : null;
    if (!cells) {
      issues.push({
        path: `${rAt}.cells`,
        severity: 'error',
        message: 'row.cells must be an array (one cell per column)',
        code: 'compare/row-cells-missing',
      });
      return;
    }
    if (cells.length !== columns.length) {
      issues.push({
        path: `${rAt}.cells`,
        severity: 'warning',
        message: `row "${r?.id ?? `[${ri}]`}" has ${cells.length} cells but the table has ${columns.length} columns — the renderer reads cells positionally, so any missing cell falls back to a "—" and loses its verdict/embed slot`,
        code: 'compare/row-cells-count',
      });
    }
  });

  return issues;
};

export default validate;
