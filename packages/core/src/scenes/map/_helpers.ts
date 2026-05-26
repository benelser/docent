// Inlined helpers for the map scene.
//
// MIRROR of the engine's shared utilities (glow, STAGE, activeBeatIndex). The
// v3.0 fan-out moves each scene into its own directory in @docent/core; the
// shared component infrastructure (SceneFrame, Narration, FittedText,
// STAGE, glow, fonts, activeBeatIndex) will be migrated by separate agents
// and reconciled by the integrator at merge time. For now we colocate the
// minimum each scene needs so the per-scene worktree builds clean.
//
// When the shared-infra migration lands, the map scene will import these
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
 * The stage rectangle every diagram type renders inside. Mirrors
 * packages/engine/src/engine/layout.ts:STAGE exactly.
 *
 * `topology` layouts treat this as the [0..1] domain a region's `pos` is
 * normalized over; `grid` layouts slice it into `gridSize.cols × gridSize.rows`
 * cells.
 */
export const STAGE = {x: 235, y: 338, w: 1450, h: 560};

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
