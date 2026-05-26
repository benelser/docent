// editorial — design tokens.
//
// Byte-identical port of the v2.5.x `editorial` preset tokens from
// `packages/engine/src/style/stylePresets.ts`. In the engine the bundle is
// built by `extend(neutralTokens, …overrides)`; here the resolved
// `DesignTokens` object is materialised in full so the preset stands on its
// own without importing engine internals. Every value is reproduced
// character-for-character from the v2.5.x source — the override layer and
// every neutralTokens field that survives unchanged (typography.size,
// typography.weight, letterSpacing, mono family).

import type {DesignTokens} from '@docent/kit';

export const tokens: DesignTokens = {
  bg: {
    void: '#0c0805',         // absolute warm dark
    base: '#1a1208',         // walnut
    panel: '#231810',        // card (warmer)
    panelHi: '#2e2218',      // raised
    line: '#3d2f24',         // subtle border
    lineHi: '#594636',       // focused
  },
  ink: {
    hi: '#faf3e7',           // warm cream
    mid: '#d4c3a8',          // warm secondary
    low: '#a39378',          // tertiary
    faint: '#6e6149',        // faint
  },
  accent: {
    blue: '#7ea8c0',         // steel ink (raised from spec for AA contrast on walnut)
    cyan: '#7aa89e',         // deep sage
    green: '#a3b582',        // olive
    amber: '#e0b558',        // ochre / gold
    rose: '#c46878',         // burgundy
    violet: '#9d80b8',       // deep mauve
  },
  typography: {
    family: {
      // Serif everywhere — the medium IS prose.
      sans: '"Source Serif Four", "Source Serif Pro", Georgia, "Times New Roman", serif',
      serif: '"Source Serif Four", "Source Serif Pro", Georgia, "Times New Roman", serif',
      // Mono inherited from neutralTokens.
      mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
    },
    // sizes/weights inherited from neutralTokens.
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
    lineHeight: 1.55,        // generous reading line-height
    letterSpacing: 0,
  },
  // article spacing — broader and looser than neutral.
  spacing: {
    xs: 6,
    sm: 10,      // tight
    md: 16,      // snug
    lg: 28,      // comfortable
    xl: 48,      // spacious
    gutter: 28,
  },
  // soft book-like
  radius: {sm: 8, md: 12, lg: 18},
  // gentle ink-on-paper strokes
  stroke: {hairline: 1, thin: 1.5, regular: 2, bold: 2.5},
};

export default tokens;
