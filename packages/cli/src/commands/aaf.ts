// `docent aaf <film-id> [--out <path>]`
//
// R11.2 — emit an AAF (Advanced Authoring Format) binary file for Avid
// Media Composer ingest. The editor drops the resulting `.aaf` into Media
// Composer's import dialog and sees the docent film as a sequence whose
// segments are SourceClips into an AMA-linked reference to the rendered
// MP4 — one segment per docent scene, in render order.
//
// The CLI is a thin shell: load + validate the spec, load the persisted
// TTS manifest (so the frame schedule is keyed off real clip seconds),
// ffprobe the rendered MP4 (the AMA-link descriptor needs accurate
// stream metadata), build the plan via `buildAafPlan`, write via
// `writeAafFile`. All policy lives in @bjelser/kit's cascade/aaf.ts.
//
// **What you need before running.** The MP4 at `out/<id>.mp4` (i.e.
// `docent build <id>` must have already run). The AAF writer refuses to
// produce a binary that points at a non-existent essence — the editor
// would get a "media offline" view that's worse than a clear error here.
//
// **Friction surface.** The writer shells to `uvx --from pyaaf2 python …`
// (see kit/src/cascade/aaf.ts for the rationale). `uv` must be on PATH;
// the writer raises an `AafWriterError` with the install hint when it's
// not. The CLI surfaces this as exit-3 with a pointer to docent doctor.

import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

import {createEngine} from '../engine-factory';
import {
  AafWriterError,
  buildAafPlan,
  buildFrameSchedule,
  type FilmSpec,
  type TtsAudioMap,
  writeAafFile,
} from '@bjelser/kit';

export interface AafArgs {
  readonly filmId: string;
  readonly out?: string;
  readonly outputDir?: string;
  readonly filmsDir?: string;
  readonly projectRoot?: string;
  readonly json?: boolean;
}

// Status lines on STDERR so `--json` owns STDOUT cleanly (mirrors
// score.ts / captions.ts conventions).
const log = (s: string) => process.stderr.write(`${s}\n`);
const err = (s: string) => process.stderr.write(`${s}\n`);

const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;

export const runAaf = async (args: AafArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const outputDir = args.outputDir ?? join(projectRoot, 'out');
  const specPath = resolve(filmsDir, `${args.filmId}.json`);
  const mediaPath = join(outputDir, `${args.filmId}.mp4`);
  const outPath = args.out ?? join(outputDir, `${args.filmId}.aaf`);

  if (!existsSync(specPath)) {
    err(red(`✗ films/${args.filmId}.json not found at ${specPath}`));
    return 1;
  }
  if (!existsSync(mediaPath)) {
    err(red(`✗ out/${args.filmId}.mp4 not found at ${mediaPath}`));
    err(dim(`  hint: run \`docent build ${args.filmId}\` first.`));
    return 1;
  }

  const spec: FilmSpec = JSON.parse(readFileSync(specPath, 'utf-8'));
  const {engine} = await createEngine(projectRoot);

  log(cyan(`▶ docent aaf ${args.filmId}`));
  log(dim(`  spec:   ${specPath}`));
  log(dim(`  media:  ${mediaPath}`));
  log(dim(`  out:    ${outPath}`));

  // 1. Pre-validate so a structural failure surfaces *before* we walk the
  //    schedule. Same gating philosophy as score.ts.
  const issues = engine.validate(spec, {projectRoot});
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    err(red(`✗ spec validation failed (${errors.length} error(s)) — fix before exporting AAF`));
    for (const e of errors.slice(0, 5)) err(red(`    ✗ ${e.path || '(root)'}: ${e.message}`));
    return 2;
  }

  // 2. Load the persisted TTS manifest if present — the schedule's per-
  //    beat math is keyed off real audio durations so the segment lengths
  //    match what the renderer emitted, not an estimator. Absence falls
  //    back to the estimator (the CLI warns; the AAF still writes).
  const manifestPath = join(projectRoot, 'public', 'audio', args.filmId, 'manifest.json');
  let ttsAudio: TtsAudioMap | undefined;
  let ttsSource = 'estimator (no TTS manifest — segment lengths approximate)';
  if (existsSync(manifestPath)) {
    try {
      const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
        readonly beats?: Readonly<Record<string, {
          readonly sceneIndex: number;
          readonly beatIndex: number;
          readonly file: string;
          readonly seconds: number;
          readonly words?: ReadonlyArray<{readonly text: string; readonly startFrame: number; readonly endFrame: number}>;
        }>>;
      };
      if (raw.beats) {
        const map: Record<`${number}-${number}`, {file: string; seconds: number; words?: ReadonlyArray<{text: string; startFrame: number; endFrame: number}>}> = {};
        for (const beat of Object.values(raw.beats)) {
          const key = `${beat.sceneIndex}-${beat.beatIndex}` as `${number}-${number}`;
          map[key] = {
            file: beat.file,
            seconds: beat.seconds,
            ...(beat.words ? {words: beat.words} : {}),
          };
        }
        ttsAudio = map as TtsAudioMap;
        ttsSource = `manifest (${Object.keys(raw.beats).length} beats)`;
      }
    } catch {
      // fall through to estimator — never let a stale manifest block export
    }
  }
  log(dim(`  timing: ${ttsSource}`));

  // 3. ffprobe — the AMA descriptor needs accurate stream metadata
  //    (codec, width/height, edit rate, sample rate). pyaaf2's create_media_link
  //    reads from the JSON shape `ffprobe -show_format -show_streams` produces.
  let probe: unknown;
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_format', '-show_streams', '-print_format', 'json', mediaPath],
      {encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe']},
    );
    probe = JSON.parse(out);
  } catch (e) {
    err(red(`✗ ffprobe failed on ${mediaPath}`));
    err(dim(`  ${(e as Error).message}`));
    err(dim(`  hint: install ffmpeg (homebrew: brew install ffmpeg).`));
    return 3;
  }

  // 4. Build plan + write.
  const schedule = buildFrameSchedule(spec, engine, ttsAudio);
  const plan = buildAafPlan(spec, schedule, mediaPath, probe);

  log(
    dim(
      `  plan:   ${plan.segments.length} segments · ` +
        `${(plan.totalFrames / plan.editRate).toFixed(1)}s @ ${plan.editRate}fps`,
    ),
  );

  if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), {recursive: true});

  let result;
  try {
    result = writeAafFile(plan, outPath);
  } catch (e) {
    if (e instanceof AafWriterError) {
      err(red(`✗ AAF write failed`));
      err(red(`  ${e.message}`));
      if (e.stderr) err(dim(`  stderr:\n    ${e.stderr.split('\n').slice(0, 8).join('\n    ')}`));
      err(yellow(`  hint: \`docent doctor\` will check uv + pyaaf2 availability.`));
      return 3;
    }
    throw e;
  }

  log(green(`✓ wrote ${result.outPath}`));
  log(dim(`  ${result.bytes} bytes · ${result.segmentCount} composition segments`));

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          filmId: args.filmId,
          outPath: result.outPath,
          bytes: result.bytes,
          segmentCount: result.segmentCount,
          plan: {
            editRate: plan.editRate,
            totalFrames: plan.totalFrames,
            segments: plan.segments.map((s) => ({
              sceneId: s.sceneId,
              name: s.name,
              startFrame: s.startFrame,
              lengthFrames: s.lengthFrames,
              markerText: s.markerText,
            })),
          },
        },
        null,
        2,
      ) + '\n',
    );
  }

  return 0;
};
