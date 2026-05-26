// The TTS provider registry — a singleton keyed by `providerId` that holds
// every registered `TtsProviderPlugin`. The same shape as the existing style
// presets and scene-fit registries; the build-out is deliberately small and
// boring so a future migration to the broader plugin protocol (the docs/
// design/plugin-architecture.md `Engine` class) can fold this in without
// re-shaping the API.
//
// Three exposed surfaces:
//
//   registerTtsProvider(plugin)   — register a provider (called by the
//                                   built-in providers at module load; will
//                                   be called by external npm packages once
//                                   the broader plugin protocol lands).
//   ttsRegistry.create(id, ctx)   — lazily construct a `TtsProvider` instance
//                                   from a registered plugin id.
//   ttsRegistry.list()            — every registered plugin (for the `docent
//                                   tts list-providers` CLI surface).
//
// The registry is process-global (a `Map` on a module-singleton object). The
// built-in providers register on first import of `./registry`; the import is
// load-bearing — if you delete the side-effect import block at the bottom of
// `./index.ts`, the built-ins disappear.

import type {TtsProvider, TtsProviderContext, TtsProviderPlugin} from './types';
import {TtsProviderError} from './types';

class TtsRegistry {
  private readonly providers = new Map<string, TtsProviderPlugin>();

  /**
   * Register a provider plugin. Duplicate `providerId`s OVERWRITE (the latest
   * wins) — the cascade hot-loads built-ins at module init; an external pack
   * that registers a same-id plugin replaces the built-in. This is the Marp
   * discipline: a plugin is a tagged value, the latest registration is
   * authoritative.
   */
  register(plugin: TtsProviderPlugin): void {
    if (!plugin.providerId || typeof plugin.providerId !== 'string') {
      throw new Error('TtsProviderPlugin requires a non-empty `providerId`');
    }
    if (!plugin.capabilities) {
      throw new Error(
        `TtsProviderPlugin "${plugin.providerId}" must declare \`capabilities\``,
      );
    }
    if (typeof plugin.create !== 'function') {
      throw new Error(
        `TtsProviderPlugin "${plugin.providerId}" must implement \`create(ctx)\``,
      );
    }
    this.providers.set(plugin.providerId, plugin);
  }

  /** Whether a given provider id is registered. */
  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /**
   * Look up a plugin by id, returning undefined if absent. The CLI uses this
   * to report a missing provider with a precise message before falling into
   * `create()`.
   */
  get(providerId: string): TtsProviderPlugin | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Lazily construct a `TtsProvider` instance for the given id. Throws a
   * `TtsProviderError` if the id is not registered. The plugin's own
   * `create()` may throw a `TtsProviderError` if credentials/config are
   * insufficient — the cascade surfaces that error verbatim BEFORE burning
   * minutes on a render.
   */
  async create(providerId: string, ctx: TtsProviderContext): Promise<TtsProvider> {
    const plugin = this.providers.get(providerId);
    if (!plugin) {
      const known = [...this.providers.keys()].sort().join(', ') || '(none)';
      throw new TtsProviderError(
        providerId,
        `no TTS provider registered with id "${providerId}" — known: ${known}`,
      );
    }
    return plugin.create(ctx);
  }

  /** Every registered plugin, in insertion order. For `docent tts list-providers`. */
  list(): TtsProviderPlugin[] {
    return [...this.providers.values()];
  }

  /** The provider ids, sorted alphabetically. */
  ids(): string[] {
    return [...this.providers.keys()].sort();
  }
}

/**
 * The process-global registry. A singleton — mutating it from one place is
 * observable from every other. Built-in providers register on first import of
 * `./index.ts`.
 */
export const ttsRegistry = new TtsRegistry();

/**
 * Public registration helper — forward-compatible with the broader plugin
 * protocol's `engine.registerTtsProvider(plugin)`. An external npm package
 * will call this at module load.
 */
export const registerTtsProvider = (plugin: TtsProviderPlugin): void => {
  ttsRegistry.register(plugin);
};
