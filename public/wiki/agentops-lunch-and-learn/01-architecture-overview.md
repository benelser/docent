# 01 — Architecture overview

AgentOps is one OpenTelemetry collector fronting three specialized stores fronted by one Grafana. The agent fleet only ever speaks OTLP — it does not know Jaeger, Prometheus, or Loki exist. That decoupling is the load-bearing design choice: any backend can be swapped without touching agent code.

![AgentOps stack architecture](../diagrams/01-stack-architecture.png)

## The services

The stack is defined in `docker-compose.yml` at the repo root. Six services, all pinned to specific minor versions because the dashboard JSONs in §06 reference panel schemas that broke between Grafana 10 and 11.

| Service | Image | Owns | Port |
|---|---|---|---|
| `agent-fleet` | local build (Python 3.12 + OTel SDK 1.28) | orchestrator / researcher / synthesizer workload | `:8080/health` |
| `otel-collector` | `otel/opentelemetry-collector-contrib:0.118.0` | OTLP receiver + processor chain + fan-out | `:4317` gRPC, `:4318` HTTP |
| `jaeger` | `jaegertracing/all-in-one:1.62.0` | trace storage + UI | `:16686` UI |
| `prometheus` | `prom/prometheus:v2.55.1` | metrics TSDB, scrapes collector `:8889` | `:9090` |
| `loki` | `grafana/loki:3.2.1` | log aggregation, single-binary mode | `:3100` |
| `grafana` | `grafana/grafana:11.3.0` | unified UI, four provisioned dashboards | `:3000` |

## Why this shape

The collector exists so agents speak one protocol. Inside the collector, three pipelines fan a single OTLP feed into three backends:

```
traces  -> otlp/jaeger          (gRPC to jaeger:4317)
metrics -> prometheus exporter  (pull on :8889; prometheus scrapes)
logs    -> otlphttp/loki        (HTTP to loki:3100/otlp)
```

Each pipeline runs the same processor chain: `memory_limiter → resource → batch`. `memory_limiter` is non-negotiable — a runaway agent emitting 100k spans/sec will OOM the collector in seconds without it; the configured 512 MiB hard cap with a 128 MiB spike buffer is the smallest envelope that survives our worst observed burst (the "tool retry storm" from the Q1 postmortem). `resource` injects `deployment.environment` and `telemetry.source` so every dashboard can filter by environment without per-agent configuration. `batch` amortizes export cost at 1024-span batches or 5 seconds, whichever hits first.

Why three stores and not one? Each pillar has a different access pattern. Traces are write-heavy, read-sparse (you only fetch a trace when you have a `trace_id`); a columnar TSDB is the wrong tool. Metrics are aggregation-heavy; a span store handles a sum poorly. Logs need full-text search. The cost of running three is a config burden — paid once — and the benefit is each store is tuned to its workload. Grafana glues them by `trace_id`: a Loki log line `trace_id=abc123` becomes a clickable link into Jaeger via the `derivedFields` clause in `grafana/provisioning/datasources/datasources.yaml`.

## What this is not

The all-in-one Jaeger image stores spans in memory; on a restart, traces older than the process die. This is fine for the demo and a research notebook; for production you would swap to `jaeger-collector` + Elasticsearch or ClickHouse. Loki's single-binary mode has the same caveat — fine until it isn't. Both are flagged as `# Sufficient for a demo` in `docker-compose.yml`.

## Action

`docker compose up -d`, then verify the four UIs answer 200:

```bash
for p in 16686 9090 3100 3000; do
  curl -fsS -o /dev/null -w "$p %{http_code}\n" "http://localhost:$p/" || echo "$p FAIL"
done
```

All four green, you have an observability stack. Now read §02.
