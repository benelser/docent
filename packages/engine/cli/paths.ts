// Root resolution for the docent CLI.
//
// The CLI lives in packages/engine/cli. REPO_ROOT is the directory that holds
// films/, public/, and out/ — content and artifacts that cross the package
// boundary. ENGINE_ROOT is the @docent/engine package itself. Resolving both
// here means no other file hard-codes a layout.

import {existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

export const ENGINE_ROOT = resolve(import.meta.dir, '..');

const findRepoRoot = (start: string): string => {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(ENGINE_ROOT, '..', '..');
    dir = parent;
  }
};

export const REPO_ROOT = findRepoRoot(ENGINE_ROOT);

export const paths = {
  films: join(REPO_ROOT, 'films'),
  analysis: join(REPO_ROOT, 'analysis'),
  publicDir: join(REPO_ROOT, 'public'),
  out: join(REPO_ROOT, 'out'),
  manim: join(REPO_ROOT, 'manim'),
  fixtures: join(REPO_ROOT, 'fixtures'),
  entry: join(ENGINE_ROOT, 'src', 'index.ts'),
  ttsScript: join(ENGINE_ROOT, 'pipeline', 'tts.py'),
  clipsScript: join(ENGINE_ROOT, 'pipeline', 'clips.py'),
  remotionBin: join(REPO_ROOT, 'node_modules', '.bin', 'remotion'),
};
