// protocols — the API surface of @docent/kit.
//
// Every interface in this file is part of the public contract. Once shipped,
// changes here are major version bumps.
//
// Per the strategy doc §4: every plugin extends `PluginBase` and declares its
// `kind`. `engine.use(plugin)` sniffs `kind` and dispatches to the right
// registry — the heart of the API, modelled on Marpit's `marpit.use()`.
//
// The 4 plugin kinds: `scene` | `preset` | `tts` | `feature`. `ModifierRegistry`
// EXISTS as a forward-compat hook (R3) but `modifier` is NOT a plugin kind —
// modifiers are registered THROUGH `FeaturePlugin.registerModifiers`.
//
// Forward-compat hooks:
//   - R3 (custom modifiers)  → ModifierRegistry shape declared here;
//                                FeaturePlugin.registerModifiers exists.
//   - R4 (preset composition) → PresetPlugin.extends?: string reserved.
//   - R6 (microsyntax)       → FeaturePlugin.preprocessSpec exists.

import type {JSONSchema7} from 'json-schema';
import type React from 'react';

import type {CognitiveCluster} from './taxonomy/cognitive-clusters';
import type {DesignTokens, DesignTokenOverrides} from './types/design-tokens';
import type {
  Beat,
  FilmMeta,
  FilmSpec,
  Scene,
} from './types/spec';
import type {ResolvedStyle, StyleIntent} from './types/style';
import type {
  TtsCapabilities,
  TtsProvider,
  TtsProviderPlugin,
} from './types/tts';
import type {VisualizationStyle} from './types/visualization-style';

// Re-export to keep `import {…} from '@docent/kit'` flat for plugin authors.
export type {
  TtsCapabilities,
  TtsProvider,
  TtsProviderPlugin,
} from './types/tts';
export type {
  Beat,
  BeatPace,
  BeatShot,
  BeatCadence,
  BeatSetDirective,
  BeatTransformDirective,
  FilmMeta,
  FilmRegister,
  FilmSpec,
  FilmTtsConfig,
  Scene,
} from './types/spec';
export type {
  DesignTokens,
  DesignTokenOverrides,
  BackgroundTokens,
  InkTokens,
  AccentTokens,
  TypographyTokens,
  SpacingTokens,
  RadiusTokens,
  StrokeTokens,
} from './types/design-tokens';
export type {
  VisualizationStyle,
  LegendPosition,
} from './types/visualization-style';
export type {
  ResolvedStyle,
  RenderStyleInput,
  StyleIntent,
  StyleTokens,
  StylePreset,
  StyleTone,
  StyleAudience,
  StyleMedium,
  StyleDensity,
  StyleTheme,
  StyleEmphasis,
  StyleValidationDetail,
} from './types/style';
export {StyleValidationError} from './types/style';
export type {CognitiveCluster} from './taxonomy/cognitive-clusters';
export {
  COGNITIVE_CLUSTERS,
  COGNITIVE_CLUSTER_LABELS,
  isCognitiveCluster,
} from './taxonomy/cognitive-clusters';

// ---------------------------------------------------------------------------
// §4.1 — The base plugin
// ---------------------------------------------------------------------------

/**
 * The 4 plugin kinds the engine recognises. The discriminator on
 * `PluginBase`. `engine.use(plugin)` sniffs this and routes to the right
 * registry.
 *
 * `'modifier'` is NOT in this union. Modifiers are not plugins; they live
 * in the `ModifierRegistry`, populated by `FeaturePlugin.registerModifiers`.
 */
export type PluginKind = 'scene' | 'preset' | 'tts' | 'feature';

/**
 * Every plugin extends this. Three fields:
 *   - `name`: human-readable identifier (`'frame'`, `'engineering'`,
 *             `'kokoro'`, `'captions'`).
 *   - `version`: plugin author's semver. Used by `docent doctor` and
 *                conflict diagnostics.
 *   - `kind`: the discriminator. Determines which registry it lands in.
 *
 * Plugin authors are encouraged to use globally-unique-ish names
 * (e.g. `@scope/scene-sankey`) but the engine's conflict policy keys off the
 * domain-specific id (sceneType, presetName, providerId) not `name`.
 */
export interface PluginBase {
  readonly name: string;
  readonly version: string;
  readonly kind: PluginKind;
}

// ---------------------------------------------------------------------------
// §4.2 — ScenePlugin (R2)
// ---------------------------------------------------------------------------

/**
 * Render-time props passed to a scene's React component. The kit owns the
 * `common` shape (style, timing, meta); the scene's per-spec shape is the
 * generic parameter.
 */
export interface SceneRenderProps<TSpec = unknown> {
  /** The fully resolved scene spec — schema-validated, modifiers expanded. */
  readonly scene: TSpec;
  /** Engine-shared props: timeline slot, style bundle, meta, etc. */
  readonly common: CommonSceneProps;
}

/**
 * The shared prop bundle every scene component receives alongside its own
 * spec. The kit owns this shape so a scene plugin from any package can be
 * dropped in without renegotiating the prop contract.
 */
export interface CommonSceneProps {
  /** Timeline slot — the frames this scene occupies in the composition. */
  readonly ts: TimelineSlot;
  /** 0-based index of this scene in the film. */
  readonly sceneIndex: number;
  /** Total scene count (so a scene can render "3 of 7"). */
  readonly sceneCount: number;
  /** The (already-resolved) film meta block. */
  readonly meta: FilmMeta;
  /** The resolved style bundle — tokens, intent, visualization. */
  readonly style: ResolvedStyle;
}

/**
 * One scene's slot in the composition timeline. `frames` is the total
 * duration; `beats` are the schedule-resolved per-beat windows.
 */
export interface TimelineSlot {
  readonly startFrame: number;
  readonly frames: number;
  readonly beats: ReadonlyArray<BeatTimelineSlot>;
}

export interface BeatTimelineSlot {
  readonly beatIndex: number;
  readonly startFrame: number;
  readonly frames: number;
  /** The beat's own data, narrowed by the scene's beat type. */
  readonly beat: Beat;
}

/** Issue surfaced by per-scene structural validation. */
export interface SceneIssue {
  readonly path: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  /** Optional machine-readable code for tooling. */
  readonly code?: string;
}

export interface SceneValidationContext {
  readonly filmId: string;
  readonly sceneIndex: number;
}

export interface BeatResolutionContext {
  readonly sceneType: string;
  readonly sceneIndex: number;
  readonly beatIndex: number;
  /** The film-wide register, in case the scene's beat resolver wants it. */
  readonly register?: FilmMeta['register'];
}

/**
 * A depthcheck rule contributed by a scene or feature plugin. The engine
 * aggregates rules across all registered plugins; `docent depthcheck` runs
 * the union over every scene/film.
 *
 * `check` returns `null` for "rule passes", or a `DepthFinding` describing
 * the failure.
 */
export interface DepthRule<TSpec = unknown> {
  readonly id: string;
  readonly description: string;
  readonly severity: 'error' | 'warning' | 'info';
  /**
   * Optional scope hint — `'scene'` rules run on every scene of this
   * plugin's type; `'film'` rules run once per film with full context.
   */
  readonly scope?: 'scene' | 'film';
  check(
    target: TSpec,
    ctx: DepthCheckContext,
  ): DepthFinding | null | Promise<DepthFinding | null>;
}

export interface DepthCheckContext {
  readonly filmSpec: FilmSpec;
  readonly sceneIndex?: number;
  readonly beatIndex?: number;
  /** The active TTS provider's capabilities, when known. */
  readonly tts?: {
    readonly providerId: string;
    readonly capabilities: TtsCapabilities;
  };
}

export interface DepthFinding {
  readonly ruleId: string;
  readonly path: string;
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly suggestion?: string;
}

/**
 * A judge dimension contributed by a scene or feature plugin. The judge
 * grades a rendered film across these dimensions; `docent judge` aggregates
 * them.
 */
export interface JudgeDimension {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /**
   * Optional weight (0..1). The judge's composite score weights by this.
   * Default 1.0.
   */
  readonly weight?: number;
  /**
   * Grading rubric — surfaced to the LLM grader as the prompt scaffold.
   * Free-form string; the kit imposes no structure.
   */
  readonly rubric: string;
}

/**
 * The ScenePlugin — the core abstraction the rip-and-replace builds on.
 *
 * Every one of the 29 default scenes in `@docent/core` becomes one of these.
 * A third-party scene type (`@example/docent-scifi/holodeck`) is literally
 * the same shape.
 *
 * Mandatory: `kind`, `name`, `version` (from `PluginBase`), `sceneType`,
 * `schema`, `component`, `cluster`.
 *
 * Optional: `validate`, `depthRules`, `judgeDimensions`,
 * `requiresTtsCapabilities`, `resolveBeat`.
 */
export interface ScenePlugin<TSpec = Scene> extends PluginBase {
  readonly kind: 'scene';

  /**
   * The discriminator value in `spec.scenes[].type`. Must be globally
   * unique within the active engine — conflicts hard-fail at `engine.use()`
   * with both plugin names surfaced.
   */
  readonly sceneType: string;

  /**
   * The cognitive cluster this scene belongs to. Drawn from the CLOSED
   * 7-cluster taxonomy. `null` is reserved for chrome-only scenes (`frame`,
   * `recap`) that bracket the film but perform no cognitive move.
   */
  readonly cluster: CognitiveCluster | null;

  /**
   * JSON Schema fragment for this scene's spec. Contributed to the computed
   * film schema as one branch of the discriminated union. The kit assembles
   * the union at `Engine.schema()` call time; no hand-written
   * `film.schema.json`.
   */
  readonly schema: JSONSchema7;

  /**
   * The React/Remotion component that renders this scene type. Receives
   * the fully-resolved scene spec + the shared `common` bundle.
   */
  readonly component: React.ComponentType<SceneRenderProps<TSpec>>;

  /**
   * Optional structural validation beyond JSON Schema (cross-field checks,
   * graph-shape invariants, etc.). Returns issues; empty array = clean.
   */
  readonly validate?: (
    scene: TSpec,
    ctx: SceneValidationContext,
  ) => SceneIssue[];

  /** depthcheck rules contributed by this scene type. */
  readonly depthRules?: ReadonlyArray<DepthRule<TSpec>>;

  /** judge dimensions contributed by this scene type. */
  readonly judgeDimensions?: ReadonlyArray<JudgeDimension>;

  /**
   * R5 cross-bind: scenes declare what TTS capabilities they meaningfully
   * use. The engine checks at spec-resolution time.
   *   - When `FilmTtsConfig.strict === true`, an unsatisfied requirement
   *     hard-fails resolution.
   *   - Otherwise, it emits a depthcheck warning.
   *
   * A `passage` scene typically declares `nativeAlignment: 'word'`.
   */
  readonly requiresTtsCapabilities?: Partial<TtsCapabilities>;

  /**
   * Beat-level resolution hook — scenes that introduce new beat fields
   * (e.g. mechanism's freezes, journey-map's curve points) shape the beat
   * here before it reaches the renderer.
   */
  readonly resolveBeat?: (
    beat: Beat,
    ctx: BeatResolutionContext,
  ) => Beat;
}

// ---------------------------------------------------------------------------
// §4.3 — PresetPlugin
// ---------------------------------------------------------------------------

/**
 * A preset plugin — the structured bundle of design tokens + visualization
 * style + intent map that names a coherent visual register
 * (`engineering`, `editorial`, `paper`, …).
 *
 * The 6 default presets in `@docent/core` become 6 of these. A third-party
 * preset pack (`@brand/docent-preset-fintech`) registers via the same
 * protocol.
 *
 * `extends` is **reserved for R4** — the resolver in this build IGNORES it
 * (presets remain flat). R4 lands by implementing composition semantics on
 * top of an already-stable schema field, non-breaking.
 */
export interface PresetPlugin extends PluginBase {
  readonly kind: 'preset';

  /**
   * The preset id used in `FilmSpec.style.preset`. Must be globally unique
   * within the active engine — conflicts hard-fail at `engine.use()`.
   */
  readonly presetName: string;

  /** The structured token bundle this preset contributes. */
  readonly tokens: DesignTokens;

  /** Family-level renderer knobs. */
  readonly visualization: VisualizationStyle;

  /** One-line human-readable description — surfaced by `docent style list`. */
  readonly notes: string;

  /**
   * **R4 forward-compat.** A preset can declare it inherits from another
   * preset by name. **In this build, the resolver IGNORES this field**
   * — presets are flat. R4 lands by implementing the composition semantics
   * on top of this already-typed field. Non-breaking.
   */
  readonly extends?: string;

  /**
   * Optional intent → token-delta map. Composes with the resolved preset
   * to produce the final tokens. The 6 default presets each ship one of
   * these.
   */
  readonly intent?: Partial<Record<KnownStyleIntentKey, DesignTokenOverrides>>;

  /**
   * Optional per-scene-type token overrides (e.g. all `quantities` scenes
   * in this preset use the warm accent). Marp's `section.lead { ... }`
   * rule, ported.
   */
  readonly sceneOverrides?: Readonly<Record<string, DesignTokenOverrides>>;
}

/**
 * The keys an intent map may pin on (e.g. `'tone:executive'`,
 * `'audience:technical'`). Pre-computed dot-prefixed strings let a preset's
 * intent block read flatly.
 */
export type KnownStyleIntentKey =
  | `tone:${NonNullable<StyleIntent['tone']>}`
  | `audience:${NonNullable<StyleIntent['audience']>}`
  | `medium:${NonNullable<StyleIntent['medium']>}`
  | `density:${NonNullable<StyleIntent['density']>}`
  | `theme:${NonNullable<StyleIntent['theme']>}`
  | `emphasis:${NonNullable<StyleIntent['emphasis']>}`;

// ---------------------------------------------------------------------------
// §4.4 — TtsProviderPlugin (re-exported from Build A)
// ---------------------------------------------------------------------------
//
// See `./types/tts.ts` for the canonical declaration. The shape lives there
// because Build A already shipped the contract; this file simply re-exports.

// ---------------------------------------------------------------------------
// §4.5 — FeaturePlugin (R5)
// ---------------------------------------------------------------------------

/**
 * Forward-declared registries. The concrete implementations live in
 * `./registries/*.ts` and are imported as types here to avoid a circular
 * dependency.
 */
export interface SceneRegistry {
  register(plugin: ScenePlugin<any>): void;
  get(sceneType: string): ScenePlugin<any> | undefined;
  has(sceneType: string): boolean;
  all(): ReadonlyArray<ScenePlugin<any>>;
}

export interface PresetRegistry {
  register(plugin: PresetPlugin): void;
  get(presetName: string): PresetPlugin | undefined;
  has(presetName: string): boolean;
  all(): ReadonlyArray<PresetPlugin>;
}

export interface TtsRegistry {
  register(plugin: TtsProviderPlugin): void;
  get(providerId: string): TtsProviderPlugin | undefined;
  has(providerId: string): boolean;
  all(): ReadonlyArray<TtsProviderPlugin>;
}

export interface FeatureRegistry {
  register(plugin: FeaturePlugin): void;
  get(name: string): FeaturePlugin | undefined;
  has(name: string): boolean;
  all(): ReadonlyArray<FeaturePlugin>;
}

/* ──────── Modifier registry — R3 forward-compat ──────── */

/**
 * Three tiers, mirroring Marp's three-tier directive system
 * (global / local / spot ↔ film / scene / beat).
 */
export type ModifierTier = 'film' | 'scene' | 'beat';

export interface ModifierContext {
  readonly tier: ModifierTier;
  readonly filmSpec: FilmSpec;
  readonly sceneIndex?: number;
  readonly beatIndex?: number;
}

/**
 * A modifier function. Receives the user-declared value, returns a
 * partial object merged into the target at the matching tier.
 */
export type ModifierFn<TValue = unknown, TPartial = Record<string, unknown>> =
  (value: TValue, ctx: ModifierContext) => Partial<TPartial>;

/**
 * **R3 forward-compat.** The registry exists from day 1 and is typed
 * correctly; **it is empty in this build**. R3 lands by populating it (and
 * by exposing a user-facing config surface for projects to register custom
 * modifiers).
 *
 * The registry is NOT a plugin kind. Modifiers are registered THROUGH
 * `FeaturePlugin.registerModifiers(reg)`.
 */
export interface ModifierRegistry {
  readonly film: Map<string, ModifierFn<unknown, Partial<FilmMeta>>>;
  readonly scene: Map<string, ModifierFn<unknown, Partial<Scene>>>;
  readonly beat: Map<string, ModifierFn<unknown, Partial<Beat>>>;
}

/* ──────── Feature plugin ──────── */

/**
 * Context passed to a feature's `injectStyleTokens` hook. The feature may
 * inspect the resolved style so far and the active film/scene to decide
 * which tokens to inject.
 */
export interface StyleContext {
  readonly filmSpec: FilmSpec;
  readonly sceneIndex?: number;
}

/** The output of a single scene render, between renderer and feature wrap. */
export interface SceneOutput {
  readonly element: React.ReactElement;
  readonly sceneType: string;
  readonly sceneIndex: number;
}

export interface RenderContext {
  readonly filmSpec: FilmSpec;
  readonly common: CommonSceneProps;
}

/**
 * The FeaturePlugin — cross-cutting concerns that touch multiple registries
 * (captions, watermarks, music, lower-thirds, narration overlay).
 *
 * Lets `@docent/core` express itself as a feature pack rather than a
 * god-object. Every lifecycle hook is optional so adding new ones later is
 * additive (non-breaking).
 *
 * **R3 forward-compat**: `registerModifiers` populates the engine's
 * `ModifierRegistry`.
 * **R6 forward-compat**: `preprocessSpec` runs BEFORE schema validation —
 * the slot for a microsyntax decoder.
 */
export interface FeaturePlugin extends PluginBase {
  readonly kind: 'feature';

  registerScenes?(reg: SceneRegistry): void;
  registerPresets?(reg: PresetRegistry): void;
  registerTtsProviders?(reg: TtsRegistry): void;
  /** **R3 forward-compat.** Populates the engine's `ModifierRegistry`. */
  registerModifiers?(reg: ModifierRegistry): void;

  /** Inject style tokens that augment the resolved preset. */
  injectStyleTokens?(
    resolved: ResolvedStyle,
    ctx: StyleContext,
  ): DesignTokenOverrides | undefined;

  /** Wrap or post-process a scene's rendered output. */
  wrapRender?(rendered: SceneOutput, ctx: RenderContext): SceneOutput;

  /**
   * **R6 forward-compat.** Pre-process the spec BEFORE schema validation
   * (e.g. expand microsyntax shortcuts). Identity by default; chain
   * through if multiple features preprocess.
   */
  preprocessSpec?(spec: FilmSpec): FilmSpec;

  /** Contribute depth rules. */
  readonly depthRules?: ReadonlyArray<DepthRule<unknown>>;
}

// ---------------------------------------------------------------------------
// §4.7 — Engine surface types (the Engine class lives in ./engine.ts)
// ---------------------------------------------------------------------------

/**
 * Render options accepted by `engine.render(spec, opts)`. The CLI surfaces
 * these via `docent build`.
 */
export interface RenderOptions {
  /** Output path for the rendered MP4. Defaults to the film's id. */
  readOutPath?: string;
  /** Render scale (0.25, 0.5, 1.0). */
  scale?: number;
  /** Render only a still frame at the given second offset. */
  still?: number;
  /** Override the codec; defaults to h264. */
  codec?: 'h264' | 'h265' | 'vp8' | 'vp9' | 'prores';
  /** Pass through to Remotion's `renderMedia`. */
  concurrency?: number;
  /** Path to the cache directory the cascade may write to. */
  cacheDir?: string;
  /** Override the output directory (default: <cwd>/out). */
  outputDir?: string;
  /**
   * Absolute path to the Remotion entry script the render shell-out invokes.
   * The kit ships a helper (`registerKitRoot`) but does NOT statically know
   * which plugins to load; the invoker (CLI) generates a per-render entry
   * that statically imports the required plugins and passes that path here.
   * If omitted, the render stage hard-fails with a clear error.
   */
  entryPath?: string;
  /** Optional Remotion `--public-dir` pass-through. */
  publicDir?: string;
  /** Path to the `remotion` bin. Defaults to a walked-up node_modules lookup. */
  remotionBin?: string;
}

export interface RenderResult {
  /** Where the MP4 (or still) landed. */
  readonly outPath: string;
  /** Render duration in ms — surfaced in the `docent build` summary. */
  readonly durationMs: number;
  /** Per-beat audio metrics (if the active TTS provider populated them). */
  readonly tts?: ReadonlyArray<{
    readonly sceneIndex: number;
    readonly beatIndex: number;
    readonly wpm: number | null;
    readonly clipSeconds: number;
  }>;
}

/**
 * Issue surfaced by `engine.validate(spec)`. Aggregates schema errors,
 * per-scene `validate` results, and registry conflicts.
 */
export interface Issue {
  readonly path: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly code?: string;
  /** When the issue comes from a per-plugin validator, the plugin's name. */
  readonly source?: string;
}

/**
 * The shape every `Plugin` extends. This is the input type to
 * `engine.use(plugin)`.
 */
export type Plugin = ScenePlugin<any> | PresetPlugin | TtsProviderPlugin | FeaturePlugin;
