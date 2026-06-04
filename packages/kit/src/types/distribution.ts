// Drip publication — the queue schema and platform vocabulary the CLI's
// `docent drip` surface and the platform-adapters in `@bjelser/core/distribution`
// both speak.
//
// Why it lives in @bjelser/kit: this is the public contract. A third-party
// platform-adapter (a Mastodon flavour, a custom CMS, a private S3 bucket)
// only needs to import these types — it never has to depend on the CLI
// shell or the core plugin pack.
//
// The shape mirrors the canonical drip pattern (queue, cron tick, per-entry
// status machine) made explicit and multi-platform: one queue entry can
// fan out to N platforms.

/* ───────── platforms ───────── */

/**
 * The closed set of platforms the drip pipeline can publish to. Adding a new
 * platform is additive: a new identifier here, plus a new adapter in
 * `@bjelser/core/src/distribution/<platform>.ts`. Consumers MUST treat the
 * set as exhaustive — a `switch (platform)` must `never` on default.
 *
 * The first two are real (`docent-studio` deploys to Firebase Hosting;
 * `youtube` uploads to YouTube Data API v3). The rest are stubs that
 * print "not yet implemented" — they reserve the identifier so a future
 * adapter can light up without a queue migration.
 */
export type Platform =
  | 'docent-studio'
  | 'youtube'
  | 'vimeo'
  | 'mastodon'
  | 'bluesky';

export const ALL_PLATFORMS: readonly Platform[] = [
  'docent-studio',
  'youtube',
  'vimeo',
  'mastodon',
  'bluesky',
] as const;

export const isPlatform = (v: string): v is Platform =>
  (ALL_PLATFORMS as readonly string[]).includes(v);

/* ───────── schedule ───────── */

/**
 * Recurring-cadence shorthand. `MWF` = Monday/Wednesday/Friday, `TTH` =
 * Tuesday/Thursday, `daily` = every day, `weekly` = same weekday as the
 * entry was added. The tick reads `cadence + timeOfDay + timezone` and
 * computes the next fire window.
 */
export type Cadence = 'MWF' | 'TTH' | 'daily' | 'weekly';

export interface ScheduleCron {
  readonly cron: string;
}
export interface ScheduleDatetime {
  /** ISO-8601 datetime — one-shot fire, no recurrence. */
  readonly datetime: string;
}
export interface ScheduleCadence {
  readonly cadence: Cadence;
  /** `'HH:MM'` (24h). */
  readonly timeOfDay: string;
  /** IANA timezone, e.g. `'America/Chicago'`. */
  readonly timezone: string;
}

export type ScheduleSpec = ScheduleCron | ScheduleDatetime | ScheduleCadence;

export const isCronSchedule = (s: ScheduleSpec): s is ScheduleCron =>
  'cron' in s && typeof s.cron === 'string';
export const isDatetimeSchedule = (s: ScheduleSpec): s is ScheduleDatetime =>
  'datetime' in s && typeof s.datetime === 'string';
export const isCadenceSchedule = (s: ScheduleSpec): s is ScheduleCadence =>
  'cadence' in s && 'timeOfDay' in s;

/* ───────── status ───────── */

/**
 * The lifecycle of a single queued film.
 *
 * - `pending`  — queued, scheduled time in the future.
 * - `scheduled` — queued, the tick has acknowledged it's "due" but a worker
 *                 has not started yet (a soft hold to keep two tick processes
 *                 from racing on the same entry; see the lockfile pattern in
 *                 `docs/distribution.md`).
 * - `publishing` — actively executing platform adapters.
 * - `published`  — all platforms reported success; `publishedAt` is set.
 * - `skipped`    — manually cancelled, or the source artefact is missing
 *                  and the operator chose to skip rather than fail.
 * - `failed`     — at least one platform errored after the retry budget was
 *                  exhausted; `error` is set; `attempts` is incremented.
 */
export type DripStatus =
  | 'pending'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'skipped'
  | 'failed';

/* ───────── per-platform record ───────── */

/**
 * Per-platform publication result. A `DripEntry.platforms` listing
 * `['docent-studio', 'youtube']` translates to two `PlatformResult`s on the
 * entry once the tick runs.
 */
export interface PlatformResult {
  readonly platform: Platform;
  readonly status: 'pending' | 'published' | 'skipped' | 'failed';
  /** ISO-8601 timestamp of the moment the platform reported success. */
  readonly publishedAt?: string;
  /** Public URL the platform returned (e.g. `https://docent.studio/v/foo`). */
  readonly url?: string;
  /** Trimmed error message if `status === 'failed'`. */
  readonly error?: string;
}

/* ───────── audit log ───────── */

/**
 * A single audit-log line — written to `drip/audit.log` (NDJSON) and echoed
 * to stdout in tick output. Audit lines are append-only; the queue file is
 * the source of truth, the audit log is the receipt.
 */
export interface DripAuditLine {
  readonly ts: string;
  readonly filmId: string;
  readonly event:
    | 'add'
    | 'tick-start'
    | 'tick-skip'
    | 'publish-start'
    | 'publish-ok'
    | 'publish-fail'
    | 'cancel'
    | 'tick-end';
  readonly platform?: Platform;
  readonly url?: string;
  readonly error?: string;
  readonly note?: string;
}

/* ───────── queue entry ───────── */

export interface DripEntry {
  /** Stable film id — matches `films/<id>.json` and `out/<id>.mp4`. */
  readonly id: string;

  /** Which platforms this entry fans out to. */
  readonly platforms: readonly Platform[];

  /** The schedule (one of the three shapes). */
  readonly schedule: ScheduleSpec;

  /** Roll-up status across platforms. */
  status: DripStatus;

  /** ISO-8601 timestamp when the entry rolled up to `published`. */
  publishedAt?: string;

  /** Times the tick has dispatched a `publishing` cycle for this entry. */
  attempts: number;

  /** Trimmed error message; cleared when status leaves `failed`. */
  error?: string;

  /**
   * Per-platform results. Populated lazily by the tick — empty on a brand-new
   * `pending` entry, one record per platform after the first tick.
   */
  results?: PlatformResult[];

  /** Free-form note the operator can stash (e.g. "delayed for press embargo"). */
  note?: string;
}

/* ───────── manifest ───────── */

export interface DripManifest {
  readonly version: 1;
  entries: DripEntry[];
  lastTick?: string;
}

/* ───────── helpers ───────── */

export const emptyManifest = (): DripManifest => ({
  version: 1,
  entries: [],
});
