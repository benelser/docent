// Mastodon adapter — stub. Reserves the 'mastodon' Platform identifier.
// The real adapter will post a status with the rendered mp4 attached via
// the v1/media + v1/statuses endpoints, using a per-instance access token
// stored in `~/.docent/mastodon.<instance>.json`.
//
// TODO(R7): wire the v1 statuses POST with media attachment.

import type {AdapterContext, AdapterResult} from './types';

export const mastodonAdapter = async (
  ctx: AdapterContext,
): Promise<AdapterResult> => {
  if (ctx.mock) {
    ctx.log(`  · mastodon post skipped (mock)`);
    return {
      ok: true,
      url: `https://mastodon.social/@docent/mock-${ctx.filmId}`,
      note: 'mock post — mastodon adapter not yet implemented',
    };
  }
  return {
    ok: false,
    error: 'Mastodon adapter not yet implemented. Stubbed for future R7.',
  };
};
