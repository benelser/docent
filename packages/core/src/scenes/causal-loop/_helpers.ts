// Inlined helpers for the causal-loop scene.
//
// These mirror the v2.5.x engine's shared utilities (`glow`,
// `activeBeatIndex`, the cadence + palette knob helpers, and the SVG text
// fitters) the renderer reads. The v3.0 fan-out moves each scene into its
// own directory in @docent/core; the shared component infrastructure will
// be migrated by separate agents and reconciled by the integrator at merge
// time. For now we colocate the minimum each scene needs so the per-scene
// worktree builds clean.
//
// When the shared-infra migration lands, the causal-loop scene will import
// these from @docent/core/_shared (or equivalent) and this file goes away.

import {spring} from 'remotion';
import type {Beat, ResolvedStyle} from '@docent/kit';

// ---------------------------------------------------------------------------
// glow — translucent accent fills for halos and panel washes. Mirrors
// packages/engine/src/theme.ts:glow exactly.
// ---------------------------------------------------------------------------

export const glow = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
};

// ---------------------------------------------------------------------------
// activeBeatIndex — which beat is on screen at a given (scene-relative)
// frame. Mirrors the v2.5.x engine's `activeBeatIndex`, adapted to walk the
// kit's BeatTimelineSlot[] (which exposes `startFrame` rather than the
// legacy `from`).
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
// cadence knob — the rhythm with which a beat's revealed items enter.
// Mirrors packages/engine/src/engine/knobs.ts exactly.
//
//   together (default) — every revealed item shares the beat's start frame;
//                         this is the engine's original behaviour.
//   cascade            — each item's entrance is staggered by CASCADE_STEP
//                         frames in declared order, so the set unrolls.
//   snap               — all items enter together (like `together`) but on
//                         a sharper, lower-mass spring, so they arrive
//                         crisper.
// ---------------------------------------------------------------------------

export const CASCADE_STEP = 5;

export const cadenceOffset = (
  cadence: Beat['cadence'],
  order: number,
): number => (cadence === 'cascade' ? Math.max(0, order) * CASCADE_STEP : 0);

export const cadenceSpringConfig = (
  cadence: Beat['cadence'],
): {damping: number; mass: number} =>
  cadence === 'snap'
    ? {damping: 200, mass: 0.42}
    : {damping: 200, mass: 0.7};

// ---------------------------------------------------------------------------
// palette knob — accent as meaning. The v2.4.0+ default state of every
// caller passes `undefined` palette; the helpers stay shape-preserving so a
// future palette knob plugs back in.
// ---------------------------------------------------------------------------

type AccentKey =
  | 'blue'
  | 'cyan'
  | 'green'
  | 'amber'
  | 'rose'
  | 'violet';

const FALLBACK_ACCENTS: Record<AccentKey, string> = {
  blue: '#5cb6ff',
  cyan: '#3fe0d0',
  green: '#5fe8a4',
  amber: '#ffc24d',
  rose: '#ff7d97',
  violet: '#b69cff',
};

type PaletteName = 'cool' | 'warm' | 'signal' | 'mono';

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
  if (ownAccent && fam.includes(ownAccent as AccentKey)) return ownAccent;
  return fam[((index % fam.length) + fam.length) % fam.length];
};

export const paletteSceneHex = (
  palette: PaletteName | undefined,
  sceneAccent: string | undefined,
  style?: ResolvedStyle,
): string => {
  const key = paletteAccentKey(palette, sceneAccent, sceneAccent, 0);
  const table = (style?.tokens.accent ?? FALLBACK_ACCENTS) as unknown as Record<
    string,
    string
  >;
  return table[key] ?? table.blue ?? FALLBACK_ACCENTS.blue;
};

// ---------------------------------------------------------------------------
// SVG text fitters — the bare-numerical font-size chooser + ellipsis-or-
// truncate. Mirror of packages/engine/src/components/FittedText.tsx
// `fitFontSize` and `truncateForSlot`. Used by the causal-loop SVG `<text>`
// labels (which can't host -webkit-line-clamp).
// ---------------------------------------------------------------------------

const fitFont = (
  text: string,
  basePx: number,
  floorPx: number,
  maxWidth: number,
  charAdvance: number,
  lines: number,
): number => {
  const len = Math.max(1, text.length);
  const budget = maxWidth * lines;
  const baseWidth = len * basePx * charAdvance;
  if (baseWidth <= budget) return basePx;
  const fit = budget / (len * charAdvance);
  return Math.max(floorPx, Math.min(basePx, fit));
};

export const fitFontSize = (
  text: string,
  opts: {
    maxWidth: number;
    basePx: number;
    floorPx?: number;
    charAdvance?: number;
    lines?: number;
  },
): number => {
  const floor = opts.floorPx ?? Math.max(11, Math.min(opts.basePx - 1, 12));
  const advance = opts.charAdvance ?? 0.6;
  const lines = opts.lines ?? 1;
  return fitFont(text, opts.basePx, floor, opts.maxWidth, advance, lines);
};

export const truncateForSlot = (
  text: string,
  opts: {
    maxWidth: number;
    fontSize: number;
    charAdvance?: number;
  },
): string => {
  const advance = opts.charAdvance ?? 0.6;
  const charW = opts.fontSize * advance;
  if (charW <= 0) return text;
  const maxChars = Math.floor(opts.maxWidth / charW);
  if (text.length <= maxChars) return text;
  const keepRaw = Math.max(1, maxChars - 1);
  const candidate = text.slice(0, keepRaw);
  const boundary = Math.max(
    candidate.lastIndexOf(' '),
    candidate.lastIndexOf('-'),
  );
  if (boundary > Math.floor(keepRaw * 0.5)) {
    return candidate.slice(0, boundary).trimEnd() + '…';
  }
  const keep = Math.max(1, maxChars - 1);
  return text.slice(0, keep).trimEnd() + '…';
};

// Used by the spring entrance so callers can read cadence without importing
// Remotion. Returns `cadence` directly today; kept as a wrapper so a future
// remap (palette → cadence biasing) lands cleanly.
export {spring};
