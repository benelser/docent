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

import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
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
          `[@bjelser/kit] subprocess exited with code=${code} signal=${signal}\n` +
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

/** Locate the ffmpeg binary. Honors FFMPEG_BIN env, else falls back to PATH. */
const defaultFfmpegBin = (): string => {
  // ffmpeg's path varies (homebrew arm64: /opt/homebrew/bin, intel: /usr/local/bin).
  // We trust PATH — `spawn` will surface ENOENT cleanly if it's missing.
  return process.env.FFMPEG_BIN ?? 'ffmpeg';
};

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
 * Verify a rendered MP4 is structurally sound. Runs `ffprobe` against the
 * file and inspects stderr for the canonical corruption signatures we've
 * observed escaping from Remotion's stitch step:
 *
 *   - "Found duplicated MOOV Atom" — the faststart pass left two moovs
 *     in the file, almost certain to ship a corrupt stream.
 *   - "Invalid NAL unit size" — the H.264 stream offsets don't match the
 *     moov atom's expectations; frames are unreadable.
 *
 * Returns `{ok: false, reason}` when either signature appears, `{ok: true}`
 * otherwise. A missing file or zero bytes is also a fail.
 */
const verifyRenderOutput = async (
  outPath: string,
  ffmpegBin: string,
): Promise<{ok: true} | {ok: false; reason: string}> => {
  // The binary path arrives as ffmpeg by convention; ffprobe sits next
  // to it (same package) in every standard packaging.
  const ffprobeBin = ffmpegBin.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');

  if (!existsSync(outPath)) {
    return {ok: false, reason: `file does not exist at ${outPath}`};
  }
  const stats = await new Promise<{size: number} | null>((res) => {
    try {
      const child = spawn('wc', ['-c', outPath], {stdio: ['ignore', 'pipe', 'ignore']});
      let out = '';
      child.stdout?.on('data', (c: Buffer) => {
        out += c.toString();
      });
      child.on('exit', () => {
        const n = parseInt(out.trim().split(/\s+/)[0] ?? '0', 10);
        res({size: isFinite(n) ? n : 0});
      });
      child.on('error', () => res(null));
    } catch {
      res(null);
    }
  });
  if (stats && stats.size < 1024) {
    return {ok: false, reason: `file is suspiciously small (${stats.size} bytes)`};
  }

  // Capture ffprobe stderr — that's where corruption signatures land.
  // `-show_format` is enough to exercise the demuxer + first-frame
  // decode path without dumping the whole stream.
  const stderr = await new Promise<string>((res) => {
    const child = spawn(
      ffprobeBin,
      ['-v', 'error', '-show_format', '-show_streams', outPath],
      {stdio: ['ignore', 'ignore', 'pipe']},
    );
    let buf = '';
    child.stderr?.on('data', (c: Buffer) => {
      buf += c.toString();
    });
    child.on('exit', () => res(buf));
    child.on('error', () => res(''));
  });

  if (/duplicated MOOV/i.test(stderr)) {
    return {ok: false, reason: 'duplicated MOOV atom (faststart race)'};
  }
  if (/Invalid NAL unit/i.test(stderr)) {
    return {ok: false, reason: 'invalid NAL units (H.264 stream corrupt)'};
  }
  if (/Error splitting the input/i.test(stderr)) {
    return {ok: false, reason: 'ffprobe cannot split stream into NAL units'};
  }
  return {ok: true};
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

  // Image-sequence deliveries (dpx, exr) bypass ffmpeg-on-single-file
  // post-processing — colorspace metadata lives in `sequence.json.notes`
  // and audio doesn't exist for a frame sequence, so LUFS is undefined.
  const isSequence = plan?.delivery.kind === 'sequence';

  // ─── Post-render integrity verify ────────────────────────────────────
  // Remotion's ffmpeg stitch step has an intermittent race during the
  // `-movflags +faststart` second pass: the moov atom gets relocated to
  // the file head but the stream-data offsets occasionally don't get
  // updated cleanly, producing a duplicated-MOOV file with scrambled
  // NAL units. The render claims success and the user gets a silent-
  // broken MP4 that fails the moment they try to play it.
  //
  // Catch it here so the cascade fails loudly with an actionable error
  // ("re-run docent build") instead of shipping a corrupt artifact.
  // Skip stills (PNG has no MOOV) and sequences (no single file).
  if (!isStill && !isSequence) {
    const verifyResult = await verifyRenderOutput(finalOutPath, defaultFfmpegBin());
    if (!verifyResult.ok) {
      throw new Error(
        `[@bjelser/kit] post-render verify failed: ${verifyResult.reason}\n` +
          `  The rendered file at ${finalOutPath} is corrupted.\n` +
          `  Most likely cause: Remotion's ffmpeg faststart race during the\n` +
          `  second-pass moov atom shuffle. Re-running \`docent build\`\n` +
          `  typically produces a clean file on the next attempt.`,
      );
    }
  }

  // ─── R10.4 — color space tagging ───────────────────────────────────────
  // Tag the final delivered file in place first (default no-op when
  // meta.colorSpace is unset). ffmpeg `-c copy` is metadata-only for SDR
  // paths, so it's near-free; the LUFS pass below uses `-c:v copy` and
  // therefore inherits these tags. Skip for stills (PNG carries its own
  // sRGB cICP/sRGB chunk) and for sequence deliveries.
  if (!isStill && !isSequence) {
    const colorSpace = spec.meta?.colorSpace;
    const hdr = spec.meta?.hdr === true;
    try {
      const result = await runColorTagPass(
        finalOutPath,
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
      // warning and keep the un-tagged file at finalOutPath.
      // eslint-disable-next-line no-console
      console.warn(
        `[@bjelser/kit] colorspace tag pass failed; file left un-tagged at ${finalOutPath}\n` +
          `  underlying: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── R10.2 — loudness normalization (LUFS) ─────────────────────────────
  // When `opts.lufs` is set AND the render produced a single video file
  // (stills + sequences skip), run the two-pass ffmpeg `loudnorm` against
  // the (now color-tagged) file. The normalized file lands at a sibling
  // path with a `-lufs-<target>` suffix; the un-normalized original
  // survives at `finalOutPath`. Video stream is `-c:v copy`, so any R10.4
  // color tags propagate untouched.
  //
  // Errors here surface as a render failure — the user asked for a
  // normalized output, the render does not "half-succeed".
  let loudness: RenderResult['loudness'] | undefined;
  if (!isStill && !isSequence && typeof opts.lufs === 'number') {
    const normalizedPath = buildNormalizedOutPath(finalOutPath, opts.lufs);
    process.stdout.write(
      `  loudness: normalizing → ${opts.lufs} LUFS (target)\n`,
    );
    const {measurement, outputMeasurement} = await normalizeLoudness(
      finalOutPath,
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
    outPath: finalOutPath,
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
