// Bluesky adapter — stub. Reserves the 'bluesky' Platform identifier.
// The real adapter will post via the AT Protocol (`com.atproto.repo.createRecord`
// + `app.bsky.video.upload`) using an app-password auth flow.
//
// TODO(R8): wire AT Protocol upload + post creation. Note: Bluesky's
// video upload caps at 90s currently — many docent films exceed that
// and will need a separate "trailer cut" pipeline.

import type {AdapterContext, AdapterResult} from './types';

export const blueskyAdapter = async (
  ctx: AdapterContext,
): Promise<AdapterResult> => {
  if (ctx.mock) {
    ctx.log(`  · bluesky post skipped (mock)`);
    return {
      ok: true,
      url: `https://bsky.app/profile/docent.studio/post/mock-${ctx.filmId}`,
      note: 'mock post — bluesky adapter not yet implemented',
    };
  }
  return {
    ok: false,
    error: 'Bluesky adapter not yet implemented. Stubbed for future R8.',
  };
};
