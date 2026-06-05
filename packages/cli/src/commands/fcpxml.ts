// `docent fcpxml <id> [--out <path>]` — emit an FCPXML 1.11 sidecar for a
// rendered film, so an editor can drop it into DaVinci Resolve, Final Cut
// Pro, or Adobe Premiere and see our structure (scene cuts, per-beat
// narration on A1, markers at every boundary) on their timeline.
//
// R11 #1. The CLI is the thin shell on top of `@bjelser/kit`'s
// `buildFcpxml` (a pure XML-string emitter). This file's only jobs:
//   1. Load `films/<id>.json`.
//   2. Build the engine (so the schedule honours user plugins).
//   3. Build the frame schedule from the spec — keyed off the persisted
//      TTS manifest when present, so beat lengths reflect real synth time.
//   4. Resolve each manifest beat's relative `audio/<id>/beat-N-M.wav`
//      path to an ABSOLUTE filesystem path (FCPXML's `media-rep src`
//      needs `file://` URLs — relative paths are silently dropped by
//      Resolve and turn into broken-link warnings in FCP).
//   5. Hand spec + schedule + audio-map to the kit emitter.
//   6. Write the result to `<out>` (default `out/<id>.fcpxml`).
//
// Mirrors the structure of `score.ts` (R9) and `captions.ts` (R10.1) —
// load-spec / build-engine / load-manifest / build-schedule / call-kit /
// write-file. Two commands have already arrived at this skeleton; this
// is the third.

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, join, resolve} from 'node:path';

import {createEngine} from '../engine-factory';
import {
  buildFcpxml,
  buildFrameSchedule,
  type FilmSpec,
  type TtsAudioMap,
} from '@bjelser/kit';

export interface FcpxmlArgs {
  readonly filmId: string;
  /** Override the output path; default `<outputDir>/<id>.fcpxml`. */
  readonly out?: string;
  /** Override the films/ dir. */
  readonly filmsDir?: string;
  /** Override the out/ dir. */
  readonly outputDir?: string;
  /** Override the project root (where public/audio/<id>/manifest.json lives). */
  readonly projectRoot?: string;
}

// Status lines on stderr; the emitted XML is a sidecar file (not stdout).
const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;
const log = (s: string) => process.stderr.write(`${s}\n`);

export const runFcpxml = async (args: FcpxmlArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const outputDir = args.outputDir ?? join(projectRoot, 'out');
  const specPath = resolve(filmsDir, `${args.filmId}.json`);

  if (!existsSync(specPath)) {
    log(red(`✗ films/${args.filmId}.json not found at ${specPath}`));
    return 1;
  }

  const spec: FilmSpec = JSON.parse(readFileSync(specPath, 'utf-8'));
  const {engine} = await createEngine(projectRoot);

  log(cyan(`▶ docent fcpxml ${args.filmId}`));

  // Load the TTS manifest if present so the schedule reflects real
  // per-beat clip seconds. Absence is fine — the schedule estimator
  // produces a per-beat window from narration length and we still emit
  // an FCPXML, just without per-beat A1 audio clips.
  const publicDir = join(projectRoot, 'public');
  const manifestPath = join(publicDir, 'audio', args.filmId, 'manifest.json');
  let ttsAudio: TtsAudioMap | undefined;
  const audioPaths: Record<`${number}-${number}`, string> = {};
  let manifestBeatCount = 0;
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
          // Resolve manifest's relative `audio/<id>/beat-N-M.wav` against
          // <publicDir>. FCPXML wants absolute file:// URLs; the kit
          // emitter calls `pathToFileUrl` for us.
          const audioAbs = isAbsolute(beat.file)
            ? beat.file
            : resolve(publicDir, beat.file);
          audioPaths[key] = audioAbs;
          manifestBeatCount += 1;
        }
        ttsAudio = map as TtsAudioMap;
      }
    } catch (e) {
      log(yellow(`  ⚠ failed to read manifest (${(e as Error).message}); proceeding without audio clips`));
    }
  }

  if (ttsAudio) {
    log(dim(`  timing source: manifest (${manifestBeatCount} beats)`));
  } else {
    log(yellow(`  timing source: estimator (no manifest at ${manifestPath})`));
  }

  // Verify the master MP4 exists. We don't require it to exist (the
  // sidecar references it by absolute path; if the editor expects to
  // re-link, that's their workflow), but a missing file is a near-
  // certain author mistake — warn loudly.
  const videoPath = resolve(outputDir, `${args.filmId}.mp4`);
  if (!existsSync(videoPath)) {
    log(yellow(`  ⚠ ${videoPath} not found — sidecar will reference a missing file. Run \`docent build ${args.filmId}\` first.`));
  }

  // Build schedule, then hand off to the kit emitter.
  const schedule = buildFrameSchedule(spec, engine, ttsAudio);

  log(
    dim(
      `  schedule: ${schedule.scenes.length} scenes · ${schedule.totalFrames} frames @ ${schedule.fps}fps · ${(schedule.totalFrames / schedule.fps).toFixed(2)}s`,
    ),
  );

  const outPath = args.out ?? join(outputDir, `${args.filmId}.fcpxml`);
  const xml = buildFcpxml(spec, schedule, {
    videoPath,
    audioPaths: Object.keys(audioPaths).length > 0 ? audioPaths : undefined,
    libraryLocation: resolve(outPath),
  });

  if (!existsSync(dirname(outPath))) {
    mkdirSync(dirname(outPath), {recursive: true});
  }
  writeFileSync(outPath, xml);

  const sizeKb = (xml.length / 1024).toFixed(1);
  const audioClipCount = Object.keys(audioPaths).length;
  log(
    green(
      `✓ wrote ${outPath} (${sizeKb} KB · ${schedule.scenes.length} scene clips · ${audioClipCount} audio clips)`,
    ),
  );

  return 0;
};
