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
 * Structural chrome — the SHELL every scene sits in, not its colours.
 *
 * Until R5, the chrome (starfield, dotted grid, drifting motes, vignette,
 * kicker prefix, wordmark) was hardcoded in `SceneFrame` — two films using
 * different presets shared the same structural treatment. ChromeTokens turn
 * that chrome into a token block: a brand pack can REPLACE the structural
 * treatments, not just recolour them.
 *
 * Renderer wiring lives in `@bjelser/core`'s SceneFrame: a preset that
 * omits this block gets the legacy chrome verbatim (see `DEFAULT_CHROME`
 * in `@bjelser/core/src/_shared/scene-frame`).
 */
export interface ChromeTokens {
  /**
   * Background pattern under the scene.
   * - `starfield` — STARS + dotted grid + drifting motes (current default)
   * - `grid`      — dotted grid only, no stars
   * - `hex`       — dot-based hex pattern via CSS gradient (engineering vibe)
   * - `flat`      — solid `bg.base`, no pattern
   * - `gradient`  — radial-gradient from `bg.base` to `bg.panel`
   */
  background: 'starfield' | 'grid' | 'hex' | 'flat' | 'gradient';
  /** Density of drifting motes. 0 disables; 1 = current default; 2 = doubled. */
  motes: number;
  /** Strength of the corner vignette. 0 disables; 1 = current default. */
  vignette: number;
  /**
   * Kicker treatment — how the scene's kicker line is shaped.
   * - `numeric`  — render the kicker text verbatim ("01 // THE CLAIM")
   * - `bullet`   — strip the leading "NN //" prefix and prepend "■ "
   * - `agentops` — emit "<chromeKickerHint or sceneType uppercased> →"
   *                e.g. "PLAN_STEP →", "WATERFALL →", "FLOW_DISCOVERY →"
   * - `bracket`  — convert "01 // THE CLAIM" to "[01] THE CLAIM"
   * - `none`     — heading only, no kicker rendered
   */
  kickerStyle: 'numeric' | 'bullet' | 'agentops' | 'bracket' | 'none';
  /** Wordmark text in the bottom-right. Set to `null` to hide. */
  wordmark: string | null;
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
  /**
   * Structural chrome — the SHELL the scene sits in. Optional everywhere:
   * a preset that omits it gets the legacy chrome verbatim (the renderer
   * substitutes its `DEFAULT_CHROME` constant).
   */
  chrome?: ChromeTokens;
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
  chrome?: Partial<ChromeTokens>;
}
