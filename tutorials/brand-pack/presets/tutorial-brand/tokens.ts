// tutorial-brand — design tokens.
//
// The visual register the tutorial film proves works end-to-end. Deliberately
// distinct from the 6 built-in presets so an audit ("did my preset actually
// register, or did it silently fall through to `neutral`?") can be answered
// at a glance:
//
//   - Background is IVORY, not warm walnut (editorial) or paper-cream (paper)
//     or near-black (engineering/analytical/executive/neutral). If a tutorial
//     render comes back dark, the preset did not load.
//   - Ink is deep navy-graphite (#10142b) instead of white/cream — high
//     contrast on the ivory floor, but the colour fingerprints as different
//     from every paper-style preset.
//   - Headline accent is CRIMSON (#a8232e) — none of the 6 built-ins use a
//     red of this saturation as their dominant accent.
//   - Type family runs a transitional serif (Lora) for body alongside a
//     condensed sans (Fjalla One / Oswald) for headings and kickers — the
//     "headline / column" split that newsprint trained the eye to read.
//
// Every value in this file is a delta from the neutral floor: pin the
// channels we care about (bg / ink / accent / typography) and the rest
// inherits.

import type {DesignTokens} from '@bjelser/kit';

export const tokens: DesignTokens = {
  bg: {
    void: '#e8e1d2',     // ivory, dimmed — the deepest paper shadow
    base: '#f4ecd8',     // IVORY — the page itself
    panel: '#fbf6ea',    // brighter card — raised paper
    panelHi: '#ffffff',  // crisp white — the focused panel
    line: '#c7b994',     // warm hairline
    lineHi: '#a89469',   // focused hairline
  },
  ink: {
    hi: '#10142b',       // deep navy-graphite — the headline ink
    mid: '#2c324a',      // body ink
    low: '#5b6275',      // tertiary
    faint: '#8d92a3',    // metadata
  },
  accent: {
    // Crimson + ink-blue is the brand. Other channels are tuned to coexist
    // with both rather than fight them.
    blue: '#1d3b6e',     // ink blue — the secondary brand colour
    cyan: '#5d7da3',     // muted slate-blue
    green: '#3f6b3a',    // hunter green — broadsheet diagram colour
    amber: '#c2913d',    // ochre — pull-quote / annotation
    rose: '#a8232e',     // CRIMSON — the headline accent
    violet: '#6e3a78',   // royal purple — secondary callout
  },
  typography: {
    family: {
      // Headline grammar: a condensed sans for chrome (kickers, headings,
      // small caps); a transitional serif for prose. The pairing is the
      // newspaper-broadsheet idiom — Fjalla One above, Lora below.
      sans: '"Fjalla One", "Oswald", "Helvetica Neue Condensed", "Arial Narrow", sans-serif',
      serif: '"Lora", "Source Serif Pro", Georgia, "Times New Roman", serif',
      mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
    },
    size: {
      micro: 12,
      small: 14,
      body: 19,          // a hair larger — newspaper measure
      label: 21,
      heading: 34,       // condensed sans wants room to breathe
      display: 64,       // banner headline scale
    },
    weight: {
      body: 400,
      label: 500,
      heading: 700,      // condensed sans is meant to land heavy
      display: 800,
    },
    lineHeight: 1.6,     // generous broadsheet measure for serif body
    letterSpacing: 0,
  },
  // Broadsheet column gutters — wider than engineering's tight grid.
  spacing: {xs: 4, sm: 8, md: 16, lg: 24, xl: 40, gutter: 32},
  // Square-ish corners — broadsheet doesn't round its rules.
  radius: {sm: 2, md: 4, lg: 8},
  // Crisp, thin rules — the broadsheet hairline.
  stroke: {hairline: 0.75, thin: 1, regular: 1.5, bold: 2.5},
};

export default tokens;
