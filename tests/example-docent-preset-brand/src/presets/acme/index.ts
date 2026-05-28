// acme — a fictional company-brand preset.
//
// Deep navy + pure white + gold. The brand voice in token form. Films
// authored against this preset opt in by writing `style: {preset: 'acme'}`
// at the film level.

import type {PresetPlugin, VisualizationStyle} from '@bjelser/kit';

import {tokens} from './tokens';

const visualization: Required<VisualizationStyle> = {
  legendPosition: 'right',
  gridLines: true,
  axisLabels: true,
  maxLabelsPerSeries: 10,
  treatmentLock: null,
};

export const acmePreset: PresetPlugin = {
  kind: 'preset',
  name: '@example/docent-preset-brand/acme',
  version: '0.1.0',
  presetName: 'acme',
  tokens,
  visualization,
  notes:
    'Acme Corp — deep navy + pure white + gold. A corporate-brand register; gold carries every emphasis.',
};

export default acmePreset;
