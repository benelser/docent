// AudioBed — the film-wide background-music overlay.
//
// Mounted ONCE at film scope via the FeaturePlugin `wrapsFilm` hook, so
// the bed spans the whole film and never restarts at scene boundaries.
// The component lays a single `<Audio>` for the music track and tweens
// its volume per-frame:
//
//   - In a "narration window" (any frame where a beat's per-beat audio
//     overlay is playing): volume DUCKS to ~0.08, with a short ramp on
//     each side so the duck isn't a hard click.
//   - Outside narration windows: volume sits at the base level (~0.20).
//
// The ramp uses Remotion's `interpolate` across the duck boundary so the
// transition is a smooth fade rather than a step. The window detector
// reads the flat `beats` list the kit's composition hands the feature in
// absolute film-frame coordinates — no schedule re-walking.

import React, {useCallback, useMemo} from 'react';
import {Audio, interpolate, staticFile, useCurrentFrame} from 'remotion';

import type {FilmFeatureBeatSlot} from '@bjelser/kit';

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
  /** Base (un-ducked) volume. Defaults to 0.20. */
  readonly baseVolume?: number;
  /** Ducked volume while narration is playing. Defaults to 0.08. */
  readonly duckedVolume?: number;
  /**
   * Linear ramp width (in frames) on each side of a narration window.
   * Smooths the duck so the transition isn't a sharp click. Defaults to
   * ~6 frames (~200ms at 30fps).
   */
  readonly rampFrames?: number;
}

/**
 * Project a list of beat slots into the set of (start, end) windows that
 * carry narration audio. A frame inside any of those windows means
 * narration is playing — the bg-music ducks.
 */
const narrationWindows = (
  beats: ReadonlyArray<FilmFeatureBeatSlot>,
): ReadonlyArray<readonly [number, number]> => {
  const out: Array<[number, number]> = [];
  for (const b of beats) {
    if (typeof b.audio !== 'string' || b.audio.length === 0) continue;
    out.push([b.startFrame, b.startFrame + b.frames]);
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
  baseVolume = 0.2,
  duckedVolume = 0.08,
  rampFrames,
}) => {
  // Default ramp: ~200ms each side at the project fps. Bounded so a
  // weirdly-low fps doesn't collapse the ramp to 0.
  const ramp = Math.max(2, rampFrames ?? Math.round(fps * 0.2));

  const windows = useMemo(() => narrationWindows(beats), [beats]);

  // `volume` accepts a `(frame) => number` selector. The selector
  // computes a smoothed duck profile: for each narration window, ramp
  // from base → ducked over `ramp` frames into the window, hold the
  // ducked level, then ramp back. Outside every window the bed sits at
  // base. The composition is `min()` across windows: if the frame is in
  // the ramp of any window, the lowest duck wins.
  const volumeFor = useCallback(
    (frame: number): number => {
      if (windows.length === 0) return baseVolume;
      let v = baseVolume;
      for (const [start, end] of windows) {
        if (frame < start - ramp || frame > end + ramp) continue;
        // Inside the window (with ramp): tween base → ducked → base via
        // a piecewise-linear interpolate over four anchors.
        const tween = interpolate(
          frame,
          [start - ramp, start, end, end + ramp],
          [baseVolume, duckedVolume, duckedVolume, baseVolume],
          {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
        );
        if (tween < v) v = tween;
      }
      return v;
    },
    [windows, baseVolume, duckedVolume, ramp],
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
