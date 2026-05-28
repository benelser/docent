// engineering — the dark cool console preset.
//
// Linear / Raycast / iTerm. Deep blue-black, electric primaries, tight mono.
// Migrated from packages/engine/src/style/stylePresets.ts (v2.5.x) — tokens
// byte-identical, visualization knobs preserved.
//
// Shape: the standard PresetPlugin. `extends` is R4 forward-compat and
// intentionally left undefined.

import type {PresetPlugin} from '@bjelser/kit';

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

  cue: "console aesthetic — code-heavy reviews, PR walkthroughs, internal subsystem deep-dives.",
  signals: [
    {needle: "pull request", weight: 3},
    {needle: "pr review", weight: 3},
    {needle: "github.com", weight: 1},
    {needle: "diff", weight: 1},
    {needle: "load-bearing change", weight: 2},
    {needle: "kubernetes", weight: 2},
    {needle: "scheduler", weight: 1},
    {needle: "codebase", weight: 2},
    {needle: "repository", weight: 1},
    {needle: "commit", weight: 1},
    {needle: "pkg/", weight: 2},
    {needle: "src/", weight: 1},
    {needle: "subsystem", weight: 2},
    {needle: "function", weight: 1},
    {needle: "control plane", weight: 2},
  ],
};

export default engineeringPreset;
