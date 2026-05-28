// analytical — the chalkboard / Mathematica preset, registered as a
// PresetPlugin against @bjelser/kit's public protocol.
//
// Migrated from packages/engine/src/style/stylePresets.ts (v2.5.x). Tokens are
// byte-identical to the resolved v2.5.x output.

import type {PresetPlugin} from '@bjelser/kit';

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

  cue: "math-first register — proofs, theorems, derivations; mono labels, scientific axes.",
  signals: [
    {needle: "theorem", weight: 3},
    {needle: "proof", weight: 2},
    {needle: "lemma", weight: 2},
    {needle: "corollary", weight: 2},
    {needle: "euclid", weight: 2},
    {needle: "derivation", weight: 1},
    {needle: "equation", weight: 1},
    {needle: "matrix", weight: 1},
    {needle: "vector", weight: 1},
  ],
};

export default analyticalPreset;
