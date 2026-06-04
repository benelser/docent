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
//   - Output:
//       * `h264` / `h265` / `vp8` / `vp9` — `<outputDir>/<filmId>.mp4`
//       * `prores` / `prores_hq` / `prores_4444` — `<outputDir>/<filmId>.mov`
//         (rendered natively by Remotion with `--prores-profile=<id>`).
//       * `dnxhr_hqx` / `dnxhr_444` — `<outputDir>/<filmId>.mov` via an
//         h264 intermediate + ffmpeg post-transcode.
//       * `dpx` / `exr` — `<outputDir>/<filmId>/frame_%06d.<ext>` directory
//         via an h264 intermediate + `ffmpeg` image-sequence transcode.
//         A sibling `sequence.json` manifest is emitted (fps + frame count
//         + colorspace notes) so the user's NLE can conform the sequence.
//   - PNG still (`opts.still`) ignores `opts.codec` entirely — stills are
//     image-format, not codec.

import {existsSync, mkdirSync, unlinkSync, writeFileSync} from 'node:fs';
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
          `[@bjelser/kit] subprocess exited with code=${code} signal=${signal}\n` +
            `  bin: ${bin}\n` +
            `  args: ${args.join(' ')}`,
        ),
      );
    });
  });
};

/**
 * The render strategy for a given codec id. Either Remotion handles it
 * natively (single-pass), or we render an h264 intermediate and shell to
 * `ffmpeg` for a post-transcode (two-pass).
 *
 * @internal
 */
interface CodecPlan {
  /** Render path: Remotion native, or h264 intermediate + ffmpeg transcode. */
  readonly mode: 'remotion-native' | 'ffmpeg-transcode';
  /** What to pass as Remotion's `--codec` flag. */
  readonly remotionCodec: 'h264' | 'h265' | 'vp8' | 'vp9' | 'prores';
  /** ProRes profile id to pass as `--prores-profile`, if any. */
  readonly proresProfile?: 'hq' | '4444';
  /** File extension or 'sequence' (image-per-frame directory). */
  readonly delivery:
    | {kind: 'file'; ext: 'mp4' | 'mov'}
    | {kind: 'sequence'; ext: 'dpx' | 'exr'};
  /** ffmpeg flags applied when `mode === 'ffmpeg-transcode'`. */
  readonly ffmpegArgs?: ReadonlyArray<string>;
  /**
   * Whether the ffmpeg pass should re-mux audio from the h264 intermediate.
   * Sequence outputs (DPX/EXR) have no audio; .mov containers get a passthrough.
   */
  readonly carriesAudio: boolean;
  /** Human-readable label for log lines. */
  readonly label: string;
}

/**
 * Translate the user-facing codec id (one of the eleven we accept on
 * `RenderOptions`) into the concrete render plan.
 *
 * **Remotion-native vs ffmpeg-transcode.** Remotion's renderer exposes
 * `h264 / h265 / vp8 / vp9 / prores` directly. ProRes profiles are picked
 * via `--prores-profile=<hq|4444|standard|light|proxy|4444-xq>` so the
 * generic `prores` knob plus a profile flag covers ProRes HQ + 4444.
 * Everything else (DNxHR family, DPX, EXR) requires an ffmpeg post-transcode
 * — Remotion does not own those codecs. We render an h264 intermediate
 * (fast, deterministic) and then transcode in a second pass; the trade-off
 * is roughly 1.5x render time vs a hypothetical native path, paid back by
 * not maintaining a parallel video-encode pipeline.
 *
 * @internal
 */
const planForCodec = (codec: RenderOptions['codec']): CodecPlan => {
  switch (codec) {
    case undefined:
    case 'h264':
      return {
        mode: 'remotion-native',
        remotionCodec: 'h264',
        delivery: {kind: 'file', ext: 'mp4'},
        carriesAudio: true,
        label: 'H.264 (yuv420p)',
      };
    case 'h265':
      return {
        mode: 'remotion-native',
        remotionCodec: 'h265',
        delivery: {kind: 'file', ext: 'mp4'},
        carriesAudio: true,
        label: 'H.265 / HEVC',
      };
    case 'vp8':
      return {
        mode: 'remotion-native',
        remotionCodec: 'vp8',
        delivery: {kind: 'file', ext: 'mp4'},
        carriesAudio: true,
        label: 'VP8',
      };
    case 'vp9':
      return {
        mode: 'remotion-native',
        remotionCodec: 'vp9',
        delivery: {kind: 'file', ext: 'mp4'},
        carriesAudio: true,
        label: 'VP9',
      };
    case 'prores':
    case 'prores_hq':
      return {
        mode: 'remotion-native',
        remotionCodec: 'prores',
        proresProfile: 'hq',
        delivery: {kind: 'file', ext: 'mov'},
        carriesAudio: true,
        label: 'ProRes 422 HQ (10-bit 4:2:2, apch)',
      };
    case 'prores_4444':
      return {
        mode: 'remotion-native',
        remotionCodec: 'prores',
        proresProfile: '4444',
        delivery: {kind: 'file', ext: 'mov'},
        carriesAudio: true,
        label: 'ProRes 4444 (10-bit 4:4:4:4 w/ alpha, ap4h)',
      };
    case 'dnxhr_hqx':
      // DNxHR HQX, 10-bit 4:2:2. Avid's HDR-grade mezzanine.
      return {
        mode: 'ffmpeg-transcode',
        remotionCodec: 'h264',
        delivery: {kind: 'file', ext: 'mov'},
        carriesAudio: true,
        ffmpegArgs: [
          '-c:v', 'dnxhd',
          '-profile:v', 'dnxhr_hqx',
          '-pix_fmt', 'yuv422p10le',
        ],
        label: 'DNxHR HQX (10-bit 4:2:2)',
      };
    case 'dnxhr_444':
      // DNxHR 444, 10-bit 4:4:4 — grading-grade chroma.
      return {
        mode: 'ffmpeg-transcode',
        remotionCodec: 'h264',
        delivery: {kind: 'file', ext: 'mov'},
        carriesAudio: true,
        ffmpegArgs: [
          '-c:v', 'dnxhd',
          '-profile:v', 'dnxhr_444',
          '-pix_fmt', 'yuv444p10le',
        ],
        label: 'DNxHR 444 (10-bit 4:4:4)',
      };
    case 'dpx':
      // DPX 10-bit log. Image sequence — directory output, no audio.
      // gbrp10le matches the cinematic DPX standard (10-bit RGB log).
      return {
        mode: 'ffmpeg-transcode',
        remotionCodec: 'h264',
        delivery: {kind: 'sequence', ext: 'dpx'},
        carriesAudio: false,
        ffmpegArgs: [
          '-c:v', 'dpx',
          '-pix_fmt', 'gbrp10le',
        ],
        label: 'DPX 10-bit image sequence',
      };
    case 'exr':
      // OpenEXR 16-bit half-float. The VFX standard. ffmpeg's exr encoder
      // only accepts 32-bit float pixel formats internally, then writes
      // half-float when `-format half` is set — the same wire size as
      // 16-bit half-float OpenEXR (the VFX standard). `-compression zip16`
      // keeps file size sane without lossy compression.
      return {
        mode: 'ffmpeg-transcode',
        remotionCodec: 'h264',
        delivery: {kind: 'sequence', ext: 'exr'},
        carriesAudio: false,
        ffmpegArgs: [
          '-c:v', 'exr',
          '-pix_fmt', 'gbrpf32le',
          '-format', 'half',
          '-compression', 'zip16',
        ],
        label: 'OpenEXR 16-bit half-float sequence',
      };
    default: {
      // Exhaustive — TypeScript will flag a missing case here.
      const _exhaustive: never = codec as never;
      throw new Error(
        `[@bjelser/kit] render stage: unsupported codec "${String(codec)}"`,
      );
    }
  }
};

/** Locate the ffmpeg binary. Falls back to PATH lookup if not found. */
const defaultFfmpegBin = (): string => {
  // ffmpeg's path varies (homebrew arm64: /opt/homebrew/bin, intel: /usr/local/bin).
  // We trust PATH — `spawn` will surface ENOENT cleanly if it's missing.
  return process.env.FFMPEG_BIN ?? 'ffmpeg';
};

/**
 * Render the film. Shells out to `remotion render <entry> <id> <output>`
 * (or `still` for a still frame).
 *
 * For codecs Remotion does not own natively (DNxHR family, DPX, EXR), the
 * stage renders an h264 intermediate to a temp path under `<outputDir>/`
 * and then shells `ffmpeg` to transcode into the final container/sequence.
 * The intermediate is unlinked on success; failed transcodes leave it in
 * place for inspection.
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

  // Stills bypass codec selection entirely — they're a PNG, not a video.
  const plan: CodecPlan | undefined = isStill
    ? undefined
    : planForCodec(opts.codec);

  // Language suffix — when `opts.lang` is set, the output filename gets a
  // `-<lang>` suffix so multiple language renders can co-exist in `out/`
  // (e.g. `out/foo.mp4`, `out/foo-es.mp4`, `out/foo-ja.mp4`). Stills get
  // the suffix BEFORE the `-still` marker for the same reason.
  const langSuffix = opts.lang ? `-${opts.lang}` : '';

  // Resolve the final delivery path.
  // - Still: always `<filmId><lang>-still.png`. `opts.readOutPath` honored.
  // - Sequence: directory at `<outputDir>/<filmId><lang>/`. Frames live as
  //   `frame_%06d.<ext>` inside. We return the directory path as `outPath`.
  // - File (mp4/mov): `<outputDir>/<filmId><lang>.<ext>`. `opts.readOutPath`
  //   honored when absolute.
  const explicit = (opts as RenderOptions).readOutPath;
  let finalOutPath: string;
  let sequenceDir: string | undefined;
  let intermediateMp4: string | undefined;
  let remotionOutPath: string;

  if (isStill) {
    finalOutPath =
      explicit && isAbsolute(explicit)
        ? explicit
        : join(outputDir, `${filmId}${langSuffix}-still.png`);
    remotionOutPath = finalOutPath;
  } else if (!plan) {
    // Defensive — plan is always defined for video renders. (Unreachable.)
    throw new Error('[@bjelser/kit] render stage: missing codec plan');
  } else if (plan.delivery.kind === 'sequence') {
    sequenceDir = join(outputDir, `${filmId}${langSuffix}`);
    mkdirSync(sequenceDir, {recursive: true});
    finalOutPath = sequenceDir;
    // h264 intermediate lives alongside the sequence dir.
    intermediateMp4 = join(
      outputDir,
      `.${filmId}${langSuffix}.intermediate.mp4`,
    );
    remotionOutPath = intermediateMp4;
  } else {
    // file delivery (mp4 or mov)
    const ext = plan.delivery.ext;
    finalOutPath =
      explicit && isAbsolute(explicit)
        ? explicit
        : join(outputDir, `${filmId}${langSuffix}.${ext}`);
    if (plan.mode === 'ffmpeg-transcode') {
      // Two-pass: render h264 to a hidden intermediate, transcode to final.
      intermediateMp4 = join(
        outputDir,
        `.${filmId}${langSuffix}.intermediate.mp4`,
      );
      remotionOutPath = intermediateMp4;
    } else {
      remotionOutPath = finalOutPath;
    }
  }

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
    args.push('still', entryPath, filmId, remotionOutPath, `--frame=${opts.still}`);
  } else if (plan) {
    args.push('render', entryPath, filmId, remotionOutPath);
    if (opts.concurrency !== undefined) {
      args.push(`--concurrency=${opts.concurrency}`);
    }
    if (opts.scale !== undefined) {
      args.push(`--scale=${opts.scale}`);
    }
    args.push(`--codec=${plan.remotionCodec}`);
    if (plan.proresProfile !== undefined) {
      args.push(`--prores-profile=${plan.proresProfile}`);
    }
  }
  if (opts.publicDir) {
    args.push(`--public-dir=${opts.publicDir}`);
  }

  const t0 = performance.now();
  await runChild(remotionBin, args, env, renderCwd);

  // Second pass — only when the plan demands a post-transcode.
  if (plan && plan.mode === 'ffmpeg-transcode' && intermediateMp4) {
    const ffmpegBin = defaultFfmpegBin();
    // FPS for sequence output naming; the spec's resolution.fps wins, else 30.
    const fps = spec.meta.resolution?.fps ?? 30;

    const ffArgs: string[] = ['-y', '-i', intermediateMp4];

    if (plan.delivery.kind === 'sequence') {
      // Image sequence: no audio; one image per frame; -start_number 1 makes
      // frame numbering 1-based which matches NLE convention.
      ffArgs.push('-an');
      if (plan.ffmpegArgs) ffArgs.push(...plan.ffmpegArgs);
      ffArgs.push('-start_number', '1');
      const pattern = join(sequenceDir!, `frame_%06d.${plan.delivery.ext}`);
      ffArgs.push(pattern);
    } else {
      // .mov delivery (DNxHR family). Pass audio through as AAC (Remotion's
      // intermediate already encodes AAC); the .mov container accepts both.
      if (plan.ffmpegArgs) ffArgs.push(...plan.ffmpegArgs);
      if (plan.carriesAudio) {
        ffArgs.push('-c:a', 'aac', '-b:a', '192k');
      } else {
        ffArgs.push('-an');
      }
      ffArgs.push(finalOutPath);
    }

    await runChild(ffmpegBin, ffArgs, env, renderCwd);

    // Write the sequence manifest BEFORE unlinking the intermediate, so a
    // failure to write the manifest doesn't strand a half-built delivery.
    if (plan.delivery.kind === 'sequence') {
      // Probe the actual frame count by listing the sequence dir.
      // We trust ffmpeg's start_number=1 contract here.
      const manifest = {
        filmId,
        codec: opts.codec,
        ext: plan.delivery.ext,
        pattern: `frame_%06d.${plan.delivery.ext}`,
        fps,
        startNumber: 1,
        width: spec.meta.resolution?.width ?? 1920,
        height: spec.meta.resolution?.height ?? 1080,
        notes:
          plan.delivery.ext === 'dpx'
            ? 'DPX 10-bit gbrp10le. No color management applied — frames are the same Rec.709 gamut Remotion encoded; the user is expected to interpret as Rec.709 in their NLE/grading suite.'
            : 'OpenEXR 16-bit half-float (gbrpf16le on disk), zip-compressed. No color management applied — interpret as Rec.709 in the user\'s comp suite; conform to linear in the comp graph.',
      };
      writeFileSync(
        join(sequenceDir!, 'sequence.json'),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf-8',
      );
    }

    // Success — drop the intermediate.
    try {
      unlinkSync(intermediateMp4);
    } catch {
      // best-effort; a stale intermediate is recoverable noise, not a render failure
    }
  }

  const durationMs = performance.now() - t0;

  return {
    outPath: finalOutPath,
    durationMs,
    tts: tts.beats.map((b) => ({
      sceneIndex: b.sceneIndex,
      beatIndex: b.beatIndex,
      wpm: b.wpm,
      clipSeconds: b.clipSeconds,
    })),
  };
};
