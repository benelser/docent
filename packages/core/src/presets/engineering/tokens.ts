// engineering preset — DesignTokens (byte-identical to v2.5.x).
//
// Source of truth: packages/engine/src/style/stylePresets.ts (the
// `engineering` PresetDefinition) — the `extend(...)` call against
// `neutralTokens` flattened here so the preset is self-contained and the
// renderer reads ONE structured bundle, not a merge.
//
// Linear / Raycast / iTerm. The dark cool console: deep blue-black bg,
// electric primaries, tight mono numerics, sharp IDE-like corners,
// hairline borders. Code is the medium.

import type {DesignTokens} from '@docent/kit';

export const tokens: DesignTokens = {
  bg: {
    void: '#020408',         // absolute zero
    base: '#060a12',         // deep night, cool tint
    panel: '#0c1220',        // card bg
    panelHi: '#141b2d',      // raised card
    line: '#1f2940',         // subtle border
    lineHi: '#2f3d5e',       // focused border
  },
  ink: {
    hi: '#e8efff',           // crisp white, cool hint
    mid: '#a3b1d4',          // secondary
    low: '#6b7894',          // tertiary
    faint: '#3d4660',        // disabled
  },
  accent: {
    blue: '#0094ff',         // electric primary
    cyan: '#00e8c8',         // mint terminal
    green: '#5cff88',        // matrix green
    amber: '#ffb240',        // warning amber
    rose: '#ff5577',         // alert pink
    violet: '#9577ff',       // cool purple
  },
  typography: {
    family: {
      // SANS_STACK / MONO_STACK from stylePresets.ts. The engineering
      // `extend(...)` override pins `sans` and `mono` explicitly even
      // though they match neutral byte-for-byte; `serif` falls through
      // from neutralTokens (unused in this preset, kept for completeness).
      sans: 'Inter, "Helvetica Neue", system-ui, sans-serif',
      serif: '"Source Serif Pro", Georgia, "Times New Roman", serif',
      mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
    },
    // size / weight inherit neutralTokens — engineering does not override them.
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
    lineHeight: 1.45,         // inherits neutral
    letterSpacing: -0.005,    // a hair tighter for numerics
  },
  // tight precision feel — map the design-direction names onto the
  // existing six-step scale. xs is half of "tight", gutter matches
  // "comfortable".
  spacing: {
    xs: 4,
    sm: 6,       // tight
    md: 12,      // snug
    lg: 20,      // comfortable
    xl: 32,      // spacious
    gutter: 20,
  },
  // IDE-like, sharp
  radius: {
    sm: 4,
    md: 6,
    lg: 10,
  },
  // thin precision — base ≈ 1.25, heavy ≈ 2 between thin and bold.
  stroke: {
    hairline: 0.75,
    thin: 1.25,
    regular: 1.5,
    bold: 2,
  },
};
