// Pure loudness vocabulary — browser-safe.
//
// Lives apart from `../cascade/loudnorm.ts` because the cascade module
// imports `node:child_process` to shell to ffmpeg. The kit's `index.ts`
// re-exports this file but NOT the cascade module — browsers can read
// the preset map / type vocabulary without ever pulling Node primitives.
//
// The cascade module re-exports {@link LOUDNESS_PRESETS} and
// {@link resolveLoudnessTarget} for its own convenience, but the
// single source of truth lives here.

/**
 * Hollywood-mandate integrated-loudness targets. Keys are the preset
 * names the CLI's `--lufs <preset>` flag accepts; values are the
 * **integrated loudness** in LUFS the file should land on.
 *
 * Sources:
 *   - `streaming`  — TikTok / Instagram / podcast de-facto social standard
 *   - `broadcast`  — EBU R128 (European TV / radio)
 *   - `youtube`    — YouTube / Spotify integrated target
 *   - `atsc`       — ATSC A/85 / US CALM Act broadcast
 *   - `cinema`     — Apple TV+ / Netflix / Disney+ premium streaming
 */
export const LOUDNESS_PRESETS: Readonly<Record<string, number>> = {
  streaming: -16,
  broadcast: -23,
  youtube: -14,
  atsc: -24,
  cinema: -27,
} as const;

/**
 * Resolve a user-supplied `--lufs` value to an integrated-LUFS target.
 * Accepts a numeric string, a preset name from {@link LOUDNESS_PRESETS},
 * or `'none'` (returns `null` — explicit opt-out).
 *
 * Throws on garbage input so the CLI surfaces a friendly error rather
 * than silently dropping to "no normalization".
 */
export const resolveLoudnessTarget = (raw: string): number | null => {
  const v = raw.trim().toLowerCase();
  if (v === 'none' || v === 'off' || v === '') return null;
  if (Object.prototype.hasOwnProperty.call(LOUDNESS_PRESETS, v)) {
    return LOUDNESS_PRESETS[v]!;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(
      `unrecognized --lufs value "${raw}" — expected a number ` +
        `(e.g. -16, -23), one of ${Object.keys(LOUDNESS_PRESETS).join(', ')}, ` +
        `or 'none' to skip normalization`,
    );
  }
  return n;
};

/**
 * Parsed result of a single-pass `loudnorm` measurement. Field names
 * mirror ffmpeg's JSON keys verbatim so a downstream consumer can grep
 * them.
 */
export interface LoudnessMeasurement {
  /** Integrated loudness across the file, in LUFS (negative = quieter). */
  readonly integrated: number;
  /** Loudness range across the file, in LU. */
  readonly loudnessRange: number;
  /** True peak across the file, in dBTP. */
  readonly truePeak: number;
  /** Loudnorm gating threshold, in LUFS. */
  readonly threshold: number;
  /** EBU R128 M-stat (max momentary loudness), in LUFS. */
  readonly maxMomentary: number;
  /** EBU R128 S-stat (max short-term loudness), in LUFS. */
  readonly maxShortTerm: number;
  /** Suggested target offset (used as the linear-gain seed in pass 2). */
  readonly targetOffset: number;
}
