// SceneRegistry — keyed by `sceneType`. Conflicts hard-fail with both plugin
// names in the error message. Phase A.2 fills in real lookup semantics; this
// file is the skeleton.

import type {ScenePlugin, SceneRegistry} from '../protocols';
import {assertNoConflict} from '../validation/conflict';
import {isCognitiveCluster} from '../taxonomy/cognitive-clusters';

/**
 * Skeleton implementation of `SceneRegistry`. The shape is real; the
 * methods throw 'not implemented — phase A.2' UNLESS Phase A.2 has landed.
 *
 * `register()` IS implemented enough to enforce the conflict policy from
 * §6 of the strategy doc — registering the same `sceneType` twice (or
 * across two plugins) is the single guarantee A.1 must provide so B.* can
 * fan out safely.
 */
export class SceneRegistryImpl implements SceneRegistry {
  readonly #scenes = new Map<string, ScenePlugin<any>>();

  register(plugin: ScenePlugin<any>): void {
    // The conflict net — both plugin names surface in the error.
    const existing = this.#scenes.get(plugin.sceneType);
    if (existing) {
      assertNoConflict('sceneType', plugin.sceneType, existing.name, plugin.name);
    }
    // The cognitive cluster gate — every scene declares its cluster from
    // the closed list (or `null` for chrome scenes). Enforced at register
    // time so an authoring mistake fails loud before render.
    if (plugin.cluster !== null && !isCognitiveCluster(plugin.cluster)) {
      throw new Error(
        `[@docent/kit] ScenePlugin "${plugin.name}" (sceneType "${plugin.sceneType}") ` +
          `declared an unknown cognitive cluster: ${JSON.stringify(plugin.cluster)}. ` +
          `Must be one of the 7 closed clusters or null for chrome-only scenes.`,
      );
    }
    this.#scenes.set(plugin.sceneType, plugin);
  }

  get(sceneType: string): ScenePlugin<any> | undefined {
    return this.#scenes.get(sceneType);
  }

  has(sceneType: string): boolean {
    return this.#scenes.has(sceneType);
  }

  all(): ReadonlyArray<ScenePlugin<any>> {
    return [...this.#scenes.values()];
  }
}
