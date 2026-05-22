// The build cascade: validate → tts → clips → render. Each stage is decoupled
// and individually cached. Supersedes the old pipeline/build.ts; resolves every
// path absolutely so it runs correctly from any working directory.

import {$} from 'bun';
import {existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT, paths} from './paths';
import {validateSpec} from './validate';

const cascadeEnv = {...process.env, DOCENT_ROOT: REPO_ROOT};

export type CascadeOpts = {
  film: string;
  still?: number;
  skipTts?: boolean;
  scale?: number;
  concurrency?: number;
};

export type CascadeResult = {
  film: string;
  output: string;
  stages: {name: string; seconds: number}[];
};

const step = async <T>(label: string, run: () => Promise<T>): Promise<{result: T; seconds: number}> => {
  const t0 = performance.now();
  process.stdout.write(`\x1b[36m▶ ${label}\x1b[0m\n`);
  const result = await run();
  const seconds = (performance.now() - t0) / 1000;
  process.stdout.write(`\x1b[32m✔ ${label}\x1b[0m  ${seconds.toFixed(1)}s\n`);
  return {result, seconds};
};

export const runCascade = async (opts: CascadeOpts): Promise<CascadeResult> => {
  const {film} = opts;
  const specPath = join(paths.films, `${film}.json`);
  if (!existsSync(specPath)) {
    throw new Error(`films/${film}.json not found — author the spec first.`);
  }

  // The spec contract — the engine refuses to render a malformed film.
  const spec = await Bun.file(specPath).json();
  const issues = validateSpec(spec);
  if (issues.length) {
    throw new Error(
      `spec films/${film}.json fails the contract:\n` +
        issues.map((i) => `  ✗ ${i.path || '(root)'}: ${i.message}`).join('\n'),
    );
  }

  const stages: {name: string; seconds: number}[] = [];

  if (!opts.skipTts) {
    const {seconds} = await step('narration · Kokoro TTS', async () => {
      await $`uv run python ${paths.ttsScript} --film ${film}`.cwd(REPO_ROOT).env(cascadeEnv);
    });
    stages.push({name: 'tts', seconds});
  }

  if (existsSync(join(paths.manim, film))) {
    const {seconds} = await step('clips · Manim inserts', async () => {
      await $`uv run python ${paths.clipsScript} --film ${film}`.cwd(REPO_ROOT).env(cascadeEnv);
    });
    stages.push({name: 'clips', seconds});
  }

  mkdirSync(paths.out, {recursive: true});
  const concurrency = String(opts.concurrency ?? 8);

  if (opts.still !== undefined) {
    const output = join(paths.out, `${film}-still.png`);
    const {seconds} = await step(`still · frame ${opts.still}`, async () => {
      await $`${paths.remotionBin} still ${paths.entry} ${film} ${output} --frame=${opts.still} --public-dir=${paths.publicDir}`
        .cwd(REPO_ROOT)
        .env(cascadeEnv);
    });
    stages.push({name: 'still', seconds});
    return {film, output, stages};
  }

  const output = join(paths.out, `${film}.mp4`);
  const scaleArg = opts.scale ? [`--scale=${opts.scale}`] : [];
  const {seconds} = await step('render · Remotion (frame-parallel)', async () => {
    await $`${paths.remotionBin} render ${paths.entry} ${film} ${output} --concurrency=${concurrency} --public-dir=${paths.publicDir} ${scaleArg}`
      .cwd(REPO_ROOT)
      .env(cascadeEnv);
  });
  stages.push({name: 'render', seconds});
  return {film, output, stages};
};
