// Style types — the styling pipeline's TypeScript vocabulary.
//
// Mirrors `packages/engine/src/style/styleSchema.ts` to preserve v2.x preset
// data. The kit owns these interfaces; the values (preset bundles, intent
// mappings, the resolver itself) live in `@docent/core` and `@docent/kit`'s
// internal style resolver (Phase A.2-A.7).
//
// Pipeline order (top → bottom, later wins):
//   base renderer defaults (neutralTokens)
//   → named style preset (PresetPlugin.tokens)
//   → semantic style intent (StyleIntent → token delta)
//   → film-level token overrides (FilmSpec.style.tokens)
//   → user preference overrides
//   → FeaturePlugin.injectStyleTokens (cross-cutting feature injections)
//   → validation / normalization / accessibility constraints
//   → ResolvedStyle (frozen)

import type {DesignTokens, DesignTokenOverrides} from './design-tokens';
import type {VisualizationStyle} from './visualization-style';

// ----- preset names ---------------------------------------------------------

/**
 * The 6 docent default presets. After the rip-and-replace, this stays as a
 * type for documentation; the registry holds whatever presets `engine.use()`
 * has accepted, including third-party ones. A film's `style.preset` is a
 * `string`, validated at resolution time against the live registry.
 */
export type StylePreset =
  | 'neutral'
  | 'engineering'
  | 'editorial'
  | 'paper'
  | 'executive'
  | 'analytical';

export const DEFAULT_STYLE_PRESETS: readonly StylePreset[] = [
  'neutral',
  'engineering',
  'editorial',
  'paper',
  'executive',
  'analytical',
] as const;

// ----- intent enums ---------------------------------------------------------

export type StyleTone =
  | 'neutral'
  | 'professional'
  | 'executive'
  | 'technical'
  | 'playful';
export type StyleAudience = 'general' | 'technical' | 'executive';
export type StyleMedium = 'web' | 'slide' | 'report' | 'mobile';
export type StyleDensity = 'compact' | 'comfortable' | 'spacious';
export type StyleTheme = 'light' | 'dark' | 'auto';
export type StyleEmphasis =
  | 'data-first'
  | 'insight-first'
  | 'presentation-first';

export const STYLE_TONES: readonly StyleTone[] = [
  'neutral',
  'professional',
  'executive',
  'technical',
  'playful',
] as const;
export const STYLE_AUDIENCES: readonly StyleAudience[] = [
  'general',
  'technical',
  'executive',
] as const;
export const STYLE_MEDIUMS: readonly StyleMedium[] = [
  'web',
  'slide',
  'report',
  'mobile',
] as const;
export const STYLE_DENSITIES: readonly StyleDensity[] = [
  'compact',
  'comfortable',
  'spacious',
] as const;
export const STYLE_THEMES: readonly StyleTheme[] = [
  'light',
  'dark',
  'auto',
] as const;
export const STYLE_EMPHASES: readonly StyleEmphasis[] = [
  'data-first',
  'insight-first',
  'presentation-first',
] as const;

/**
 * StyleIntent — editorial meta-knobs. The mapper turns these into token
 * deltas. Purely data-driven; no branching by preset name.
 */
export interface StyleIntent {
  tone?: StyleTone;
  audience?: StyleAudience;
  medium?: StyleMedium;
  density?: StyleDensity;
  theme?: StyleTheme;
  emphasis?: StyleEmphasis;
}

// ----- input surface --------------------------------------------------------

/**
 * What a `FilmSpec.style` field carries — the *raw* request, before any
 * merge. Every field is optional; `resolveStyle(undefined)` is a legal,
 * byte-identical-to-defaults resolution.
 */
export interface RenderStyleInput {
  preset?: string;
  intent?: StyleIntent;
  tokens?: DesignTokenOverrides;
  visualization?: VisualizationStyle;
  user?: {
    tokens?: DesignTokenOverrides;
    visualization?: VisualizationStyle;
  };
}

// ----- resolved output ------------------------------------------------------

/**
 * What every downstream consumer reads. Carries provenance for debug
 * surfaces. The resolver's contract: this is frozen and always complete
 * — every token has a value, every `Required<VisualizationStyle>` cell
 * is filled.
 */
export interface ResolvedStyle {
  preset: string;
  /** Normalized — missing fields filled with safe defaults. */
  intent: StyleIntent;
  tokens: DesignTokens;
  visualization: Required<VisualizationStyle>;
  /** Human-readable summary of how this style was built. */
  provenance: {
    preset: string;
    intent: StyleIntent;
    hasTokenOverrides: boolean;
    hasUserOverrides: boolean;
    /** Features that injected style tokens (FeaturePlugin.injectStyleTokens). */
    featureInjections?: readonly string[];
  };
}

// ----- StyleTokens alias ----------------------------------------------------

/**
 * Convenience alias used by scene components: the bag of tokens a scene reads
 * at render time. Mirrors the legacy `theme` import.
 */
export type StyleTokens = DesignTokens;

// ----- validation error -----------------------------------------------------

/** A single structured validation detail. */
export interface StyleValidationDetail {
  code: string;
  path: string;
  value: unknown;
  message: string;
  expected?: string;
}

export class StyleValidationError extends Error {
  public readonly details: StyleValidationDetail[];
  constructor(details: StyleValidationDetail[]) {
    super(
      `StyleValidationError — ${details.length} constraint(s) failed:\n` +
        details
          .map((d) => `  ✗ [${d.code}] ${d.path}: ${d.message}`)
          .join('\n'),
    );
    this.name = 'StyleValidationError';
    this.details = details;
  }
}
