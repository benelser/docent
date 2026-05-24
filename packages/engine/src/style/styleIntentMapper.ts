// styleIntentMapper — turn semantic intent into a token delta.
//
// This file is pure data transformation. It does NOT branch by preset name.
// Each intent axis (tone / audience / medium / density / theme / emphasis)
// produces a small DesignTokenOverrides + VisualizationStyle patch. The
// resolver merges them in a fixed order; conflicts are last-write-wins
// across the axes (deterministic).
//
// Pipeline location:
//   base renderer defaults
//   → named style preset
//   → semantic style intent          ← THIS FILE
//   → agent-provided style overrides
//   → user preference overrides
//   → validation / normalization / accessibility constraints
//   → resolved style object

import type {
  StyleIntent,
  DesignTokenOverrides,
  VisualizationStyle,
} from './styleSchema';

// The diff one intent axis contributes. Both `tokens` and `visualization`
// are partial; missing fields mean "no opinion from this axis".
export interface IntentDelta {
  tokens: DesignTokenOverrides;
  visualization: VisualizationStyle;
}

const EMPTY: IntentDelta = {tokens: {}, visualization: {}};

// ----- per-axis mappers -----------------------------------------------------

const fromTone = (tone?: StyleIntent['tone']): IntentDelta => {
  if (!tone) return EMPTY;
  switch (tone) {
    case 'professional':
      // Professional locks out the hand-drawn skin; it is the "default
      // serious" tone.
      return {tokens: {}, visualization: {treatmentLock: 'crisp'}};
    case 'executive':
      // Executive is one notch beyond professional — bigger weights, locked
      // to crisp, fewer ornamental strokes.
      return {
        tokens: {
          typography: {
            weight: {label: 600, heading: 700, display: 800},
          },
        },
        visualization: {treatmentLock: 'crisp', gridLines: false},
      };
    case 'technical':
      // Technical leans on the mono face. Tighter numerics; engineering-flavoured.
      return {
        tokens: {
          typography: {letterSpacing: -0.005},
        },
        visualization: {maxLabelsPerSeries: 12},
      };
    case 'playful':
      // Playful unlocks the sketch treatment (and explicitly does NOT lock).
      return {
        tokens: {},
        visualization: {treatmentLock: null},
      };
    case 'neutral':
    default:
      return EMPTY;
  }
};

const fromAudience = (a?: StyleIntent['audience']): IntentDelta => {
  if (!a) return EMPTY;
  switch (a) {
    case 'executive':
      // Tighter density, bigger headers, fewer labels per chart.
      return {
        tokens: {
          spacing: {xs: 6, sm: 12, md: 20, lg: 32, xl: 64, gutter: 32},
          typography: {
            size: {label: 24, heading: 36, display: 64},
          },
        },
        visualization: {maxLabelsPerSeries: 5, gridLines: false},
      };
    case 'technical':
      return {
        tokens: {},
        visualization: {maxLabelsPerSeries: 12, axisLabels: true, gridLines: true},
      };
    case 'general':
      return {
        tokens: {},
        visualization: {maxLabelsPerSeries: 6},
      };
    default:
      return EMPTY;
  }
};

const fromMedium = (m?: StyleIntent['medium']): IntentDelta => {
  if (!m) return EMPTY;
  switch (m) {
    case 'mobile':
      // Vertical priority, larger touch targets, denser narration.
      return {
        tokens: {
          typography: {
            size: {body: 20, label: 22, heading: 30, display: 56},
          },
          spacing: {sm: 10, md: 18, lg: 28, gutter: 28},
        },
        visualization: {legendPosition: 'bottom'},
      };
    case 'slide':
      return {
        tokens: {
          typography: {
            size: {body: 22, label: 26, heading: 40},
          },
        },
        visualization: {legendPosition: 'right'},
      };
    case 'report':
      return {
        tokens: {
          typography: {lineHeight: 1.55},
        },
        visualization: {legendPosition: 'bottom'},
      };
    case 'web':
    default:
      return EMPTY;
  }
};

const fromDensity = (d?: StyleIntent['density']): IntentDelta => {
  if (!d) return EMPTY;
  // Density uniformly scales the spacing scale. Done as integer math (round)
  // so the resolved tokens stay in CSS px.
  const scale = d === 'compact' ? 0.85 : d === 'spacious' ? 1.18 : 1;
  if (scale === 1) return EMPTY;
  const r = (n: number): number => Math.max(0, Math.round(n * scale));
  return {
    tokens: {
      spacing: {
        xs: r(4),
        sm: r(8),
        md: r(16),
        lg: r(24),
        xl: r(48),
        gutter: r(24),
      },
    },
    visualization: {},
  };
};

const fromTheme = (t?: StyleIntent['theme']): IntentDelta => {
  if (!t || t === 'auto') return EMPTY;
  if (t === 'light') {
    // Flip to a light palette. Note: a more aggressive flip ("paper") is the
    // dedicated preset; this is a softer, neutral light.
    return {
      tokens: {
        bg: {
          void: '#e6e6ea',
          base: '#f4f4f8',
          panel: '#fafafd',
          panelHi: '#ffffff',
          line: '#5e5e6a',
          lineHi: '#3f3f4a',
        },
        ink: {
          hi: '#0a0c10',
          mid: '#3a4150',
          low: '#5c6473',
          faint: '#7d8492',
        },
      },
      visualization: {},
    };
  }
  // theme: 'dark' — explicitly enforce the dark console palette in case a
  // preset (paper, editorial) is light by default. This is the "force dark"
  // override; the brief lists it as the canonical dark intent.
  return {
    tokens: {
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
    },
    visualization: {},
  };
};

const fromEmphasis = (e?: StyleIntent['emphasis']): IntentDelta => {
  if (!e) return EMPTY;
  switch (e) {
    case 'data-first':
      // Chart chrome stays; narration shrinks a touch.
      return {
        tokens: {typography: {size: {body: 16}}},
        visualization: {gridLines: true, axisLabels: true},
      };
    case 'insight-first':
      // Heading and body grow; chart chrome reduces.
      return {
        tokens: {typography: {size: {body: 20, heading: 32}}},
        visualization: {gridLines: false, maxLabelsPerSeries: 6},
      };
    case 'presentation-first':
      // The display size dominates; tight legend on the right.
      return {
        tokens: {typography: {size: {display: 64, heading: 36}}},
        visualization: {legendPosition: 'right', gridLines: false},
      };
    default:
      return EMPTY;
  }
};

// ----- merge helpers --------------------------------------------------------

// Deep merge two DesignTokenOverrides — later wins on a per-field basis.
// Kept narrow on purpose: only the fields the override interface actually
// declares need merging.
const mergeTokens = (
  a: DesignTokenOverrides,
  b: DesignTokenOverrides,
): DesignTokenOverrides => ({
  bg: {...a.bg, ...b.bg},
  ink: {...a.ink, ...b.ink},
  accent: {...a.accent, ...b.accent},
  typography: {
    family: {...a.typography?.family, ...b.typography?.family},
    size: {...a.typography?.size, ...b.typography?.size},
    weight: {...a.typography?.weight, ...b.typography?.weight},
    lineHeight: b.typography?.lineHeight ?? a.typography?.lineHeight,
    letterSpacing: b.typography?.letterSpacing ?? a.typography?.letterSpacing,
  },
  spacing: {...a.spacing, ...b.spacing},
  radius: {...a.radius, ...b.radius},
  stroke: {...a.stroke, ...b.stroke},
});

const mergeVisualization = (
  a: VisualizationStyle,
  b: VisualizationStyle,
): VisualizationStyle => ({
  ...a,
  ...b,
});

// ----- entry point ----------------------------------------------------------

// Map a full intent into a single combined delta. The order axes are merged
// in is fixed (tone → audience → medium → density → theme → emphasis) so the
// pipeline is deterministic for any intent.
export const mapIntent = (intent: StyleIntent | undefined): IntentDelta => {
  if (!intent) return EMPTY;
  const deltas = [
    fromTone(intent.tone),
    fromAudience(intent.audience),
    fromMedium(intent.medium),
    fromDensity(intent.density),
    fromTheme(intent.theme),
    fromEmphasis(intent.emphasis),
  ];
  return deltas.reduce<IntentDelta>(
    (acc, d) => ({
      tokens: mergeTokens(acc.tokens, d.tokens),
      visualization: mergeVisualization(acc.visualization, d.visualization),
    }),
    {tokens: {}, visualization: {}},
  );
};
