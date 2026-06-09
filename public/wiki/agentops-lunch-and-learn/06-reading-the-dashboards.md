# 06 — Reading the dashboards

Four dashboards, provisioned automatically by Grafana from `grafana/provisioning/dashboards/`. Each answers one question. The on-call lands on `agent-overview` and pivots from there.

| Dashboard | UID | Answers | When to open |
|---|---|---|---|
| `agent-overview` | `agentops-overview` | Is the fleet healthy *as a whole*? | First. Always. |
| `llm-cost-budget` | `agentops-cost` | Are we within budget? Is any model burning hot? | When the cost panel on overview is amber. |
| `tool-call-success` | `agentops-tools` | Are tools succeeding? Which one is broken? | When the tool-error panel on overview is amber. |
| `flow-discovery` | `agentops-flow` | Is the agent doing the *right shape of work*? | When `AgentFlowDivergenceHigh` pages. |

All four filter by `deployment.environment` ∈ {prod, eval, demo}. Default is `prod`. Toggle to `eval` for release-candidate review (§04).

## Dashboard 1 — `agent-overview`

The lobby. Six panels, two rows.

**Row 1: traffic & health**

- **Plan throughput** (stat) — `rate(agentops_plan_step_total[5m])`. The pulse. A sudden drop is the first thing an outage looks like.
- **Plan p95 latency** (stat) — `histogram_quantile(0.95, sum by (le) (rate(agentops_plan_step_duration_seconds_bucket[5m])))`. Red flag: > 30s sustained.
- **Plan depth distribution** (histogram) — the planning perspective from §04. Red flag: bimodal — half the plans flat at depth 1 (agent giving up) while the other half balloon to depth 20+ (looping).

**Row 2: signal panels**

- **Tool-call error rate** (timeseries) — `sum(rate(agentops_tool_call_total{success="false"}[5m])) / sum(rate(agentops_tool_call_total[5m]))`. Red flag: > 5% for 10 minutes.
- **LLM cost burn (last hour)** (stat with sparkline) — `sum(increase(agentops_llm_call_cost_usd_total[1h]))`. Amber at 80% of hourly budget, red at 100%. Clicking through goes to dashboard 2.
- **Task coverage by type** (bar) — success rate per task tag. Red flag: any tag below 60%.

## Dashboard 2 — `llm-cost-budget`

You opened this because the overview cost panel was amber, or because a finance-led conversation got loud. Five panels.

- **Tokens per task (p50/p95)** — separates volume from spike. p95 climbing while p50 is flat means a few runaway plans, not a systemic prompt bloat.
- **Cost per model** — stacked area. Catches "we switched a workload to the bigger model and forgot."
- **Budget burn-down (24h)** — a line that starts at the daily budget and decreases as cost accrues; the slope is the burn rate. If it crosses zero before 24:00 ends, you are over.
- **Top 10 plan goals by cost** — table sorted by `sum(cost_usd)` grouped by `plan.goal`. The single most common cost-spike cause is a new feature that ships a verbose system prompt.
- **Cost-per-plan trend (7 days)** — the regression detector. The eval harness gates on this; if a release ships and this trends up, something escaped the gate.

Red flag walk-through: `Top 10 plan goals by cost` shows `goal=summarize_long_doc` doubling its share week-over-week → `Cost per model` shows the bigger model — yes, you are paying for the long-doc model upgrade. Decision: kill switch in §07 incident #3.

## Dashboard 3 — `tool-call-success`

You opened this because the overview tool-error panel was amber. Four panels.

- **Success rate by tool** (timeseries, one line per `tool.name`) — the diagnostic. One tool drops, others flat: the tool's upstream is broken. All tools drop simultaneously: network or auth issue at the agent level.
- **Error-kind breakdown** (pie) — proportion of errors by `tool.error.kind`. `timeout` dominant → upstream slowdown. `bad_args` dominant → the agent learned a bad schema (prompt regression). `rate_limit` dominant → traffic spike or quota cut. `upstream_5xx` → the tool's owner has a problem, not us.
- **Latency p95 by tool** — paired with success rate. Latency creep often precedes the success-rate cliff.
- **Recent tool errors** (Loki logs panel) — last 50 log lines with `tool.success=false`, click-through to Jaeger via the `trace_id` derived field.

Red flag: `bad_args` rising for one tool only is the highest-signal failure mode. The agent's prompt has drifted and you have minutes before users notice. The bisection procedure is in §07 incident #2.

## Dashboard 4 — `flow-discovery`

This is the page the §03 alert links to. Four panels.

- **Stability gauge** (gauge, 0–1) — `agentops:flow_stability_ratio`. Green > 0.92, amber 0.85–0.92, red < 0.85.
- **Stability trend (24h)** (timeseries) — the same metric over time. The shape matters: a step drop is a release; a slow drift is data drift; a sawtooth is intermittent load.
- **Top-5 happy paths** (table) — the current top-k sequences with counts. After a deploy, expect one path to drop and a new one to rise; that is the new normal.
- **Divergent traces (last 1h)** (table → Jaeger link) — every trace flagged not-in-top-k, click-through. This is the surface the responder works through.

## Action

Bookmark `agent-overview` as the home dashboard. Train yourself to glance at three numbers on it during morning standby: plan throughput, plan p95, cost burn (1h). Three numbers, two seconds. If any of the three is anomalous, drill. If none is, you are done.
