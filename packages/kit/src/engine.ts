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
  PresetPlugin,
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
// IMPORTANT: `engine.render()` is Node-only and lives in a separate
// module (`./engine-render.ts`) that is NOT imported here. Web bundles for
// chromium see only the lightweight `Engine` class with `use / validate /
// resolveStyle / schema` — none of which need `node:fs` / `node:child_process`.
//
// CLI callers that want to render call `runRender(engine, spec, opts)` from
// `@docent/kit/engine-render` directly. The `engine.render()` instance method
// re-exports the same surface — but it dynamic-imports the renderer via
// `new Function('p','return import(p)')` so webpack's static analyser can't
// follow it into the chromium bundle.
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
 * The Engine — the public face of `@docent/kit` and the only constructor
 * external callers need.
 *
 * Lifecycle: one instance per process. Constructed empty; populated via
 * `engine.use(plugin)` once per plugin; then driven by
 * `validate / schema / resolveStyle / render`.
 *
 * The five public registries — {@link scenes}, {@link presets}, {@link tts},
 * {@link features}, {@link modifiers} — are also exposed as `readonly`
 * fields. Consumers that want to introspect (a doctor surface, a custom
 * lint) can iterate them directly without going through `use()`.
 *
 * @example
 * ```ts
 * import {Engine} from '@docent/kit';
 * import core from '@docent/core';
 * import scifi from '@example/docent-scifi';
 *
 * // Construct and register plugins. `use()` is chainable.
 * const engine = new Engine().use(core).use(scifi);
 *
 * // Validate a candidate spec — returns Issue[].
 * const issues = engine.validate(spec);
 * if (issues.some((i) => i.severity === 'error')) {
 *   process.exit(1);
 * }
 *
 * // Render the film. Throws on Remotion failures.
 * const result = await engine.render(spec, {scale: 0.5});
 * console.log('rendered to', result.outPath);
 * ```
 *
 * @see docs/design/plugin-architecture-strategy.md §4.7
 */
export class Engine {
  /** The scene-plugin registry. Discriminator: `ScenePlugin.sceneType`. */
  readonly scenes: SceneRegistry;
  /** The preset-plugin registry. Discriminator: `PresetPlugin.presetName`. */
  readonly presets: PresetRegistry;
  /** The TTS-provider registry. Discriminator: `TtsProviderPlugin.providerId`. */
  readonly tts: TtsRegistry;
  /** The feature-plugin registry. Discriminator: `FeaturePlugin.name`. */
  readonly features: FeatureRegistry;
  /**
   * **R3 forward-compat.** The modifier registry, populated via feature
   * plugins' `registerModifiers` hooks. Empty in this build; the resolver
   * does not consult it. Surfaced today so R3 lands non-breaking.
   */
  readonly modifiers: ModifierRegistry;

  /**
   * Construct an empty engine. The 5 registries are initialised to empty.
   * Plugins are added via `use()`.
   */
  constructor() {
    this.scenes = new SceneRegistryImpl();
    this.presets = new PresetRegistryImpl();
    this.tts = new TtsRegistryImpl();
    this.features = new FeatureRegistryImpl();
    this.modifiers = new ModifierRegistryImpl();
  }

  /**
   * Register one or more plugins with the engine. Modeled on Marpit's
   * `marpit.use()` — sniffs `plugin.kind` and routes to the matching
   * registry. The single public mutation surface of the engine.
   *
   * Accepts a single plugin or an array (so a bundle pack can export
   * `export const corePlugins: Plugin[] = [...]` and a caller does
   * `engine.use(corePlugins)`).
   *
   * When the plugin is a {@link FeaturePlugin}, the feature's lifecycle
   * hooks fire immediately: `registerScenes`, `registerPresets`,
   * `registerTtsProviders`, `registerModifiers`. This means a feature's
   * children are available before subsequent `use()` calls — useful for
   * ordering-sensitive setups.
   *
   * Throws on:
   *   - non-object input (via `assertPluginBase`).
   *   - missing/empty `name` or `version`.
   *   - unknown `kind` (in particular: `'modifier'` is NOT a plugin kind —
   *     register modifiers through a `FeaturePlugin`).
   *   - registry conflict (two plugins claim the same `sceneType` /
   *     `presetName` / `providerId` / feature `name`) — throws
   *     {@link RegistryConflictError} with BOTH plugin names surfaced.
   *
   * @returns `this` for chaining: `new Engine().use(a).use(b).use(c)`.
   *
   * @example
   * ```ts
   * // Single plugin.
   * engine.use(framePlugin);
   *
   * // Bundle of plugins.
   * engine.use([framePlugin, structurePlugin, captionsFeature]);
   *
   * // Chained.
   * new Engine().use(corePlugins).use(scifiPlugins);
   * ```
   *
   * @see docs/design/plugin-architecture-strategy.md §4.7
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
   * each branch the registered plugin's schema (narrowed by its
   * `sceneType`). Top-level `meta`, optional `style`, optional `tts` come
   * from `@docent/kit`'s own meta schema.
   *
   * The schema is pure — depends only on the active scene registry, safe
   * to call from anywhere after `use()`. Feed it to AJV (or any JSON
   * Schema validator) for runtime validation; or write it to disk for
   * tooling.
   *
   * Implementation delegates to {@link computeSchema}.
   *
   * @returns A `JSONSchema7` ready for AJV.
   *
   * @see docs/design/plugin-architecture-strategy.md §4.7
   */
  schema(): JSONSchema7 {
    return computeSchema(this);
  }

  /**
   * Validate a candidate film spec against the active engine.
   *
   * Delegates to {@link validateSpec}. The structural validator: walks the
   * spec, dispatches each scene to its registered plugin's `validate?`
   * hook, aggregates the returned per-scene issues into a flat list.
   *
   * Flow:
   *   1. Film-level structural checks (`meta`, `scenes` shape).
   *   2. For each scene: confirm `type` is a registered `sceneType`.
   *   3. For each scene whose plugin declares `validate?`, run it and
   *      aggregate its per-scene {@link SceneIssue}s into the flat
   *      {@link Issue} list (re-rooting paths to `scenes[<i>].…`).
   *
   * AJV schema-validation (against `this.schema()`) and
   * `FeaturePlugin.preprocessSpec` (R6) are deferred to the cascade
   * orchestrator (Phase A.7) which composes them around this pure
   * structural validator.
   *
   * @param spec An unknown value — the validator confirms it's an object first.
   * @returns A flat `Issue[]`. Empty array = clean. Severity `'error'`
   * means the spec is unsafe to render; `'warning'` means it renders but
   * the author should look.
   *
   * @see docs/design/plugin-architecture-strategy.md §4.7
   */
  validate(spec: unknown): Issue[] {
    return validateSpec(spec, this);
  }

  /**
   * Resolve a film spec's style to a frozen {@link ResolvedStyle}.
   *
   * **This is the A.7 SIMPLE resolver — neutral baseline composition.**
   * The full pipeline (R4 preset composition, scene-level overrides,
   * {@link FeaturePlugin}.`injectStyleTokens`, accessibility checks) is
   * deferred to a follow-on sprint. The shape returned is the final one;
   * what's deferred is the *richness* of the composition, not the protocol.
   *
   * Today's pipeline:
   *   1. Start with the registered preset (looked up by name from
   *      `spec.style.preset`, defaulting to `'neutral'`).
   *   2. If found: use its tokens + visualization as the base.
   *      If not found: fall back to the kit's `NEUTRAL_TOKENS` floor.
   *   3. Shallowly apply `spec.style.tokens` overrides (top-level token
   *      categories only — `bg`, `ink`, `accent`, …).
   *   4. Shallowly apply `spec.style.visualization` overrides.
   *   5. Freeze and return.
   *
   * @param spec The film spec — `spec.style` may be absent, in which case
   * the resolver returns the neutral baseline.
   * @returns A frozen, complete {@link ResolvedStyle}.
   * @throws {@link StyleValidationError} when the spec names a preset that
   * is neither registered nor the well-known `'neutral'` fallback.
   *
   * @see docs/design/plugin-architecture-strategy.md §4.7
   */
  resolveStyle(spec: FilmSpec): ResolvedStyle {
    const styleInput = spec.style ?? {};
    const presetName = styleInput.preset ?? 'neutral';
    const intent: StyleIntent = styleInput.intent ?? {};

    const presetPlugin = this.presets.get(presetName);

    // The preset is *missing*. Two cases:
    //   - presetName === 'neutral': fall back to the kit's NEUTRAL floor.
    //   - presetName !== 'neutral': hard-fail with the registered set.
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

    // R4: walk the `extends` chain to assemble the effective preset stack.
    // The chain is base-first: [grandparent, parent, plugin]. Each member's
    // tokens shadow the previous; the final overlays styleInput.tokens.
    // Cycles are an error; missing extends targets are an error.
    const chain: PresetPlugin[] = [];
    if (presetPlugin) {
      const seen = new Set<string>();
      let cursor: PresetPlugin | undefined = presetPlugin;
      while (cursor) {
        if (seen.has(cursor.presetName)) {
          throw new StyleValidationError([
            {
              code: 'preset_cycle',
              path: 'style.preset',
              value: cursor.presetName,
              message: `preset extends chain has a cycle (saw '${cursor.presetName}' twice)`,
            },
          ]);
        }
        seen.add(cursor.presetName);
        chain.unshift(cursor); // base-first
        const ext: string | undefined = cursor.extends;
        if (!ext) break;
        if (ext === 'neutral') break; // neutral floor is implicit
        const parent = this.presets.get(ext);
        if (!parent) {
          const known = this.presets
            .all()
            .map((p) => p.presetName)
            .sort();
          throw new StyleValidationError([
            {
              code: 'unknown_extends',
              path: 'style.preset',
              value: ext,
              message: `preset "${cursor.presetName}" extends "${ext}" which is not registered`,
              expected: known.length > 0 ? `one of: ${known.join(', ')}` : '(no presets registered)',
            },
          ]);
        }
        cursor = parent;
      }
    }

    // Compose tokens: NEUTRAL floor → walk the chain base-first → styleInput.
    // Each layer shadows the previous per category.
    const composeGroup = <K extends keyof DesignTokens>(
      key: K,
      pluck: (p: PresetPlugin) => Partial<DesignTokens[K]> | undefined,
      neutral: DesignTokens[K],
      override: Partial<DesignTokens[K]> | undefined,
    ): DesignTokens[K] => {
      let acc: DesignTokens[K] = {...neutral};
      for (const p of chain) {
        const layer = pluck(p);
        if (layer) acc = {...acc, ...layer};
      }
      if (override) acc = {...acc, ...override};
      return acc;
    };

    const tokens: DesignTokens = {
      bg: composeGroup('bg', (p) => p.tokens?.bg, NEUTRAL_TOKENS.bg, styleInput.tokens?.bg),
      ink: composeGroup('ink', (p) => p.tokens?.ink, NEUTRAL_TOKENS.ink, styleInput.tokens?.ink),
      accent: composeGroup(
        'accent',
        (p) => p.tokens?.accent,
        NEUTRAL_TOKENS.accent,
        styleInput.tokens?.accent,
      ),
      typography: {
        family: ((): DesignTokens['typography']['family'] => {
          let acc = {...NEUTRAL_TOKENS.typography.family};
          for (const p of chain) {
            const layer = p.tokens?.typography?.family;
            if (layer) acc = {...acc, ...layer};
          }
          if (styleInput.tokens?.typography?.family) {
            acc = {...acc, ...styleInput.tokens.typography.family};
          }
          return acc;
        })(),
        size: ((): DesignTokens['typography']['size'] => {
          let acc = {...NEUTRAL_TOKENS.typography.size};
          for (const p of chain) {
            const layer = p.tokens?.typography?.size;
            if (layer) acc = {...acc, ...layer};
          }
          if (styleInput.tokens?.typography?.size) {
            acc = {...acc, ...styleInput.tokens.typography.size};
          }
          return acc;
        })(),
        weight: ((): DesignTokens['typography']['weight'] => {
          let acc = {...NEUTRAL_TOKENS.typography.weight};
          for (const p of chain) {
            const layer = p.tokens?.typography?.weight;
            if (layer) acc = {...acc, ...layer};
          }
          if (styleInput.tokens?.typography?.weight) {
            acc = {...acc, ...styleInput.tokens.typography.weight};
          }
          return acc;
        })(),
        lineHeight: (() => {
          // last-wins precedence: styleInput → most-derived chain member with a value → neutral.
          if (styleInput.tokens?.typography?.lineHeight !== undefined) {
            return styleInput.tokens.typography.lineHeight;
          }
          for (let i = chain.length - 1; i >= 0; i--) {
            const v = chain[i]!.tokens?.typography?.lineHeight;
            if (v !== undefined) return v;
          }
          return NEUTRAL_TOKENS.typography.lineHeight;
        })(),
        letterSpacing: (() => {
          if (styleInput.tokens?.typography?.letterSpacing !== undefined) {
            return styleInput.tokens.typography.letterSpacing;
          }
          for (let i = chain.length - 1; i >= 0; i--) {
            const v = chain[i]!.tokens?.typography?.letterSpacing;
            if (v !== undefined) return v;
          }
          return NEUTRAL_TOKENS.typography.letterSpacing;
        })(),
      },
      spacing: composeGroup(
        'spacing',
        (p) => p.tokens?.spacing,
        NEUTRAL_TOKENS.spacing,
        styleInput.tokens?.spacing,
      ),
      radius: composeGroup(
        'radius',
        (p) => p.tokens?.radius,
        NEUTRAL_TOKENS.radius,
        styleInput.tokens?.radius,
      ),
      stroke: composeGroup(
        'stroke',
        (p) => p.tokens?.stroke,
        NEUTRAL_TOKENS.stroke,
        styleInput.tokens?.stroke,
      ),
    };

    // Compose the visualization knobs. Same last-wins precedence as the
    // single-valued token fields above.
    const pickVizDerived = <K extends keyof VisualizationStyle>(
      key: K,
    ): VisualizationStyle[K] | undefined => {
      for (let i = chain.length - 1; i >= 0; i--) {
        const v = chain[i]!.visualization?.[key];
        if (v !== undefined) return v as VisualizationStyle[K];
      }
      return undefined;
    };
    const visualization: Required<VisualizationStyle> = {
      legendPosition:
        styleInput.visualization?.legendPosition ??
        pickVizDerived('legendPosition') ??
        NEUTRAL_VISUALIZATION.legendPosition,
      gridLines:
        styleInput.visualization?.gridLines ??
        pickVizDerived('gridLines') ??
        NEUTRAL_VISUALIZATION.gridLines,
      axisLabels:
        styleInput.visualization?.axisLabels ??
        pickVizDerived('axisLabels') ??
        NEUTRAL_VISUALIZATION.axisLabels,
      maxLabelsPerSeries:
        styleInput.visualization?.maxLabelsPerSeries ??
        pickVizDerived('maxLabelsPerSeries') ??
        NEUTRAL_VISUALIZATION.maxLabelsPerSeries,
      treatmentLock: ((): Required<VisualizationStyle>['treatmentLock'] => {
        if (styleInput.visualization?.treatmentLock !== undefined) {
          return styleInput.visualization.treatmentLock;
        }
        const fromChain = pickVizDerived('treatmentLock');
        if (fromChain !== undefined) return fromChain;
        return NEUTRAL_VISUALIZATION.treatmentLock;
      })(),
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
   * Node-only: dynamically imports the renderer module via a runtime
   * specifier (`./engine-render`) so the browser/chromium bundle can omit
   * the Node-only modules (`node:fs`, `node:child_process`, Remotion's
   * render API). Webpack's static analyser cannot follow the dynamic
   * specifier into this path — by design.
   *
   * @param spec The film to render. Should be pre-validated.
   * @param opts See {@link RenderOptions}.
   * @returns A {@link RenderResult} pointing at the produced MP4 (or still).
   *
   * @see docs/design/plugin-architecture-strategy.md §4.7
   */
  async render(
    spec: FilmSpec,
    opts: RenderOptions = {},
  ): Promise<RenderResult> {
    // Hide the render module from webpack's static analyser by building the
    // module specifier at runtime. The browser bundle never executes this
    // path — it sits behind a CLI call. Bun/Node resolve `./engine-render`
    // relative to this file via their own loader.
    const part1 = './engine-';
    const part2 = 'render';
    const spec_ = part1 + part2;
    const dynamicImport = new Function(
      'p',
      'return import(p)',
    ) as (p: string) => Promise<{runRender: typeof import('./engine-render').runRender}>;
    const mod = await dynamicImport(spec_);
    return mod.runRender(this, spec, opts);
  }
}
