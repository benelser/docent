// styleTokens — the structured design-token vocabulary the pipeline resolves
// against. This file is *data*: an interface naming every knob the renderer
// might one day consume, plus the default token set that mirrors today's
// theme.ts byte-for-byte.
//
// theme.ts (the runtime constant the scene components import today) is the
// SOURCE OF TRUTH for the byte-identical backward-compat contract. Until the
// renderer migration sprint lands, `neutralTokens` here MUST mirror those
// values exactly: a snapshot test in styleResolver.test.ts pins the contract.
//
// Pipeline stages this file participates in:
//   base renderer defaults                            ← this file
//   → named style preset                              (stylePresets.ts)
//   → semantic style intent                           (styleIntentMapper.ts)
//   → agent-provided style overrides                  (styleSchema.ts input)
//   → user preference overrides                       (styleSchema.ts input)
//   → validation / normalization / accessibility      (styleValidator.ts ...)
//   → resolved style object                           (styleResolver.ts)

// ----- token interface ------------------------------------------------------

// Background ramp — from the deepest "void" through the inkable panel surfaces
// to the line colors that delineate them. The renderer reads these by role,
// never by hex literal: `bg.panel` is a *role*, not a colour.
export interface BackgroundTokens {
  void: string;
  base: string;
  panel: string;
  panelHi: string;
  line: string;
  lineHi: string;
}

// Foreground ink — the typographic ramp, brightest (`hi`) to most muted
// (`faint`). The names are intentionally chromatic-neutral so an editorial or
// paper preset can flip the underlying values without renaming.
export interface InkTokens {
  hi: string;
  mid: string;
  low: string;
  faint: string;
}

// Accent family — the closed enum of named accent hues. The current six match
// AccentKey in theme.ts exactly. A preset may *redefine* a hue (e.g. paper's
// `blue` is the marker-ink blue, not the console cyan) but the NAMES are
// stable so a Scene's `accent: 'blue'` resolves under every preset.
export interface AccentTokens {
  blue: string;
  cyan: string;
  green: string;
  amber: string;
  rose: string;
  violet: string;
}

// Typographic tokens — sizes are in CSS px; line-height is a multiplier.
// Renderer code that picks a size should read these by role (`body`,
// `heading`) rather than embedding pixel literals.
export interface TypographyTokens {
  // Font families — closed, role-based. `sans` is the UI/body face, `serif`
  // the editorial face, `mono` the code/numerics face. The presets swap
  // values, never roles.
  family: {
    sans: string;
    serif: string;
    mono: string;
  };
  // Size ramp in CSS px. The narrowest legitimate range for any docent scene
  // is 10..200 px (validator clamps anything outside).
  size: {
    micro: number;   // legends, callout subtitles
    small: number;   // captions, axis tick labels
    body: number;    // narration, card body text
    label: number;   // card heading / row label
    heading: number; // scene heading
    display: number; // titles
  };
  weight: {
    body: number;     // 400-500
    label: number;    // 500-600
    heading: number;  // 600-700
    display: number;  // 700-800
  };
  lineHeight: number; // multiplier for body text
  letterSpacing: number; // em units; tight numerics get a slightly negative value
}

// Spacing — uniform spacing scale in CSS px. Density modulates this
// uniformly (compact → 0.85, spacious → 1.15) in the intent mapper.
export interface SpacingTokens {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  gutter: number; // grid gap
}

// Corner radius scale in CSS px.
export interface RadiusTokens {
  sm: number;
  md: number;
  lg: number;
}

// Stroke widths in CSS px. The renderer should read these by role rather
// than embedding hard-coded line weights.
export interface StrokeTokens {
  hairline: number;
  thin: number;
  regular: number;
  bold: number;
}

// The complete design-token bundle. The renderer (after migration) consumes
// ONLY this interface — every per-component pixel knob hangs off here.
export interface DesignTokens {
  bg: BackgroundTokens;
  ink: InkTokens;
  accent: AccentTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  stroke: StrokeTokens;
}

// ----- default token set ----------------------------------------------------

// neutralTokens — the byte-identical mirror of theme.ts. This is what
// `resolveStyle(undefined)` ultimately yields. If you edit theme.ts, edit
// this; the snapshot test in styleResolver.test.ts pins them together.
export const neutralTokens: DesignTokens = {
  bg: {
    void: '#050607',
    base: '#0a0c10',
    panel: '#10141b',
    panelHi: '#171d27',
    line: '#252d3c',
    lineHi: '#3a4761',
  },
  ink: {
    hi: '#f3f5fa',
    mid: '#a7b0c2',
    low: '#6b7587',
    faint: '#454d5e',
  },
  accent: {
    blue: '#5cb6ff',
    cyan: '#3fe0d0',
    green: '#5fe8a4',
    amber: '#ffc24d',
    rose: '#ff7d97',
    violet: '#b69cff',
  },
  typography: {
    family: {
      sans: 'Inter, "Helvetica Neue", system-ui, sans-serif',
      serif: '"Source Serif Pro", Georgia, "Times New Roman", serif',
      mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
    },
    size: {
      micro: 12,
      small: 14,
      body: 18,
      label: 20,
      heading: 28,
      display: 56,
    },
    weight: {
      body: 400,
      label: 500,
      heading: 600,
      display: 700,
    },
    lineHeight: 1.45,
    letterSpacing: 0,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 48,
    gutter: 24,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 18,
  },
  stroke: {
    hairline: 0.5,
    thin: 1,
    regular: 2,
    bold: 3,
  },
};
