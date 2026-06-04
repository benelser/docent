// Smoke test for R10 #2 — loudness normalization (LUFS).
//
// Validates the KPI: the rendered audio measures within ±0.5 LU of the
// declared --lufs target. Repeated against three Hollywood-mandate
// targets — streaming (-16), broadcast (-23), youtube (-14).
//
// METHOD
//   1. Spin up a hermetic dogfood project at /tmp/docent-r10-lufs-smoke/.
//      Mirrors the R8 pattern: symlinks for packages + node_modules,
//      films/ with one 2-scene film, docent.config.ts with a built-in
//      tone-TTS provider (so the audio carries real signal — silence
//      cannot be normalized to a target loudness).
//   2. Synthesize the music asset: a 60 s pink-noise file via ffmpeg. The
//      noise carries broadband signal so the LUFS measurement against
//      the music bed alone is non-degenerate.
//   3. For each target ∈ {-16, -23, -14}:
//        a. `docent build <id> --lufs <target>`
//        b. Read the produced `out/<id>-lufs-<suffix>.mp4`
//        c. `docent loudness <id> --variant <preset>` to confirm the
//           file's integrated reading sits within ±0.5 LU of target.
//   4. Write a transcript with the measured numbers.
//
// Exit codes: 0 PASS, 1 setup error, 2 KPI violation, 4 build / ffmpeg failure.

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

// ---- 1. Hermetic dogfood project layout ----------------------------------

const SMOKE_ROOT = '/tmp/docent-r10-lufs-smoke';
const FILM_ID = 'r10-lufs';

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
    {name: 'docent-r10-lufs-smoke', private: true, type: 'module'},
    null,
    2,
  ),
);

// ---- 2. The music asset: 60 s pink noise at -20 dBFS --------------------
//
// Pink noise gives loudnorm meaningful broadband signal at the bed level.
// Pure silence + per-beat narration is enough to break the test (a near-
// silent audio bed measures near -inf LUFS, and the integrated value is
// dominated by whatever narration signal there is). Pink at -20 dBFS
// gives a non-degenerate base for the LUFS round-trip.

const tonePath = join(SMOKE_ROOT, 'public', 'audio', 'pink.wav');
log(`▶ generating 60s pink-noise bed → ${tonePath}`);
{
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', 'anoisesrc=color=pink:duration=60:sample_rate=48000',
      '-filter:a', 'volume=-20dB',
      '-c:a', 'pcm_s16le',
      tonePath,
    ],
    {stdio: 'pipe'},
  );
  if (r.status !== 0) {
    log(`✗ ffmpeg pink-noise generation failed: ${r.stderr.toString()}`);
    process.exit(4);
  }
}

// ---- 3. The film: a 2-scene spec with several narration beats -----------
//
// Multiple beats over a few seconds — the integrated loudness is more
// stable over a longer signal. Each beat gets short narration so the
// custom tone-TTS provider returns ~1.5 s clips.

const film = {
  meta: {
    id: FILM_ID,
    title: 'R10 LUFS smoke',
    voice: 'tone',
    music: 'pink.wav',
    tts: {provider: 'tone'},
    resolution: {width: 960, height: 540, fps: 30},
  },
  scenes: [
    {
      id: 'frame',
      type: 'frame',
      kicker: 'R10 // LUFS',
      title: 'Loudness round-trip',
      subtitle: 'a smoke test',
      beats: [
        {narration: 'first beat of the loudness smoke', pace: 'normal'},
        {narration: 'second beat of the loudness smoke', pace: 'normal'},
        {narration: 'third beat of the loudness smoke', pace: 'normal'},
      ],
    },
    {
      id: 'recap',
      type: 'recap',
      kicker: 'R10 // END',
      title: 'A recap',
      points: ['one', 'two', 'three'],
      beats: [
        {narration: 'fourth beat closing the smoke', pace: 'normal'},
        {narration: 'fifth beat closing the smoke', pace: 'normal'},
      ],
    },
  ],
};
writeFileSync(
  join(SMOKE_ROOT, 'films', `${FILM_ID}.json`),
  JSON.stringify(film, null, 2),
);

// Tone-TTS provider: returns an AUDIBLE sine tone (220 Hz at -16 dBFS)
// shaped to word count. Loudnorm cannot normalize a silent file to a
// loudness target; an audible signal lets the round-trip KPI be real.
// Inline because importing kokoro-js would require model-load
// (~30 s + 200 MB), which we don't need to validate the ffmpeg
// loudnorm contract.

const configSource = `// docent.config.ts — R10 LUFS smoke tone TTS provider.
import type {
  TtsCapabilities,
  TtsProvider,
  TtsProviderContext,
  TtsProviderPlugin,
  TtsSynthesisOptions,
  TtsSynthesisResult,
  TtsVoice,
} from '@bjelser/kit';

const buildToneWav = (seconds: number, frequencyHz: number, amplitude: number): Uint8Array => {
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
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // 5ms fade-in/out to suppress click artefacts.
    const fade = Math.min(1, t / 0.005, (seconds - t) / 0.005);
    const s = Math.sin(2 * Math.PI * frequencyHz * t) * amplitude * Math.max(0, fade);
    const clamped = Math.max(-1, Math.min(1, s));
    view.setInt16(offset + i * 2, Math.round(clamped * 32767), true);
  }
  return new Uint8Array(buf);
};

const caps: TtsCapabilities = {
  nativeAlignment: 'none',
  streaming: false,
  ssml: false,
  voiceCloning: false,
  local: true,
};

const provider: TtsProvider = {
  id: 'tone',
  capabilities: caps,
  async synth(text: string, _options: TtsSynthesisOptions): Promise<TtsSynthesisResult> {
    const words = text.trim().split(/\\s+/).filter(Boolean).length;
    const seconds = Math.max(1, words / (160 / 60));
    // 220 Hz @ -16 dBFS — amplitude 0.158. Gives the TTS track a
    // measurable LUFS contribution without overwhelming the bed.
    const audio = buildToneWav(seconds, 220, 0.158);
    return {
      audio,
      mediaType: 'audio/wav',
      durationMs: Math.round(seconds * 1000),
      alignment: [],
      alignmentSource: 'estimated',
    };
  },
  async listVoices(): Promise<TtsVoice[]> {
    return [{id: 'tone', name: 'Tone', language: '*'}];
  },
};

const tonePlugin: TtsProviderPlugin = {
  kind: 'tts',
  name: 'r10-smoke-tone',
  version: '0.1.0',
  providerId: 'tone',
  capabilities: caps,
  async create(_ctx: TtsProviderContext): Promise<TtsProvider> {
    return provider;
  },
};

export default {plugins: [tonePlugin]};
`;
writeFileSync(join(SMOKE_ROOT, 'docent.config.ts'), configSource);

log(`▶ wrote hermetic project at ${SMOKE_ROOT}`);
log(`  film: ${FILM_ID} — 2 scenes, tone-TTS narration, pink-noise music bed`);

// ---- 4. Round-trip per target -------------------------------------------

interface TargetReport {
  readonly target: number;
  readonly preset?: string;
  readonly normalizedPath: string;
  readonly measured: number;
  readonly drift: number;
  readonly ok: boolean;
}

const targets: ReadonlyArray<{readonly value: number; readonly preset?: string}> = [
  {value: -16, preset: 'streaming'},
  {value: -23, preset: 'broadcast'},
  {value: -14, preset: 'youtube'},
];

const reports: TargetReport[] = [];

for (const t of targets) {
  log('');
  log(`\x1b[36m═══ target ${t.value} LUFS (${t.preset ?? 'numeric'}) ═══\x1b[0m`);

  // Build with `--lufs <preset>` so the preset-resolver path is exercised.
  // `--no-tts-cache` so each target's render is independent (same audio,
  // but no chance of cache aliasing between runs).
  const buildArgs = [
    'run',
    join(REPO_ROOT, 'packages/cli/src/index.ts'),
    'build',
    FILM_ID,
    '--scale=0.5',
    '--no-tts-cache',
    '--lufs',
    t.preset ?? String(t.value),
  ];
  log(`▶ build: ${buildArgs.slice(3).join(' ')}`);
  const buildRes = spawnSync('bun', buildArgs, {
    cwd: SMOKE_ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  if (buildRes.status !== 0) {
    log(`✗ build failed with code ${buildRes.status}`);
    process.exit(4);
  }

  // Suffix mirrors `buildNormalizedOutPath`: -lufs-n<abs> for negatives.
  const tt = Math.round(t.value * 10) / 10;
  const abs = Math.abs(tt).toString().replace('.', '_');
  const sign = tt < 0 ? 'n' : '';
  const normalizedPath = join(SMOKE_ROOT, 'out', `${FILM_ID}-lufs-${sign}${abs}.mp4`);
  if (!existsSync(normalizedPath)) {
    log(`✗ expected normalized mp4 at ${normalizedPath} — not found`);
    process.exit(4);
  }
  log(`  → ${normalizedPath} (${(statSync(normalizedPath).size / 1024).toFixed(1)} KB)`);

  // Measure the produced file with the audit command (single-pass
  // loudnorm). Use --json so we can grep the number cleanly.
  const auditArgs = [
    'run',
    join(REPO_ROOT, 'packages/cli/src/index.ts'),
    'loudness',
    FILM_ID,
    '--variant',
    t.preset ?? String(t.value),
    '--json',
  ];
  log(`▶ audit: docent loudness ${FILM_ID} --variant ${t.preset ?? t.value} --json`);
  const auditRes = spawnSync('bun', auditArgs, {
    cwd: SMOKE_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (auditRes.status !== 0) {
    log(`✗ audit failed with code ${auditRes.status}`);
    process.exit(4);
  }
  const audit = JSON.parse(auditRes.stdout.toString('utf-8')) as {
    measurement: {
      integrated: number;
      loudnessRange: number;
      truePeak: number;
      threshold: number;
    };
  };
  const measured = audit.measurement.integrated;
  const drift = measured - t.value;
  const ok = Math.abs(drift) <= 0.5;
  log(
    `  measured ${measured.toFixed(2)} LUFS · drift ${drift >= 0 ? '+' : ''}${drift.toFixed(2)} LU · ` +
      `tp ${audit.measurement.truePeak.toFixed(2)} dBTP`,
  );
  log(
    ok
      ? `  \x1b[32m✓ within ±0.5 LU of target\x1b[0m`
      : `  \x1b[31m✗ exceeded ±0.5 LU bound\x1b[0m`,
  );
  reports.push({
    target: t.value,
    ...(t.preset !== undefined ? {preset: t.preset} : {}),
    normalizedPath,
    measured,
    drift,
    ok,
  });
}

// ---- 5. Verdict + transcript --------------------------------------------

log('');
log(`\x1b[36m═══ R10 LUFS round-trip verdict ═══\x1b[0m`);
const failed = reports.filter((r) => !r.ok);
for (const r of reports) {
  const tag = r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  log(
    `  ${tag} target ${r.target.toString().padStart(4)} LUFS (${r.preset ?? '-'.padEnd(9)})` +
      `  measured ${r.measured.toFixed(2)}  drift ${r.drift >= 0 ? '+' : ''}${r.drift.toFixed(2)} LU`,
  );
}

const transcript = {
  smoke: 'r10-lufs',
  root: SMOKE_ROOT,
  filmId: FILM_ID,
  kpi: '±0.5 LU drift from declared --lufs target',
  reports,
  passed: failed.length === 0,
  generatedAt: new Date().toISOString(),
};
const transcriptPath = join(SMOKE_ROOT, 'transcript.json');
writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
log('');
log(`▶ transcript → ${transcriptPath}`);

if (failed.length > 0) {
  log(`\x1b[31m✗ ${failed.length}/${reports.length} target(s) drifted > 0.5 LU\x1b[0m`);
  process.exit(2);
}
log(`\x1b[32m✓ all ${reports.length} targets within ±0.5 LU\x1b[0m`);
process.exit(0);
