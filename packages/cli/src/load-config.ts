// Loader for the optional `docent.config.ts` (or `.js`) in the user's project.
//
// The contract: the config file default-exports `{plugins?: Plugin[]}`. The
// CLI imports it via Bun's dynamic-import support (works for .ts because Bun
// transpiles on the fly) and merges its `plugins` array into the Engine *on
// top of* `@bjelser/core`.
//
// This is the third-party-pack on-ramp: a project that wants to register a
// custom scene type or preset puts it in `docent.config.ts` and the CLI
// picks it up without modifying `@bjelser/core`. The acceptance test
// (`tests/example-docent-scifi/`) exercises this path end to end.

import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

import type {Plugin} from '@bjelser/kit';

export interface DocentConfig {
  readonly plugins?: ReadonlyArray<Plugin>;
}

export interface LoadedConfig {
  /** Absolute path of the loaded config file, or null if none was found. */
  readonly path: string | null;
  /** The user-declared plugins (empty if none). */
  readonly plugins: ReadonlyArray<Plugin>;
}

const CONFIG_FILENAMES = [
  'docent.config.ts',
  'docent.config.tsx',
  'docent.config.js',
  'docent.config.mjs',
] as const;

/**
 * Search a directory tree upward for the first `docent.config.*` file. Walks
 * from `startDir` up to the filesystem root or the first matching file.
 *
 * Returns the absolute path, or null if no config exists in the tree.
 */
export const findConfigFile = (startDir: string): string | null => {
  let dir = resolve(startDir);
  for (let i = 0; i < 12; i++) {
    for (const name of CONFIG_FILENAMES) {
      const p = resolve(dir, name);
      if (existsSync(p)) return p;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};

/**
 * Load the user's docent config. Returns the resolved config (or an empty
 * one if no file exists). Throws on a config file that exists but doesn't
 * shape-validate to `{plugins?: Plugin[]}`.
 */
export const loadConfig = async (startDir: string): Promise<LoadedConfig> => {
  const path = findConfigFile(startDir);
  if (!path) {
    return {path: null, plugins: []};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import(/* @vite-ignore */ path);
  const cfg: DocentConfig = (mod.default ?? mod) as DocentConfig;

  const plugins = Array.isArray(cfg.plugins) ? cfg.plugins : [];
  for (const p of plugins) {
    if (!p || typeof p !== 'object' || typeof (p as Plugin).kind !== 'string') {
      throw new Error(
        `[@bjelser/cli] docent.config plugins[] contains an invalid entry: ` +
          JSON.stringify(p).slice(0, 80) +
          `… (each entry must be a Plugin — {kind, name, version, ...}).`,
      );
    }
  }
  return {path, plugins};
};
