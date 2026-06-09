# 03 — Flow discovery analytics

A classical SLO dashboard answers "are individual operations healthy?" An agent dashboard has to answer a harder question: "is the agent doing the *right shape* of work?" An LLM-powered orchestrator can have every `llm_call` return 200 in 800 ms, every `tool_call` succeed, and still be silently looping through an irrelevant subplan because the prompt regression two days ago shifted its planning bias. Every span is green and the customer is getting wrong answers.

This is the failure mode arXiv 2503.06745 (*Beyond Black-Box Benchmarking for Agentic Systems*) names directly. Their user study found **79% agreement that the non-deterministic flow of agentic systems acts as a major challenge**. Classical benchmarks — fixed inputs, fixed expected outputs — break in two ways under non-determinism: the expected output set is too large to enumerate, and the *path* through the agent matters as much as the final answer. The paper's response: derive expected flows from production traces themselves, then alert when divergence rises.

We operationalize that as a four-stage pipeline on top of the `flow_checkpoint` spans defined in §02.

![Flow discovery pipeline](../diagrams/03-flow-discovery.png)

## Stage 1 — sequence extraction

For each trace, pull every `flow_checkpoint` span, order by start time, project to the `flow.checkpoint` attribute. The result is one ordered string-list per trace. A healthy "summarize a repo" trace might yield:

```
[request_received, plan_drafted, tool_invoked, tool_invoked, llm_call_made, response_sent]
```

A drifting one might yield 30 entries with `tool_invoked` repeated 22 times — the agent stuck in a retry loop.

We compute the sequence in a Loki LogQL recording rule because the checkpoint span is also logged to Loki with the trace ID; pulling from Loki is cheaper than from Jaeger at the cardinality we care about (~10k traces/hour).

## Stage 2 — sequence clustering

Hash each ordered sequence to a stable string key (`SHA-1` of the joined checkpoints). Count occurrences in a rolling 1-hour window. The top-k by frequency are the *empirical happy paths* — paper 2's central insight: in a working system, almost all traces fall into a small number of shapes, regardless of how many shapes are theoretically reachable.

We keep k = 5. Below that, we miss legitimate path variants; above that, rare-but-real paths get crowded out by noise.

## Stage 3 — stability score

A Prometheus recording rule emits `agentops_flow_stability_ratio`:

```yaml
- record: agentops:flow_stability_ratio
  expr: |
    sum(rate(agentops_trace_in_top_k_flow_total[5m]))
    /
    sum(rate(agentops_traces_total[5m]))
```

`agentops_trace_in_top_k_flow_total` is incremented by a sidecar that consumes the clustering output and tags each completed trace as "in top-k" or "divergent." In steady state, the ratio sits at 0.92–0.97 — five-ish percent of traces are legitimately weird (a user asked something genuinely unusual). When the ratio drops, *something has changed in the agent's behavior*.

## Stage 4 — divergence alert

The Grafana alert (see `flow-discovery` dashboard in §06):

```yaml
- alert: AgentFlowDivergenceHigh
  expr: agentops:flow_stability_ratio < 0.85
  for: 5m
  labels:
    severity: page
  annotations:
    summary: "Agent flow stability dropped to {{ $value | humanizePercentage }}"
    runbook: "runbook/07-incident-response.md#latency-spike"
```

Five minutes below 85% pages on-call. The link in the alert payload jumps to a Jaeger search pre-filtered to `traces NOT IN top_k`, so the responder is reading the *anomalous* traces within 30 seconds of the page.

## Why this matters more than per-span SLOs

A per-span SLO (`llm_call.error_rate < 1%`) tells you the model is up. Flow stability tells you the agent *behaves the way it did yesterday*. The two are independent — an upgraded model with a different planning bias will show 100% per-span health and a stability drop. The Q1 incident postmortem in our wiki traced a 6-hour silent regression to a stability drift from 0.94 to 0.78 that no other monitor caught.

## What we did not build

Paper 2 also describes deriving an *expected DAG* of checkpoint transitions (not just sequences) and detecting unexpected edges. We did not build that — the sequence approach is cheaper and catches the failures we have actually seen. Reach for the DAG view when the sequence view starts hiding sub-sequence drift inside otherwise-known shapes; we have not hit that yet.

## Action

When you add a new checkpoint to an agent (you should, every named loop boundary deserves one), the new sequence shape will look *divergent* for ~1 hour until the rolling window catches up. Mute the `AgentFlowDivergenceHigh` alert for the deploy window. The mute is logged in Slack; do not forget to unmute.
