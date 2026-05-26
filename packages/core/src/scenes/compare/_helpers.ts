// Inlined helpers for the compare scene.
//
// These mirror the v2.5.x engine's `glow` utility (theme.ts), the
// `activeBeatIndex` reader (engine/spec.ts), and the cadence + palette
// knob interpreters (engine/knobs.ts). The v3.0 fan-out moves each scene
// into its own directory in @docent/core; the shared component
// infrastructure (SceneFrame, Narration, FittedText, theme, fonts, knobs)
// will be migrated by separate agents and reconciled by the integrator at
// merge time. For now we colocate the minimum each scene needs so the
// per-scene worktree builds clean.
//
// When the shared-infra migration lands, the compare scene will import
// these from @docent/core/_shared (or equivalent) and this file goes away.

import {spring} from 'remotion';
import type {ResolvedStyle} from '@docent/kit';

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

// ----- cadence — the rhythm with which a beat's revealed items enter --------
//
// Mirrors packages/engine/src/engine/knobs.ts exactly. A film that sets no
// cadence renders byte-identically to the original.

const CASCADE_STEP = 5; // frames of stagger between cascaded items

export type BeatCadence = 'together' | 'cascade' | 'snap' | undefined;

export const cadenceOffset = (cadence: BeatCadence, order: number): number =>
  cadence === 'cascade' ? Math.max(0, order) * CASCADE_STEP : 0;

export const cadenceSpringConfig = (
  cadence: BeatCadence,
): {damping: number; mass: number} =>
  cadence === 'snap'
    ? {damping: 200, mass: 0.42}
    : {damping: 200, mass: 0.7};

// ----- numeric-reveal cadence (the list scenes) -----------------------------
//
// Mirrors packages/engine/src/engine/knobs.ts:numericRevealMap. compare
// reveals rows by *count* (a numeric `reveal` — "the first N rows are
// visible"); this builds the per-row RevealEntry telling each row which
// beat revealed it, that beat's cadence, and the row's order within the
// batch newly-revealed by that beat.

export type RevealEntry = {
  from: number;
  cadence: BeatCadence;
  order: number;
};

type RevealBeat = {
  from: number;
  reveal?: number | readonly string[] | undefined;
  cadence?: BeatCadence;
};

export const numericRevealMap = (
  beats: ReadonlyArray<RevealBeat>,
  count: number,
): RevealEntry[] => {
  const entries: RevealEntry[] = Array.from({length: count}, () => ({
    from: 0,
    cadence: undefined,
    order: 0,
  }));
  let revealedSoFar = 0;
  for (const b of beats) {
    if (typeof b.reveal !== 'number') continue;
    const upTo = Math.min(count, b.reveal);
    for (let i = revealedSoFar; i < upTo; i++) {
      entries[i] = {
        from: b.from,
        cadence: b.cadence,
        order: i - revealedSoFar,
      };
    }
    if (upTo > revealedSoFar) revealedSoFar = upTo;
  }
  return entries;
};

// ----- palette — accent as meaning ------------------------------------------
//
// Mirrors packages/engine/src/engine/knobs.ts. `palette` was removed in
// v2.4.0; every caller in v2.5.x passes `undefined`, which collapses each
// helper to its identity branch. The helpers survive in shape so a future
// re-introduction of a palette knob (or an equivalent style-intent
// dimension) plugs back in without another callsite migration.

export const paletteGlowScale = (_palette: undefined): number => 1;

export const paletteSceneHex = (
  _palette: undefined,
  _sceneAccent: string | undefined,
  style: ResolvedStyle,
): string => {
  const table = style.tokens.accent as unknown as Record<string, string>;
  return table.blue ?? '#5cb6ff';
};

// ----- spring re-export -----------------------------------------------------
// Re-exported for callsite convenience; the cadence helpers above use it
// internally too. (Keeping spring in one place avoids two imports at every
// callsite.)
export {spring};
