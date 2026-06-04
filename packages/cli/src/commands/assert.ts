// `docent assert <film-id>` — visual regression against golden frames.
//
// THE INVARIANT (named verbatim):
//
//   "A film that built last time must still look like itself today."
//
// More precisely: per scene, one key frame at the scene midpoint must
// match a committed golden image within `--threshold` mean absolute
// pixel difference (default 5%). The killer case is the Cassini dogfood
// cycle — a "rings overlap saturn" rendering bug shipped silently
// because no automated step compared today's frames to yesterday's.
//
// Method:
//   1. Read out/<id>.mp4 (must exist — error otherwise; suggest `docent build`).
//   2. Read out/.render-check-<id>/check.json if present for canonical
//      scene midpoints (the same t50s the render-check command samples);
//      otherwise validate the spec, build a fresh frame schedule, and
//      compute midpoints ourselves.
//   3. Extract one JPG per scene at the midpoint into golden/<id>/.
//   4. Two modes:
//        a. CAPTURE (--update, or first run when no goldens exist):
//           write the extracted frames as the new goldens. Done.
//        b. ASSERT (default): for each scene, decode the candidate
//           frame + the golden as raw rgb24 bytes via ffmpeg (no sharp,
//           no canvas), compute mean absolute pixel difference
//           normalized to [0, 1], print a per-scene table. Fail with
//           exit 2 if any scene exceeds the threshold.
//
// Exit codes: 0 pass (or capture succeeded), 1 missing inputs,
// 2 visual regression detected (one or more scenes over threshold),
// 4 ffmpeg failure.

import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';

import {createEngine} from '../engine-factory';
import {
  buildFrameSchedule,
  type FilmSpec,
  type SceneAssertMaskRegion,
  type TtsAudioMap,
} from '@bjelser/kit';

const log = (s: string) => process.stdout.write(`${s}\n`);
const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;

export interface AssertArgs {
  readonly filmId: string;
  readonly filmsDir?: string;
  readonly outputDir?: string;
  readonly projectRoot?: string;
  readonly goldenDir?: string;
  /** Mean absolute pixel difference threshold in [0, 1]. Default 0.05 (5%). */
  readonly threshold?: number;
  /** Capture mode — overwrite goldens from current mp4 instead of asserting. */
  readonly update?: boolean;
  /** Comparison width — both candidate + golden are decoded at this width. Default 480. */
  readonly compareWidth?: number;
}

interface SceneSample {
  readonly sceneIndex: number;
  readonly type: string;
  readonly heading?: string;
  readonly t50s: number;
  /** Per-scene threshold override pulled from spec.scenes[i].assert.threshold. */
  readonly threshold?: number;
  /** Per-scene mask regions pulled from spec.scenes[i].assert.maskRegions. */
  readonly maskRegions?: ReadonlyArray<SceneAssertMaskRegion>;
}

interface CheckJsonSample {
  readonly sceneIndex: number;
  readonly type: string;
  readonly heading?: string;
  readonly t50s: number;
}

interface CheckJson {
  readonly samples: ReadonlyArray<CheckJsonSample>;
  readonly mp4DurationSeconds?: number;
  readonly durationSeconds?: number;
}

const ffprobeDuration = (mp4: string): number => {
  const r = spawnSync(
    'ffprobe',
    [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1',
      mp4,
    ],
    {encoding: 'utf8'},
  );
  return Number(r.stdout.trim()) || 0;
};

/**
 * Extract one JPG frame from the mp4 at seconds `t`, scaled to `width`px wide.
 * Mirrors scripts/extract-stills.py — `-ss` after `-i` for accurate seek,
 * lanczos scale for crisp text.
 */
const extractJpg = (mp4: string, t: number, outJpg: string, width: number): void => {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel', 'error',
      '-i', mp4,
      '-ss', t.toFixed(3),
      '-vframes', '1',
      '-vf', `scale=${width}:-1:flags=lanczos`,
      '-q:v', '2',
      outJpg,
    ],
    {stdio: 'ignore'},
  );
};

/**
 * Decode a JPG to a raw rgb24 byte buffer at a fixed width. Reading the
 * raw stream lets us compute MAE without sharp/canvas — ffmpeg is the
 * only image dependency. Height is whatever the source produces (we
 * ratio-scale on width so a golden and a candidate land at identical
 * dimensions).
 */
const decodeRgb = (jpg: string, width: number): {bytes: Buffer; width: number; height: number} => {
  // Step 1: scale to fixed width, mpeg2 yuv420p reference, output rgb24.
  const r = spawnSync(
    'ffmpeg',
    [
      '-loglevel', 'error',
      '-i', jpg,
      '-vf', `scale=${width}:-1:flags=lanczos`,
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      '-',
    ],
    {encoding: 'buffer', maxBuffer: 1024 * 1024 * 64},
  );
  if (r.status !== 0) {
    throw new Error(`ffmpeg decode failed for ${jpg}: ${r.stderr?.toString() ?? ''}`);
  }
  const bytes = r.stdout;
  // We know width, infer height: bytes.length / 3 / width.
  const px = bytes.length / 3;
  const height = Math.round(px / width);
  if (height * width * 3 !== bytes.length) {
    throw new Error(
      `unexpected raw size for ${jpg}: ${bytes.length} bytes, width=${width}`,
    );
  }
  return {bytes, width, height};
};

/**
 * Mean absolute pixel difference in [0, 1]. Frames must already be the
 * same dimensions. Each channel contributes equally; we average over
 * width × height × 3 channels. 0 = pixel-identical, 1 = inverse.
 */
const meanAbsDiff = (a: Buffer, b: Buffer): number => {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i]! - b[i]!;
    sum += d < 0 ? -d : d;
  }
  return sum / (n * 255);
};

/**
 * Zero out a rectangular region of a raw rgb24 buffer in place. Used to
 * cancel stochastic regions (starfields, particles) before MAE — applying
 * the same mask to both golden + candidate makes the masked pixels
 * pixel-identical and so they contribute 0 to the diff. Clamps the
 * region to image bounds so an off-by-one in the spec doesn't write past
 * the buffer.
 */
const applyMask = (
  bytes: Buffer,
  width: number,
  height: number,
  region: SceneAssertMaskRegion,
): void => {
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(width, Math.floor(region.x + region.w));
  const y1 = Math.min(height, Math.floor(region.y + region.h));
  if (x1 <= x0 || y1 <= y0) return;
  for (let y = y0; y < y1; y++) {
    const rowStart = (y * width + x0) * 3;
    const rowEnd = (y * width + x1) * 3;
    bytes.fill(0, rowStart, rowEnd);
  }
};

const loadCheckJson = (sampleDir: string): CheckJson | undefined => {
  const path = join(sampleDir, 'check.json');
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as CheckJson;
  } catch {
    return undefined;
  }
};

/**
 * Compute scene midpoints from the spec + a fresh frame schedule. Used
 * when no check.json sidecar is present (fallback path — slower because
 * we have to build the engine + schedule, but correct).
 */
const samplesFromSpec = async (
  specPath: string,
  projectRoot: string,
  filmId: string,
  mp4DurationSeconds: number,
): Promise<{samples: SceneSample[]; durationSeconds: number}> => {
  const spec: FilmSpec = JSON.parse(readFileSync(specPath, 'utf-8'));
  const {engine} = await createEngine(projectRoot);

  // Pull TTS manifest if present so beat lengths match what build saw.
  const manifestPath = join(projectRoot, 'public', 'audio', filmId, 'manifest.json');
  let ttsAudio: TtsAudioMap | undefined;
  if (existsSync(manifestPath)) {
    try {
      ttsAudio = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch {
      ttsAudio = undefined;
    }
  }

  const schedule = buildFrameSchedule(spec, engine, ttsAudio);
  const fps = schedule.fps;
  const scheduleDuration = schedule.totalFrames / fps;
  // Same clamp/scale trick render-check uses: schedule may run slightly
  // long vs the actual mp4 (TTS estimation skew + cross-fades).
  const scaleRatio =
    mp4DurationSeconds > 0 && scheduleDuration > 0
      ? mp4DurationSeconds / scheduleDuration
      : 1;
  const maxSampleS = Math.max(0, mp4DurationSeconds - 0.1);

  const samples: SceneSample[] = schedule.scenes.map((sc) => {
    const startS = sc.startFrame / fps;
    const endS = (sc.startFrame + sc.frames) / fps;
    const midS = startS + (endS - startS) * 0.5;
    const heading =
      (sc.scene as {heading?: string}).heading ??
      (sc.scene as {kicker?: string}).kicker;
    return {
      sceneIndex: sc.sceneIndex,
      type: sc.scene.type,
      ...(heading !== undefined ? {heading} : {}),
      t50s: Math.max(0, Math.min(maxSampleS, midS * scaleRatio)),
    };
  });
  return {samples, durationSeconds: scheduleDuration};
};

const sanitizeForFs = (s: string): string =>
  s.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40);

export const runAssert = async (args: AssertArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const outputDir = args.outputDir ?? join(projectRoot, 'out');
  const goldenRoot = args.goldenDir ?? join(projectRoot, 'golden');
  const filmGoldenDir = join(goldenRoot, args.filmId);
  const threshold = args.threshold ?? 0.05;
  const compareWidth = args.compareWidth ?? 480;
  const specPath = resolve(filmsDir, `${args.filmId}.json`);
  const mp4 = join(outputDir, `${args.filmId}.mp4`);

  log(cyan(`▶ docent assert ${args.filmId}`));
  log(dim(`  the invariant: today's frames must match committed goldens within ${(threshold * 100).toFixed(1)}% mean abs pixel diff`));

  if (!existsSync(mp4)) {
    log(red(`✗ out/${args.filmId}.mp4 not found at ${mp4}`));
    log(yellow(`  run \`docent build ${args.filmId}\` first`));
    return 1;
  }
  if (!existsSync(specPath)) {
    log(red(`✗ films/${args.filmId}.json not found at ${specPath}`));
    return 1;
  }

  const mp4DurationSeconds = ffprobeDuration(mp4);
  if (mp4DurationSeconds <= 0) {
    log(red(`✗ ffprobe could not read duration of ${mp4}`));
    return 4;
  }

  // Per-scene assert overrides (threshold / maskRegions) live on the spec,
  // not in the render-check sidecar. Load the spec once and key by scene
  // index so both code paths below can attach overrides to samples.
  const specJson: FilmSpec = JSON.parse(readFileSync(specPath, 'utf-8'));
  const perSceneAssert: ReadonlyArray<{
    readonly threshold?: number;
    readonly maskRegions?: ReadonlyArray<SceneAssertMaskRegion>;
  }> = specJson.scenes.map((sc) => {
    const a = (sc as {assert?: {threshold?: number; maskRegions?: SceneAssertMaskRegion[]}}).assert;
    if (!a) return {};
    return {
      ...(typeof a.threshold === 'number' ? {threshold: a.threshold} : {}),
      ...(Array.isArray(a.maskRegions) ? {maskRegions: a.maskRegions} : {}),
    };
  });

  // Source of truth for scene midpoints: render-check sidecar if it
  // exists (fast path — already canonical and dimension-scaled);
  // otherwise rebuild the schedule from the spec (slower fallback).
  const sampleDir = join(outputDir, `.render-check-${args.filmId}`);
  const check = loadCheckJson(sampleDir);
  let samples: SceneSample[];
  let source: string;
  if (check) {
    // Scale check.json t50s if mp4 duration drifted since the check ran.
    const checkDuration = check.mp4DurationSeconds ?? check.durationSeconds ?? mp4DurationSeconds;
    const scaleRatio = checkDuration > 0 ? mp4DurationSeconds / checkDuration : 1;
    const maxSampleS = Math.max(0, mp4DurationSeconds - 0.1);
    samples = check.samples.map((s) => {
      const override = perSceneAssert[s.sceneIndex] ?? {};
      const sample: SceneSample = {
        sceneIndex: s.sceneIndex,
        type: s.type,
        ...(s.heading !== undefined ? {heading: s.heading} : {}),
        t50s: Math.max(0, Math.min(maxSampleS, s.t50s * scaleRatio)),
        ...(override.threshold !== undefined ? {threshold: override.threshold} : {}),
        ...(override.maskRegions !== undefined ? {maskRegions: override.maskRegions} : {}),
      };
      return sample;
    });
    source = `check.json (${sampleDir})`;
  } else {
    const fresh = await samplesFromSpec(specPath, projectRoot, args.filmId, mp4DurationSeconds);
    samples = fresh.samples.map((s) => {
      const override = perSceneAssert[s.sceneIndex] ?? {};
      return {
        ...s,
        ...(override.threshold !== undefined ? {threshold: override.threshold} : {}),
        ...(override.maskRegions !== undefined ? {maskRegions: override.maskRegions} : {}),
      };
    });
    source = 'fresh schedule from spec';
  }

  log(dim(`  midpoints: ${samples.length} scenes from ${source}`));
  log(dim(`  mp4 duration: ${mp4DurationSeconds.toFixed(1)}s · compare width: ${compareWidth}px`));

  // CAPTURE mode: no goldens yet, or user passed --update.
  const goldensExist = existsSync(filmGoldenDir);
  const captureMode = args.update === true || !goldensExist;

  if (captureMode) {
    if (!existsSync(filmGoldenDir)) mkdirSync(filmGoldenDir, {recursive: true});
    log(cyan(`▶ capture mode${args.update ? ' (--update)' : ' (no goldens present)'}`));
    log(dim(`  writing ${samples.length} scene goldens → ${filmGoldenDir}/`));
    for (const s of samples) {
      const name = `scene-${String(s.sceneIndex).padStart(2, '0')}-${sanitizeForFs(s.type)}.jpg`;
      const out = join(filmGoldenDir, name);
      try {
        extractJpg(mp4, s.t50s, out, compareWidth);
      } catch (err) {
        log(red(`✗ ffmpeg failed extracting scene ${s.sceneIndex}: ${(err as Error).message}`));
        return 4;
      }
      log(
        `  ${green('+')} ${name.padEnd(36)} ${dim(`@ t=${s.t50s.toFixed(1)}s  ${s.heading?.slice(0, 50) ?? ''}`)}`,
      );
    }
    log('');
    log(green(`✓ captured ${samples.length} goldens for ${args.filmId}`));
    log(dim(`  commit golden/${args.filmId}/ alongside films/${args.filmId}.json`));
    log(dim(`  subsequent \`docent assert ${args.filmId}\` runs will diff against these`));
    return 0;
  }

  // ASSERT mode: compare today's extracted frame against the committed golden.
  log(cyan(`▶ assert mode  (threshold ${(threshold * 100).toFixed(1)}%)`));
  const tmpRoot = join(tmpdir(), `docent-assert-${args.filmId}-${process.pid}`);
  if (!existsSync(tmpRoot)) mkdirSync(tmpRoot, {recursive: true});

  interface DiffRow {
    readonly sceneIndex: number;
    readonly type: string;
    readonly heading?: string;
    readonly diff: number | undefined;
    readonly threshold: number;
    readonly maskCount: number;
    readonly status: 'pass' | 'fail' | 'missing-golden' | 'error';
    readonly note?: string;
  }
  const rows: DiffRow[] = [];

  for (const s of samples) {
    const name = `scene-${String(s.sceneIndex).padStart(2, '0')}-${sanitizeForFs(s.type)}.jpg`;
    const golden = join(filmGoldenDir, name);
    const candidate = join(tmpRoot, name);

    // Per-scene threshold override falls back to the CLI default.
    const sceneThreshold = s.threshold ?? threshold;
    const masks = s.maskRegions ?? [];

    if (!existsSync(golden)) {
      rows.push({
        sceneIndex: s.sceneIndex,
        type: s.type,
        ...(s.heading !== undefined ? {heading: s.heading} : {}),
        diff: undefined,
        threshold: sceneThreshold,
        maskCount: masks.length,
        status: 'missing-golden',
        note: `no golden at ${golden} — re-run with --update`,
      });
      continue;
    }

    try {
      extractJpg(mp4, s.t50s, candidate, compareWidth);
    } catch (err) {
      rows.push({
        sceneIndex: s.sceneIndex,
        type: s.type,
        ...(s.heading !== undefined ? {heading: s.heading} : {}),
        diff: undefined,
        threshold: sceneThreshold,
        maskCount: masks.length,
        status: 'error',
        note: `extract failed: ${(err as Error).message}`,
      });
      continue;
    }

    try {
      const g = decodeRgb(golden, compareWidth);
      const c = decodeRgb(candidate, compareWidth);
      if (g.bytes.length !== c.bytes.length) {
        rows.push({
          sceneIndex: s.sceneIndex,
          type: s.type,
          ...(s.heading !== undefined ? {heading: s.heading} : {}),
          diff: undefined,
          threshold: sceneThreshold,
          maskCount: masks.length,
          status: 'error',
          note: `dimension mismatch — golden ${g.width}×${g.height}, candidate ${c.width}×${c.height}`,
        });
        continue;
      }
      // Apply spec-declared mask regions identically to both images BEFORE
      // computing MAE — zeroes match zeroes, so the masked area contributes
      // exactly zero to the diff regardless of what the rendered pixels
      // looked like. The mutation is on local buffers; no side effects.
      for (const region of masks) {
        applyMask(g.bytes, g.width, g.height, region);
        applyMask(c.bytes, c.width, c.height, region);
      }
      const d = meanAbsDiff(g.bytes, c.bytes);
      rows.push({
        sceneIndex: s.sceneIndex,
        type: s.type,
        ...(s.heading !== undefined ? {heading: s.heading} : {}),
        diff: d,
        threshold: sceneThreshold,
        maskCount: masks.length,
        status: d <= sceneThreshold ? 'pass' : 'fail',
      });
    } catch (err) {
      rows.push({
        sceneIndex: s.sceneIndex,
        type: s.type,
        ...(s.heading !== undefined ? {heading: s.heading} : {}),
        diff: undefined,
        threshold: sceneThreshold,
        maskCount: masks.length,
        status: 'error',
        note: (err as Error).message,
      });
    }
  }

  log('');
  log(cyan('──── assert verdict ────'));
  log('');
  for (const r of rows) {
    const diffStr =
      r.diff === undefined ? '   —  ' : `${(r.diff * 100).toFixed(2)}%`.padStart(6);
    const thrStr = `t=${(r.threshold * 100).toFixed(1)}%`;
    const maskStr = r.maskCount > 0 ? ` mask×${r.maskCount}` : '';
    const mark =
      r.status === 'pass'
        ? green('✓')
        : r.status === 'fail'
          ? red('✗')
          : r.status === 'missing-golden'
            ? yellow('?')
            : red('!');
    log(
      `  ${mark} scene[${String(r.sceneIndex).padStart(2)}] ${r.type.padEnd(13)} diff=${diffStr} ${dim(thrStr + maskStr)}  ${dim(r.heading?.slice(0, 50) ?? '')}`,
    );
    if (r.note) log(dim(`        ${r.note}`));
  }

  const failed = rows.filter((r) => r.status === 'fail');
  const missing = rows.filter((r) => r.status === 'missing-golden');
  const errored = rows.filter((r) => r.status === 'error');
  const passed = rows.filter((r) => r.status === 'pass');

  log('');
  log(
    dim(
      `  ${passed.length}/${rows.length} passed · ${failed.length} failed · ${missing.length} missing golden · ${errored.length} error`,
    ),
  );

  // Write a JSON sidecar for downstream tooling.
  const sidecar = {
    filmId: args.filmId,
    threshold,
    compareWidth,
    mp4DurationSeconds,
    midpointSource: source,
    rows,
    pass: failed.length === 0 && missing.length === 0 && errored.length === 0,
    generatedAt: new Date().toISOString(),
  };
  const sidecarPath = join(filmGoldenDir, 'assert.json');
  writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n');
  log(dim(`  sidecar: ${sidecarPath}`));

  if (missing.length > 0) {
    log(yellow(`⚠ ${missing.length} scene(s) missing a golden — run with --update to (re)capture`));
    return 2;
  }
  if (errored.length > 0) {
    log(red(`✗ ${errored.length} scene(s) errored during assert`));
    return 4;
  }
  if (failed.length > 0) {
    log(red(`✗ visual regression — ${failed.length} scene(s) exceed their threshold`));
    for (const f of failed) {
      log(
        red(
          `    scene[${f.sceneIndex}] ${f.type} diff=${((f.diff ?? 0) * 100).toFixed(2)}% ` +
            `> ${(f.threshold * 100).toFixed(1)}% — "${f.heading?.slice(0, 60) ?? '(no heading)'}"`,
        ),
      );
    }
    return 2;
  }
  log(green(`✓ assert PASSED — every scene matches golden within threshold`));
  return 0;
};
