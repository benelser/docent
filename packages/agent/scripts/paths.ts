// Path resolver for the agent-side scripts.
//
// These scripts live in packages/agent/scripts/ but operate against the
// CONSUMING project's repo: the project where the user wrote analysis/,
// treatments/, films/ — typically the cwd. We walk up from cwd looking
// for a .git directory (the conventional project boundary). Fall back to
// process.cwd() if nothing matches.
//
// AGENT_ROOT is the @docent/agent package directory itself — used for
// brief / prompt file resolution.

import {existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

export const AGENT_ROOT = resolve(import.meta.dir, '..');

const findRepoRoot = (start: string): string => {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
};

export const REPO_ROOT = findRepoRoot(process.cwd());

export const paths = {
  films: join(REPO_ROOT, 'films'),
  analysis: join(REPO_ROOT, 'analysis'),
  publicDir: join(REPO_ROOT, 'public'),
  out: join(REPO_ROOT, 'out'),
  treatments: join(REPO_ROOT, 'treatments'),
};
