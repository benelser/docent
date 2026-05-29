// tutorial-brand — the preset plugin authored by the brand-pack tutorial.
//
// A first-party-shaped brand theme (broadsheet ivory + crimson + navy ink)
// that proves a third-party can ship a docent preset WITHOUT forking
// @bjelser/core. The tutorial film (`films/brand-pack-tutorial.json`)
// walks through this exact file.
//
// Registration path:
//   docent.config.ts (repo root)
//     └─ exports {plugins: [tutorialBrandPreset]}
//        └─ @bjelser/cli's load-config picks it up
//           └─ engine.use(tutorialBrandPreset)
//              └─ FilmSpec.style.preset = 'tutorial-brand' resolves to these tokens
//
// A film opts in by writing:
//   "style": {"preset": "tutorial-brand"}

import type {PresetPlugin, VisualizationStyle} from '@bjelser/kit';

import {tokens} from './tokens';

const visualization: Required<VisualizationStyle> = {
  // Broadsheet diagrams sit beneath their caption — keep the legend close.
  legendPosition: 'bottom',
  // Newspaper charts seldom carry a grid; the rules do the work.
  gridLines: false,
  axisLabels: true,
  // Curated, not exhaustive — the broadsheet idiom is the chosen point.
  maxLabelsPerSeries: 6,
  treatmentLock: null,
};

export const tutorialBrandPreset: PresetPlugin = {
  kind: 'preset',
  name: '@tutorial/brand-pack',
  version: '0.1.0',
  presetName: 'tutorial-brand',
  tokens,
  visualization,
  notes:
    'Broadsheet brand — ivory paper, navy-graphite ink, crimson headline accent, transitional serif body, condensed-sans chrome.',

  // Surfaced by `docent style list` and the agent's style recommender.
  cue: "broadsheet / newsprint register — long-form journalism, op-ed, retrospective explainer.",
  signals: [
    {needle: "broadsheet", weight: 4},
    {needle: "newspaper", weight: 4},
    {needle: "newsprint", weight: 4},
    {needle: "op-ed", weight: 3},
    {needle: "front page", weight: 3},
    {needle: "headline", weight: 2},
    {needle: "long-form", weight: 2},
    {needle: "longform", weight: 2},
    {needle: "feature story", weight: 2},
    {needle: "retrospective", weight: 1},
  ],
};

export default tutorialBrandPreset;
