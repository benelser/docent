# Subject survey — Rig (`~/ventures/arch-repos/rig`)

Architecture review. Every claim cites a real file in the surveyed repo.

## What it is

Rig is a Rust library for building LLM-powered applications, "focused on
ergonomics and modularity" (`crates/rig-core/src/lib.rs:11`). A Cargo workspace
of ~20 crates (`Cargo.toml` — `members = ["crates/*"]`); `crates/rig-core` is
the library, the rest are integrations.

## The layering (from `rig-core/src/lib.rs` doc + module tree)

- **Traits (the contracts).** `CompletionModel` and `EmbeddingModel`
  (`completion/`, `embeddings/`) — the low-level interface to LLMs.
  `VectorStoreIndex` (`vector_store/mod.rs:84`) — the retrieval contract.
- **Provider clients.** `src/providers/` holds ~27 providers — `openai/`,
  `anthropic/`, `cohere/`, `gemini/`, `mistral/`, `ollama.rs`, `xai/`,
  `deepseek.rs`, `groq.rs`, … Each exposes a `Client` that returns models
  implementing the traits above.
- **Agent.** `src/agent/` — `Agent` = a `CompletionModel` + preamble + tools +
  static context + dynamic context (`builder.rs`, `completion.rs`, `tool.rs`,
  `prompt_request/`). Dynamic context is RAG.
- **Pipeline.** `src/pipeline/` — a composition layer. `Op` trait
  (`pipeline/op.rs:10`): `type Input`, `type Output`, one required `call`
  method, plus combinators. `mod.rs` doc: "a DAG … each node is an operation",
  inspired by Airflow/Dagster but "idiomatic Rust patterns … no runtime".
  Files: `op.rs`, `parallel.rs`, `conditional.rs`, `try_op.rs`, `agent_ops.rs`.
- **Tools.** `src/tool/` — `mod.rs`, `rmcp.rs` (MCP client), `server.rs`.
- **Vector stores.** `vector_store/in_memory_store.rs` + ~17 integration crates
  (`rig-mongodb`, `rig-qdrant`, `rig-lancedb`, `rig-neo4j`, `rig-postgres`,
  `rig-sqlite`, `rig-surrealdb`, `rig-scylladb`, `rig-milvus`, …).

## Key idioms (for the code scene)

- `pipeline/op.rs:10` — `pub trait Op` with `Input`/`Output`/`call`. A closure
  is an `Op`; an LLM prompt is an `Op`; combinators chain them.
- Strict workspace lints (`Cargo.toml`): `unwrap_used`, `expect_used`,
  `panic`, `indexing_slicing`, `todo` all denied/forbidden — idiomatic, safe.

## Film outline — `films/rig.json`

1. `title` — Rig.
2. `overview` (diagram) — traits at the bottom, Agent + Pipeline on top.
3. `providers` (diagram) — ~27 providers behind two traits.
4. `agent` (diagram) — Agent = model + preamble + tools + static/dynamic context.
5. `pipelines` (**code**) — the `Op` trait + combinator chaining.
6. `rag` (diagram) — `VectorStoreIndex` + embeddings + integrations.
7. `recap`.

## Engine change folded back this iteration

Added the **`code` scene type** (`src/scenes/CodeScene.tsx`,
`src/components/code-theme.ts`) — a syntax-highlighted code window with
per-beat line highlighting. The Codex film never exercised real source on
screen; a SWE audience needs it.
