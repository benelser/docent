# 05 — Instrumenting your agents

You are writing a new agent. Six imports and five decorators and your agent shows up on the dashboards in §06 with no further work. This page is the contract.

## The decorator API

```python
from agentops import (
    plan_step,        # 1. wraps one stage of multi-step reasoning
    agent_decision,   # 2. wraps a routing choice
    llm_call,         # 3. wraps a model invocation
    tool_call,        # 4. wraps an external action
    flow_checkpoint,  # 5. emits a sibling checkpoint span
    flag_hallucination,  # 6. attaches an event to the current span
)
```

Each decorator opens a span on entry, closes it on return or exception. Each accepts keyword arguments that become span attributes. None of them block: if the OTLP exporter is down (see "error semantics" below), the decorated function still runs and returns; only telemetry is lost.

### `@plan_step(goal: str, parent_step: str | None = None)`

Wraps one stage of multi-step reasoning. Captures `plan.id` (a UUID generated on entry if not already in context), `plan.goal`, `plan.step_index` (auto-incremented from a context counter), `plan.parent_step` (if you are recursing).

### `@agent_decision(agent_name: str, options: list[str])`

Wraps a routing choice. The decorated function *must return one of `options`* — the decorator records it as `decision.choice`. Captures `agent.name`, `decision.options` (the menu), `decision.choice` (the return value), and `decision.confidence` if the function returns a `(choice, confidence)` tuple.

### `@llm_call(model: str, temperature: float = 0.0)`

Wraps a model invocation. Captures `llm.model`, `llm.temperature`, and — read from the response object the function returns — `llm.prompt_tokens`, `llm.completion_tokens`, `llm.latency_ms`. The decorator computes `llm.cost_usd` from a model-price table at `agentops/pricing.toml`; update that file when you onboard a new model.

### `@tool_call(name: str, redact_args: list[str] = None)`

Wraps an external action. Captures `tool.name`, `tool.latency_ms`, `tool.success` (`False` on exception, `True` otherwise), and `tool.error.kind` (mapped from exception class — see the table below). `tool.args` is captured *unless the argument name is in `redact_args`*; redacted args become `"<redacted>"`. Redact PII, API keys, anything you would not want in Loki.

Exception → `tool.error.kind`:

| Exception | error.kind |
|---|---|
| `TimeoutError`, `asyncio.TimeoutError` | `timeout` |
| `RateLimitError` | `rate_limit` |
| `ValueError`, `TypeError` | `bad_args` |
| `httpx.HTTPStatusError` with 5xx | `upstream_5xx` |
| anything else | `unknown` |

### `flow_checkpoint(name: str)`

Function, not decorator. Emits a sibling span (zero duration) with `flow.checkpoint=<name>`. Place at every named loop boundary — `request_received`, `plan_drafted`, `response_sent`, plus any agent-specific waypoint you would put a print statement at during debugging.

### `flag_hallucination(kind: str, score: float, detector: str)`

Function, not decorator. Adds an event to the *current* span (the innermost open span on the context). `kind` is one of `unsupported_claim | fabricated_citation | invalid_format | other`. `score` is the detector's confidence in 0–1. `detector` is the name of whatever code path made the call.

## The attribute naming convention

**Dotted lowercase, OTel-style: `agent.name`, `tool.error.kind`, `llm.prompt_tokens`.** Not `agent_name`. Not `agentName`. This matches the OpenTelemetry semantic conventions for span attributes and is what the dashboard panels in §06 query against. If a future contributor writes `agent_name`, it will not show up on any panel and the regression will not surface until on-call notices a flat panel.

This convention is locked here, in this page. R13.1's `instrumentation.py` follows it. R13.2's dashboard JSONs query it. Any deviation is a runbook-blocking review comment.

## Resource attributes — set once, at startup

Set these *once* on the `TracerProvider`'s `Resource`, not on individual spans:

```python
Resource.create({
    "service.name": "agent-fleet",                # OTel built-in; required
    "deployment.environment": "prod",             # prod | eval | demo
    "agentops.fleet.version": "2026.06.07",       # git SHA or tag
})
```

`deployment.environment` is the filter every dashboard uses. Get it wrong and your traffic blends with another environment's; get it right and the dashboards just work.

## Error semantics — what happens when the collector is down

The Python SDK's OTLP exporter has a bounded in-memory queue (default 2048 spans) and a background thread that flushes. When the collector is unreachable:

1. The exporter logs `Failed to export spans` at WARN.
2. Spans accumulate in the queue until full.
3. When full, the *oldest* spans are dropped, not the newest. This is intentional — recent telemetry is more valuable than stale.
4. The decorated function *always returns its result*; instrumentation never raises.

The single failure mode you watch for: silent telemetry gaps. The `otel-collector-self` Prometheus scrape exposes `otelcol_exporter_send_failed_spans_total`. A non-zero rate sustained for 10 minutes pages the platform team, not the agent team.

## Minimal end-to-end example

```python
from agentops import plan_step, llm_call, tool_call, flow_checkpoint, flag_hallucination

@plan_step(goal="answer the user's question")
def handle(question: str) -> str:
    flow_checkpoint("request_received")
    notes = research(question)
    flow_checkpoint("research_complete")
    answer = synthesize(notes)
    flow_checkpoint("response_sent")
    return answer

@tool_call(name="web.search", redact_args=["api_key"])
def research(q: str, api_key: str = "...") -> list[dict]:
    return search_client.query(q)

@llm_call(model="claude-opus-4-7", temperature=0.2)
def synthesize(notes: list[dict]) -> str:
    response = llm_client.complete(prompt=format_prompt(notes))
    if not all_claims_have_citations(response.text):
        flag_hallucination(kind="unsupported_claim", score=0.85,
                           detector="citation_check_v2")
    return response
```

## Action

After wiring decorators, run `agentops verify --agent <your-module>` in CI. It boots a throwaway collector + Jaeger, invokes your agent against three canned prompts, and asserts: at least one `plan_step`, at least one `flow_checkpoint`, every `llm_call` has non-zero token counts, every `tool_call` records `tool.success`. The verify step is the cheap one — debug in CI, not at 02:00.
