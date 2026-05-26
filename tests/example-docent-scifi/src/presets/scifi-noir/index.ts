// scifi-noir preset — a distinctive third-party visual register.
//
// Deep purples, neon cyan, mono-leading. Loud enough that you can SEE the
// preset has taken effect when it's swapped in. The acceptance test mounts
// this against the kit's style resolver to prove a third-party preset can
// override the default tokens without forking @docent/core.

import type {DesignTokens, PresetPlugin, VisualizationStyle} from '@docent/kit';

const tokens: DesignTokens = {
  bg: {
    void: '#040214',
    base: '#0a0420',
    panel: '#150a30',
    panelHi: '#1d1040',
    line: '#2a1a55',
    lineHi: '#3f2a75',
  },
  ink: {
    hi: '#e6f3ff',
    mid: '#aab8ff',
    low: '#7a7cd8',
    faint: '#4a4a8a',
  },
  accent: {
    blue: '#7af8ff',
    cyan: '#7af8ff',
    green: '#5fe8a4',
    amber: '#ffc24d',
    rose: '#ff7d97',
    violet: '#c0aaff',
  },
  typography: {
    family: {
      sans: 'JetBrains Mono, ui-monospace, monospace',
      serif: 'Charter, Georgia, serif',
      mono: 'JetBrains Mono, ui-monospace, monospace',
    },
    size: {
      micro: 12,
      small: 14,
      body: 16,
      label: 18,
      heading: 32,
      display: 64,
    },
    weight: {
      body: 400,
      label: 500,
      heading: 600,
      display: 700,
    },
    lineHeight: 1.5,
    letterSpacing: 0.5,
  },
  spacing: {xs: 4, sm: 8, md: 16, lg: 24, xl: 40, gutter: 32},
  radius: {sm: 4, md: 8, lg: 16},
  stroke: {hairline: 0.5, thin: 1, regular: 2, bold: 4},
};

const visualization: Required<VisualizationStyle> = {
  legendPosition: 'right',
  gridLines: true,
  axisLabels: true,
  maxLabelsPerSeries: 8,
  treatmentLock: null,
};

export const scifiNoirPreset: PresetPlugin = {
  kind: 'preset',
  name: '@example/docent-scifi/scifi-noir',
  version: '0.1.0',
  presetName: 'scifi-noir',
  tokens,
  visualization,
  notes:
    'Deep purples, neon cyan, mono-leading — the docent-method scene grammar reskinned as a holodeck readout.',
};

export default scifiNoirPreset;
