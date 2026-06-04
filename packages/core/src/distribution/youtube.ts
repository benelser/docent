// YouTube adapter — uploads a rendered film to YouTube via the Data API v3.
//
// STATUS: behind an OAUTH_CLIENT_ID env-var gate. When the env var is unset
// the adapter degrades to `{ ok: false, error: 'not configured' }` with a
// friendly hint pointing at docs/distribution.md. When it IS set, the adapter
// expects the operator to have already completed the device-code OAuth flow
// (see "YouTube setup" in docs/distribution.md) and stored a refresh token
// at `~/.docent/youtube.json`.
//
// Implementation outline — to wire up in a future PR:
//
//   1. `bun add googleapis` to @bjelser/core's optional-deps (or move the
//      adapter to a separate `@bjelser/adapter-youtube` package — preferable,
//      since most docent users don't publish to YouTube).
//   2. Read the refresh token from `~/.docent/youtube.json`; mint an access
//      token via google.auth.OAuth2.
//   3. Call `youtube.videos.insert` with the mp4 stream + a snippet derived
//      from films/<id>.json's `meta.title`, `meta.subtitle` and tags.
//   4. Return the watch URL: `https://youtube.com/watch?v=<videoId>`.
//
// Why we don't ship the implementation in this PR:
//   - The OAuth setup is the friction point for first-time users; we want
//     a separate, deliberate UX surface for it (a `docent drip auth youtube`
//     subcommand that walks the device-code flow with copy-paste prompts).
//   - The bundle cost of googleapis is meaningful (~12 MB on disk); putting
//     it in @bjelser/core means every docent install pays it.
//   - Until R5 (the YouTube subscriber flow), nobody is actively dripping
//     to YouTube — the adapter exists in this PR purely to reserve the
//     `'youtube'` Platform identifier.

import type {AdapterContext, AdapterResult} from './types';

export const youtubeAdapter = async (
  ctx: AdapterContext,
): Promise<AdapterResult> => {
  const oauth = process.env.OAUTH_CLIENT_ID;
  if (!oauth) {
    return {
      ok: false,
      error:
        'YouTube adapter not configured. Set OAUTH_CLIENT_ID + complete the device-code flow ' +
        '(`docent drip auth youtube`, coming in R5). See docs/distribution.md → "YouTube setup".',
    };
  }

  // Mock mode short-circuits even a configured adapter — the smoke test
  // can therefore exercise the full tick without burning YouTube quota.
  if (ctx.mock) {
    ctx.log(`  · youtube upload skipped (mock)`);
    return {
      ok: true,
      url: `https://www.youtube.com/watch?v=mock-${ctx.filmId}`,
      note: 'mock upload — not actually live',
    };
  }

  // The real flow lives in a future PR; for now bail with a structured
  // "stub" message rather than half-implement the OAuth dance.
  return {
    ok: false,
    error:
      'YouTube upload not yet implemented in this build. Tracking issue: distribution roadmap R5.',
  };
};
