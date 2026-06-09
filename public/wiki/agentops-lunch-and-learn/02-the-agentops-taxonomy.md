# 02 — The AgentOps taxonomy

Classical OpenTelemetry assumes a service handling a request — one HTTP span at the root, downstream RPCs and DB queries nested under it. An LLM agent does not look like that. A single user prompt fans into a *plan* (the model decides what to do), which fans into *steps*, each of which may issue an LLM call, a tool call, or another planning round. The classical taxonomy makes that legible as a pile of opaque `http.client` spans labeled `chat.completions`. The AgentOps taxonomy makes it legible as agent behavior.

The taxonomy is drawn from Dong et al. (arXiv 2411.05285), which motivates the work directly: agents "raise significant concerns on AI safety due to their autonomous and non-deterministic behavior," and observability is what lets stakeholders "proactively understand the agents, detect anomalies, and prevent potential failures." The five span types below are what we trace.

![AgentOps span taxonomy](../diagrams/02-span-taxonomy.png)

## The five span types

### 1. `plan_step` — the root of a reasoning trace

A `plan_step` span wraps one stage of multi-step reasoning. Its lifetime spans whatever the agent does to *advance the plan one step* — typically several LLM calls and tool calls. Attributes: `plan.id` (stable across the whole plan), `plan.goal` (the user-facing intent), `plan.step_index` (0-based), `plan.parent_step` (for sub-plans).

Why this is the root and not the user prompt: a user prompt can spawn many plans (an orchestrator delegating to specialists); a plan can outlive a single request (background re-planning). The plan step is the smallest unit of agent intent that has a meaningful success/failure outcome.

### 2. `agent_decision` — what the agent chose, and why

The fork point: route to researcher? to synthesizer? give up and ask the user? Attributes: `agent.name` (the deciding agent), `decision.choice` (the option taken), `decision.options` (the menu the agent saw), `decision.confidence` (model-reported, when available). This is the span you scope a Jaeger query to when you want to ask "what fraction of plans take path A vs path B."

### 3. `llm_call` — the model invocation

One model call. Attributes: `llm.model` (e.g. `claude-opus-4-7`), `llm.prompt_tokens`, `llm.completion_tokens`, `llm.latency_ms`, `llm.temperature`, `llm.cost_usd`. The `cost_usd` is computed at instrumentation time from a model-price table; the `llm-cost-budget` dashboard in §06 aggregates it.

Per the paper, this is the smallest unit of "non-deterministic behavior." A retry of the same prompt at the same temperature is *not* the same span — it gets its own `llm_call` so retry counts are visible.

### 4. `tool_call` — external action

A function call out — web search, database query, shell command, another agent. Attributes: `tool.name`, `tool.args` (redacted; see §05 on PII), `tool.success` (boolean), `tool.latency_ms`, `tool.error.kind` (one of `timeout | rate_limit | bad_args | upstream_5xx | unknown`).

### 5. `flow_checkpoint` — sibling, not nested

A marker emitted at named points in the agent loop (`request_received`, `plan_drafted`, `tool_invoked`, `response_sent`). Unlike the other four, it is a *sibling* under the trace root, not nested. This is intentional: the sequence of checkpoints in a trace is the input to the flow-discovery analytics in §03.

## Events, not spans: `hallucination_flag`

When a downstream verifier (a separate LLM judge, a retrieval-grounded check, or a hand-tuned regex) finds the model produced an unsupported claim, the verifier *does not* emit a span — it adds an event to whichever span the bad output came from. Event attributes: `hallucination.kind` (`unsupported_claim | fabricated_citation | invalid_format`), `hallucination.score` (verifier confidence, 0–1), `hallucination.detector` (which verifier fired).

Events are the right primitive because hallucinations are *findings about* a span, not a span themselves.

## Code: how this looks in Python

The instrumentation library wraps each span type in a decorator. Full reference in §05; here is the shape:

```python
from agentops import plan_step, llm_call, tool_call, flag_hallucination, flow_checkpoint

@plan_step(goal="summarize the user's repo")
def run_plan(prompt: str) -> str:
    flow_checkpoint("plan_drafted")
    research = research_step(prompt)
    return synthesize(research)

@llm_call(model="claude-opus-4-7", temperature=0.2)
def synthesize(notes: str) -> str:
    out = client.complete(notes)
    if looks_fabricated(out):
        flag_hallucination(kind="fabricated_citation", score=0.91, detector="citation_grep")
    return out

@tool_call(name="github.search_repos")
def research_step(query: str) -> list[dict]:
    return gh.search(query)
```

Every decorated function starts its span on entry, closes it on return or exception, and records `exception.type` + `exception.message` on the latter. `flag_hallucination` and `flow_checkpoint` operate on the *current* span — they are no-ops if no span is active, which is the correct fail-open behavior for telemetry.

## Action

When designing a new agent feature, ask which of the five your new code is. If the answer is "none of them," you are probably missing a `flow_checkpoint`. If the answer is "two at once," split the function. The taxonomy is closed for a reason: a sixth type proliferates dashboards.
