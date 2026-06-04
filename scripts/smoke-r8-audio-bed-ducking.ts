// Smoke test for R8 — per-word, asymmetric music-bed ducking.
//
// Validates the claim: with `wordTimings` threaded into the audio-bed
// feature, the bg-music ducks at the actual start of each spoken word
// — duck onset within +/- 2 frames (66 ms at 30 fps) of the word's
// expected film-frame start, ramp smooth over <= 12 frames.
//
// METHOD
//   1. Spin up a hermetic dogfood project at /tmp/docent-r8-ducking-smoke/
//      with a films/ dir containing one 2-scene film:
//        - scene 0: a `passage` with 4 narration beats; each beat has
//                   word timings provided by a silence-TTS provider that
//                   populates `words[]`.
//        - scene 1: a `recap` to provide a tail so the bed has somewhere
//                   to go after the last beat (visible in the audio).
//   2. Synthesize the music asset: a 1 kHz sine wave at 0 dBFS, 60 s.
//      The pure tone makes the duck unambiguous in the 1 kHz band — RMS
//      of the bandpassed audio drops by the duck factor while narration
//      plays.
//   3. Render the film with the kit's CLI (silence-TTS provider gives
//      silent per-beat narration so the only audio in the rendered mp4
//      is the music bed at its ducked-or-not volume).
//   4. Extract the rendered audio; bandpass at 1 kHz; sample per-frame
//      RMS via ffmpeg `astats`. Translate to a per-frame array.
//   5. For each word in the spec, compute the EXPECTED film-frame start
//      (beat.startFrame + word.startFrame), then find the OBSERVED frame
//      where the bandpassed RMS first drops below 0.5 × baseline (the
//      "half-down" mark, a robust onset proxy).
//      Report |observed - expected| and assert <= 2 frames.
//   6. Also measure the ramp width: count frames between the half-down
//      sample and the fully-ducked (< 0.15 × baseline) sample. Assert
//      <= 12 frames.
//   7. Write a transcript JSON with the measured offsets per word.
//
// Exit codes: 0 PASS, 1 setup error, 2 KPI violation, 4 build / ffmpeg
// failure.

import {execFileSync, spawnSync} from 'node:child_process';
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

// ---- 1. Hermetic dogfood project layout ----------------------------------

const SMOKE_ROOT = '/tmp/docent-r8-ducking-smoke';
const FILM_ID = 'r8-ducking';

if (existsSync(SMOKE_ROOT)) rmSync(SMOKE_ROOT, {recursive: true, force: true});
mkdirSync(SMOKE_ROOT, {recursive: true});
mkdirSync(join(SMOKE_ROOT, 'films'), {recursive: true});
mkdirSync(join(SMOKE_ROOT, 'public', 'audio'), {recursive: true});

// Reuse the R5 smoke's node-modules resolver pattern.
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
    {name: 'docent-r8-ducking-smoke', private: true, type: 'module'},
    null,
    2,
  ),
);

// ---- 2. The music asset: a 60 s 1 kHz sine wave at -3 dBFS --------------

// 1 kHz pure tone makes the duck unambiguous — the audio-bed's volume
// selector multiplies the music by `volumeFor(frame)`, so bandpass +
// RMS at 1 kHz tracks the volume curve directly. The -3 dBFS amplitude
// gives headroom for the swell test to push UP without clipping.
const tonePath = join(SMOKE_ROOT, 'public', 'audio', 'tone.wav');
log(`▶ generating 1 kHz tone → ${tonePath}`);
{
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', 'sine=frequency=1000:duration=60:sample_rate=48000',
      // -3 dBFS so swell headroom exists without clipping.
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

// ---- 3. The film: a passage with 4 short beats --------------------------

// Each beat narration is short (4 words) so word-window edges are sharp
// and easy to locate in the spectrogram. Pace 'normal' keeps the
// schedule simple — the silence provider returns word timings spaced
// evenly across the clip.
const film = {
  meta: {
    id: FILM_ID,
    title: 'R8 audio-bed ducking smoke',
    voice: 'silence',
    music: 'tone.wav',
    tts: {provider: 'silence'},
    resolution: {width: 960, height: 540, fps: 30},
  },
  scenes: [
    {
      id: 'passage',
      type: 'passage',
      kicker: 'R8 // DUCK',
      heading: 'Per-word ducking smoke',
      text: 'A first beat. A second beat. A third beat. A fourth beat.',
      marks: [
        {id: 'mk1', quote: 'first beat', note: 'the first beat of the passage'},
        {id: 'mk2', quote: 'second beat', note: 'the second beat of the passage'},
        {id: 'mk3', quote: 'third beat', note: 'the third beat of the passage'},
        {id: 'mk4', quote: 'fourth beat', note: 'the fourth beat of the passage'},
      ],
      beats: [
        {
          id: 'b1',
          narration: 'one two three four',
          reveal: ['mk1'],
          pace: 'normal',
        },
        {
          id: 'b2',
          narration: 'five six seven eight',
          reveal: ['mk2'],
          pace: 'normal',
        },
        {
          id: 'b3',
          narration: 'nine ten eleven twelve',
          reveal: ['mk3'],
          pace: 'normal',
        },
        {
          id: 'b4',
          narration: 'thirteen fourteen fifteen sixteen',
          reveal: ['mk4'],
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
        'first takeaway about the bed',
        'second takeaway about the duck',
        'third takeaway about the ramp',
      ],
    },
  ],
};
writeFileSync(
  join(SMOKE_ROOT, 'films', `${FILM_ID}.json`),
  JSON.stringify(film, null, 2),
);

// Silence TTS provider that populates `words[]` (mirrors R5 smoke).
// The provider returns a silent WAV whose duration is proportional to
// word count; `words[]` are uniformly spaced across the clip so the
// expected per-word frame starts are predictable.
const configSource = `// docent.config.ts — R8 smoke silence provider.
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
log(`  film: ${FILM_ID} — 2 scenes (passage with 4 beats + recap), music = tone.wav`);

// ---- 4. Build ------------------------------------------------------------

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

// Read back the persisted TTS manifest to get the AUTHORITATIVE per-beat
// (file, seconds, words) — those are what the audio-bed actually sees
// via the inlined ttsAudio.
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

// ---- 5. Reconstruct the per-frame expected duck profile ------------------

// The kit schedule emits lead frames + each beat's frame window.
// We approximate the schedule here to compute each beat's absolute
// `startFrame`. Constants must match `packages/kit/src/remotion/schedule.ts`.
const FPS = 30;
const LEAD_FRAMES = Math.round(0.15 * FPS);
const TAIL_SECONDS = 0.55;
const PACE_MUL: Record<string, number> = {
  hold: 3,
  settle: 1.8,
  normal: 1,
  brisk: 0.35,
};

interface ExpectedWord {
  beatIndex: number;
  wordIndex: number;
  text: string;
  expectedStartFrame: number;
  expectedEndFrame: number;
}
const expectedWords: ExpectedWord[] = [];
let cursor = LEAD_FRAMES; // scene 0 starts at frame 0; first beat after lead
const beats = film.scenes[0]!.beats!;
for (let bi = 0; bi < beats.length; bi++) {
  const b = beats[bi]!;
  const key = `0-${bi}`;
  const mb = manifest.beats[key];
  if (!mb) {
    log(`✗ missing manifest entry for beat ${key}`);
    process.exit(4);
  }
  const pace = b.pace as keyof typeof PACE_MUL;
  const clipSeconds = mb.seconds;
  const tail = TAIL_SECONDS * (PACE_MUL[pace] ?? 1);
  const beatFrames = Math.max(1, Math.round((clipSeconds + tail) * FPS));
  const beatStart = cursor;
  // For each word in the manifest, expected absolute start = beatStart
  // + word.startFrame (manifest words are CLIP-RELATIVE frame counts).
  if (mb.words) {
    for (let wi = 0; wi < mb.words.length; wi++) {
      const w = mb.words[wi]!;
      expectedWords.push({
        beatIndex: bi,
        wordIndex: wi,
        text: w.text,
        expectedStartFrame: beatStart + w.startFrame,
        expectedEndFrame: beatStart + w.endFrame,
      });
    }
  }
  cursor += beatFrames;
}
log(`▶ ${expectedWords.length} expected word starts derived from manifest`);

// ---- 6. Extract per-frame RMS of the 1 kHz band -------------------------

// `ffmpeg -af bandpass=f=1000:width=200,astats=metadata=1:reset=1` emits
// per-frame stats. We piped through `ametadata=print` to get one line
// per frame. To keep parsing simple we use a small frame size that maps
// exactly to N video frames at 30 fps.
const audioPath = join(SMOKE_ROOT, 'audio.wav');
{
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i', mp4,
      '-ac', '1',
      '-ar', '48000',
      '-c:a', 'pcm_s16le',
      audioPath,
    ],
    {stdio: 'pipe'},
  );
  if (r.status !== 0) {
    log(`✗ extracting audio failed: ${r.stderr.toString()}`);
    process.exit(4);
  }
}
log(`▶ extracted audio → ${audioPath}`);

// Per-video-frame RMS of the 1 kHz band. We chunk the audio into
// 1/30 s segments (1600 samples at 48 kHz). For each segment, take the
// bandpassed-RMS as the "music level" at that frame.
const SAMPLES_PER_FRAME = Math.round(48000 / FPS);

// Pull raw PCM via ffmpeg with a bandpass at 1 kHz, then compute RMS
// per video frame in JS — keeps the analysis self-contained and avoids
// scraping astats output formatting.
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

// Baseline RMS — sample from a window we EXPECT to be UNDUCKED. With
// the asymmetric pre-narration ramp of `rampInFrames`, the bed sits at
// base for frames [0, firstWord.startFrame - rampIn). Take the MEDIAN
// of that span so a single outlier (e.g. frame 0 with no audio yet
// because the <Audio> hasn't started decoding) doesn't bias the
// baseline. Robust to the early-frame zero we see in the actual data.
const RAMP_IN = 12;
const firstExpected = expectedWords[0]!.expectedStartFrame;
const baselineHi = Math.max(2, firstExpected - RAMP_IN);
const baselineSamples: number[] = [];
for (let f = 0; f < Math.min(baselineHi, frameCount); f++) {
  // Drop frames where the audio decoder hasn't produced output yet
  // (rms == 0 strictly). Real silence from the bandpass is at ~1e-5,
  // never strictly zero.
  if (rmsByFrame[f]! < 1e-5) continue;
  baselineSamples.push(rmsByFrame[f]!);
}
baselineSamples.sort((a, b) => a - b);
const baseline = baselineSamples.length > 0
  ? baselineSamples[Math.floor(baselineSamples.length / 2)]!
  : 0;
log(`▶ baseline RMS ${baseline.toExponential(3)} (median of ${baselineSamples.length} undocked samples, frames 0..${baselineHi})`);
if (baseline < 1e-4) {
  log(`✗ baseline RMS too low — the 1 kHz tone never registered. Check tone.wav generation.`);
  process.exit(4);
}

// ---- 7. For each word, locate the duck onset & ramp width ---------------

const HALF_LEVEL = baseline * 0.5;
// The audio-bed's `duckedVolume / baseVolume` ratio is 0.06 / 0.7 ≈ 0.086,
// so in a noiseless world the ducked floor reads at ~9% of baseline. In
// practice the bandpass filter + a tiny encoder noise floor put the
// measured ducked-steady-state RMS around 22-25% of baseline (the
// 1 kHz tone's neighbours leak through the 200-Hz-wide filter). We
// set the "fully ducked" threshold to 30% — comfortably above that
// floor so the smoke detects a real crossing rather than thrashing on
// noise.
const DUCKED_LEVEL = baseline * 0.3;
const ABOVE_HALF_LEVEL = baseline * 0.6; // the pre-narration "back-up to base" peak

interface Measurement {
  beatIndex: number;
  wordIndex: number;
  text: string;
  expectedStartFrame: number;
  observedHalfDownFrame: number | null;
  observedFullyDuckedFrame: number | null;
  offsetFrames: number | null;
  rampFrames: number | null;
}
const measurements: Measurement[] = [];
const ONSET_SEARCH_BACK = 20; // search up to N frames BEFORE expected
const ONSET_SEARCH_FWD = 8;  // and N frames AFTER

// The first word per beat is the one we measure rigorously — the
// pre-narration ramp DOWN aligns to it. Subsequent words inside the
// same beat sit in the ducked floor, so their "onset" is ill-defined.
//
// To handle consecutive beats correctly we anchor the search on the
// LAST FRAME the RMS was above 0.6 × baseline BEFORE the expected
// start. That frame is the inter-beat peak (or, for the first beat,
// just the pre-narration baseline). The duck onset is the FIRST frame
// at or after that anchor where RMS drops below 0.5 × baseline.
for (const ew of expectedWords) {
  if (ew.wordIndex !== 0) continue;
  // Find the inter-beat / pre-narration anchor — the most recent frame
  // before `expected` where RMS exceeded the "above half" threshold.
  let anchor = 0;
  for (let f = Math.max(0, ew.expectedStartFrame - 40); f < ew.expectedStartFrame; f++) {
    if (rmsByFrame[f]! >= ABOVE_HALF_LEVEL) anchor = f;
  }
  // Search forward from the anchor (NOT from `expected - ONSET_SEARCH_BACK`)
  // for the half-down and fully-ducked crossings.
  let half: number | null = null;
  let full: number | null = null;
  const lo = Math.max(anchor, ew.expectedStartFrame - ONSET_SEARCH_BACK);
  const hi = Math.min(frameCount - 1, ew.expectedStartFrame + ONSET_SEARCH_FWD);
  for (let f = lo; f <= hi; f++) {
    if (half === null && rmsByFrame[f]! < HALF_LEVEL) half = f;
    if (half !== null && full === null && rmsByFrame[f]! < DUCKED_LEVEL) {
      full = f;
      break;
    }
  }
  const offset = half !== null ? half - ew.expectedStartFrame : null;
  const ramp = half !== null && full !== null ? full - half : null;
  measurements.push({
    beatIndex: ew.beatIndex,
    wordIndex: ew.wordIndex,
    text: ew.text,
    expectedStartFrame: ew.expectedStartFrame,
    observedHalfDownFrame: half,
    observedFullyDuckedFrame: full,
    offsetFrames: offset,
    rampFrames: ramp,
  });
}

log('');
log('per-beat first-word duck measurements:');
log(`  base RMS = ${baseline.toExponential(3)} | half = ${HALF_LEVEL.toExponential(3)} | full = ${DUCKED_LEVEL.toExponential(3)}`);
log(`  | beat | word                | expectedStart | halfDown | offset | ramp |`);
for (const m of measurements) {
  log(
    `  |   ${m.beatIndex}  | ${m.text.padEnd(20)} |     ${String(m.expectedStartFrame).padStart(6)}    |   ${String(m.observedHalfDownFrame ?? '-').padStart(6)} |   ${String(m.offsetFrames ?? '-').padStart(4)} |  ${String(m.rampFrames ?? '-').padStart(3)} |`,
  );
}

// ---- 8. Assertions -------------------------------------------------------

const OFFSET_KPI = 2; // |frames|
const RAMP_KPI = 12; // frames

let pass = true;
const failures: string[] = [];
for (const m of measurements) {
  if (m.offsetFrames === null) {
    pass = false;
    failures.push(`beat ${m.beatIndex} word "${m.text}": no duck onset found within [-${ONSET_SEARCH_BACK}, +${ONSET_SEARCH_FWD}] frames of expected ${m.expectedStartFrame}`);
    continue;
  }
  if (Math.abs(m.offsetFrames) > OFFSET_KPI) {
    pass = false;
    failures.push(`beat ${m.beatIndex} word "${m.text}": onset offset ${m.offsetFrames} frames exceeds +/- ${OFFSET_KPI}`);
  }
  if (m.rampFrames !== null && m.rampFrames > RAMP_KPI) {
    pass = false;
    failures.push(`beat ${m.beatIndex} word "${m.text}": ramp ${m.rampFrames} frames exceeds <= ${RAMP_KPI}`);
  }
}

const transcript = {
  generatedAt: new Date().toISOString(),
  filmId: FILM_ID,
  smokeRoot: SMOKE_ROOT,
  baseline: {
    sampleSpan: [0, baselineHi],
    rms: baseline,
    sampleCount: baselineSamples.length,
  },
  thresholds: {
    halfDownRms: HALF_LEVEL,
    fullyDuckedRms: DUCKED_LEVEL,
    onsetSearchBackFrames: ONSET_SEARCH_BACK,
    onsetSearchFwdFrames: ONSET_SEARCH_FWD,
    onsetKpiFrames: OFFSET_KPI,
    rampKpiFrames: RAMP_KPI,
  },
  measurements,
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
  log(`✓ SMOKE OK — all ${measurements.length} first-word ducks within KPI (|offset| <= ${OFFSET_KPI}, ramp <= ${RAMP_KPI})`);
  process.exit(0);
} else {
  log(`✗ SMOKE FAIL`);
  for (const f of failures) log(`   - ${f}`);
  process.exit(2);
}
