// Map scene–local helpers — only the bits not consolidated into
// `../../_shared`. The shared chrome (glow, activeBeatIndex, SceneFrame,
// Narration, FittedText, fonts) is now imported from `@bjelser/core/_shared`.
//
// `STAGE` (the rectangle every diagram type renders inside) is a per-scene
// geometry constant used by the map scene's topology and grid layouts;
// other scenes that use the same rectangle (chart, tension, timeline,
// tree) re-declare it in their own local helpers.

/**
 * The stage rectangle every diagram type renders inside.
 *
 * `topology` layouts treat this as the [0..1] domain a region's `pos` is
 * normalized over; `grid` layouts slice it into `gridSize.cols × gridSize.rows`
 * cells. Mirrors `packages/engine/src/engine/layout.ts:STAGE` exactly.
 */
export const STAGE = {x: 235, y: 338, w: 1450, h: 560};
