// Node-only filesystem probe for `meta.music`. Lives in its own file so
// the browser bundle (index.tsx → audioBedFeature → AudioBed component)
// never touches `node:fs` / `node:path` imports. The cascade calls this
// via the feature's `validateSpec` hook, which only ever runs server-
// side.

import {existsSync} from 'node:fs';
import {isAbsolute, join} from 'node:path';

import type {FilmSpec, SceneIssue} from '@bjelser/kit';

export const probeMusicAsset = (
  spec: FilmSpec,
  ctx: {readonly filmId: string; readonly projectRoot?: string},
): ReadonlyArray<SceneIssue> => {
  const music =
    typeof spec.meta.music === 'string' ? spec.meta.music.trim() : '';
  if (!music) return [];
  if (/^https?:\/\//i.test(music)) return [];
  if (!ctx.projectRoot) return [];
  const candidate = isAbsolute(music)
    ? music
    : music.includes('/')
      ? join(ctx.projectRoot, 'public', music)
      : join(ctx.projectRoot, 'public', 'audio', music);
  if (existsSync(candidate)) return [];
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
};
