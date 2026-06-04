// @bjelser/kit — public surface.
//
// Everything exported here is part of the public contract. Breaking any of
// these is a major version bump.
//
// What lives here:
//   - The Engine class (the only constructor consumers need).
//   - Every protocol type (PluginBase, ScenePlugin, PresetPlugin,
//     TtsProviderPlugin, FeaturePlugin, ModifierRegistry shape).
//   - The closed cognitive-cluster taxonomy.
//   - The design-token, style, spec, and TTS type vocabulary every plugin
//     reads and contributes to.
//   - The conflict / validation utilities the kit uses internally — exposed
//     so a test suite or doctor surface can match on `RegistryConflictError`.
//
// What is NOT exported:
//   - The concrete registry implementation classes
//     (`SceneRegistryImpl`, …). Consumers interact through the `Engine`
//     instance.
//   - Internal helpers (`describe()`, etc.).

// ---------- The Engine ------------------------------------------------------

export {Engine} from './engine';

// ---------- Protocols -------------------------------------------------------

export type {
  // Base
  PluginBase,
  PluginKind,
  Plugin,

  // Scene
  ScenePlugin,
  SceneRenderProps,
  CommonSceneProps,
  TimelineSlot,
  BeatTimelineSlot,
  SceneIssue,
  SceneValidationContext,
  BeatResolutionContext,
  DepthRule,
  DepthCheckContext,
  DepthFinding,
  JudgeDimension,

  // Preset
  PresetPlugin,
  KnownStyleIntentKey,

  // Feature
  FeaturePlugin,
  StyleContext,
  SceneOutput,
  RenderContext,
  SceneFeatureProps,
  FilmFeatureProps,
  FilmFeatureBeatSlot,
  FilmFeatureWordTimingSlot,
  FilmFeatureSceneClusterSlot,
  AfterRenderBeat,
  AfterRenderContext,

  // Modifier (R3 forward-compat)
  ModifierTier,
  ModifierFn,
  ModifierContext,
  ModifierRegistry,

  // Registries (interfaces only; impls are internal)
  SceneRegistry,
  PresetRegistry,
  TtsRegistry,
  FeatureRegistry,

  // Engine surface
  RenderOptions,
  RenderResult,
  Issue,

  // Narrative-quality judges (opt-in CI surface)
  JudgeKind,
  JudgeInput,
  JudgeOutput,
  JudgeOutputBase,
  JudgeVoiceOutput,
  JudgeAccuracyOutput,
  JudgeVizPlacementOutput,
  AccuracyMismatch,
  NarrativeJudgeProvider,
  NarrativeJudgeRegistry,
} from './protocols';

// ---------- TTS (Build A's contract — recapitulated by the kit) -------------

export type {
  TtsCapabilities,
  TtsProvider,
  TtsProviderPlugin,
  TtsProviderContext,
  TtsSynthesisOptions,
  TtsSynthesisResult,
  TtsBeatMetrics,
  TtsVoice,
  WordAlignment,
  WordTiming,
} from './types/tts';

export {TtsProviderError} from './types/tts';

// ---------- Translation (one spec, N narration languages) -------------------

export type {
  TranslationCapabilities,
  TranslationProvider,
  TranslationProviderPlugin,
  TranslationProviderContext,
} from './types/translation';

export {
  TranslationProviderError,
  DEFAULT_LANG_TO_VOICE,
  defaultVoiceForLang,
} from './types/translation';

export type {TranslationRegistry} from './protocols';

// ---------- Narrative-quality judges (prompts + parsers) --------------------

export {
  VOICE_JUDGE_SYSTEM,
  ACCURACY_JUDGE_SYSTEM,
  VIZ_PLACEMENT_JUDGE_SYSTEM,
  buildVoiceJudgePrompt,
  buildAccuracyJudgePrompt,
  buildVizPlacementJudgePrompt,
  parseVoiceJudge,
  parseAccuracyJudge,
  parseVizPlacementJudge,
} from './judges';

// ---------- Spec types ------------------------------------------------------

export type {
  FilmSpec,
  FilmMeta,
  FilmRegister,
  FilmTtsConfig,
  FilmTranslationConfig,
  Scene,
  SceneArchetype,
  SceneVariant,
  SceneAssertConfig,
  SceneAssertMaskRegion,
  Beat,
  BeatPace,
  BeatShot,
  BeatCadence,
  BeatSetDirective,
  BeatTransformDirective,
} from './types/spec';

// ---------- Style types -----------------------------------------------------

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

export {
  StyleValidationError,
  DEFAULT_STYLE_PRESETS,
  STYLE_TONES,
  STYLE_AUDIENCES,
  STYLE_MEDIUMS,
  STYLE_DENSITIES,
  STYLE_THEMES,
  STYLE_EMPHASES,
} from './types/style';

// ---------- Design tokens ---------------------------------------------------

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

// ---------- Visualization style --------------------------------------------

export type {
  VisualizationStyle,
  LegendPosition,
} from './types/visualization-style';

export {LEGEND_POSITIONS} from './types/visualization-style';

// ---------- Cognitive cluster taxonomy --------------------------------------

export type {CognitiveCluster} from './taxonomy/cognitive-clusters';

export {
  COGNITIVE_CLUSTERS,
  COGNITIVE_CLUSTER_LABELS,
  isCognitiveCluster,
} from './taxonomy/cognitive-clusters';

// ---------- Validation utilities --------------------------------------------

export {
  RegistryConflictError,
  assertNoConflict,
} from './validation/conflict';

export {
  assertPluginBase,
  assertScenePluginShape,
} from './validation/plugin';

// ---------- Framework hooks (Phase A.4 / A.5 / A.6 / A.8) -------------------
//
// The Engine's own `validate / schema` methods delegate to these. They're
// re-exported as standalone functions so a third-party tool (a doctor surface,
// a linter, a custom CI gate) can call them directly without going through
// the Engine — pure, side-effect-free given a constructed Engine.

export type {SceneFitSignal} from './protocols';

export {validateSpec} from './frameworks/validate';
export {depthCheck} from './frameworks/depthcheck';
export {collectJudgeDimensions} from './frameworks/judge';
export {computeSchema} from './schema/from-registry';

// ---------- Scene variants (R3 — archetype × visual variant) ---------------
//
// The resolver and its overlay token shape. A scene tagged with an
// `archetype` and/or `variant` is rendered with a small overlay bag
// carried on `CommonSceneProps.variantTokens`. A scene component reads
// `variantTokens.titleScale` (etc.) and adjusts its render; a scene
// that doesn't read them renders the standard treatment.

export type {SceneVariantTokens} from './frameworks/scene-variants';
export {
  resolveSceneVariant,
  STANDARD_VARIANT_TOKENS,
  ARCHETYPE_NUDGE,
} from './frameworks/scene-variants';

// ---------- Frame schedule (for render-check and other introspection) --------
//
// `buildFrameSchedule` resolves a film's per-scene + per-beat frame windows
// against a constructed Engine. Surface it so external tooling (a docent
// render-check command, a third-party visualizer, a doctor pass) can ask
// "what frame does scene N occupy?" without re-implementing the timing math.

export {buildFrameSchedule} from './remotion/schedule';
export type {
  FrameSchedule,
  SceneSchedule,
  BeatSchedule,
  TtsAudioMap,
} from './remotion/schedule';

// ---------- Aspect-aware canvas dimensions + STAGE -------------------------
//
// `meta.aspect` → canvas dims (`resolveDimensions`) → `useStage()` hook each
// scene calls to retrieve its aspect-aware STAGE rectangle + world
// dimensions. The composition reads `resolveDimensions`; every scene
// component reads `useStage`.

export {
  STAGE_16_9,
  STAGE_9_16,
  STAGE_1_1,
  resolveDimensions,
  resolveStage,
  useStage,
} from './remotion/dimensions';

export type {StageRect} from './remotion/dimensions';

// ---------- Distribution / drip publication (R4) ----------------------------
//
// The queue schema, platform vocabulary, and audit-line shape every drip
// adapter speaks. The CLI's `docent drip` surface and `@bjelser/core`'s
// platform adapters both import these — keeping them in @bjelser/kit means
// a third-party adapter never has to depend on the CLI shell.

export type {
  Platform,
  Cadence,
  ScheduleSpec,
  ScheduleCron,
  ScheduleDatetime,
  ScheduleCadence,
  DripStatus,
  PlatformResult,
  DripAuditLine,
  DripEntry,
  DripManifest,
} from './types/distribution';

export {
  ALL_PLATFORMS,
  isPlatform,
  isCronSchedule,
  isDatetimeSchedule,
  isCadenceSchedule,
  emptyManifest,
} from './types/distribution';

// ---------- R5 — word-level timing IR (render-side hook) -------------------
//
// `useBeatWordTimings(sceneIndex, beatIndex)` surfaces the per-beat
// frame-quantised word timings inlined by the CLI's render-entry generator
// from the persisted TTS manifest. A scene component reads this to drive
// karaoke-style reveal; absence is the gracefully-degraded baseline.

export {
  useBeatWordTimings,
  TtsAudioMapContext,
} from './remotion/word-timings';

// ---------- R9 — timeline-annotated music-gen score prompts ----------------
//
// The provider-agnostic IR (`ScorePrompt`) a docent film exports to a
// music-generation API. The CLI's `docent score` builds the IR from the
// schedule + the (optional) persisted TTS manifest; provider adapters in
// `@bjelser/core` render the IR to AIVA / Udio / Suno / template dialect.
// Third-party adapters depend only on these types.

export type {
  ScoreProvider,
  ScoreCueKind,
  ScoreCue,
  ScoreTone,
  ScorePrompt,
  ScoreFinding,
  RenderedScorePrompt,
} from './types/score';
