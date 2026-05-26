// neutral preset — the byte-identical backward-compat anchor.
//
// `resolveStyle({preset: 'neutral'})` and `resolveStyle(undefined)` BOTH yield
// today's pixel output. The legacy contract (engine v2.5.x stylePresets.ts):
// `neutral.tokens === neutralTokens` byte-identically.
//
// Migrated under Phase B (B.preset.neutral) per
// docs/design/migration-brief-templates.md Template 2 and the strategic plan
// §4.3 (PresetPlugin).

import type {PresetPlugin, VisualizationStyle} from '@docent/kit';

import {tokens} from './tokens';

// `defaultVisualization` from packages/engine/src/style/stylePresets.ts —
// the renderer-knob defaults that the five non-neutral presets selectively
// override. Neutral takes them straight.
const visualization: Required<VisualizationStyle> = {
  legendPosition: 'right',
  gridLines: true,
  axisLabels: true,
  maxLabelsPerSeries: 8,
  treatmentLock: null,
};

export const neutralPreset: PresetPlugin = {
  kind: 'preset',
  name: 'neutral',
  version: '1.0.0',
  presetName: 'neutral',
  tokens,
  visualization,
  notes:
    'Default — the dark-console docent baseline. Byte-identical to theme.ts.',
  // extends?: undefined — R4 forward-compat field; presets are flat in v1.
};

export default neutralPreset;
