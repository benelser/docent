# Subject survey — nono (`~/ventures/arch-repos/nono`)

Architecture review. Claims cite real files; `AGENTS.md` in the repo is the
authoritative project description.

## What it is

nono is "a capability-based sandboxing system for running untrusted AI agents
with OS-enforced isolation" (`AGENTS.md`). Landlock (Linux) + Seatbelt (macOS),
plus a policy layer, diagnostics, and a rollback mechanism. From the creator of
Sigstore (`README.md`).

## The crates (`Cargo.toml` workspace — 4 members)

- **`nono`** (`crates/nono/`) — the core library. "Pure sandbox primitive with
  no built-in security policy" (`AGENTS.md`). It applies only what the caller
  puts in a `CapabilitySet`.
- **`nono-cli`** (`crates/nono-cli/`) — the CLI. "Owns all security policy,
  profiles, hooks, and UX." ~80 source files: `policy.rs`, `profile/`,
  `exec_strategy/` (`Direct`/`Monitor`/`Supervised`), `audit_*`, `rollback_*`.
- **`nono-proxy`** — network filtering + credential injection. `filter.rs`,
  `credential.rs`, `oauth2.rs`, `route.rs`, `tls_intercept/`, `forward.rs`,
  `reverse.rs`, `audit.rs`.
- **`nono-ffi`** (`bindings/c/`) — C FFI; auto-generated `nono.h`.

## The mechanism/policy split (the central idea)

`AGENTS.md` is explicit — a table of "In Library" vs "In CLI": `CapabilitySet`
builder + `Sandbox::apply()` are mechanism; policy groups, deny rules,
dangerous-command lists, the group resolver (`policy.rs`) are policy. The
library never decides; the CLI always does.

## The sandbox core (`crates/nono/src/`)

- `capability.rs` — `CapabilitySet` (`capability.rs:865`). Builder: `new()`,
  `allow_path(path, AccessMode)`, `allow_file(...)`, `allow_unix_socket(...)`,
  `block_network()`, `proxy_only(port)`. `AccessMode` = `Read | Write |
  ReadWrite` (`capability.rs:50`).
- `sandbox/mod.rs` — `Sandbox::apply(caps: &CapabilitySet)` (`sandbox/mod.rs:105`),
  cfg-split per OS; `sandbox/linux.rs` (Landlock), `sandbox/macos.rs` (Seatbelt).
- `undo/` — rollback: `merkle.rs` (MerkleTree), `object_store.rs` (ObjectStore),
  `snapshot.rs` (SnapshotManager), `exclusion.rs` (ExclusionFilter).
- Also: `diagnostic.rs`, `query.rs`, `keystore.rs`, `trust/`, `net_filter.rs`,
  `supervisor/`.

## Film outline — `films/nono.json`

1. `title`; 2. `overview` — mechanism vs policy, four crates; 3. `sandbox` —
`CapabilitySet` → `Sandbox::apply()` → Landlock/Seatbelt; 4. `capabilities`
(**code**) — the builder API; 5. `proxy` — route filter + credential injection;
6. `undo` — Merkle-tree snapshots + rollback; 7. `recap`.

## Engine fixes folded back this iteration

- **Overfitting**: `TitleScene` hard-coded the faux prompt as `codex`. Now
  derives `archcast <meta.id>` from the spec; scenes receive `SceneProps`
  including `meta`.
- **Bug**: long card labels overflowed the box (`CompletionModel ·
  EmbeddingModel`). `Card` now auto-fits font size to the box interior —
  overflow is impossible.
