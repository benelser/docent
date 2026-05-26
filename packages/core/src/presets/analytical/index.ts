// analytical — the chalkboard / Mathematica preset, registered as a
// PresetPlugin against @docent/kit's public protocol.
//
// Migrated from packages/engine/src/style/stylePresets.ts (v2.5.x). Tokens are
// byte-identical to the resolved v2.5.x output.

import type {PresetPlugin} from '@docent/kit';

import {tokens} from './tokens';

export const analyticalPreset: PresetPlugin = {
  kind: 'preset',
  name: 'analytical',
  version: '1.0.0',
  presetName: 'analytical',
  tokens,
  visualization: {
    legendPosition: 'right',
    gridLines: true,
    axisLabels: true,
    maxLabelsPerSeries: 16,
    treatmentLock: null,
  },
  notes:
    'Mathematica chalkboard — near-black slate, chalk-spectrum accents, mono leads.',
  // extends?: undefined — R4 forward-compat field; leave undefined in v1.
};

export default analyticalPreset;
