// neutral preset — design tokens.
//
// BYTE-IDENTICAL to `neutralTokens` in
// packages/engine/src/style/styleTokens.ts (v2.5.x). This is the dark-console
// docent baseline — what `resolveStyle({preset: 'neutral'})` and
// `resolveStyle(undefined)` BOTH resolve to. The snapshot test in
// styleResolver.test.ts (engine, v2.5.x) pins this contract. Editing here
// without editing the engine equivalent breaks backward-compat by definition.
//
// Migrated under the Phase B fan-out (B.preset.neutral) per
// docs/design/migration-brief-templates.md Template 2.

import type {DesignTokens} from '@bjelser/kit';

export const tokens: DesignTokens = {
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
