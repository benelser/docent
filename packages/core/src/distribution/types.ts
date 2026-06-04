// Shared types for the @bjelser/core distribution adapters.
//
// The kit owns the public DripEntry + Platform shape; this file is the
// adapter-side contract — what the CLI's `tick` calls into. Keeping it
// alongside the adapters means each adapter is a single file with a
// uniform shape, and the CLI imports `runPlatformAdapter` (the dispatcher)
// rather than a bespoke surface per platform.

import type {Platform} from '@bjelser/kit';

/**
 * Inputs every adapter receives. The CLI's tick resolves these once per
 * entry and passes the same `Context` to every platform adapter that
 * entry fans out to.
 *
 * Critically: the adapter does NOT read from arbitrary disk locations;
 * everything it needs (filmId, project root, paths to the rendered
 * artefacts) is on the context. This means the adapter is easy to
 * unit-test and easy to dry-run (`mock: true`).
 */
export interface AdapterContext {
  /** Stable film id. */
  readonly filmId: string;

  /** Absolute path to the repo root. */
  readonly projectRoot: string;

  /** Absolute path to `out/<filmId>.mp4` (the rendered film). */
  readonly mp4Path: string;

  /** Absolute path to `out/<filmId>-poster.jpg` if it exists. */
  readonly posterPath?: string;

  /**
   * When `true`, the adapter MUST NOT cause externally-visible side effects
   * (no Firebase deploy, no YouTube upload, no fediverse post). It should
   * still walk through its local steps (copying artefacts, editing the
   * landing manifest) so the smoke test can validate the wiring.
   *
   * The CLI surfaces this as `--mock` and via `DOCENT_DRIP_MOCK=1`.
   */
  readonly mock: boolean;

  /** Lightweight logger; writes to stdout + the audit log. */
  readonly log: (msg: string) => void;
}

/**
 * The return shape every adapter honours.
 *
 * - `ok: true` → the adapter published the film; `url` is the public URL.
 * - `ok: false` → the adapter failed; `error` is a short human message.
 *
 * Adapters NEVER throw for "not configured" — they return `ok: false` with
 * a friendly error like `"YouTube not configured (set OAUTH_CLIENT_ID)"`.
 * Throwing is reserved for genuine runtime panics (missing input file,
 * filesystem failure).
 */
export type AdapterResult =
  | {ok: true; url: string; note?: string}
  | {ok: false; error: string};

export type PlatformAdapter = (ctx: AdapterContext) => Promise<AdapterResult>;

/** Convenience tag used by the dispatcher's `(platform, ctx)` signature. */
export interface NamedAdapter {
  readonly platform: Platform;
  readonly run: PlatformAdapter;
}
