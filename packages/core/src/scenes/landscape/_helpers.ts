// Inlined helpers for the landscape scene.
//
// These mirror the v2.5.x engine's shared `glow` utility, the SVG text-
// fitting primitives (`fitFontSize`, `truncateForSlot`), and the
// `activeBeatIndex` / palette resolvers landscape consumes. The v3.0
// fan-out moves each scene into its own directory in @docent/core; the
// shared component infrastructure (SceneFrame, Narration, FittedText, fit
// helpers, glow, palette resolvers, fonts) will be migrated by separate
// agents and reconciled by the integrator at merge time. For now we
// colocate the minimum each scene needs so the per-scene worktree builds
// clean.
//
// When the shared-infra migration lands, the landscape scene will import
// these from @docent/core/_shared (or equivalent) and this file goes
// away.

import type {Beat, ResolvedStyle} from '@docent/kit';

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
 * The universal accent fallback table — every preset re-declares these.
 * Used when the resolved style's accent table is missing a key.
 */
const FALLBACK_ACCENTS = {
  blue: '#5cb6ff',
  cyan: '#3fe0d0',
  green: '#5fe8a4',
  amber: '#ffc24d',
  rose: '#ff7d97',
  violet: '#b69cff',
} as const;

/**
 * Resolve the scene's chrome accent hex against the resolved style's
 * accent table. Mirrors packages/engine/src/engine/knobs.ts:paletteSceneHex
 * for the no-palette path (the v2.4.0+ default state of every caller) —
 * the lookup simplifies to `style.tokens.accent.blue`.
 */
export const paletteSceneHex = (
  _palette: undefined,
  _sceneAccent: undefined,
  style: ResolvedStyle,
): string => {
  const table = style.tokens.accent as unknown as Record<string, string>;
  return table.blue ?? FALLBACK_ACCENTS.blue;
};

/**
 * The glow-intensity multiplier a scene's palette implies. 1 (the identity)
 * when no palette is set — which, post-v2.4.0, is every caller. Mirrors
 * packages/engine/src/engine/knobs.ts:paletteGlowScale.
 */
export const paletteGlowScale = (_palette: undefined): number => 1;

/**
 * Which beat is on screen at a given (scene-relative) frame. Mirrors the
 * v2.5.x engine's `activeBeatIndex`, adapted to walk the kit's
 * BeatTimelineSlot[] (which exposes `startFrame` rather than the legacy
 * `from`).
 */
export const activeBeatIndex = (
  beats: ReadonlyArray<{readonly startFrame: number; readonly beat: Beat}>,
  frame: number,
): number => {
  for (let i = beats.length - 1; i >= 0; i--) {
    const b = beats[i];
    if (b && frame >= b.startFrame) return i;
  }
  return 0;
};

// ---------------------------------------------------------------------------
// SVG text-fitting helpers — for `<text>` callers that need a font size /
// truncated string without wrapping the element in a React component.
// Mirrors packages/engine/src/components/FittedText.tsx:fitFontSize and
// :truncateForSlot exactly.
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

/**
 * Compute the font size that fits `text` on a single line (or `lines`
 * lines) inside `maxWidth`. Bare-numerical version of FittedText's
 * internal shrink — for SVG `<text>` where CSS line-clamp does not apply.
 */
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

/**
 * Single-line shrink-then-ellipsis applied to a string at a known font
 * size. Returns the text untouched if it fits, else a string with a
 * trailing U+2026 ellipsis cropped to fit. For SVG `<text>` where CSS
 * text-overflow does not apply.
 */
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
  const boundary = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('-'));
  if (boundary > Math.floor(keepRaw * 0.5)) {
    return candidate.slice(0, boundary).trimEnd() + '…';
  }
  const keep = Math.max(1, maxChars - 1);
  return text.slice(0, keep).trimEnd() + '…';
};
