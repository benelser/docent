// FeatureRegistry — keyed by `name`. Two features with the same name hard-fail.
// The engine calls their lifecycle hooks in registration order during the
// cascade (so a feature can rely on an earlier feature's presence if it
// also registers a dependency).

import type {FeaturePlugin, FeatureRegistry} from '../protocols';
import {assertNoConflict} from '../validation/conflict';

export class FeatureRegistryImpl implements FeatureRegistry {
  readonly #features = new Map<string, FeaturePlugin>();

  register(plugin: FeaturePlugin): void {
    const existing = this.#features.get(plugin.name);
    if (existing) {
      assertNoConflict('feature name', plugin.name, existing.name, plugin.name);
    }
    this.#features.set(plugin.name, plugin);
  }

  get(name: string): FeaturePlugin | undefined {
    return this.#features.get(name);
  }

  has(name: string): boolean {
    return this.#features.has(name);
  }

  all(): ReadonlyArray<FeaturePlugin> {
    return [...this.#features.values()];
  }
}
