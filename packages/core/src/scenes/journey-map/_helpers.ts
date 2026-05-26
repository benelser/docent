// Inlined helpers for the journey-map scene.
//
// These mirror the v2.5.x engine's shared `glow` utility, the
// `activeBeatIndex` lookup, and a subset of the intent-knob helpers from
// packages/engine/src/engine/knobs.ts (cadenceOffset, cadenceSpringConfig,
// numericRevealMap, paletteGlowScale, paletteSceneHex). The fan-out moves
// each scene into its own directory in @docent/core; the shared component
// infrastructure (SceneFrame, Narration, FittedText, knobs, theme, fonts)
// will be migrated by separate agents and reconciled by the integrator at
// merge time. For now we colocate the minimum each scene needs so the
// per-scene worktree builds clean.
//
// When the shared-infra migration lands, the journey-map scene will import
// these from @docent/core/_shared (or equivalent) and this file goes away.

import type {Beat, BeatTimelineSlot, ResolvedStyle} from '@docent/kit';

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
 * Which beat is on screen at a given (scene-relative) frame. Mirrors the
 * v2.5.x engine's `activeBeatIndex`, adapted to walk the kit's
 * `BeatTimelineSlot[]` (which exposes `startFrame` rather than the legacy
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

// ----- cadence — the rhythm with which a beat's revealed items enter --------
//
// Migrated from packages/engine/src/engine/knobs.ts. A film that never sets
// `cadence` renders byte-identically to before any of this existed.

/** Frames of stagger between cascaded items. */
export const CASCADE_STEP = 5;

/**
 * The per-item entrance-frame offset for the item at declared `order`
 * within a beat's revealed set. `cascade` staggers; `together`/`snap` do
 * not.
 */
export const cadenceOffset = (
  cadence: Beat['cadence'],
  order: number,
): number => (cadence === 'cascade' ? Math.max(0, order) * CASCADE_STEP : 0);

/**
 * The spring config a revealed item's entrance uses. `snap` lowers the
 * mass for a sharper arrival; every other cadence keeps the engine's
 * original `{damping: 200, mass: 0.7}` so untouched films are unchanged.
 */
export const cadenceSpringConfig = (
  cadence: Beat['cadence'],
): {damping: number; mass: number} =>
  cadence === 'snap' ? {damping: 200, mass: 0.42} : {damping: 200, mass: 0.7};

// ----- numeric-reveal cadence (the list scenes) -----------------------------

/**
 * A `RevealEntry` is the engine's reading of how item `index` enters: the
 * frame its revealing beat starts (`from`), that beat's `cadence`, and the
 * item's `order` within that beat's newly-revealed batch (0 for the
 * batch's first item — so a `cascade` beat that reveals items 3,4,5
 * staggers them 0,1,2 regardless of how many items earlier beats
 * revealed).
 */
export type RevealEntry = {
  from: number;
  cadence: Beat['cadence'];
  order: number;
};

/**
 * Build, for a scene with numeric `reveal` beats, the `RevealEntry` of
 * every item index 0..count-1. `beats` is the scene's BeatTimelineSlot[].
 * An item never reached by any beat's count gets
 * `{from: 0, cadence: undefined, order: 0}` — exactly the engine's
 * original `revealFrameFor` fallback.
 *
 * Adapted from packages/engine/src/engine/knobs.ts:numericRevealMap to read
 * the kit's BeatTimelineSlot shape (the v2.5.x TimedBeat surfaced `from`
 * and `reveal`/`cadence` directly; here `startFrame` replaces `from` and
 * the beat's plugin-owned fields are reached through `slot.beat`).
 */
export const numericRevealMap = (
  beats: ReadonlyArray<BeatTimelineSlot>,
  count: number,
): RevealEntry[] => {
  const entries: RevealEntry[] = Array.from({length: count}, () => ({
    from: 0,
    cadence: undefined,
    order: 0,
  }));
  let revealedSoFar = 0;
  for (const slot of beats) {
    const rev = (slot.beat as {reveal?: unknown}).reveal;
    if (typeof rev !== 'number') continue;
    const upTo = Math.min(count, rev);
    for (let i = revealedSoFar; i < upTo; i++) {
      entries[i] = {
        from: slot.startFrame,
        cadence: slot.beat.cadence,
        order: i - revealedSoFar,
      };
    }
    if (upTo > revealedSoFar) revealedSoFar = upTo;
  }
  return entries;
};

// ----- palette — accent as meaning ------------------------------------------
//
// `palette` was a scene knob removed in v2.4.0; the renderer always calls
// these with `undefined` (the identity branch). Kept here so the scene's
// migrated source is byte-equivalent to the v2.5.x callsite.

/**
 * The glow-intensity multiplier a scene's palette implies. 1 (the
 * identity) when no palette is set — which, post-v2.4.0, is every caller.
 */
export const paletteGlowScale = (palette: undefined): number => {
  void palette;
  return 1;
};

/**
 * The resolved accent *hex* for the scene as a whole. With no `palette`
 * (the v2.4.0+ default state of every caller) this is exactly
 * `style.tokens.accent[sceneAccent ?? 'blue']` — preset-aware via the
 * resolved style's accent table.
 */
export const paletteSceneHex = (
  palette: undefined,
  sceneAccent: string | undefined,
  style: ResolvedStyle,
): string => {
  void palette;
  const key = sceneAccent ?? 'blue';
  const table = style.tokens.accent as unknown as Record<string, string>;
  return table[key] ?? table.blue ?? '#5cb6ff';
};
