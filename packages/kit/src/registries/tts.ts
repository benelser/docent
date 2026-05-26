// TtsRegistry — keyed by `providerId`. The well-known id `'kokoro'` is the
// engine's default-on-no-config provider; `engine.tts.get('kokoro')` is the
// fallback when `FilmTtsConfig.provider` is absent.

import type {TtsRegistry} from '../protocols';
import type {TtsProviderPlugin} from '../types/tts';
import {assertNoConflict} from '../validation/conflict';

export class TtsRegistryImpl implements TtsRegistry {
  readonly #providers = new Map<string, TtsProviderPlugin>();

  register(plugin: TtsProviderPlugin): void {
    const existing = this.#providers.get(plugin.providerId);
    if (existing) {
      assertNoConflict(
        'providerId',
        plugin.providerId,
        existing.name,
        plugin.name,
      );
    }
    this.#providers.set(plugin.providerId, plugin);
  }

  get(providerId: string): TtsProviderPlugin | undefined {
    return this.#providers.get(providerId);
  }

  has(providerId: string): boolean {
    return this.#providers.has(providerId);
  }

  all(): ReadonlyArray<TtsProviderPlugin> {
    return [...this.#providers.values()];
  }
}
