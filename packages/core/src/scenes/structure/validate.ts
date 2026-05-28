// Per-scene structural validation for the `structure` scene.
//
// MIGRATED from packages/engine/cli/validate.ts (v2.5.x) — the node/edge
// shape rules that live in the per-scene-type block, plus the body-required
// rule `structure: requires at least 1 node (the diagram body)`.
//
// The structure scene carries a lot of cross-field invariants the JSON
// Schema can't express on its own:
//   1. at least one node (the diagram body).
//   2. unique node ids; unique edge ids.
//   3. node `as` representation drives which other fields are meaningful:
//      `matrix`/`vector`/`grid` require `cells`; `equation` requires `expr`;
//      any other `as` must NOT carry `cells` or `expr` (force-fit).
//   4. an edge's `strength` has meaning only on a `causes` edge.
//   5. box-overlap guarantee — two nodes cannot share a grid cell (a `wide`
//      node spans (col, row) + (col+1, row)), and no cell may sit outside
//      the grid. Soft-fails (the renderer's resolveLayout drops the wide
//      flag); the validator surfaces the bad spec.
//
// The legitimate-host-table for `embed` (which scene-type slots may carry an
// embed) is enforced at the FILM level by the engine's spec-wide validator —
// the structure plugin does NOT reach across scenes to validate it. We do
// check the simple per-node shape: an `embed` field's `type` must be in the
// structure host's allowlist (mechanism | chart | venn).

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

import type {StructureEdge, StructureNode, StructureScene} from './_types';

// The allowlist for `structure.nodes[].embed.type` — the scene types a
// structure node may host. Mirrors EMBED_ALLOWLIST['structure.nodes'] in
// packages/engine/cli/validate.ts.
const STRUCTURE_EMBED_ALLOWLIST = new Set(['mechanism', 'chart', 'venn']);

const KNOBS_AS = ['box', 'matrix', 'vector', 'grid', 'code', 'equation'] as const;
const KNOBS_WEIGHT = ['hero', 'primary', 'normal', 'recede'] as const;
const KNOBS_EDGE_KIND = ['relation', 'feedback', 'entails', 'causes'] as const;
const KNOBS_EDGE_STRENGTH = ['necessary', 'contributing'] as const;

const isStringIn = <T extends string>(
  v: unknown,
  list: readonly T[],
): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

export const validate = (
  scene: Scene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;
  const sc = scene as StructureScene;

  // ----- body required ---------------------------------------------------
  // Every scene carries narration via beats; structure's body — what the
  // narration speaks to — is the diagram, so at least one node is required.
  const nodes: StructureNode[] = Array.isArray(sc.nodes) ? sc.nodes : [];
  if (nodes.length < 1) {
    issues.push({
      path: `${at}.nodes`,
      message: 'structure requires at least 1 node (the diagram body)',
      severity: 'error',
      code: 'structure/missing-body',
    });
  }

  // ----- nodes: shape, ids, morph fields --------------------------------
  const nodeIds = new Set<string>();
  nodes.forEach((n, k) => {
    if (!n || typeof n !== 'object') return;
    const nAt = `${at}.nodes[${k}]`;

    // id uniqueness — beats reveal/focus by id, edges reference by id; a
    // duplicate id silently shadows the earlier node.
    if (typeof n.id === 'string' && n.id.trim()) {
      if (nodeIds.has(n.id)) {
        issues.push({
          path: `${nAt}.id`,
          message: `duplicate node id "${n.id}"`,
          severity: 'error',
          code: 'structure/duplicate-node-id',
        });
      } else {
        nodeIds.add(n.id);
      }
    } else {
      issues.push({
        path: `${nAt}.id`,
        message: 'node id missing or empty',
        severity: 'error',
        code: 'structure/missing-node-id',
      });
    }

    // weight enum — closed list.
    if (n.weight !== undefined && !isStringIn(n.weight, KNOBS_WEIGHT)) {
      issues.push({
        path: `${nAt}.weight`,
        message: `not a valid weight — one of: ${KNOBS_WEIGHT.join(', ')}`,
        severity: 'error',
        code: 'structure/bad-weight',
      });
    }

    // representation (`as`) + companion fields (`cells`, `expr`).
    if (n.as !== undefined && !isStringIn(n.as, KNOBS_AS)) {
      issues.push({
        path: `${nAt}.as`,
        message: `not a valid representation — one of: ${KNOBS_AS.join(', ')}`,
        severity: 'error',
        code: 'structure/bad-as',
      });
    }
    const repr = n.as ?? 'box';
    if (n.cells !== undefined) {
      const cellsOk =
        Array.isArray(n.cells) &&
        n.cells.every(
          (row) =>
            Array.isArray(row) &&
            row.every(
              (c) => typeof c === 'string' || typeof c === 'number',
            ),
        );
      if (!cellsOk) {
        issues.push({
          path: `${nAt}.cells`,
          message: 'cells must be a row-major array of (string | number) arrays',
          severity: 'error',
          code: 'structure/bad-cells',
        });
      } else if (repr !== 'matrix' && repr !== 'vector' && repr !== 'grid') {
        issues.push({
          path: `${nAt}.cells`,
          message: `cells has no meaning for as: "${repr}" — only matrix/vector/grid`,
          severity: 'error',
          code: 'structure/cells-force-fit',
        });
      }
    } else if (repr === 'matrix' || repr === 'vector' || repr === 'grid') {
      issues.push({
        path: `${nAt}.cells`,
        message: `as: "${repr}" needs a cells array`,
        severity: 'error',
        code: 'structure/missing-cells',
      });
    }
    if (n.expr !== undefined) {
      if (typeof n.expr !== 'string' || !n.expr.trim()) {
        issues.push({
          path: `${nAt}.expr`,
          message: 'expr must be a non-empty string of math markup',
          severity: 'error',
          code: 'structure/bad-expr',
        });
      } else if (repr !== 'equation') {
        issues.push({
          path: `${nAt}.expr`,
          message: `expr has no meaning for as: "${repr}" — only equation`,
          severity: 'error',
          code: 'structure/expr-force-fit',
        });
      }
    } else if (repr === 'equation') {
      issues.push({
        path: `${nAt}.expr`,
        message: 'as: "equation" needs an expr string',
        severity: 'error',
        code: 'structure/missing-expr',
      });
    }

    // embed allowlist — the structure host carries mechanism | chart | venn.
    // The film-wide validator owns recursive shape; we only check the type.
    if (n.embed !== undefined) {
      const eType = (n.embed as {type?: unknown}).type;
      if (typeof eType !== 'string' || !eType.trim()) {
        issues.push({
          path: `${nAt}.embed.type`,
          message: 'embed must declare a scene type',
          severity: 'error',
          code: 'structure/bad-embed',
        });
      } else if (!STRUCTURE_EMBED_ALLOWLIST.has(eType)) {
        issues.push({
          path: `${nAt}.embed.type`,
          message: `embed type "${eType}" is not in the structure host allowlist (${Array.from(STRUCTURE_EMBED_ALLOWLIST).join(', ')})`,
          severity: 'error',
          code: 'structure/embed-not-allowed',
        });
      }
    }
  });

  // ----- box overlap & out-of-grid -------------------------------------
  // A wide node spans (col, row) + (col+1, row); two nodes sharing a cell,
  // or a cell poking outside the grid, is flagged as a warning (the
  // renderer's resolveLayout drops the wide flag visually).
  if (nodes.length > 0) {
    const gCols = (sc.grid?.cols as number | undefined) ?? 3;
    const gRows = (sc.grid?.rows as number | undefined) ?? 3;
    const occupied = new Map<string, string>();
    nodes.forEach((n, k) => {
      if (typeof n.col !== 'number' || typeof n.row !== 'number') return;
      const cells: [number, number][] = [[n.col, n.row]];
      if (n.wide === true) cells.push([n.col + 1, n.row]);
      for (const [c, r] of cells) {
        if (c < 0 || c >= gCols || r < 0 || r >= gRows) {
          issues.push({
            path: `${at}.nodes[${k}]`,
            message: `cell (col=${c}, row=${r}) is outside the ${gCols}×${gRows} grid`,
            severity: 'warning',
            code: 'structure/cell-out-of-grid',
          });
          continue;
        }
        const key = `${c},${r}`;
        const prior = occupied.get(key);
        if (prior !== undefined && prior !== n.id) {
          issues.push({
            path: `${at}.nodes[${k}]`,
            message: `box overlap — "${n.id}" and "${prior}" both occupy cell (col=${c}, row=${r})`,
            severity: 'warning',
            code: 'structure/box-overlap',
          });
        } else {
          occupied.set(key, n.id);
        }
      }
    });
  }

  // ----- edges: shape, ids, kind/strength ------------------------------
  const edges: StructureEdge[] = Array.isArray(sc.edges) ? sc.edges : [];
  if (sc.edges !== undefined && !Array.isArray(sc.edges)) {
    issues.push({
      path: `${at}.edges`,
      message: 'edges must be an array',
      severity: 'error',
      code: 'structure/bad-edges-shape',
    });
  } else {
    const edgeIds = new Set<string>();
    edges.forEach((e, k) => {
      const eAt = `${at}.edges[${k}]`;
      if (!e || typeof e !== 'object') {
        issues.push({
          path: eAt,
          message: 'edge must be an object {id, from, to}',
          severity: 'error',
          code: 'structure/bad-edge',
        });
        return;
      }
      if (typeof e.id !== 'string' || !e.id.trim()) {
        issues.push({
          path: `${eAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'structure/missing-edge-id',
        });
      } else if (edgeIds.has(e.id)) {
        issues.push({
          path: `${eAt}.id`,
          message: `duplicate edge id "${e.id}"`,
          severity: 'error',
          code: 'structure/duplicate-edge-id',
        });
      } else {
        edgeIds.add(e.id);
      }
      for (const f of ['from', 'to'] as const) {
        const v = e[f];
        if (typeof v !== 'string' || !v.trim()) {
          issues.push({
            path: `${eAt}.${f}`,
            message: 'missing node id',
            severity: 'error',
            code: 'structure/edge-missing-endpoint',
          });
        }
      }
      if (e.kind !== undefined && !isStringIn(e.kind, KNOBS_EDGE_KIND)) {
        issues.push({
          path: `${eAt}.kind`,
          message: `not a valid kind — one of: ${KNOBS_EDGE_KIND.join(', ')}`,
          severity: 'error',
          code: 'structure/bad-edge-kind',
        });
      }
      if (e.strength !== undefined) {
        if (!isStringIn(e.strength, KNOBS_EDGE_STRENGTH)) {
          issues.push({
            path: `${eAt}.strength`,
            message: `not a valid strength — one of: ${KNOBS_EDGE_STRENGTH.join(', ')}`,
            severity: 'error',
            code: 'structure/bad-edge-strength',
          });
        } else if (e.kind !== 'causes') {
          issues.push({
            path: `${eAt}.strength`,
            message: 'strength has meaning only on a `causes` edge',
            severity: 'error',
            code: 'structure/strength-force-fit',
          });
        }
      }
    });
  }

  return issues;
};

export default validate;
export type {StructureScene} from './_types';
