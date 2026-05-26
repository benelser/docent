// The build cascade: validate → tts → clips → render. Each stage is decoupled
// and individually cached. Supersedes the old pipeline/build.ts; resolves every
// path absolutely so it runs correctly from any working directory.

import {$} from 'bun';
import {existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {ENGINE_ROOT, REPO_ROOT, paths} from './paths';
import {validateSpec} from './validate';
import {validateTts} from './validate-tts';
import {runDepthCheck, depthSummary} from './depthcheck';
import {resolveStyle, StyleValidationError} from '../src/style';
import {runTtsStage} from './tts-stage';

const cascadeEnv = {...process.env, DOCENT_ROOT: REPO_ROOT};

export type CascadeOpts = {
  film: string;
  still?: number;
  skipTts?: boolean;
  scale?: number;
  concurrency?: number;
  // When true (also honored from DOCENT_DEBUG=1), the cascade prints the
  // resolved style as one-line JSON at the start of the render stage. This
  // is the "loggable" acceptance criterion of the styling pipeline.
  debug?: boolean;
};

export type CascadeResult = {
  film: string;
  output: string;
  stages: {name: string; seconds: number}[];
  // The resolved style for this run. The render-time consumers (Card,
  // SceneFrame, etc.) don't read this yet — the migration is the next sprint.
  // Surfaced here so a caller (e.g. a sub-process orchestrator) can log it.
  style?: ReturnType<typeof resolveStyle>;
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

  // Auto-regen the films registry so Remotion's bundler always sees the
  // current films/ on disk. Without this, `docent build` fails on a fresh
  // checkout if the committed films.generated.ts references a spec that
  // got renamed, deleted, or never tracked.
  const genScript = join(ENGINE_ROOT, 'cli', 'gen-registry.ts');
  if (existsSync(genScript)) {
    await $`bun ${genScript}`.cwd(REPO_ROOT).env(cascadeEnv).quiet();
  }

  // The spec contract — the engine refuses to render a malformed film.
  const spec = await Bun.file(specPath).json();
  const issues = validateSpec(spec);
  const hardFails = issues.filter((i) => i.severity !== 'warning');
  const warnings = issues.filter((i) => i.severity === 'warning');
  if (hardFails.length) {
    throw new Error(
      `spec films/${film}.json fails the contract:\n` +
        hardFails.map((i) => `  ✗ ${i.path || '(root)'}: ${i.message}`).join('\n'),
    );
  }
  if (warnings.length) {
    process.stdout.write(
      `\x1b[33m⚠ ${warnings.length} spec warning(s) — render proceeds (resolveLayout handles the visual):\x1b[0m\n` +
        warnings
          .map((i) => `  \x1b[33m⚠\x1b[0m ${i.path || '(root)'}: ${i.message}`)
          .join('\n') +
        '\n',
    );
  }

  // The style pipeline — resolveStyle(spec.style) is the only call site that
  // turns raw style input into a ResolvedStyle the renderer surface can read.
  // For the byte-identical backward-compat contract: when `spec.style` is
  // undefined (every film in the gallery today), this resolves to neutral
  // tokens — the same values theme.ts ships.
  //
  // Today this resolution is inert: the renderer migration is a follow-on
  // sprint. The cascade computes it, logs it in --debug, and otherwise carries
  // it as a side-effect-free precondition (it will throw on contract failure
  // BEFORE the slow render burns minutes).
  let resolvedStyle;
  try {
    resolvedStyle = resolveStyle(spec.style);
  } catch (e) {
    if (e instanceof StyleValidationError) {
      throw new Error(
        `spec films/${film}.json fails the style contract:\n` +
          e.details.map((d) => `  ✗ [${d.code}] ${d.path}: ${d.message}`).join('\n'),
      );
    }
    throw e;
  }
  const debug = opts.debug ?? process.env.DOCENT_DEBUG === '1';
  if (debug) {
    process.stdout.write(
      `\x1b[90mstyle resolved\x1b[0m ${JSON.stringify(resolvedStyle)}\n`,
    );
  }

  // Layer 2 of depth enforcement — a visible, non-blocking depth report on
  // every build. `docent depthcheck <film>` gives the full breakdown.
  const ds = depthSummary(runDepthCheck(spec));
  process.stdout.write(
    ds.fail > 0
      ? `\x1b[33m⚠ depth: ${ds.fail} fail · ${ds.warn} warn — run: docent depthcheck ${film}\x1b[0m\n`
      : `\x1b[32m✓ depth: contract met\x1b[0m  ${ds.ok}/${ds.total}${ds.warn ? ` · ${ds.warn} warn` : ''}\n`,
  );

  const stages: {name: string; seconds: number}[] = [];

  if (!opts.skipTts) {
    // TTS validation — registry-aware. Hard-fail on unknown provider /
    // unknown voice; warn (or hard-fail in strict mode) on capability
    // mismatches. The structural validation above caught shape problems on
    // meta.tts; this catches "the provider id you named doesn't exist".
    const ttsValid = await validateTts(spec);
    if (ttsValid.issues.length > 0) {
      throw new Error(
        `spec films/${film}.json fails the TTS contract:\n` +
          ttsValid.issues.map((i) => `  ✗ ${i.path || '(root)'}: ${i.message}`).join('\n'),
      );
    }
    if (ttsValid.warnings.length > 0) {
      process.stderr.write(
        `\x1b[33m⚠ ${ttsValid.warnings.length} TTS capability warning(s):\x1b[0m\n` +
          ttsValid.warnings
            .map((w) => `  \x1b[33m⚠\x1b[0m ${w.path || '(root)'}: ${w.message}`)
            .join('\n') +
          '\n',
      );
    }
    const label = `narration · ${ttsValid.providerId} TTS`;
    const {seconds} = await step(label, async () => {
      await runTtsStage({film});
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
    return {film, output, stages, style: resolvedStyle};
  }

  const output = join(paths.out, `${film}.mp4`);
  const scaleArg = opts.scale ? [`--scale=${opts.scale}`] : [];
  // Retry the render once on transient failures. Remotion's headless
  // browser fetches Google Fonts on first render of a spec using a new
  // font (e.g. Caveat for sketch/whiteboard treatments); a network blip
  // mid-fetch produces a 30 s setup timeout and kills a 10+ minute render
  // that was ~80 % done. After the first successful fetch the font is
  // cached and the retry succeeds instantly.
  const renderOnce = async () => {
    await $`${paths.remotionBin} render ${paths.entry} ${film} ${output} --concurrency=${concurrency} --public-dir=${paths.publicDir} ${scaleArg}`
      .cwd(REPO_ROOT)
      .env(cascadeEnv);
  };
  const {seconds} = await step('render · Remotion (frame-parallel)', async () => {
    try {
      await renderOnce();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isTransient =
        /ERR_NETWORK_CHANGED|setting up the headless browser|timed out|ECONNRESET|ETIMEDOUT/i.test(msg);
      if (!isTransient) throw e;
      process.stdout.write(
        `\x1b[33m⚠ render failed with a transient error — retrying once\x1b[0m\n` +
          `  ${msg.split('\n')[0]}\n`,
      );
      await renderOnce();
    }
  });
  stages.push({name: 'render', seconds});
  return {film, output, stages, style: resolvedStyle};
};
