// Cognitive clusters — the CLOSED taxonomy every ScenePlugin declares against.
//
// Per the strategy doc §11.5 + §8: "the cognitive-cluster taxonomy" is closed.
// Plugins declare their cluster from this list; the recommender
// (`docent scene-fit`) navigates by these clusters; the agent layer's
// prompts reason in these terms.
//
// The taxonomy never grows in lockstep with the scene library. A new
// cluster is a major release of `@docent/kit` (and a new mental model for
// every existing plugin). The 7 below are the docent-method canon.
//
// Chrome-only scenes (`frame`, `recap`) declare `cluster: null` because
// they don't perform a cognitive move — they bracket the film.

/**
 * The 7 closed cognitive clusters. Every `ScenePlugin` declares which one
 * it belongs to (or `null` for chrome-only scenes).
 *
 * - **connection** — relationships, dependencies, links between entities.
 *   The "structure" cluster: how the parts relate (graph, tree, dependency).
 * - **time** — temporal sequencing, before/after, progressions, timelines,
 *   epochs, phases.
 * - **flow** — control flow, data flow, state transitions, pipelines,
 *   cycles, feedback loops, processes.
 * - **comparison** — side-by-side options, trade-offs, scoring, ranking,
 *   measurements, quantified claims, charts on real axes.
 * - **categorization** — taxonomies, set membership, boundaries between
 *   kinds, matrices, classification grids.
 * - **experience** — the human angle: a journey, a perception, an
 *   experiential walk through what it feels like to encounter something.
 * - **narrative** — story, argument, commitment, the rhetorical "we
 *   chose X because of Y". Where the film makes a stand.
 */
export type CognitiveCluster =
  | 'connection'
  | 'time'
  | 'flow'
  | 'comparison'
  | 'categorization'
  | 'experience'
  | 'narrative';

/**
 * Closed list as a `readonly` tuple for runtime iteration (recommender,
 * doctor surface) and for `const` validation.
 */
export const COGNITIVE_CLUSTERS = [
  'connection',
  'time',
  'flow',
  'comparison',
  'categorization',
  'experience',
  'narrative',
] as const satisfies readonly CognitiveCluster[];

/**
 * Human-readable labels — surfaced by `docent scene-fit` and the agent layer
 * prompts. Editing these is a copywriting decision, not a protocol change.
 */
export const COGNITIVE_CLUSTER_LABELS: Readonly<
  Record<CognitiveCluster, string>
> = {
  connection: 'Connection',
  time: 'Time',
  flow: 'Flow & Process',
  comparison: 'Comparison & Measurement',
  categorization: 'Categorization & Boundaries',
  experience: 'Human Experience',
  narrative: 'Narrative & Commitment',
} as const;

/**
 * Type guard — checks whether an unknown value is a valid cluster id.
 * Used by the scene registry's runtime validator to enforce the closed
 * taxonomy on plugin registration.
 */
export function isCognitiveCluster(
  value: unknown,
): value is CognitiveCluster {
  return (
    typeof value === 'string' &&
    (COGNITIVE_CLUSTERS as readonly string[]).includes(value)
  );
}
