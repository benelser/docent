// Engine factory — the *only* place in the CLI that constructs an Engine.
//
// Every subcommand calls `createEngine()` so the cascade configuration
// (core plugins + user docent.config.ts plugins, in that order) is single-
// sourced. Conflict detection lives in the registry: a user plugin that
// reuses a `sceneType` already claimed by core throws with both names
// surfaced.

import {Engine, type Plugin} from '@docent/kit';
import {corePlugins} from '@docent/core';

import {loadConfig, type LoadedConfig} from './load-config';

export interface CreatedEngine {
  /** The fully populated engine. */
  readonly engine: Engine;
  /** The path to the loaded config file, or null if none. */
  readonly configPath: string | null;
  /** The user plugins registered on top of `corePlugins`. */
  readonly userPlugins: ReadonlyArray<Plugin>;
}

/**
 * Build an Engine populated with `@docent/core`'s `corePlugins` plus any
 * plugins declared in a `docent.config.ts` found in `startDir`'s ancestor
 * tree.
 */
export const createEngine = async (
  startDir: string = process.cwd(),
): Promise<CreatedEngine> => {
  const engine = new Engine();
  // Cast: corePlugins is typed `readonly Plugin[]`; `engine.use` accepts
  // `PluginBase | PluginBase[]`. The narrower readonly array unifies fine.
  engine.use(corePlugins as unknown as Plugin[]);

  const loaded: LoadedConfig = await loadConfig(startDir);
  if (loaded.plugins.length > 0) {
    engine.use(loaded.plugins as unknown as Plugin[]);
  }

  return {
    engine,
    configPath: loaded.path,
    userPlugins: loaded.plugins,
  };
};
