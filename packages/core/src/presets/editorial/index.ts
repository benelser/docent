// editorial — preset plugin.
//
// One of the 6 default presets in `@docent/core`. Registers a token bundle
// and visualization knobs under the `'editorial'` preset name, consumable by
// `FilmSpec.style.preset = 'editorial'`.
//
// The visual register: NYT longform / The New Yorker / Aeon. Warm walnut
// paper-stock background, serif everywhere (the medium is prose), generous
// reading line-height, soft book-like radii, and an accent family running
// burgundy → ochre → deep sage.

import type {PresetPlugin} from '@docent/kit';

import {tokens} from './tokens';

export const editorialPreset: PresetPlugin = {
  kind: 'preset',
  name: 'editorial',
  version: '1.0.0',
  presetName: 'editorial',
  tokens,
  visualization: {
    legendPosition: 'bottom', // prose-forward: don't sidebar the chart
    gridLines: false,         // cleaner — the prose is the data
    axisLabels: true,
    maxLabelsPerSeries: 6,    // curated
    treatmentLock: null,
  },
  notes:
    'NYT / New Yorker — warm walnut, serif everywhere, burgundy/ochre.',
  // extends?: undefined — R4 forward-compat field; leave undefined in v1.
};

export default editorialPreset;
