// tokens — the `paper` preset's design-token bundle.
//
// Byte-identical to the v2.5.x value produced by `extend({...})` for `paper`
// in packages/engine/src/style/stylePresets.ts. This file expresses the
// fully-resolved DesignTokens rather than rebuilding it from a neutral floor
// — the engine `extend()` helper is a v2-era convenience; the plugin
// protocol ships the resolved bundle directly.
//
// Source of truth: stylePresets.ts § `paper` + neutralTokens (for the
// fields paper does not override).

import type {DesignTokens} from '@docent/kit';

// Font-family chains — mirrored from packages/engine/src/style/stylePresets.ts.
// "Source Serif Four" is the family name Remotion's google-fonts loader returns
// for the SourceSerif4 module; "Source Serif Pro" is the legacy Adobe name kept
// in the chain for editor previews on systems that have it.
const SERIF_STACK =
  '"Source Serif Four", "Source Serif Pro", Georgia, "Times New Roman", serif';
const MONO_STACK = '"JetBrains Mono", "SF Mono", Menlo, monospace';

export const tokens: DesignTokens = {
  bg: {
    // Light-mode preset — these are *light* values, the only one of the
    // five non-neutral presets where ink is dark on paper.
    void: '#fffaee',         // paper white
    base: '#f5ecd6',         // cream paper
    panel: '#ede1c4',        // darker cream
    panelHi: '#e3d4b0',      // raised
    // Lines bumped darker than the design spec so they pass a 3:1
    // separator ratio against the cream panel; the validator enforces ≥4.5:1
    // on body text but the line stroke is visually load-bearing here.
    line: '#7a6e54',         // visible against cream
    lineHi: '#5a503c',       // focused
  },
  ink: {
    hi: '#0a1b2e',           // deep ink (slightly cool)
    mid: '#3a4858',          // secondary
    low: '#697482',          // tertiary
    faint: '#9aa1a8',        // faint
  },
  accent: {
    blue: '#1a3d6e',         // Pantone classic blue
    cyan: '#1a6e6e',         // teal
    green: '#2d5a3a',        // forest
    amber: '#a06f1f',        // mustard ochre
    rose: '#8e2a3d',         // cardinal
    violet: '#4a3478',       // royal purple
  },
  typography: {
    family: {
      // Serif body & sans; mono for inline code / equations.
      sans: SERIF_STACK,
      serif: SERIF_STACK,
      mono: MONO_STACK,
    },
    // size + weight inherited from neutralTokens (paper does not override).
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
    lineHeight: 1.45,        // tight academic
    letterSpacing: 0,        // inherited from neutralTokens
  },
  // dense — column-based academic figures
  spacing: {
    xs: 4,
    sm: 6,       // tight
    md: 10,      // snug
    lg: 18,      // comfortable
    xl: 28,      // spacious
    gutter: 18,
  },
  // minimal, paper-like
  radius: {sm: 2, md: 4, lg: 8},
  // ink-precise lines (thinner overall — like a printed figure)
  stroke: {hairline: 0.5, thin: 1, regular: 1.25, bold: 1.5},
};
