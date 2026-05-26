// engineering — the dark cool console preset.
//
// Linear / Raycast / iTerm. Deep blue-black, electric primaries, tight mono.
// Migrated from packages/engine/src/style/stylePresets.ts (v2.5.x) — tokens
// byte-identical, visualization knobs preserved.
//
// Shape: the standard PresetPlugin. `extends` is R4 forward-compat and
// intentionally left undefined.

import type {PresetPlugin} from '@docent/kit';

import {tokens} from './tokens';

export const engineeringPreset: PresetPlugin = {
  kind: 'preset',
  name: 'engineering',
  version: '1.0.0',
  presetName: 'engineering',
  tokens,
  visualization: {
    legendPosition: 'right',
    gridLines: true,
    axisLabels: true,
    maxLabelsPerSeries: 12,  // engineers tolerate more labels per chart
    treatmentLock: null,
  },
  notes:
    'Linear / Raycast / iTerm — deep blue-black, electric primaries, tight mono.',
  // extends?: undefined — R4 forward-compat field; leave undefined in v1.
};

export default engineeringPreset;
