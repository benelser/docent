// @bjelser/core/distribution — the platform-adapter pack.
//
// One `runPlatformAdapter(platform, ctx)` dispatcher the CLI's `docent drip
// tick` calls; one named adapter export per platform for third-party reuse
// or testing. All adapters share the `AdapterContext` + `AdapterResult`
// shape defined in `./types`.

import type {Platform} from '@bjelser/kit';
import {ALL_PLATFORMS} from '@bjelser/kit';

import {docentStudioAdapter} from './docent-studio';
import {youtubeAdapter} from './youtube';
import {vimeoAdapter} from './vimeo';
import {mastodonAdapter} from './mastodon';
import {blueskyAdapter} from './bluesky';
import type {AdapterContext, AdapterResult, PlatformAdapter} from './types';

export {docentStudioAdapter} from './docent-studio';
export {youtubeAdapter} from './youtube';
export {vimeoAdapter} from './vimeo';
export {mastodonAdapter} from './mastodon';
export {blueskyAdapter} from './bluesky';
export type {AdapterContext, AdapterResult, PlatformAdapter, NamedAdapter} from './types';

const adapters: Record<Platform, PlatformAdapter> = {
  'docent-studio': docentStudioAdapter,
  youtube: youtubeAdapter,
  vimeo: vimeoAdapter,
  mastodon: mastodonAdapter,
  bluesky: blueskyAdapter,
};

export const runPlatformAdapter = async (
  platform: Platform,
  ctx: AdapterContext,
): Promise<AdapterResult> => {
  const adapter = adapters[platform];
  if (!adapter) {
    return {
      ok: false,
      error: `unknown platform "${platform}" — expected one of ${ALL_PLATFORMS.join(', ')}`,
    };
  }
  return adapter(ctx);
};
