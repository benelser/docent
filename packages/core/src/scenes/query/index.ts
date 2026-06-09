// @bjelser/core — `query` scene plugin.
//
// The observability-native primitive: a query (PromQL / LogQL / SQL /
// Jaeger / KQL) being progressively typed/built next to a live result
// that evolves with it. Every observability lunch-and-learn has this
// gap — closeup is for source listings, not query DSLs; passage is for
// prose; chart renders a curve but never the query behind it. This
// scene closes the gap with the killer case being PromQL recording rules
// (the AgentOps flow-stability ratio, the SLI-arithmetic walkthrough,
// the rate/sum-by/topk decomposition the analyst always wants to teach).
//
// Cognitive cluster: `narrative` — the scene reveals an argument *over*
// an artifact (the query), beat by beat, the same family as `figure`
// (annotated still), `passage` (annotated text), `waterfall` (annotated
// trace). The artifact-as-evidence move.

import type {ScenePlugin} from '@bjelser/kit';

import {QuerySceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {QueryScene} from './validate';
import {validate} from './validate';

export const queryPlugin: ScenePlugin<QueryScene> = {
  kind: 'scene',
  name: 'query',
  version: '1.0.0',
  sceneType: 'query',
  cluster: 'narrative',
  schema,
  component: QuerySceneComponent,
  validate,
  depthRules,
  judgeDimensions,

  cue: 'the QUERY itself is the artifact — a DSL (PromQL / LogQL / SQL / Jaeger / KQL) being progressively typed next to a live result panel (counter / gauge / table / sparkline) that ticks up as the query builds.',
  signals: [
    {needle: 'promql', weight: 4},
    {needle: 'logql', weight: 4},
    {needle: 'kql', weight: 4},
    {needle: 'kusto', weight: 4},
    {needle: 'jaeger query', weight: 4},
    {needle: 'recording rule', weight: 4},
    {needle: 'sli arithmetic', weight: 3},
    {needle: 'sum by', weight: 2},
    {needle: 'rate(', weight: 2},
    {needle: 'sparkline', weight: 2},
    {needle: 'flow stability', weight: 3},
    {needle: 'query the way', weight: 3},
    {needle: 'write the query', weight: 4},
    {needle: 'build the query', weight: 4},
    {needle: 'progressive query', weight: 4},
    {needle: 'observability dsl', weight: 4},
    {needle: 'lunch-and-learn on promql', weight: 4},
  ],
  // requiresTtsCapabilities: undefined — query needs no word-level alignment.
  // Its rendering is driven by per-beat reveal ids + set directives, just
  // like quantities / waterfall.
};

export type {QueryScene, QueryLine, QueryResult, QueryDataSource} from './validate';
export default queryPlugin;
