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
//     does not own. `@docent/cli` generates this entry per render via
//     `src/render-entry.ts`.
//   - Output: mp4 (or png still) at `<outputDir>/<filmId>.{mp4|png}`.

import {existsSync, mkdirSync} from 'node:fs';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {spawn} from 'node:child_process';

import type {Engine} from '../engine';
import type {FilmSpec, RenderOptions, RenderResult} from '../protocols';
import type {ResolvedStyle} from '../types/style';
import type {TtsStageManifest} from './tts-stage';

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
          `[@docent/kit] remotion render exited with code=${code} signal=${signal}\n` +
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
      '[@docent/kit] render stage: opts.entryPath is required. The kit does ' +
        'not choose which plugins to load — the invoker (typically @docent/cli) ' +
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
  const outPath =
    explicit && isAbsolute(explicit)
      ? explicit
      : join(outputDir, `${filmId}${isStill ? '-still' : ''}.${ext}`);

  const remotionBin = opts.remotionBin ?? defaultRemotionBin(cwd);
  const entryPath = resolve(opts.entryPath);

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
  await runChild(remotionBin, args, env, cwd);
  const durationMs = performance.now() - t0;

  return {
    outPath,
    durationMs,
    tts: tts.beats.map((b) => ({
      sceneIndex: b.sceneIndex,
      beatIndex: b.beatIndex,
      wpm: b.wpm,
      clipSeconds: b.clipSeconds,
    })),
  };
};
