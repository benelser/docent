// executive preset tokens — Apple Keynote / premium strategy deck.
//
// Pure-black bg, iOS system colors, heavier weights (display 800), generous
// premium spacing, soft radii, confident strokes. Locked to crisp.
//
// Byte-identical to the v2.5.x `executive` preset in
// packages/engine/src/style/stylePresets.ts (expanded via the `extend(...)`
// helper against `neutralTokens`). Unchanged fields are kept at their
// `neutralTokens` values; overridden fields match the v2.5.x override block
// verbatim.

import type {DesignTokens} from '@docent/kit';

export const tokens: DesignTokens = {
  bg: {
    void: '#000000',         // pure black
    base: '#0a0a0c',         // rich black
    panel: '#16161a',        // card
    panelHi: '#202024',      // raised
    line: '#2a2a30',         // subtle
    lineHi: '#404048',       // focused
  },
  ink: {
    hi: '#ffffff',           // pure white
    mid: '#b8bac0',
    low: '#7a7d85',
    faint: '#4a4d55',
  },
  accent: {
    blue: '#0a84ff',         // iOS blue (system primary)
    cyan: '#5ac8fa',         // tech cyan
    green: '#30d158',        // iOS green
    amber: '#ff9f0a',        // iOS orange
    rose: '#ff375f',         // iOS pink-red
    violet: '#bf5af2',       // iOS purple
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
      body: 500,
      label: 600,
      heading: 700,
      display: 800,
    },
    lineHeight: 1.45,
    letterSpacing: 0,
  },
  // premium spacing — broadest of the family
  spacing: {
    xs: 8,
    sm: 14,      // tight
    md: 22,      // snug
    lg: 36,      // comfortable
    xl: 56,      // spacious
    gutter: 36,
  },
  // soft premium
  radius: {sm: 8, md: 14, lg: 22},
  // confident strokes — heavier than any other preset
  stroke: {hairline: 1, thin: 2, regular: 2.5, bold: 3},
};
