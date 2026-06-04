// `docent loudness <film-id>` — measure-only loudness audit.
//
// Reads `out/<id>.mp4` (or `out/<id>-lufs-<target>.mp4` when the user passed
// `--target` and the suffixed file exists), runs a SINGLE-PASS ffmpeg
// `loudnorm` against it, and prints the integrated / range / true-peak /
// M-stat / S-stat — plus per-target compliance against every Hollywood-
// mandate preset (streaming -16, broadcast -23, youtube -14, atsc -24,
// cinema -27).
//
// This is the AUDIT surface. The CLI's `build --lufs <target>` already
// prints landing for the file it just produced; `loudness` is what you
// run before a platform upload to confirm an already-built file lands on
// the target the platform demands.

import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';

import {LOUDNESS_PRESETS} from '@bjelser/kit';
import {createEngine} from '../engine-factory';

const log = (s: string): void => {
  process.stdout.write(`${s}\n`);
};
// JSON mode keeps stdout pristine for the parsed blob; anything human-
// readable goes to stderr so a `--json | jq` pipeline still works.
const logErr = (s: string): void => {
  process.stderr.write(`${s}\n`);
};

export interface LoudnessArgs {
  /** Film id (basename of out/<id>.mp4). */
  readonly filmId: string;
  /** Override the output dir (default `<cwd>/out`). */
  readonly outputDir?: string;
  /** Override the project root. */
  readonly projectRoot?: string;
  /**
   * Read a specific suffixed variant — `--variant streaming` reads
   * `out/<id>-lufs-n16.mp4` (the suffix the build command writes for
   * the `streaming` preset). When absent, reads the un-normalized
   * `out/<id>.mp4`.
   */
  readonly variant?: string;
  /** Emit JSON instead of the human-readable table. */
  readonly json?: boolean;
}

/**
 * Mirror of `buildNormalizedOutPath` from the kit's cascade — kept local
 * to avoid pulling the cascade module (and its `node:child_process`
 * footprint) into a command that doesn't need ffmpeg until the engine
 * call.
 */
const variantSuffix = (target: number): string => {
  const t = Math.round(target * 10) / 10;
  const abs = Math.abs(t).toString().replace('.', '_');
  const sign = t < 0 ? 'n' : '';
  return `-lufs-${sign}${abs}`;
};

export const runLoudness = async (args: LoudnessArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const outputDir = args.outputDir ?? join(projectRoot, 'out');

  // Resolve which mp4 to measure. With `--variant <preset|number>`, the
  // command reads the suffixed file the build wrote. Without it, the
  // base un-normalized file.
  let mp4Path = resolve(outputDir, `${args.filmId}.mp4`);
  if (args.variant !== undefined) {
    const variantRaw = args.variant.trim().toLowerCase();
    const target =
      variantRaw in LOUDNESS_PRESETS
        ? LOUDNESS_PRESETS[variantRaw]!
        : Number(variantRaw);
    if (!Number.isFinite(target)) {
      log(`\x1b[31m✗ unrecognized --variant "${args.variant}"\x1b[0m`);
      log(
        `  expected a number (e.g. -16) or one of: ` +
          Object.keys(LOUDNESS_PRESETS).join(', '),
      );
      return 64;
    }
    mp4Path = resolve(outputDir, `${args.filmId}${variantSuffix(target)}.mp4`);
  }

  if (!existsSync(mp4Path)) {
    logErr(`\x1b[31m✗ mp4 not found at ${mp4Path}\x1b[0m`);
    logErr(`  Build the film first: docent build ${args.filmId}`);
    return 1;
  }

  // Banner + engine-init chatter goes to stderr unconditionally so that
  // `--json` produces a clean parseable stdout. The factory itself writes
  // to stdout via the engine; we silence it with a stdout-rewrite around
  // the createEngine call when --json is set.
  const banner = (s: string): void => {
    if (args.json) {
      process.stderr.write(`${s}\n`);
    } else {
      process.stdout.write(`${s}\n`);
    }
  };
  banner(`\x1b[36m▶ docent loudness ${args.filmId}\x1b[0m`);
  banner(`  source: ${mp4Path}`);

  // Suppress engine-factory chatter when emitting JSON. The factory
  // currently writes "engine: N scenes…" to stdout via the build/preview
  // commands' own logger — but `createEngine` itself is silent, so the
  // only chatter is whatever the user's docent.config.ts emits. We swap
  // stdout for the duration of createEngine + measurement in --json mode.
  let savedStdoutWrite: typeof process.stdout.write | null = null;
  if (args.json) {
    savedStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown, ...rest: unknown[]): boolean => {
      // Route any incidental stdout to stderr so it doesn't corrupt JSON.
      return (process.stderr.write as (...a: unknown[]) => boolean)(
        chunk,
        ...rest,
      );
    }) as typeof process.stdout.write;
  }

  const {engine} = await createEngine(projectRoot);

  let measurement;
  try {
    measurement = await engine.measureLoudness(mp4Path);
  } catch (e) {
    if (savedStdoutWrite) process.stdout.write = savedStdoutWrite;
    logErr(`\x1b[31m✗ measurement failed: ${(e as Error).message}\x1b[0m`);
    return 3;
  }
  if (savedStdoutWrite) process.stdout.write = savedStdoutWrite;

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          filmId: args.filmId,
          path: mp4Path,
          measurement,
          compliance: Object.fromEntries(
            Object.entries(LOUDNESS_PRESETS).map(([name, target]) => [
              name,
              {
                target,
                drift: measurement.integrated - target,
                withinHalfLu:
                  Math.abs(measurement.integrated - target) <= 0.5,
              },
            ]),
          ),
        },
        null,
        2,
      ) + '\n',
    );
    return 0;
  }

  log(
    `\x1b[1m  integrated ${measurement.integrated.toFixed(2)} LUFS\x1b[0m · ` +
      `loudness range ${measurement.loudnessRange.toFixed(2)} LU · ` +
      `true peak ${measurement.truePeak.toFixed(2)} dBTP`,
  );
  log(
    `  M-stat ${measurement.maxMomentary.toFixed(2)} · ` +
      `S-stat ${measurement.maxShortTerm.toFixed(2)} · ` +
      `threshold ${measurement.threshold.toFixed(2)}`,
  );
  log('');
  log(`  compliance:`);

  // Per-target compliance — the same per-platform ladder a QC bot runs.
  // Within ±0.5 LU = "on target"; within ±1.0 = "close"; else = drift.
  for (const [name, target] of Object.entries(LOUDNESS_PRESETS)) {
    const drift = measurement.integrated - target;
    const absDrift = Math.abs(drift);
    const direction = drift > 0 ? 'above' : 'below';
    const ok = absDrift <= 0.5;
    const close = absDrift <= 1.0;
    const tag = ok
      ? '\x1b[32m✓\x1b[0m'
      : close
      ? '\x1b[33m~\x1b[0m'
      : '\x1b[31m✗\x1b[0m';
    const verdict = ok
      ? 'on target'
      : `${absDrift.toFixed(2)} LU ${direction} target`;
    log(
      `    ${tag} ${name.padEnd(10)} (${target.toString().padStart(4)} LUFS): ${verdict}`,
    );
  }

  // True-peak compliance — universal -1.0 dBTP ceiling is the safe
  // platform default. Above 0 dBTP risks clipping; above -1.0 risks
  // inter-sample peaks on lossy codecs.
  log('');
  if (measurement.truePeak > 0) {
    log(
      `  \x1b[31m✗ true peak ${measurement.truePeak.toFixed(2)} dBTP — over 0 dBTP, will clip\x1b[0m`,
    );
  } else if (measurement.truePeak > -1.0) {
    log(
      `  \x1b[33m~ true peak ${measurement.truePeak.toFixed(2)} dBTP — over -1.0 dBTP safe ceiling\x1b[0m`,
    );
  } else {
    log(
      `  \x1b[32m✓ true peak ${measurement.truePeak.toFixed(2)} dBTP — under -1.0 dBTP safe ceiling\x1b[0m`,
    );
  }

  return 0;
};
