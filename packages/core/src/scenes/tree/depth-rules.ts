// Depthcheck rules contributed by the tree scene plugin.
//
// Ported behaviorally from the `tree-discriminates` block in
// packages/engine/cli/depthcheck.ts (around lines 387-412).
//
// The contract: a rooted tree carries meaning only when at least one
// level *branches*. A degenerate tree where every node has 0 or 1 child
// is a chain — and a chain is a list (or a progression), not a hierarchy.
// The classifier claim of a tree scene is that depth encodes a real axis;
// a chain encodes nothing the line of stages couldn't carry.
//
// The v2.5.x rule is film-wide ("count degenerate trees across the film")
// but the plugin protocol's scoping unit is the scene, so this rule fires
// per-scene with `scope: 'scene'` — semantically equivalent for any film
// (every degenerate tree still surfaces individually).

import type {DepthFinding, DepthRule, Scene} from '@docent/kit';

import type {TreeNodeSpec, TreeScene} from './validate';

const hasSiblings = (n: TreeNodeSpec | undefined): boolean => {
  if (!n) return false;
  const kids = Array.isArray(n.children) ? (n.children as TreeNodeSpec[]) : [];
  if (kids.length >= 2) return true;
  for (const c of kids) if (hasSiblings(c)) return true;
  return false;
};

const treeDiscriminates: DepthRule<Scene> = {
  id: 'tree-discriminates',
  description:
    'The tree branches — at least one node has siblings, so depth is hierarchical, not a chain',
  severity: 'error',
  scope: 'scene',
  check(scene): DepthFinding | null {
    if (scene.type !== 'tree') return null;
    const sc = scene as TreeScene;
    if (!sc.root) return null; // missing-root is caught by validate.ts
    if (hasSiblings(sc.root)) return null;
    const sceneId = sc.id ?? '(unnamed)';
    return {
      ruleId: 'tree-discriminates',
      path: `scenes[${sceneId}]`,
      severity: 'error',
      message:
        `tree scene "${sceneId}" is degenerate — every node has 0 or 1 child. A chain is a list, not a hierarchy.`,
      suggestion:
        'introduce branching at at least one level so depth encodes a real classification axis; if the structure is genuinely linear, prefer a `progression` scene (linear flow) or a `walkthrough` (sequential walk) over a tree.',
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<Scene>> = [treeDiscriminates];

export default depthRules;
