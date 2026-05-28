// Design tokens — the structured token vocabulary every preset contributes.
//
// `@bjelser/kit` owns the *interfaces*; it ships zero values. The neutral floor
// + the 6 default presets live in `@bjelser/core/src/presets/*`. A third-party
// preset pack contributes its tokens against THIS type.
//
// Mirrors `packages/engine/src/style/styleTokens.ts` shape so the v2.x preset
// data drops in unchanged when `@bjelser/core` migrates.
//
// Type-only. No runtime values. The kit must stay renderer-agnostic in shape.

/**
 * Background ramp — from the deepest "void" through the inkable panel surfaces
 * to the line colors that delineate them. The renderer reads these by role,
 * never by hex literal: `bg.panel` is a *role*, not a colour.
 */
export interface BackgroundTokens {
  void: string;
  base: string;
  panel: string;
  panelHi: string;
  line: string;
  lineHi: string;
}

/**
 * Foreground ink — the typographic ramp, brightest (`hi`) to most muted
 * (`faint`). Names are intentionally chromatic-neutral so an editorial or
 * paper preset can flip the underlying values without renaming.
 */
export interface InkTokens {
  hi: string;
  mid: string;
  low: string;
  faint: string;
}

/**
 * Accent family — the closed enum of named accent hues. The six match
 * AccentKey in the legacy theme.ts exactly. A preset may *redefine* a hue
 * (e.g. paper's `blue` is the marker-ink blue, not the console cyan) but
 * the NAMES are stable so a Scene's `accent: 'blue'` resolves under every
 * preset.
 */
export interface AccentTokens {
  blue: string;
  cyan: string;
  green: string;
  amber: string;
  rose: string;
  violet: string;
}

/**
 * Typographic tokens. Sizes are in CSS px; line-height is a multiplier.
 * Renderer code reads these by role (`body`, `heading`) rather than embedding
 * pixel literals.
 */
export interface TypographyTokens {
  family: {
    sans: string;
    serif: string;
    mono: string;
  };
  size: {
    micro: number;
    small: number;
    body: number;
    label: number;
    heading: number;
    display: number;
  };
  weight: {
    body: number;
    label: number;
    heading: number;
    display: number;
  };
  lineHeight: number;
  letterSpacing: number;
}

/**
 * Spacing scale in CSS px. Density modulates this uniformly (compact →
 * 0.85, spacious → 1.15) via the intent mapper in the resolver.
 */
export interface SpacingTokens {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  gutter: number;
}

/** Corner radius scale in CSS px. */
export interface RadiusTokens {
  sm: number;
  md: number;
  lg: number;
}

/**
 * Stroke widths in CSS px. The renderer reads these by role rather than
 * embedding hard-coded line weights.
 */
export interface StrokeTokens {
  hairline: number;
  thin: number;
  regular: number;
  bold: number;
}

/**
 * The complete design-token bundle a preset contributes. Every per-component
 * pixel knob hangs off here. Renderers consume ONLY this interface (plus
 * `VisualizationStyle` for the family-level knobs).
 */
export interface DesignTokens {
  bg: BackgroundTokens;
  ink: InkTokens;
  accent: AccentTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  stroke: StrokeTokens;
}

/**
 * Deep-partial of `DesignTokens` — the override surface a caller (or a
 * FeaturePlugin's `injectStyleTokens` hook) can supply. Hand-rolled because
 * TypeScript's `Partial<>` doesn't recurse.
 */
export interface DesignTokenOverrides {
  bg?: Partial<BackgroundTokens>;
  ink?: Partial<InkTokens>;
  accent?: Partial<AccentTokens>;
  typography?: {
    family?: Partial<TypographyTokens['family']>;
    size?: Partial<TypographyTokens['size']>;
    weight?: Partial<TypographyTokens['weight']>;
    lineHeight?: number;
    letterSpacing?: number;
  };
  spacing?: Partial<SpacingTokens>;
  radius?: Partial<RadiusTokens>;
  stroke?: Partial<StrokeTokens>;
}
