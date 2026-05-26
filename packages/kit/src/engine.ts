// Engine — the public face of @docent/kit.
//
// Per §4.7 of the strategy doc, this is the surface every caller (the CLI,
// the agent layer, third-party plugin packs) interacts with. A consumer
// constructs one instance per process, calls `use(plugin)` once per plugin
// it wants registered, then drives `validate / resolveStyle / render`.
//
// **THIS BUILD: the class is structurally complete but every "doing"
// method throws `not implemented — phase A.X`.**
//   - `validate()` throws — Phase A.4 fills it in.
//   - `schema()` throws — Phase A.8 fills it in.
//   - `resolveStyle()` throws — Phase A.7 fills it in.
//   - `render()` throws — Phase A.7 + A.9 fill it in.
//
// What works in this build:
//   - Construction.
//   - `use(plugin)` polymorphic dispatch (the heart of the API).
//   - The 5 registries (all real Maps; `engine.scenes.has('frame')` works).
//   - Conflict detection (a duplicate sceneType throws with both names).
//
// What's deferred:
//   - All cascade logic (validate → resolveStyle → synth audio → render).

import type {
  FeatureRegistry,
  FilmSpec,
  Issue,
  ModifierRegistry,
  Plugin,
  PluginBase,
  PresetRegistry,
  RenderOptions,
  RenderResult,
  ResolvedStyle,
  SceneRegistry,
  TtsRegistry,
} from './protocols';
import {FeatureRegistryImpl} from './registries/feature';
import {ModifierRegistryImpl} from './registries/modifier';
import {PresetRegistryImpl} from './registries/preset';
import {SceneRegistryImpl} from './registries/scene';
import {TtsRegistryImpl} from './registries/tts';
import {validateSpec} from './frameworks/validate';
import {computeSchema} from './schema/from-registry';
import {
  assertPluginBase,
  assertScenePluginShape,
} from './validation/plugin';
import type {JSONSchema7} from 'json-schema';

/**
 * The Engine. One instance per process. Constructed empty; populated via
 * `engine.use(plugin)`; driven by `validate / render`.
 *
 * @example
 *   import {Engine} from '@docent/kit';
 *   import core from '@docent/core';
 *
 *   const engine = new Engine().use(core);
 *   const issues = engine.validate(spec);
 *   if (issues.length === 0) await engine.render(spec, {scale: 0.5});
 */
export class Engine {
  readonly scenes: SceneRegistry;
  readonly presets: PresetRegistry;
  readonly tts: TtsRegistry;
  readonly features: FeatureRegistry;
  readonly modifiers: ModifierRegistry;

  constructor() {
    this.scenes = new SceneRegistryImpl();
    this.presets = new PresetRegistryImpl();
    this.tts = new TtsRegistryImpl();
    this.features = new FeatureRegistryImpl();
    this.modifiers = new ModifierRegistryImpl();
  }

  /**
   * The polymorphic dispatch — sniff `plugin.kind`, route to the right
   * registry. Accepts a single plugin or an array (so a bundle pack can
   * export `export const corePlugins: Plugin[] = [...]` and a caller does
   * `engine.use(corePlugins)`).
   *
   * Throws on:
   *   - non-object input (`assertPluginBase`)
   *   - missing/empty `name` or `version`
   *   - unknown `kind` (in particular: `'modifier'` is NOT a plugin kind)
   *   - registry conflict (two plugins claim the same sceneType / preset /
   *     providerId / feature name)
   *
   * Returns `this` for chaining: `new Engine().use(a).use(b).use(c)`.
   */
  use(plugin: PluginBase | PluginBase[]): this {
    const plugins = Array.isArray(plugin) ? plugin : [plugin];
    for (const p of plugins) {
      assertPluginBase(p);
      // p is now narrowed to Plugin
      this.dispatch(p as Plugin);
    }
    return this;
  }

  /**
   * Polymorphic dispatch on `kind`. Centralised so a new kind (if ever)
   * adds in ONE place.
   */
  private dispatch(plugin: Plugin): void {
    switch (plugin.kind) {
      case 'scene': {
        assertScenePluginShape(plugin);
        this.scenes.register(plugin);
        return;
      }
      case 'preset': {
        this.presets.register(plugin);
        return;
      }
      case 'tts': {
        this.tts.register(plugin);
        return;
      }
      case 'feature': {
        this.features.register(plugin);
        // A feature plugin may register children in any of the 4 main
        // registries + the modifier registry. We dispatch its lifecycle
        // hooks immediately so its scenes / presets / providers /
        // modifiers are available before subsequent `use()` calls.
        if (plugin.registerScenes) plugin.registerScenes(this.scenes);
        if (plugin.registerPresets) plugin.registerPresets(this.presets);
        if (plugin.registerTtsProviders) {
          plugin.registerTtsProviders(this.tts);
        }
        if (plugin.registerModifiers) {
          plugin.registerModifiers(this.modifiers);
        }
        return;
      }
      default: {
        // Exhaustiveness check — TS will warn here if PluginKind grows.
        const _exhaustive: never = plugin;
        throw new Error(
          `[@docent/kit] engine.use() received plugin with unknown kind: ` +
            JSON.stringify((_exhaustive as PluginBase)?.kind),
        );
      }
    }
  }

  /**
   * Compute the union film schema from the registered scenes.
   *
   * The shape is: a `oneOf` discriminated union over `scene.type` literals,
   * each branch the registered plugin's schema. Top-level `meta`, optional
   * `style`, optional `tts` come from `@docent/kit`'s own meta schema.
   *
   * Implementation delegates to `computeSchema(this)` in
   * `./schema/from-registry.ts`. Pure: depends only on the active scene
   * registry, safe to call from anywhere after `use()`.
   */
  schema(): JSONSchema7 {
    return computeSchema(this);
  }

  /**
   * Validate a candidate film spec against the active engine.
   *
   * Delegates to `validateSpec(spec, this)` in `./frameworks/validate.ts`.
   * Flow:
   *   1. Film-level structural checks (meta/scenes shape).
   *   2. For each scene: confirm `type` is a registered `sceneType`.
   *   3. For each scene whose plugin declares `validate?`, run it and
   *      aggregate its per-scene `SceneIssue[]` into the flat `Issue[]`.
   *
   * AJV schema-validation (against `this.schema()`) and FeaturePlugin
   * `preprocessSpec` (R6) are deferred to the cascade orchestrator (Phase
   * A.7) which composes them around this pure structural validator.
   */
  validate(spec: unknown): Issue[] {
    return validateSpec(spec, this);
  }

  /**
   * Resolve a film spec's style to a frozen `ResolvedStyle`.
   *
   * **Phase A.7 fills this in.** The pipeline:
   *   - neutralTokens (registered baseline preset)
   *   - → matched PresetPlugin.tokens
   *   - → PresetPlugin.intent[currentIntent]
   *   - → PresetPlugin.sceneOverrides[scene.type] (per-scene)
   *   - → film-level style.tokens
   *   - → scene-level style overrides
   *   - → FeaturePlugin.injectStyleTokens
   *   - → validate / normalize / accessibility
   *
   * Throws `not implemented` in this build.
   */
  resolveStyle(_spec: FilmSpec): ResolvedStyle {
    throw new Error(
      '[@docent/kit] Engine.resolveStyle() — not implemented (phase A.7). ' +
        'This will run the style resolution cascade.',
    );
  }

  /**
   * Render a film spec to an MP4 (or still). The full cascade:
   *   validate → resolveStyle → synth audio → schedule frames → render.
   *
   * **Phase A.7 + A.9 fill this in.** Throws `not implemented`.
   */
  render(_spec: FilmSpec, _opts?: RenderOptions): Promise<RenderResult> {
    throw new Error(
      '[@docent/kit] Engine.render() — not implemented (phase A.7 / A.9). ' +
        'This will run the cascade orchestrator.',
    );
  }
}
