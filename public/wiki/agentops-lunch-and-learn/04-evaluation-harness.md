# 04 — Evaluation harness

Observability is what the system tells you about itself in production. Evaluation is what you ask it deliberately. Both feed the same dashboards, but eval is the deliberate side: a corpus of representative tasks run on every release candidate, with the resulting telemetry summarized against fixed thresholds before the candidate is promoted.

The five axes we score on come from arXiv 2503.16416 (*Survey on Evaluation of LLM-based Agents*). The survey organizes the field around core LLM capabilities (planning, tool use), broader generalist capability, application-specific dimensions, and the gaps it calls out by name as under-served — "cost-efficiency, safety, and robustness." We collapse the survey's organization into five operational perspectives, each of which maps to a Grafana panel that updates live as the eval corpus runs.

![Five evaluation perspectives](../diagrams/04-evaluation-pentagon.png)

## The five perspectives, each as a dashboard panel

### 1. Planning — *does it think in the right shape?*

Metric: `plan_step` depth distribution (p50, p90) and `replan_rate` (plans where `plan.step_index` was reset mid-trace). A working agent has a stable plan-depth distribution across the corpus; a broken one either flattens (giving up on planning) or balloons (looping).

Panel: `agent-overview` → "Plan depth distribution" histogram.

### 2. Tool use — *does it call the right things, the right way?*

Metric: `tool_call.success` rate by `tool.name`, and an arg-validity check that catches malformed JSON arguments before they hit the tool. A broken agent shows a steep success-rate cliff on one specific tool (it learned a slightly wrong schema).

Panel: `tool-call-success` → success rate by tool, error-kind breakdown.

### 3. Generalist capability — *does it handle the long tail?*

Metric: task-type coverage. Eval tasks are tagged (`summarize`, `extract`, `compare`, `multi_hop`, `oddball`); we report success rate per tag. The "oddball" bucket is the survey's "out-of-distribution" check — tasks deliberately unlike training data.

Panel: `agent-overview` → "Task coverage by type" bar chart.

### 4. Robustness — *does it stay on the rails under load and adversarial inputs?*

Metric: `agentops:flow_stability_ratio` (from §03) measured *during the eval corpus run*, plus the `hallucination_flag` event rate per 1000 spans. Robustness is the perspective the survey calls out as systematically under-measured; our take is that flow stability is the cheapest robustness proxy that survives real workloads.

Panel: `flow-discovery` → stability gauge + hallucination event timeline.

### 5. Cost-efficiency — *what did the answer cost?*

Metric: `sum(llm_call.cost_usd)` per completed plan, and tokens-per-task. The eval harness rejects a release candidate that increases mean cost-per-task by more than 15% versus the incumbent, regardless of quality gains. The survey is explicit that cost-efficiency is one of the "critical gaps that future research must address" — the harness treats it as a first-class regression target, not a nice-to-have.

Panel: `llm-cost-budget` → "Cost per completed plan" trend + budget burn-down.

## How the corpus runs

```bash
agentops eval run \
  --candidate "agent-fleet:rc-2026.06.07" \
  --corpus eval/corpus.v3.jsonl \
  --tags planning,tool_use,generalist,robustness,cost \
  --emit-to otel-collector:4318
```

The harness drives the candidate fleet against the corpus, emitting the same OTLP signals the production fleet emits, tagged `deployment.environment=eval`. Every dashboard already filters by environment, so `eval` runs show up in a parallel pane next to `prod` and never pollute the production SLOs.

A run takes about 18 minutes for the 240-task corpus and produces a single artifact: `eval/runs/<rc-tag>/report.json`, with one row per perspective and a verdict.

## What the harness does not check

Safety. The survey lists safety alongside cost and robustness as under-measured; we have a parallel safety eval pipeline (red-team prompts + jailbreak corpus) that runs out-of-band and is the subject of its own runbook. Treat the five perspectives here as *operational* eval — does the agent work — separate from safety eval — can the agent be made to misbehave.

## Action

Before promoting a release candidate, open the `agent-overview` dashboard with the time range set to the eval run window and the environment filter set to `eval`. If any of the five perspectives shows a red threshold, the candidate does not ship. Document the failing perspective in the release ticket; do not ship "we will fix it in the next patch."
