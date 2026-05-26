// Tree scene–local helpers — only the bits not consolidated into
// `../../_shared`. The shared chrome (glow, activeBeatIndex, cadenceOffset,
// the palette resolvers, SceneFrame, Narration, FittedText, fonts) is now
// imported from `@docent/core/_shared`.
//
// `STAGE` (the diagram rectangle) stays scoped to tree; other scenes
// (chart, map, tension, timeline) re-declare the same constant in their own
// local helpers.

/**
 * The drawable region inside the SceneFrame chrome — the rectangle the
 * scene body owns. (1920×1080 stage; chrome takes the rest.) Mirrors
 * `packages/engine/src/engine/layout.ts:STAGE` exactly.
 */
export const STAGE = {x: 235, y: 338, w: 1450, h: 560};
