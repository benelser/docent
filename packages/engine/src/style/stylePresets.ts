// stylePresets — the 6 built-in presets, expressed as STRUCTURED DATA.
//
// A preset is not a branch in code; it is a token bundle plus a default
// VisualizationStyle. The resolver reads this map by preset name, never
// switches on it. To add a 7th preset, append a row here.
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

// ----- presets --------------------------------------------------------------

// neutral — the byte-identical backward-compat anchor. By contract, this is
// neutralTokens. Do not paraphrase it.
const neutral: PresetDefinition = {
  tokens: neutralTokens,
  visualization: defaultVisualization,
  notes:
    'Default — the dark-console docent baseline. Byte-identical to theme.ts.',
};

// engineering — code-heavy, dark register. Kubernetes-PR / docent-self.
// Same backdrop as neutral; tightened mono numerics; cyan reading slightly
// crisper for diff/highlight roles.
const engineering: PresetDefinition = {
  tokens: extend({
    typography: {
      family: {
        // Tighter, monospaced-first identity — the family is unchanged, but
        // the mono face leads (used for code, terminals, signal numerics).
        mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
      },
      letterSpacing: -0.005, // a hair tighter for numerics
    },
  }),
  visualization: {
    ...defaultVisualization,
    maxLabelsPerSeries: 12, // engineers tolerate more labels per chart
  },
  notes: 'Code-heavy dark register — kubernetes-pr, docent-self.',
};

// editorial — close-reading, prose-forward. Stopping-by-Woods.
// Warm cream-leaning bg, serif body, broader line-height.
const editorial: PresetDefinition = {
  tokens: extend({
    bg: {
      void: '#1a1410',
      base: '#221a13',
      panel: '#2b2118',
      panelHi: '#352920',
      line: '#48382b',
      lineHi: '#5e4a39',
    },
    ink: {
      hi: '#faf3e7',
      mid: '#d4c4a8',
      low: '#9d8e74',
      faint: '#6b5f4f',
    },
    accent: {
      // Warmer accents — the cool console blues read as ink-on-cream here.
      blue: '#7ab8e6',
      cyan: '#5eb8a8',
      green: '#7dc878',
      amber: '#e6a838',
      rose: '#d97188',
      violet: '#a892d6',
    },
    typography: {
      family: {
        sans: '"Source Serif Pro", Georgia, "Times New Roman", serif',
        serif: '"Source Serif Pro", Georgia, "Times New Roman", serif',
      },
      lineHeight: 1.6,
    },
  }),
  visualization: {
    ...defaultVisualization,
    legendPosition: 'bottom', // prose-forward: don't sidebar the chart
  },
  notes: 'Close-reading, prose-forward — stopping-by-woods.',
};

// paper — academic / arxiv-PDF. Let-the-Barbarians-In.
// Light cream background, marker-blue ink, serif body, no fancy glow.
const paper: PresetDefinition = {
  tokens: extend({
    bg: {
      void: '#e8e2d0',
      base: '#f4ebd5',
      panel: '#fbf3dd',
      panelHi: '#fff7e3',
      // Make the line strokes solid mid-grey so they pass a 3:1 ratio
      // against the cream panels (validator enforces this).
      line: '#5a5a5a',
      lineHi: '#3f3f3f',
    },
    ink: {
      hi: '#0a1b2e', // marker-blue, near-black
      mid: '#234668',
      low: '#5a7491',
      faint: '#8a9eb3',
    },
    accent: {
      // Paper journal accents — desaturated.
      blue: '#2a4d7a',
      cyan: '#2a7a73',
      green: '#3d7a3d',
      amber: '#a06820',
      rose: '#a83d52',
      violet: '#5d3d8a',
    },
    typography: {
      family: {
        sans: '"Source Serif Pro", Georgia, "Times New Roman", serif',
        serif: '"Source Serif Pro", Georgia, "Times New Roman", serif',
      },
      lineHeight: 1.55,
    },
  }),
  visualization: {
    ...defaultVisualization,
    legendPosition: 'bottom',
    gridLines: false, // academic figures: minimal chrome
  },
  notes: 'Academic / arxiv-PDF — Let-the-Barbarians-In.',
};

// executive — exec deck. High-contrast, generous spacing.
const executive: PresetDefinition = {
  tokens: extend({
    bg: {
      void: '#000000',
      base: '#0a0a0c',
      panel: '#14141a',
      panelHi: '#1c1c24',
    },
    ink: {
      hi: '#ffffff',
      mid: '#cbcfd9',
      low: '#8a8f9d',
      faint: '#5a5f6d',
    },
    typography: {
      size: {
        micro: 14,
        small: 16,
        body: 22,
        label: 26,
        heading: 40,
        display: 72,
      },
      weight: {
        body: 400,
        label: 600,
        heading: 700,
        display: 800,
      },
    },
    spacing: {
      xs: 6,
      sm: 12,
      md: 24,
      lg: 36,
      xl: 72,
      gutter: 36,
    },
  }),
  visualization: {
    ...defaultVisualization,
    legendPosition: 'right',
    maxLabelsPerSeries: 5, // exec deck: keep it skim-readable
    treatmentLock: 'crisp', // lock out sketch/whiteboard for exec decks
  },
  notes: 'Exec deck — high-contrast, generous spacing, fewer figures.',
};

// analytical — math / proof — euclid-primes. Tight monospace numerics,
// gridded backdrops.
const analytical: PresetDefinition = {
  tokens: extend({
    bg: {
      // Slightly cooler than neutral, with a near-pure black for the void
      // (graph paper feel against the panel grid).
      void: '#030406',
      base: '#070a0e',
      panel: '#0c1117',
      panelHi: '#141a24',
      line: '#2a3344',
      lineHi: '#3e4a64',
    },
    typography: {
      family: {
        // The body face becomes mono too — numerics line up across rows.
        sans: '"JetBrains Mono", "SF Mono", Menlo, monospace',
      },
      letterSpacing: -0.01,
      lineHeight: 1.4,
    },
  }),
  visualization: {
    ...defaultVisualization,
    gridLines: true,
    legendPosition: 'right',
  },
  notes: 'Math / proof — euclid-primes. Tight mono numerics, gridded backdrops.',
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
