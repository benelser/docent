// Layout math — turns a node's grid cell into pixel geometry, and computes
// where an arrow should meet a box. Mirrors packages/engine/src/engine/layout.ts
// exactly. Pure: no scene knows its own pixels until this module hands them
// the rectangle.

import type {StructureNode} from './_types';

// The stage: the rectangle within the 1920x1080 frame where diagrams live.
export const STAGE = {x: 235, y: 338, w: 1450, h: 560};

export type Box = {cx: number; cy: number; w: number; h: number};

const NODE_W = 332;
const NODE_W_WIDE = 516;
const NODE_H = 132;
const CELL_GUTTER = 26; // pixels between adjacent boxes — must be > 0 always

export const nodeSize = (n: StructureNode): {w: number; h: number} => ({
  w: n.wide ? NODE_W_WIDE : NODE_W,
  h: NODE_H,
});

// Grid cell center. `col`/`row` may be fractional (e.g. col 1.5 to centre a
// node between two columns above it).
export const cellCenter = (
  col: number,
  row: number,
  cols: number,
  rows: number,
): {cx: number; cy: number} => ({
  cx: STAGE.x + ((col + 0.5) / cols) * STAGE.w,
  cy: STAGE.y + ((row + 0.5) / rows) * STAGE.h,
});

// Box geometry with a hard overlap guarantee.
//
// The default NODE_W and NODE_W_WIDE constants were chosen for a 3-col grid
// (cellW ≈ 483). On a tighter grid, a 332-wide box overlaps its neighbours;
// NODE_W_WIDE (516) overlaps a 3-col grid even at the original size. Cap the
// box to the cell's available pixels, minus a gutter. A wide box spans two
// cells. The renderer (Card) then auto-fits text inside the resulting box.
const clampedBoxWidth = (n: StructureNode, cols: number): number => {
  const cellW = STAGE.w / cols;
  const desired = n.wide ? NODE_W_WIDE : NODE_W;
  const maxAllowed = (n.wide ? cellW * 2 : cellW) - CELL_GUTTER;
  return Math.min(desired, Math.max(180, maxAllowed));
};

export const nodeBox = (n: StructureNode, cols: number, rows: number): Box => {
  const {cx, cy} = cellCenter(n.col, n.row, cols, rows);
  const w = clampedBoxWidth(n, cols);
  return {cx, cy, w, h: NODE_H};
};

// Render-time guarantee: a card can never visually overlap another, even if
// the spec's `wide` flag would put two cards on the same cell, or push one
// outside the grid. The validator rejects the bad spec; this is the
// belt-and-braces so a bad film still cannot render with overlapping boxes.
export const resolveLayout = (
  nodes: StructureNode[],
  cols: number,
): StructureNode[] => {
  // Auto-fill col/row for nodes that omit them. A new user pasting a spec
  // from `docent init` shouldn't have to think about grid positions before
  // they see their first render. Strategy: walk the nodes in spec order,
  // hand each unpositioned node the next free cell in row-major order
  // across the requested cols. Nodes that DO specify col/row are honored
  // verbatim and reserve their slot first so auto-positioned nodes flow
  // around them.
  const taken = new Set<string>();
  for (const n of nodes) {
    if (typeof n.col === 'number' && typeof n.row === 'number') {
      taken.add(`${n.col},${n.row}`);
    }
  }
  let cursor = 0;
  const nextFree = (): {col: number; row: number} => {
    while (true) {
      const col = cursor % cols;
      const row = Math.floor(cursor / cols);
      cursor++;
      if (!taken.has(`${col},${row}`)) {
        taken.add(`${col},${row}`);
        return {col, row};
      }
    }
  };
  const positioned = nodes.map((n) => {
    if (typeof n.col === 'number' && typeof n.row === 'number') return n;
    const {col, row} = nextFree();
    return {...n, col, row};
  });

  // Existing wide-collision pass — preserved.
  const owners = new Map<string, string>();
  for (const n of positioned) {
    if (typeof n.col === 'number' && typeof n.row === 'number') {
      owners.set(`${n.col},${n.row}`, n.id);
    }
  }
  return positioned.map((n) => {
    if (!n.wide) return n;
    const nextCol = (n.col ?? 0) + 1;
    const collision = owners.get(`${nextCol},${n.row}`);
    if (nextCol >= cols || (collision !== undefined && collision !== n.id)) {
      return {...n, wide: false};
    }
    return n;
  });
};

// Point where the ray from a box centre toward (tx,ty) exits the box edge.
// Unlike snapping to a corner, this lands on the true edge — so stacked boxes
// connect at their face midpoints.
export const edgePoint = (
  box: Box,
  tx: number,
  ty: number,
): {x: number; y: number} => {
  const dx = tx - box.cx;
  const dy = ty - box.cy;
  if (dx === 0 && dy === 0) return {x: box.cx, y: box.cy};
  const sx = dx !== 0 ? box.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? box.h / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy);
  return {x: box.cx + dx * t, y: box.cy + dy * t};
};

// A straight-line connector path, trimmed to both boxes' edges, with a small
// gap so the arrowhead doesn't kiss the box.
export const connectorPath = (
  from: Box,
  to: Box,
  gap = 9,
): {d: string; start: {x: number; y: number}; end: {x: number; y: number}} => {
  const s = edgePoint(from, to.cx, to.cy);
  const e = edgePoint(to, from.cx, from.cy);
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const start = {x: s.x + ux * gap, y: s.y + uy * gap};
  const end = {x: e.x - ux * gap, y: e.y - uy * gap};
  return {d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, start, end};
};

// A curved connector (used for escalation / feedback edges). Bulges out
// perpendicular to the chord so it reads as a separate, returning path.
export const curvedPath = (
  from: Box,
  to: Box,
  bulge = 150,
): {d: string; mid: {x: number; y: number}; end: {x: number; y: number}} => {
  const s = edgePoint(from, from.cx - 1, from.cy);
  const e = edgePoint(to, to.cx - 1, to.cy);
  const cx = (s.x + e.x) / 2 - bulge;
  const cy = (s.y + e.y) / 2;
  return {
    d: `M ${s.x} ${s.y} Q ${cx} ${cy} ${e.x} ${e.y}`,
    mid: {x: cx, y: cy},
    end: e,
  };
};
