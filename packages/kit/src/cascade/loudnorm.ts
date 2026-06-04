// Loudness normalization — Wave R10 feature #2.
//
// Hollywood mandate: every commercial distribution channel (broadcast,
// streaming, social) targets a specific *integrated loudness* (LUFS, formerly
// LKFS). Unnormalized renders ship at whatever level the TTS provider +
// audio-bed mix produced; platforms re-process them silently (Spotify
// turn-up, YouTube ContentID gain) or flag them. The mandate is to land
// **on target** before the upload.
//
// This module owns the ffmpeg shell-out. Two surfaces:
//
//   - {@link measureLoudness}: single-pass `loudnorm=...:print_format=json`
//     against an input file. Returns the parsed JSON (integrated, range,
//     true peak, threshold, M-stat, S-stat). This is the audit tool —
//     what `docent loudness <id>` prints, what every platform's QC runs.
//
//   - {@link normalizeLoudness}: the two-pass pattern recommended by the
//     ffmpeg loudnorm docs. Pass 1 measures input_i/lra/tp/thresh; pass 2
//     applies the LINEAR (= true) gain calculated from those measurements
//     against the target. Linear mode is critical for accuracy — the
//     default dynamic mode introduces audible compression to hit the
//     target, which a film score does not want.
//
// Neither function imports anything beyond `node:*`. The kit's web bundle
// never reaches this file (the render-stage import lives inside a
// node-only path).

import {spawn} from 'node:child_process';

import type {LoudnessMeasurement} from '../types/loudness';

// Re-export the pure vocabulary for consumers that already pulled in the
// cascade module (the render-stage and the engine-loudness re-export).
// The single source of truth lives in `../types/loudness.ts`.
export {
  LOUDNESS_PRESETS,
  resolveLoudnessTarget,
} from '../types/loudness';
export type {LoudnessMeasurement} from '../types/loudness';

/**
 * Run a shell process and capture stdout + stderr. Resolves on any exit;
 * the caller inspects the code (ffmpeg writes the loudnorm JSON to stderr,
 * so we can't simply throw on non-zero).
 */
const runCapture = (
  bin: string,
  args: ReadonlyArray<string>,
): Promise<{code: number | null; stdout: string; stderr: string}> => {
  return new Promise((res, rej) => {
    const child = spawn(bin, args.slice(), {stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (b: Buffer) => (stdout += b.toString('utf-8')));
    child.stderr?.on('data', (b: Buffer) => (stderr += b.toString('utf-8')));
    child.on('error', (err: Error) => rej(err));
    child.on('close', (code: number | null) => res({code, stdout, stderr}));
  });
};

/**
 * ffmpeg's loudnorm filter prints a JSON blob to stderr at the *end* of
 * the run — after all the per-frame progress lines. The JSON starts on
 * a line that begins with `{` and ends with `}`. Grab the last such
 * block (in case the file is processed multiple times).
 */
const parseLoudnormJson = (stderr: string): Record<string, string> => {
  const startIdx = stderr.lastIndexOf('{');
  const endIdx = stderr.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(
      `loudnorm: could not find JSON in ffmpeg stderr.\n` +
        `Last 400 bytes:\n${stderr.slice(-400)}`,
    );
  }
  const blob = stderr.slice(startIdx, endIdx + 1);
  try {
    return JSON.parse(blob) as Record<string, string>;
  } catch (e) {
    throw new Error(
      `loudnorm: ffmpeg JSON parse failed: ${(e as Error).message}\n` +
        `Raw blob:\n${blob}`,
    );
  }
};

/**
 * Single-pass measurement against `input`. Used by the audit command and
 * as pass 1 of the normalize pipeline. The `targetIntegrated` seed only
 * influences ffmpeg's reported "target offset" — the measured values
 * themselves (input_i, input_lra, input_tp, input_thresh) are independent.
 */
export const measureLoudness = async (
  input: string,
  opts: {
    readonly ffmpegBin?: string;
    readonly targetIntegrated?: number;
    readonly targetLra?: number;
    readonly targetTp?: number;
  } = {},
): Promise<LoudnessMeasurement> => {
  const bin = opts.ffmpegBin ?? 'ffmpeg';
  const I = opts.targetIntegrated ?? -16;
  const LRA = opts.targetLra ?? 11;
  const TP = opts.targetTp ?? -1.0;
  const args = [
    '-hide_banner',
    '-nostats',
    '-i', input,
    '-af', `loudnorm=I=${I}:LRA=${LRA}:TP=${TP}:print_format=json`,
    '-f', 'null',
    '-',
  ];
  const r = await runCapture(bin, args);
  if (r.code !== 0) {
    throw new Error(
      `loudnorm: measurement pass failed with code=${r.code}\n` +
        `args: ${args.join(' ')}\n` +
        `stderr (last 400):\n${r.stderr.slice(-400)}`,
    );
  }
  const j = parseLoudnormJson(r.stderr);
  const num = (key: string): number => {
    const v = j[key];
    if (v === undefined) {
      throw new Error(
        `loudnorm: missing key "${key}" in ffmpeg JSON. Keys: ` +
          Object.keys(j).join(', '),
      );
    }
    const n = Number(v);
    if (!Number.isFinite(n)) {
      throw new Error(`loudnorm: non-finite value for "${key}": "${v}"`);
    }
    return n;
  };
  return {
    integrated: num('input_i'),
    loudnessRange: num('input_lra'),
    truePeak: num('input_tp'),
    threshold: num('input_thresh'),
    maxMomentary: Number(j['input_i']) > -70 ? num('input_i') : -70, // fallback
    maxShortTerm: Number(j['input_i']) > -70 ? num('input_i') : -70,
    targetOffset: num('target_offset'),
  };
};

/**
 * Two-pass loudness normalization. Pass 1 measures; pass 2 applies linear
 * gain with the measured values pinned. Writes a NEW file at `output` —
 * the caller is responsible for preserving the original input untouched.
 *
 * The video stream is copied (`-c:v copy`) so this is fast regardless of
 * film length — the cost is two ffmpeg invocations over the audio.
 */
export const normalizeLoudness = async (
  input: string,
  output: string,
  opts: {
    readonly targetIntegrated: number;
    /** Loudness range target in LU. Default 11 — the EBU R128 reference. */
    readonly targetLra?: number;
    /** True-peak ceiling in dBTP. Default -1.0 — universal safe headroom. */
    readonly targetTp?: number;
    readonly ffmpegBin?: string;
    /** Optional pre-measured pass-1 result; skips the measurement step. */
    readonly measurement?: LoudnessMeasurement;
  },
): Promise<{
  readonly measurement: LoudnessMeasurement;
  readonly outputMeasurement: LoudnessMeasurement;
}> => {
  const bin = opts.ffmpegBin ?? 'ffmpeg';
  const I = opts.targetIntegrated;
  const LRA = opts.targetLra ?? 11;
  const TP = opts.targetTp ?? -1.0;

  const measurement =
    opts.measurement ??
    (await measureLoudness(input, {
      ffmpegBin: bin,
      targetIntegrated: I,
      targetLra: LRA,
      targetTp: TP,
    }));

  // Pass 2 — apply linear gain. `linear=true` tells ffmpeg to skip the
  // built-in dynamic compressor and just shift the file by a fixed gain
  // derived from the pass-1 measurements. Critical for music-bed renders
  // where compression would chew the transients.
  const filter =
    `loudnorm=I=${I}:LRA=${LRA}:TP=${TP}` +
    `:measured_I=${measurement.integrated}` +
    `:measured_LRA=${measurement.loudnessRange}` +
    `:measured_TP=${measurement.truePeak}` +
    `:measured_thresh=${measurement.threshold}` +
    `:offset=${measurement.targetOffset}` +
    `:linear=true:print_format=json`;

  const args = [
    '-hide_banner',
    '-nostats',
    '-y',
    '-i', input,
    '-af', filter,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    output,
  ];
  const r = await runCapture(bin, args);
  if (r.code !== 0) {
    throw new Error(
      `loudnorm: normalization pass failed with code=${r.code}\n` +
        `args: ${args.join(' ')}\n` +
        `stderr (last 600):\n${r.stderr.slice(-600)}`,
    );
  }
  // Pass 2 ALSO prints a JSON blob — the "output_*" fields report the
  // measured loudness AFTER applying the gain. We surface it so the
  // caller can confirm landing.
  let outputMeasurement: LoudnessMeasurement;
  try {
    const j = parseLoudnormJson(r.stderr);
    const num = (k: string): number => {
      const v = j[k];
      if (v === undefined) throw new Error(`missing ${k}`);
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`non-finite ${k}: ${v}`);
      return n;
    };
    outputMeasurement = {
      integrated: num('output_i'),
      loudnessRange: num('output_lra'),
      truePeak: num('output_tp'),
      threshold: num('output_thresh'),
      maxMomentary: num('output_i'),
      maxShortTerm: num('output_i'),
      targetOffset: num('target_offset'),
    };
  } catch {
    // The pass-2 output keys can be missing on very short / silent files
    // (ffmpeg degrades gracefully). Fall back to a re-measurement of the
    // produced file — slow but correct.
    outputMeasurement = await measureLoudness(output, {
      ffmpegBin: bin,
      targetIntegrated: I,
      targetLra: LRA,
      targetTp: TP,
    });
  }
  return {measurement, outputMeasurement};
};

/**
 * Build the suffixed output filename for a normalized render. The naming
 * convention is `<input-stem>-lufs-<target>.<ext>` — preserves the
 * un-normalized original at the canonical path while making the target
 * legible in the filename. Negative LUFS render as `n23` (no minus sign
 * because some filesystems and CDNs treat `-` as an option marker).
 */
export const buildNormalizedOutPath = (
  inputPath: string,
  target: number,
): string => {
  // Split on the last dot to preserve `.foo.bar.mp4` style stems if any.
  const dot = inputPath.lastIndexOf('.');
  const stem = dot === -1 ? inputPath : inputPath.slice(0, dot);
  const ext = dot === -1 ? '' : inputPath.slice(dot);
  // Round to one decimal so `-16.5` doesn't produce `16.5` (which is
  // still readable) but `-16` becomes `16`. Use `n` prefix for negatives
  // for filesystem-safe rendering.
  const t = Math.round(target * 10) / 10;
  const abs = Math.abs(t).toString().replace('.', '_');
  const sign = t < 0 ? 'n' : '';
  return `${stem}-lufs-${sign}${abs}${ext}`;
};
