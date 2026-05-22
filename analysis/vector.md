# Subject survey — Vector (`~/ventures/arch-repos/vector`)

## What it is

"A high-performance, end-to-end observability data pipeline" (`README.md`):
collect, transform, route logs/metrics/traces. Rust; maintained by Datadog's
open-source team.

## The component model (`src/`)

Three component kinds, counted from the tree:
- **sources** — `src/sources/` (46) — where data enters.
- **transforms** — `src/transforms/` (18) — reshape & route.
- **sinks** — `src/sinks/` (55) — where data exits.

## The Event (`lib/vector-core/src/event/`)

One unified type for all three observability shapes: `log_event.rs` (logs),
`metric/` (metrics), `trace.rs` (traces). Every component speaks `Event`.

## VRL — Vector Remap Language

`src/transforms/remap.rs` runs VRL, a compiled DSL for reshaping events
(`lib/vector-vrl/`). Path assignments (`.field = ...`), fallible functions
(`parse_json!`), error coalescing (`??`).

## The topology runtime (`src/topology/`)

`builder.rs` turns a config into a running graph of async tasks
(`running.rs`, `controller.rs`, `task.rs`). `lib/vector-buffers` provides
in-memory/disk buffers — backpressure and durability; end-to-end
acknowledgement gives delivery guarantees.

## Film — `films/vector.json`

title · pipeline (diagram) · event (diagram) · vrl (code) · topology (diagram)
· flow (**sequence** — an event + its ack) · recap.
