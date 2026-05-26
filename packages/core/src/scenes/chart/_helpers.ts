// Inlined helpers for the chart scene.
//
// These mirror the v2.5.x engine's shared `glow` utility (theme.ts), the
// per-frame `activeBeatIndex` reader and the `tweenValue` resolver
// (engine/spec.ts), the `STAGE` rectangle constant (engine/layout.ts), and
// the SVG text fitters from FittedText. The v3.0 fan-out moves each scene
// into its own directory in @docent/core; the shared component
// infrastructure (SceneFrame, Narration, FittedText, theme, layout,
// fonts, spec helpers) will be migrated by separate agents and reconciled
// by the integrator at merge time. For now we colocate the minimum each
// scene needs so the per-scene worktree builds clean.
//
// When the shared-infra migration lands, the chart scene will import these
// from @docent/core/_shared (or equivalent) and this file goes away.

import {interpolate, spring} from 'remotion';

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
 * The stage rectangle within the 1920x1080 frame where diagrams live.
 * Mirrors packages/engine/src/engine/layout.ts:STAGE exactly.
 */
export const STAGE = {x: 235, y: 338, w: 1450, h: 560} as const;

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

// ----- tweenValue — the engine's named-value resolver, ported -------------
//
// Mirrors packages/engine/src/engine/spec.ts:tweenValue exactly. The chart
// scene's bar-height and point-marker x-coordinate read through this; a
// beat's `set` directive drives the value, easing across the beat's frame
// span. The engine's runtime Beat carries `set: Record<string, number |
// Tween>` (NOT the kit's `BeatSetDirective[]` shape — those are different
// types; the kit's shape is the public contract for plugin AUTHORS, while
// the runtime data flowing into the scene component still carries the
// engine's wider runtime fields via Beat's open index signature). We read
// those engine-shaped fields through narrow casts at the seam.

type EngineTween = {
  to: number;
  from?: number;
  ease?: 'linear' | 'spring' | 'accelerate' | 'settle';
};

type EngineBeatRuntime = {
  startFrame: number;
  frames: number;
  beat: {set?: Record<string, number | EngineTween>};
};

const asTween = (v: number | EngineTween): EngineTween =>
  typeof v === 'number' ? {to: v} : v;

const easeProgress = (
  ease: NonNullable<EngineTween['ease']>,
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
 * frame. A pure read over the kit's BeatTimelineSlot[] — deterministic,
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
  // Narrow each slot to the engine-runtime shape via the open index signature
  // on Beat. The runtime layer still carries `set` as Record<string, …>.
  const setBeats = beats.filter((b): b is EngineBeatRuntime => {
    const inner = (b as EngineBeatRuntime).beat;
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
  if (active < 0) {
    const first = asTween(
      (setBeats[0].beat.set as Record<string, number | EngineTween>)[key],
    );
    return first.from ?? 0;
  }

  const activeBeat = setBeats[active];
  const tw = asTween(
    (activeBeat.beat.set as Record<string, number | EngineTween>)[key],
  );
  // The value the timeline held entering this beat: the previous set-beat's
  // target, else this tween's explicit `from`, else 0.
  const start =
    active > 0
      ? asTween(
          (setBeats[active - 1].beat.set as Record<string, number | EngineTween>)[key],
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

// ----- SVG text fitters ----------------------------------------------------
//
// Mirror packages/engine/src/components/FittedText.tsx:fitFontSize and
// truncateForSlot exactly. The chart scene uses these for axis-title and
// bar-datum-label sizing inside an <svg> — SVG can't host
// `-webkit-line-clamp`, so the best strategy for it is single-line
// shrink-or-truncate.

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
  // Prefer a word boundary — slice back to the last space (or hyphen) inside
  // the budget so we never chop mid-word. Falls back to char-truncation only
  // when there's no boundary inside ~half of the budget.
  const keepRaw = Math.max(1, maxChars - 1);
  const candidate = text.slice(0, keepRaw);
  const boundary = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('-'));
  if (boundary > Math.floor(keepRaw * 0.5)) {
    return candidate.slice(0, boundary).trimEnd() + '…';
  }
  // Keep room for the U+2026 glyph.
  return candidate.slice(0, Math.max(0, keepRaw - 1)) + '…';
};
