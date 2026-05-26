// Shared chrome helpers — `glow`, the `ACCENTS` accent table, the dark-console
// `theme` base tokens, `activeBeatIndex` (BeatTimelineSlot-aware), the cadence
// helpers (`cadenceOffset`, `cadenceSpringConfig`), the numeric-reveal map
// (`numericRevealMap`), and the palette resolvers (`paletteSceneHex`,
// `paletteGlowScale`, `paletteAccentKey`).
//
// These mirror the v2.5.x engine's shared utilities (`packages/engine/src/theme.ts`
// and `packages/engine/src/engine/knobs.ts`), adapted to the kit's
// BeatTimelineSlot shape where applicable. The `palette` knob was removed in
// v2.4.0; every renderer calls the palette helpers with `undefined`, the
// identity branch — but the shape is preserved so a future re-introduction
// (or an equivalent style-intent dimension) plugs back in without callsite
// migration.

import {spring} from 'remotion';
import type {Beat, BeatCadence, ResolvedStyle} from '@docent/kit';

// ---------------------------------------------------------------------------
// Theme — `glow` and the `ACCENTS` accent table.
//
// Mirrors `packages/engine/src/theme.ts` exactly. `ACCENTS` is the
// byte-identical hardcoded fallback the engine uses when `style.tokens.accent`
// is absent; in the plugin world `style` is always supplied, but the literal
// map stays so an accent key resolves the same hex with or without a style
// bundle.
// ---------------------------------------------------------------------------

export const ACCENTS = {
  blue: '#5cb6ff',
  cyan: '#3fe0d0',
  green: '#5fe8a4',
  amber: '#ffc24d',
  rose: '#ff7d97',
  violet: '#b69cff',
} as const;

export type AccentKey = keyof typeof ACCENTS;

/** Translucent accent fills, for glows and panel washes. */
export const glow = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
};

/**
 * The hard-coded chrome theme — the base set of tokens the legacy palette
 * logic falls back to. Mirrors `packages/engine/src/theme.ts:theme` exactly.
 * Used by scenes (e.g. probe) whose chrome reads from a base set when a
 * resolved style isn't available; under the v3 architecture every scene
 * receives a `ResolvedStyle` and reads through `style.tokens.{bg, ink}`,
 * but the literal stays so the legacy callsite shape is preserved.
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

// ---------------------------------------------------------------------------
// activeBeatIndex — which beat is on screen at a given (scene-relative)
// frame. The kit's `BeatTimelineSlot` exposes `startFrame`; the helper walks
// any shape that surfaces `startFrame`.
// ---------------------------------------------------------------------------

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
// Mirrors `packages/engine/src/engine/knobs.ts` exactly. A beat may reveal a
// *set* of items (StructureScene's nodes/edges, or the numeric `reveal` count
// the list scenes read). `cadence` shapes how that set arrives:
//   together (default) — every revealed item shares the beat's start frame.
//   cascade            — each item's entrance is staggered by CASCADE_STEP
//                         frames in declared order, so the set unrolls.
//   snap               — all items enter together but on a sharper, lower-
//                         mass spring, so they arrive crisper.
//
// A knob-free scene is byte-identical to the pre-knob behaviour.
// ---------------------------------------------------------------------------

/** Frames of stagger between cascaded items. */
export const CASCADE_STEP = 5;

/** Per-item entrance-frame offset for the item at declared `order`. */
export const cadenceOffset = (
  cadence: Beat['cadence'],
  order: number,
): number => (cadence === 'cascade' ? Math.max(0, order) * CASCADE_STEP : 0);

/** Spring config used by a revealed item's entrance animation. */
export const cadenceSpringConfig = (
  cadence: Beat['cadence'],
): {damping: number; mass: number} =>
  cadence === 'snap'
    ? {damping: 200, mass: 0.42}
    : {damping: 200, mass: 0.7};

/**
 * The eased 0..1 entrance progress for one revealed item. `enterFrame` is the
 * beat's reveal frame; `order` is the item's index in the beat's declared
 * reveal set (0 for the first). When `cadence` is undefined / `together` and
 * `order` is 0 this is identical to the original
 *   spring({frame: frame - enterFrame, fps, config: {damping: 200, mass: 0.7}})
 * every list scene used — so a knob-free film is byte-identical.
 */
export const cadenceAppear = (
  cadence: Beat['cadence'],
  frame: number,
  enterFrame: number,
  order: number,
  fps: number,
): number => {
  const local = frame - enterFrame - cadenceOffset(cadence, order);
  if (local <= 0) return 0;
  return spring({frame: local, fps, config: cadenceSpringConfig(cadence)});
};

// ---------------------------------------------------------------------------
// numericRevealMap — the per-item entry schedule for list scenes.
//
// Mirrors `packages/engine/src/engine/knobs.ts:numericRevealMap` exactly.
// The list scenes (progression / compare / quantities / probe / journey-map)
// reveal by *count* (a numeric `reveal` — "the first N items are visible").
// This builds, for each item index 0..count-1, the frame its revealing beat
// starts (`from`), that beat's `cadence`, and the item's `order` within
// that beat's newly-revealed batch (0 for the batch's first item).
//
// `beats` carries a minimal `{from, reveal, cadence}` shape — scene callers
// adapt their BeatTimelineSlot[] at the call site, mapping
// `slot.startFrame → from`, `slot.beat.reveal → reveal`,
// `slot.beat.cadence → cadence`.
// ---------------------------------------------------------------------------

export type RevealEntry = {
  from: number;
  cadence: Beat['cadence'];
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
// Palette resolvers — accent as meaning.
//
// `palette` was a scene knob, removed in v2.4.0 with the rest of the Phase-1
// intent-knob system. Accent selection now flows from `FilmSpec.style`
// through `ResolvedStyle.tokens.accent`; the helpers below survive as the
// preset-aware accent lookup, with their `palette` argument typed as the
// closed enum (kept here as the source-of-truth name) but always called with
// `undefined` from every renderer — the identity branch.
//
// Keeping the helper shape lets a future re-introduction of a palette knob
// plug back in without another callsite migration. Today the runtime
// behaviour is `accent(key)` against the preset's accent table — preset-
// aware, palette-blind.
// ---------------------------------------------------------------------------

export type PaletteName = 'cool' | 'warm' | 'signal' | 'mono';

type PaletteFamily = {accents: AccentKey[]; glowScale: number};

const PALETTES: Record<PaletteName, PaletteFamily> = {
  cool: {accents: ['blue', 'cyan', 'violet'], glowScale: 0.7},
  warm: {accents: ['amber', 'rose'], glowScale: 1.0},
  // signal — rose leads (the alarm colour), amber is the only secondary, so a
  // signal scene reads hot. High glow: this palette is meant to draw the eye.
  signal: {accents: ['rose', 'amber'], glowScale: 1.35},
  // mono — one accent, glow near-zero: the austere, flat palette.
  mono: {accents: ['blue'], glowScale: 0.12},
};

/**
 * The glow-intensity multiplier a scene's palette implies. 1 (the identity)
 * when no palette is set — which, post-v2.4.0, is every caller.
 */
export const paletteGlowScale = (palette: PaletteName | undefined): number =>
  palette ? PALETTES[palette].glowScale : 1;

/**
 * Resolve an accent *key* under a scene's palette. Without a palette this is
 * the identity — `ownAccent` (or the scene default, today always undefined →
 * `'blue'`) is returned unchanged.
 *
 * With a palette, the family biases selection. `index` lets a scene spread a
 * set of elements across the family (node 0 → family[0], node 1 → family[1],
 * …, wrapping); the element's own declared accent still wins when it already
 * falls inside the family, so an author's explicit choice is kept.
 */
export const paletteAccentKey = (
  palette: PaletteName | undefined,
  sceneAccent: string | undefined,
  ownAccent: string | undefined,
  index = 0,
): string => {
  if (!palette) return ownAccent ?? sceneAccent ?? 'blue';
  const fam = PALETTES[palette].accents;
  if (ownAccent && (fam as readonly string[]).includes(ownAccent)) return ownAccent;
  return fam[((index % fam.length) + fam.length) % fam.length] ?? 'blue';
};

/**
 * The resolved accent *hex* for the scene as a whole. Used for the scene's
 * chrome (SceneFrame light, kicker). With no `palette` (the v2.4.0+ default
 * state of every caller) this is exactly `style.tokens.accent[sceneAccent
 * ?? 'blue']`.
 *
 * When `style` is supplied the lookup goes through `style.tokens.accent` —
 * the preset's accent table — so a preset that redefines `cyan` reaches
 * every scene. When `style` is omitted the helper falls back to the
 * hardcoded `ACCENTS` map.
 */
export const paletteSceneHex = (
  palette: PaletteName | undefined,
  sceneAccent: string | undefined,
  style?: ResolvedStyle,
): string => {
  const key = paletteAccentKey(palette, sceneAccent, sceneAccent, 0);
  const table = (style?.tokens.accent ?? ACCENTS) as Record<string, string>;
  return table[key] ?? table.blue ?? ACCENTS.blue;
};
