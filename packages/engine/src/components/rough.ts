// Hand-drawn geometry via roughjs — the engine behind Excalidraw. Used by the
// `sketch` scenes. Everything is seeded, so the wobble is identical every
// frame (no flicker) and a shape can "draw on" by animating stroke-dashoffset.
import rough from 'roughjs';

const gen = rough.generator();

export type Stroke = {d: string};

const opts = (seed: number, roughness: number) => ({
  seed,
  roughness,
  bowing: 1.4,
  // generator-only; stroke styling is applied by the caller in SVG
  stroke: '#000',
  strokeWidth: 1,
  disableMultiStroke: false,
});

// A hand-drawn rounded-ish rectangle, returned as SVG path `d` strings.
export const roughRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  roughness = 1.1,
): string[] => {
  const d = gen.rectangle(x, y, w, h, opts(seed, roughness));
  return d.sets.map((s) => gen.opsToPath(s));
};

// A hand-drawn straight line.
export const roughLine = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
  roughness = 1.3,
): string[] => {
  const d = gen.line(x1, y1, x2, y2, opts(seed, roughness));
  return d.sets.map((s) => gen.opsToPath(s));
};

// A hand-drawn ellipse — for circling a risk, an arrowhead flourish, etc.
export const roughEllipse = (
  cx: number,
  cy: number,
  w: number,
  h: number,
  seed: number,
  roughness = 1.5,
): string[] => {
  const d = gen.ellipse(cx, cy, w, h, opts(seed, roughness));
  return d.sets.map((s) => gen.opsToPath(s));
};

// A scribbled cross-out — two rough strokes through a box (for a rejected idea).
export const roughCrossOut = (
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
): string[] => [
  ...roughLine(x, y, x + w, y + h, seed, 2),
  ...roughLine(x, y + h, x + w, y, seed + 1, 2),
];

// Total length of a path, for draw-on animation. Approximate is fine.
export const pathLen = (d: string): number => {
  // crude polyline length from the path's coordinate pairs
  const nums = d.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
  let len = 0;
  for (let i = 2; i + 1 < nums.length; i += 2) {
    len += Math.hypot(nums[i] - nums[i - 2], nums[i + 1] - nums[i - 1]);
  }
  return Math.max(len, 1);
};
