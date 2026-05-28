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

import {interpolate, spring} from 'remotion';
import type {Beat, BeatCadence, ResolvedStyle} from '@bjelser/kit';

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

// ---------------------------------------------------------------------------
// tweenValue — the engine's named-value resolver, ported to BeatTimelineSlot.
//
// Mirrors `packages/engine/src/engine/spec.ts:tweenValue` exactly, but reads
// over the kit's `BeatTimelineSlot[]` (`startFrame` / `frames` / `beat`)
// rather than the engine's runtime `TimedBeat[]` (`from` /
// `durationInFrames` / inline).
//
// The chart scene's bar-height and point-marker x, and the quantities
// scene's `BoundValue` count-up, both read through this. A beat's `set`
// directive drives the value, easing across the beat's frame span.
//
// The kit's structural `Beat` type doesn't model `set: Record<string,
// number | Tween>` — but the runtime data flowing into scene components
// still carries the engine's wider runtime shape via Beat's open index
// signature. We read through narrow casts at the seam.
// ---------------------------------------------------------------------------

/** A tween: the targeted value of a beat's `set` directive. */
export type Tween = {
  to: number;
  from?: number;
  ease?: 'linear' | 'spring' | 'accelerate' | 'settle';
};

/** Output format for a tweened number. */
export type MetricFormat = 'int' | 'float1' | 'percent';

/**
 * A metric — a figure card whose displayed number IS a tweened value.
 * `bind` names a value driven by beats' `set` directives; the engine
 * projects it at the current frame. `col`/`row` place it on a grid.
 *
 * Mirrors `packages/engine/src/engine/spec.ts:Metric` exactly.
 */
export type Metric = {
  id: string;
  label: string;
  col: number;
  row: number;
  bind: string;
  format?: MetricFormat;
  unit?: string;
  accent?: string;
};

type BeatRuntime = {
  readonly startFrame: number;
  readonly frames: number;
  readonly beat: {readonly set?: Record<string, number | Tween>};
};

const asTween = (v: number | Tween): Tween =>
  typeof v === 'number' ? {to: v} : v;

const easeProgress = (
  ease: NonNullable<Tween['ease']>,
  local: number,
  duration: number,
  fps: number,
): number => {
  if (local <= 0) return 0;
  if (local >= duration) return 1;
  switch (ease) {
    case 'linear':
      return local / duration;
    case 'accelerate':
      return interpolate(local / duration, [0, 1], [0, 1], {
        easing: (t) => t * t,
      });
    case 'settle':
      return spring({frame: local, fps, config: {damping: 200, mass: 1.4}});
    case 'spring':
    default:
      return spring({frame: local, fps, config: {damping: 200, mass: 1.1}});
  }
};

/**
 * The resolved value of a named tweened key at a given (scene-relative)
 * frame. A pure read over the kit's `BeatTimelineSlot[]` — deterministic,
 * with no state. Finds the most recent beat at or before `frame` whose
 * inner `beat.set` includes `key`, then eases from the value the prior
 * set-beat held (or this tween's `from`, or 0) toward the target.
 */
export const tweenValue = (
  beats: ReadonlyArray<{
    readonly startFrame: number;
    readonly frames: number;
    readonly beat: unknown;
  }>,
  key: string,
  frame: number,
  fps: number,
): number => {
  // Narrow each slot to the runtime shape via the open index signature on Beat.
  const setBeats = beats.filter((b): b is BeatRuntime => {
    const inner = (b as BeatRuntime).beat;
    if (!inner || typeof inner !== 'object') return false;
    const s = (inner as {set?: unknown}).set;
    return Boolean(s) && typeof s === 'object' && key in (s as object);
  });
  if (setBeats.length === 0) return 0;

  // The most recent set-beat at or before `frame`.
  let active = -1;
  for (let i = setBeats.length - 1; i >= 0; i--) {
    const b = setBeats[i];
    if (b && frame >= b.startFrame) {
      active = i;
      break;
    }
  }
  // Before the first set-beat — rest at that beat's start value.
  // setBeats[0] is non-null: we returned above when length === 0.
  if (active < 0) {
    const first = asTween(
      (setBeats[0]!.beat.set as Record<string, number | Tween>)[key]!,
    );
    return first.from ?? 0;
  }

  // setBeats[active] is non-null: `active` was set inside a `setBeats[i]`
  // truthy check above, so this index is guaranteed populated.
  const activeBeat = setBeats[active]!;
  const tw = asTween(
    (activeBeat.beat.set as Record<string, number | Tween>)[key]!,
  );
  // The value the timeline held entering this beat: the previous set-beat's
  // target, else this tween's explicit `from`, else 0.
  // setBeats[active - 1] is non-null when active > 0 by the same logic.
  const start =
    active > 0
      ? asTween(
          (setBeats[active - 1]!.beat.set as Record<string, number | Tween>)[key]!,
        ).to
      : (tw.from ?? 0);

  const local = frame - activeBeat.startFrame;
  const p = easeProgress(
    tw.ease ?? 'spring',
    local,
    activeBeat.frames,
    fps,
  );
  return interpolate(p, [0, 1], [start, tw.to]);
};
