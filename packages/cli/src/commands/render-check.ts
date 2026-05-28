// `docent render-check <film-id>` — the visual-integrity guard.
//
// THE INVARIANT (named verbatim so a future reader knows what we're guarding):
//
//   "A film with narration cannot ship blank scene bodies."
//
// More precisely: every scene that carries at least one beat with a non-empty
// narration string MUST evolve visibly across its frame window. Chrome
// (heading, kicker, frame outline) renders regardless of beats; the body
// (nodes, edges, panels, quantities, passage marks, …) is what the audience
// is here for. If a scene's body never visibly changes — three sampled frames
// hash identical — something downstream of the reveal-gate is broken.
//
// The bug this exists to catch: a beat coordinate-system mismatch that left
// every reveal-gate `frame >= b.startFrame` permanently false. Audio played,
// chrome rendered, bodies stayed empty. Hours of compute shipped silently
// before a human watched a single frame.
//
// Method:
//   1. Build the film at low scale + skip-tts (fast — minutes, not hours).
//   2. Re-resolve the schedule via `buildFrameSchedule` to know each scene's
//      [startFrame, endFrame) window.
//   3. Per scene with narration: extract 3 PNG samples at 10% / 50% / 90% of
//      the window. SHA-256 each.
//   4. If a scene's three hashes are all equal, FAIL with the scene index,
//      the heading, the timestamps, and the path to a saved still.
//
// Exit codes: 0 all scenes evolve; 4 at least one scene is static; other
// codes come from the inner runBuild call (validation/render failure).

import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

import {createEngine} from '../engine-factory';
import {runBuild, type BuildArgs} from './build';
import {buildFrameSchedule, type FilmSpec, type SceneSchedule} from '@bjelser/kit';

const log = (s: string) => process.stdout.write(`${s}\n`);
const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;

export interface RenderCheckArgs extends Omit<BuildArgs, 'still'> {
  /** Override the per-scene sample count. Default: 3 (10%/50%/90%). */
  readonly samples?: number;
}

interface SceneSample {
  readonly sceneIndex: number;
  readonly type: string;
  readonly heading: string | undefined;
  readonly hasNarration: boolean;
  readonly t10s: number;
  readonly t50s: number;
  readonly t90s: number;
  readonly h10: string;
  readonly h50: string;
  readonly h90: string;
}

const sampleAt = (mp4: string, seconds: number, outPng: string): void => {
  execFileSync(
    'ffmpeg',
    [
      '-loglevel', 'error',
      '-y',
      '-ss', String(seconds),
      '-i', mp4,
      '-frames:v', '1',
      outPng,
    ],
    {stdio: 'ignore'},
  );
};

const hashOf = (path: string): string => {
  const buf = readFileSync(path);
  return createHash('sha256').update(buf).digest('hex').slice(0, 12);
};

const sceneHasNarration = (scene: SceneSchedule): boolean => {
  for (const b of scene.beats) {
    const n = b.beat.narration;
    if (typeof n === 'string' && n.trim().length > 0) return true;
  }
  return false;
};

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

export const runRenderCheck = async (args: RenderCheckArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const outputDir = args.outputDir ?? join(projectRoot, 'out');
  const specPath = resolve(filmsDir, `${args.filmId}.json`);

  if (!existsSync(specPath)) {
    log(red(`✗ films/${args.filmId}.json not found at ${specPath}`));
    return 1;
  }

  log(cyan(`▶ docent render-check ${args.filmId}`));
  log(dim('  the invariant: scenes with narration must evolve visibly across their window'));

  // 1. Build at low scale + skip-tts unless the caller asked for audio.
  const buildScale = args.scale ?? 0.25;
  const buildArgs: BuildArgs = {
    ...args,
    scale: buildScale,
    skipTts: args.skipTts ?? true,
  };
  log(dim(`  build: scale=${buildScale}, skipTts=${buildArgs.skipTts}`));
  const buildCode = await runBuild(buildArgs);
  if (buildCode !== 0) {
    log(red(`✗ build failed with exit ${buildCode}; cannot check render`));
    return buildCode;
  }

  const mp4 = join(outputDir, `${args.filmId}.mp4`);
  if (!existsSync(mp4)) {
    log(red(`✗ rendered mp4 missing at ${mp4}`));
    return 3;
  }

  // 2. Re-resolve the schedule so we know each scene's frame window. The
  //    engine is built the same way the build command did so resolveBeat
  //    hooks and feature-emitted scenes line up.
  const spec: FilmSpec = JSON.parse(readFileSync(specPath, 'utf-8'));
  const {engine} = await createEngine(projectRoot);

  // Try to load the TTS audio manifest from the public dir so estimated
  // beat lengths match what the actual render saw — if absent, beat lengths
  // are estimated, and that's fine for sample positioning.
  const manifestPath = join(projectRoot, 'public', 'audio', args.filmId, 'manifest.json');
  let ttsAudio: import('@bjelser/kit').TtsAudioMap | undefined;
  if (existsSync(manifestPath)) {
    try {
      ttsAudio = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch {
      ttsAudio = undefined;
    }
  }

  const schedule = buildFrameSchedule(spec, engine, ttsAudio);
  const fps = schedule.fps;
  const durationSeconds = schedule.totalFrames / fps;
  const mp4DurationSeconds = ffprobeDuration(mp4);

  log(
    dim(
      `  schedule: ${schedule.scenes.length} scenes, ${schedule.totalFrames} frames @ ${fps}fps ` +
        `(${durationSeconds.toFixed(1)}s) · mp4 duration ${mp4DurationSeconds.toFixed(1)}s`,
    ),
  );

  // The schedule estimates beat lengths from text when no TTS manifest is
  // present; the build's --skip-tts path may estimate slightly differently
  // and emit a shorter mp4. Cross-fades also overlap. Result: schedule
  // seconds may exceed the actual mp4. Scale schedule timestamps onto the
  // mp4's actual range so end-of-film samples never read past EOF.
  const scaleRatio =
    mp4DurationSeconds > 0 && durationSeconds > 0
      ? mp4DurationSeconds / durationSeconds
      : 1;
  const maxSampleS = Math.max(0, mp4DurationSeconds - 0.1);
  const clampS = (t: number): number =>
    Math.max(0, Math.min(maxSampleS, t * scaleRatio));

  // 3. Per scene: sample at 10/50/90% of its frame window, hash each.
  const sampleDir = join(outputDir, `.render-check-${args.filmId}`);
  if (!existsSync(sampleDir)) mkdirSync(sampleDir, {recursive: true});

  const samples: SceneSample[] = [];
  for (const sc of schedule.scenes) {
    const sceneStartS = sc.startFrame / fps;
    const sceneEndS = (sc.startFrame + sc.frames) / fps;
    const span = sceneEndS - sceneStartS;
    const t10s = clampS(sceneStartS + span * 0.10);
    const t50s = clampS(sceneStartS + span * 0.50);
    const t90s = clampS(sceneStartS + span * 0.90);
    const p10 = join(sampleDir, `scene-${sc.sceneIndex}-t10.png`);
    const p50 = join(sampleDir, `scene-${sc.sceneIndex}-t50.png`);
    const p90 = join(sampleDir, `scene-${sc.sceneIndex}-t90.png`);
    sampleAt(mp4, t10s, p10);
    sampleAt(mp4, t50s, p50);
    sampleAt(mp4, t90s, p90);
    const sceneHeading: string | undefined =
      (sc.scene as {heading?: string}).heading ??
      (sc.scene as {kicker?: string}).kicker;
    samples.push({
      sceneIndex: sc.sceneIndex,
      type: sc.scene.type,
      heading: sceneHeading,
      hasNarration: sceneHasNarration(sc),
      t10s,
      t50s,
      t90s,
      h10: hashOf(p10),
      h50: hashOf(p50),
      h90: hashOf(p90),
    });
  }

  // 4. Verdict: static scenes are scenes whose three hashes are all equal
  //    AND that carry at least one narration beat. Chrome-only scenes (no
  //    narration) are allowed to be static.
  const staticOffenders = samples.filter(
    (s) => s.hasNarration && s.h10 === s.h50 && s.h50 === s.h90,
  );

  // Write a JSON sidecar with the full sample table — useful for diffing
  // across runs (regression hunt) or for piping into a dashboard later.
  const sidecarPath = join(sampleDir, 'check.json');
  writeFileSync(
    sidecarPath,
    JSON.stringify(
      {
        filmId: args.filmId,
        fps,
        totalFrames: schedule.totalFrames,
        durationSeconds,
        mp4DurationSeconds,
        sceneCount: schedule.scenes.length,
        samples,
        staticOffenders: staticOffenders.map((s) => s.sceneIndex),
        invariant:
          'every scene with narration must evolve visibly across its window',
        pass: staticOffenders.length === 0,
      },
      null,
      2,
    ) + '\n',
  );

  log('');
  log(cyan('──── render-check verdict ────'));
  log('');
  for (const s of samples) {
    const status = !s.hasNarration
      ? dim('—')
      : s.h10 === s.h50 && s.h50 === s.h90
        ? red('✗')
        : green('✓');
    const evol = s.h10 === s.h50 && s.h50 === s.h90 ? 'static' : 'evolves';
    log(
      `  ${status} scene[${String(s.sceneIndex).padStart(2)}] ${s.type.padEnd(13)} ${evol}  ${dim(s.heading?.slice(0, 50) ?? '')}`,
    );
    if (s.h10 === s.h50 && s.h50 === s.h90) {
      log(
        dim(
          `        t=${s.t10s.toFixed(1)}s/${s.t50s.toFixed(1)}s/${s.t90s.toFixed(1)}s  hashes=${s.h10}/${s.h50}/${s.h90}`,
        ),
      );
    }
  }
  log('');

  const sceneTotal = samples.length;
  const narratedCount = samples.filter((s) => s.hasNarration).length;
  const sizes = {
    mp4: statSync(mp4).size,
  };
  log(
    dim(
      `  ${sceneTotal} scenes (${narratedCount} narrated) · ${(sizes.mp4 / 1024 / 1024).toFixed(1)} MB · samples under ${sampleDir}`,
    ),
  );

  if (staticOffenders.length === 0) {
    log(green(`✓ render-check PASSED — every narrated scene evolves visibly`));
    return 0;
  }

  log(red(`✗ render-check FAILED — ${staticOffenders.length} narrated scene(s) static:`));
  for (const o of staticOffenders) {
    const headline = o.heading?.slice(0, 60) ?? '(no heading)';
    log(red(`    scene[${o.sceneIndex}] ${o.type} — "${headline}"`));
    log(
      dim(
        `      sampled t=${o.t10s.toFixed(1)}s, ${o.t50s.toFixed(1)}s, ${o.t90s.toFixed(1)}s — pixels identical across all three`,
      ),
    );
  }
  log(yellow(`  sample stills + sidecar: ${sampleDir}`));
  return 4;
};
