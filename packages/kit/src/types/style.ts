// Style types — the styling pipeline's TypeScript vocabulary.
//
// Mirrors `packages/engine/src/style/styleSchema.ts` to preserve v2.x preset
// data. The kit owns these interfaces; the values (preset bundles, intent
// mappings, the resolver itself) live in `@bjelser/core` and `@bjelser/kit`'s
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
 * The 6 docent default preset names — kept as a type for documentation
 * and IDE autocompletion. The live preset registry on the engine is
 * authoritative; a film's `style.preset` is a `string`, validated at
 * resolution time against the live registry (a third-party preset like
 * `'fintech'` resolves fine if registered).
 *
 * @see docs/design/plugin-architecture-strategy.md §4.3
 */
export type StylePreset =
  | 'neutral'
  | 'engineering'
  | 'editorial'
  | 'paper'
  | 'executive'
  | 'analytical';

/**
 * Runtime list of the 6 default docent preset names. Surfaced for
 * documentation and tooling (e.g. `docent style list`) — the live preset
 * registry on the engine is authoritative.
 */
export const DEFAULT_STYLE_PRESETS: readonly StylePreset[] = [
  'neutral',
  'engineering',
  'editorial',
  'paper',
  'executive',
  'analytical',
] as const;

// ----- intent enums ---------------------------------------------------------

/** Authorial tone of voice. */
export type StyleTone =
  | 'neutral'
  | 'professional'
  | 'executive'
  | 'technical'
  | 'playful';
/** Intended audience for the film. */
export type StyleAudience = 'general' | 'technical' | 'executive';
/** Delivery medium — biases sizing and density. */
export type StyleMedium = 'web' | 'slide' | 'report' | 'mobile';
/** Information density — modulates spacing scale. */
export type StyleDensity = 'compact' | 'comfortable' | 'spacious';
/** Light/dark theme bias. */
export type StyleTheme = 'light' | 'dark' | 'auto';
/** What the film prioritises — data, insight, or presentation polish. */
export type StyleEmphasis =
  | 'data-first'
  | 'insight-first'
  | 'presentation-first';

/** Runtime list of every {@link StyleTone} value, in canonical order. */
export const STYLE_TONES: readonly StyleTone[] = [
  'neutral',
  'professional',
  'executive',
  'technical',
  'playful',
] as const;
/** Runtime list of every {@link StyleAudience} value. */
export const STYLE_AUDIENCES: readonly StyleAudience[] = [
  'general',
  'technical',
  'executive',
] as const;
/** Runtime list of every {@link StyleMedium} value. */
export const STYLE_MEDIUMS: readonly StyleMedium[] = [
  'web',
  'slide',
  'report',
  'mobile',
] as const;
/** Runtime list of every {@link StyleDensity} value. */
export const STYLE_DENSITIES: readonly StyleDensity[] = [
  'compact',
  'comfortable',
  'spacious',
] as const;
/** Runtime list of every {@link StyleTheme} value. */
export const STYLE_THEMES: readonly StyleTheme[] = [
  'light',
  'dark',
  'auto',
] as const;
/** Runtime list of every {@link StyleEmphasis} value. */
export const STYLE_EMPHASES: readonly StyleEmphasis[] = [
  'data-first',
  'insight-first',
  'presentation-first',
] as const;

/**
 * Editorial meta-knobs. The intent mapper composes these into token
 * deltas at style-resolution time — purely data-driven, no branching by
 * preset name. Authored on `FilmSpec.style.intent`.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.3
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
 *
 * @see docs/design/plugin-architecture-strategy.md §4.3
 */
export interface RenderStyleInput {
  /** Preset name — must match a registered `PresetPlugin.presetName`. */
  preset?: string;
  /** Editorial meta-knobs (tone, audience, etc.). */
  intent?: StyleIntent;
  /** Deep-partial token overrides layered on top of the preset. */
  tokens?: DesignTokenOverrides;
  /** Family-level visualization knob overrides. */
  visualization?: VisualizationStyle;
  /** User-preference overrides — applied AFTER film-level overrides. */
  user?: {
    tokens?: DesignTokenOverrides;
    visualization?: VisualizationStyle;
  };
}

// ----- resolved output ------------------------------------------------------

/**
 * What every downstream consumer reads — the frozen, complete style bundle
 * carried on {@link CommonSceneProps.style} for every scene render.
 *
 * The resolver's contract: this is frozen and always complete — every
 * token has a value, every `Required<VisualizationStyle>` cell is filled.
 * A scene component can read `style.tokens.ink.hi` without nullchecks.
 *
 * Carries provenance for debug surfaces and the `docent doctor` audit.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.3
 */
export interface ResolvedStyle {
  /** The preset name that produced this resolution. */
  preset: string;
  /** Normalized — missing fields filled with safe defaults. */
  intent: StyleIntent;
  /** The composed design tokens — fully populated. */
  tokens: DesignTokens;
  /** The composed visualization knobs — every field filled. */
  visualization: Required<VisualizationStyle>;
  /** Human-readable summary of how this style was built. */
  provenance: {
    /** The preset name. */
    preset: string;
    /** The intent block that was applied. */
    intent: StyleIntent;
    /** Whether `style.tokens` overrides were applied. */
    hasTokenOverrides: boolean;
    /** Whether `style.user` preferences were applied. */
    hasUserOverrides: boolean;
    /** Features that injected style tokens (FeaturePlugin.injectStyleTokens). */
    featureInjections?: readonly string[];
  };
}

// ----- StyleTokens alias ----------------------------------------------------

/**
 * Convenience alias used by scene components — the bag of tokens a scene
 * reads at render time. Mirrors the legacy `theme` import.
 *
 * Identical to {@link DesignTokens}; the alias exists to make scene-level
 * `import {StyleTokens}` reads clearer at the call site.
 */
export type StyleTokens = DesignTokens;

// ----- validation error -----------------------------------------------------

/**
 * A single structured validation detail. Surfaced inside
 * {@link StyleValidationError.details}.
 */
export interface StyleValidationDetail {
  /** Machine-readable code (e.g. `'unknown_preset'`). */
  code: string;
  /** Path into the spec (e.g. `'style.preset'`). */
  path: string;
  /** The offending value, untransformed. */
  value: unknown;
  /** Human-readable explanation. */
  message: string;
  /** Optional "expected" hint (e.g. `'one of: paper, engineering, …'`). */
  expected?: string;
}

/**
 * Thrown by {@link Engine.resolveStyle} when the spec names a preset that
 * is not registered (and is not the well-known `'neutral'` fallback), or
 * when a token override fails its constraint check.
 *
 * Carries a structured {@link StyleValidationDetail} array so a doctor
 * surface can render rich diagnostics instead of a flat message.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.3
 */
export class StyleValidationError extends Error {
  /** Structured details — one per failed constraint. */
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
