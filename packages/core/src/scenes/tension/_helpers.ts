// Inlined helpers for the tension scene.
//
// These mirror the v2.5.x engine's `glow` utility, the `STAGE` rectangle, the
// `resolveLayout` grid resolver, the `Node` shape, and the `activeBeatIndex`
// reader exactly. The v3.0 fan-out moves each scene into its own directory in
// @docent/core; the shared component infrastructure (SceneFrame, Narration,
// FittedText, glow, layout helpers, fonts) will be migrated by separate
// agents and reconciled by the integrator at merge time. For now we colocate
// the minimum the tension scene needs so the per-scene worktree builds clean
// without a dependency on `@docent/engine`.
//
// When the shared-infra migration lands, the tension scene will import these
// from @docent/core/_shared (or equivalent) and this file goes away.

/**
 * Translucent accent fills, for glows and panel washes. Mirrors
 * packages/engine/src/theme.ts:glow exactly.
 */
export const glow = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
};

/**
 * The stage: the rectangle within the 1920x1080 frame where diagrams live.
 * Mirrors packages/engine/src/engine/layout.ts:STAGE exactly.
 */
export const STAGE = {x: 235, y: 338, w: 1450, h: 560};

/**
 * A grid node, in the v2.5.x engine spec shape. The tension scene reads
 * `id`, `label`, `sub`, `accent`, `wide`, and `kind` (`risk` | `rejected`);
 * `col` and `row` are kept because the upstream `resolveLayout` walks them,
 * though the tension renderer itself ignores them in favour of kind-based
 * lane assignment. The remaining fields are honored generically so a tension
 * spec that *also* carries a structure/compare-style payload doesn't trip
 * type errors at the boundary.
 */
export type NodeRepr = 'box' | 'matrix' | 'vector' | 'grid' | 'code' | 'equation';

export interface Node {
  id: string;
  label: string;
  sub?: string;
  tag?: string;
  col: number;
  row: number;
  accent?: string;
  emphasis?: boolean;
  weight?: 'hero' | 'primary' | 'normal' | 'recede';
  wide?: boolean;
  /** tension scenes: a node can be a flagged risk or a rejected alternative. */
  kind?: 'risk' | 'rejected';
  as?: NodeRepr;
  cells?: (string | number)[][];
  expr?: string;
}

/**
 * Resolve a node grid against a hard overlap guarantee. Mirrors
 * packages/engine/src/engine/layout.ts:resolveLayout exactly.
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

/**
 * Which beat is on screen at a given (scene-relative) frame. Mirrors the
 * v2.5.x engine's `activeBeatIndex`, adapted to walk the kit's
 * BeatTimelineSlot[] (which exposes `startFrame` rather than the legacy
 * `from`).
 */
export const activeBeatIndex = (
  beats: ReadonlyArray<{readonly startFrame: number}>,
  frame: number,
): number => {
  for (let i = beats.length - 1; i >= 0; i--) {
    const b = beats[i];
    if (b && frame >= b.startFrame) return i;
  }
  return 0;
};
