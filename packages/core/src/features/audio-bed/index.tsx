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
  wordTimings,
  sceneClusters,
}) => {
  const musicUrl = typeof meta.music === 'string' ? meta.music.trim() : '';
  if (!musicUrl) return null;
  return (
    <AudioBed
      musicUrl={musicUrl}
      fps={fps}
      totalFrames={totalFrames}
      beats={beats}
      // R8 opt-ins: pass through unconditionally. The component
      // gracefully degrades when either is absent / empty.
      {...(wordTimings ? {wordTimings} : {})}
      {...(sceneClusters ? {sceneClusters} : {})}
      // R16.4: thread the spec meta through so the bed can read namespaced
      // featureOptions (e.g. the agentopsContextHud stability curve) and
      // modulate its own volume in response. Absent → byte-identical
      // legacy behaviour, which the gracefully-degraded default handles.
      meta={meta}
    />
  );
};

/**
 * Pre-render fs probe lives in `./_probe.ts` (Node-only). Loaded via a
 * webpack-opaque indirect require so the browser bundle never tries to
 * resolve `node:fs`. The `validateSpec` hook only runs server-side
 * during the cascade, so this code path is unreachable in chrome-
 * headless.
 */
const validateMusic = (
  spec: FilmSpec,
  ctx: {readonly filmId: string; readonly projectRoot?: string},
): ReadonlyArray<SceneIssue> => {
  // Webpack's static analyzer can't see through `new Function('return require')()` —
  // the probe module only loads when the cascade actually calls into the
  // validator (server-side), never during render-entry bundling.
  try {
    const req = new Function('id', 'return require(id)') as (id: string) => {
      probeMusicAsset: typeof import('./_probe').probeMusicAsset;
    };
    return req('./_probe').probeMusicAsset(spec, ctx);
  } catch {
    return [];
  }
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
