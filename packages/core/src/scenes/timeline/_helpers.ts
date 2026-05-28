// Timeline scene–local helpers — only the bits not consolidated into
// `../../_shared`. The shared chrome (glow, activeBeatIndex, SceneFrame,
// Narration, FittedText, palette resolvers, fonts) is now imported from
// `@bjelser/core/_shared`.
//
// `STAGE` (the rectangle every diagram type renders inside) stays scoped
// to timeline; other scenes (chart, map, tension, tree) re-declare the
// same constant in their own local helpers.

/**
 * The stage rectangle within the 1920x1080 frame where diagrams live.
 * Mirrors `packages/engine/src/engine/layout.ts:STAGE` exactly.
 */
export const STAGE = {x: 235, y: 338, w: 1450, h: 560};
