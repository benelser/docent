// Chart scene–local helpers — only the bits not consolidated into
// `../../_shared`. The shared chrome (glow, activeBeatIndex, the SVG text
// fitters fitFontSize / truncateForSlot, SceneFrame, Narration, FittedText,
// fonts) is now imported from `@docent/core/_shared`.
//
// `STAGE` (the rectangle every diagram type renders inside) and `tweenValue`
// (the engine's named-value resolver — the chart's bar-height and
// point-marker x-coordinate read through it) are scene-specific to chart
// (well — `tweenValue` is also a candidate for shared consolidation, but it
// reads the engine's wider runtime Beat shape via narrow casts at the seam,
// so it stays scoped to chart until the runtime-vs-protocol seam is
// reconciled).

import {interpolate, spring} from 'remotion';

/**
 * The stage rectangle within the 1920x1080 frame where diagrams live.
 * Mirrors `packages/engine/src/engine/layout.ts:STAGE` exactly.
 */
export const STAGE = {x: 235, y: 338, w: 1450, h: 560} as const;

// ----- tweenValue — the engine's named-value resolver, ported -------------
//
// Mirrors `packages/engine/src/engine/spec.ts:tweenValue` exactly. The chart
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
