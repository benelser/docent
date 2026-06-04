// Vimeo adapter — stub. Reserves the 'vimeo' Platform identifier so a
// future adapter can light up without a queue migration. See youtube.ts
// for the pattern; Vimeo's upload-by-URL flow is simpler than YouTube's
// resumable-upload protocol, so this is the lowest-cost real adapter to
// land next.
//
// TODO(R6): wire vimeo.api/me/videos with `tus` resumable upload + the
// PAT (personal access token) auth model (much simpler than OAuth).

import type {AdapterContext, AdapterResult} from './types';

export const vimeoAdapter = async (
  ctx: AdapterContext,
): Promise<AdapterResult> => {
  if (ctx.mock) {
    ctx.log(`  · vimeo upload skipped (mock)`);
    return {
      ok: true,
      url: `https://vimeo.com/mock-${ctx.filmId}`,
      note: 'mock upload — vimeo adapter not yet implemented',
    };
  }
  return {
    ok: false,
    error: 'Vimeo adapter not yet implemented. Stubbed for future R6.',
  };
};
