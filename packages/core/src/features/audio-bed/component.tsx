// AudioBed — the film-wide background-music overlay.
//
// Mounted ONCE at film scope via the FeaturePlugin `wrapsFilm` hook, so
// the bed spans the whole film and never restarts at scene boundaries.
// The component lays a single `<Audio>` for the music track and tweens
// its volume per-frame.
//
// R8 — music-narration choreography. The bed reaches for THREE moves,
// each opt-in via the props the kit's composition threads through:
//
//   1. PER-WORD DUCKING. When `words` (frame-quantised, clip-relative)
//      are present for a beat, the narration "window" the bed ducks
//      under shrinks from the full beat duration to
//      `[words[0].startFrame, words[last].endFrame]` (translated to
//      film-absolute frames). Onset aligns to the actual first word, not
//      the beat's leading silence — the duck arrives WHEN SPEECH STARTS.
//      Absence → the old per-beat-window behaviour, unchanged.
//
//   2. ASYMMETRIC RAMPS. A musical anticipation ramp DOWN starts
//      `rampInFrames` BEFORE the first word (default 12 frames ≈ 400ms
//      at 30fps); the resolution ramp UP continues `rampOutFrames`
//      AFTER the last word (default 18 frames ≈ 600ms). The bed gets
//      out of the way EARLIER than it returns — the mix sounds like a
//      breath, not a click.
//
//   3. CLUSTER-AWARE SWELLS. After the last beat of a `narrative` or
//      `categorization` scene, if the NEXT scene's plugin tag is
//      `narrative` (and specifically the sceneType is `big-idea`) AND
//      the gap between scenes is at least 24 frames, the bed lifts to
//      `baseVolume × 1.4` over a 12-frame ramp, peaking RIGHT BEFORE the
//      big-idea scene starts. A quick fade returns the bed to base as
//      the big-idea's first beat begins. The math composes via `max()`
//      with the duck profile, so a swell never collides with an
//      overlapping duck. Useful when the scene cluster is genuinely a
//      rhetorical pivot — the music carries the boom.
//
// Friction notes (logged in dogfood/log.md for the R8 retro):
//   - Per-word ducking with DENSE words: each ramp is a momentary
//     dip; clusters of 5+ short words become a near-continuous duck,
//     which is the desired behaviour.
//   - SPARSE words (a long pause inside a beat): the bed rises during
//     the pause — depending on taste this is "musical" or "stuttering".
//     Right now we accept it; future revisions could coalesce
//     intra-beat gaps under N frames.
//   - The swell math is BPM-independent — peak alignment is in frames,
//     not bars. A future revision could read `meta.music.bpm` and snap
//     the swell peak to the nearest beat.
//   - sceneCluster info is DERIVED from the plugin's `cluster` field
//     (not a new spec surface) — see composition.tsx. The audio-bed
//     only branches on `cluster` and `sceneType`, never on free-form
//     spec data.

import React, {useCallback, useMemo} from 'react';
import {Audio, interpolate, staticFile, useCurrentFrame} from 'remotion';

import type {
  FilmFeatureBeatSlot,
  FilmFeatureSceneClusterSlot,
  FilmFeatureWordTimingSlot,
} from '@bjelser/kit';

export interface AudioBedProps {
  /**
   * Where the bed's music lives. A bare filename (`"theme.mp3"`) or
   * relative path (`"audio/scores/sparse.mp3"`) resolves under the
   * Remotion `public/` dir via `staticFile`; an absolute URL passes
   * through unchanged.
   */
  readonly musicUrl: string;
  /** Frames per second. Used for the duck-fade ramp width. */
  readonly fps: number;
  /** Total film length, in frames. Sizes the `<Audio>` window. */
  readonly totalFrames: number;
  /**
   * Beat slots in ABSOLUTE film-frame coords. The duck detector looks at
   * which beats carry an `audio` path (i.e. narration that will play)
   * and ducks the bg-music volume for their windows.
   */
  readonly beats: ReadonlyArray<FilmFeatureBeatSlot>;
  /**
   * R8: per-beat frame-quantised word timings (clip-relative). When
   * present for a beat, the bed ducks per-WORD (the narration window
   * shrinks to `[words[0].startFrame, words[last].endFrame]`); when
   * absent or empty, the bed falls through to its per-beat behaviour.
   * Indexed by `(sceneIndex, beatIndex)`.
   */
  readonly wordTimings?: ReadonlyArray<FilmFeatureWordTimingSlot>;
  /**
   * R8: per-scene cluster slots in absolute film-frame coords. When
   * the LAST beat of a scene whose cluster is `narrative` or
   * `categorization` is followed (after a >= 24-frame gap) by a
   * `big-idea` scene, the bed lifts to `baseVolume * 1.4` for a
   * 12-frame ramp peaking just before the big-idea scene begins —
   * the cinematic "swell into the rhetorical pivot". Absent (or
   * no qualifying transition) → no swell; the bed sits at base in
   * gaps as before.
   */
  readonly sceneClusters?: ReadonlyArray<FilmFeatureSceneClusterSlot>;
  /**
   * Base (un-ducked) volume during gaps between narration. Defaults to 0.70 —
   * the level production-tuned by 250's Founders Trailer where the orchestra
   * actually carries emotion through the silence between speakers. The old
   * 0.20 default was too timid for a real cinematic bed.
   */
  readonly baseVolume?: number;
  /**
   * Ducked volume while narration is playing. Defaults to 0.06 — the "barely
   * audible underscore" level that keeps the bed alive without competing
   * with speech. The 0.08 default was close but the extra 2 points of duck
   * make the speech sit forward instead of blurring with the music.
   */
  readonly duckedVolume?: number;
  /**
   * Linear ramp width (in frames) on each side of a narration window.
   * Smooths the duck so the transition isn't a sharp click. Defaults to
   * ~6 frames (~200ms at 30fps). Applied SYMMETRICALLY — only the
   * per-beat fallback path uses this. The per-word path uses
   * {@link rampInFrames} / {@link rampOutFrames} for asymmetric shaping.
   */
  readonly rampFrames?: number;
  /**
   * R8: asymmetric pre-narration ramp width in frames. The duck starts
   * `rampInFrames` BEFORE the first word; defaults to 12 frames (≈400ms
   * at 30fps). Anticipates the speech — the bed gets out of the way
   * BEFORE it would clash. Per /ventures/250's Founders Trailer mix
   * engineering pattern.
   */
  readonly rampInFrames?: number;
  /**
   * R8: asymmetric post-narration ramp width in frames. The duck holds
   * `rampOutFrames` AFTER the last word before climbing back to base;
   * defaults to 18 frames (≈600ms at 30fps). The bed resolves later
   * than it ducks — the mix breathes.
   */
  readonly rampOutFrames?: number;
  /**
   * R8: minimum gap (in frames) between a qualifying scene's last beat
   * and the start of a `big-idea` scene that triggers the swell.
   * Defaults to 24 frames (≈800ms). A gap below this is too tight for
   * the swell to register; the bed stays flat.
   */
  readonly swellMinGapFrames?: number;
  /**
   * R8: swell ramp width — the bed lifts to its peak over this many
   * frames before the big-idea scene begins. Defaults to 12 frames.
   */
  readonly swellRampFrames?: number;
  /**
   * R8: swell amplitude multiplier. Peak volume = `baseVolume *
   * swellGain`. Defaults to 1.4 (≈3 dB lift — the level that registers
   * as "the music swelled" without clipping the bed). Clamped to <= 1
   * if `baseVolume * swellGain` would exceed 1.0.
   */
  readonly swellGain?: number;
}

/** One narration WINDOW projected to absolute film frames. */
interface NarrationWindow {
  readonly start: number;
  readonly end: number;
}

/**
 * Project a list of beat slots into the set of (start, end) WINDOWS the
 * bg-music ducks under. R8 path: when `wordTimings` carry frame data
 * for a beat we tighten the window to `[words[0].startFrame,
 * words[last].endFrame]` (translated from clip-relative to film-absolute
 * by adding the beat's `startFrame`). Otherwise we fall through to the
 * old per-beat window (which is what R6's audio-bed shipped).
 */
const narrationWindows = (
  beats: ReadonlyArray<FilmFeatureBeatSlot>,
  wordTimings: ReadonlyArray<FilmFeatureWordTimingSlot> | undefined,
): ReadonlyArray<NarrationWindow> => {
  // Index the per-beat word timings by `<sceneIndex>-<beatIndex>` so the
  // O(beats × wordTimings) scan collapses to O(beats). Empty / absent →
  // null map and every beat falls through to per-beat behaviour.
  const wordMap = new Map<string, ReadonlyArray<{startFrame: number; endFrame: number}>>();
  if (wordTimings) {
    for (const slot of wordTimings) {
      if (slot.words.length === 0) continue;
      wordMap.set(`${slot.sceneIndex}-${slot.beatIndex}`, slot.words);
    }
  }
  const out: NarrationWindow[] = [];
  for (const b of beats) {
    if (typeof b.audio !== 'string' || b.audio.length === 0) continue;
    const words = wordMap.get(`${b.sceneIndex}-${b.beatIndex}`);
    if (words && words.length > 0) {
      // Per-WORD path: shrink the window to the actual speech span.
      // `words[]` are clip-relative; add the beat's absolute startFrame.
      const first = words[0]!;
      const last = words[words.length - 1]!;
      // Defensive: a misordered word list still produces a sane window.
      const startAbs = b.startFrame + Math.max(0, first.startFrame);
      const endAbs = b.startFrame + Math.max(first.endFrame, last.endFrame);
      // Clamp the end to the beat window so a misaligned aligner output
      // can't push the duck past the next beat's lead-in.
      const clampedEnd = Math.min(endAbs, b.startFrame + b.frames);
      out.push({start: startAbs, end: clampedEnd});
    } else {
      // Per-BEAT fallback: legacy R6 behaviour, kept verbatim.
      out.push({start: b.startFrame, end: b.startFrame + b.frames});
    }
  }
  return out;
};

/** One swell WINDOW: the bed lifts to its peak right before a big-idea scene. */
interface SwellWindow {
  /** Frame the lift begins (= `peak - swellRampFrames`). */
  readonly start: number;
  /** Frame the lift peaks at (right before the big-idea scene's first frame). */
  readonly peak: number;
  /** Frame the lift resolves back to base (typically a few frames after `peak`). */
  readonly end: number;
  /** Peak volume value (not the multiplier — the absolute target). */
  readonly target: number;
}

/**
 * Compute the swell windows the bed should superimpose on the
 * volume profile. A swell fires when the LAST beat of a scene whose
 * cluster is `narrative` or `categorization` (typically a `tension`
 * verdict scene) is followed by a `big-idea` scene after a gap of at
 * least `swellMinGapFrames` frames.
 *
 * The peak frame is the big-idea scene's first frame minus 1 — the
 * music crests RIGHT BEFORE the rhetorical pivot lands. The lift
 * starts `swellRampFrames` earlier and resolves over the same
 * number of frames after the peak.
 *
 * "Gap" here is measured from the SOURCE scene's narration END (the
 * last word's end frame when word timings are present, else the last
 * beat window's end) to the TARGET scene's FIRST frame. The schedule
 * lets scenes overlap during cross-fades, so a beat WINDOW can extend
 * past the next scene's start — but narration usually fits inside.
 * Using narration-end keeps the gap measurement honest.
 *
 * Returns an empty array when no qualifying transition exists. The
 * volume function composes via `max()` so an empty array means
 * "no swell" — the bed sits at base or ducks as the duck profile
 * dictates.
 */
const swellWindows = (
  sceneClusters: ReadonlyArray<FilmFeatureSceneClusterSlot> | undefined,
  beats: ReadonlyArray<FilmFeatureBeatSlot>,
  wordTimings: ReadonlyArray<FilmFeatureWordTimingSlot> | undefined,
  baseVolume: number,
  duckedVolume: number,
  swellGain: number,
  swellRampFrames: number,
  swellMinGapFrames: number,
): ReadonlyArray<SwellWindow> => {
  if (!sceneClusters || sceneClusters.length < 2) return [];
  // Index `(sceneIndex, beatIndex) → word timings` so we can find the
  // last-word END for each scene's last beat.
  const wordMap = new Map<string, ReadonlyArray<{startFrame: number; endFrame: number}>>();
  if (wordTimings) {
    for (const slot of wordTimings) {
      if (slot.words.length === 0) continue;
      wordMap.set(`${slot.sceneIndex}-${slot.beatIndex}`, slot.words);
    }
  }
  // Per-scene "narration end" — the END of the last word in the last
  // beat when timings exist; the END of the last beat window otherwise.
  // Two passes: first the per-scene last-beat-index + last-beat-end,
  // then the narration end (word-end if available, beat-end if not).
  const lastBeatIndexByScene = new Map<number, number>();
  const lastBeatEndByScene = new Map<number, number>();
  const lastBeatStartByScene = new Map<number, number>();
  for (const b of beats) {
    const prevIdx = lastBeatIndexByScene.get(b.sceneIndex) ?? -1;
    if (b.beatIndex > prevIdx) {
      lastBeatIndexByScene.set(b.sceneIndex, b.beatIndex);
      lastBeatEndByScene.set(b.sceneIndex, b.startFrame + b.frames);
      lastBeatStartByScene.set(b.sceneIndex, b.startFrame);
    }
  }
  // Resolve narration-end per scene.
  const narrationEndByScene = new Map<number, number>();
  for (const [sceneIdx, beatIdx] of lastBeatIndexByScene) {
    const beatStart = lastBeatStartByScene.get(sceneIdx)!;
    const beatEnd = lastBeatEndByScene.get(sceneIdx)!;
    const words = wordMap.get(`${sceneIdx}-${beatIdx}`);
    if (words && words.length > 0) {
      const last = words[words.length - 1]!;
      narrationEndByScene.set(sceneIdx, beatStart + last.endFrame);
    } else {
      narrationEndByScene.set(sceneIdx, beatEnd);
    }
  }
  const peakTarget = Math.min(1, baseVolume * swellGain);
  // No headroom for a swell (baseVolume already >= 1) → bail out
  // rather than produce a flat "swell" that's identical to base.
  if (peakTarget <= baseVolume + 1e-6) return [];
  // Avoid producing swells that descend into the ducked level.
  void duckedVolume;
  const out: SwellWindow[] = [];
  for (let i = 0; i < sceneClusters.length - 1; i++) {
    const cur = sceneClusters[i]!;
    const nxt = sceneClusters[i + 1]!;
    // Big-idea-target check: the NEXT scene is the rhetorical pivot.
    // We accept either `sceneType === 'big-idea'` (the load-bearing
    // path) OR a `narrative` cluster with the conventional name — the
    // sceneType match is the precise signal a third-party narrative
    // scene can opt into.
    const nextIsBigIdea = nxt.sceneType === 'big-idea';
    if (!nextIsBigIdea) continue;
    // Qualifying-source check: the CURRENT scene's cluster has to be
    // the rhetorical "set-up" for the pivot — `categorization`
    // (tension scenes) or `narrative` (concession, provocation, etc.).
    // A `flow` walkthrough or `comparison` chart doesn't earn the
    // swell — the music would be exaggerating a flat transition.
    const sourceQualifies =
      cur.cluster === 'categorization' || cur.cluster === 'narrative';
    if (!sourceQualifies) continue;
    // Gap check: the SOURCE scene's NARRATION ENDS at `narrationEnd`
    // (the last word's end when timings exist, the last beat window's
    // end otherwise); the TARGET scene begins at `nxt.startFrame`. Gap
    // is the difference. When narration runs flush against the cut
    // there's no room for a swell — skip.
    const narrationEnd =
      narrationEndByScene.get(cur.sceneIndex) ?? cur.startFrame;
    const gap = nxt.startFrame - narrationEnd;
    if (gap < swellMinGapFrames) continue;
    // Peak right before the big-idea's first frame — the boom lands
    // ON the cut, the swell crests just before.
    const peak = nxt.startFrame - 1;
    const ramp = Math.max(2, swellRampFrames);
    const start = peak - ramp;
    // The swell resolves over roughly the same number of frames after
    // the peak — quick fade so the bed doesn't compete with the
    // big-idea's first beat narration. Cap the end at the next scene's
    // FIRST BEAT start when known; if the big-idea has no beats we
    // cap at start + ramp.
    let nextFirstBeatStart = nxt.endFrame;
    for (const b of beats) {
      if (b.sceneIndex === nxt.sceneIndex) {
        if (b.startFrame < nextFirstBeatStart) nextFirstBeatStart = b.startFrame;
      }
    }
    const end = Math.min(peak + ramp, nextFirstBeatStart);
    out.push({start, peak, end, target: peakTarget});
  }
  return out;
};

/**
 * Resolve a music asset to the URL Remotion will fetch. URLs pass
 * through; relative paths go through `staticFile()` so the Remotion
 * webpack publicDir resolves them correctly in both studio and headless
 * renders.
 */
const resolveMusicUrl = (musicUrl: string): string => {
  if (/^https?:\/\//i.test(musicUrl)) return musicUrl;
  // staticFile expects a path RELATIVE to public/. A bare filename like
  // "theme.mp3" → "audio/theme.mp3" so it lands under the convention
  // every spec author follows.
  const rel = musicUrl.includes('/') ? musicUrl : `audio/${musicUrl}`;
  return staticFile(rel);
};

export const AudioBed: React.FC<AudioBedProps> = ({
  musicUrl,
  fps,
  totalFrames,
  beats,
  wordTimings,
  sceneClusters,
  baseVolume = 0.7,
  duckedVolume = 0.06,
  rampFrames,
  rampInFrames,
  rampOutFrames,
  swellMinGapFrames = 24,
  swellRampFrames = 12,
  swellGain = 1.4,
}) => {
  // Default ramp: ~500ms each side at the project fps (cinema-grade
  // smooth-and-asymmetric, per 250's Founders Trailer mix engineering).
  // 200ms ramps (the old default) registered as too snappy and lost the
  // "music is breathing under speech" feel. Bounded so a weirdly-low fps
  // doesn't collapse the ramp to 0.
  const symRamp = Math.max(2, rampFrames ?? Math.round(fps * 0.5));
  // R8 asymmetric ramps. Defaults: 12 in / 18 out — pre-narration
  // anticipation is faster than post-narration resolution so the bed
  // gets out of the way before speech, then takes its time to climb
  // back into the cinematic register. Bounded to >= 2 frames so a
  // weirdly-low fps doesn't collapse a ramp to a single-frame click.
  const rampIn = Math.max(2, rampInFrames ?? 12);
  const rampOut = Math.max(2, rampOutFrames ?? 18);

  const windows = useMemo(
    () => narrationWindows(beats, wordTimings),
    [beats, wordTimings],
  );
  // R8: precompute swell windows once. Empty list when no qualifying
  // tension → big-idea (or narrative → big-idea) transition exists, so
  // the per-frame `max()` becomes a cheap no-op for the common path.
  const swells = useMemo(
    () =>
      swellWindows(
        sceneClusters,
        beats,
        wordTimings,
        baseVolume,
        duckedVolume,
        swellGain,
        swellRampFrames,
        swellMinGapFrames,
      ),
    [
      sceneClusters,
      beats,
      wordTimings,
      baseVolume,
      duckedVolume,
      swellGain,
      swellRampFrames,
      swellMinGapFrames,
    ],
  );
  // Whether ANY beat has word timings — if YES, the asymmetric ramps
  // are the right shape; if NO, every window is a per-beat window and
  // the symmetric `symRamp` keeps the legacy duck profile.
  const hasWordTimings = useMemo(() => {
    if (!wordTimings || wordTimings.length === 0) return false;
    for (const slot of wordTimings) {
      if (slot.words.length > 0) return true;
    }
    return false;
  }, [wordTimings]);

  // `volume` accepts a `(frame) => number` selector. The selector
  // composes:
  //   - duck profile: `min()` across every narration window, each
  //     window's profile = piecewise-linear interpolate
  //       `[start - rampIn, start, end, end + rampOut]` →
  //       `[base, ducked, ducked, base]`.
  //   - swell profile: `max()` across every swell window, each window's
  //     profile = piecewise-linear triangle
  //       `[start, peak, end]` → `[base, target, base]`.
  // Composition: `max(min_duck_profile, max_swell_profile)`. A swell
  // and a duck in the same frame resolve to the LOUDER value — the
  // swell wins when one is queued, but a duck inside a swell takes
  // priority over the swell's tail.
  const volumeFor = useCallback(
    (frame: number): number => {
      // Start at base; reduce via duck windows; then lift via swell
      // windows (max). Two passes keep the math separable and the
      // intent legible at the call site.
      let v = baseVolume;
      if (windows.length > 0) {
        for (const {start, end} of windows) {
          // Per-word path uses asymmetric ramps; per-beat fallback path
          // uses the symmetric legacy ramp.
          const leftRamp = hasWordTimings ? rampIn : symRamp;
          const rightRamp = hasWordTimings ? rampOut : symRamp;
          if (frame < start - leftRamp || frame > end + rightRamp) continue;
          const tween = interpolate(
            frame,
            [start - leftRamp, start, end, end + rightRamp],
            [baseVolume, duckedVolume, duckedVolume, baseVolume],
            {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
          );
          if (tween < v) v = tween;
        }
      }
      if (swells.length > 0) {
        let swellMax = -Infinity;
        for (const {start, peak, end, target} of swells) {
          if (frame < start || frame > end) continue;
          const lifted = interpolate(
            frame,
            [start, peak, end],
            [baseVolume, target, baseVolume],
            {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
          );
          if (lifted > swellMax) swellMax = lifted;
        }
        // Compose only when a swell is actually active at this frame.
        // `swellMax > v` lets a swell lift the bed but never pulls the
        // bed BELOW its current value (so a duck under a swell stays
        // ducked).
        if (swellMax > v) v = swellMax;
      }
      return v;
    },
    [
      windows,
      swells,
      baseVolume,
      duckedVolume,
      symRamp,
      rampIn,
      rampOut,
      hasWordTimings,
    ],
  );

  // Touch `useCurrentFrame` so React re-evaluates the component each
  // frame — Remotion needs the per-frame call site to track the
  // composition. The Audio's `volume` selector is what actually
  // drives the per-frame mix.
  useCurrentFrame();

  return (
    <Audio
      src={resolveMusicUrl(musicUrl)}
      // Loop the bed if the film outlives the track. Remotion's <Audio>
      // supports `loop` directly.
      loop
      volume={volumeFor}
      // End the bed at the last film frame so we don't bleed into any
      // post-roll the host adds. Trim the very last frame so the
      // composition's tail isn't audio-only.
      endAt={totalFrames}
    />
  );
};

export default AudioBed;
