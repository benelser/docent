// analytical preset tokens — chalkboard / Mathematica notebook. Near-black
// slate, cool phosphor-white ink, mono leads EVERYTHING (math notation is
// monospace), equation-dense spacing, geometric radii. Chalk-colored accents.
//
// Byte-identical to the resolved output of the v2.5.x `extend({...})` call
// in packages/engine/src/style/stylePresets.ts for the `analytical` preset.
// Inherited fields (typography.family.serif, typography.size, typography.weight)
// come from neutralTokens unchanged.

import type {DesignTokens} from '@docent/kit';

export const tokens: DesignTokens = {
  bg: {
    void: '#020306',
    base: '#080a0e',
    panel: '#0e1115',
    panelHi: '#161a20',
    line: '#252830',
    lineHi: '#3e4250',
  },
  ink: {
    hi: '#fafcff',
    mid: '#c0c6d4',
    low: '#8a8f9d',
    faint: '#5c6170',
  },
  accent: {
    blue: '#5dafff',
    cyan: '#6df0e0',
    green: '#9aff6c',
    amber: '#ffd735',
    rose: '#ff558e',
    violet: '#c08aff',
  },
  typography: {
    family: {
      // Mono leads EVERYTHING — math notation lives in monospace.
      sans: '"JetBrains Mono", "SF Mono", Menlo, monospace',
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
    lineHeight: 1.4,
    letterSpacing: 0,
  },
  spacing: {
    xs: 2,
    sm: 4,
    md: 8,
    lg: 14,
    xl: 22,
    gutter: 14,
  },
  radius: {
    sm: 2,
    md: 3,
    lg: 6,
  },
  stroke: {
    hairline: 0.5,
    thin: 1,
    regular: 1.25,
    bold: 1.5,
  },
};
