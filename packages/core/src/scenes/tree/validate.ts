// Per-scene structural validation for the `tree` scene.
//
// Mirrors the v2.5.x engine's tree-specific block in
// packages/engine/cli/validate.ts (the dedicated `if (sc.type === 'tree')`
// walk, around line 1487, plus the `required-body` entry around line
// 2552). Two layers of structural invariants the JSON Schema can't
// express:
//
//  1. Graph-shape ceilings — the renderer cannot fit > 5 levels or > 30
//     nodes legibly. Hard fail with the same wording the engine emits so
//     existing fixtures and golden test output don't regress.
//  2. Cross-node id uniqueness — every tree node id must be unique across
//     the recursion (beats `reveal` and `focus` arrays key off ids; a
//     duplicate makes the reveal map ambiguous).
//  3. Required-body floor — the root must carry at least one child. A
//     single node is not a hierarchy; the tree scene's argument is that
//     depth encodes an axis, and depth zero argues nothing.
//
// The `tree.children[].embed` allowlist (tree | compare | quantities) is
// enforced at the engine level (the cross-scene embed validator walks the
// nested scene shape, which only that layer can do). This per-scene
// validator focuses on the tree's own graph invariants.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

// Hard ceilings — past these the renderer's boxes shrink past legibility
// (depth) or the breadth axis goes thinner than label width (count). Same
// numbers the v2.5.x engine emits.
const TREE_MAX_DEPTH = 5;
const TREE_MAX_NODES = 30;

// Closed accent allowlist — mirrors v2.5.x ACCENTS in validate.ts. A
// per-node `accent` outside this list is rejected so the renderer's
// `accentOf` lookup never misses.
const ACCENTS = ['blue', 'cyan', 'green', 'amber', 'rose', 'violet'];

// The tree's recursive node shape. The kit's Scene type carries an open
// `[key: string]: unknown` index; we narrow to this shape for the walk.
export interface TreeNodeSpec {
  id?: unknown;
  label?: unknown;
  sub?: unknown;
  accent?: unknown;
  children?: unknown;
  embed?: unknown;
}

export interface TreeScene extends Scene {
  type: 'tree';
  root?: TreeNodeSpec;
  orientation?: 'vertical' | 'horizontal';
  kicker?: string;
  heading?: string;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const validate = (
  scene: TreeScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;

  // orientation — closed enum. The renderer branches on this value; an
  // unknown value would silently fall through to the vertical default.
  if (
    scene.orientation !== undefined &&
    scene.orientation !== 'vertical' &&
    scene.orientation !== 'horizontal'
  ) {
    issues.push({
      path: `${at}.orientation`,
      message: 'orientation must be "vertical" or "horizontal"',
      severity: 'error',
      code: 'tree/orientation-invalid',
    });
  }

  // Required-body floor — the root must exist and must carry at least one
  // child. JSON Schema enforces `required: ['root']` for the presence; the
  // "≥ 1 child" check is the structural invariant only this layer can
  // assert (the engine's required-body table emits the same wording).
  const root = scene.root;
  if (!root || !isPlainObject(root)) {
    issues.push({
      path: `${at}.root`,
      message: 'tree requires a root tree-node {id, label, children}',
      severity: 'error',
      code: 'tree/missing-root',
    });
    return issues;
  }

  if (!Array.isArray((root as TreeNodeSpec).children) || ((root as TreeNodeSpec).children as unknown[]).length < 1) {
    issues.push({
      path: `${at}.root`,
      message: 'tree root must carry at least 1 child — a single node is not a hierarchy',
      severity: 'error',
      code: 'tree/root-must-branch',
    });
  }

  // Recursive walk — id uniqueness, label/accent/sub shape, and the two
  // graph-shape ceilings. We emit each ceiling once (the first overflow)
  // so a 50-node tree doesn't drown the report in 20 identical issues.
  const treeIds = new Set<string>();
  let nodeCount = 0;
  let depthOverflow = false;
  let nodeOverflow = false;

  const walk = (n: TreeNodeSpec, path: string, depth: number): void => {
    nodeCount++;
    if (nodeCount > TREE_MAX_NODES && !nodeOverflow) {
      issues.push({
        path: `${at}.root`,
        message: `tree exceeds ${TREE_MAX_NODES} nodes — the breadth axis goes thinner than label width past that`,
        severity: 'error',
        code: 'tree/too-many-nodes',
      });
      nodeOverflow = true;
    }
    if (depth > TREE_MAX_DEPTH - 1) {
      if (!depthOverflow) {
        issues.push({
          path,
          message: `tree exceeds ${TREE_MAX_DEPTH} levels — the renderer's boxes shrink past legibility past that`,
          severity: 'error',
          code: 'tree/too-deep',
        });
        depthOverflow = true;
      }
    }

    if (typeof n.id !== 'string' || !n.id.trim()) {
      issues.push({
        path: `${path}.id`,
        message: 'tree-node id must be a non-empty string',
        severity: 'error',
        code: 'tree/node-id-missing',
      });
    } else if (treeIds.has(n.id)) {
      issues.push({
        path: `${path}.id`,
        message: `duplicate tree-node id "${n.id}" — every id must be unique across the tree`,
        severity: 'error',
        code: 'tree/duplicate-id',
      });
    } else {
      treeIds.add(n.id);
    }

    if (typeof n.label !== 'string' || !n.label.trim()) {
      issues.push({
        path: `${path}.label`,
        message: 'tree-node label must be a non-empty string',
        severity: 'error',
        code: 'tree/node-label-missing',
      });
    }

    if (n.sub !== undefined && (typeof n.sub !== 'string' || !(n.sub as string).trim())) {
      issues.push({
        path: `${path}.sub`,
        message: 'sub must be a non-empty string when present',
        severity: 'error',
        code: 'tree/node-sub-empty',
      });
    }

    if (n.accent !== undefined && (typeof n.accent !== 'string' || !ACCENTS.includes(n.accent as string))) {
      issues.push({
        path: `${path}.accent`,
        message: `unknown accent "${String(n.accent)}"`,
        severity: 'error',
        code: 'tree/node-accent-unknown',
      });
    }

    if (n.children !== undefined) {
      if (!Array.isArray(n.children)) {
        issues.push({
          path: `${path}.children`,
          message: 'children must be an array of tree-nodes',
          severity: 'error',
          code: 'tree/children-not-array',
        });
      } else {
        (n.children as unknown[]).forEach((c, k) => {
          if (!isPlainObject(c)) {
            issues.push({
              path: `${path}.children[${k}]`,
              message: 'tree-node must be an object {id, label, children?}',
              severity: 'error',
              code: 'tree/node-not-object',
            });
            return;
          }
          walk(c as TreeNodeSpec, `${path}.children[${k}]`, depth + 1);
        });
      }
    }
  };

  walk(root as TreeNodeSpec, `${at}.root`, 0);

  return issues;
};

export default validate;
