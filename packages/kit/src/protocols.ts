// protocols — the API surface of @bjelser/kit.
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
import type {SceneVariantTokens} from './frameworks/scene-variants';
import type {ResolvedStyle, StyleIntent} from './types/style';
import type {
  TtsCapabilities,
  TtsProvider,
  TtsProviderPlugin,
  WordTiming,
} from './types/tts';
import type {
  TranslationCapabilities,
  TranslationProvider,
  TranslationProviderPlugin,
} from './types/translation';
import type {VisualizationStyle} from './types/visualization-style';

// Re-export to keep `import {…} from '@bjelser/kit'` flat for plugin authors.
export type {
  TtsCapabilities,
  TtsProvider,
  TtsProviderPlugin,
} from './types/tts';
export type {
  TranslationCapabilities,
  TranslationProvider,
  TranslationProviderPlugin,
  TranslationProviderContext,
} from './types/translation';
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
  SceneArchetype,
  SceneVariant,
} from './types/spec';
export type {SceneVariantTokens} from './frameworks/scene-variants';
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
 * The 4 plugin kinds the engine recognises — the discriminator union for
 * `PluginBase.kind`. `engine.use(plugin)` sniffs this value and routes to the
 * matching registry (scene → SceneRegistry, preset → PresetRegistry, etc.).
 *
 * **`'modifier'` is NOT in this union.** Modifiers are not plugins; they are
 * registered THROUGH a {@link FeaturePlugin}'s `registerModifiers` hook and
 * live in the engine's {@link ModifierRegistry} (R3 forward-compat).
 *
 * Adding a kind is a major release of `@bjelser/kit` — every existing engine
 * dispatch and every plugin author has to learn it.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.1
 */
export type PluginKind =
  | 'scene'
  | 'preset'
  | 'tts'
  | 'translation'
  | 'feature';

/**
 * The foundation every plugin extends. Modelled after Marpit's plugin shape:
 * a tiny, declarative descriptor the engine can sniff to know what to do.
 *
 * Three mandatory fields:
 *   - `name` — human-readable identifier (`'frame'`, `'engineering'`,
 *     `'kokoro'`, `'captions'`). Authors are encouraged to use globally
 *     unique-ish names (e.g. `@scope/scene-sankey`) but the engine's
 *     conflict policy keys off the domain-specific id (`sceneType`,
 *     `presetName`, `providerId`, feature `name`), not this field.
 *   - `version` — plugin author's semver. Surfaced by `docent doctor` and
 *     in conflict diagnostics so an integrator can pin a known-good pair.
 *   - `kind` — the {@link PluginKind} discriminator. Determines which
 *     registry the plugin lands in when `engine.use(plugin)` is called.
 *
 * Plugins are constructed by their author (typically as a plain frozen object
 * literal or via a factory) and handed to `engine.use()` once per process.
 * The kit performs a structural sniff (`assertPluginBase`) at `use()` time;
 * a misshapen plugin throws with a pointed error.
 *
 * @example
 * ```ts
 * const myScene: ScenePlugin = {
 *   kind: 'scene',
 *   name: '@example/sankey',
 *   version: '1.0.0',
 *   sceneType: 'sankey',
 *   // ...the rest of ScenePlugin
 * };
 * ```
 *
 * @see docs/design/plugin-architecture-strategy.md §4.1
 */
export interface PluginBase {
  /** Human-readable plugin identifier (e.g. `'@scope/scene-sankey'`). */
  readonly name: string;
  /** Plugin author's semver — surfaced by `docent doctor` diagnostics. */
  readonly version: string;
  /** The discriminator. Routes the plugin to its matching registry. */
  readonly kind: PluginKind;
}

// ---------------------------------------------------------------------------
// §4.2 — ScenePlugin (R2)
// ---------------------------------------------------------------------------

/**
 * Render-time props passed to a {@link ScenePlugin}'s React component.
 *
 * The kit owns the `common` shape — every scene receives the same bundle of
 * timing/style/meta context. The scene's per-spec shape is plugin-owned and
 * passed through the `TSpec` generic.
 *
 * The composition (`@bjelser/kit/remotion`) constructs this at render time by:
 *   1. Resolving the scene's spec (schema-validated, modifiers expanded).
 *   2. Computing the {@link TimelineSlot} from the schedule.
 *   3. Resolving the {@link ResolvedStyle} once at film level.
 *   4. Mounting `<plugin.component scene={…} common={…} />` inside a
 *      Remotion `<Sequence>`.
 *
 * @example
 * ```ts
 * function MyScene({scene, common}: SceneRenderProps<MyScene>) {
 *   const {tokens} = common.style;
 *   return <h1 style={{color: tokens.ink.hi}}>{scene.title}</h1>;
 * }
 * ```
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
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
 *
 * Constructed by the composition layer once per scene per render. A scene
 * author reads `common.style.tokens.ink.hi` rather than reaching into a
 * global theme module — that's the discipline that keeps third-party
 * plugins drop-in-clean.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
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
  /**
   * Resolved archetype × variant overlay — what title scale to multiply
   * by, which entrance shape to use, whether to show the kicker, etc.
   * Always populated by the composition layer (defaults to the
   * baseline {@link STANDARD_VARIANT_TOKENS} when the scene declared
   * neither `archetype` nor `variant`). Scene components read this
   * without nullchecks.
   *
   * @see resolveSceneVariant (in `frameworks/scene-variants.ts`)
   */
  readonly variantTokens: SceneVariantTokens;
}

/**
 * One scene's slot in the composition timeline. Produced by the schedule
 * resolver before render-time; carried on {@link CommonSceneProps.ts}.
 *
 * - `startFrame` — global frame offset where the scene begins (0 for the
 *   first scene).
 * - `frames` — total duration of the scene, in frames at the film's fps.
 * - `beats` — schedule-resolved per-beat windows, in declaration order.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
export interface TimelineSlot {
  /** Global frame offset (0-indexed) where this scene begins. */
  readonly startFrame: number;
  /** Total duration in frames at the film's fps. */
  readonly frames: number;
  /** Per-beat windows, in declaration order. */
  readonly beats: ReadonlyArray<BeatTimelineSlot>;
}

/**
 * One beat's schedule-resolved window within a {@link TimelineSlot}.
 *
 * - `beatIndex` — 0-based index of this beat within its scene.
 * - `startFrame` — **scene-relative** frame offset where this beat begins
 *   (NOT absolute within the film). Scenes are mounted in a Remotion
 *   `<Sequence>` so `useCurrentFrame()` returns scene-relative frames;
 *   `startFrame` shares that coordinate so beat reveal-gates of the form
 *   `frame >= b.startFrame` work correctly.
 * - `frames` — beat duration in frames; the engine derives this from the
 *   TTS clip length when narration is present, falls back to `pace`-driven
 *   defaults otherwise.
 * - `beat` — the beat spec itself (the {@link Beat} object the author
 *   wrote, after `resolveBeat?` ran).
 * - `audio` — optional path to a synthesized audio clip for this beat, when
 *   the TTS stage produced one and threaded it into the schedule.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
export interface BeatTimelineSlot {
  /** 0-based index of this beat within its scene. */
  readonly beatIndex: number;
  /**
   * Scene-relative frame offset where this beat begins.
   *
   * Matches the coordinate of `useCurrentFrame()` inside a scene's
   * Remotion `<Sequence>`, so reveal-gates of the form
   * `frame >= b.startFrame` work without coordinate translation.
   */
  readonly startFrame: number;
  /** Beat duration in frames at the film's fps. */
  readonly frames: number;
  /** The beat's own data, after `ScenePlugin.resolveBeat?` ran. */
  readonly beat: Beat;
  /**
   * Public-folder-relative path to a synthesized audio clip for this beat,
   * when one was produced by the TTS stage and threaded into the schedule
   * (e.g. `audio/<filmId>/beat-0-1.wav`). Consumed by the narration feature
   * via Remotion's `staticFile()`. `null` (or undefined) means no clip — the
   * feature renders nothing for that beat.
   */
  readonly audio?: string | null;
}

/**
 * Issue surfaced by a {@link ScenePlugin}'s `validate?` hook. The kit's
 * `validateSpec` aggregates these per scene and re-roots their `path` under
 * `scenes[<i>]` before emitting them as top-level {@link Issue}s.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
export interface SceneIssue {
  /** Path relative to the scene root (e.g. `'beats[0].narration'`). */
  readonly path: string;
  /** Human-readable explanation. */
  readonly message: string;
  /** Severity — `'error'` blocks render; `'warning'` flags but allows. */
  readonly severity: 'error' | 'warning';
  /** Optional machine-readable code for tooling (e.g. `'narration.empty'`). */
  readonly code?: string;
}

/**
 * Context handed to a {@link ScenePlugin}'s `validate?` hook. Lets the
 * validator surface scene-position-aware diagnostics ("scene 3 of 7").
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
export interface SceneValidationContext {
  /** The film's stable id (`meta.id`). */
  readonly filmId: string;
  /** 0-based index of the scene being validated. */
  readonly sceneIndex: number;
  /**
   * Absolute path to the project root, when the caller knows it. The CLI
   * passes this through from its `--project-root` flag (or cwd). Scene
   * validators that want to check filesystem state (e.g. the figure scene
   * verifying its image lives under `<projectRoot>/public/figures/`) read
   * this. Validators that work on any spec without filesystem state simply
   * ignore it. Optional so the kit's smoke tests and pure-spec consumers
   * can still call `engine.validate(spec)` without a project root.
   */
  readonly projectRoot?: string;
}

/**
 * Context handed to a {@link ScenePlugin}'s `resolveBeat?` hook — the
 * beat-level resolution stage where scene-specific beat fields take shape
 * before the renderer runs.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
export interface BeatResolutionContext {
  /** The plugin's own `sceneType` — handed back so generic helpers can branch. */
  readonly sceneType: string;
  /** 0-based scene index. */
  readonly sceneIndex: number;
  /** 0-based beat index within the scene. */
  readonly beatIndex: number;
  /** The film-wide register, in case the scene's beat resolver wants it. */
  readonly register?: FilmMeta['register'];
}

/**
 * A depthcheck rule contributed by a scene or feature plugin. The engine
 * aggregates rules across all registered plugins; `docent depthcheck` runs
 * the union over every scene/film.
 *
 * `check` returns `null` for "rule passes", or a {@link DepthFinding}
 * describing the failure. The check may be async — useful for rules that
 * probe file paths or external state.
 *
 * @example
 * ```ts
 * const tensionMustResolve: DepthRule<TensionScene> = {
 *   id: 'tension.resolve',
 *   description: 'every tension scene must end with a resolution beat',
 *   severity: 'warning',
 *   scope: 'scene',
 *   check(scene) {
 *     const last = scene.beats?.at(-1);
 *     if (last?.kind !== 'resolution') {
 *       return {
 *         ruleId: 'tension.resolve',
 *         path: 'beats',
 *         message: 'add a resolution beat',
 *         severity: 'warning',
 *       };
 *     }
 *     return null;
 *   },
 * };
 * ```
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
export interface DepthRule<TSpec = unknown> {
  /** Stable rule id surfaced in findings (e.g. `'tension.resolve'`). */
  readonly id: string;
  /** One-line description for the depthcheck report header. */
  readonly description: string;
  /** Author-chosen severity. */
  readonly severity: 'error' | 'warning' | 'info';
  /**
   * Optional scope hint — `'scene'` rules run on every scene of this
   * plugin's type; `'film'` rules run once per film with full context. When
   * omitted on a {@link ScenePlugin}'s rule, defaults to `'scene'`. Feature
   * plugin rules always run film-scoped.
   */
  readonly scope?: 'scene' | 'film';
  /**
   * Run the rule against `target`. Return `null` if the rule passes; a
   * {@link DepthFinding} otherwise.
   */
  check(
    target: TSpec,
    ctx: DepthCheckContext,
  ): DepthFinding | null | Promise<DepthFinding | null>;
}

/**
 * Context handed to every {@link DepthRule}'s `check`. Carries the whole
 * film spec plus the rule's local position (scene/beat index when
 * scene-scoped) and the active TTS provider's capabilities when known.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
export interface DepthCheckContext {
  /** The whole film spec — rules may inspect other scenes/beats. */
  readonly filmSpec: FilmSpec;
  /** 0-based scene index when the rule is scene-scoped. */
  readonly sceneIndex?: number;
  /** 0-based beat index for beat-scoped rules. */
  readonly beatIndex?: number;
  /** The active TTS provider's capabilities, when known. */
  readonly tts?: {
    readonly providerId: string;
    readonly capabilities: TtsCapabilities;
  };
}

/**
 * The result of a {@link DepthRule}'s `check` when the rule fails. Surfaced
 * to the depthcheck report and to the agent layer's review loop.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
export interface DepthFinding {
  /** The rule's id — links the finding back to its declaring rule. */
  readonly ruleId: string;
  /** Path into the film spec the finding is about (e.g. `'scenes[2].beats'`). */
  readonly path: string;
  /** Human-readable explanation. */
  readonly message: string;
  /** Author-chosen severity. */
  readonly severity: 'error' | 'warning' | 'info';
  /** Optional remediation hint surfaced beneath the finding. */
  readonly suggestion?: string;
}

/**
 * A judge dimension contributed by a scene or feature plugin. The judge
 * grades a rendered film across these dimensions; `docent judge` aggregates
 * them via {@link collectJudgeDimensions} into a composite rubric the LLM
 * grader consumes.
 *
 * @example
 * ```ts
 * const axesLabelled: JudgeDimension = {
 *   id: 'chart.axes-labelled',
 *   title: 'Chart axes are labelled',
 *   description: 'A reader can read units off the chart without narration.',
 *   weight: 0.8,
 *   rubric: 'Score 0..1 by checking if both axes carry units.',
 * };
 * ```
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
export interface JudgeDimension {
  /** Stable id used to dedupe / cross-reference findings. */
  readonly id: string;
  /** Short label surfaced in the judge report. */
  readonly title: string;
  /** One-line description — read by humans, not the grader. */
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
 * The ScenePlugin — the highest-traffic plugin shape, and the core
 * abstraction the rip-and-replace builds on.
 *
 * Every one of the 29 default scenes in `@bjelser/core` is one of these. A
 * third-party scene type (e.g. `@example/docent-scifi/holodeck`) is
 * literally the same shape — the kit makes no distinction between built-in
 * and third-party plugins.
 *
 * A scene plugin contributes FIVE things to the engine:
 *   1. A {@link sceneType} discriminator that gates `spec.scenes[].type`.
 *   2. A {@link schema} fragment that becomes one branch of the computed
 *      film schema.
 *   3. A {@link component} that renders frames at composition time.
 *   4. A {@link cluster} tag (one of the 7 closed cognitive clusters) so
 *      the recommender and the agent layer can reason about it.
 *   5. Optional {@link depthRules} and {@link judgeDimensions} — the
 *      scene's own quality bar.
 *
 * Mandatory: `kind`, `name`, `version` (from {@link PluginBase}),
 * `sceneType`, `schema`, `component`, `cluster`.
 *
 * Optional: `validate`, `depthRules`, `judgeDimensions`,
 * `requiresTtsCapabilities`, `resolveBeat`.
 *
 * @example
 * ```ts
 * import type {ScenePlugin} from '@bjelser/kit';
 *
 * interface FrameScene { type: 'frame'; title: string; subtitle?: string; }
 *
 * export const framePlugin: ScenePlugin<FrameScene> = {
 *   kind: 'scene',
 *   name: 'frame',
 *   version: '1.0.0',
 *   sceneType: 'frame',
 *   cluster: null,
 *   schema: {
 *     type: 'object',
 *     required: ['title'],
 *     properties: {title: {type: 'string'}, subtitle: {type: 'string'}},
 *   },
 *   component: FrameComponent,
 * };
 * ```
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
/**
 * One rule-based selection signal for the `docent scene-fit recommend`
 * recommender. A {@link ScenePlugin} declares an array of these to advertise
 * what survey language pulls this scene into the recommendation. See
 * {@link ScenePlugin.signals} for the tuning heuristic.
 *
 * Matched case-insensitively against the lowercased survey body. A scene
 * with several specific needles outscores a generic scene with one fuzzy
 * needle — that's how the recommender breaks ties in favor of precise fits.
 *
 * @see docs/design/plugin-architecture-strategy.md §11.5
 */
export interface SceneFitSignal {
  /** Substring (lowercased before match) the recommender looks for. */
  readonly needle: string;
  /** Weight added to the scene's score when the needle matches. */
  readonly weight: number;
}

export interface ScenePlugin<TSpec = Scene> extends PluginBase {
  /** The plugin-kind discriminator. */
  readonly kind: 'scene';

  /**
   * The discriminator value in `spec.scenes[].type`. Must be globally
   * unique within the active engine — conflicts hard-fail at `engine.use()`
   * with both plugin names surfaced (see {@link RegistryConflictError}).
   */
  readonly sceneType: string;

  /**
   * The cognitive cluster this scene belongs to. Drawn from the CLOSED
   * 7-cluster taxonomy ({@link CognitiveCluster}). `null` is reserved for
   * chrome-only scenes (`frame`, `recap`) that bracket the film but
   * perform no cognitive move.
   *
   * The recommender (`docent scene-fit`) and the agent layer's prompts
   * navigate by these clusters.
   */
  readonly cluster: CognitiveCluster | null;

  /**
   * JSON Schema fragment for this scene's spec. Contributed to the computed
   * film schema as one branch of the `oneOf` discriminated union, narrowed
   * by `sceneType`. The kit assembles the union at `Engine.schema()` call
   * time — there is no hand-written `film.schema.json`.
   *
   * @see {@link computeSchema}
   */
  readonly schema: JSONSchema7;

  /**
   * The React/Remotion component that renders this scene type. Receives
   * the fully-resolved scene spec + the shared `common` bundle (see
   * {@link SceneRenderProps}).
   */
  readonly component: React.ComponentType<SceneRenderProps<TSpec>>;

  /**
   * Optional structural validation beyond JSON Schema (cross-field checks,
   * graph-shape invariants, narration-vs-reveal pairing, etc.). Returns
   * issues; empty array = clean. The kit re-roots returned paths under
   * `scenes[<i>]` before surfacing.
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
   * One-line "reach for it when" cue surfaced by `docent scene-fit list`
   * and the agent layer's prompts. The cue is what the survey-authoring
   * agent reads when deciding which primitive to reach for. Authors of
   * community packs are STRONGLY encouraged to declare it.
   *
   * Style guide for cues:
   *   - One sentence, naming the cognitive move the scene performs
   *   - Lead with the load-bearing structural signal
   *   - End with a parenthetical that names the visual idiom
   *
   * Example: `"the subject IS its components and how they connect
   *   (node-and-edge diagram)."`
   *
   * Optional — the `docent scene-fit list` command will surface
   * `(no cue advertised)` for plugins that omit it.
   *
   * @see docs/design/plugin-architecture-strategy.md §11.5
   */
  readonly cue?: string;

  /**
   * Rule-based selection signals for `docent scene-fit recommend`. Each
   * signal is a substring needle the recommender looks for in the lowercased
   * survey body; a match contributes the declared weight to this scene's
   * recommendation score. The top N highest-scoring scenes are pulled into
   * the agent's recommendation.
   *
   * The needle string is matched case-insensitively (the recommender
   * lowercases both sides). Use weighted phrases so distinctive language
   * (e.g. `"causal loop"`, `"trade-off plane"`) outvotes circumstantial
   * matches (e.g. `"curve"`, `"compounds"`).
   *
   * Tuning heuristic:
   *   - **4** — the phrase IS the scene's defining language (a hard match).
   *   - **3** — strong domain hint; clearly biases toward this scene.
   *   - **2** — clear but ambiguous between siblings (e.g. timeline vs
   *     progression).
   *   - **1** — circumstantial; contributes only alongside stronger
   *     evidence for the same scene.
   *
   * Empty / omitted: the scene relies on `cue` for discovery and on the
   * mode-driven structural rules (`frame` always opens, `recap` always
   * closes, `diff` is structurally required for PR films) for inclusion.
   *
   * @see docs/design/plugin-architecture-strategy.md §11.5
   */
  readonly signals?: ReadonlyArray<SceneFitSignal>;

  /**
   * R5 cross-bind: scenes declare what TTS capabilities they meaningfully
   * use. The engine checks at spec-resolution time against the active TTS
   * provider's {@link TtsCapabilities}:
   *   - When `FilmTtsConfig.strict === true`, an unsatisfied requirement
   *     hard-fails resolution.
   *   - Otherwise, it emits a depthcheck warning.
   *
   * A `passage` scene typically declares `nativeAlignment: 'word'`; a
   * `demonstrate` scene that uses SSML pauses declares `ssml: true`.
   */
  readonly requiresTtsCapabilities?: Partial<TtsCapabilities>;

  /**
   * Beat-level resolution hook — scenes that introduce new beat fields
   * (e.g. mechanism's freezes, journey-map's curve points) shape the beat
   * here before it reaches the renderer. Receives the raw beat from the
   * spec; returns the beat with its scene-specific fields shaped.
   *
   * Runs at schedule-resolution time, before {@link BeatTimelineSlot.beat}
   * is populated.
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
 * The 6 default presets in `@bjelser/core` (`neutral`, `engineering`,
 * `editorial`, `paper`, `executive`, `analytical`) become 6 of these. A
 * third-party preset pack (e.g. `@brand/docent-preset-fintech`) registers
 * via the same protocol.
 *
 * Created by a preset author as a frozen object literal; registered via
 * `engine.use(presetPlugin)`. Looked up at render time by name from
 * `spec.style.preset`. The {@link Engine.resolveStyle} method composes
 * the preset's tokens + visualization over the neutral floor.
 *
 * @example
 * ```ts
 * export const engineeringPreset: PresetPlugin = {
 *   kind: 'preset',
 *   name: 'engineering',
 *   version: '1.0.0',
 *   presetName: 'engineering',
 *   tokens: {bg: {…}, ink: {…}, accent: {…}, …},
 *   visualization: {legendPosition: 'right', gridLines: true},
 *   notes: 'Console-screen aesthetic; data-first.',
 * };
 * ```
 *
 * @see docs/design/plugin-architecture-strategy.md §4.3
 */
export interface PresetPlugin extends PluginBase {
  /** The plugin-kind discriminator. */
  readonly kind: 'preset';

  /**
   * The preset id used in `FilmSpec.style.preset`. Must be globally unique
   * within the active engine — conflicts hard-fail at `engine.use()`.
   */
  readonly presetName: string;

  /** The structured token bundle this preset contributes. */
  readonly tokens: DesignTokens;

  /**
   * Family-level renderer knobs (legend position, grid lines, etc.).
   *
   * Optional when the preset declares {@link extends} — the resolver walks
   * the chain base-first and inherits any unset visualization fields from
   * the parent. A base preset (no `extends`) should declare a complete
   * {@link VisualizationStyle}.
   */
  readonly visualization?: VisualizationStyle;

  /**
   * One-line "reach for it when" cue surfaced by `docent style list` and
   * consumed by the agent layer's prompts. Authors of community packs
   * are encouraged to declare it — it's what an author reads when
   * picking among the registered presets.
   *
   * Optional. `docent style list` falls back to `notes` when missing.
   */
  readonly cue?: string;

  /**
   * Rule-based selection signals for `docent style recommend`. Each entry
   * is a substring needle the recommender looks for in the lowercased
   * survey body; matches contribute the declared weight to this preset's
   * recommendation score.
   *
   * Same shape as {@link ScenePlugin.signals} — see that JSDoc for the
   * tuning heuristic (weight 4 for defining language, 1 for circumstantial).
   * Empty / omitted: the preset participates in the registry but never
   * scores in `recommend`.
   *
   * @see ScenePlugin.signals
   */
  readonly signals?: ReadonlyArray<SceneFitSignal>;

  /** One-line human-readable description — surfaced by `docent style list`. */
  readonly notes: string;

  /**
   * **R4 forward-compat — RESERVED FIELD.** A preset can declare it inherits
   * from another preset by name. **In this build, the resolver IGNORES this
   * field** — presets remain flat. The field is shipped on day 1 so R4
   * lands by implementing the composition semantics on top of an
   * already-stable schema field. Non-breaking when R4 ships.
   *
   * Plugin authors may set this today; it survives in the spec but does
   * not affect the resolved style.
   */
  readonly extends?: string;

  /**
   * Optional intent → token-delta map. Composes with the resolved preset
   * to produce the final tokens (e.g. `{'tone:executive': {ink: {hi:
   * '#fff'}}}`). The 6 default presets each ship one of these.
   *
   * Keys are pre-computed dot-prefixed strings — see
   * {@link KnownStyleIntentKey}.
   */
  readonly intent?: Partial<Record<KnownStyleIntentKey, DesignTokenOverrides>>;

  /**
   * Optional per-scene-type token overrides (e.g. all `quantities` scenes
   * in this preset use the warm accent). Marp's `section.lead { ... }`
   * rule, ported. Keys are `sceneType` strings; values are the same deep
   * partial as {@link DesignTokenOverrides}.
   */
  readonly sceneOverrides?: Readonly<Record<string, DesignTokenOverrides>>;
}

/**
 * The keys a {@link PresetPlugin.intent} map may pin on (e.g.
 * `'tone:executive'`, `'audience:technical'`). Pre-computed colon-prefixed
 * strings let a preset's intent block read flatly without nested objects.
 *
 * Derived from the closed enums on {@link StyleIntent} — adding a new tone
 * automatically widens this union.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.3
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
 * The scene-registry interface. The concrete implementation is internal to
 * the kit; consumers interact through {@link Engine.scenes}. Surfaced as an
 * interface so a {@link FeaturePlugin}'s `registerScenes` hook can be typed
 * without leaking the implementation class.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.7
 */
export interface SceneRegistry {
  /** Register a scene plugin. Throws {@link RegistryConflictError} on duplicate `sceneType`. */
  register(plugin: ScenePlugin<any>): void;
  /** Look up a plugin by `sceneType`. Returns `undefined` if not registered. */
  get(sceneType: string): ScenePlugin<any> | undefined;
  /** Check whether a `sceneType` is registered. */
  has(sceneType: string): boolean;
  /** Iterate all registered scene plugins, in registration order. */
  all(): ReadonlyArray<ScenePlugin<any>>;
}

/**
 * The preset-registry interface. Consumers interact through
 * {@link Engine.presets}.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.7
 */
export interface PresetRegistry {
  /** Register a preset. Throws {@link RegistryConflictError} on duplicate `presetName`. */
  register(plugin: PresetPlugin): void;
  /** Look up a preset by name. Returns `undefined` if not registered. */
  get(presetName: string): PresetPlugin | undefined;
  /** Check whether a preset name is registered. */
  has(presetName: string): boolean;
  /** Iterate all registered presets, in registration order. */
  all(): ReadonlyArray<PresetPlugin>;
}

/**
 * The TTS-provider-registry interface. Consumers interact through
 * {@link Engine.tts}.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.7
 */
export interface TtsRegistry {
  /** Register a TTS provider plugin. Throws {@link RegistryConflictError} on duplicate `providerId`. */
  register(plugin: TtsProviderPlugin): void;
  /** Look up a provider plugin by id. Returns `undefined` if not registered. */
  get(providerId: string): TtsProviderPlugin | undefined;
  /** Check whether a provider id is registered. */
  has(providerId: string): boolean;
  /** Iterate all registered providers, in registration order. */
  all(): ReadonlyArray<TtsProviderPlugin>;
}

/**
 * The translation-provider-registry interface. Consumers interact through
 * {@link Engine.translations}. Mirrors {@link TtsRegistry} — same shape,
 * different discriminator (`providerId` over the translation namespace).
 *
 * @see docs/translation.md
 */
export interface TranslationRegistry {
  /** Register a translation provider plugin. Throws {@link RegistryConflictError} on duplicate `providerId`. */
  register(plugin: TranslationProviderPlugin): void;
  /** Look up a provider plugin by id. Returns `undefined` if not registered. */
  get(providerId: string): TranslationProviderPlugin | undefined;
  /** Check whether a provider id is registered. */
  has(providerId: string): boolean;
  /** Iterate all registered providers, in registration order. */
  all(): ReadonlyArray<TranslationProviderPlugin>;
}

/**
 * The feature-registry interface. Consumers interact through
 * {@link Engine.features}.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.7
 */
export interface FeatureRegistry {
  /** Register a feature plugin. Throws {@link RegistryConflictError} on duplicate `name`. */
  register(plugin: FeaturePlugin): void;
  /** Look up a feature by name. Returns `undefined` if not registered. */
  get(name: string): FeaturePlugin | undefined;
  /** Check whether a feature name is registered. */
  has(name: string): boolean;
  /** Iterate all registered features, in registration order. */
  all(): ReadonlyArray<FeaturePlugin>;
}

/* ──────── Modifier registry — R3 forward-compat ──────── */

/**
 * Three tiers a modifier can pin on, mirroring Marp's three-tier directive
 * system (global / local / spot ↔ film / scene / beat).
 *
 * @see docs/design/plugin-architecture-strategy.md §4.6
 */
export type ModifierTier = 'film' | 'scene' | 'beat';

/**
 * Context handed to every {@link ModifierFn} call. Carries the tier the
 * modifier is firing at plus the surrounding film/scene/beat position.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.6
 */
export interface ModifierContext {
  /** Which tier this firing is at — `'film'`, `'scene'`, or `'beat'`. */
  readonly tier: ModifierTier;
  /** The whole film spec — modifiers may cross-reference. */
  readonly filmSpec: FilmSpec;
  /** 0-based scene index for `'scene'` / `'beat'` tiers. */
  readonly sceneIndex?: number;
  /** 0-based beat index for `'beat'` tier. */
  readonly beatIndex?: number;
}

/**
 * A modifier function. Receives the user-declared value, returns a
 * partial object merged into the target at the matching tier.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.6
 */
export type ModifierFn<TValue = unknown, TPartial = Record<string, unknown>> =
  (value: TValue, ctx: ModifierContext) => Partial<TPartial>;

/**
 * **R3 forward-compat — STUB REGISTRY.** The registry exists from day 1 and
 * is typed correctly; **it is empty in this build, and the resolver does
 * not consult it**. R3 lands by populating it (and by exposing a
 * user-facing config surface for projects to register custom modifiers).
 *
 * The registry is NOT a plugin kind. Modifiers are registered THROUGH a
 * {@link FeaturePlugin}'s `registerModifiers(reg)` hook — the hook fires
 * during `engine.use(featurePlugin)`.
 *
 * Carrying the typed registry from day 1 means R3 ships without breaking
 * the kit's public surface — the resolution semantics get layered on top
 * of an already-stable type.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.6
 */
export interface ModifierRegistry {
  /** Film-tier modifiers — fire once per film, merged into `FilmMeta`. */
  readonly film: Map<string, ModifierFn<unknown, Partial<FilmMeta>>>;
  /** Scene-tier modifiers — fire per scene, merged into the scene spec. */
  readonly scene: Map<string, ModifierFn<unknown, Partial<Scene>>>;
  /** Beat-tier modifiers — fire per beat, merged into the beat spec. */
  readonly beat: Map<string, ModifierFn<unknown, Partial<Beat>>>;
}

/* ──────── Feature plugin ──────── */

/**
 * Context passed to a {@link FeaturePlugin}'s `injectStyleTokens` hook. The
 * feature may inspect the resolved style so far and the active film/scene
 * to decide which tokens to inject.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.5
 */
export interface StyleContext {
  /** The whole film spec — the feature may branch on its content. */
  readonly filmSpec: FilmSpec;
  /** 0-based scene index when injection is scene-scoped. */
  readonly sceneIndex?: number;
}

/**
 * The output of a single scene render, between renderer and a
 * {@link FeaturePlugin}'s `wrapRender` hook. The feature receives this and
 * may return a wrapped element (e.g. captions overlay, watermark).
 *
 * @see docs/design/plugin-architecture-strategy.md §4.5
 */
export interface SceneOutput {
  /** The React element the scene renderer produced. */
  readonly element: React.ReactElement;
  /** The scene's `sceneType`. */
  readonly sceneType: string;
  /** 0-based scene index in the film. */
  readonly sceneIndex: number;
}

/**
 * Context handed to a {@link FeaturePlugin}'s `wrapRender` hook alongside
 * the scene's {@link SceneOutput}.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.5
 */
export interface RenderContext {
  /** The whole film spec. */
  readonly filmSpec: FilmSpec;
  /** The same `common` props the scene component received. */
  readonly common: CommonSceneProps;
}

/**
 * Per-beat record handed to {@link FeaturePlugin.afterRender}. Mirrors the
 * subset of the TTS stage manifest a side-output feature (captions,
 * transcript sidecar) actually needs.
 *
 * `seconds` is the clip's measured duration; `text` is the beat's narration
 * (or empty when the beat carries none). `sceneId` + `beatId` survive when
 * the spec author set them; otherwise the integer indices are the keys.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.5
 */
export interface AfterRenderBeat {
  readonly sceneIndex: number;
  readonly beatIndex: number;
  readonly sceneId?: string;
  readonly beatId?: string;
  readonly seconds: number;
  readonly text: string;
}

/**
 * Context passed to {@link FeaturePlugin.afterRender}. The render has
 * completed (`outPath` is the mp4 or still on disk); features that want to
 * write sidecars (captions, transcripts, chapter manifests) consume the
 * per-beat TTS timings and the spec narration here.
 *
 * `ttsProviderId` is `'skipped'` when `--skip-tts` was on — the cascade
 * synthesizes estimated per-beat seconds from word count so sidecar
 * generation still works end-to-end without audio.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.5
 */
export interface AfterRenderContext {
  readonly filmSpec: FilmSpec;
  /** Absolute path of the rendered mp4 (or still). */
  readonly outPath: string;
  /** Output directory the render landed in — sidecars typically write here. */
  readonly outputDir: string;
  /** Resolved style — features may surface tokens in their sidecars. */
  readonly style: ResolvedStyle;
  /** Per-beat record: scene index, beat index, seconds, narration text. */
  readonly beats: ReadonlyArray<AfterRenderBeat>;
  /** TTS provider id the render used (or `'skipped'` when --skip-tts). */
  readonly ttsProviderId: string;
}

/**
 * Props the kit passes to a {@link FeaturePlugin.wrapsScenes} component.
 * The composition mounts the component inside each scene's `<Sequence>`,
 * alongside the scene's own renderer; the feature decides what to layer
 * (narration audio overlay, captions, watermark, lower-thirds, …).
 *
 * Per-beat slots carry the beat data + (optionally) the path to a
 * synthesized audio clip — see {@link BeatTimelineSlot.audio}. The feature
 * resolves the URL via Remotion's `staticFile()`.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.5
 */
export interface SceneFeatureProps {
  /** The slot occupied by the host scene in the film timeline. */
  readonly ts: TimelineSlot;
  /** 0-based scene index in the film. */
  readonly sceneIndex: number;
  /** Total scene count. */
  readonly sceneCount: number;
  /** Film meta block. */
  readonly meta: FilmMeta;
  /** Resolved style bundle. */
  readonly style: ResolvedStyle;
}

/**
 * Props the kit passes to a {@link FeaturePlugin.wrapsFilm} component. The
 * component is mounted ONCE at film scope (outside the per-scene Sequence
 * stack); it receives the whole timeline so it can lay continuous overlays
 * (e.g. a background-music bed that ducks while narration plays).
 *
 * `beats` is a flattened view of every beat slot across every scene, each
 * carrying its absolute start frame and persisted-audio path — so a feature
 * can compute "is narration playing at frame N" without re-walking the
 * spec or the schedule.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.5
 */
export interface FilmFeatureProps {
  /** Film meta block. */
  readonly meta: FilmMeta;
  /** Total film length in frames. */
  readonly totalFrames: number;
  /** Composition fps (mirror of `meta.resolution.fps` after defaulting). */
  readonly fps: number;
  /** Resolved style bundle. */
  readonly style: ResolvedStyle;
  /**
   * Every beat across every scene, projected to absolute film frames.
   * Lets the feature compute timeline-wide windows (narration ducking,
   * caption windows, chapter markers) in one pass.
   */
  readonly beats: ReadonlyArray<FilmFeatureBeatSlot>;
  /**
   * R8: per-beat frame-quantised word timings, when the TTS provider
   * populated them and the CLI inlined them into the render entry. A
   * feature that needs per-word reactivity (music-bed ducking, captions
   * highlight) reads this rather than the per-beat windows on
   * {@link beats}. Absent (or no entry for a given beat) means "fall
   * through to per-beat behaviour" — the gracefully-degraded baseline
   * that keeps existing audio-bed users unaffected.
   *
   * `words[]` frame coordinates are CLIP-RELATIVE (0 == clip start) —
   * the same shape the karaoke hook surfaces. A consumer wanting
   * film-absolute frames adds the matching slot's
   * {@link FilmFeatureBeatSlot.startFrame}.
   */
  readonly wordTimings?: ReadonlyArray<FilmFeatureWordTimingSlot>;
  /**
   * R8: per-scene window + cluster tag, projected to absolute film
   * frames. A music-bed feature reads this to compose cluster-aware
   * mix gestures (a `narrative` big-idea swell in the gap after a
   * `categorization` tension scene; flat ducking for `comparison` or
   * `flow` scenes). Carries the scene type AND the
   * {@link CognitiveCluster} tag so a feature can branch on the
   * native taxonomy or on the scene-type name.
   *
   * Derived from the engine's scene registry at composition time —
   * the spec author never declares it. Absent when no scene plugin is
   * registered for the spec's scene types (the schedule still renders
   * but cluster-aware gestures gracefully degrade to flat behaviour).
   */
  readonly sceneClusters?: ReadonlyArray<FilmFeatureSceneClusterSlot>;
}

/**
 * One beat slot as projected to film-absolute frame coordinates for
 * consumption by {@link FilmFeatureProps}.
 */
export interface FilmFeatureBeatSlot {
  /** 0-based scene index in the film. */
  readonly sceneIndex: number;
  /** 0-based beat index within the scene. */
  readonly beatIndex: number;
  /** Absolute film frame the beat starts at. */
  readonly startFrame: number;
  /** Beat window length in frames. */
  readonly frames: number;
  /** Path to a persisted per-beat audio clip (absent until TTS runs). */
  readonly audio?: string;
}

/**
 * R8: one beat's frame-quantised word timings, addressed by
 * `(sceneIndex, beatIndex)`. Lives on {@link FilmFeatureProps.wordTimings}
 * — the music-bed feature reads it to duck per-word rather than
 * per-beat (the duck onset aligns to the actual first-word start, not
 * the beat window start).
 *
 * `words[].startFrame` / `endFrame` are CLIP-RELATIVE — to translate
 * to film-absolute frames add the matching
 * {@link FilmFeatureBeatSlot.startFrame}.
 */
export interface FilmFeatureWordTimingSlot {
  /** 0-based scene index in the film. */
  readonly sceneIndex: number;
  /** 0-based beat index within the scene. */
  readonly beatIndex: number;
  /** Frame-quantised word timings (clip-relative). */
  readonly words: ReadonlyArray<WordTiming>;
}

/**
 * R8: one scene's window + cluster tag, in absolute film-frame
 * coordinates. Lives on {@link FilmFeatureProps.sceneClusters} — a
 * feature that mixes by cognitive cluster (the audio-bed's
 * climax-swell logic) reads this to find boundaries between
 * `categorization` / `flow` / `narrative` etc.
 *
 * `cluster` mirrors the {@link ScenePlugin.cluster} field of the
 * scene's registered plugin. `null` is the chrome-only tag
 * (`frame` / `recap`) — features should treat it as "no cluster".
 *
 * `sceneType` carries the scene's registered `sceneType` discriminator
 * (`'tension'`, `'walkthrough'`, `'big-idea'`, …) so a feature can
 * branch on the scene-type name AS WELL AS the cognitive cluster.
 * Useful when one cluster spans multiple semantic moves (e.g.
 * `narrative` covers both `big-idea` and `provocation`, but a
 * music-bed wants the swell only on `big-idea`).
 */
export interface FilmFeatureSceneClusterSlot {
  /** 0-based scene index in the film. */
  readonly sceneIndex: number;
  /** Scene's `sceneType` discriminator. */
  readonly sceneType: string;
  /** Absolute film frame the scene starts at. */
  readonly startFrame: number;
  /** Absolute film frame the scene ends at (exclusive). */
  readonly endFrame: number;
  /**
   * Scene's {@link CognitiveCluster} tag — mirrors
   * {@link ScenePlugin.cluster}. `null` is the chrome-only tag
   * (`frame` / `recap`).
   */
  readonly cluster: CognitiveCluster | null;
}

/**
 * The FeaturePlugin — cross-cutting concerns that touch multiple registries
 * (captions, watermarks, music, lower-thirds, narration overlay).
 *
 * The pattern that lets `@bjelser/core` express itself as a feature pack
 * rather than a god-object. A feature plugin can:
 *   - Register child plugins of any kind via `registerScenes`,
 *     `registerPresets`, `registerTtsProviders`, `registerModifiers` —
 *     these hooks fire during `engine.use(featurePlugin)`.
 *   - Inject style tokens at resolution time (`injectStyleTokens`).
 *   - Wrap a scene's rendered output (`wrapRender`).
 *   - Mount a component alongside every scene (`wrapsScenes`).
 *   - Contribute depth rules (`depthRules`).
 *   - Preprocess the spec (`preprocessSpec` — R6 forward-compat).
 *
 * Every lifecycle hook is optional, so adding new hooks later is additive
 * (non-breaking).
 *
 * **R3 forward-compat**: {@link registerModifiers} populates the engine's
 * {@link ModifierRegistry} — the registry is typed today but the resolver
 * does not consult it.
 *
 * **R6 forward-compat**: {@link preprocessSpec} runs BEFORE schema
 * validation — the slot for a microsyntax decoder. Identity by default in
 * this build.
 *
 * @example
 * ```ts
 * export const narrationFeature: FeaturePlugin = {
 *   kind: 'feature',
 *   name: 'narration',
 *   version: '1.0.0',
 *   wrapsScenes: NarrationOverlay, // mounts per-beat <Audio>
 * };
 * ```
 *
 * @see docs/design/plugin-architecture-strategy.md §4.5
 */
export interface FeaturePlugin extends PluginBase {
  /** The plugin-kind discriminator. */
  readonly kind: 'feature';

  /** Register additional scene plugins (fires during `engine.use(this)`). */
  registerScenes?(reg: SceneRegistry): void;
  /** Register additional presets (fires during `engine.use(this)`). */
  registerPresets?(reg: PresetRegistry): void;
  /** Register additional TTS providers (fires during `engine.use(this)`). */
  registerTtsProviders?(reg: TtsRegistry): void;
  /**
   * Register additional translation providers (fires during
   * `engine.use(this)`). Mirrors {@link registerTtsProviders}.
   */
  registerTranslationProviders?(reg: TranslationRegistry): void;
  /**
   * Register narrative-quality judge providers (fires during
   * `engine.use(this)`). Consumed by `docent assert --narrative
   * --judges`. Additive — features that don't ship a judge omit it.
   */
  registerNarrativeJudges?(reg: NarrativeJudgeRegistry): void;
  /**
   * **R3 forward-compat.** Populate the engine's {@link ModifierRegistry}.
   * The hook fires during `engine.use(this)` but the resolver currently
   * does not consult the registry — R3 lands by wiring it through.
   */
  registerModifiers?(reg: ModifierRegistry): void;

  /**
   * Inject style tokens that augment the resolved preset. Called by the
   * style resolver after the preset has been composed. Return a
   * {@link DesignTokenOverrides} (deep-partial) to layer on top, or
   * `undefined` to inject nothing.
   */
  injectStyleTokens?(
    resolved: ResolvedStyle,
    ctx: StyleContext,
  ): DesignTokenOverrides | undefined;

  /** Wrap or post-process a scene's rendered output (e.g. overlay captions). */
  wrapRender?(rendered: SceneOutput, ctx: RenderContext): SceneOutput;

  /**
   * Optional component the composition mounts INSIDE every scene's
   * `<Sequence>` alongside the scene's own renderer. The feature decides
   * what to layer (audio overlay, captions, watermark, …). Receives the
   * scene's timeline slot — per-beat audio paths arrive on
   * `ts.beats[].audio` when the TTS stage persisted them.
   *
   * The narration feature ships this to thread per-beat `<Audio>` into the
   * composition without composition.tsx depending on `@bjelser/core`.
   */
  readonly wrapsScenes?: React.ComponentType<SceneFeatureProps>;

  /**
   * Optional component the composition mounts ONCE at film scope, OUTSIDE
   * the per-scene `<Sequence>` stack. The mount point is global: the
   * component spans the entire film timeline, sees absolute frames via
   * `useCurrentFrame()`, and can mount overlays (bg-music bed, watermark,
   * lower-thirds, intro/outro stings) that should not restart at scene
   * boundaries.
   *
   * Contrast with {@link wrapsScenes}, which mounts INSIDE each scene's
   * Sequence (so per-scene state is scene-relative).
   *
   * Sized to the film's resolution — the component receives the resolved
   * film meta + total frame count + a flat list of beat slots so audio /
   * caption work can react to the actual narration timing.
   */
  readonly wrapsFilm?: React.ComponentType<FilmFeatureProps>;

  /**
   * Optional film-level validation hook. The validator dispatches every
   * spec to every registered feature's `validateSpec?` so cross-cutting
   * concerns (a music bed referencing a missing file, a captions feature
   * checking the spec carries narrations) surface BEFORE the slow
   * render. Receives `{filmId, projectRoot}` so fs-aware checks (e.g.
   * "does <publicDir>/audio/<meta.music> exist on disk") can run.
   *
   * Return an empty array (or `undefined`) for "no issues". The returned
   * {@link SceneIssue}s are re-rooted under `meta.…` (or wherever the
   * `path` says) and surface as plain {@link Issue}s on
   * `engine.validate(spec)`.
   *
   * Optional so most features don't pay for it. The orchestrator
   * tolerates throws (turned into a single error-severity issue).
   */
  validateSpec?(
    spec: FilmSpec,
    ctx: {readonly filmId: string; readonly projectRoot?: string},
  ): ReadonlyArray<SceneIssue>;

  /**
   * Post-render side-effect hook. Called by the cascade orchestrator AFTER
   * `runRenderStage` returns and the mp4 (or still) has landed on disk.
   * Receives the per-beat TTS timings + the spec's narration text, so a
   * feature can write captions (SRT/VTT), transcripts, chapter markers, or
   * any other sidecar that pairs the rendered video with text.
   *
   * Multiple features can register `afterRender` — the orchestrator calls
   * them in feature-registration order. A throw is surfaced as a render
   * error; a feature that wants to be lenient should catch its own errors.
   *
   * Additive (Wave E2): pre-existing plugins that don't implement this hook
   * are unaffected.
   */
  afterRender?(ctx: AfterRenderContext): void | Promise<void>;

  /**
   * **R6 forward-compat.** Pre-process the spec BEFORE schema validation
   * (e.g. expand microsyntax shortcuts like `@@@` directives). Identity by
   * default in this build; the orchestrator does not yet chain features
   * through this hook. When R6 lands, multiple features compose in
   * registration order.
   */
  preprocessSpec?(spec: FilmSpec): FilmSpec;

  /** Contribute film-scoped depth rules. */
  readonly depthRules?: ReadonlyArray<DepthRule<unknown>>;
}

// ---------------------------------------------------------------------------
// §4.7 — Engine surface types (the Engine class lives in ./engine.ts)
// ---------------------------------------------------------------------------

/**
 * Render options accepted by `engine.render(spec, opts)`. The CLI surfaces
 * these via `docent build`. Every field is optional; callers pass `{}` for
 * defaults.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.7
 */
export interface RenderOptions {
  /** Output path for the rendered MP4. Defaults to `<outputDir>/<filmId>.mp4`. */
  readOutPath?: string;
  /** Render scale (0.25, 0.5, 1.0). Defaults to 1.0. */
  scale?: number;
  /** Render only a still frame at the given second offset. Skips video encode. */
  still?: number;
  /** Override the codec; defaults to h264. */
  codec?: 'h264' | 'h265' | 'vp8' | 'vp9' | 'prores';
  /** Pass through to Remotion's `renderMedia`. */
  concurrency?: number;
  /** Path to the cache directory the cascade may write to. */
  cacheDir?: string;
  /** Override the output directory (default: `<cwd>/out`). */
  outputDir?: string;
  /**
   * Absolute path to the Remotion entry script the render shell-out invokes.
   * The kit ships a helper (`registerKitRoot`) but does NOT statically know
   * which plugins to load; the invoker (CLI) generates a per-render entry
   * that statically imports the required plugins and passes that path here.
   * If omitted, the render stage hard-fails with a clear error.
   */
  entryPath?: string;
  /**
   * Optional Remotion `--public-dir` pass-through. ALSO used by the TTS stage
   * to determine where to persist per-beat audio bytes (under
   * `<publicDir>/audio/<filmId>/`). The narration feature reads these via
   * Remotion's `staticFile()` to overlay `<Audio>` during render.
   */
  publicDir?: string;
  /**
   * Absolute path to the consumer's project root. Threaded into
   * `engine.validate(spec, {projectRoot})` so fs-aware scene/feature
   * validators (figure → image, audio-bed → music) can probe disk.
   * When omitted, those validators degrade to no-ops for the fs part
   * (the structural part still runs).
   */
  projectRoot?: string;
  /** Path to the `remotion` bin. Defaults to a walked-up node_modules lookup. */
  remotionBin?: string;
  /**
   * Skip the TTS stage entirely. The render still runs; the resulting mp4
   * has no narration audio (the kit's default composition is silent — audio
   * overlay is a feature-plugin concern). Mirrors `--skip-tts` on the legacy
   * engine cascade. Useful for fast iteration on visuals.
   */
  skipTts?: boolean;
  /**
   * Working directory passed to the `remotion render` subprocess. Remotion
   * finds `remotion.config.ts` by walking up from cwd to the closest
   * `package.json`. If your project's remotion.config.ts lives at the repo
   * root but you're invoking from a subpackage (e.g. an acceptance-test
   * dir), set this to the repo root so the config is picked up.
   */
  renderCwd?: string;
  /**
   * Optional hook the orchestrator calls AFTER the TTS stage finishes
   * persisting per-beat audio + manifest. Lets the caller (typically
   * `@bjelser/cli`) regenerate the Remotion entry script so it can statically
   * `import` the freshly-written per-film audio manifest. Returns the entry
   * path to use for the render — if it returns the same path, the orchestrator
   * uses it unchanged. Surfaced as a hook (rather than re-running entry
   * generation inside the kit) because picking plugins and writing entry
   * scripts is a CLI concern, not a kit concern.
   */
  onTtsComplete?: (info: {
    readonly publicDir: string | undefined;
    readonly filmId: string;
  }) => Promise<string> | string;
  /**
   * Target narration language (ISO 639-1: `'es'`, `'fr'`, `'ja'`, `'zh'`,
   * `'de'`, etc.). When set, the cascade runs a translation stage BEFORE
   * TTS, mapping each beat's `narration` through the active
   * {@link TranslationProvider}. When omitted, the cascade renders the
   * narration as authored.
   *
   * The translation provider is resolved by precedence:
   *   1. `RenderOptions.translationProvider` (CLI override).
   *   2. `meta.translation.provider` on the spec.
   *   3. The well-known `'noop'` fallback (ships in `@bjelser/core`).
   *
   * When the resolved provider is `'noop'`, the cascade emits a one-line
   * warning (`no translation provider configured — narration unchanged`)
   * and passes every beat through unchanged. This is the safe default: a
   * user who passes `--lang es` without configuring an LLM provider gets a
   * built film (with source-language narration) rather than a hard failure.
   */
  lang?: string;
  /**
   * Voice id override for the TTS stage. When set, the TTS stage uses this
   * voice instead of `meta.voice`. The CLI uses this together with
   * `--voice` to let a translated film pick a voice that speaks the target
   * language.
   *
   * Precedence (highest first):
   *   `RenderOptions.voice` > `meta.tts.providerOptions.voice` >
   *   `meta.voice` > the provider's built-in default.
   */
  voice?: string;
  /**
   * Translation provider id to use. When omitted, the cascade reads
   * `meta.translation.provider` (or falls back to `'noop'`). Surfaced on
   * RenderOptions so a CLI flag can override the spec without editing it.
   */
  translationProvider?: string;
  /**
   * Content-hash TTS cache. Defaults to `true` — every build reuses
   * persisted per-beat audio bytes when the beat's (text + voice + model +
   * providerOptions) hash matches the manifest. Set to `false` to force
   * every beat to re-synthesize (CLI: `--no-tts-cache`). Useful when a
   * provider version bump or an out-of-band post-process step changes the
   * audio without changing the hash.
   */
  useTtsCache?: boolean;
  /**
   * Loudness normalization target — integrated LUFS. When set, the
   * cascade runs a post-render two-pass ffmpeg `loudnorm` over the
   * un-normalized MP4 and writes a SECOND file alongside it with a
   * `-lufs-<target>` suffix (the original is preserved untouched). When
   * omitted, audio passes through at whatever level the TTS + audio-bed
   * mix produced — the legacy default that keeps existing renders byte-
   * identical.
   *
   * The CLI parses the `--lufs <target>` flag and resolves preset names
   * (`streaming` → -16, `broadcast` → -23, `youtube` → -14, etc.) to the
   * numeric LUFS value via {@link resolveLoudnessTarget}.
   *
   * @see packages/kit/src/cascade/loudnorm.ts
   */
  lufs?: number;
}

/**
 * The result of a successful `engine.render(spec, opts)` call.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.7
 */
export interface RenderResult {
  /** Where the MP4 (or still) landed on disk. */
  readonly outPath: string;
  /** Render duration in ms — surfaced in the `docent build` summary. */
  readonly durationMs: number;
  /** Per-beat audio metrics (if the active TTS provider populated them). */
  readonly tts?: ReadonlyArray<{
    /** 0-based scene index. */
    readonly sceneIndex: number;
    /** 0-based beat index. */
    readonly beatIndex: number;
    /** Words-per-minute the provider measured (null if unmeasured). */
    readonly wpm: number | null;
    /** Final clip duration in seconds (post-trim). */
    readonly clipSeconds: number;
  }>;
  /**
   * Loudness normalization summary — present only when `opts.lufs` is set.
   * Carries the target, the pre-normalize integrated reading, the post-
   * normalize integrated reading, and the path of the normalized MP4
   * (the un-normalized original remains at {@link outPath}).
   *
   * KPI: `landed - target` should sit within ±0.5 LU.
   */
  readonly loudness?: {
    readonly target: number;
    readonly measured: number;
    readonly landed: number;
    readonly truePeak: number;
    readonly normalizedPath: string;
  };
}

/**
 * A single issue surfaced by `engine.validate(spec)`. The flat aggregation
 * of: top-level shape checks (kit-owned), per-scene plugin `validate`
 * results (re-rooted to film-level paths), and — in the full cascade —
 * AJV schema errors. Registry conflicts surface as throws, not as Issues.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.7
 */
export interface Issue {
  /** Dotted/bracketed path into the spec (e.g. `'scenes[2].beats[0].narration'`). */
  readonly path: string;
  /** Human-readable explanation. */
  readonly message: string;
  /** Severity — `'error'` blocks render; `'warning'` flags but allows. */
  readonly severity: 'error' | 'warning';
  /** Optional machine-readable code (e.g. `'meta.id.missing'`). */
  readonly code?: string;
  /** When the issue comes from a per-plugin validator, the plugin's name. */
  readonly source?: string;
}

/**
 * The discriminated union of every plugin shape `engine.use()` accepts.
 * The input type to `engine.use(plugin)`; the engine narrows on `kind` and
 * routes to the right registry.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.1
 */
export type Plugin =
  | ScenePlugin<any>
  | PresetPlugin
  | TtsProviderPlugin
  | TranslationProviderPlugin
  | FeaturePlugin;

// ---------------------------------------------------------------------------
// Narrative-quality judges — the LLM half of `docent assert --narrative`.
// ---------------------------------------------------------------------------
//
// The lint half (`@bjelser/core/narrative-quality/lint-rules.ts`) is a
// deterministic regex pass. The judge half asks an LLM to check for the
// things a regex cannot: does the voice drift? do the narration numbers
// match the scene's structured data? is the prose redundant with the
// diagram on screen?
//
// The judge interface is intentionally tiny: one method, typed input,
// typed output. The kit ships *no* default implementation — providers
// land in `@bjelser/core` (a noop) and `@bjelser/tts-openai` (a real
// gpt-4o-mini judge). Consumers register them like any other plugin
// and the CLI picks one via `--judge-provider <id>`.

/**
 * The kind of judgment requested. The same `judge()` call routes all
 * three — the provider switches on `kind` and emits the right shape.
 */
export type JudgeKind = 'voice' | 'accuracy' | 'viz-placement';

/**
 * A beat's narration paired with its scene-level context. Every judge
 * call carries the same envelope; the provider switches on `kind`.
 */
export interface JudgeInput {
  /** Which dimension to grade. */
  readonly kind: JudgeKind;
  /** Film id for diagnostics. */
  readonly filmId: string;
  /** 0-based scene index. */
  readonly sceneIndex: number;
  /** 0-based beat index. */
  readonly beatIndex: number;
  /** Scene `type` (`structure`, `quantities`, `passage`, …). */
  readonly sceneType: string;
  /** Scene heading or kicker, when present. */
  readonly sceneHeading?: string;
  /** The beat's narration text. */
  readonly narration: string;
  /**
   * Free-form scene cluster — sibling beats' narration text, useful for
   * the voice judge to see the local register.
   */
  readonly sceneCluster?: ReadonlyArray<string>;
  /**
   * Structured scene data the accuracy judge cross-checks against (e.g.
   * quantities metrics, timeline events). Free-shape; the provider
   * stringifies it for the prompt.
   */
  readonly sceneData?: Readonly<Record<string, unknown>>;
  /**
   * Film domain — `meta.mode` (`ar`, `pr`, `ex`) + `meta.subject` when
   * known. Helps a judge tell "this is a security PR review" from
   * "this is a friendly explainer".
   */
  readonly domain?: {
    readonly mode?: string;
    readonly subject?: string;
    readonly register?: string;
  };
}

/** The shared shape every judge result carries. */
export interface JudgeOutputBase {
  /** Echo of the input kind — caller switches on this. */
  readonly kind: JudgeKind;
  /** `true` when no API key / provider available; caller treats as warn. */
  readonly skipped?: boolean;
  /** When `skipped` is set, why. */
  readonly skippedReason?: string;
  /** Free-form provider-side notes for diagnostics. */
  readonly note?: string;
}

/**
 * Voice judge: does this beat read as the surveyed voice? where does
 * it drift? The drift axis is a closed enum so the verdict aggregator
 * can tally drift types across the film.
 */
export interface JudgeVoiceOutput extends JudgeOutputBase {
  readonly kind: 'voice';
  readonly authentic: boolean;
  readonly drift: 'casual' | 'academic' | 'breathless' | 'flat' | null;
  /** Up to ~3 short quoted snippets from the narration that show the drift. */
  readonly evidence: ReadonlyArray<string>;
}

/** One numeric (or factual) mismatch the accuracy judge surfaced. */
export interface AccuracyMismatch {
  /** The claim made in narration. */
  readonly narrationClaim: string;
  /** What the scene's structured data actually said. */
  readonly sceneTruth: string;
}

/**
 * Accuracy judge: do the numbers / facts in narration match the
 * scene's structured data? Returns zero or more mismatches.
 */
export interface JudgeAccuracyOutput extends JudgeOutputBase {
  readonly kind: 'accuracy';
  readonly consistent: boolean;
  readonly mismatches: ReadonlyArray<AccuracyMismatch>;
}

/**
 * Viz-placement judge: is this prose better said by the diagram than
 * by the narrator? Surfaces the redundancy + a suggested cut.
 */
export interface JudgeVizPlacementOutput extends JudgeOutputBase {
  readonly kind: 'viz-placement';
  readonly redundant: boolean;
  /** The narration phrase that the diagram already shows. */
  readonly redundantPhrase?: string;
  /** What the narrator could say instead. */
  readonly suggestion?: string;
}

export type JudgeOutput =
  | JudgeVoiceOutput
  | JudgeAccuracyOutput
  | JudgeVizPlacementOutput;

/**
 * The judge-provider plugin contract. A provider lives behind a stable
 * `providerId` and answers one judge call at a time. The provider chooses
 * its own model + caching policy; the kit only owns the interface.
 *
 * Why not a `PluginKind`? Judges are an opt-in CI-only concern (`docent
 * assert --narrative --judges`); folding them into `PluginKind` would
 * widen the plugin discriminator for every consumer. Providers register
 * via {@link FeaturePlugin.registerNarrativeJudges} instead.
 */
export interface NarrativeJudgeProvider {
  /** Stable id surfaced in `--judge-provider <id>`. */
  readonly providerId: string;
  /** Free-form display name (`'noop'`, `'openai-gpt-4o-mini'`). */
  readonly displayName: string;
  /** Run one judgment. */
  judge(input: JudgeInput): Promise<JudgeOutput>;
}

/**
 * The judge-provider registry. Looks up providers by id; populated
 * through {@link FeaturePlugin.registerNarrativeJudges}.
 */
export interface NarrativeJudgeRegistry {
  register(provider: NarrativeJudgeProvider): void;
  get(providerId: string): NarrativeJudgeProvider | undefined;
  has(providerId: string): boolean;
  all(): ReadonlyArray<NarrativeJudgeProvider>;
}
