// Render stage — the cascade's final move. Invokes Remotion via shell-out
// against an entry script provided by the caller.
//
// **Strategy: shell to `remotion render`**. The programmatic
// `@remotion/renderer.renderMedia()` path is cleaner in theory but requires
// us to also bundle the composition (with `@remotion/bundler`) and to push
// the engine through `inputProps` — engines are live JS instances with
// plugin closures, so they can't survive JSON serialization. Shelling out
// keeps the engine reconstructed *inside* the bundled subprocess via
// statically-imported plugins in the caller-provided entry script.
//
// The contract:
//   - Inputs: spec, engine, resolved style (carried for future feature wrap),
//     tts manifest (carried for parity; the entry decides about audio overlay),
//     RenderOptions (scale, concurrency, still, entryPath, outputDir, …).
//   - The invoker MUST set `opts.entryPath` to an absolute path of a Remotion
//     entry script that statically imports the required plugins and calls
//     `registerKitRoot({plugins, spec})`. The kit refuses to render without
//     one because picking plugins is an opinionated decision the framework
//     does not own. `@bjelser/cli` generates this entry per render via
//     `src/render-entry.ts`.
//   - Output: mp4 (or png still) at `<outputDir>/<filmId>.{mp4|png}`.

import {existsSync, mkdirSync} from 'node:fs';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {spawn} from 'node:child_process';

import type {Engine} from '../engine';
import type {FilmSpec, RenderOptions, RenderResult} from '../protocols';
import type {ResolvedStyle} from '../types/style';
import type {TtsStageManifest} from './tts-stage';
import {
  buildNormalizedOutPath,
  normalizeLoudness,
} from './loudnorm';

export interface RenderStageInput {
  readonly spec: FilmSpec;
  readonly engine: Engine;
  readonly style: ResolvedStyle;
  readonly tts: TtsStageManifest;
  readonly opts: RenderOptions;
}

/** Find the remotion bin in a way that survives monorepo + workspace setups. */
const defaultRemotionBin = (cwd: string): string => {
  let dir = cwd;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'node_modules', '.bin', 'remotion');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 'remotion';
};

/**
 * Run a child process to completion. Resolves on exit code 0; rejects with
 * a structured error otherwise. Uses `spawn` with `stdio: 'inherit'` so
 * Remotion's progress bar streams live.
 */
const runChild = (
  bin: string,
  args: ReadonlyArray<string>,
  env: Record<string, string | undefined>,
  cwd: string,
): Promise<void> => {
  return new Promise((res, rej) => {
    const child = spawn(bin, args.slice(), {
      cwd,
      env: env as NodeJS.ProcessEnv,
      stdio: 'inherit',
    });
    child.on('error', (err: Error) => rej(err));
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (code === 0) return res();
      rej(
        new Error(
          `[@bjelser/kit] remotion render exited with code=${code} signal=${signal}\n` +
            `  bin: ${bin}\n` +
            `  args: ${args.join(' ')}`,
        ),
      );
    });
  });
};

/**
 * Render the film. Shells out to `remotion render <entry> <id> <output>`
 * (or `still` for a still frame).
 */
export const runRenderStage = async (
  input: RenderStageInput,
): Promise<RenderResult> => {
  const {opts, spec, tts} = input;
  const cwd = process.cwd();

  if (!opts.entryPath) {
    throw new Error(
      '[@bjelser/kit] render stage: opts.entryPath is required. The kit does ' +
        'not choose which plugins to load — the invoker (typically @bjelser/cli) ' +
        'must generate a Remotion entry that statically imports the desired ' +
        'plugins (so webpack can bundle them for chromium) and pass its path ' +
        'as RenderOptions.entryPath.',
    );
  }

  const outputDir = opts.outputDir ?? join(cwd, 'out');
  mkdirSync(outputDir, {recursive: true});

  const filmId = spec.meta.id;
  const isStill = typeof opts.still === 'number';
  const ext = isStill ? 'png' : 'mp4';
  const explicit = (opts as RenderOptions).readOutPath;
  // Language suffix — when `opts.lang` is set, the output filename gets a
  // `-<lang>` suffix so multiple language renders can co-exist in `out/`
  // (e.g. `out/foo.mp4`, `out/foo-es.mp4`, `out/foo-ja.mp4`). Stills get
  // the suffix BEFORE the `-still` marker for the same reason.
  const langSuffix = opts.lang ? `-${opts.lang}` : '';
  const outPath =
    explicit && isAbsolute(explicit)
      ? explicit
      : join(
          outputDir,
          `${filmId}${langSuffix}${isStill ? '-still' : ''}.${ext}`,
        );

  const remotionBin = opts.remotionBin ?? defaultRemotionBin(cwd);
  const entryPath = resolve(opts.entryPath);

  // Where Remotion looks for `remotion.config.ts`: it walks up from cwd
  // looking for the closest package.json (its "remotion root"). If we let
  // it run from a subdir like `tests/example-docent-scifi/`, it finds that
  // package.json and never sees the root `remotion.config.ts` where the
  // webpack overrides (.js → .tsx, node externals, etc.) live.
  //
  // The invoker (CLI) passes `renderCwd` pointing to the dir that owns
  // remotion.config.ts (typically the repo root). Defaults to the current
  // process cwd.
  const renderCwd =
    (opts as RenderOptions & {renderCwd?: string}).renderCwd ?? cwd;

  const env: Record<string, string | undefined> = {...process.env};

  const args: string[] = [];
  if (isStill) {
    args.push('still', entryPath, filmId, outPath, `--frame=${opts.still}`);
  } else {
    args.push('render', entryPath, filmId, outPath);
    if (opts.concurrency !== undefined) {
      args.push(`--concurrency=${opts.concurrency}`);
    }
    if (opts.scale !== undefined) {
      args.push(`--scale=${opts.scale}`);
    }
    if (opts.codec) {
      args.push(`--codec=${opts.codec}`);
    }
  }
  if (opts.publicDir) {
    args.push(`--public-dir=${opts.publicDir}`);
  }

  const t0 = performance.now();
  await runChild(remotionBin, args, env, renderCwd);
  const durationMs = performance.now() - t0;

  // ─── R10 #2 — loudness normalization (LUFS) ────────────────────────────
  // When `opts.lufs` is set AND the render produced an mp4 (stills skip),
  // run the two-pass ffmpeg `loudnorm` against the rendered file. The
  // normalized file lands at a sibling path with a `-lufs-<target>`
  // suffix so the un-normalized original survives at `outPath` (callers
  // that want only the normalized file can delete the original or read
  // it from `loudness.normalizedPath`).
  //
  // Stills can't carry audio, so we short-circuit. Errors here surface
  // as a render failure — the user asked for a normalized output, the
  // render does not "half-succeed".
  let loudness: RenderResult['loudness'] | undefined;
  if (!isStill && typeof opts.lufs === 'number') {
    const normalizedPath = buildNormalizedOutPath(outPath, opts.lufs);
    process.stdout.write(
      `  loudness: normalizing → ${opts.lufs} LUFS (target)\n`,
    );
    const {measurement, outputMeasurement} = await normalizeLoudness(
      outPath,
      normalizedPath,
      {targetIntegrated: opts.lufs},
    );
    loudness = {
      target: opts.lufs,
      measured: measurement.integrated,
      landed: outputMeasurement.integrated,
      truePeak: outputMeasurement.truePeak,
      normalizedPath,
    };
    process.stdout.write(
      `  LUFS normalized: ${measurement.integrated.toFixed(1)}` +
        `→${outputMeasurement.integrated.toFixed(1)} ` +
        `(target ${opts.lufs}, true peak ${outputMeasurement.truePeak.toFixed(1)} dBTP)\n` +
        `  loudness: wrote ${normalizedPath}\n`,
    );
  }

  return {
    outPath,
    durationMs,
    tts: tts.beats.map((b) => ({
      sceneIndex: b.sceneIndex,
      beatIndex: b.beatIndex,
      wpm: b.wpm,
      clipSeconds: b.clipSeconds,
    })),
    ...(loudness ? {loudness} : {}),
  };
};
