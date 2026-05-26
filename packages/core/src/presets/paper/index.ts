// paper — Nature journal / LaTeX preprint (LIGHT MODE).
//
// Cream-paper background, deep navy ink, serif body, dense academic spacing,
// minimal radii, classical accents. The only light-mode preset in the v1
// default set.
//
// Migrated from packages/engine/src/style/stylePresets.ts § `paper`.
// The resolved DesignTokens are byte-identical to v2.5.x — see ./tokens.ts.

import type {PresetPlugin} from '@docent/kit';

import {tokens} from './tokens';

export const paperPreset: PresetPlugin = {
  kind: 'preset',
  name: 'paper',
  version: '1.0.0',
  presetName: 'paper',
  tokens,
  visualization: {
    legendPosition: 'bottom',
    gridLines: true,
    axisLabels: true,
    maxLabelsPerSeries: 8,
    treatmentLock: null,
  },
  notes:
    'Nature / LaTeX preprint (LIGHT MODE) — cream paper, deep navy ink, classical accents.',
  // extends?: undefined — R4 forward-compat field; leave undefined in v1.
};

export default paperPreset;
