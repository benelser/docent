# AgentOps runbook

AgentOps is the observability stack our LLM-agent fleet runs against in production. It is a docker-composed pipeline — agent fleet → OpenTelemetry collector → Jaeger / Prometheus / Loki → Grafana — instrumented with five span types specific to agent workloads, plus a flow-discovery analytics layer that catches the failure mode classical APM does not catch: the agent's *plan* drifting off the happy path while every individual span still looks healthy.

This runbook is the operating manual. It is the document the on-call reads at 02:00 when a dashboard fires, and the document the new SRE reads on day one. It is not background reading; every page closes with an action.

## Contents

1. [Architecture overview](01-architecture-overview.md) — the stack, the wiring, what each service owns.
2. [The AgentOps taxonomy](02-the-agentops-taxonomy.md) — the five span types and what each captures (distills arXiv 2411.05285).
3. [Flow discovery analytics](03-flow-discovery-analytics.md) — how we detect plan drift from traces alone (distills arXiv 2503.06745).
4. [Evaluation harness](04-evaluation-harness.md) — the five-perspective continuous eval (distills arXiv 2503.16416).
5. [Instrumenting your agents](05-instrumenting-your-agents.md) — the decorator API, the span attribute convention, error semantics.
6. [Reading the dashboards](06-reading-the-dashboards.md) — a panel-by-panel tour of the four Grafana dashboards.
7. [Incident response](07-incident-response.md) — three scenarios, three procedures, three decision trees.

## Source papers

- **arXiv 2411.05285** — Dong et al., *AgentOps: Enabling Observability of LLM Agents*. The taxonomy of what to trace, and the motivating thesis that agents "raise significant concerns on AI safety due to their autonomous and non-deterministic behavior" — observability is the lever stakeholders use to "proactively understand the agents, detect anomalies, and prevent potential failures." Quoted directly in §02.
- **arXiv 2503.06745** — *Beyond Black-Box Benchmarking for Agentic Systems*. Source of the load-bearing empirical claim: **79% of practitioners surveyed agree that non-deterministic flow of agentic systems is a major challenge**. Source of the runtime-log-based flow discovery method we operationalize in §03.
- **arXiv 2503.16416** — *Survey on Evaluation of LLM-based Agents*. Source of the five-perspective evaluation framing: planning, tool-use, generalist capability, robustness, and the gap the survey calls out by name — "cost-efficiency, safety, and robustness." Operationalized as dashboards in §04 and §06.

## Action

If you are new on-call: skip to §06 and §07. If you are instrumenting a new agent: skip to §05. If you are explaining this system in a design review: §01 → §02 → §03.
