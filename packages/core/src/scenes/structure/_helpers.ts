// Inlined helpers for the structure scene.
//
// These mirror the v2.5.x engine's shared utilities (`theme.ts`'s `glow` /
// `ACCENTS`, `engine/spec.ts`'s `activeBeatIndex` / `morphTimeline` /
// `resolveMorph` / `hasTransform`, and `engine/knobs.ts`'s cadence /
// palette helpers) — colocated so the structure plugin builds clean against
// `@docent/kit` alone, no `@docent/engine` import.
//
// At integration, when the shared-infra migration lands, the structure
// scene will swap these for shared imports and this file goes away. The
// brief's "inlined helpers" pattern (see the diff scene) is the contract.

import {spring} from 'remotion';
import type {Beat, BeatTimelineSlot, ResolvedStyle} from '@docent/kit';

import type {StructureNode, StructureTransform} from './_types';

// ---------------------------------------------------------------------------
// Theme — `glow` and the fallback ACCENTS map.
//
// Mirrors packages/engine/src/theme.ts exactly. ACCENTS is the byte-identical
// hardcoded fallback the engine uses when `style.tokens.accent` is absent; in
// the plugin world `style` is always supplied, but we keep the literal map so
// `accent('blue')` resolves the same hex with or without a style bundle.
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

// ---------------------------------------------------------------------------
// activeBeatIndex — the kit-shaped variant.
//
// The v2.5.x engine's `activeBeatIndex(TimedBeat[], frame)` walked beats
// whose `from` was the scene-relative start frame. The kit's
// `BeatTimelineSlot` exposes `startFrame` instead. The behaviour is
// identical; only the field name changes.
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
// Mirrors `packages/engine/src/engine/knobs.ts` exactly. The structure scene
// reads:
//   - `cadenceOffset(cadence, order)` — the per-item entrance-frame offset
//     for cascade (or 0 for together/snap/undefined).
//   - `cadenceSpringConfig(cadence)` — the spring config a revealed item's
//     entrance uses (sharper for snap; the default {damping: 200, mass: 0.7}
//     otherwise).
// ---------------------------------------------------------------------------

/** frames of stagger between cascaded items. */
export const CASCADE_STEP = 5;

export type Cadence = 'cascade' | 'together' | 'snap' | undefined;

export const cadenceOffset = (cadence: Cadence, order: number): number =>
  cadence === 'cascade' ? Math.max(0, order) * CASCADE_STEP : 0;

export const cadenceSpringConfig = (
  cadence: Cadence,
): {damping: number; mass: number} =>
  cadence === 'snap' ? {damping: 200, mass: 0.42} : {damping: 200, mass: 0.7};

// ---------------------------------------------------------------------------
// Palette — `palette` (a scene knob) was removed in v2.4.0. The helpers
// survive as the engine's preset-aware accent lookup; their `palette`
// argument is always called with `undefined` from every renderer (the
// identity branch).
//
// `paletteAccentKey(undefined, undefined, ownAccent, order)` is the identity
// — `ownAccent ?? 'blue'`. `paletteSceneHex(undefined, undefined, style)`
// reads the scene accent off the preset's accent table; with no
// scene-declared accent (every spec post-v2.4.0) that's `style.accent.blue`.
// `paletteGlowScale(undefined)` is `1`.
// ---------------------------------------------------------------------------

export type PaletteName = 'cool' | 'warm' | 'signal' | 'mono';

type PaletteFamily = {accents: AccentKey[]; glowScale: number};

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
  if (ownAccent && (fam as readonly string[]).includes(ownAccent)) return ownAccent;
  return fam[((index % fam.length) + fam.length) % fam.length];
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

// ---------------------------------------------------------------------------
// Morph — cross-beat object identity.
//
// A node's definition can be redefined by a later beat's `transform`. These
// helpers resolve, at a given frame, which definition the node is in and how
// far it has eased between the bracketing pair. Pure reads over the beat
// timeline; deterministic, no state. Mirrors the engine's morphTimeline /
// resolveMorph / hasTransform — adapted to walk the kit's BeatTimelineSlot[]
// rather than the legacy TimedBeat[].
// ---------------------------------------------------------------------------

export type MorphState = {fromFrame: number; node: StructureNode};

/**
 * Read a beat's structure-owned `transform` directive list off the open
 * index signature on `Beat`. The kit's `Beat` declares a generic
 * `transform?: ReadonlyArray<BeatTransformDirective>`; structure's per-node
 * morph shape is wider (carries a full `into: Partial<StructureNode>`), so
 * we read it back as the structure-owned shape. When absent or shaped
 * differently, returns `undefined`.
 */
const beatTransforms = (beat: Beat): ReadonlyArray<StructureTransform> | undefined => {
  const v = (beat as {transform?: unknown}).transform;
  if (!Array.isArray(v)) return undefined;
  return v as ReadonlyArray<StructureTransform>;
};

/**
 * The ordered definition timeline for one node: its base definition (from
 * frame 0), then each `transform.into` merged onto the prior definition, in
 * timeline order. A node with no transform has a single-state timeline.
 */
export const morphTimeline = (
  base: StructureNode,
  beats: ReadonlyArray<BeatTimelineSlot>,
): MorphState[] => {
  const states: MorphState[] = [{fromFrame: 0, node: base}];
  for (const slot of beats) {
    const ts = beatTransforms(slot.beat);
    const t = ts?.find((tr) => tr.node === base.id);
    if (!t) continue;
    const prev = states[states.length - 1].node;
    // `into` is a partial Node — only named fields change; the id is fixed.
    states.push({fromFrame: slot.startFrame, node: {...prev, ...t.into, id: base.id}});
  }
  return states;
};

/**
 * At `frame`, the bracketing (from, to) definitions and the eased progress
 * `p` between them. Before/at the last transition's start `p` climbs 0→1
 * across that transition beat's own duration, then rests. A node with a
 * single-state timeline is always {from: base, to: base, p: 1} — no morph.
 */
export const resolveMorph = (
  states: MorphState[],
  beats: ReadonlyArray<BeatTimelineSlot>,
  frame: number,
  fps: number,
): {from: StructureNode; to: StructureNode; p: number} => {
  if (states.length === 1) {
    return {from: states[0].node, to: states[0].node, p: 1};
  }
  let active = 0;
  for (let i = states.length - 1; i >= 0; i--) {
    if (frame >= states[i].fromFrame) {
      active = i;
      break;
    }
  }
  if (active === 0) {
    return {from: states[0].node, to: states[0].node, p: 1};
  }
  const fromDef = states[active - 1].node;
  const toDef = states[active].node;
  // The transition beat owns the morph — `p` eases across its duration, then
  // rests at 1.
  const tBeat = beats.find((b) => b.startFrame === states[active].fromFrame);
  const dur = tBeat?.frames ?? 1;
  const local = frame - states[active].fromFrame;
  const p =
    local <= 0
      ? 0
      : local >= dur
        ? 1
        : spring({frame: local, fps, config: {damping: 200, mass: 1.1}});
  return {from: fromDef, to: toDef, p};
};

/**
 * Whether any beat in this scene transforms any node — the fast-path guard.
 * When false, StructureScene takes the existing unchanged code path: every
 * node renders as the byte-identical Card with no morph machinery.
 */
export const hasTransform = (
  beats: ReadonlyArray<BeatTimelineSlot>,
): boolean =>
  beats.some((b) => {
    const ts = beatTransforms(b.beat);
    return Array.isArray(ts) && ts.length > 0;
  });
