// docent scene-fit — the agent-facing introspection surface over the scene
// grammar.
//
// v2.4.0 grew the grammar to 29 primitives organized by cognitive cluster
// (see docs/grammar.md), but the agent had no CLI handle to ask "given this
// subject's survey, which scene types fit?". Without it, the agent
// reflex-defaults to frame/structure/compare/tension/recap on every film —
// the suspected "default rut" that produces tour-shaped specs instead of
// reviews. This subcommand mirrors `docent style recommend` to close the
// same loop one layer down.
//
//   docent scene-fit list [--json]
//     enumerates the 29 scene types grouped by cognitive cluster, with a
//     one-line "reach for it when" cue per type (the same cues the survey
//     templates carry).
//
//   docent scene-fit recommend <subject-id> [--json] [--top N]
//     reads analysis/<id>.md, runs a rule-based survey→scene-type mapper,
//     and prints the top N recommendations with rationales tying each to a
//     specific signal needle the survey contained. NOT an LLM call. The
//     default top=8 matches a typical 6-8 scene film.
//
// All output the agent layer or a downstream script needs to parse is JSON
// on stdout; chrome (the bulleted human report) goes to stdout in the
// non-JSON path and the exit code is the contract.

import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {paths} from './paths';

// ----- the grammar — 29 scene types -----------------------------------------

// The closed scene-type vocabulary, kept in sync with packages/engine/schema/
// film.schema.json. Adding a scene type means adding it here AND a rules entry
// below; the hermetic harness pins both sides.
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

// Cognitive clusters. The agent picks by *move*; the cluster is the gross
// taxonomy of moves. Two scenes can live in the same cluster — the choice
// between them is by sub-shape, not by category.
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

// One-line cues — the same "reach for it when" language docs/grammar.md and
// the survey templates carry. Kept here so the CLI is self-describing.
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
    cue: 'the order matters but the dates don\'t (ordinal stages along a track).',
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
    cue: 'the film\'s opening commitment — title, tagline, footnote. Every film opens with one.',
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

// The set the brief calls the "default rut" — the five scene types an
// undirected agent reflex-defaults to on every film, regardless of subject.
// If the recommender returns *only* members of this set in the top N, the
// caller should consider whether the subject actually demands one of the
// more specific primitives below.
export const DEFAULT_RUT: ReadonlySet<SceneType> = new Set<SceneType>([
  'frame',
  'structure',
  'compare',
  'tension',
  'recap',
]);

// ----- the rules — survey signals → scene types -----------------------------

type Signal = {
  // The substring (lowercased) we look for in the survey body.
  needle: string;
  // The scene type this evidence votes for.
  scene: SceneType;
  // How much weight to give the vote. Tuned so a clear single-cluster survey
  // outvotes a mixed one. Strong, specific phrases ("causal loop",
  // "trade-off plane") weigh 4; common words ("hierarchy", "components")
  // weigh 1-2.
  weight: number;
};

// The signal table. Each entry is one phrase → one vote.
//
// Tuning heuristic:
//   weight 4 — the phrase IS the scene's defining language ("causal loop",
//     "feedback loop", "trade-off plane", "quadrant").
//   weight 3 — strong domain hint ("two-dimensional", "intersection of",
//     "regional topology", "side by side").
//   weight 2 — clear but ambiguous between siblings ("timeline",
//     "hierarchy", "stages").
//   weight 1 — circumstantial; only contributes when present alongside
//     stronger evidence for the same scene.
//
// `frame` and `recap` are NOT in this table — every film has them by
// construction; recommending them adds no information.
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

  // ===== landscape (2-D trade-off plane) =====
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

  // ===== timeline (dated milestones) =====
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

  // ===== tree (parent-child hierarchy) =====
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

  // ===== map (geographic / topological) =====
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

  // ===== journey-map (a person's experience) =====
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

  // ===== venn (set intersection) =====
  {needle: 'set intersection', scene: 'venn', weight: 4},
  {needle: 'intersection of', scene: 'venn', weight: 3},
  {needle: 'overlap', scene: 'venn', weight: 2},
  {needle: 'overlap analysis', scene: 'venn', weight: 4},
  {needle: 'what\'s in both', scene: 'venn', weight: 4},
  {needle: 'in the intersection', scene: 'venn', weight: 4},
  {needle: 'three sets', scene: 'venn', weight: 3},
  {needle: 'two sets', scene: 'venn', weight: 2},
  {needle: 'trifecta', scene: 'venn', weight: 3},
  {needle: 'lives only in', scene: 'venn', weight: 4},
  {needle: 'lives in the intersection', scene: 'venn', weight: 4},

  // ===== mechanism (working motion / cycle through phases) =====
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

  // ===== structure (node-and-edge) =====
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

  // ===== walkthrough (actors over time / sequence) =====
  {needle: 'sequence diagram', scene: 'walkthrough', weight: 4},
  {needle: 'actors exchange', scene: 'walkthrough', weight: 4},
  {needle: 'protocol exchange', scene: 'walkthrough', weight: 3},
  {needle: 'handshake', scene: 'walkthrough', weight: 2},
  {needle: 'request/response', scene: 'walkthrough', weight: 2},
  {needle: 'step by step', scene: 'walkthrough', weight: 1},
  {needle: 'who passes what', scene: 'walkthrough', weight: 4},
  {needle: 'message exchange', scene: 'walkthrough', weight: 3},
  {needle: 'over a sequence', scene: 'walkthrough', weight: 2},

  // ===== compare (table — options × criteria) =====
  {needle: 'side-by-side options', scene: 'compare', weight: 4},
  {needle: 'side by side options', scene: 'compare', weight: 4},
  {needle: 'options × criteria', scene: 'compare', weight: 4},
  {needle: 'options x criteria', scene: 'compare', weight: 4},
  {needle: 'head-to-head', scene: 'compare', weight: 3},
  {needle: 'comparison table', scene: 'compare', weight: 3},
  {needle: 'feature matrix', scene: 'compare', weight: 3},
  {needle: 'side by side', scene: 'compare', weight: 2},
  {needle: 'side-by-side', scene: 'compare', weight: 2},

  // ===== quantities (numbers as the argument) =====
  {needle: 'numerical claims', scene: 'quantities', weight: 4},
  {needle: 'metrics', scene: 'quantities', weight: 2},
  {needle: 'what the numbers say', scene: 'quantities', weight: 4},
  {needle: 'key numbers', scene: 'quantities', weight: 3},
  {needle: 'benchmark numbers', scene: 'quantities', weight: 3},
  {needle: 'figures the argument', scene: 'quantities', weight: 3},

  // ===== chart (plotted continuous data) =====
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

  // ===== passage (prose / close reading) =====
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

  // ===== figure (annotated image) =====
  {needle: 'image with regions', scene: 'figure', weight: 4},
  {needle: 'diagram annotation', scene: 'figure', weight: 4},
  {needle: 'annotate the image', scene: 'figure', weight: 4},
  {needle: 'annotated regions', scene: 'figure', weight: 3},
  {needle: 'still image', scene: 'figure', weight: 3},
  {needle: 'photograph', scene: 'figure', weight: 2},
  {needle: 'painting', scene: 'figure', weight: 2},
  {needle: 'chart screenshot', scene: 'figure', weight: 3},

  // ===== demonstrate (moving image / video clip) =====
  {needle: 'video clip', scene: 'demonstrate', weight: 4},
  {needle: 'manim render', scene: 'demonstrate', weight: 4},
  {needle: 'ui demo', scene: 'demonstrate', weight: 4},
  {needle: 'screen capture', scene: 'demonstrate', weight: 3},
  {needle: 'demo recording', scene: 'demonstrate', weight: 3},
  {needle: 'play it back', scene: 'demonstrate', weight: 2},

  // ===== probe (sensitivity / perturbation) =====
  {needle: 'sensitivity analysis', scene: 'probe', weight: 4},
  {needle: 'what if', scene: 'probe', weight: 2},
  {needle: 'what-if', scene: 'probe', weight: 3},
  {needle: 'perturbation', scene: 'probe', weight: 4},
  {needle: 'vary one input', scene: 'probe', weight: 4},
  {needle: 'turn the knob', scene: 'probe', weight: 3},
  {needle: 'parameter sweep', scene: 'probe', weight: 4},
  {needle: 'dial up', scene: 'probe', weight: 1},

  // ===== tension (trade-off ledger) =====
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
  {needle: 'we don\'t know yet', scene: 'provocation', weight: 4},
  {needle: 'we do not know yet', scene: 'provocation', weight: 4},
  {needle: 'hand off to the viewer', scene: 'provocation', weight: 3},
  {needle: 'frontier question', scene: 'provocation', weight: 3},
  {needle: 'unsettled', scene: 'provocation', weight: 2},

  // ===== diff (before / after — PR films only) =====
  {needle: 'before / after', scene: 'diff', weight: 4},
  {needle: 'before/after', scene: 'diff', weight: 3},
  {needle: 'before and after', scene: 'diff', weight: 3},
  {needle: 'pull request', scene: 'diff', weight: 2},
  {needle: 'the diff', scene: 'diff', weight: 2},

  // ===== closeup (annotated code / text span) =====
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

  // ===== progression (ordinal stages) =====
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

// Score every scene type by walking the SIGNALS table once over the lowercased
// body. Returns the per-scene score and the list of needles that matched —
// both surface in the rationale.
const scoreSurvey = (
  body: string,
): {scores: Record<SceneType, number>; matches: Record<SceneType, string[]>} => {
  const scores: Record<string, number> = {};
  const matches: Record<string, string[]> = {};
  for (const t of SCENE_TYPES) {
    scores[t] = 0;
    matches[t] = [];
  }
  const haystack = body.toLowerCase();
  for (const s of SIGNALS) {
    if (haystack.includes(s.needle)) {
      scores[s.scene] += s.weight;
      matches[s.scene].push(s.needle);
    }
  }
  return {
    scores: scores as Record<SceneType, number>,
    matches: matches as Record<SceneType, string[]>,
  };
};

// Detect mode from a survey front-matter line — `Mode: pr` etc.
const detectMode = (source: string): 'pr' | 'ar' | 'ex' | undefined => {
  const head = source.split('\n').slice(0, 80).join('\n');
  const m = head.match(/(?:^|\n)\s*(?:#+\s*)?[Mm]ode\s*[:=]\s*(pr|ar|ex)\b/);
  return m ? (m[1] as 'pr' | 'ar' | 'ex') : undefined;
};

// The recommender. Inputs: the raw survey text and the id (used in the
// rationale + the result envelope). Output: a ranked list of recommendations.
//
// Algorithm:
//   1. Score every scene type by the SIGNALS table.
//   2. Always include `frame` (every film opens) and `recap` (every film
//      closes) in the recommended set, regardless of score — they are
//      structural, not subject-driven.
//   3. The top N by score are the body of the recommendation. Ties are
//      broken by SCENE_TYPES declaration order (which is cluster-ordered;
//      connection > time > flow > comparison ... > rhetorical).
//   4. If the resulting set is a *subset* of DEFAULT_RUT (no scene-specific
//      evidence drove anything beyond the default five), raise
//      warningOnDefault.
//   5. PR films get `diff` boosted into the set (it's how every PR film
//      shows what changed).
//   6. EX (explainer) films get `big-idea` boosted into the set — every
//      explainer carries one before the recap.
export const recommendScenes = (
  id: string,
  source: string,
  top: number = 8,
): RecommendResult => {
  if (top < 1) top = 1;
  const {scores, matches} = scoreSurvey(source);
  const mode = detectMode(source);

  // Rank all scoring scene types. We exclude frame and recap from the ranked
  // body because they are added unconditionally as openers/closers; ranking
  // them would crowd out subject-driven choices.
  const ranked = SCENE_TYPES.filter((t) => t !== 'frame' && t !== 'recap')
    .map((scene) => ({
      scene,
      cluster: SCENE_META[scene].cluster,
      score: scores[scene],
      matched: matches[scene],
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break: declaration order (cluster-ordered).
      return SCENE_TYPES.indexOf(a.scene) - SCENE_TYPES.indexOf(b.scene);
    });

  // The "body" picks — scenes with at least one hit, ranked. Capped at top-2
  // (we reserve two slots for frame + recap).
  const bodySlots = Math.max(1, top - 2);
  const bodyPicks = ranked.filter((r) => r.score > 0).slice(0, bodySlots);

  // Mode-driven structural inclusions: `diff` on PR films, `big-idea` on EX
  // films. We add them ONLY if they're not already in bodyPicks. If they
  // crowd out a lower-scored body pick, that pick stays at the bottom of
  // the list (the warning flag will not be raised because the structural
  // adds are scene-specific, not part of the rut).
  const modeAdds: SceneType[] = [];
  if (mode === 'pr' && !bodyPicks.find((r) => r.scene === 'diff')) modeAdds.push('diff');
  if (mode === 'ex' && !bodyPicks.find((r) => r.scene === 'big-idea')) modeAdds.push('big-idea');

  // Assemble the final list — frame first, body picks, mode adds, recap last.
  const seen = new Set<SceneType>();
  const out: SceneRecommendation[] = [];

  const push = (scene: SceneType, score: number, matched: string[]) => {
    if (seen.has(scene)) return;
    seen.add(scene);
    out.push({
      scene,
      cluster: SCENE_META[scene].cluster,
      score,
      matched,
      rationale: buildRationale(scene, score, matched, mode),
    });
  };

  push('frame', 0, []);
  for (const r of bodyPicks) push(r.scene, r.score, r.matched);
  for (const s of modeAdds) push(s, 0, []);
  push('recap', 0, []);

  // Trim to exactly `top` if we overshot from the structural adds.
  const trimmed = out.slice(0, top);

  // Anti-overfit: did the recommender end up with *only* default-rut scene
  // types in the body? If so, the survey lacked the specific signals that
  // pull other primitives in — the agent should review whether the subject
  // actually demands one of those.
  const bodyOnly = trimmed
    .map((r) => r.scene)
    .filter((s) => s !== 'frame' && s !== 'recap');
  const allRut = bodyOnly.length > 0 && bodyOnly.every((s) => DEFAULT_RUT.has(s));
  // Also raise when the body produced ZERO non-default picks (no signals
  // matched at all).
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
  scene: SceneType,
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
    return `${SCENE_META[scene].cue} (no specific signal — included by mode default)`;
  }
  const hits = matched.slice(0, 3).join(', ');
  return (
    `survey contains [${hits}] (score ${score}) → ${SCENE_META[scene].cue}`
  );
};

// ----- the CLI surface ------------------------------------------------------

const die = (msg: string): never => {
  process.stderr.write(`\x1b[31m✗\x1b[0m ${msg}\n`);
  process.exit(1);
};

// `docent scene-fit list` — enumerate the 29 scene types by cognitive cluster.
export const sceneFitList = (json: boolean): number => {
  if (json) {
    const byCluster: Record<string, {scene: SceneType; cue: string}[]> = {};
    for (const c of CLUSTERS) byCluster[c] = [];
    for (const s of SCENE_TYPES) {
      byCluster[SCENE_META[s].cluster].push({scene: s, cue: SCENE_META[s].cue});
    }
    process.stdout.write(
      JSON.stringify({clusters: byCluster, defaultRut: [...DEFAULT_RUT]}, null, 2) + '\n',
    );
    return 0;
  }
  process.stdout.write(
    '\x1b[1mdocent scene-fit\x1b[0m — the 29-scene grammar by cognitive cluster\n\n',
  );
  for (const c of CLUSTERS) {
    process.stdout.write(`\x1b[1m${c}\x1b[0m\n`);
    for (const s of SCENE_TYPES) {
      if (SCENE_META[s].cluster !== c) continue;
      const rutTag = DEFAULT_RUT.has(s) ? ' \x1b[90m[default-rut]\x1b[0m' : '';
      process.stdout.write(`  \x1b[36m${s.padEnd(14)}\x1b[0m ${SCENE_META[s].cue}${rutTag}\n`);
    }
    process.stdout.write('\n');
  }
  process.stdout.write(
    'recommend scenes for a survey:\n  docent scene-fit recommend <subject-id> [--top N] [--json]\n',
  );
  return 0;
};

// `docent scene-fit recommend <id>` — run the recommender against
// analysis/<id>.md.
export const sceneFitRecommend = (id: string, top: number, json: boolean): number => {
  const path = join(paths.analysis, `${id}.md`);
  if (!existsSync(path)) {
    process.stderr.write(`scene-fit error: analysis/${id}.md: file not found\n`);
    return 1;
  }
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch (e) {
    process.stderr.write(
      `scene-fit error: analysis/${id}.md: ${e instanceof Error ? e.message : String(e)}\n`,
    );
    return 1;
  }
  const result = recommendScenes(id, source, top);

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }
  process.stdout.write(`\x1b[1mdocent scene-fit recommend\x1b[0m — ${id} (top ${top})\n\n`);
  for (const r of result.recommendations) {
    const tag = DEFAULT_RUT.has(r.scene) ? ' \x1b[90m[default-rut]\x1b[0m' : '';
    process.stdout.write(
      `  \x1b[36m${r.scene.padEnd(14)}\x1b[0m \x1b[90m${r.cluster.padEnd(18)}\x1b[0m ` +
        `score ${r.score.toString().padStart(2)}${tag}\n`,
    );
    process.stdout.write(`    \x1b[90m${r.rationale}\x1b[0m\n`);
  }
  if (result.warningOnDefault) {
    process.stdout.write(
      `\n  \x1b[33m⚠ warningOnDefault\x1b[0m — recommendation is the suspected default rut.\n`,
    );
    process.stdout.write(`    ${result.notes[0]}\n`);
  } else if (result.notes.length > 0) {
    process.stdout.write(`\n  notes:\n`);
    for (const n of result.notes) process.stdout.write(`    - ${n}\n`);
  }
  return 0;
};

// ----- argv parsing ---------------------------------------------------------

export const runSceneFit = (argv: string[]): number => {
  const sub = argv[0];
  if (!sub || sub === '--help' || sub === '-h') {
    process.stdout.write('docent scene-fit — introspect the scene grammar\n\n');
    process.stdout.write('  docent scene-fit list [--json]\n');
    process.stdout.write(
      '    list every scene type grouped by cognitive cluster, with one-line cues\n\n',
    );
    process.stdout.write('  docent scene-fit recommend <subject-id> [--top N] [--json]\n');
    process.stdout.write(
      '    read analysis/<id>.md; print the recommended scene types with rationales\n',
    );
    return sub ? 0 : 1;
  }

  if (sub === 'list') {
    return sceneFitList(argv.includes('--json'));
  }

  if (sub === 'recommend') {
    const id = argv[1];
    if (!id || id.startsWith('--')) {
      die('usage: docent scene-fit recommend <subject-id> [--top N] [--json]');
    }
    const topIdx = argv.indexOf('--top');
    const top = topIdx >= 0 && argv[topIdx + 1] ? Number(argv[topIdx + 1]) : 8;
    if (!Number.isFinite(top) || top < 1) {
      process.stderr.write(`scene-fit error: --top must be a positive integer (got: ${argv[topIdx + 1]})\n`);
      return 1;
    }
    return sceneFitRecommend(id!, top, argv.includes('--json'));
  }

  process.stderr.write(
    `scene-fit error: subcommand: unknown "scene-fit ${sub}" — use list | recommend\n`,
  );
  return 1;
};
