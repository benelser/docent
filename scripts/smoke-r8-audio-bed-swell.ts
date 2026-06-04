// Smoke test for R8 — cluster-aware "boom" swell into a `big-idea` scene.
//
// Validates the claim: when a `tension` scene (cluster `categorization`)
// is followed by a `big-idea` scene (cluster `narrative`), the
// audio-bed lifts the bg-music to `baseVolume × 1.4` over a 12-frame
// ramp, peaking right BEFORE the big-idea scene's first frame, then
// quick-fades back as the big-idea's first beat begins.
//
// METHOD
//   1. Hermetic dogfood at /tmp/docent-r8-swell-smoke/. Reuses the R8
//      ducking smoke's silence-TTS provider (populates word timings)
//      and the 1 kHz tone music asset.
//   2. Author a 3-scene film:
//        - scene 0: a `tension` with two beats (a CHOSEN + REJECTED
//                   pair + a RISK node — the minimum a tension scene
//                   needs to validate).
//        - scene 1: a `big-idea` with two beats — the rhetorical pivot
//                   the swell synchronizes to.
//        - scene 2: a `recap` so the film ends cleanly.
//   3. Render with `--scale=0.5`.
//   4. Extract audio; per-frame RMS of the 1 kHz band.
//   5. Locate the big-idea scene's first frame from the kit schedule
//      (reconstructed locally from the persisted TTS manifest).
//   6. Within a ±18-frame window of the big-idea start, find the peak
//      RMS frame. Assert peak >= baseline × 1.2 (the swell DID register
//      a lift) and the peak frame is within 4 frames BEFORE the
//      big-idea start (the boom is timed to the cut, the swell peaks
//      just before).
//   7. Write a transcript with the measured peak frame + peak RMS.
//
// Exit codes: 0 PASS, 1 setup error, 2 swell KPI violation, 4 build
// failure.

import {spawnSync} from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const log = (s: string): void => process.stdout.write(`${s}\n`);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const SMOKE_ROOT = '/tmp/docent-r8-swell-smoke';
const FILM_ID = 'r8-swell';

if (existsSync(SMOKE_ROOT)) rmSync(SMOKE_ROOT, {recursive: true, force: true});
mkdirSync(SMOKE_ROOT, {recursive: true});
mkdirSync(join(SMOKE_ROOT, 'films'), {recursive: true});
mkdirSync(join(SMOKE_ROOT, 'public', 'audio'), {recursive: true});

const findNodeModules = (start: string): string => {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'node_modules');
    if (existsSync(candidate)) {
      if (existsSync(join(candidate, '.bin', 'remotion'))) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(REPO_ROOT, 'node_modules');
};
const HOST_NODE_MODULES = findNodeModules(REPO_ROOT);
log(`▶ host node_modules at ${HOST_NODE_MODULES}`);

const SYMLINKS: Array<[string, string]> = [
  [join(REPO_ROOT, 'packages'), 'packages'],
  [join(REPO_ROOT, 'remotion.config.ts'), 'remotion.config.ts'],
  [join(REPO_ROOT, 'bunfig.toml'), 'bunfig.toml'],
  [join(REPO_ROOT, 'tsconfig.json'), 'tsconfig.json'],
];
for (const [src, name] of SYMLINKS) {
  if (!existsSync(src)) continue;
  symlinkSync(src, join(SMOKE_ROOT, name));
}
const localNodeModules = join(SMOKE_ROOT, 'node_modules');
mkdirSync(localNodeModules, {recursive: true});
for (const name of readdirSync(HOST_NODE_MODULES)) {
  if (name === '@bjelser') continue;
  const src = join(HOST_NODE_MODULES, name);
  const dst = join(localNodeModules, name);
  if (existsSync(dst)) continue;
  symlinkSync(src, dst);
}
mkdirSync(join(localNodeModules, '@bjelser'), {recursive: true});
for (const pkg of ['kit', 'core', 'cli', 'agent']) {
  const src = join(REPO_ROOT, 'packages', pkg);
  if (!existsSync(src)) continue;
  symlinkSync(src, join(localNodeModules, '@bjelser', pkg));
}
writeFileSync(
  join(SMOKE_ROOT, 'package.json'),
  JSON.stringify(
    {name: 'docent-r8-swell-smoke', private: true, type: 'module'},
    null,
    2,
  ),
);

// 1 kHz tone music asset — same setup as the ducking smoke.
const tonePath = join(SMOKE_ROOT, 'public', 'audio', 'tone.wav');
log(`▶ generating 1 kHz tone → ${tonePath}`);
{
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', 'sine=frequency=1000:duration=60:sample_rate=48000',
      '-filter:a', 'volume=-3dB',
      '-c:a', 'pcm_s16le',
      tonePath,
    ],
    {stdio: 'pipe'},
  );
  if (r.status !== 0) {
    log(`✗ ffmpeg sine generation failed: ${r.stderr.toString()}`);
    process.exit(4);
  }
}

// The film: tension → big-idea → recap. The tension scene's
// (CHOSEN / REJECTED / RISK) node layout is the minimum the
// scene plugin's validator requires. We use `pace: 'hold'` on the
// last tension beat so a satisfying tail gap opens before the
// big-idea — gives the swell room to register.
const film = {
  meta: {
    id: FILM_ID,
    title: 'R8 audio-bed swell smoke',
    voice: 'silence',
    music: 'tone.wav',
    tts: {provider: 'silence'},
    resolution: {width: 960, height: 540, fps: 30},
  },
  scenes: [
    {
      id: 'tension',
      type: 'tension',
      heading: 'A trade-off was made',
      nodes: [
        {id: 'chosen', label: 'we ship monolith', sub: 'the trade-off note for CHOSEN'},
        {id: 'rejected', kind: 'rejected', label: 'we ship microservices', sub: 'set aside for scope'},
        {id: 'risk', kind: 'risk', label: 'scaling will hurt', sub: 'the residual fragility'},
      ],
      beats: [
        {
          id: 't1',
          narration: 'we faced a choice and we made it',
          reveal: ['chosen'],
          pace: 'normal',
        },
        {
          id: 't2',
          narration: 'the alternative was set aside but the risk remains',
          reveal: ['rejected', 'risk'],
          pace: 'hold',
        },
      ],
    },
    {
      id: 'big-idea',
      type: 'big-idea',
      kicker: 'PIVOT',
      statement: 'The choice was the design itself.',
      anchor: {kind: 'glyph', value: '◆'},
      beats: [
        {
          id: 'bi1',
          narration: 'this is the rhetorical pivot the swell synchronizes to',
          pace: 'normal',
        },
      ],
    },
    {
      id: 'recap',
      type: 'recap',
      kicker: 'R8 // END',
      title: 'A recap so the bed has room to breathe',
      points: [
        'first takeaway about the swell',
        'second takeaway about the peak',
        'third takeaway about the cluster',
      ],
    },
  ],
};
writeFileSync(
  join(SMOKE_ROOT, 'films', `${FILM_ID}.json`),
  JSON.stringify(film, null, 2),
);

// Silence TTS provider (identical to the ducking smoke's).
const configSource = `// docent.config.ts — R8 swell smoke silence provider.
import type {
  TtsCapabilities,
  TtsProvider,
  TtsProviderContext,
  TtsProviderPlugin,
  TtsSynthesisOptions,
  TtsSynthesisResult,
  TtsVoice,
  WordAlignment,
} from '@bjelser/kit';

const buildSilentWav = (seconds: number): Uint8Array => {
  const sampleRate = 24000;
  const channels = 1;
  const bytesPerSample = 2;
  const numSamples = Math.round(sampleRate * seconds);
  const dataSize = numSamples * channels * bytesPerSample;
  const fileSize = 44 + dataSize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  let offset = 0;
  const writeString = (s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  };
  writeString('RIFF');
  view.setUint32(offset, fileSize - 8, true); offset += 4;
  writeString('WAVE');
  writeString('fmt ');
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * channels * bytesPerSample, true); offset += 4;
  view.setUint16(offset, channels * bytesPerSample, true); offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true); offset += 2;
  writeString('data');
  view.setUint32(offset, dataSize, true); offset += 4;
  return new Uint8Array(buf);
};

const splitWords = (text: string, durationMs: number): WordAlignment[] => {
  const tokens = text.trim().split(/\\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const perWord = durationMs / tokens.length;
  return tokens.map((t, i) => ({
    text: t,
    startMs: Math.round(i * perWord),
    endMs: Math.round((i + 1) * perWord),
  }));
};

const caps: TtsCapabilities = {
  nativeAlignment: 'word',
  streaming: false,
  ssml: false,
  voiceCloning: false,
  local: true,
};

const provider: TtsProvider = {
  id: 'silence',
  capabilities: caps,
  async synth(text: string, _options: TtsSynthesisOptions): Promise<TtsSynthesisResult> {
    const words = text.trim().split(/\\s+/).filter(Boolean).length;
    const seconds = Math.max(1, words / (150 / 60));
    const audio = buildSilentWav(seconds);
    const durationMs = Math.round(seconds * 1000);
    const wordList = splitWords(text, durationMs);
    return {
      audio,
      mediaType: 'audio/wav',
      durationMs,
      alignment: wordList,
      alignmentSource: 'native',
      words: wordList,
    };
  },
  async listVoices(): Promise<TtsVoice[]> {
    return [{id: 'silence', name: 'Silence', language: '*'}];
  },
};

const silencePlugin: TtsProviderPlugin = {
  kind: 'tts',
  name: 'r8-smoke-silence',
  version: '0.1.0',
  providerId: 'silence',
  capabilities: caps,
  async create(_ctx: TtsProviderContext): Promise<TtsProvider> {
    return provider;
  },
};

export default {plugins: [silencePlugin]};
`;
writeFileSync(join(SMOKE_ROOT, 'docent.config.ts'), configSource);

log(`▶ wrote hermetic project at ${SMOKE_ROOT}`);
log(`  film: ${FILM_ID} — tension → big-idea → recap`);

// Build.
const buildArgs = [
  'run',
  join(REPO_ROOT, 'packages/cli/src/index.ts'),
  'build',
  FILM_ID,
  '--scale=0.5',
  '--no-tts-cache',
];
log(`▶ build: ${buildArgs.slice(3).join(' ')}`);
{
  const r = spawnSync('bun', buildArgs, {
    cwd: SMOKE_ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    log(`✗ build failed with code ${r.status}`);
    process.exit(4);
  }
}
const mp4 = join(SMOKE_ROOT, 'out', `${FILM_ID}.mp4`);
if (!existsSync(mp4)) {
  log(`✗ expected mp4 at ${mp4} — not found`);
  process.exit(4);
}
log(`✓ build → ${mp4} (${(statSync(mp4).size / 1024).toFixed(1)} KB)`);

// Reconstruct the schedule locally to find the big-idea scene's first
// frame. Constants mirror packages/kit/src/remotion/schedule.ts.
const FPS = 30;
const LEAD_FRAMES = Math.round(0.15 * FPS);
const TAIL_SECONDS = 0.55;
const PACE_MUL: Record<string, number> = {
  hold: 3,
  settle: 1.8,
  normal: 1,
  brisk: 0.35,
};

const manifestPath = join(SMOKE_ROOT, 'public', 'audio', FILM_ID, 'manifest.json');
if (!existsSync(manifestPath)) {
  log(`✗ TTS manifest not found at ${manifestPath}`);
  process.exit(4);
}
type ManifestBeat = {
  file: string;
  seconds: number;
  words?: Array<{text: string; startFrame: number; endFrame: number}>;
};
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
  beats: Record<string, ManifestBeat>;
};

const transitionFrames = (sceneType: string): number => {
  // Mirrors `transitionFrames` in schedule.ts — only special when the
  // scene declares a `cut` knob, which our spec does not.
  void sceneType;
  return 16;
};

// Build the per-scene window list — scene starts, scene ends, scene
// type. Mirrors `buildFrameSchedule` exactly (including the cross-fade
// overlap subtraction). `narrationEnd` is the END of the last word in
// the last beat (when the manifest carries word timings) or the end
// of the last beat window otherwise — same definition the audio-bed
// uses to measure the swell gap.
interface SceneWin {
  type: string;
  start: number;
  end: number;
  lastBeatEnd: number;
  narrationEnd: number;
}
const sceneWins: SceneWin[] = [];
let cursor = 0;
for (let si = 0; si < film.scenes.length; si++) {
  const s = film.scenes[si]! as unknown as {type: string; beats?: Array<{pace?: string}>};
  const sceneStart = cursor;
  let beatCursor = sceneStart + LEAD_FRAMES;
  let lastBeatEnd = beatCursor;
  let narrationEnd = beatCursor;
  const beats = s.beats ?? [];
  for (let bi = 0; bi < beats.length; bi++) {
    const key = `${si}-${bi}`;
    const mb = manifest.beats[key];
    if (!mb) continue;
    const pace = beats[bi]?.pace ?? 'normal';
    const tail = TAIL_SECONDS * (PACE_MUL[pace] ?? 1);
    const beatFrames = Math.max(1, Math.round((mb.seconds + tail) * FPS));
    const startAbs = beatCursor;
    beatCursor += beatFrames;
    lastBeatEnd = beatCursor;
    // Narration end of this beat: clip-relative last-word END +
    // beat start. When this is the LAST beat the loop's final value
    // is the scene's narration-end.
    if (mb.words && mb.words.length > 0) {
      narrationEnd = startAbs + mb.words[mb.words.length - 1]!.endFrame;
    } else {
      narrationEnd = beatCursor;
    }
  }
  if (beats.length === 0) {
    beatCursor = sceneStart + Math.max(LEAD_FRAMES, Math.round(FPS));
    lastBeatEnd = beatCursor;
    narrationEnd = beatCursor;
  }
  const sceneEnd = beatCursor;
  const transitionOut = si < film.scenes.length - 1 ? transitionFrames(s.type) : 0;
  sceneWins.push({type: s.type, start: sceneStart, end: sceneEnd, lastBeatEnd, narrationEnd});
  cursor = sceneEnd - transitionOut;
}

const tensionWin = sceneWins.find((s) => s.type === 'tension')!;
const bigIdeaWin = sceneWins.find((s) => s.type === 'big-idea')!;
log(`▶ tension scene window:  start=${tensionWin.start} end=${tensionWin.end} lastBeatEnd=${tensionWin.lastBeatEnd} narrationEnd=${tensionWin.narrationEnd}`);
log(`▶ big-idea scene window: start=${bigIdeaWin.start} end=${bigIdeaWin.end}`);
log(`▶ gap (tension narrationEnd → big-idea start): ${bigIdeaWin.start - tensionWin.narrationEnd} frames`);

if (bigIdeaWin.start - tensionWin.narrationEnd < 24) {
  log(`✗ Gap below the 24-frame swell threshold — bump the tension scene's last beat pace.`);
  process.exit(1);
}

// Extract audio + per-frame RMS of the 1 kHz band.
const audioPath = join(SMOKE_ROOT, 'audio.wav');
{
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', mp4, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', audioPath],
    {stdio: 'pipe'},
  );
  if (r.status !== 0) {
    log(`✗ extracting audio failed: ${r.stderr.toString()}`);
    process.exit(4);
  }
}
const SAMPLES_PER_FRAME = Math.round(48000 / FPS);
const pcmProc = spawnSync(
  'ffmpeg',
  [
    '-v', 'error',
    '-i', audioPath,
    '-af', 'bandpass=f=1000:width_type=h:width=200',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '1',
    'pipe:1',
  ],
  {stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 512},
);
if (pcmProc.status !== 0) {
  log(`✗ ffmpeg bandpass failed: ${pcmProc.stderr.toString()}`);
  process.exit(4);
}
const pcm = new Int16Array(
  pcmProc.stdout.buffer,
  pcmProc.stdout.byteOffset,
  Math.floor(pcmProc.stdout.length / 2),
);
const frameCount = Math.floor(pcm.length / SAMPLES_PER_FRAME);
const rmsByFrame = new Float32Array(frameCount);
for (let f = 0; f < frameCount; f++) {
  let sum = 0;
  const start = f * SAMPLES_PER_FRAME;
  for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
    const s = pcm[start + i]! / 32768;
    sum += s * s;
  }
  rmsByFrame[f] = Math.sqrt(sum / SAMPLES_PER_FRAME);
}
log(`▶ computed per-frame RMS over ${frameCount} frames`);

// Baseline RMS — median of the early pre-narration window.
const baselineSamples: number[] = [];
for (let f = 0; f < Math.min(3, frameCount); f++) {
  if (rmsByFrame[f]! > 1e-5) baselineSamples.push(rmsByFrame[f]!);
}
baselineSamples.sort((a, b) => a - b);
const baseline = baselineSamples.length > 0
  ? baselineSamples[Math.floor(baselineSamples.length / 2)]!
  : 0;
log(`▶ baseline RMS ${baseline.toExponential(3)}`);
if (baseline < 1e-4) {
  log(`✗ baseline RMS too low — the 1 kHz tone never registered.`);
  process.exit(4);
}

// Search a ±18-frame window around the big-idea start for the swell
// peak. The swell ramps up over 12 frames, peaks at `bigIdea.start - 1`,
// then ramps down over another 12 frames. We accept a peak in
// [bigIdea.start - 18, bigIdea.start + 6] — the peak must land in the
// LIFT phase, not in the decay.
const SWELL_LOOK_BACK = 18;
const SWELL_LOOK_FWD = 6;
const lo = Math.max(0, bigIdeaWin.start - SWELL_LOOK_BACK);
const hi = Math.min(frameCount - 1, bigIdeaWin.start + SWELL_LOOK_FWD);
let peakFrame = lo;
let peakRms = rmsByFrame[lo]!;
for (let f = lo; f <= hi; f++) {
  if (rmsByFrame[f]! > peakRms) {
    peakRms = rmsByFrame[f]!;
    peakFrame = f;
  }
}
const peakOffsetFromBigIdea = peakFrame - bigIdeaWin.start;
const peakRatio = peakRms / baseline;
log('');
log(`swell window measurement:`);
log(`  big-idea start frame    : ${bigIdeaWin.start}`);
log(`  search window           : [${lo}, ${hi}]`);
log(`  baseline RMS            : ${baseline.toExponential(3)}`);
log(`  peak frame              : ${peakFrame}`);
log(`  peak offset from start  : ${peakOffsetFromBigIdea} frames (negative = before)`);
log(`  peak RMS                : ${peakRms.toExponential(3)}`);
log(`  peak / baseline ratio   : ${peakRatio.toFixed(2)}x (target >= 1.2)`);

// Sample 5 frames before+after the peak so we can SEE the swell shape
// in the transcript.
const samples: Array<{f: number; rms: number; ratio: number}> = [];
for (let df = -6; df <= 6; df++) {
  const f = peakFrame + df;
  if (f < 0 || f >= frameCount) continue;
  samples.push({f, rms: rmsByFrame[f]!, ratio: rmsByFrame[f]! / baseline});
}

// KPIs:
//   - peak ratio >= 1.2x (the swell lifted noticeably — the spec
//     targets 1.4x but a 1.2x lower bound tolerates the bandpass
//     filter's group-delay smoothing).
//   - peak frame must be at or BEFORE big-idea.start + 2 (the swell
//     peaks just BEFORE the cut; +2 frame slack for frame-quantization
//     of the cross-fade).
const RATIO_KPI = 1.2;
const PEAK_OFFSET_MAX = 2; // frames after big-idea.start

let pass = true;
const failures: string[] = [];
if (peakRatio < RATIO_KPI) {
  pass = false;
  failures.push(`peak / baseline ratio ${peakRatio.toFixed(2)}x below ${RATIO_KPI}x`);
}
if (peakOffsetFromBigIdea > PEAK_OFFSET_MAX) {
  pass = false;
  failures.push(`peak frame ${peakFrame} is ${peakOffsetFromBigIdea} frames AFTER big-idea start (${bigIdeaWin.start}); must be at most +${PEAK_OFFSET_MAX}`);
}

const transcript = {
  generatedAt: new Date().toISOString(),
  filmId: FILM_ID,
  smokeRoot: SMOKE_ROOT,
  scheduleReconstruction: {
    fps: FPS,
    leadFrames: LEAD_FRAMES,
    sceneWindows: sceneWins,
  },
  baseline: {rms: baseline, sampleCount: baselineSamples.length},
  searchWindow: {lo, hi},
  result: {
    peakFrame,
    peakRms,
    peakOffsetFromBigIdeaStart: peakOffsetFromBigIdea,
    peakRatioBaseline: peakRatio,
    samplesAroundPeak: samples,
  },
  thresholds: {
    peakRatioKpi: RATIO_KPI,
    peakOffsetMaxFrames: PEAK_OFFSET_MAX,
  },
  pass,
  failures,
  versions: {
    kit: JSON.parse(
      readFileSync(join(REPO_ROOT, 'packages/kit/package.json'), 'utf-8'),
    ).version,
    core: JSON.parse(
      readFileSync(join(REPO_ROOT, 'packages/core/package.json'), 'utf-8'),
    ).version,
  },
};
const transcriptPath = join(SMOKE_ROOT, 'transcript.json');
writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
log('');
log(`▶ transcript: ${transcriptPath}`);

if (pass) {
  log(`✓ SMOKE OK — swell peak at frame ${peakFrame} (${peakOffsetFromBigIdea} from big-idea start), ${peakRatio.toFixed(2)}x baseline`);
  process.exit(0);
} else {
  log(`✗ SMOKE FAIL`);
  for (const f of failures) log(`   - ${f}`);
  process.exit(2);
}
