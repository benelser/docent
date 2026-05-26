// @docent/kit — public surface.
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
} from './types/tts';

export {TtsProviderError} from './types/tts';

// ---------- Spec types ------------------------------------------------------

export type {
  FilmSpec,
  FilmMeta,
  FilmRegister,
  FilmTtsConfig,
  Scene,
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

export {validateSpec} from './frameworks/validate';
export {depthCheck} from './frameworks/depthcheck';
export {collectJudgeDimensions} from './frameworks/judge';
export {computeSchema} from './schema/from-registry';
