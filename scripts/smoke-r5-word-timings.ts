// Smoke test for R5 — word-level timing IR end-to-end.
//
// Validates the claim: a passage scene rendered with per-word karaoke
// highlight (driven by inlined word timings) produces a visibly distinct
// midpoint frame from the same scene rendered without word timings (the
// static-text fallback path).
//
// METHOD
//   1. Spin up a hermetic dogfood project at /tmp/docent-r5-words-smoke/
//      with a films/ dir containing one 1-scene passage film + a custom
//      docent.config.ts that registers a "test silence" provider. The
//      provider returns silent WAV bytes AND populates `words[]` so the
//      manifest carries frame-quantised word timings.
//   2. Symlink the worktree's packages/, node_modules, remotion.config.ts,
//      and public/ into the hermetic root.
//   3. Build the film TWICE:
//        (a) DOCENT_TTS_NO_WORDS unset — provider populates `words[]`,
//            passage scene renders karaoke.
//        (b) DOCENT_TTS_NO_WORDS=1 — provider returns `words: undefined`,
//            passage scene falls through to its static-text path.
//      Between builds we wipe the persisted audio dir so the content-hash
//      cache doesn't serve stale beats with stale words.
//   4. ffmpeg-extract one frame from the midpoint of the passage scene
//      from each mp4.
//   5. Mean-absolute-pixel-diff between the two frames.
//   6. Assert > 25%. Below that means the karaoke layer is NOT changing
//      the render — a regression.
//
// Exit codes: 0 PASS, 1 setup error, 2 diff under threshold, 4 build /
// ffmpeg failure.

import {execFileSync, spawnSync} from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
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

const SMOKE_ROOT = '/tmp/docent-r5-words-smoke';
const FILM_ID = 'r5-words';
const FRAMES_OUT = join(SMOKE_ROOT, 'frames');

// Wipe and re-create.
if (existsSync(SMOKE_ROOT)) rmSync(SMOKE_ROOT, {recursive: true, force: true});
mkdirSync(SMOKE_ROOT, {recursive: true});
mkdirSync(join(SMOKE_ROOT, 'films'), {recursive: true});
mkdirSync(FRAMES_OUT, {recursive: true});

// The worktree may not carry its own node_modules — symlink the main
// repo's tree (the parent of `.claude/worktrees/<id>/`) so remotion is
// reachable at `<smoke>/node_modules/.bin/remotion`.
const findNodeModules = (start: string): string => {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'node_modules');
    if (existsSync(candidate)) {
      // We want a node_modules that carries the FULL host tree (with
      // .bin/remotion). The worktree may carry a minimal local
      // node_modules just for @bjelser overrides; skip if it's missing
      // .bin/remotion.
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
// Local `public/` — keep the per-film audio cache scoped to the smoke
// root so we never pollute the host repo's public/audio dir.
mkdirSync(join(SMOKE_ROOT, 'public'), {recursive: true});

// node_modules wiring — symlink everything from the host repo's
// node_modules EXCEPT @bjelser/{kit,core,cli}, which we point at the
// CURRENT WORKTREE's packages dir. Without this override the CLI's
// `resolvePackageEntry` (via `createRequire`) follows the host
// `node_modules/@bjelser/kit` → host `packages/kit/` symlink and the
// smoke renders against MAIN-branch code, not the worktree's edits.
const localNodeModules = join(SMOKE_ROOT, 'node_modules');
mkdirSync(localNodeModules, {recursive: true});
const {readdirSync} = await import('node:fs');
for (const name of readdirSync(HOST_NODE_MODULES)) {
  if (name === '@bjelser') continue;
  const src = join(HOST_NODE_MODULES, name);
  const dst = join(localNodeModules, name);
  if (existsSync(dst)) continue;
  symlinkSync(src, dst);
}
// Build @bjelser/* dir locally with the worktree's packages.
mkdirSync(join(localNodeModules, '@bjelser'), {recursive: true});
for (const pkg of ['kit', 'core', 'cli', 'agent']) {
  const src = join(REPO_ROOT, 'packages', pkg);
  if (!existsSync(src)) continue;
  symlinkSync(src, join(localNodeModules, '@bjelser', pkg));
}

writeFileSync(
  join(SMOKE_ROOT, 'package.json'),
  JSON.stringify(
    {
      name: 'docent-r5-words-smoke',
      private: true,
      type: 'module',
    },
    null,
    2,
  ),
);

// ---- 2. The film: one passage scene with simple text + 2 beats -----------

// Two beats so the scene runs long enough that a midpoint frame falls
// safely inside the second beat (when most of the words are revealed in
// the karaoke render). Resolution kept small for fast renders.
const film = {
  meta: {
    id: FILM_ID,
    title: 'R5 word-level timing smoke',
    voice: 'silence',
    tts: {provider: 'silence'},
    resolution: {width: 960, height: 540, fps: 30},
  },
  scenes: [
    {
      id: 'passage',
      type: 'passage',
      kicker: 'R5 // KARAOKE',
      heading: 'A short prose paragraph for the karaoke test',
      text: 'The quick brown fox jumps over the lazy dog.\nThen the dog wakes up and looks at the fox in surprise.\nThe fox laughs at the dog and runs away into the woods.',
      marks: [
        {
          id: 'mk-1',
          quote: 'The quick brown fox',
          note: 'the agent of the first sentence',
        },
        {
          id: 'mk-2',
          quote: 'lazy dog',
          note: 'the second character',
        },
      ],
      beats: [
        {
          id: 'b1',
          narration:
            'The quick brown fox jumps over the lazy dog. Watch how each word is highlighted as it is spoken.',
          reveal: ['mk-1'],
          focus: ['mk-1'],
          pace: 'normal',
        },
        {
          id: 'b2',
          narration:
            'Then the dog wakes up and looks at the fox in surprise. The fox laughs at the dog.',
          reveal: ['mk-2'],
          focus: ['mk-2'],
          pace: 'normal',
        },
      ],
    },
  ],
};
writeFileSync(
  join(SMOKE_ROOT, 'films', `${FILM_ID}.json`),
  JSON.stringify(film, null, 2),
);

// ---- 3. A custom TTS provider that returns words[] -----------------------

// We write a docent.config.ts that registers an inline silence provider
// AS WELL AS populates per-beat `words[]`. The provider honours
// `DOCENT_TTS_NO_WORDS=1` to suppress word timings — that gives us the
// karaoke-off baseline.
const configSource = `// docent.config.ts — registers the R5 smoke TTS provider.
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
    const wantWords = process.env.DOCENT_TTS_NO_WORDS !== '1';
    const wordList = wantWords ? splitWords(text, durationMs) : [];
    return {
      audio,
      mediaType: 'audio/wav',
      durationMs,
      alignment: wordList,
      alignmentSource: wordList.length > 0 ? 'native' : 'none',
      ...(wordList.length > 0 ? {words: wordList} : {}),
    };
  },
  async listVoices(): Promise<TtsVoice[]> {
    return [{id: 'silence', name: 'Silence', language: '*'}];
  },
};

const silencePlugin: TtsProviderPlugin = {
  kind: 'tts',
  name: 'r5-smoke-silence',
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
log(`  film: ${FILM_ID} — 1 passage scene, 2 beats`);

// ---- 4. Build twice -----------------------------------------------------

const wipeAudioCache = (): void => {
  const audioDir = join(SMOKE_ROOT, 'public', 'audio');
  // Don't recursively wipe public/audio (it's symlinked, shared) — only
  // wipe the per-film subdir.
  const filmAudio = join(audioDir, FILM_ID);
  if (existsSync(filmAudio)) {
    rmSync(filmAudio, {recursive: true, force: true});
  }
};

const runBuild = (label: string, env: Record<string, string>): string => {
  wipeAudioCache();
  const buildArgs = [
    'run',
    join(REPO_ROOT, 'packages/cli/src/index.ts'),
    'build',
    FILM_ID,
    '--scale=0.5',
    '--no-tts-cache',
  ];
  log(`▶ build ${label}: ${buildArgs.slice(3).join(' ')}`);
  const r = spawnSync('bun', buildArgs, {
    cwd: SMOKE_ROOT,
    env: {...process.env, ...env},
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    log(`✗ build ${label} failed with code ${r.status}`);
    process.exit(4);
  }
  const mp4 = join(SMOKE_ROOT, 'out', `${FILM_ID}.mp4`);
  if (!existsSync(mp4)) {
    log(`✗ expected mp4 at ${mp4} — not found`);
    process.exit(4);
  }
  // Move it to a labelled location before the next build overwrites.
  const dest = join(SMOKE_ROOT, 'out', `${FILM_ID}-${label}.mp4`);
  writeFileSync(dest, readFileSync(mp4));
  log(`✓ ${label} → ${dest} (${(statSync(dest).size / 1024).toFixed(1)} KB)`);
  return dest;
};

const karaokeMp4 = runBuild('karaoke', {});
// Snapshot the karaoke manifest so we can verify words were persisted.
const karaokeManifestPath = join(
  SMOKE_ROOT,
  'public',
  'audio',
  FILM_ID,
  'manifest.json',
);
let karaokeManifestWordCount = 0;
if (existsSync(karaokeManifestPath)) {
  try {
    const m = JSON.parse(readFileSync(karaokeManifestPath, 'utf-8'));
    for (const v of Object.values(m.beats ?? {}) as Array<{
      words?: ReadonlyArray<unknown>;
    }>) {
      if (Array.isArray(v?.words)) karaokeManifestWordCount += v.words!.length;
    }
    writeFileSync(
      join(SMOKE_ROOT, 'karaoke-manifest.json'),
      JSON.stringify(m, null, 2),
    );
    log(
      `▶ karaoke manifest: ${karaokeManifestWordCount} word timings persisted`,
    );
  } catch {
    log('⚠ karaoke manifest unreadable');
  }
}
// Also save the latest generated entry script — its inlined `ttsAudio`
// constant is the load-bearing payload the chromium-side render reads.
try {
  const tmpDir = join(SMOKE_ROOT, '.docent', 'tmp');
  const {readdirSync} = await import('node:fs');
  const entries = readdirSync(tmpDir)
    .filter((f) => f.startsWith(`render-entry-${FILM_ID}.`))
    .sort();
  const latest = entries[entries.length - 1];
  if (latest) {
    const src = readFileSync(join(tmpDir, latest), 'utf-8');
    writeFileSync(
      join(SMOKE_ROOT, 'karaoke-entry.tsx'),
      src,
    );
    const hasWords = src.includes('"words":');
    log(`▶ karaoke entry: ${latest} (inlines words=${hasWords})`);
  }
} catch (e) {
  log(`⚠ entry inspection failed: ${e instanceof Error ? e.message : e}`);
}
const staticMp4 = runBuild('static', {DOCENT_TTS_NO_WORDS: '1'});

// ---- 5. Extract one midpoint frame per build ----------------------------

const probeDur = (mp4: string): number => {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    mp4,
  ]).toString().trim();
  return parseFloat(out);
};

const durKaraoke = probeDur(karaokeMp4);
const durStatic = probeDur(staticMp4);
log(`▶ durations: karaoke=${durKaraoke.toFixed(2)}s static=${durStatic.toFixed(2)}s`);

// Take the midpoint of the shorter clip — guarantees both samples land
// inside the actual scene window even if the two clips ended up slightly
// different lengths.
const dur = Math.min(durKaraoke, durStatic);
const t = dur * 0.5;

const karaokePng = join(FRAMES_OUT, 'karaoke.png');
const staticPng = join(FRAMES_OUT, 'static.png');

for (const [mp4, png, label] of [
  [karaokeMp4, karaokePng, 'karaoke'],
  [staticMp4, staticPng, 'static'],
] as Array<[string, string, string]>) {
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', png],
    {stdio: 'pipe'},
  );
  if (r.status !== 0) {
    log(`✗ ffmpeg extract failed for ${label}: ${r.stderr.toString()}`);
    process.exit(4);
  }
  log(`✓ extracted ${label} frame at t=${t.toFixed(2)}s → ${png}`);
}

// ---- 6. Mean absolute pixel diff ----------------------------------------

// Compare against the PROSE REGION of each frame, not the full canvas.
// The kicker, heading and footer chrome are identical between the
// karaoke and static renders (by design) so including them dilutes the
// signal we actually care about — the prose body that the karaoke
// layer replaces. The crop targets the lower 60% of the frame, scaled
// to a fixed width.
const COMPARE_W = 480;
const decodeRgb24 = (path: string): Uint8Array => {
  const r = spawnSync(
    'ffmpeg',
    [
      '-v', 'error',
      '-i', path,
      // Crop the prose region — the band where the karaoke layer
      // visibly replaces the static-marks prose. We skip the upper
      // 40% (kicker + heading) and the bottom 15% (annotation row +
      // footer mono caption) so the comparison is over what the
      // karaoke actually affects.
      '-vf', `crop=iw:ih*0.45:0:ih*0.4,scale=${COMPARE_W}:-1`,
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      'pipe:1',
    ],
    {stdio: ['ignore', 'pipe', 'pipe']},
  );
  if (r.status !== 0) {
    throw new Error(`ffmpeg decode failed: ${r.stderr.toString()}`);
  }
  return new Uint8Array(r.stdout);
};

const a = decodeRgb24(karaokePng);
const b = decodeRgb24(staticPng);
if (a.length !== b.length) {
  log(`✗ raw frame sizes differ: ${a.length} vs ${b.length}`);
  process.exit(4);
}

let absSum = 0;
for (let i = 0; i < a.length; i++) absSum += Math.abs(a[i]! - b[i]!);
const meanAbsDiff = absSum / a.length / 255;
const pct = (meanAbsDiff * 100).toFixed(2);

log(`▶ mean absolute pixel diff: ${pct}% (target > 25%)`);

const transcript = {
  generatedAt: new Date().toISOString(),
  filmId: FILM_ID,
  smokeRoot: SMOKE_ROOT,
  builds: [
    {label: 'karaoke', mp4: karaokeMp4, duration: durKaraoke, env: {}},
    {
      label: 'static',
      mp4: staticMp4,
      duration: durStatic,
      env: {DOCENT_TTS_NO_WORDS: '1'},
    },
  ],
  midpointSeconds: t,
  comparison: {
    method:
      'mean abs pixel diff over the prose-region crop (crop=iw:ih*0.45:0:ih*0.4,scale=480:-1), rgb24',
    threshold: 0.25,
    observed: meanAbsDiff,
    observedPct: pct,
    pass: meanAbsDiff > 0.25,
  },
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
log(`▶ transcript: ${transcriptPath}`);

if (meanAbsDiff > 0.25) {
  log(`✓ SMOKE OK — karaoke render differs from static (${pct}% > 25%)`);
  process.exit(0);
} else {
  log(`✗ SMOKE FAIL — karaoke render too close to static (${pct}% <= 25%)`);
  process.exit(2);
}
