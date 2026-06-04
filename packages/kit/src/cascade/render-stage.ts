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

import {existsSync, mkdirSync, renameSync, unlinkSync} from 'node:fs';
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

// ---------------------------------------------------------------------------
// R10.4 — color space tagging.
//
// After Remotion writes the MP4, we shell out to ffmpeg one more time to
// stamp the container with explicit color metadata. Two regimes:
//
//   - SDR (srgb / rec709 / rec2020 SDR / p3): `-c copy` — pure metadata
//     remux, no re-encode. Fast (sub-second). The pixels are untouched;
//     only the color_primaries / color_trc / colorspace headers change.
//
//   - HDR10 (rec2020 + hdr:true): the HDR10 spec requires PQ transfer
//     (smpte2084) inside an HEVC stream with HDR10 SEI metadata. That
//     means a real re-encode with libx265. The mastering-display block
//     uses the standard Rec.2020 primaries + a conservative 0.005 nits
//     min / 1000 nits max (P3 grade) — we don't analyze the actual
//     pixel luminance.
//
// Honest gap: the renderer still draws sRGB-gamut content. We tag the
// container as Rec.2020 / Rec.2020-PQ. A colorist will re-conform on
// ingest; a streaming platform will accept the tag and skip its own
// auto-primaries guess. The pixels do not magically become wide gamut.
// ---------------------------------------------------------------------------

/**
 * The ffmpeg color tag triplet for each color space. The keys are the
 * ffmpeg flag values (NOT mediainfo names) — `-color_primaries`,
 * `-color_trc`, `-colorspace`.
 */
const SDR_COLOR_TAGS: Record<
  'srgb' | 'rec709' | 'rec2020' | 'p3',
  {primaries: string; trc: string; matrix: string}
> = {
  srgb: {
    // sRGB and Rec.709 share primaries; the *transfer* function differs.
    // sRGB transfer is the iec61966-2-1 piecewise gamma (~2.2-ish), not
    // pure bt709. Tools that respect the tag will apply the right gamma.
    primaries: 'bt709',
    trc: 'iec61966-2-1',
    matrix: 'bt709',
  },
  rec709: {
    primaries: 'bt709',
    trc: 'bt709',
    matrix: 'bt709',
  },
  rec2020: {
    // SDR Rec.2020 — the wide-gamut container with the 10-bit transfer.
    // (HDR path overrides this in `runColorTagPass`.)
    primaries: 'bt2020',
    trc: 'bt2020-10',
    matrix: 'bt2020nc',
  },
  p3: {
    // DCI-P3 — smpte432 primaries (the display-P3 / DCI-P3 D65 chromaticities),
    // sRGB transfer. The matrix tag bt2020nc is what Apple writes for HDR-P3
    // content; for SDR DCI-P3 the safe default is bt709 since p3 has no
    // dedicated matrix coefficient.
    primaries: 'smpte432',
    trc: 'iec61966-2-1',
    matrix: 'bt709',
  },
};

/** Find the ffmpeg bin. Defaults to the PATH lookup. */
const defaultFfmpegBin = (): string => 'ffmpeg';

/**
 * Run ffmpeg with arbitrary args. Captures stderr quietly — color tagging
 * is verbose noise we surface only on failure.
 */
const runFfmpeg = (
  bin: string,
  args: ReadonlyArray<string>,
): Promise<void> => {
  return new Promise((res, rej) => {
    const child = spawn(bin, args.slice(), {stdio: ['ignore', 'ignore', 'pipe']});
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err: Error) => rej(err));
    child.on('exit', (code: number | null) => {
      if (code === 0) return res();
      rej(
        new Error(
          `[@bjelser/kit] ffmpeg exited code=${code}\n` +
            `  args: ${args.join(' ')}\n` +
            (stderr ? `  stderr (tail): ${stderr.slice(-800)}` : ''),
        ),
      );
    });
  });
};

/**
 * Stamp color metadata onto the rendered MP4 in-place. For SDR this is a
 * pure remux (`-c copy`); for HDR10 it's a real re-encode with libx265.
 *
 * Returns true if the file was retagged, false if no tagging was needed
 * (e.g. the caller didn't set a colorSpace, or rendered a still).
 */
const runColorTagPass = async (
  inPath: string,
  colorSpace: 'srgb' | 'rec709' | 'rec2020' | 'p3' | undefined,
  hdr: boolean,
  ffmpegBin: string,
): Promise<{tagged: boolean; space: string; hdr: boolean}> => {
  if (!colorSpace) return {tagged: false, space: 'srgb', hdr: false};
  if (!existsSync(inPath)) return {tagged: false, space: colorSpace, hdr};

  const tmpPath = inPath.replace(/\.mp4$/i, '.colortag.mp4');
  const tags = SDR_COLOR_TAGS[colorSpace];

  const wantsHdr10 = hdr && colorSpace === 'rec2020';

  if (wantsHdr10) {
    // HDR10: re-encode to HEVC with PQ transfer + mastering metadata.
    // The mastering-display block uses Rec.2020 primaries (G/B/R x,y in
    // 0.00002 increments per x265) and a 1000-nit / 0.005-nit luminance
    // window — the conservative P3-1000 grade most streaming HDR ladders
    // target. max-cll is "max content light level" + "max frame-average
    // light level"; without analyzing the file, 1000,400 is the safe
    // P3-1000 default.
    const masterDisplay =
      'G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,5)';
    const maxCll = '1000,400';

    const args = [
      '-y',
      '-i',
      inPath,
      '-c:v',
      'libx265',
      '-preset',
      'medium',
      '-x265-params',
      [
        'colorprim=bt2020',
        'transfer=smpte2084',
        'colormatrix=bt2020nc',
        'range=limited',
        `master-display=${masterDisplay}`,
        `max-cll=${maxCll}`,
        'hdr10=1',
        'hdr10-opt=1',
        'repeat-headers=1',
      ].join(':'),
      '-c:a',
      'copy',
      '-color_primaries',
      'bt2020',
      '-color_trc',
      'smpte2084',
      '-colorspace',
      'bt2020nc',
      '-color_range',
      'tv',
      '-pix_fmt',
      'yuv420p10le',
      '-movflags',
      '+faststart',
      tmpPath,
    ];

    await runFfmpeg(ffmpegBin, args);
  } else {
    // SDR path — pure metadata stamp. `-c copy` skips re-encode entirely.
    const args = [
      '-y',
      '-i',
      inPath,
      '-c',
      'copy',
      '-color_primaries',
      tags.primaries,
      '-color_trc',
      tags.trc,
      '-colorspace',
      tags.matrix,
      '-movflags',
      '+faststart',
      tmpPath,
    ];
    await runFfmpeg(ffmpegBin, args);
  }

  // Atomic replace: only swap once the tagged file is fully written.
  try {
    unlinkSync(inPath);
  } catch {
    // ignore — the rename will surface the real failure.
  }
  renameSync(tmpPath, inPath);

  return {tagged: true, space: colorSpace, hdr: wantsHdr10};
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

  // ─── R10.4 — color space tagging ───────────────────────────────────────
  // Tag the rendered mp4 in place first (default no-op if no meta.colorSpace).
  // ffmpeg `-c copy` is metadata-only for SDR paths, so it's near-free; the
  // LUFS pass below uses `-c:v copy` and therefore inherits these tags.
  // Stills (PNG) skip — they carry their own sRGB cICP/sRGB chunk.
  if (!isStill) {
    const colorSpace = spec.meta?.colorSpace;
    const hdr = spec.meta?.hdr === true;
    try {
      const result = await runColorTagPass(
        outPath,
        colorSpace,
        hdr,
        defaultFfmpegBin(),
      );
      if (result.tagged) {
        // eslint-disable-next-line no-console
        console.log(
          `[@bjelser/kit] colorspace tagged: ${result.space} (HDR=${result.hdr})`,
        );
      }
    } catch (err) {
      // Tagging failure should NOT lose the rendered film. Surface a
      // warning and keep the un-tagged file at outPath.
      // eslint-disable-next-line no-console
      console.warn(
        `[@bjelser/kit] colorspace tag pass failed; mp4 left un-tagged at ${outPath}\n` +
          `  underlying: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── R10.2 — loudness normalization (LUFS) ─────────────────────────────
  // When `opts.lufs` is set AND the render produced an mp4 (stills skip),
  // run the two-pass ffmpeg `loudnorm` against the (now color-tagged) file.
  // The normalized file lands at a sibling path with a `-lufs-<target>`
  // suffix; the un-normalized original survives at `outPath`. Video stream
  // is `-c:v copy`, so any R10.4 color tags propagate untouched.
  //
  // Stills can't carry audio → short-circuit. Errors here surface as a
  // render failure: the user asked for a normalized output, the render
  // does not "half-succeed".
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
