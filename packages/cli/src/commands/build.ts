// `docent build <film-id>` — render a film to MP4.
//
// Wires together: createEngine (core + user config) → load spec from
// films/<id>.json → generate per-render entry → engine.render. The render
// stage shells to `remotion render` against the generated entry; output
// lands under <cwd>/out/<id>.mp4.

import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

import {createEngine} from '../engine-factory';
import {generateRenderEntry} from '../render-entry';
import type {FilmSpec} from '@docent/kit';

/**
 * Walk up from `start` to find the dir containing a `remotion.config.{ts,js,mjs}`.
 * Remotion's CLI uses cwd to locate this file; we run the render subprocess
 * with cwd set to wherever the config lives so the webpack overrides
 * (.js → .tsx alias, node externals) apply uniformly across packages.
 */
const findRemotionRoot = (start: string): string | null => {
  let dir = resolve(start);
  for (let i = 0; i < 12; i++) {
    for (const name of [
      'remotion.config.ts',
      'remotion.config.tsx',
      'remotion.config.js',
      'remotion.config.mjs',
    ]) {
      if (existsSync(join(dir, name))) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
};

export interface BuildArgs {
  /** Film id (the basename of films/<id>.json). */
  readonly filmId: string;
  /** Override the films/ root (defaults to <cwd>/films). */
  readonly filmsDir?: string;
  /** Output dir override. */
  readonly outputDir?: string;
  /** Render scale (e.g. 0.5). */
  readonly scale?: number;
  /** Render concurrency. */
  readonly concurrency?: number;
  /** Render a single still frame. */
  readonly still?: number;
  /** Skip the TTS stage; produce a silent mp4. */
  readonly skipTts?: boolean;
  /** Override the project root for entry-file generation + config lookup. */
  readonly projectRoot?: string;
}

const log = (s: string) => process.stdout.write(`${s}\n`);

export const runBuild = async (args: BuildArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const specPath = resolve(filmsDir, `${args.filmId}.json`);

  if (!existsSync(specPath)) {
    log(`\x1b[31m✗ films/${args.filmId}.json not found at ${specPath}\x1b[0m`);
    log(`  Set --films-dir to override, or author the spec first.`);
    return 1;
  }

  const spec: FilmSpec = JSON.parse(readFileSync(specPath, 'utf-8'));

  log(`\x1b[36m▶ docent build ${args.filmId}\x1b[0m`);
  const {engine, configPath, userPlugins} = await createEngine(projectRoot);
  log(
    `  engine: ${engine.scenes.all().length} scenes · ${engine.presets.all().length} presets · ` +
      `${engine.tts.all().length} tts · ${engine.features.all().length} features` +
      (configPath ? ` (+${userPlugins.length} from ${configPath})` : ''),
  );

  // Pre-validate so a structural failure surfaces BEFORE the slow render.
  const issues = engine.validate(spec);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    log(`\x1b[31m✗ spec validation failed:\x1b[0m`);
    for (const e of errors) log(`  ✗ ${e.path || '(root)'}: ${e.message}`);
    return 2;
  }
  if (issues.length > 0) {
    log(`\x1b[33m⚠ ${issues.length} validation warning(s)\x1b[0m`);
  }

  // Generate a fresh entry script. Lives under <projectRoot>/.docent/tmp/;
  // overwritten on each render.
  const entryPath = await generateRenderEntry({
    specPath,
    configPath,
    filmId: args.filmId,
    projectRoot,
    userPlugins,
  });

  log(`  entry: ${entryPath}`);

  // The remotion render subprocess needs cwd set to the dir owning
  // remotion.config.ts. Walk up from the project root looking for one;
  // fall back to projectRoot if we can't find it (the user can still drop
  // a config at projectRoot).
  const remotionRoot = findRemotionRoot(projectRoot) ?? projectRoot;
  if (remotionRoot !== projectRoot) {
    log(`  remotion-config: ${join(remotionRoot, 'remotion.config.*')}`);
  }

  try {
    const result = await engine.render(spec, {
      entryPath,
      outputDir: args.outputDir ?? join(projectRoot, 'out'),
      renderCwd: remotionRoot,
      ...(args.scale !== undefined ? {scale: args.scale} : {}),
      ...(args.concurrency !== undefined ? {concurrency: args.concurrency} : {}),
      ...(args.still !== undefined ? {still: args.still} : {}),
      ...(args.skipTts ? {skipTts: true} : {}),
    });
    log(
      `\x1b[32m✓ rendered ${result.outPath}\x1b[0m  ${(result.durationMs / 1000).toFixed(1)}s`,
    );
    return 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`\x1b[31m✗ render failed: ${msg}\x1b[0m`);
    return 3;
  }
};
