// TranslationRegistry — keyed by `providerId`. The well-known id `'noop'` is
// the engine's default-on-no-config provider; `engine.translations.get('noop')`
// is the fallback when no provider is configured. `@bjelser/core` ships the
// noop provider so `--lang <code>` always resolves to *something* — the noop
// passes narration through unchanged + warns once per cascade.

import type {TranslationRegistry} from '../protocols';
import type {TranslationProviderPlugin} from '../types/translation';
import {assertNoConflict} from '../validation/conflict';

export class TranslationRegistryImpl implements TranslationRegistry {
  readonly #providers = new Map<string, TranslationProviderPlugin>();

  register(plugin: TranslationProviderPlugin): void {
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

  get(providerId: string): TranslationProviderPlugin | undefined {
    return this.#providers.get(providerId);
  }

  has(providerId: string): boolean {
    return this.#providers.has(providerId);
  }

  all(): ReadonlyArray<TranslationProviderPlugin> {
    return [...this.#providers.values()];
  }
}
