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
import {runCascade} from './cascade/orchestrator';
import type {DesignTokens} from './types/design-tokens';
import type {VisualizationStyle} from './types/visualization-style';
import type {StyleIntent} from './types/style';
import {StyleValidationError} from './types/style';
import type {JSONSchema7} from 'json-schema';

// Neutral floor tokens — the baseline every preset composes over. Mirrors
// the engine's legacy `neutralTokens` shape (see
// `packages/engine/src/style/styleTokens.ts`) so v2.x preset data drops
// in unchanged when `@docent/core` migrates.
//
// The kit ships these because `resolveStyle()` must return a complete
// `DesignTokens` even when NO preset is registered (the absolute-zero
// build, useful for kit-level tests). When a preset *is* registered, its
// tokens shadow these field-by-field.
const NEUTRAL_TOKENS: DesignTokens = Object.freeze({
  bg: {
    void: '#000000',
    base: '#0a0a0a',
    panel: '#141414',
    panelHi: '#1c1c1c',
    line: '#262626',
    lineHi: '#3a3a3a',
  },
  ink: {
    hi: '#f5f5f5',
    mid: '#bdbdbd',
    low: '#7a7a7a',
    faint: '#4a4a4a',
  },
  accent: {
    blue: '#4f9cf9',
    cyan: '#4fd1c5',
    green: '#5bc97a',
    amber: '#e8b150',
    rose: '#e87878',
    violet: '#a880f0',
  },
  typography: {
    family: {
      sans: 'Inter, system-ui, sans-serif',
      serif: 'Charter, Georgia, serif',
      mono: 'JetBrains Mono, ui-monospace, monospace',
    },
    size: {
      micro: 12,
      small: 14,
      body: 16,
      label: 18,
      heading: 32,
      display: 56,
    },
    weight: {
      body: 400,
      label: 500,
      heading: 600,
      display: 700,
    },
    lineHeight: 1.4,
    letterSpacing: 0,
  },
  spacing: {xs: 4, sm: 8, md: 16, lg: 24, xl: 40, gutter: 32},
  radius: {sm: 4, md: 8, lg: 16},
  stroke: {hairline: 0.5, thin: 1, regular: 2, bold: 4},
}) as DesignTokens;

const NEUTRAL_VISUALIZATION: Required<VisualizationStyle> = Object.freeze({
  legendPosition: 'right',
  gridLines: true,
  axisLabels: true,
  maxLabelsPerSeries: 8,
  treatmentLock: null,
}) as Required<VisualizationStyle>;

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
   * **This is the A.7 SIMPLE resolver — neutral baseline composition.**
   * The full pipeline (R4 preset composition, scene-level overrides,
   * `FeaturePlugin.injectStyleTokens`, accessibility checks) is deferred
   * to a follow-on sprint. The shape returned is the final one; what's
   * deferred is the *richness* of the composition, not the protocol.
   *
   * Today's pipeline:
   *   1. Start with the registered preset (looked up by name from
   *      `spec.style.preset`, defaulting to `'neutral'`).
   *   2. If found: use its tokens + visualization as the base.
   *      If not found: fall back to the kit's NEUTRAL_TOKENS floor.
   *   3. Shallowly apply `spec.style.tokens` overrides (top-level token
   *      categories only — `bg`, `ink`, `accent`, …).
   *   4. Shallowly apply `spec.style.visualization` overrides.
   *   5. Freeze and return.
   *
   * Throws `StyleValidationError` if the spec names a preset that is
   * neither registered nor the well-known `'neutral'` fallback.
   */
  resolveStyle(spec: FilmSpec): ResolvedStyle {
    const styleInput = spec.style ?? {};
    const presetName = styleInput.preset ?? 'neutral';
    const intent: StyleIntent = styleInput.intent ?? {};

    const presetPlugin = this.presets.get(presetName);

    // The preset is *missing*. Two cases:
    //   - presetName === 'neutral': fall back to the kit's NEUTRAL floor.
    //     The neutral preset is conventionally the engine's baseline; if
    //     no presets at all are registered (a bare-engine test), this
    //     still resolves cleanly.
    //   - presetName !== 'neutral': hard-fail. A spec that names
    //     `engineering` against an engine with no engineering preset is
    //     a contract failure the caller needs to see.
    if (!presetPlugin && presetName !== 'neutral') {
      const known = this.presets
        .all()
        .map((p) => p.presetName)
        .sort();
      throw new StyleValidationError([
        {
          code: 'unknown_preset',
          path: 'style.preset',
          value: presetName,
          message: `preset "${presetName}" is not registered`,
          expected: known.length > 0 ? `one of: ${known.join(', ')}` : '(no presets registered)',
        },
      ]);
    }

    // Compose the tokens. The neutral floor is the starting point; the
    // preset's tokens shadow per category; the spec's `style.tokens`
    // overrides shadow on top of that.
    const tokens: DesignTokens = {
      bg: {...NEUTRAL_TOKENS.bg, ...presetPlugin?.tokens?.bg, ...styleInput.tokens?.bg},
      ink: {...NEUTRAL_TOKENS.ink, ...presetPlugin?.tokens?.ink, ...styleInput.tokens?.ink},
      accent: {
        ...NEUTRAL_TOKENS.accent,
        ...presetPlugin?.tokens?.accent,
        ...styleInput.tokens?.accent,
      },
      typography: {
        family: {
          ...NEUTRAL_TOKENS.typography.family,
          ...presetPlugin?.tokens?.typography?.family,
          ...styleInput.tokens?.typography?.family,
        },
        size: {
          ...NEUTRAL_TOKENS.typography.size,
          ...presetPlugin?.tokens?.typography?.size,
          ...styleInput.tokens?.typography?.size,
        },
        weight: {
          ...NEUTRAL_TOKENS.typography.weight,
          ...presetPlugin?.tokens?.typography?.weight,
          ...styleInput.tokens?.typography?.weight,
        },
        lineHeight:
          styleInput.tokens?.typography?.lineHeight ??
          presetPlugin?.tokens?.typography?.lineHeight ??
          NEUTRAL_TOKENS.typography.lineHeight,
        letterSpacing:
          styleInput.tokens?.typography?.letterSpacing ??
          presetPlugin?.tokens?.typography?.letterSpacing ??
          NEUTRAL_TOKENS.typography.letterSpacing,
      },
      spacing: {
        ...NEUTRAL_TOKENS.spacing,
        ...presetPlugin?.tokens?.spacing,
        ...styleInput.tokens?.spacing,
      },
      radius: {
        ...NEUTRAL_TOKENS.radius,
        ...presetPlugin?.tokens?.radius,
        ...styleInput.tokens?.radius,
      },
      stroke: {
        ...NEUTRAL_TOKENS.stroke,
        ...presetPlugin?.tokens?.stroke,
        ...styleInput.tokens?.stroke,
      },
    };

    // Compose the visualization knobs. Same shadow order.
    const visualization: Required<VisualizationStyle> = {
      legendPosition:
        styleInput.visualization?.legendPosition ??
        presetPlugin?.visualization?.legendPosition ??
        NEUTRAL_VISUALIZATION.legendPosition,
      gridLines:
        styleInput.visualization?.gridLines ??
        presetPlugin?.visualization?.gridLines ??
        NEUTRAL_VISUALIZATION.gridLines,
      axisLabels:
        styleInput.visualization?.axisLabels ??
        presetPlugin?.visualization?.axisLabels ??
        NEUTRAL_VISUALIZATION.axisLabels,
      maxLabelsPerSeries:
        styleInput.visualization?.maxLabelsPerSeries ??
        presetPlugin?.visualization?.maxLabelsPerSeries ??
        NEUTRAL_VISUALIZATION.maxLabelsPerSeries,
      treatmentLock:
        styleInput.visualization?.treatmentLock !== undefined
          ? styleInput.visualization.treatmentLock
          : presetPlugin?.visualization?.treatmentLock !== undefined
            ? presetPlugin.visualization.treatmentLock!
            : NEUTRAL_VISUALIZATION.treatmentLock,
    };

    const resolved: ResolvedStyle = Object.freeze({
      preset: presetName,
      intent,
      tokens: Object.freeze(tokens) as DesignTokens,
      visualization: Object.freeze(visualization) as Required<VisualizationStyle>,
      provenance: Object.freeze({
        preset: presetName,
        intent,
        hasTokenOverrides: !!styleInput.tokens,
        hasUserOverrides: !!styleInput.user,
      }),
    });
    return resolved;
  }

  /**
   * Render a film spec to an MP4 (or still). Runs the full cascade:
   *   validate → resolveStyle → synth audio → render frames.
   *
   * **Phase A.7 wires this through to the orchestrator. The render
   * stage itself depends on A.9 (Remotion bindings) and throws "not
   * implemented" until that lands** — but `validate`, `resolveStyle`,
   * and the `tts` stage all run, so a caller exercising the cascade
   * head observes real behaviour up to that point.
   */
  render(spec: FilmSpec, opts: RenderOptions = {}): Promise<RenderResult> {
    return runCascade(spec, this, opts);
  }
}
