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
 * The 7 closed cognitive clusters. Every {@link ScenePlugin} declares
 * which one it belongs to (or `null` for chrome-only scenes like `frame`
 * and `recap` that bracket the film but perform no cognitive move).
 *
 * The taxonomy is CLOSED — adding a cluster is a major release of
 * `@docent/kit` and a new mental model for every existing plugin.
 *
 * Cluster semantics, one example each:
 * - **connection** — relationships, dependencies, links between entities.
 *   The "structure" cluster: how the parts relate (graph, tree,
 *   dependency). *Example: a `structure` scene of a microservice mesh.*
 * - **time** — temporal sequencing, before/after, progressions,
 *   timelines, epochs, phases. *Example: a `progression` scene tracing
 *   adoption stages.*
 * - **flow** — control flow, data flow, state transitions, pipelines,
 *   cycles, feedback loops, processes. *Example: a `walkthrough` of a
 *   request lifecycle.*
 * - **comparison** — side-by-side options, trade-offs, scoring, ranking,
 *   measurements, quantified claims, charts on real axes. *Example: a
 *   `compare` of three database engines on latency.*
 * - **categorization** — taxonomies, set membership, boundaries between
 *   kinds, matrices, classification grids. *Example: a `structure` scene
 *   of a 2×2 risk matrix.*
 * - **experience** — the human angle: a journey, a perception, an
 *   experiential walk through what it feels like to encounter something.
 *   *Example: a `passage` reading of a primary source.*
 * - **narrative** — story, argument, commitment, the rhetorical "we
 *   chose X because of Y". Where the film makes a stand. *Example: a
 *   `tension` scene framing the irreversible trade-off.*
 *
 * @see docs/design/plugin-architecture-strategy.md §8
 * @see docs/design/plugin-architecture-strategy.md §11.5
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
