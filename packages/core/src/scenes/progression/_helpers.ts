// Inlined helpers for the progression scene.
//
// These mirror the v2.5.x engine's shared utilities — `glow` from
// engine/theme, `activeBeatIndex` from engine/spec, and the cadence /
// palette helpers from engine/knobs — that ProgressionScene reads. The
// v3.0 fan-out moves each scene into its own directory in @docent/core;
// the shared component infrastructure will be migrated by separate agents
// and reconciled by the integrator at merge time. For now we colocate the
// minimum the progression scene needs so the per-scene worktree builds
// clean.
//
// When the shared-infra migration lands, the progression scene will import
// these from @docent/core/_shared (or equivalent) and this file goes away.

import {spring} from 'remotion';
import type {BeatCadence, ResolvedStyle} from '@docent/kit';

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
 * The hardcoded ACCENTS fallback for paletteSceneHex when no resolved
 * style is provided. Mirrors packages/engine/src/theme.ts:ACCENTS exactly.
 */
export const ACCENTS = {
  blue: '#5cb6ff',
  cyan: '#3fe0d0',
  green: '#5fe8a4',
  amber: '#ffc24d',
  rose: '#ff7d97',
  violet: '#b69cff',
} as const;

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

// ---------------------------------------------------------------------------
// Cadence — the rhythm with which a beat's revealed items enter.
//
// Mirrors packages/engine/src/engine/knobs.ts cadence helpers exactly. A
// beat may reveal a *set* of items (the numeric `reveal` count progression
// reads):
//   together (default) — every revealed item shares the beat's start frame.
//   cascade            — each item's entrance is staggered by CASCADE_STEP
//                         frames in declared order, so the set unrolls.
//   snap               — all items enter together but on a sharper, lower-
//                         mass spring, so they arrive crisper.
// ---------------------------------------------------------------------------

export const CASCADE_STEP = 5; // frames of stagger between cascaded items

export const cadenceOffset = (
  cadence: BeatCadence | undefined,
  order: number,
): number => (cadence === 'cascade' ? Math.max(0, order) * CASCADE_STEP : 0);

export const cadenceSpringConfig = (
  cadence: BeatCadence | undefined,
): {damping: number; mass: number} =>
  cadence === 'snap'
    ? {damping: 200, mass: 0.42}
    : {damping: 200, mass: 0.7};

// ---------------------------------------------------------------------------
// Numeric-reveal cadence — progression / compare / quantities / probe.
//
// Mirrors packages/engine/src/engine/knobs.ts:numericRevealMap exactly. A
// `RevealEntry` records, for an item at index i: the frame its revealing
// beat starts (`from`), that beat's cadence, and the item's order within
// that beat's newly-revealed batch (0 for the batch's first item).
// ---------------------------------------------------------------------------

export type RevealEntry = {
  from: number;
  cadence: BeatCadence | undefined;
  order: number;
};

export const numericRevealMap = (
  beats: ReadonlyArray<{
    from: number;
    reveal?: number | readonly string[] | undefined;
    cadence?: BeatCadence | undefined;
  }>,
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

// ---------------------------------------------------------------------------
// Palette — accent as meaning.
//
// Mirrors packages/engine/src/engine/knobs.ts palette helpers. The palette
// knob was removed in v2.4.0; every renderer calls these with `undefined`
// (the identity branch). The shape is kept so a future re-introduction of
// a palette knob plugs back in without another callsite migration.
// ---------------------------------------------------------------------------

export type PaletteName = 'cool' | 'warm' | 'signal' | 'mono';

type PaletteFamily = {accents: ReadonlyArray<keyof typeof ACCENTS>; glowScale: number};

const PALETTES: Record<PaletteName, PaletteFamily> = {
  cool: {accents: ['blue', 'cyan', 'violet'], glowScale: 0.7},
  warm: {accents: ['amber', 'rose'], glowScale: 1.0},
  signal: {accents: ['rose', 'amber'], glowScale: 1.35},
  mono: {accents: ['blue'], glowScale: 0.12},
};

export const paletteGlowScale = (palette: PaletteName | undefined): number =>
  palette ? PALETTES[palette].glowScale : 1;

export const paletteAccentKey = (
  palette: PaletteName | undefined,
  sceneAccent: string | undefined,
  ownAccent: string | undefined,
  index = 0,
): string => {
  if (!palette) return ownAccent ?? sceneAccent ?? 'blue';
  const fam = PALETTES[palette].accents;
  if (ownAccent && (fam as ReadonlyArray<string>).includes(ownAccent)) return ownAccent;
  return fam[((index % fam.length) + fam.length) % fam.length] ?? 'blue';
};

export const paletteSceneHex = (
  palette: PaletteName | undefined,
  sceneAccent: string | undefined,
  style?: ResolvedStyle,
): string => {
  const key = paletteAccentKey(palette, sceneAccent, sceneAccent, 0);
  const table = (style?.tokens.accent ?? ACCENTS) as Record<string, string>;
  return table[key] ?? table.blue ?? ACCENTS.blue;
};

// Re-export spring for component callers that need it alongside these helpers
// (keeps the local helper import surface compact).
export {spring};
