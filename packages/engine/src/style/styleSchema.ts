// styleSchema — the type vocabulary the styling pipeline exchanges.
//
//   RenderStyleInput  what a Spec.style field carries (or a CLI flag, or an
//                     agent suggestion) — the *raw* request, before any merge.
//   StylePreset       the named-preset enum (closed; 6 entries).
//   StyleIntent       the semantic meta-knobs (tone/audience/medium/...).
//   VisualizationStyle a partial pixel-level override the caller can pin.
//   ResolvedStyle     what the resolver produces; what downstream code reads.
//
// The pipeline stages, in order:
//   base renderer defaults
//   → named style preset
//   → semantic style intent
//   → agent-provided style overrides
//   → user preference overrides
//   → validation / normalization / accessibility constraints
//   → resolved style object
//
// Raw RenderStyleInput NEVER reaches the renderer. Only ResolvedStyle does.

import type {DesignTokens} from './styleTokens';

// ----- preset names ---------------------------------------------------------

// The 6 docent presets — specialized from the generic preset family to
// docent's actual gallery of registers. See stylePresets.ts for the structured
// data behind each.
export type StylePreset =
  | 'neutral'      // default — byte-identical to current theme.ts
  | 'engineering'  // code-heavy, dark register
  | 'editorial'    // close-reading, prose-forward
  | 'paper'        // academic / arxiv-PDF
  | 'executive'    // exec deck — generous spacing, fewer scenes
  | 'analytical';  // math / proof — tight monospace numerics

export const STYLE_PRESETS: readonly StylePreset[] = [
  'neutral',
  'engineering',
  'editorial',
  'paper',
  'executive',
  'analytical',
] as const;

// ----- intent enums ---------------------------------------------------------

export type StyleTone = 'neutral' | 'professional' | 'executive' | 'technical' | 'playful';
export type StyleAudience = 'general' | 'technical' | 'executive';
export type StyleMedium = 'web' | 'slide' | 'report' | 'mobile';
export type StyleDensity = 'compact' | 'comfortable' | 'spacious';
export type StyleTheme = 'light' | 'dark' | 'auto';
export type StyleEmphasis = 'data-first' | 'insight-first' | 'presentation-first';

export const STYLE_TONES: readonly StyleTone[] = [
  'neutral', 'professional', 'executive', 'technical', 'playful',
] as const;
export const STYLE_AUDIENCES: readonly StyleAudience[] = [
  'general', 'technical', 'executive',
] as const;
export const STYLE_MEDIUMS: readonly StyleMedium[] = [
  'web', 'slide', 'report', 'mobile',
] as const;
export const STYLE_DENSITIES: readonly StyleDensity[] = [
  'compact', 'comfortable', 'spacious',
] as const;
export const STYLE_THEMES: readonly StyleTheme[] = [
  'light', 'dark', 'auto',
] as const;
export const STYLE_EMPHASES: readonly StyleEmphasis[] = [
  'data-first', 'insight-first', 'presentation-first',
] as const;

// StyleIntent — the editorial meta-knobs. The mapper turns these into token
// deltas (purely data-driven; no branching by preset name).
export interface StyleIntent {
  tone?: StyleTone;
  audience?: StyleAudience;
  medium?: StyleMedium;
  density?: StyleDensity;
  theme?: StyleTheme;
  emphasis?: StyleEmphasis;
}

// ----- visualization style (renderer-facing knobs) --------------------------

// A scene-family-level knob bundle. The pipeline allows the caller to pin any
// of these directly (an "override"); the resolver clamps and validates each.
// The renderer (after migration) reads these as the *resolved* values.
export type LegendPosition = 'top' | 'bottom' | 'left' | 'right' | 'none';

export const LEGEND_POSITIONS: readonly LegendPosition[] = [
  'top', 'bottom', 'left', 'right', 'none',
] as const;

export interface VisualizationStyle {
  legendPosition?: LegendPosition;
  gridLines?: boolean;
  axisLabels?: boolean;
  // Maximum labels per chart series — executive audiences get fewer.
  maxLabelsPerSeries?: number;
  // The hand-drawn treatment lock: `crisp` clamps out sketch even if a scene
  // requests it (e.g. an executive deck blocks playful skins). `null` means
  // no lock — the scene's own `treatment` knob wins.
  treatmentLock?: 'crisp' | 'sketch' | 'whiteboard' | null;
}

// ----- partial override surface --------------------------------------------

// A deep-partial of DesignTokens — the override surface a caller can supply.
// Anything not named is inherited from the preset/intent layer beneath.
// (Hand-rolled rather than using `Partial<>` because TypeScript's `Partial`
// doesn't recurse.)
export interface DesignTokenOverrides {
  bg?: Partial<DesignTokens['bg']>;
  ink?: Partial<DesignTokens['ink']>;
  accent?: Partial<DesignTokens['accent']>;
  typography?: {
    family?: Partial<DesignTokens['typography']['family']>;
    size?: Partial<DesignTokens['typography']['size']>;
    weight?: Partial<DesignTokens['typography']['weight']>;
    lineHeight?: number;
    letterSpacing?: number;
  };
  spacing?: Partial<DesignTokens['spacing']>;
  radius?: Partial<DesignTokens['radius']>;
  stroke?: Partial<DesignTokens['stroke']>;
}

// ----- input ---------------------------------------------------------------

// The full input surface. Every field is optional; `resolveStyle(undefined)`
// is a legal, byte-identical-to-today resolution.
//
//   preset       names a token bundle to start from.
//   intent       editorial meta-knobs; the mapper converts to token deltas.
//   tokens       direct token overrides — the agent-style overrides layer.
//   visualization scene-family-level renderer knobs.
//   user         the user-preference overrides layer — same shape as `tokens`
//                /visualization, but conceptually a separate stage and merged
//                last (so a user pref beats an agent suggestion).
export interface RenderStyleInput {
  preset?: StylePreset;
  intent?: StyleIntent;
  tokens?: DesignTokenOverrides;
  visualization?: VisualizationStyle;
  user?: {
    tokens?: DesignTokenOverrides;
    visualization?: VisualizationStyle;
  };
}

// ----- resolved output ------------------------------------------------------

// What every downstream consumer reads. Frozen by convention (validator
// throws on mutation attempts in dev). Carries the provenance string so the
// debug logger can print which preset/intent built it.
export interface ResolvedStyle {
  preset: StylePreset;
  intent: StyleIntent; // normalized — missing fields filled with safe defaults
  tokens: DesignTokens;
  visualization: Required<VisualizationStyle>;
  // Provenance — the human-readable summary of how this style was built. Used
  // by the cascade's --debug logger.
  provenance: {
    preset: StylePreset;
    intent: StyleIntent;
    hasTokenOverrides: boolean;
    hasUserOverrides: boolean;
  };
}

// ----- validation error -----------------------------------------------------

// The structured validation error the pipeline throws. The brief is explicit:
// docent is fail-closed. Every constraint reports its `code`, the
// dot-delimited `path` into the resolved object, and the offending `value`
// so a programmatic caller can surface it usefully.
export type StyleValidationDetail = {
  code: string;       // e.g. 'INVALID_COLOR', 'FONT_SIZE_OUT_OF_RANGE'
  path: string;       // e.g. 'tokens.ink.hi'
  value: unknown;     // the offending value
  message: string;    // human-readable
  expected?: string;  // optional: what would have been valid
};

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
