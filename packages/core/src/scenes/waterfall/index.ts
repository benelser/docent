// @bjelser/core — `waterfall` scene plugin.
//
// The narrative move: render a distributed-trace waterfall — the Jaeger /
// Tempo / Zipkin / OpenTelemetry idiom. Each span is a row; child spans
// indent under their parent; bar widths are proportional to durationMs.
// Beats reveal spans by id and focus on one to surface its attributes.
//
// The cluster is `narrative` — the scene reveals an argument *over* a
// trace artifact, beat by beat, in the same family as `figure` (a
// still image with callouts), `passage` (annotated text), and
// `demonstrate` (annotated video). The artifact-as-evidence move.
//
// The killer case: LLM-agent trace taxonomies. Today every observability
// lunch-and-learn that wants to SHOW a trace has to fall back to a
// screenshot. `waterfall` renders the live thing, animated, with the
// AgentOps five-span-types palette built in (plus generic http/db for
// non-AI traces).

import type {ScenePlugin} from '@bjelser/kit';

import {WaterfallSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {WaterfallScene} from './validate';
import {validate} from './validate';

export const waterfallPlugin: ScenePlugin<WaterfallScene> = {
  kind: 'scene',
  name: 'waterfall',
  version: '1.0.0',
  sceneType: 'waterfall',
  cluster: 'narrative',
  schema,
  component: WaterfallSceneComponent,
  validate,
  depthRules,
  judgeDimensions,

  cue: 'the SPAN-TREE is the artifact — a distributed-trace waterfall (Jaeger / Tempo / OTel style) with the five AgentOps span kinds and the hallucination event.',
  signals: [
    {needle: 'trace waterfall', weight: 4},
    {needle: 'jaeger', weight: 4},
    {needle: 'tempo', weight: 3},
    {needle: 'zipkin', weight: 3},
    {needle: 'opentelemetry', weight: 3},
    {needle: 'otel', weight: 3},
    {needle: 'distributed trace', weight: 4},
    {needle: 'span tree', weight: 4},
    {needle: 'plan_step', weight: 4},
    {needle: 'llm_call', weight: 3},
    {needle: 'tool_call', weight: 3},
    {needle: 'agent decision', weight: 3},
    {needle: 'flow checkpoint', weight: 3},
    {needle: 'hallucination flag', weight: 3},
    {needle: 'parent span', weight: 2},
    {needle: 'root span', weight: 2},
    {needle: 'agentops', weight: 3},
  ],
};

export type {WaterfallScene, WaterfallSpan, WaterfallSpanKind} from './validate';
export default waterfallPlugin;
