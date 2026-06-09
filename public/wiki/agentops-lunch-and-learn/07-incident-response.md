# 07 — Incident response

You are on-call. A page fired. This is the page you read.

Three scenarios. Each has a triage tree, a procedure, and a clear decision point at the end. If your incident does not match any of these, file a postmortem with a fourth.

---

## Scenario 1 — "Latency p99 jumped 4x in the last 15 minutes"

The alert: `AgentPlanLatencyHigh` — plan-step p99 above 30 seconds for 15 minutes. Source: `agent-overview` dashboard's plan-latency panel.

### Triage tree

```
1. Open agent-overview. Is plan throughput also down?
   YES -> agents are partially failing, not just slow. Skip to step 4.
   NO  -> step 2.
2. Open tool-call-success. Any tool's p95 latency tracking the plan-latency rise?
   YES -> tool upstream is slow. Step 3.
   NO  -> not a tool problem. Step 5.
3. Open the Jaeger link in the tool panel for the slow tool. Are all traces slow,
   or only a subset?
   ALL SLOW    -> the tool's upstream is degraded. Escalate to tool owner.
   SUBSET SLOW -> a specific argument shape is slow. Capture two trace IDs,
                  file a ticket with the tool owner, continue.
4. The fleet is partially down. Check otel-collector-self in Prometheus for
   exporter failures. If non-zero, the collector is the problem, not the agents.
5. Open flow-discovery. Is stability dropping?
   YES -> behavioral regression. Continue to scenario 2.
   NO  -> open Jaeger, filter to plans > 30s, inspect the longest 3.
```

### Procedure once the cause is identified

- **Tool upstream slow:** rate-limit the calling agent at the workload entrance (see scenario 3 for the kill switch) so the slow tool does not back-pressure the whole fleet. Page the tool owner.
- **Collector exporter failing:** restart the collector (`docker compose restart otel-collector`). If failures persist, the downstream store (Jaeger/Prometheus/Loki) is the real cause — check its container.
- **Specific traces are slow:** capture two trace IDs in the incident channel, hand to the agent team for a planning-regression investigation.

### Close

After mitigation, file a 1-page postmortem with the tool name, latency shape (sustained vs spiky), and which kill switch (if any) you pulled. Do not skip this for "small" incidents — the third repetition of a small incident is how the big one looks at the start.

---

## Scenario 2 — "Hallucination rate spiked"

The alert: `AgentHallucinationRateHigh` — `rate(agentops_hallucination_event_total[10m])` above 1.5x the 7-day baseline. Source: `flow-discovery` dashboard, hallucination event timeline.

### Likely causes (in descending order of frequency)

1. **Model update.** A new model version was pinned (intentional or upstream-pushed) and its calibration differs.
2. **Prompt regression.** A prompt change shipped that confuses the model into making up content.
3. **Tool returning bad data.** A tool's output schema changed; the model is dutifully synthesizing answers from garbage input.

### Bisection procedure

Bisection is on the *change axis most likely to have caused it*. Open `flow-discovery` and read the hallucination timeline backward to the inflection point. Capture the inflection timestamp.

Then ask, in this order:

```
1. Did a release ship in the 30 min before the inflection?
   YES -> compare the release diff. If the system prompt changed, this is your
          cause. Roll back. STOP.
   NO  -> step 2.
2. Did the model pin change? Check the resource attribute `llm.model` distribution
   on the llm-cost-budget dashboard around the inflection.
   YES -> upstream model update. Pin to the previous version in
          agents/config/models.toml. STOP.
   NO  -> step 3.
3. Did any tool's output schema change? Open tool-call-success, look for a tool
   whose error rate is FLAT (so it doesn't trip the tool alert) but whose
   downstream llm_call latency or hallucination rate climbed in the same window.
   YES -> the tool's payload changed. Hard-validate the tool output and quarantine
          the tool until the owner fixes it. STOP.
   NO  -> file a P2 — neither release, model, nor tool axis explains it. The
          agent team takes it to the data-drift investigation playbook.
```

### Close

Roll-back is the right first move for releases and model pins; do not "patch forward" on a hallucination incident — the customer-visible damage compounds every minute. Postmortem: the inflection timestamp, the bisection axis, the change rolled back.

---

## Scenario 3 — "Cost burn-down projects 2x daily budget"

The alert: `AgentCostBudgetBurn2x` — `agent-overview`'s LLM cost burn panel red; the `llm-cost-budget` dashboard's burn-down line crosses zero before 24:00.

Three kill switches, escalating in customer impact.

### Decision tree

```
1. Open llm-cost-budget. Is the cost concentrated in one plan.goal?
   YES -> step 2A (targeted kill switch).
   NO  -> step 2B (broad kill switch).
2A. Targeted: shrink the prompt for that goal.
   - Check the system prompt for that goal in agents/prompts/.
   - If a recent change inflated it, revert.
   - If it's just expensive by design, route that goal to a cheaper model:
     update agents/config/routing.toml, set goal=<x> -> model=<smaller>.
   - Cheaper model degrades quality. Confirm with the agent team before merging.
   STOP.
2B. Broad: shrink overall token throughput.
   Choose ONE of:
   (a) Rate-limit at the workload entrance: in agents/config/limits.toml,
       drop concurrency from N to N/2. Cheapest impact; reduces all customer
       traffic uniformly.
   (b) Swap the default model: agents/config/models.toml, change
       default = "claude-opus-4-7" to a Haiku-class default. Faster, cheaper,
       lower quality across the board.
   (c) Cap per-plan token budget: agents/config/limits.toml, set
       max_completion_tokens=2048. Some plans will truncate; the truncation
       is visible as a span event llm.truncated=true.
   Prefer (a). It is the most reversible.
   STOP.
```

### Why not "just stop the fleet"?

Killing the fleet is always an option and almost never the right one. The cost incident has a deadline (the budget) but no immediate-harm urgency; the customer-impact of going dark exceeds the over-budget impact in most cases. Reach for a fleet stop only if budget overrun is itself a contract violation (some enterprise tiers).

### Close

After the budget stabilizes, file a postmortem with: which goal was the cost driver, which kill switch you pulled, when the burn-down line returned to a safe slope. The followup ticket is always "make the eval harness gate catch *this* shape of regression next time" — see §04.

---

## Action

Before your first on-call, do a tabletop walkthrough of all three scenarios in a Friday demo. Have someone else point at a panel; you state what you would do and why. Twenty minutes well spent. The procedures are easy to follow at 14:00 and hard at 02:00; the muscle memory is built in daylight.
