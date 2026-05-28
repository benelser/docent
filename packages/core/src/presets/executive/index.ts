// executive preset plugin — Apple Keynote / premium strategy deck.
//
// Migrated from packages/engine/src/style/stylePresets.ts as a PresetPlugin
// per the Phase B fan-out (docs/design/migration-brief-templates.md Template 2).
//
// The visualization block mirrors the v2.5.x executive entry verbatim:
// `legendPosition: 'right'`, `gridLines: false` (cleaner deck), `axisLabels:
// true`, `maxLabelsPerSeries: 5` (focused), `treatmentLock: 'crisp'` (locks
// out sketch/whiteboard for executive decks).

import type {PresetPlugin} from '@bjelser/kit';

import {tokens} from './tokens';

export const executivePreset: PresetPlugin = {
  kind: 'preset',
  name: 'executive',
  version: '1.0.0',
  presetName: 'executive',
  tokens,
  visualization: {
    legendPosition: 'right',
    gridLines: false,        // cleaner deck
    axisLabels: true,
    maxLabelsPerSeries: 5,   // focused
    treatmentLock: 'crisp',  // lock out sketch/whiteboard for exec decks
  },
  notes:
    'Apple Keynote / premium strategy deck — pure black, pure white, iOS system colors.',
  // extends?: undefined — R4 forward-compat field; leave undefined in v1.

  cue: "C-suite deck register — strategy decks, board updates; minimal chart noise, single-accent emphasis.",
  signals: [
    {needle: "exec deck", weight: 3},
    {needle: "executive summary", weight: 3},
    {needle: "board", weight: 1},
    {needle: "strategy", weight: 1},
    {needle: "go-to-market", weight: 2},
  ],
};

export default executivePreset;
