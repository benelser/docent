// agentops — the preset plugin for the AgentOps brand register.
//
// First real third-party brand pack on the docent preset/plugin extension
// point. Sits ALONGSIDE the tutorialBrandPreset (the teaching scaffold) —
// it does not replace it. The two coexist; films pick by `meta.preset`.
//
// Registration path:
//   docent.config.ts (repo root)
//     └─ exports {plugins: [..., agentopsBrand]}
//        └─ @bjelser/cli's load-config picks it up
//           └─ engine.use(agentopsBrand)
//              └─ FilmSpec.style.preset = 'agentops' resolves to these tokens
//                 (or meta.preset = 'agentops' — the engine reads either)
//
// A film opts in by writing:
//   "style": {"preset": "agentops"}   OR   "meta": {"preset": "agentops"}
//
// The runbook (~/ventures/agentops/runbook/02-the-agentops-taxonomy.md) is
// the canonical source for the colour → span mapping. See ./tokens.ts for
// the full attribution.

import type {PresetPlugin, VisualizationStyle} from '@bjelser/kit';

import {tokens} from './tokens';

// The agentops dashboards keep legends right of the panels — the runbook
// reads top-to-bottom, the diagram reads left-to-right, the legend reads
// right-of-diagram. Grid lines stay on (control-plane charts want the rule
// lines for at-a-glance threshold checks). Slightly more series allowed
// than neutral — 8 → 10 — because a fleet view often spans every agent.
const visualization: Required<VisualizationStyle> = {
  legendPosition: 'right',
  gridLines: true,
  axisLabels: true,
  maxLabelsPerSeries: 10,
  treatmentLock: null,
};

export const agentopsBrand: PresetPlugin = {
  kind: 'preset',
  name: '@agentops/brand-pack',
  version: '0.1.0',
  presetName: 'agentops',
  tokens,
  visualization,
  notes:
    'AgentOps brand — deep navy ground, Inter + JetBrains Mono, six span-typed accents (plan-step purple, llm-call green, tool-call brown, agent-decision blue, flow-checkpoint gray, hallucination red).',

  // Surfaced by `docent style list` and the agent's style recommender.
  cue: "agent observability / runbook register — LLM agent traces, span taxonomies, on-call walkthroughs.",
  signals: [
    {needle: "agentops", weight: 4},
    {needle: "agent observability", weight: 4},
    {needle: "span taxonomy", weight: 4},
    {needle: "llm agent", weight: 3},
    {needle: "opentelemetry", weight: 3},
    {needle: "trace", weight: 2},
    {needle: "runbook", weight: 2},
    {needle: "on-call", weight: 2},
    {needle: "hallucination", weight: 2},
    {needle: "tool call", weight: 1},
    {needle: "plan step", weight: 1},
    {needle: "flow checkpoint", weight: 1},
  ],
};

export default agentopsBrand;
