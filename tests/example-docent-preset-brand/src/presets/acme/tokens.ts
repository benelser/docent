// Acme — corporate-brand design tokens.
//
// A fictional company. The vibe: an enterprise software brand with a deep
// navy ground, white ink, and a single gold accent that does ALL the
// emphasis work (the way a McKinsey deck restrains itself to one colour
// of highlight).
//
// Key choices:
//   - Deep navy background (#0a1b3a) — not black; the warmth of navy reads
//     more corporate, less console.
//   - Pure white ink (#ffffff) for high-emphasis text — clean, no-cool-tint.
//   - Gold accent (#d4a634) across every channel that asks for emphasis.
//     Other accents (cyan/green/rose/violet) are muted variants so a chart
//     with multiple series still reads, but gold remains the brand colour.
//   - Inter for sans (corporate-clean), Source Serif for serif (the editorial
//     foil when a passage scene wants it).

import type {DesignTokens} from '@docent/kit';

export const tokens: DesignTokens = {
  bg: {
    void: '#04081a',       // absolute zero — even darker navy
    base: '#0a1b3a',       // the brand ground — deep corporate navy
    panel: '#102450',      // raised panel
    panelHi: '#173068',    // active panel
    line: '#1f3a78',       // border
    lineHi: '#2d4f9a',     // focused border
  },
  ink: {
    hi: '#ffffff',         // pure white — high-emphasis brand voice
    mid: '#c8d4ec',        // tinted white — body
    low: '#8898b8',        // tertiary
    faint: '#4a5878',      // disabled
  },
  accent: {
    blue: '#5b8def',       // brand-blue (used sparingly)
    cyan: '#5fd1d6',       // muted teal
    green: '#62c08c',      // muted brand green
    amber: '#d4a634',      // THE GOLD — the headline accent
    rose: '#e07b8e',       // muted alert
    violet: '#a59ce8',     // muted secondary
  },
  typography: {
    family: {
      sans: 'Inter, "Helvetica Neue", system-ui, sans-serif',
      serif: '"Source Serif Pro", Georgia, "Times New Roman", serif',
      mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
    },
    size: {
      micro: 13,           // a hair larger than engineering — corporate legibility
      small: 15,
      body: 18,
      label: 20,
      heading: 32,
      display: 64,         // brand display: a touch bigger for the headline
    },
    weight: {
      body: 400,
      label: 500,
      heading: 600,
      display: 800,        // a heavier display weight — brand assertiveness
    },
    lineHeight: 1.5,
    letterSpacing: 0,
  },
  // Generous corporate spacing — the brand likes breathing room.
  spacing: {xs: 4, sm: 8, md: 16, lg: 28, xl: 48, gutter: 40},
  // Soft corners — corporate-friendly, not IDE-sharp.
  radius: {sm: 6, md: 10, lg: 18},
  // Medium strokes — neither hairline (too techy) nor thick (too informal).
  stroke: {hairline: 1, thin: 1.5, regular: 2, bold: 3},
};
