// PresetRegistry — keyed by `presetName`. Conflicts hard-fail.
//
// `extends` is intentionally not resolved in this build (R4 forward-compat).
// Phase A.2 / A.7 (the style resolver) walks the registry, not the
// inheritance chain.

import type {PresetPlugin, PresetRegistry} from '../protocols';
import {assertNoConflict} from '../validation/conflict';

export class PresetRegistryImpl implements PresetRegistry {
  readonly #presets = new Map<string, PresetPlugin>();

  register(plugin: PresetPlugin): void {
    const existing = this.#presets.get(plugin.presetName);
    if (existing) {
      assertNoConflict(
        'presetName',
        plugin.presetName,
        existing.name,
        plugin.name,
      );
    }
    this.#presets.set(plugin.presetName, plugin);
  }

  get(presetName: string): PresetPlugin | undefined {
    return this.#presets.get(presetName);
  }

  has(presetName: string): boolean {
    return this.#presets.has(presetName);
  }

  all(): ReadonlyArray<PresetPlugin> {
    return [...this.#presets.values()];
  }
}
