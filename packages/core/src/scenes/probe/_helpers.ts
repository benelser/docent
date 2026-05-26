// Inlined helpers for the probe scene.
//
// MIRROR of `packages/engine/src/theme.ts` (ACCENTS, theme, glow) and the
// reveal/cadence helpers from `packages/engine/src/engine/knobs.ts`. The
// v3.0 fan-out moves each scene into its own directory in @docent/core; the
// shared infrastructure these constants/utilities live in (theme, knobs,
// engine/spec.activeBeatIndex) will be migrated by separate agents and
// reconciled by the integrator at merge time. For now we colocate the
// minimum the probe scene needs so the per-scene worktree builds clean.
//
// When the shared-infra migration lands, the probe scene will import these
// from @docent/core/_shared (or equivalent) and this file goes away.

import {spring} from 'remotion';
import type {ResolvedStyle} from '@docent/kit';

/**
 * The hardcoded accent fallback table — every preset re-declares these. The
 * probe scene reads `ACCENTS.rose` directly for its `flipped` marker, which
 * is intentionally a HARD-CODED semantic colour (not a preset token): the
 * "flipped" tag is the load-bearing signal of the scene and the engine
 * pins it to rose regardless of preset.
 *
 * Mirrors `packages/engine/src/theme.ts:ACCENTS` exactly.
 */
export const ACCENTS = {
  blue: '#5cb6ff',
  cyan: '#3fe0d0',
  green: '#5fe8a4',
  amber: '#ffc24d',
  rose: '#ff7d97',
  violet: '#b69cff',
} as const;

export type AccentKey = keyof typeof ACCENTS;

/**
 * The hard-coded chrome theme. Mirrors `packages/engine/src/theme.ts:theme`
 * exactly. Used by the probe scene's row chrome (panel washes, line
 * dividers, ink colours) so the migrated component reads byte-identically
 * to its engine source. When the shared-infra migration lands these flow
 * through `style.tokens.{bg,ink}` from the active preset.
 */
export const theme = {
  bg: {
    void: '#050607',
    base: '#0a0c10',
    panel: '#10141b',
    panelHi: '#171d27',
    line: '#252d3c',
    lineHi: '#3a4761',
  },
  ink: {
    hi: '#f3f5fa',
    mid: '#a7b0c2',
    low: '#6b7587',
    faint: '#454d5e',
  },
} as const;

/**
 * Translucent accent fills, for glows and panel washes. Mirrors
 * `packages/engine/src/theme.ts:glow` exactly.
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
// MIRROR of `packages/engine/src/engine/knobs.ts` — the cadence interpreters
// shape how a beat's revealed items enter (`together` shares the beat start
// frame, `cascade` staggers each by CASCADE_STEP, `snap` enters together on
// a sharper spring). A knob-free scene is byte-identical to the
// pre-knob behaviour.

export const CASCADE_STEP = 5; // frames of stagger between cascaded items

export type Cadence = 'together' | 'cascade' | 'snap' | undefined;

/** Per-item entrance-frame offset within a beat's revealed set. */
export const cadenceOffset = (cadence: Cadence, order: number): number =>
  cadence === 'cascade' ? Math.max(0, order) * CASCADE_STEP : 0;

/** Spring config used by a revealed item's entrance animation. */
export const cadenceSpringConfig = (
  cadence: Cadence,
): {damping: number; mass: number} =>
  cadence === 'snap'
    ? {damping: 200, mass: 0.42}
    : {damping: 200, mass: 0.7};

/** Re-export the spring helper so the component reads one import path. */
export {spring};

// ----- numeric-reveal cadence (the list scenes) -----------------------------
//
// MIRROR of `numericRevealMap` from `packages/engine/src/engine/knobs.ts`.
// Probe is one of the list scenes (its variations reveal by *count*, the
// numeric `reveal` form of Beat.reveal). The map gives each variation's
// revealing-beat frame, cadence, and batch order — exactly the engine's
// behaviour.

export type RevealEntry = {
  from: number;
  cadence: Cadence;
  order: number;
};

/**
 * A minimal shape the reveal map walks: each beat has a `from` (its scene-
 * relative start frame), an optional numeric `reveal` (how many items are
 * visible by the end of this beat), and an optional `cadence`. The probe
 * component adapts the kit's BeatTimelineSlot[] into this shape at the
 * callsite (BeatTimelineSlot.startFrame → from, beat.reveal → reveal,
 * beat.cadence → cadence).
 */
export type RevealBeat = {
  from: number;
  reveal?: number | readonly string[];
  cadence?: Cadence;
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
      entries[i] = {from: b.from, cadence: b.cadence, order: i - revealedSoFar};
    }
    if (upTo > revealedSoFar) revealedSoFar = upTo;
  }
  return entries;
};

// ----- palette — the chrome-accent resolvers --------------------------------
//
// MIRROR of `paletteSceneHex` + `paletteGlowScale` from
// `packages/engine/src/engine/knobs.ts`. The v2.4.0+ engine has no callsite
// that passes a defined palette to either helper — every renderer (probe
// included) calls them with `undefined`, which lands on the identity
// branch. Keeping the surface lets a future palette knob plug back in
// without another callsite migration.

/** The glow-intensity multiplier a palette implies. 1 (identity) when none. */
export const paletteGlowScale = (palette: undefined): number => {
  void palette;
  return 1;
};

/**
 * Resolve the scene's chrome accent hex against the resolved style's accent
 * table. Without a palette (the current default state of every caller) this
 * is exactly `style.tokens.accent.blue`.
 */
export const paletteSceneHex = (
  palette: undefined,
  sceneAccent: string | undefined,
  style?: ResolvedStyle,
): string => {
  void palette;
  const key = sceneAccent ?? 'blue';
  const table = (style?.tokens.accent ?? ACCENTS) as Record<string, string>;
  return table[key] ?? table.blue ?? ACCENTS.blue;
};
