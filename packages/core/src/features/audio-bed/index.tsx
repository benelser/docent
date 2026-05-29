// audioBedFeature — the film-wide background-music bed, expressed as a
// FeaturePlugin (see plugin-architecture-strategy.md §4.5).
//
// The bed reads `spec.meta.music` — a path under the Remotion publicDir
// (e.g. `"theme.mp3"` resolves to `<publicDir>/audio/theme.mp3`). When
// the field is absent the feature is a no-op: the `wrapsFilm` hook
// returns `null` and Remotion mounts nothing.
//
// When present, the feature uses the kit's `wrapsFilm` mount point so
// the bed spans the ENTIRE film (not per-scene) and ducks volume while
// narration is playing in the timeline — see ./component.tsx for the
// smoothing details.

import React from 'react';

import type {
  FeaturePlugin,
  FilmFeatureProps,
  FilmSpec,
  SceneIssue,
  SceneOutput,
} from '@bjelser/kit';

import {AudioBed} from './component';

// Lazy node:fs probe — same pattern as the figure validator. The
// `browser` field in core's package.json stubs `node:fs` so this returns
// `undefined` in chromium bundles; the validator never runs there
// anyway, but we stay defensive.
import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';

const safeExistsSync = (p: string): boolean | undefined => {
  const fn = (nodeFs as {existsSync?: (p: string) => boolean}).existsSync;
  return typeof fn === 'function' ? fn(p) : undefined;
};
const safeIsAbsolute = (p: string): boolean => {
  const fn = (nodePath as {isAbsolute?: (p: string) => boolean}).isAbsolute;
  return typeof fn === 'function' ? fn(p) : p.startsWith('/');
};
const safeJoin = (...parts: string[]): string => {
  const fn = (nodePath as {join?: (...parts: string[]) => string}).join;
  return typeof fn === 'function' ? fn(...parts) : parts.join('/');
};

export {AudioBed} from './component';
export type {AudioBedProps} from './component';

/**
 * The wrapsFilm component. Reads `meta.music` — absent means no bed,
 * present means mount `<AudioBed>` for the whole timeline.
 *
 * `meta.music` semantics:
 *   - bare filename (`"theme.mp3"`)        → `<publicDir>/audio/theme.mp3`
 *   - explicit path  (`"audio/x/y.mp3"`)   → `<publicDir>/audio/x/y.mp3`
 *   - URL (`"https://…"`)                   → fetched directly
 *
 * Volume ducks from base (≈0.20) to ducked (≈0.08) inside narration
 * windows, with a short ramp so the duck isn't an audible click.
 */
const AudioBedOverlay: React.FC<FilmFeatureProps> = ({
  meta,
  totalFrames,
  fps,
  beats,
}) => {
  const musicUrl = typeof meta.music === 'string' ? meta.music.trim() : '';
  if (!musicUrl) return null;
  return (
    <AudioBed
      musicUrl={musicUrl}
      fps={fps}
      totalFrames={totalFrames}
      beats={beats}
    />
  );
};

/**
 * Pre-render fs probe: when `meta.music` is set, verify the file
 * actually resolves to disk before the slow render. A miss surfaces as
 * a WARNING (not an error) — the feature gracefully no-ops at render
 * time if the asset is missing, so the film still renders silently
 * rather than crashing. The warning gives the author the exact path
 * the bed will look for so they can drop the file in.
 *
 * URLs and absent `meta.music` are no-ops here.
 */
const validateMusic = (
  spec: FilmSpec,
  ctx: {readonly filmId: string; readonly projectRoot?: string},
): ReadonlyArray<SceneIssue> => {
  const music =
    typeof spec.meta.music === 'string' ? spec.meta.music.trim() : '';
  if (!music) return [];
  if (/^https?:\/\//i.test(music)) return []; // URLs aren't probed
  if (!ctx.projectRoot) return []; // no fs root → skip the probe
  // Resolution mirrors component.tsx's `resolveMusicUrl`: a bare filename
  // resolves under public/audio/, an explicit path resolves under public/.
  const candidate = safeIsAbsolute(music)
    ? music
    : music.includes('/')
      ? safeJoin(ctx.projectRoot, 'public', music)
      : safeJoin(ctx.projectRoot, 'public', 'audio', music);
  const hit = safeExistsSync(candidate);
  if (hit === false) {
    return [
      {
        path: 'meta.music',
        message:
          `audio-bed: music asset not found on disk — expected at ${candidate}. ` +
          `The feature will no-op at render time, so the film still renders, ` +
          `but the bg-music bed will be silent.`,
        severity: 'warning',
        code: 'audio-bed/music-missing-on-disk',
      },
    ];
  }
  return [];
};

export const audioBedFeature: FeaturePlugin = {
  kind: 'feature',
  name: 'audio-bed',
  version: '1.0.0',

  // Mount once at film scope so the bed never restarts at scene
  // boundaries (a per-scene wrap restarts the bg-music every cut, which
  // is exactly the wrong behaviour for a continuous bed).
  wrapsFilm: AudioBedOverlay,

  // Film-level pre-render fs probe for `meta.music`.
  validateSpec: validateMusic,

  // Held open — a future revision might post-process the mix here.
  wrapRender(rendered: SceneOutput, _ctx): SceneOutput {
    return rendered;
  },
};

export default audioBedFeature;
