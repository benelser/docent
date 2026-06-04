// Smoke test for R3 — archetype × visual variant.
//
// Validates the end-to-end claim: a scene tagged `provocation × bold` and
// a copy of the same scene tagged `mirror × minimal` produce visually
// distinct frames at the same beat offset.
//
// METHOD
//   1. Spin up a hermetic dogfood project at /tmp/docent-r3-variant-smoke/
//      with a films/ dir containing one film. The film has TWO `frame`
//      scenes: scene 0 tagged provocation/bold; scene 1 tagged
//      mirror/minimal. Same title, same tagline.
//   2. Symlink the worktree's remotion.config.ts + node_modules so the
//      hermetic project can reach the variant-aware components.
//   3. Run `docent build` with --skip-tts (silent mp4, fast path).
//   4. Use ffmpeg to extract one frame from the midpoint of each scene
//      (the two scenes share the same duration, so the midpoint is
//      easy: scene 1's midpoint is at sceneFrames * 1.5 / fps).
//   5. Read both PNGs as raw rgb24 bytes, compute mean absolute pixel
//      difference normalized to [0, 1].
//   6. Assert > 15%. Below that threshold means the variant tokens are
//      NOT actually changing the render — a regression.
//
// Exit codes: 0 PASS, 1 setup error, 2 diff under threshold, 4 build /
// ffmpeg failure.

import {execFileSync, spawnSync} from 'node:child_process';
import {
  cpSync,
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

const SMOKE_ROOT = '/tmp/docent-r3-variant-smoke';
const FILM_ID = 'r3-variant';
const FRAMES_OUT = join(SMOKE_ROOT, 'frames');

// Wipe and re-create — the smoke is hermetic, no stale state.
if (existsSync(SMOKE_ROOT)) rmSync(SMOKE_ROOT, {recursive: true, force: true});
mkdirSync(SMOKE_ROOT, {recursive: true});
mkdirSync(join(SMOKE_ROOT, 'films'), {recursive: true});
mkdirSync(FRAMES_OUT, {recursive: true});

// Overlay-local-source pattern: symlink the worktree's packages/ and
// node_modules/ into the hermetic root so the CLI resolves modules
// exactly the same way it would in a developer's checkout.
const SYMLINKS = ['packages', 'node_modules', 'remotion.config.ts', 'bunfig.toml', 'tsconfig.json', 'public'];
for (const name of SYMLINKS) {
  const src = join(REPO_ROOT, name);
  if (!existsSync(src)) continue;
  symlinkSync(src, join(SMOKE_ROOT, name));
}

// Write a minimal package.json + docent.config.ts shim so the CLI's
// engine factory loads @bjelser/core without trying to evaluate
// docent's own config.
writeFileSync(
  join(SMOKE_ROOT, 'package.json'),
  JSON.stringify(
    {
      name: 'docent-r3-variant-smoke',
      private: true,
      type: 'module',
    },
    null,
    2,
  ),
);

// ---- 2. The film with two variants of the same scene ---------------------

// One film, two `frame` scenes — same content, different tags. Each gets
// 2 seconds at 30fps so the midpoint is well-defined.
const film = {
  meta: {
    id: FILM_ID,
    title: 'R3 archetype × variant smoke',
    voice: 'af_heart',
    resolution: {width: 960, height: 540, fps: 30},
  },
  scenes: [
    {
      id: 'frame-bold',
      type: 'frame',
      archetype: 'provocation',
      variant: 'bold',
      kicker: 'BOLD KICKER · PROVOCATION',
      title: 'A hostile runtime',
      tagline: 'Everything is a process; nothing is a guarantee.',
      beats: [
        {id: 'b1', narration: '', show: 'title', pace: 'hold'},
        {id: 'b2', narration: '', show: 'tagline', pace: 'hold'},
      ],
    },
    {
      id: 'frame-minimal',
      type: 'frame',
      archetype: 'mirror',
      variant: 'minimal',
      kicker: 'MINIMAL KICKER · MIRROR',
      title: 'A hostile runtime',
      tagline: 'Everything is a process; nothing is a guarantee.',
      beats: [
        {id: 'b3', narration: '', show: 'title', pace: 'hold'},
        {id: 'b4', narration: '', show: 'tagline', pace: 'hold'},
      ],
    },
  ],
};
writeFileSync(
  join(SMOKE_ROOT, 'films', `${FILM_ID}.json`),
  JSON.stringify(film, null, 2),
);

log(`▶ wrote hermetic project at ${SMOKE_ROOT}`);
log(`  film: ${FILM_ID} — 2 frame scenes (provocation/bold + mirror/minimal)`);

// ---- 3. Render via `docent build --skip-tts` -----------------------------

const buildEnv = {
  ...process.env,
  // The film is hermetic so don't reach out for TTS network calls.
};

const buildArgs = [
  'run',
  join(REPO_ROOT, 'packages/cli/src/index.ts'),
  'build',
  FILM_ID,
  '--skip-tts',
  '--scale=0.5',
];

log(`▶ docent build ${FILM_ID} --skip-tts --scale=0.5`);
const buildResult = spawnSync('bun', buildArgs, {
  cwd: SMOKE_ROOT,
  env: buildEnv,
  stdio: 'inherit',
});

if (buildResult.status !== 0) {
  log(`✗ docent build failed with code ${buildResult.status}`);
  process.exit(4);
}

const mp4Path = join(SMOKE_ROOT, 'out', `${FILM_ID}.mp4`);
if (!existsSync(mp4Path)) {
  log(`✗ expected mp4 at ${mp4Path} — not found`);
  process.exit(4);
}
const sz = statSync(mp4Path).size;
log(`✓ rendered mp4 at ${mp4Path} (${(sz / 1024).toFixed(1)} KB)`);

// ---- 4. Extract one frame per scene at scene midpoint --------------------

// Determine the per-scene window from the spec. With --skip-tts each beat
// uses its pace-default duration (hold ≈ 5s at 30fps = 150 frames). With
// 2 beats per scene, each scene ≈ 300 frames = 10s.
//
// We could compute this exactly via buildFrameSchedule from the kit, but
// the simpler ground truth is: ffprobe the mp4 duration, halve it. With
// 2 scenes of identical content (only the tag differs), midpoint of
// scene 0 is mp4_duration * 0.25; midpoint of scene 1 is * 0.75.

const ffprobeOut = execFileSync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'format=duration',
  '-of', 'default=noprint_wrappers=1:nokey=1',
  mp4Path,
]).toString().trim();
const totalSeconds = parseFloat(ffprobeOut);
if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
  log(`✗ ffprobe returned invalid duration: ${ffprobeOut}`);
  process.exit(4);
}
log(`▶ mp4 duration: ${totalSeconds.toFixed(2)}s`);

const t0 = totalSeconds * 0.25; // scene 0 (bold provocation) midpoint
const t1 = totalSeconds * 0.75; // scene 1 (minimal mirror) midpoint

const bold = join(FRAMES_OUT, 'bold.png');
const minimal = join(FRAMES_OUT, 'minimal.png');

for (const [t, out, label] of [
  [t0, bold, 'bold/provocation'],
  [t1, minimal, 'minimal/mirror'],
] as Array<[number, string, string]>) {
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-ss', String(t), '-i', mp4Path, '-frames:v', '1', out],
    {stdio: 'pipe'},
  );
  if (r.status !== 0) {
    log(`✗ ffmpeg extract failed for ${label}: ${r.stderr.toString()}`);
    process.exit(4);
  }
  log(`✓ extracted ${label} frame at t=${t.toFixed(2)}s → ${out}`);
}

// ---- 5. Mean absolute pixel diff -----------------------------------------

// Decode both pngs as raw rgb24 of identical width via ffmpeg piping.
const COMPARE_W = 480;

const decodeRgb24 = (path: string): Uint8Array => {
  const r = spawnSync(
    'ffmpeg',
    [
      '-v', 'error',
      '-i', path,
      '-vf', `scale=${COMPARE_W}:-1`,
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

const a = decodeRgb24(bold);
const b = decodeRgb24(minimal);
if (a.length !== b.length) {
  log(`✗ raw frame sizes differ: ${a.length} vs ${b.length}`);
  process.exit(4);
}

let absSum = 0;
for (let i = 0; i < a.length; i++) absSum += Math.abs(a[i]! - b[i]!);
const meanAbsDiff = absSum / a.length / 255;
const pct = (meanAbsDiff * 100).toFixed(2);

log(`▶ mean absolute pixel diff: ${pct}% (target > 15%)`);

const transcript = {
  generatedAt: new Date().toISOString(),
  filmId: FILM_ID,
  smokeRoot: SMOKE_ROOT,
  scenes: [
    {
      sceneIndex: 0,
      tag: 'provocation × bold',
      midpointSeconds: t0,
      frameOut: bold,
    },
    {
      sceneIndex: 1,
      tag: 'mirror × minimal',
      midpointSeconds: t1,
      frameOut: minimal,
    },
  ],
  comparison: {
    method: 'mean absolute pixel diff after rgb24 scale to width 480',
    threshold: 0.15,
    observed: meanAbsDiff,
    observedPct: pct,
    pass: meanAbsDiff > 0.15,
  },
  versions: {
    kit: JSON.parse(readFileSync(join(REPO_ROOT, 'packages/kit/package.json'), 'utf-8')).version,
    core: JSON.parse(readFileSync(join(REPO_ROOT, 'packages/core/package.json'), 'utf-8')).version,
  },
};

const transcriptPath = join(SMOKE_ROOT, 'transcript.json');
writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
log(`▶ transcript: ${transcriptPath}`);

if (meanAbsDiff > 0.15) {
  log(`✓ SMOKE OK — variant tokens DO change the render (${pct}% > 15%)`);
  process.exit(0);
} else {
  log(`✗ SMOKE FAIL — variant tokens are NOT changing the render (${pct}% <= 15%)`);
  process.exit(2);
}
