// Inlined helpers for the big-idea scene.
//
// Mirrors the v2.5.x engine's shared `glow` utility. The v3.0 fan-out moves
// each scene into its own directory in @docent/core; shared component
// infrastructure (SceneFrame, Narration, FittedText, fonts, glow) will be
// migrated by separate agents and reconciled by the integrator at merge
// time. For now we colocate the minimum each scene needs so the per-scene
// worktree builds clean.
//
// When the shared-infra migration lands, the big-idea scene will import these
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
