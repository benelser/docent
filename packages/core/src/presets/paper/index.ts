// paper — Nature journal / LaTeX preprint (LIGHT MODE).
//
// Cream-paper background, deep navy ink, serif body, dense academic spacing,
// minimal radii, classical accents. The only light-mode preset in the v1
// default set.
//
// Migrated from packages/engine/src/style/stylePresets.ts § `paper`.
// The resolved DesignTokens are byte-identical to v2.5.x — see ./tokens.ts.

import type {PresetPlugin} from '@bjelser/kit';

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

  cue: "academic register — arXiv preprints, journal papers, formal lemma/proof prose.",
  signals: [
    {needle: "arxiv", weight: 4},
    {needle: "arxiv.org", weight: 4},
    {needle: "/abs/", weight: 3},
    {needle: "/pdf/", weight: 2},
    {needle: "journal", weight: 2},
    {needle: "preprint", weight: 3},
    {needle: "cite", weight: 1},
    {needle: "citation", weight: 1},
    {needle: "abstract:", weight: 1},
    {needle: "doi:", weight: 3},
    {needle: "peer-reviewed", weight: 3},
    {needle: "academic paper", weight: 3},
    {needle: "research paper", weight: 3},
    {needle: "figure 1", weight: 1},
    {needle: "table 1", weight: 1},
  ],
};

export default paperPreset;
