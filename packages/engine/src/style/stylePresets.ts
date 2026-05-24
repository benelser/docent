// stylePresets — the 6 built-in presets, expressed as STRUCTURED DATA.
//
// A preset is not a branch in code; it is a token bundle plus a default
// VisualizationStyle. The resolver reads this map by preset name, never
// switches on it. To add a 7th preset, append a row here.
//
// Design contract for the five non-neutral presets — each preset must FEEL
// like a distinctive product / medium. A screenshot from one preset should be
// unmistakable for a screenshot from another. That is enforced by giving each
// its own bg ramp, ink ramp, accent family, type family, spacing scale,
// radius scale, and stroke scale — not just two or three swapped colors.
//
// Backward-compat contract: `neutral` MUST be `neutralTokens` byte-identically
// so `resolveStyle({preset: 'neutral'})` and `resolveStyle(undefined)` both
// resolve to today's pixel output.

import type {DesignTokens} from './styleTokens';
import {neutralTokens} from './styleTokens';
import type {
  StylePreset,
  VisualizationStyle,
} from './styleSchema';

export interface PresetDefinition {
  tokens: DesignTokens;
  visualization: Required<VisualizationStyle>;
  // What the preset is *for*. Intent the mapper layer is free to override.
  notes: string;
}

// Helper — start from neutralTokens, override only what changes, get back a
// complete DesignTokens. Keeps preset definitions readable.
const extend = (over: {
  bg?: Partial<DesignTokens['bg']>;
  ink?: Partial<DesignTokens['ink']>;
  accent?: Partial<DesignTokens['accent']>;
  typography?: {
    family?: Partial<DesignTokens['typography']['family']>;
    size?: Partial<DesignTokens['typography']['size']>;
    weight?: Partial<DesignTokens['typography']['weight']>;
    lineHeight?: number;
    letterSpacing?: number;
  };
  spacing?: Partial<DesignTokens['spacing']>;
  radius?: Partial<DesignTokens['radius']>;
  stroke?: Partial<DesignTokens['stroke']>;
}): DesignTokens => ({
  bg: {...neutralTokens.bg, ...over.bg},
  ink: {...neutralTokens.ink, ...over.ink},
  accent: {...neutralTokens.accent, ...over.accent},
  typography: {
    family: {...neutralTokens.typography.family, ...over.typography?.family},
    size: {...neutralTokens.typography.size, ...over.typography?.size},
    weight: {...neutralTokens.typography.weight, ...over.typography?.weight},
    lineHeight: over.typography?.lineHeight ?? neutralTokens.typography.lineHeight,
    letterSpacing: over.typography?.letterSpacing ?? neutralTokens.typography.letterSpacing,
  },
  spacing: {...neutralTokens.spacing, ...over.spacing},
  radius: {...neutralTokens.radius, ...over.radius},
  stroke: {...neutralTokens.stroke, ...over.stroke},
});

const defaultVisualization: Required<VisualizationStyle> = {
  legendPosition: 'right',
  gridLines: true,
  axisLabels: true,
  maxLabelsPerSeries: 8,
  treatmentLock: null,
};

// ----- font-family strings --------------------------------------------------
//
// Loaded font families lead each chain; the Remotion loader pins them at
// render time (see ../fonts.ts). Generic fallbacks come after so a missing
// font degrades to a comparable face rather than a UI default.
//
// "Source Serif Four" is the actual family name Remotion's loader returns for
// the SourceSerif4 google-fonts module; "Source Serif Pro" is the legacy
// Adobe name kept in the chain for editor previews on systems that have it.
const SERIF_STACK =
  '"Source Serif Four", "Source Serif Pro", Georgia, "Times New Roman", serif';
const MONO_STACK = '"JetBrains Mono", "SF Mono", Menlo, monospace';
const SANS_STACK = 'Inter, "Helvetica Neue", system-ui, sans-serif';

// ----- presets --------------------------------------------------------------

// neutral — the byte-identical backward-compat anchor. By contract, this is
// neutralTokens. Do not paraphrase it.
const neutral: PresetDefinition = {
  tokens: neutralTokens,
  visualization: defaultVisualization,
  notes:
    'Default — the dark-console docent baseline. Byte-identical to theme.ts.',
};

// engineering — Linear / Raycast / iTerm. The dark cool console. Deep
// blue-black bg, electric primaries, tight mono numerics, sharp IDE-like
// corners, hairline borders. Code is the medium.
const engineering: PresetDefinition = {
  tokens: extend({
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
        sans: SANS_STACK,
        mono: MONO_STACK,
      },
      letterSpacing: -0.005,   // a hair tighter for numerics
    },
    // tight precision feel — map the design-direction names onto the
    // existing six-step scale. xs is half of "tight", gutter matches "comfortable".
    spacing: {
      xs: 4,
      sm: 6,       // tight
      md: 12,      // snug
      lg: 20,      // comfortable
      xl: 32,      // spacious
      gutter: 20,
    },
    // IDE-like, sharp
    radius: {sm: 4, md: 6, lg: 10},
    // thin precision — base ≈ 1.25, heavy ≈ 2 between thin and bold.
    stroke: {hairline: 0.75, thin: 1.25, regular: 1.5, bold: 2},
  }),
  visualization: {
    ...defaultVisualization,
    gridLines: true,
    axisLabels: true,
    maxLabelsPerSeries: 12,  // engineers tolerate more labels per chart
  },
  notes: 'Linear / Raycast / iTerm — deep blue-black, electric primaries, tight mono.',
};

// editorial — NYT longform / The New Yorker / Aeon. Warm walnut paper-stock
// bg, serif body & sans (the medium is prose), generous reading line-height,
// soft book-like corners.
const editorial: PresetDefinition = {
  tokens: extend({
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
        sans: SERIF_STACK,
        serif: SERIF_STACK,
      },
      lineHeight: 1.55,        // generous reading line-height
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
  }),
  visualization: {
    ...defaultVisualization,
    legendPosition: 'bottom', // prose-forward: don't sidebar the chart
    gridLines: false,         // cleaner — the prose is the data
    axisLabels: true,
    maxLabelsPerSeries: 6,    // curated
  },
  notes: 'NYT longform / The New Yorker / Aeon — warm walnut, serif everywhere, generous spacing.',
};

// paper — Nature journal / LaTeX preprint. LIGHT cream-paper background,
// deep ink, serif body, dense academic spacing, minimal radii. The only
// light-mode preset.
const paper: PresetDefinition = {
  tokens: extend({
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
      lineHeight: 1.45,        // tight academic
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
  }),
  visualization: {
    ...defaultVisualization,
    legendPosition: 'bottom',
    gridLines: true,
    axisLabels: true,
    maxLabelsPerSeries: 8,
  },
  notes: 'Nature / LaTeX preprint — cream paper, deep ink, serif, dense academic figures.',
};

// analytical — chalkboard / Mathematica notebook. Near-black slate, cool
// phosphor-white ink, mono leads EVERYTHING (math notation is monospace),
// equation-dense spacing, geometric radii. Chalk-colored accents.
const analytical: PresetDefinition = {
  tokens: extend({
    bg: {
      void: '#020306',         // absolute
      base: '#080a0e',         // near-black slate
      panel: '#0e1115',        // card
      panelHi: '#161a20',      // raised
      line: '#252830',         // border
      lineHi: '#3e4250',       // focused
    },
    ink: {
      hi: '#fafcff',           // cool phosphor white
      mid: '#c0c6d4',
      low: '#8a8f9d',
      faint: '#5c6170',
    },
    accent: {
      blue: '#5dafff',         // sky chalk
      cyan: '#6df0e0',         // mint chalk
      green: '#9aff6c',        // lime chalk
      amber: '#ffd735',        // yellow chalk
      rose: '#ff558e',         // pink chalk
      violet: '#c08aff',       // lavender chalk
    },
    typography: {
      family: {
        // Mono leads EVERYTHING — math notation lives in monospace.
        sans: MONO_STACK,
        mono: MONO_STACK,
      },
      letterSpacing: 0,
      lineHeight: 1.4,
    },
    // equation-dense — tight columns of numerics
    spacing: {
      xs: 2,
      sm: 4,       // tight
      md: 8,       // snug
      lg: 14,      // comfortable
      xl: 22,      // spacious
      gutter: 14,
    },
    // geometric — small, near-square
    radius: {sm: 2, md: 3, lg: 6},
    // thin precision lines (mirroring paper's restraint but on dark)
    stroke: {hairline: 0.5, thin: 1, regular: 1.25, bold: 1.5},
  }),
  visualization: {
    ...defaultVisualization,
    legendPosition: 'right',
    gridLines: true,         // graph-paper feel
    axisLabels: true,
    maxLabelsPerSeries: 16,  // math wants every tick
  },
  notes: 'Chalkboard / Mathematica — near-black slate, mono everywhere, chalk-colored accents.',
};

// executive — Apple Keynote / premium strategy deck. Pure-black bg, iOS
// system colors, heavier weights (display 800), generous premium spacing,
// soft radii, confident strokes. Locked to crisp.
const executive: PresetDefinition = {
  tokens: extend({
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
      family: {sans: SANS_STACK},
      weight: {body: 500, label: 600, heading: 700, display: 800},
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
  }),
  visualization: {
    ...defaultVisualization,
    legendPosition: 'right',
    gridLines: false,        // cleaner deck
    axisLabels: true,
    maxLabelsPerSeries: 5,   // focused
    treatmentLock: 'crisp',  // lock out sketch/whiteboard for exec decks
  },
  notes: 'Apple Keynote / premium deck — pure black, iOS colors, heavy weights, generous spacing.',
};

// The preset registry — what the resolver indexes into. Closed enum; the
// validator rejects any preset name not present here.
export const PRESETS: Record<StylePreset, PresetDefinition> = {
  neutral,
  engineering,
  editorial,
  paper,
  executive,
  analytical,
};

// Look up a preset by name. Throws if the name is not registered — by design,
// fail-closed. Validators call this through validate() first; this is the
// post-validation accessor.
export const getPreset = (name: StylePreset): PresetDefinition => {
  const p = PRESETS[name];
  if (!p) {
    throw new Error(
      `stylePresets: unknown preset "${name}". Known: ${Object.keys(PRESETS).join(', ')}`,
    );
  }
  return p;
};
