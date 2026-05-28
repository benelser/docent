// Tension scene–local helpers — only the bits not consolidated into
// `../../_shared`. The shared chrome (glow, activeBeatIndex, FittedText,
// Narration, fonts) is now imported from `@bjelser/core/_shared`. Tension
// does NOT use SceneFrame — its whiteboard / sketch registers paint their
// own chrome and starfield (see component.tsx).
//
// `STAGE` (the diagram rectangle), `Node` (the v2.5 engine grid-node shape
// the tension scene reads), `NodeRepr` (the closed list of node
// representations), and `resolveLayout` (the grid resolver) stay scoped to
// tension — they describe the engine's grid-layout contract this scene
// honours; other scenes use the same STAGE constant but the rest of the
// surface is tension-only.

/**
 * The stage: the rectangle within the 1920x1080 frame where diagrams live.
 * Mirrors `packages/engine/src/engine/layout.ts:STAGE` exactly.
 */
export const STAGE = {x: 235, y: 338, w: 1450, h: 560};

/**
 * Node representation enum — the closed list of visual primitives a
 * structure node renders as. Tension reads this for parity at the engine
 * spec boundary (a tension spec carrying a `structure`-style payload should
 * not trip type errors).
 */
export type NodeRepr = 'box' | 'matrix' | 'vector' | 'grid' | 'code' | 'equation';

/**
 * A grid node, in the v2.5.x engine spec shape. The tension scene reads
 * `id`, `label`, `sub`, `accent`, `wide`, and `kind` (`risk` | `rejected`);
 * `col` and `row` are kept because the upstream `resolveLayout` walks them,
 * though the tension renderer itself ignores them in favour of kind-based
 * lane assignment. The remaining fields are honored generically so a tension
 * spec that *also* carries a structure/compare-style payload doesn't trip
 * type errors at the boundary.
 */
export interface Node {
  id: string;
  label: string;
  sub?: string | undefined;
  tag?: string | undefined;
  col: number;
  row: number;
  accent?: string | undefined;
  emphasis?: boolean | undefined;
  weight?: 'hero' | 'primary' | 'normal' | 'recede' | undefined;
  wide?: boolean | undefined;
  /** tension scenes: a node can be a flagged risk or a rejected alternative. */
  kind?: 'risk' | 'rejected' | undefined;
  as?: NodeRepr | undefined;
  cells?: (string | number)[][] | undefined;
  expr?: string | undefined;
}

/**
 * Resolve a node grid against a hard overlap guarantee. Mirrors
 * `packages/engine/src/engine/layout.ts:resolveLayout` exactly.
 *
 * Each node claims its primary cell (col, row); a wide one *requests* the
 * next cell over, but yields its `wide` flag if the request collides or
 * escapes the grid. The tension scene calls through this for parity with
 * other scene types (its layout is then re-driven by `kind`-based lane
 * assignment, but the resolved nodes flow through unchanged).
 */
export const resolveLayout = (nodes: Node[], cols: number): Node[] => {
  const owners = new Map<string, string>();
  for (const n of nodes) {
    if (typeof n.col === 'number' && typeof n.row === 'number') {
      owners.set(`${n.col},${n.row}`, n.id);
    }
  }
  return nodes.map((n) => {
    if (!n.wide) return n;
    const nextCol = (n.col ?? 0) + 1;
    const collision = owners.get(`${nextCol},${n.row}`);
    if (nextCol >= cols || (collision !== undefined && collision !== n.id)) {
      return {...n, wide: false};
    }
    return n;
  });
};
