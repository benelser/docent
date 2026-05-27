// docent scene-fit — the agent-facing introspection surface over the scene
// grammar.
//
// v2.4.0 grew the grammar to 29 primitives organized by cognitive cluster
// (see kit/taxonomy/cognitive-clusters.ts), but the agent had no CLI handle
// to ask "given this subject's survey, which scene types fit?". Without it,
// the agent reflex-defaults to frame/structure/compare/tension/recap on
// every film — the suspected "default rut" that produces tour-shaped specs
// instead of reviews. This subcommand closes that loop.
//
//   docent scene-fit list [--json]
//     enumerates registered scene plugins grouped by cognitive cluster,
//     with a one-line "reach for it when" cue per type (the same cues
//     the survey templates carry).
//
//   docent scene-fit recommend <subject-id> [--json] [--top N]
//     reads analysis/<id>.md, runs a rule-based survey→scene-type mapper,
//     and prints the top N recommendations with rationales tying each to a
//     specific signal needle the survey contained. NOT an LLM call. The
//     default top=8 matches a typical 6-8 scene film.
//
// MIGRATED from packages/engine/cli/scene-fit.ts (879 lines) as part of
// the v3.0 architecture shift from engine 29-way switch to plugin
// registry. Behavior preserved end-to-end:
//   - SCENE_TYPES, SCENE_META, DEFAULT_RUT, SIGNALS table verbatim
//     (this is the agent's accumulated mapping knowledge)
//   - List command now reads from the engine registry, so third-party
//     plugins registered via docent.config.ts surface alongside core
//   - Each registered plugin's `cluster` field is verified against
//     SCENE_META at runtime; mismatches surface as a warning
//
// All output the agent layer needs to parse is JSON on stdout when
// --json is passed; otherwise the bulleted human report goes to
// stdout and the exit code is the contract.

import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

import type {Engine, ScenePlugin} from '@docent/kit';

import {createEngine} from '../engine-factory';

// ----- the grammar — 29 scene types -----------------------------------------

// The closed scene-type vocabulary, kept in sync with the registered
// ScenePlugins under @docent/core. Adding a scene type means adding it
// here AND a SCENE_META entry below; the runtime warns when the
// registry has a scene we don't know about (a third-party plugin) or
// when SCENE_META has a scene the registry doesn't.
export const SCENE_TYPES = [
  // Connection
  'structure',
  'walkthrough',
  'tree',
  'map',
  // Time
  'timeline',
  'progression',
  // Flow and process
  'diff',
  'mechanism',
  'causal-loop',
  // Comparison and measurement
  'compare',
  'landscape',
  'quantities',
  'chart',
  'prior-art',
  'venn',
  // Categorization and boundaries — tension lives here
  'tension',
  // Human experience
  'journey-map',
  'closeup',
  // Narrative and commitment
  'frame',
  'passage',
  'figure',
  'demonstrate',
  'big-idea',
  'recap',
  // Probe — perturbation / what-if
  'probe',
  // Rhetorical primitives
  'epigraph',
  'concession',
  'objection',
  'provocation',
] as const;

export type SceneType = (typeof SCENE_TYPES)[number];

// Scene-fit's INTERNAL cluster taxonomy. More granular than the kit's
// closed 7-cluster taxonomy: this surfaces `human-experience`, `probe`,
// `rhetorical` as their own buckets in the agent-facing list, which is
// helpful when reasoning about which primitive to reach for. The plugin
// registry's `cluster` field uses the kit's closed taxonomy (probe folds
// into comparison; rhetorical folds into narrative; human-experience
// becomes experience) — both are legitimate.
export const CLUSTERS = [
  'connection',
  'time',
  'flow',
  'comparison',
  'categorization',
  'human-experience',
  'narrative',
  'probe',
  'rhetorical',
] as const;
export type Cluster = (typeof CLUSTERS)[number];

type SceneMeta = {
  cluster: Cluster;
  cue: string;
};

export const SCENE_META: Record<SceneType, SceneMeta> = {
  // connection
  structure: {
    cluster: 'connection',
    cue: 'the subject IS its components and how they connect (node-and-edge diagram).',
  },
  walkthrough: {
    cluster: 'connection',
    cue: 'the argument depends on WHO passes WHAT to WHOM and WHEN (actors over time).',
  },
  tree: {
    cluster: 'connection',
    cue: 'the structure is parent-child and the levels mean something (a taxonomy).',
  },
  map: {
    cluster: 'connection',
    cue: 'WHERE something is matters — geography, topology, proximity, transmission paths.',
  },
  // time
  timeline: {
    cluster: 'time',
    cue: 'the GAPS between dates are part of the argument (real date axis, proportional spacing).',
  },
  progression: {
    cluster: 'time',
    cue: "the order matters but the dates don't (ordinal stages along a track).",
  },
  // flow
  diff: {
    cluster: 'flow',
    cue: 'the argument is "this changed" (before / after, side by side; PR films).',
  },
  mechanism: {
    cluster: 'flow',
    cue: 'parts arranged in a working motion — feedback loop iterating, state machine cycling.',
  },
  'causal-loop': {
    cluster: 'flow',
    cue: 'variables influencing each other in a closed cycle — reinforcing or balancing dynamics.',
  },
  // comparison
  compare: {
    cluster: 'comparison',
    cue: 'a head-to-head call as discrete table cells — options × criteria.',
  },
  landscape: {
    cluster: 'comparison',
    cue: 'options on a 2-D trade-off plane — name both axes, quadrant analysis.',
  },
  quantities: {
    cluster: 'comparison',
    cue: 'the numbers are the argument — figures, a matrix, named metrics.',
  },
  chart: {
    cluster: 'comparison',
    cue: 'continuous data on numeric axes — a trend, a curve, a distribution.',
  },
  'prior-art': {
    cluster: 'comparison',
    cue: 'argument hinges on novelty — the subject placed against 2-4 prior systems × dimensions.',
  },
  venn: {
    cluster: 'comparison',
    cue: 'argument is about what lives ONLY in the intersection of 2-3 sets.',
  },
  // categorization
  tension: {
    cluster: 'categorization',
    cue: 'a trade-off ledger — chosen / rejected / risk; the design choice in the open.',
  },
  // human experience
  'journey-map': {
    cluster: 'human-experience',
    cue: 'how a PERSON moves through something — onboarding, UX, patient flow (emotion × touchpoint).',
  },
  closeup: {
    cluster: 'human-experience',
    cue: 'a specific code or text span needs to land at the line level (annotated artifact).',
  },
  // narrative
  frame: {
    cluster: 'narrative',
    cue: "the film's opening commitment — title, tagline, footnote. Every film opens with one.",
  },
  passage: {
    cluster: 'narrative',
    cue: 'the SOURCE TEXT is the artifact — a poem, a quote, a statute; annotated by phrase.',
  },
  figure: {
    cluster: 'narrative',
    cue: 'the IMAGE is the artifact — a painting, a chart screenshot, a photograph; annotated by region.',
  },
  demonstrate: {
    cluster: 'narrative',
    cue: 'only the moving image conveys it — a Manim render, a UI demo, a phenomenon in motion.',
  },
  'big-idea': {
    cluster: 'narrative',
    cue: 'one held sentence the viewer should leave with; sits before recap (explainer films).',
  },
  recap: {
    cluster: 'narrative',
    cue: 'a closing RULING — points the film proved, what to doubt; never a restatement.',
  },
  // probe
  probe: {
    cluster: 'probe',
    cue: 'vary ONE input and follow the consequence — sensitivity analysis, perturbation, what-if.',
  },
  // rhetorical
  epigraph: {
    cluster: 'rhetorical',
    cue: 'anchor in a tradition — a cited authority opens the film and the argument argues with it.',
  },
  concession: {
    cluster: 'rhetorical',
    cue: 'the film argues something narrow — IN SCOPE / OUT OF SCOPE columns sharpen every claim.',
  },
  objection: {
    cluster: 'rhetorical',
    cue: 'a real-literature challenge the film must answer — CLAIM / OBJECTION / REFUTATION steelman.',
  },
  provocation: {
    cluster: 'rhetorical',
    cue: 'the right ending is "we don\'t know yet" — a question-shaped hand-off, the final scene.',
  },
};

// The "default rut" — the five scene types an undirected agent reflex-defaults
// to on every film, regardless of subject. If the recommender returns *only*
// members of this set in the top N, the caller should consider whether the
// subject actually demands one of the more specific primitives.
export const DEFAULT_RUT: ReadonlySet<SceneType> = new Set<SceneType>([
  'frame',
  'structure',
  'compare',
  'tension',
  'recap',
]);

// ----- the rules — survey signals → scene types -----------------------------

type Signal = {
  needle: string;
  scene: SceneType;
  weight: number;
};

const SIGNALS: Signal[] = [
  // ===== causal-loop =====
  {needle: 'feedback loop', scene: 'causal-loop', weight: 4},
  {needle: 'causal loop', scene: 'causal-loop', weight: 4},
  {needle: 'self-reinforcing', scene: 'causal-loop', weight: 4},
  {needle: 'self reinforcing', scene: 'causal-loop', weight: 3},
  {needle: 'reinforcing loop', scene: 'causal-loop', weight: 4},
  {needle: 'balancing loop', scene: 'causal-loop', weight: 4},
  {needle: 'vicious cycle', scene: 'causal-loop', weight: 3},
  {needle: 'virtuous cycle', scene: 'causal-loop', weight: 3},
  {needle: 'compounds', scene: 'causal-loop', weight: 2},
  {needle: 'compounding', scene: 'causal-loop', weight: 2},
  {needle: 'positive feedback', scene: 'causal-loop', weight: 3},
  {needle: 'negative feedback', scene: 'causal-loop', weight: 3},
  {needle: 'flywheel', scene: 'causal-loop', weight: 2},
  {needle: 'polarity', scene: 'causal-loop', weight: 2},

  // ===== landscape =====
  {needle: 'trade-off plane', scene: 'landscape', weight: 4},
  {needle: 'tradeoff plane', scene: 'landscape', weight: 4},
  {needle: 'two-dimensional', scene: 'landscape', weight: 3},
  {needle: '2-dimensional', scene: 'landscape', weight: 3},
  {needle: 'two axes', scene: 'landscape', weight: 3},
  {needle: 'quadrant', scene: 'landscape', weight: 4},
  {needle: 'positioning', scene: 'landscape', weight: 2},
  {needle: 'cost vs value', scene: 'landscape', weight: 3},
  {needle: 'cost vs. value', scene: 'landscape', weight: 3},
  {needle: 'simplicity vs power', scene: 'landscape', weight: 3},
  {needle: 'latency vs throughput', scene: 'landscape', weight: 3},
  {needle: 'placement on', scene: 'landscape', weight: 2},
  {needle: 'x-axis', scene: 'landscape', weight: 1},
  {needle: 'y-axis', scene: 'landscape', weight: 1},
  {needle: 'plotted on', scene: 'landscape', weight: 1},

  // ===== timeline =====
  {needle: 'timeline', scene: 'timeline', weight: 3},
  {needle: 'date axis', scene: 'timeline', weight: 4},
  {needle: 'chronological', scene: 'timeline', weight: 3},
  {needle: 'chronology', scene: 'timeline', weight: 3},
  {needle: 'dated milestones', scene: 'timeline', weight: 4},
  {needle: 'gaps between', scene: 'timeline', weight: 2},
  {needle: 'years between', scene: 'timeline', weight: 2},
  {needle: 'months between', scene: 'timeline', weight: 2},
  {needle: 'time axis', scene: 'timeline', weight: 3},
  {needle: 'historical record', scene: 'timeline', weight: 2},
  {needle: 'milestone dates', scene: 'timeline', weight: 3},
  {needle: 'arc of', scene: 'timeline', weight: 1},

  // ===== tree =====
  {needle: 'parent-child', scene: 'tree', weight: 4},
  {needle: 'parent/child', scene: 'tree', weight: 4},
  {needle: 'hierarchy', scene: 'tree', weight: 3},
  {needle: 'taxonomy', scene: 'tree', weight: 4},
  {needle: 'taxonomic', scene: 'tree', weight: 3},
  {needle: 'classification', scene: 'tree', weight: 2},
  {needle: 'rooted tree', scene: 'tree', weight: 4},
  {needle: 'org chart', scene: 'tree', weight: 3},
  {needle: 'kingdom', scene: 'tree', weight: 2},
  {needle: 'phylum', scene: 'tree', weight: 2},
  {needle: 'dependency tree', scene: 'tree', weight: 3},
  {needle: 'reporting line', scene: 'tree', weight: 2},
  {needle: 'levels mean', scene: 'tree', weight: 2},

  // ===== map =====
  {needle: 'geography', scene: 'map', weight: 4},
  {needle: 'geographic', scene: 'map', weight: 4},
  {needle: 'regions', scene: 'map', weight: 2},
  {needle: 'regional topology', scene: 'map', weight: 4},
  {needle: 'topology', scene: 'map', weight: 2},
  {needle: 'multi-region', scene: 'map', weight: 3},
  {needle: 'multi region', scene: 'map', weight: 3},
  {needle: 'supply chain', scene: 'map', weight: 3},
  {needle: 'transmission paths', scene: 'map', weight: 3},
  {needle: 'spatial', scene: 'map', weight: 2},
  {needle: 'proximity', scene: 'map', weight: 2},
  {needle: 'continent', scene: 'map', weight: 2},
  {needle: 'border', scene: 'map', weight: 1},
  {needle: 'epidemiology', scene: 'map', weight: 2},

  // ===== journey-map =====
  {needle: 'stages of experience', scene: 'journey-map', weight: 4},
  {needle: 'user flow', scene: 'journey-map', weight: 4},
  {needle: 'user journey', scene: 'journey-map', weight: 4},
  {needle: 'customer journey', scene: 'journey-map', weight: 4},
  {needle: 'onboarding', scene: 'journey-map', weight: 3},
  {needle: 'first-time user', scene: 'journey-map', weight: 3},
  {needle: 'first hour', scene: 'journey-map', weight: 2},
  {needle: 'first week', scene: 'journey-map', weight: 2},
  {needle: 'emotional arc', scene: 'journey-map', weight: 3},
  {needle: 'touchpoint', scene: 'journey-map', weight: 3},
  {needle: 'pain point', scene: 'journey-map', weight: 3},
  {needle: 'pain-point', scene: 'journey-map', weight: 3},
  {needle: 'patient flow', scene: 'journey-map', weight: 3},
  {needle: 'ux research', scene: 'journey-map', weight: 2},

  // ===== venn =====
  {needle: 'set intersection', scene: 'venn', weight: 4},
  {needle: 'intersection of', scene: 'venn', weight: 3},
  {needle: 'overlap', scene: 'venn', weight: 2},
  {needle: 'overlap analysis', scene: 'venn', weight: 4},
  {needle: "what's in both", scene: 'venn', weight: 4},
  {needle: 'in the intersection', scene: 'venn', weight: 4},
  {needle: 'three sets', scene: 'venn', weight: 3},
  {needle: 'two sets', scene: 'venn', weight: 2},
  {needle: 'trifecta', scene: 'venn', weight: 3},
  {needle: 'lives only in', scene: 'venn', weight: 4},
  {needle: 'lives in the intersection', scene: 'venn', weight: 4},

  // ===== mechanism =====
  {needle: 'working motion', scene: 'mechanism', weight: 4},
  {needle: 'cycle through phases', scene: 'mechanism', weight: 4},
  {needle: 'iterate through', scene: 'mechanism', weight: 3},
  {needle: 'iterates through', scene: 'mechanism', weight: 3},
  {needle: 'state machine', scene: 'mechanism', weight: 3},
  {needle: 'state cycle', scene: 'mechanism', weight: 3},
  {needle: 'oscillate', scene: 'mechanism', weight: 3},
  {needle: 'thermostat', scene: 'mechanism', weight: 3},
  {needle: 'gradient descent', scene: 'mechanism', weight: 3},
  {needle: 'how it operates', scene: 'mechanism', weight: 3},
  {needle: 'in continuous motion', scene: 'mechanism', weight: 4},
  {needle: 'animated mechanism', scene: 'mechanism', weight: 4},
  {needle: 'pump', scene: 'mechanism', weight: 1},
  {needle: 'engine cycle', scene: 'mechanism', weight: 3},

  // ===== structure =====
  {needle: 'components and connections', scene: 'structure', weight: 4},
  {needle: 'node-and-edge', scene: 'structure', weight: 4},
  {needle: 'node and edge', scene: 'structure', weight: 4},
  {needle: 'block diagram', scene: 'structure', weight: 3},
  {needle: 'architecture diagram', scene: 'structure', weight: 3},
  {needle: 'system diagram', scene: 'structure', weight: 2},
  {needle: 'connected components', scene: 'structure', weight: 3},
  {needle: 'wired together', scene: 'structure', weight: 2},
  {needle: 'subsystem', scene: 'structure', weight: 1},
  {needle: 'modules', scene: 'structure', weight: 1},

  // ===== walkthrough =====
  {needle: 'sequence diagram', scene: 'walkthrough', weight: 4},
  {needle: 'actors exchange', scene: 'walkthrough', weight: 4},
  {needle: 'protocol exchange', scene: 'walkthrough', weight: 3},
  {needle: 'handshake', scene: 'walkthrough', weight: 2},
  {needle: 'request/response', scene: 'walkthrough', weight: 2},
  {needle: 'step by step', scene: 'walkthrough', weight: 1},
  {needle: 'who passes what', scene: 'walkthrough', weight: 4},
  {needle: 'message exchange', scene: 'walkthrough', weight: 3},
  {needle: 'over a sequence', scene: 'walkthrough', weight: 2},

  // ===== compare =====
  {needle: 'side-by-side options', scene: 'compare', weight: 4},
  {needle: 'side by side options', scene: 'compare', weight: 4},
  {needle: 'options × criteria', scene: 'compare', weight: 4},
  {needle: 'options x criteria', scene: 'compare', weight: 4},
  {needle: 'head-to-head', scene: 'compare', weight: 3},
  {needle: 'comparison table', scene: 'compare', weight: 3},
  {needle: 'feature matrix', scene: 'compare', weight: 3},
  {needle: 'side by side', scene: 'compare', weight: 2},
  {needle: 'side-by-side', scene: 'compare', weight: 2},

  // ===== quantities =====
  {needle: 'numerical claims', scene: 'quantities', weight: 4},
  {needle: 'metrics', scene: 'quantities', weight: 2},
  {needle: 'what the numbers say', scene: 'quantities', weight: 4},
  {needle: 'key numbers', scene: 'quantities', weight: 3},
  {needle: 'benchmark numbers', scene: 'quantities', weight: 3},
  {needle: 'figures the argument', scene: 'quantities', weight: 3},

  // ===== chart =====
  {needle: 'plot data', scene: 'chart', weight: 3},
  {needle: 'plot the data', scene: 'chart', weight: 3},
  {needle: 'curve', scene: 'chart', weight: 1},
  {needle: 'distribution', scene: 'chart', weight: 2},
  {needle: 'power law', scene: 'chart', weight: 3},
  {needle: 'power-law', scene: 'chart', weight: 3},
  {needle: 'trend line', scene: 'chart', weight: 3},
  {needle: 'trendline', scene: 'chart', weight: 3},
  {needle: 'growth curve', scene: 'chart', weight: 3},
  {needle: 'decay curve', scene: 'chart', weight: 3},
  {needle: 'data points', scene: 'chart', weight: 1},

  // ===== prior-art =====
  {needle: 'prior art', scene: 'prior-art', weight: 4},
  {needle: 'prior-art', scene: 'prior-art', weight: 4},
  {needle: 'prior systems', scene: 'prior-art', weight: 3},
  {needle: 'lineage', scene: 'prior-art', weight: 2},
  {needle: 'novelty dimension', scene: 'prior-art', weight: 3},
  {needle: 'differs dimensionally', scene: 'prior-art', weight: 3},

  // ===== passage =====
  {needle: 'prose passage', scene: 'passage', weight: 4},
  {needle: 'close reading', scene: 'passage', weight: 4},
  {needle: 'close-reading', scene: 'passage', weight: 4},
  {needle: 'the source text', scene: 'passage', weight: 4},
  {needle: 'quoted text', scene: 'passage', weight: 3},
  {needle: 'annotated by phrase', scene: 'passage', weight: 4},
  {needle: 'poem', scene: 'passage', weight: 3},
  {needle: 'stanza', scene: 'passage', weight: 3},
  {needle: 'verse', scene: 'passage', weight: 2},
  {needle: 'primary source', scene: 'passage', weight: 2},

  // ===== figure =====
  {needle: 'image with regions', scene: 'figure', weight: 4},
  {needle: 'diagram annotation', scene: 'figure', weight: 4},
  {needle: 'annotate the image', scene: 'figure', weight: 4},
  {needle: 'annotated regions', scene: 'figure', weight: 3},
  {needle: 'still image', scene: 'figure', weight: 3},
  {needle: 'photograph', scene: 'figure', weight: 2},
  {needle: 'painting', scene: 'figure', weight: 2},
  {needle: 'chart screenshot', scene: 'figure', weight: 3},

  // ===== demonstrate =====
  {needle: 'video clip', scene: 'demonstrate', weight: 4},
  {needle: 'manim render', scene: 'demonstrate', weight: 4},
  {needle: 'ui demo', scene: 'demonstrate', weight: 4},
  {needle: 'screen capture', scene: 'demonstrate', weight: 3},
  {needle: 'demo recording', scene: 'demonstrate', weight: 3},
  {needle: 'play it back', scene: 'demonstrate', weight: 2},

  // ===== probe =====
  {needle: 'sensitivity analysis', scene: 'probe', weight: 4},
  {needle: 'what if', scene: 'probe', weight: 2},
  {needle: 'what-if', scene: 'probe', weight: 3},
  {needle: 'perturbation', scene: 'probe', weight: 4},
  {needle: 'vary one input', scene: 'probe', weight: 4},
  {needle: 'turn the knob', scene: 'probe', weight: 3},
  {needle: 'parameter sweep', scene: 'probe', weight: 4},
  {needle: 'dial up', scene: 'probe', weight: 1},

  // ===== tension =====
  {needle: 'trade-off ledger', scene: 'tension', weight: 4},
  {needle: 'trade off ledger', scene: 'tension', weight: 4},
  {needle: 'kept / set aside', scene: 'tension', weight: 4},
  {needle: 'chosen / rejected', scene: 'tension', weight: 4},
  {needle: 'design trade-off', scene: 'tension', weight: 3},
  {needle: 'residual risk', scene: 'tension', weight: 3},
  {needle: 'the road not taken', scene: 'tension', weight: 3},
  {needle: 'alternative not taken', scene: 'tension', weight: 3},
  {needle: 'what was set aside', scene: 'tension', weight: 3},
  {needle: 'what we kept', scene: 'tension', weight: 2},

  // ===== epigraph =====
  {needle: 'cited authority', scene: 'epigraph', weight: 4},
  {needle: 'opens with a quote', scene: 'epigraph', weight: 4},
  {needle: 'opens the film', scene: 'epigraph', weight: 3},
  {needle: 'anchor in a tradition', scene: 'epigraph', weight: 4},
  {needle: 'quoted authority', scene: 'epigraph', weight: 3},
  {needle: 'in the words of', scene: 'epigraph', weight: 2},

  // ===== concession =====
  {needle: 'out of scope', scene: 'concession', weight: 4},
  {needle: 'in scope', scene: 'concession', weight: 2},
  {needle: 'in scope / out of scope', scene: 'concession', weight: 4},
  {needle: 'explicit scope cut', scene: 'concession', weight: 4},
  {needle: 'scope cuts', scene: 'concession', weight: 3},
  {needle: 'set aside explicitly', scene: 'concession', weight: 3},
  {needle: 'content boundary', scene: 'concession', weight: 2},

  // ===== objection =====
  {needle: 'anticipated counter-argument', scene: 'objection', weight: 4},
  {needle: 'counter-argument', scene: 'objection', weight: 3},
  {needle: 'steelman', scene: 'objection', weight: 4},
  {needle: 'critics argue', scene: 'objection', weight: 3},
  {needle: 'objection from', scene: 'objection', weight: 3},
  {needle: 'has been challenged', scene: 'objection', weight: 3},
  {needle: 'refutation', scene: 'objection', weight: 3},
  {needle: 'rebuttal', scene: 'objection', weight: 3},
  {needle: 'contested topic', scene: 'objection', weight: 3},

  // ===== provocation =====
  {needle: 'open question', scene: 'provocation', weight: 4},
  {needle: 'leave unresolved', scene: 'provocation', weight: 4},
  {needle: 'unresolved question', scene: 'provocation', weight: 4},
  {needle: "we don't know yet", scene: 'provocation', weight: 4},
  {needle: 'we do not know yet', scene: 'provocation', weight: 4},
  {needle: 'hand off to the viewer', scene: 'provocation', weight: 3},
  {needle: 'frontier question', scene: 'provocation', weight: 3},
  {needle: 'unsettled', scene: 'provocation', weight: 2},

  // ===== diff =====
  {needle: 'before / after', scene: 'diff', weight: 4},
  {needle: 'before/after', scene: 'diff', weight: 3},
  {needle: 'before and after', scene: 'diff', weight: 3},
  {needle: 'pull request', scene: 'diff', weight: 2},
  {needle: 'the diff', scene: 'diff', weight: 2},

  // ===== closeup =====
  {needle: 'load-bearing line', scene: 'closeup', weight: 3},
  {needle: 'load-bearing function', scene: 'closeup', weight: 3},
  {needle: 'load-bearing change', scene: 'closeup', weight: 3},
  {needle: 'at the line level', scene: 'closeup', weight: 4},
  {needle: 'function-level', scene: 'closeup', weight: 2},
  {needle: 'comparator', scene: 'closeup', weight: 1},
  {needle: 'annotate the function', scene: 'closeup', weight: 4},

  // ===== big-idea =====
  {needle: 'the big idea', scene: 'big-idea', weight: 4},
  {needle: 'one held sentence', scene: 'big-idea', weight: 4},
  {needle: 'the takeaway', scene: 'big-idea', weight: 3},
  {needle: 'the central claim', scene: 'big-idea', weight: 2},

  // ===== progression =====
  {needle: 'ordinal stages', scene: 'progression', weight: 4},
  {needle: 'staged process', scene: 'progression', weight: 3},
  {needle: 'stages of the', scene: 'progression', weight: 2},
  {needle: 'pipeline stages', scene: 'progression', weight: 3},
  {needle: 'phases of', scene: 'progression', weight: 2},
];

// ----- the mapper ------------------------------------------------------------

export type SceneRecommendation = {
  scene: SceneType;
  cluster: Cluster;
  score: number;
  matched: string[];
  rationale: string;
};

export type RecommendResult = {
  id: string;
  recommendations: SceneRecommendation[];
  warningOnDefault: boolean;
  notes: string[];
};

/**
 * Build the effective SIGNALS table at runtime from the registered scene
 * plugins UNIONED with the internal fallback table. Per-scene policy:
 *
 *   - If a plugin advertises `signals: [...]`, those are the SOLE source
 *     of signal-driven votes for that scene type. Plugins that opt into
 *     advertising fully own their scene-fit shape.
 *   - If a plugin does not advertise, the internal SIGNALS table
 *     contributes (back-compat for the 29 core scenes until they migrate
 *     to advertising at the plugin level).
 *
 * This means a third-party plugin like `@example/docent-finance/ohlc` can
 * declare its own needles ("ohlc bars", "candlestick pattern") and the
 * recommender will surface it without any change to scene-fit.ts.
 */
const buildEffectiveSignals = (engine: Engine): Signal[] => {
  const out: Signal[] = [];
  const advertised = new Set<string>();
  for (const p of engine.scenes.all() as ReadonlyArray<ScenePlugin>) {
    if (p.signals && p.signals.length > 0) {
      advertised.add(p.sceneType);
      for (const s of p.signals) {
        out.push({
          needle: s.needle.toLowerCase(),
          scene: p.sceneType as SceneType,
          weight: s.weight,
        });
      }
    }
  }
  // Fallback: include internal SIGNALS entries for scenes that haven't
  // migrated to plugin-level signal advertisement. This keeps the v2
  // cues working during migration.
  for (const s of SIGNALS) {
    if (!advertised.has(s.scene)) out.push(s);
  }
  return out;
};

const scoreSurvey = (
  body: string,
  signalsTable: ReadonlyArray<Signal>,
  knownTypes: ReadonlySet<string>,
): {scores: Record<string, number>; matches: Record<string, string[]>} => {
  const scores: Record<string, number> = {};
  const matches: Record<string, string[]> = {};
  for (const t of knownTypes) {
    scores[t] = 0;
    matches[t] = [];
  }
  const haystack = body.toLowerCase();
  for (const s of signalsTable) {
    if (haystack.includes(s.needle)) {
      if (scores[s.scene] === undefined) {
        scores[s.scene] = 0;
        matches[s.scene] = [];
      }
      scores[s.scene]! += s.weight;
      matches[s.scene]!.push(s.needle);
    }
  }
  return {scores, matches};
};

const detectMode = (source: string): 'pr' | 'ar' | 'ex' | undefined => {
  const head = source.split('\n').slice(0, 80).join('\n');
  const m = head.match(/(?:^|\n)\s*(?:#+\s*)?[Mm]ode\s*[:=]\s*(pr|ar|ex)\b/);
  return m ? (m[1] as 'pr' | 'ar' | 'ex') : undefined;
};

/**
 * Resolve a scene type's cluster + cue with this precedence:
 *
 *   1. Plugin-advertised `plugin.cluster` (v3 closed taxonomy) + `plugin.cue`
 *      — the canonical source for v3-aware plugins, including third-party packs.
 *   2. Internal `SCENE_META[sceneType]` — back-compat for v2 cues still
 *      anchored to the internal table.
 *   3. Fallback labels for unknown scene types.
 */
const resolveSceneMeta = (
  plugin: ScenePlugin | undefined,
  sceneType: string,
): {cluster: string; cue: string} => {
  const fromMeta = (SCENE_META as Record<string, SceneMeta | undefined>)[sceneType];
  const cluster =
    plugin?.cluster === null
      ? 'chrome'
      : (plugin?.cluster ?? fromMeta?.cluster ?? 'unclassified');
  const cue = plugin?.cue ?? fromMeta?.cue ?? '(no cue advertised by this plugin)';
  return {cluster, cue};
};

export const recommendScenes = (
  engine: Engine,
  id: string,
  source: string,
  top: number = 8,
): RecommendResult => {
  if (top < 1) top = 1;

  const plugins = engine.scenes.all() as ReadonlyArray<ScenePlugin>;
  const sceneTypes = new Set<string>(plugins.map((p) => p.sceneType));
  // Also union internal SCENE_TYPES so back-compat cues still vote — they're
  // skipped by the loop below if no plugin is registered for that type.
  for (const t of SCENE_TYPES) sceneTypes.add(t);

  const signalsTable = buildEffectiveSignals(engine);
  const {scores, matches} = scoreSurvey(source, signalsTable, sceneTypes);
  const mode = detectMode(source);

  // Build a stable type-ordering for tie-breaks: registered plugins (in
  // engine registration order) come first, then any back-compat-only
  // sceneTypes from SCENE_META.
  const orderIndex = new Map<string, number>();
  let i = 0;
  for (const p of plugins) {
    if (!orderIndex.has(p.sceneType)) orderIndex.set(p.sceneType, i++);
  }
  for (const t of SCENE_TYPES) {
    if (!orderIndex.has(t)) orderIndex.set(t, i++);
  }

  const ranked = [...sceneTypes]
    .filter((t) => t !== 'frame' && t !== 'recap')
    .map((scene) => {
      const plugin = plugins.find((p) => p.sceneType === scene);
      const meta = resolveSceneMeta(plugin, scene);
      return {
        scene,
        cluster: meta.cluster,
        score: scores[scene] ?? 0,
        matched: matches[scene] ?? [],
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (orderIndex.get(a.scene) ?? 1e9) - (orderIndex.get(b.scene) ?? 1e9);
    });

  const bodySlots = Math.max(1, top - 2);
  const bodyPicks = ranked.filter((r) => r.score > 0).slice(0, bodySlots);

  const modeAdds: string[] = [];
  if (mode === 'pr' && !bodyPicks.find((r) => r.scene === 'diff')) modeAdds.push('diff');
  if (mode === 'ex' && !bodyPicks.find((r) => r.scene === 'big-idea')) modeAdds.push('big-idea');

  const seen = new Set<string>();
  const out: SceneRecommendation[] = [];

  const push = (scene: string, score: number, matched: string[]): void => {
    if (seen.has(scene)) return;
    seen.add(scene);
    const plugin = plugins.find((p) => p.sceneType === scene);
    const meta = resolveSceneMeta(plugin, scene);
    out.push({
      scene: scene as SceneType,
      cluster: meta.cluster as Cluster,
      score,
      matched,
      rationale: buildRationale(scene, meta.cue, score, matched, mode),
    });
  };

  push('frame', 0, []);
  for (const r of bodyPicks) push(r.scene, r.score, r.matched);
  for (const s of modeAdds) push(s, 0, []);
  push('recap', 0, []);

  const trimmed = out.slice(0, top);

  const bodyOnly = trimmed
    .map((r) => r.scene)
    .filter((s) => s !== 'frame' && s !== 'recap');
  const allRut =
    bodyOnly.length > 0 && bodyOnly.every((s) => (DEFAULT_RUT as ReadonlySet<string>).has(s));
  const hasOnlyDefaults = bodyOnly.length === 0 || allRut;

  const notes: string[] = [];
  if (hasOnlyDefaults) {
    notes.push(
      `recommendation collapsed to the default rut (frame/structure/compare/tension/recap). ` +
        `Re-read the survey — does the subject ACTUALLY demand only these primitives, ` +
        `or does it want one of: causal-loop / landscape / timeline / tree / map / ` +
        `journey-map / venn / mechanism / passage / figure / probe / epigraph / ` +
        `concession / objection / provocation?`,
    );
  }
  if (mode) notes.push(`mode detected: ${mode}`);

  return {id, recommendations: trimmed, warningOnDefault: hasOnlyDefaults, notes};
};

const buildRationale = (
  scene: string,
  cue: string,
  score: number,
  matched: string[],
  mode?: 'pr' | 'ar' | 'ex',
): string => {
  if (scene === 'frame') return 'every film opens with a frame (the opening commitment).';
  if (scene === 'recap') return 'every film closes with a recap (the ruling).';
  if (scene === 'diff' && score === 0 && mode === 'pr') {
    return 'PR films show what changed — diff is structurally required.';
  }
  if (scene === 'big-idea' && score === 0 && mode === 'ex') {
    return 'every explainer carries one held sentence before the recap.';
  }
  if (matched.length === 0) {
    return `${cue} (no specific signal — included by mode default)`;
  }
  const hits = matched.slice(0, 3).join(', ');
  return `survey contains [${hits}] (score ${score}) → ${cue}`;
};

// ----- the CLI surface ------------------------------------------------------

const log = (s: string): void => {
  process.stdout.write(`${s}\n`);
};
const err = (s: string): void => {
  process.stderr.write(`${s}\n`);
};

export interface SceneFitArgs {
  /** Override the analysis/ directory. Default: <projectRoot>/analysis. */
  readonly analysisDir?: string;
  /** Override the project root. */
  readonly projectRoot?: string;
}

interface ListArgs extends SceneFitArgs {
  readonly json?: boolean;
}

interface RecommendArgs extends SceneFitArgs {
  readonly subjectId: string;
  readonly top?: number;
  readonly json?: boolean;
}

/**
 * `docent scene-fit list` — enumerate registered scene plugins by cluster.
 *
 * Reads from the engine registry so third-party plugins surface alongside
 * core. For each registered scene, look up its SCENE_META cue; if the
 * plugin's `cluster` field disagrees with SCENE_META, surface a warning
 * on stderr (the contract is the plugin's declared cluster — SCENE_META
 * is informational).
 */
export const runSceneFitList = async (args: ListArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const {engine} = await createEngine(projectRoot);
  const plugins = engine.scenes.all();

  // Group registered plugins by their declared cluster (the v3 closed
  // taxonomy). Cue precedence: plugin.cue (advertised at the plugin shape)
  // > internal SCENE_META (v2 back-compat) > fallback label.
  const grouped = new Map<string, Array<{scene: string; cue: string; rutTag: boolean}>>();
  for (const p of plugins) {
    const cluster = p.cluster === null ? 'chrome' : (p.cluster ?? 'unclassified');
    const meta = (SCENE_META as Record<string, SceneMeta | undefined>)[p.sceneType];
    const cue = p.cue ?? meta?.cue ?? '(no cue advertised by this plugin)';
    const rutTag = (DEFAULT_RUT as ReadonlySet<string>).has(p.sceneType);
    const bucket = grouped.get(cluster) ?? [];
    bucket.push({scene: p.sceneType, cue, rutTag});
    grouped.set(cluster, bucket);
  }

  if (args.json) {
    const out: Record<string, Array<{scene: string; cue: string; rut: boolean}>> = {};
    for (const [cluster, scenes] of grouped) {
      out[cluster] = scenes.map((s) => ({scene: s.scene, cue: s.cue, rut: s.rutTag}));
    }
    log(
      JSON.stringify(
        {clusters: out, defaultRut: [...DEFAULT_RUT]},
        null,
        2,
      ),
    );
    return 0;
  }

  log('\x1b[1mdocent scene-fit\x1b[0m — registered scene plugins by cognitive cluster\n');
  const clusterOrder = [
    'connection',
    'time',
    'flow',
    'comparison',
    'categorization',
    'experience',
    'narrative',
    'chrome',
    'unclassified',
  ];
  for (const cluster of clusterOrder) {
    const scenes = grouped.get(cluster);
    if (!scenes || scenes.length === 0) continue;
    log(`\x1b[1m${cluster}\x1b[0m`);
    for (const s of scenes) {
      const rutTag = s.rutTag ? ' \x1b[90m[default-rut]\x1b[0m' : '';
      log(`  \x1b[36m${s.scene.padEnd(14)}\x1b[0m ${s.cue}${rutTag}`);
    }
    log('');
  }
  log(
    'recommend scenes for a survey:\n  docent scene-fit recommend <subject-id> [--top N] [--json]',
  );
  return 0;
};

/**
 * `docent scene-fit recommend <subject-id>` — run the rule-based mapper
 * against `<projectRoot>/analysis/<subject-id>.md`.
 */
export const runSceneFitRecommend = async (
  args: RecommendArgs,
): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const analysisDir = args.analysisDir ?? join(projectRoot, 'analysis');
  const path = join(analysisDir, `${args.subjectId}.md`);

  if (!existsSync(path)) {
    err(`scene-fit error: analysis/${args.subjectId}.md: file not found at ${path}`);
    return 1;
  }
  let source: string;
  try {
    source = readFileSync(path, 'utf-8');
  } catch (e) {
    err(`scene-fit error: ${path}: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const {engine} = await createEngine(projectRoot);
  const top = args.top ?? 8;
  const result = recommendScenes(engine, args.subjectId, source, top);

  if (args.json) {
    log(JSON.stringify(result, null, 2));
    return 0;
  }

  log(`\x1b[1mdocent scene-fit recommend\x1b[0m — ${args.subjectId} (top ${top})\n`);
  for (const r of result.recommendations) {
    const tag = DEFAULT_RUT.has(r.scene) ? ' \x1b[90m[default-rut]\x1b[0m' : '';
    log(
      `  \x1b[36m${r.scene.padEnd(14)}\x1b[0m \x1b[90m${r.cluster.padEnd(18)}\x1b[0m ` +
        `score ${r.score.toString().padStart(2)}${tag}`,
    );
    log(`    \x1b[90m${r.rationale}\x1b[0m`);
  }
  if (result.warningOnDefault) {
    log(`\n  \x1b[33m⚠ warningOnDefault\x1b[0m — recommendation is the suspected default rut.`);
    if (result.notes[0]) log(`    ${result.notes[0]}`);
  } else if (result.notes.length > 0) {
    log(`\n  notes:`);
    for (const n of result.notes) log(`    - ${n}`);
  }
  return 0;
};
