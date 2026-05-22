# rig PR Analysis — Rig-managed conversation memory

- **PR:** #1702 — *feat(memory): Rig-managed conversation memory + rig-memory companion crate*
- **URL:** https://github.com/0xPlaygrounds/rig/pull/1702
- **Author:** ForeverAngry (Brad Cannon) — fixes issue #1701
- **Headline stat:** 16 files changed, +1,903 / −4. Adds a new `rig::memory` module to `rig-core` and a brand-new companion crate `rig-memory`.

## What it introduces / does

Before this PR, every Rig application had to hand-manage conversation history: callers
passed `with_history(...)` on every prompt, which forced each app to reinvent persistence,
per-conversation isolation, and history shaping. This PR makes conversation memory a
first-class, Rig-managed concern. It adds a `ConversationMemory` trait that abstracts
load/append/clear over a `conversation_id`, a default in-process backend
(`InMemoryConversationMemory`), and per-agent / per-request entry points
(`AgentBuilder::memory`, `AgentBuilder::conversation_id`, `PromptRequest::conversation`,
`PromptRequest::without_memory`) that wire memory into both the streaming and
non-streaming agent loops. A separate companion crate `rig-memory` ships reusable,
named history-shaping policies (`SlidingWindowMemory`, `TokenWindowMemory`) so opinionated
behavior and its dependencies stay out of `rig-core`.

## What it touches

- **`crates/rig-core/src/memory.rs`** *(new, 279 lines)* — the `ConversationMemory` trait,
  `MemoryError` / `MemoryBackendError` error model, the `MessageFilter` closure trait, and
  the `InMemoryConversationMemory` `HashMap`-backed backend with `with_filter`.
- **`crates/rig-core/src/lib.rs`** — registers the new `memory` module.
- **`crates/rig-core/src/agent/builder.rs`** — `AgentBuilder` gains `memory` and
  `default_conversation_id` fields plus the `.memory(...)` / `.conversation_id(...)` builder
  methods; both fields are threaded through every typestate transition of the builder.
- **`crates/rig-core/src/agent/completion.rs`** — `Agent` struct gains `memory` and
  `default_conversation_id` fields.
- **`crates/rig-core/src/agent/prompt_request/mod.rs`** — non-streaming prompt loop:
  load-before-prompt, append-after-success, plus `.conversation(...)` / `.without_memory()`.
- **`crates/rig-core/src/agent/prompt_request/streaming.rs`** — streaming parity, including
  `From<MemoryError> for StreamingError`.
- **`crates/rig-core/src/completion/request.rs`** — `From<MemoryError> for PromptError`.
- **`crates/rig-memory/`** *(new crate)* — `Cargo.toml`, `src/lib.rs` (495 lines),
  `README.md`, `CHANGELOG.md`, and an `examples/agent_with_memory_policies.rs`.
- **`examples/agent_with_memory.rs`**, **`examples/agent_with_memory_streaming.rs`** *(new)*.

## The core change

A new trait defines the storage contract — Rig calls `load` before a prompt and `append`
after a successful turn:

```rust
pub trait ConversationMemory: WasmCompatSend + WasmCompatSync {
    fn load<'a>(&'a self, conversation_id: &'a str)
        -> WasmBoxedFuture<'a, Result<Vec<Message>, MemoryError>>;
    fn append<'a>(&'a self, conversation_id: &'a str, messages: Vec<Message>)
        -> WasmBoxedFuture<'a, Result<(), MemoryError>>;
    fn clear<'a>(&'a self, conversation_id: &'a str)
        -> WasmBoxedFuture<'a, Result<(), MemoryError>>;
}
```

The central change is in the prompt loop. **Before**, the request simply took whatever
history the caller passed:

```rust
let chat_history = self.chat_history;
let mut new_messages: Vec<Message> = vec![self.prompt.clone()];
```

**After**, the loop resolves history from memory when the caller did not supply explicit
history, and keeps a handle so the completed turn can be persisted:

```rust
let (chat_history, memory_handle) = match self.chat_history {
    Some(history) => (Some(history), None),          // explicit history → memory bypassed
    None => match (self.memory, self.conversation_id) {
        (Some(memory), Some(id)) => {
            let loaded = memory.load(&id).await?;     // load failure is fatal
            (Some(loaded), Some((memory, id)))
        }
        _ => (None, None),                            // no backend / no id → no-op
    },
};
```

After a successful completion the turn is written back, best-effort:

```rust
if let Some((memory, id)) = memory_handle.as_ref()
    && let Err(err) = memory.append(id, new_messages.clone()).await
{
    tracing::warn!(error = %err, conversation_id = %id,
        "conversation memory append failed; returning model response anyway");
}
```

## Ripple effects

- **API surface:** purely additive at the type level. New public items: the `rig::memory`
  module, four builder/request methods. No existing signature changed.
- **Error model:** no new top-level error variants. `From<MemoryError> for PromptError`
  and `From<MemoryError> for StreamingError` funnel memory failures through the existing
  `CompletionError::RequestError(Box<dyn Error>)` arm, so downstream exhaustive `match`es
  on `PromptError` / `StreamingError` keep compiling. Callers who want the typed cause can
  downcast the boxed error back to `rig::memory::MemoryError`.
- **Failure semantics, deliberately asymmetric:** `load` failures are *fatal* (the
  requested history is unavailable, so the request cannot proceed correctly), while
  `append` failures are *best-effort* — they emit a `tracing::warn!` and the agent still
  returns the model response. Streaming mirrors this for `FinalResponse`.
- **Precedence rule:** an explicit `with_history(...)` fully bypasses memory for that
  request — no load *and* no append — so existing caller-managed code is unaffected.
- **Performance:** `append` runs inline before the agent returns, so backends are advised
  to keep it cheap; `MemoryPolicy::apply` is intentionally synchronous so policy work stays
  off the async hot path.
- **Crate split:** `rig-core` stays minimal (trait + in-memory backend + agent
  integration); named policies and their dependencies (token counters, etc.) live in
  `rig-memory`. The new crate also re-exports the core types so callers need only one
  dependency. WASM compatibility is preserved throughout via `WasmCompatSend`/`WasmCompatSync`
  /`WasmBoxedFuture` markers rather than raw `Send`/`Sync` bounds.
- **Policy safety detail:** `rig-memory`'s sliding policies call
  `drop_leading_orphan_tool_result` — if a window starts with an unpaired tool-result
  message (its assistant tool call was truncated away), it is dropped, because most
  providers reject orphan tool results. `IntoFilter::into_filter` swallows policy errors
  and returns unfiltered history (degrade gracefully); `PolicyMemory` is the hard-fail
  counterpart that surfaces them as `MemoryError::Policy`.

## Why it matters

This converts a recurring boilerplate burden into a framework primitive. Multi-turn agents
("remember my name across prompts") previously required every team to build their own
persistence and isolation layer. By defining a single `conversation_id`-keyed trait, Rig
makes memory pluggable — the in-process `HashMap` backend is enough for tests and demos,
while the same trait surface is explicitly designed to host future async/persistent
backends (Postgres, Redis, SQLite) without further core changes. The companion-crate split
is the real engineering discipline here: it keeps `rig-core`'s dependency graph and public
API lean while still shipping batteries-included history-shaping policies.

## Four beats

1. **The pain.** Every Rig app re-implements conversation history by hand, passing
   `with_history(...)` on each prompt and reinventing persistence and per-conversation
   isolation.
2. **The contract.** A new `ConversationMemory` trait is defined in `rig-core` — `load`,
   `append`, `clear` keyed by a `conversation_id` — with a typed `MemoryError` and a default
   `HashMap`-backed `InMemoryConversationMemory` implementation.
3. **The wiring.** The agent builder and prompt loop are threaded with memory: history is
   loaded automatically before a prompt and the completed turn appended after success
   (fatal on load failure, best-effort on append), across both streaming and non-streaming
   paths, with memory failures funneled through the existing error variants.
4. **The split.** A separate `rig-memory` crate ships reusable, named policies
   (`SlidingWindowMemory`, `TokenWindowMemory`) — including tool-call-pair-aware truncation —
   keeping opinionated behavior and extra dependencies out of the lean core.
