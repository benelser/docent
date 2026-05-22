/**
 * Build step for docent's interactive web player.
 *
 * Produces a static, self-contained, shareable bundle for one film: bundled
 * JS, an HTML entry, and a copy of the film's narration audio. The output
 * directory can be opened locally (over a static server) or uploaded as-is.
 *
 * Usage:
 *   bun packages/engine/player/build.ts [filmId] [--out <dir>]
 *
 * If `filmId` is omitted, every film in the registry is bundled and the
 * in-page picker is shown. If given, the bundle is pinned to that one film.
 */

import {existsSync} from 'node:fs';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {FILMS} from '../src/engine/spec';

const PLAYER_DIR = import.meta.dir;
const ENGINE_DIR = path.resolve(PLAYER_DIR, '..');
// `public/` lives at the monorepo root — four levels up from src/engine.
const REPO_ROOT = path.resolve(ENGINE_DIR, '../..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');

const parseArgs = (argv: string[]) => {
  let filmId: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' || arg === '-o') {
      out = argv[++i];
    } else if (!arg.startsWith('-') && !filmId) {
      filmId = arg;
    }
  }
  return {filmId, out};
};

const main = async () => {
  const {filmId, out} = parseArgs(process.argv.slice(2));

  if (filmId && !FILMS[filmId]) {
    console.error(
      `Unknown film "${filmId}". Available: ${Object.keys(FILMS).join(', ')}`,
    );
    process.exit(1);
  }

  // Which films' audio do we need to ship?
  const filmIds = filmId ? [filmId] : Object.keys(FILMS);

  const outDir = path.resolve(
    REPO_ROOT,
    out ?? path.join('out', 'player', filmId ?? 'all'),
  );

  console.log(`docent player build`);
  console.log(`  films:  ${filmIds.join(', ')}`);
  console.log(`  output: ${outDir}`);

  await rm(outDir, {recursive: true, force: true});
  await mkdir(outDir, {recursive: true});

  // --- 1. Bundle the JS -----------------------------------------------------
  const result = await Bun.build({
    entrypoints: [path.join(PLAYER_DIR, 'index.tsx')],
    outdir: outDir,
    target: 'browser',
    format: 'esm',
    minify: true,
    naming: '[name].[hash].[ext]',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });

  if (!result.success) {
    console.error('Bundle failed:');
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  const jsArtifact = result.outputs.find((o) => o.kind === 'entry-point');
  if (!jsArtifact) {
    console.error('Bundle produced no entry-point artifact.');
    process.exit(1);
  }
  const jsFile = path.basename(jsArtifact.path);

  // --- 2. Emit the HTML -----------------------------------------------------
  // The template's dev `<script src="./index.tsx">` is swapped for the built,
  // hashed bundle. `window.remotion_staticBase = "."` makes `staticFile()`
  // resolve narration audio to bundle-relative paths (./audio/...). When a
  // single film is pinned, `__DOCENT_FILM__` locks the player to it.
  const template = await readFile(
    path.join(PLAYER_DIR, 'index.html'),
    'utf8',
  );
  const bootstrap = [
    'window.remotion_staticBase = ".";',
    filmId ? `window.__DOCENT_FILM__ = ${JSON.stringify(filmId)};` : '',
  ]
    .filter(Boolean)
    .join('\n      ');

  const html = template.replace(
    '<script type="module" src="./index.tsx"></script>',
    `<script>\n      ${bootstrap}\n    </script>\n    <script type="module" src="./${jsFile}"></script>`,
  );
  await writeFile(path.join(outDir, 'index.html'), html);

  // --- 3. Copy static assets (narration audio) ------------------------------
  const audioOut = path.join(outDir, 'audio');
  await mkdir(audioOut, {recursive: true});

  // The manifest is always needed — buildTimeline reads it for beat timing.
  const manifestSrc = path.join(PUBLIC_DIR, 'audio', 'manifest.json');
  if (existsSync(manifestSrc)) {
    await cp(manifestSrc, path.join(audioOut, 'manifest.json'));
  }

  let copied = 0;
  for (const id of filmIds) {
    const src = path.join(PUBLIC_DIR, 'audio', id);
    if (existsSync(src)) {
      await cp(src, path.join(audioOut, id), {recursive: true});
      copied++;
    } else {
      console.warn(`  ! no audio dir for "${id}" (${src}) — film will be silent`);
    }
  }

  console.log(`  bundled: ${jsFile}`);
  console.log(`  audio:   ${copied}/${filmIds.length} film(s) copied`);
  console.log(`\nDone. To view:`);
  console.log(`  bunx serve ${path.relative(REPO_ROOT, outDir)}`);
  console.log(`  (or any static server — opening index.html via file:// will`);
  console.log(`   not work because ES modules require http://)`);
};

main();
