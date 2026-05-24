// docent style — schema-driven styling pipeline.
//
// Public re-exports. The single consumer surface is `resolveStyle(input?)`
// returning a `ResolvedStyle`. Everything else here is for typing
// (RenderStyleInput, StylePreset, StyleIntent, ...) or for testing
// (PRESETS, validateInput, contrastRatio).
//
// IMPORTANT: this module is NOT yet consumed by any scene component. The
// scene-renderer migration is a follow-on sprint. Today the pipeline lands,
// is exercised by `cascade.ts` for its debug log, and is otherwise inert —
// so `theme.ts` remains the byte-stable source of truth and every film in
// the gallery renders byte-identically.

export {resolveStyle} from './styleResolver';

export {
  // input + result types
  type RenderStyleInput,
  type ResolvedStyle,
  type StylePreset,
  type StyleIntent,
  type StyleTone,
  type StyleAudience,
  type StyleMedium,
  type StyleDensity,
  type StyleTheme,
  type StyleEmphasis,
  type VisualizationStyle,
  type LegendPosition,
  type DesignTokenOverrides,
  type StyleValidationDetail,
  // enums (closed lists)
  STYLE_PRESETS,
  STYLE_TONES,
  STYLE_AUDIENCES,
  STYLE_MEDIUMS,
  STYLE_DENSITIES,
  STYLE_THEMES,
  STYLE_EMPHASES,
  LEGEND_POSITIONS,
  // error class
  StyleValidationError,
} from './styleSchema';

export {
  type DesignTokens,
  type BackgroundTokens,
  type InkTokens,
  type AccentTokens,
  type TypographyTokens,
  type SpacingTokens,
  type RadiusTokens,
  type StrokeTokens,
  neutralTokens,
} from './styleTokens';

export {PRESETS, getPreset, type PresetDefinition} from './stylePresets';

export {mapIntent} from './styleIntentMapper';

export {validateInput} from './styleValidator';
export {normalizeTokens} from './styleNormalization';
export {auditContrast, contrastRatio} from './styleAccessibility';
