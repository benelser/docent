// `docent preview <film-id>` — launch Remotion Studio against a film spec.
//
// Wires together: createEngine (core + user config) → load spec from
// films/<id>.json → engine.validate (abort on error) → generate a per-render
// entry → shell out to `remotion studio <entry>` for hot-reload editing.
//
// Studio defaults to localhost:3000; we pass --port to override. The spec is
// inlined into the generated entry .tsx, so editing films/<id>.json on disk
// does NOT itself trigger a re-bundle — the agent should re-run `preview` to
// pick up spec changes today. (See friction notes in the PR description.)
// Component changes in @bjelser/core or the user's docent.config.ts DO
// hot-reload via Remotion Studio's webpack dev server.

import {spawn} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

import {createEngine} from '../engine-factory';
import {generateRenderEntry} from '../render-entry';
import type {FilmSpec} from '@bjelser/kit';

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

/** Find the remotion bin — mirrors render-stage's lookup strategy. */
const defaultRemotionBin = (cwd: string): string => {
  let dir = cwd;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'node_modules', '.bin', 'remotion');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 'remotion';
};

export interface PreviewArgs {
  /** Film id (the basename of films/<id>.json). */
  readonly filmId: string;
  /** Override the films/ root (defaults to <cwd>/films). */
  readonly filmsDir?: string;
  /** Override the project root for entry-file generation + config lookup. */
  readonly projectRoot?: string;
  /** Override Remotion Studio's port (defaults to 3000). */
  readonly port?: number;
}

const log = (s: string) => process.stdout.write(`${s}\n`);

export const runPreview = async (args: PreviewArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const specPath = resolve(filmsDir, `${args.filmId}.json`);

  if (!existsSync(specPath)) {
    log(`\x1b[31m✗ films/${args.filmId}.json not found at ${specPath}\x1b[0m`);
    log(`  Set --films-dir to override, or run "docent init ${args.filmId}" first.`);
    return 1;
  }

  const spec: FilmSpec = JSON.parse(readFileSync(specPath, 'utf-8'));

  log(`\x1b[36m▶ docent preview ${args.filmId}\x1b[0m`);
  const {engine, configPath, userPlugins} = await createEngine(projectRoot);
  log(
    `  engine: ${engine.scenes.all().length} scenes · ${engine.presets.all().length} presets · ` +
      `${engine.tts.all().length} tts · ${engine.features.all().length} features` +
      (configPath ? ` (+${userPlugins.length} from ${configPath})` : ''),
  );

  // Apply the same expansion the build path uses so the studio view matches
  // what would render.
  const expandedSpec = engine.applyModifiers(engine.preprocessSpec(spec));

  // Pre-validate so a structural failure surfaces BEFORE we hand off to
  // Remotion Studio (whose error surface is webpack/React, not friendly for
  // a malformed spec).
  const issues = engine.validate(expandedSpec);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    log(`\x1b[31m✗ spec validation failed:\x1b[0m`);
    for (const e of errors) log(`  ✗ ${e.path || '(root)'}: ${e.message}`);
    return 2;
  }
  if (issues.length > 0) {
    log(`\x1b[33m⚠ ${issues.length} validation warning(s)\x1b[0m`);
  }

  // Reuse the same entry generator as build. Preview doesn't need audio:
  // the TTS manifest may not exist yet, and the generator tolerates that
  // (falls back to a silent render).
  const remotionRoot = findRemotionRoot(projectRoot) ?? projectRoot;
  const publicDir = join(remotionRoot, 'public');

  const entryPath = await generateRenderEntry({
    specPath,
    configPath,
    filmId: args.filmId,
    projectRoot,
    userPlugins,
    publicDir,
  });

  log(`  entry: ${entryPath}`);
  if (remotionRoot !== projectRoot) {
    log(`  remotion-config: ${join(remotionRoot, 'remotion.config.*')}`);
  }

  const port = args.port ?? 3000;
  const remotionBin = defaultRemotionBin(projectRoot);

  // Remotion Studio takes the entry as the sole positional argument and a
  // `--port=<n>` flag. Stdio inherited so the dev-server URL + webpack
  // progress stream live to the user's terminal.
  const studioArgs = ['studio', entryPath, `--port=${port}`];

  log(`\x1b[32m✓ preview running at http://localhost:${port}\x1b[0m`);
  log(`  edit films/${args.filmId}.json to hot-reload (re-run preview after edits to refresh spec).`);
  log(`  Ctrl-C to stop.`);

  const child = spawn(remotionBin, studioArgs, {
    cwd: remotionRoot,
    env: process.env,
    stdio: 'inherit',
  });

  // Forward SIGINT to the child so Ctrl-C cleanly stops the dev server.
  const onSigint = () => {
    if (!child.killed) child.kill('SIGINT');
  };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigint);

  return new Promise<number>((res, rej) => {
    child.on('error', (err: Error) => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigint);
      rej(err);
    });
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigint);
      // SIGINT from the user is a clean stop, not a failure.
      if (signal === 'SIGINT' || signal === 'SIGTERM') return res(0);
      res(code ?? 0);
    });
  });
};
