# Subject survey — OpenAI Codex CLI (`~/ventures/codex`)

Recipe A — architecture review. Every claim below cites a real file or directory
in the surveyed repo.

## What it is

Codex CLI is OpenAI's coding agent that runs locally on the user's machine
(`README.md:2`). It is distributed as an npm package (`@openai/codex`) and a
Homebrew cask, but the program itself is a large Rust workspace —
`codex-rs/Cargo.toml` declares on the order of 100+ member crates
(`codex-rs/` directory listing).

## Distribution wrapper

- **`codex-cli/`** — the npm package. `codex-cli/bin/codex.js` is a thin Node
  launcher: it maps the host `platform`/`arch` to a platform-specific binary
  package (`@openai/codex-darwin-arm64`, `@openai/codex-linux-x64`, …) and
  `spawn`s the native executable. No agent logic lives here.

## The Rust workspace (`codex-rs/`)

The README (`codex-rs/README.md:96`) names the key crates:

- **`core/`** — "the business logic for Codex … designed to be used by the
  various Codex UIs" (`codex-rs/core/README.md:1`). The agent engine.
- **`cli/`** — the multitool. `codex-rs/cli/src/main.rs` is a `clap` parser:
  with no subcommand it forwards to the interactive TUI; subcommands include
  `exec`, `mcp-server`, `mcp`, `login`, `app`, `sandbox`, `cloud`.
- **`tui/`** — the fullscreen terminal UI, built with Ratatui
  (`codex-rs/README.md:102`). The default interactive experience.
- **`exec/`** — the "headless" CLI for automation/CI: `codex exec PROMPT`
  (`codex-rs/README.md:101`, `codex-rs/exec/src/`).

Supporting crates surveyed:

- **`protocol/`** — the shared event/type vocabulary spoken between the UIs and
  `core` (`codex-rs/protocol/src/`: `protocol.rs`, `items.rs`, `approvals.rs`,
  `models.rs`, …).
- **`app-server/`** — exposes `core` as a JSON-RPC v2 service over stdio
  (`sdk/python/README.md:3`). IDE extensions and the SDKs connect to it.
- **`mcp-server/`** — "Prototype MCP server" (`codex-rs/mcp-server/src/lib.rs:1`),
  built on `rmcp`. Lets *other* MCP clients use Codex as a tool
  (`codex-rs/README.md:37`).

## The SDKs (`sdk/`)

- **`sdk/python/`** — "Experimental Python SDK for `codex app-server` JSON-RPC v2
  over stdio" (`sdk/python/README.md:3`). Drives Codex programmatically.
- **`sdk/typescript/` / `sdk/python-runtime/`** — companion SDK packaging.

## Inside `core` — the agent loop

`codex-rs/core/src/lib.rs` is the crate root. The loop, traced through the
source:

- **`client.rs`** — `ModelClient` "is intended to live for the lifetime of a
  Codex session … to talk to a provider (auth, provider selection, …)"
  (`codex-rs/core/src/client.rs:1`). A per-turn `ModelClientSession` streams one
  or more Responses API requests, caching a WebSocket connection.
- **`session/`** — `session.rs`, `turn.rs`, `turn_context.rs`: a session owns a
  thread; each **turn** is one prompt → one streamed model response.
- **`tools/`** — when the model emits tool calls:
  - **`tools/router.rs`** — dispatches each tool call to the right handler via a
    `ToolRegistry` / tool router.
  - **`tools/orchestrator.rs`** — "Central place for approvals + sandbox
    selection + retry semantics … approval → select sandbox → attempt → retry
    with an escalated sandbox strategy on denial"
    (`codex-rs/core/src/tools/orchestrator.rs:1`).
  - **`tools/handlers/`** — the concrete tools: `shell.rs`, `apply_patch.rs`,
    `mcp.rs`, `plan.rs`, `view_image.rs`, `multi_agents.rs`, `web_search`, …
- **`mcp.rs`** — `McpManager` is Codex acting as an MCP *client*, connecting to
  external MCP servers on startup to borrow their tools.
- **`rollout.rs`** — conversations are persisted as rollout files; the thread is
  reconstructible (`session/rollout_reconstruction.rs`).
- **`turn_diff_tracker.rs`** — records the file edits made during a turn.

## The sandbox

Every shell command runs isolated. `core` selects an OS-specific backend
(`codex-rs/core/README.md`, `codex-rs/core/src/sandboxing/`,
`codex-rs/sandboxing/`, `codex-rs/linux-sandbox/`, `codex-rs/windows-sandbox-rs/`):

- **macOS** — Seatbelt (`/usr/bin/sandbox-exec`) with a generated profile.
- **Linux** — Landlock, or bubblewrap (`bwrap`) for split filesystem policies.
- **Windows** — the Windows sandbox crate.

The policy (`SandboxPolicy` / `sandbox_mode`: `read-only`, `workspace-write`,
`danger-full-access`) is set by `--sandbox` or `config.toml`
(`codex-rs/README.md:78`). On a sandbox denial the orchestrator can escalate:
ask for approval, then re-attempt under a broader sandbox.

## A turn, end to end

1. User types a prompt in the **TUI** (or `exec`, or an SDK call).
2. The surface hands the prompt to **`core`**.
3. `core`'s **`ModelClient`** streams the prompt to the model (OpenAI Responses
   API) and receives streamed text + tool calls.
4. The **tool router** dispatches each tool call; the **orchestrator** checks
   approval and picks a sandbox.
5. A `shell` call runs inside the **sandbox**; `apply_patch` edits files and the
   **turn diff tracker** records the change.
6. Tool results are fed back to the model; the loop repeats until the model
   stops calling tools — the turn ends.
7. Turn events are persisted to the **rollout** file; the surface renders the
   streamed events live.

## Film outline (scenes, 30–90s each)

1. **Title** — "Codex CLI — Architecture Review"; one sentence on what it is.
2. **At a glance** — npm wrapper → cli multitool → core → model provider, with
   the sandbox alongside core. The spine of the system.
3. **The surfaces** — tui, exec, app-server, mcp-server all converging on core.
4. **Inside core — the agent loop** — ModelClient, Session/Turn, tool router,
   orchestrator, handlers; the loop.
5. **The sandbox** — every command isolated; Seatbelt / Landlock / Windows;
   escalation on denial.
6. **A turn, end to end** — a prompt flowing through the whole system; recap.
