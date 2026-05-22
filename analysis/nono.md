# Survey — nono (architecture review, whole system)

Subject: `~/ventures/arch-repos/nono` · `always-further/nono` @ `0.57.0` (commit `9b54f4b`)
Mode: architecture review of the whole system. Traced read-only against the
real code, the real `Cargo.toml`, and the real `git log`.

---

## 0. Subsystem boundary

No subsystem named — this is a whole-system review. The boundary is the Cargo
workspace itself. `Cargo.toml` declares **four members**:

- `crates/nono` — the core **library** (~28.3k LOC). A *pure sandbox primitive*:
  no built-in policy. `lib.rs` modules: `capability`, `sandbox` (linux/macos),
  `keystore`, `undo`, `trust`, `supervisor`, `diagnostic`, `net_filter`,
  `scrub`, `state`, `manifest`, `path`, `query`.
- `crates/nono-cli` — the **CLI** binary (~70.1k LOC). Owns *all* security
  policy: groups, deny rules, dangerous-command lists, profiles, exec
  strategies, `learn` mode, rollback lifecycle, audit, UX. 21 subcommands.
- `crates/nono-proxy` — the **proxy** (~10.3k LOC). Network filtering +
  credential injection. Runs *unsandboxed*, alongside the supervisor.
- `bindings/c` — C FFI (`extern "C"` surface + cbindgen-generated `nono.h`).

Total ~108k LOC of Rust, edition 2024, rust-version 1.95. Every node in the
film is one of these crates or a named neighbour (the kernel LSMs, the OS
keyring, a Sigstore trust root).

---

## 1. Triage *(PR mode — n/a)*

Architecture mode; no diff to triage. The scoping decision instead: of ~108k
lines, the film interrogates the **load-bearing design seams**, not every
module. In scope: the library/CLI policy split, the capability model and
irreversibility, the Landlock/Seatbelt platform layer, the `nono run`
lifecycle, and the proxy. Named-and-set-aside: `undo` (snapshot/Merkle
internals), `trust` (Sigstore attestation), `learn` mode, the audit ledger,
and the C bindings — each gets a sentence, none gets a scene.

## 2. What it is / why it exists

nono is a **capability-based, policy-governed runtime for AI agents**. It runs
an agent (Claude Code, Codex, etc.) inside a real development environment but
gives the process only the host resources it actually needs — specific paths,
network destinations, sockets, env vars, credentials — enforced by kernel
primitives. The README frames the niche precisely: it sits *between* "run the
agent directly with full access to my keys and files" and "seal it inside a
separate guest OS." Same machine, same files, but every resource is an
explicit capability. The author also created Sigstore — provenance and
attestation are first-class here, not bolted on.

The central architectural decision: **the library is policy-free mechanism;
the CLI is all policy.** `crates/nono` applies *only* what a caller puts into a
`CapabilitySet` — no built-in sensitive paths, no dangerous-command list, no
system paths. That makes the primitive reusable by the Python/TypeScript/Go
bindings without re-litigating policy — and it makes the library, used alone,
unsafe by default: a caller who forgets to add `/usr` gets a process that
cannot run; a caller who forgets to deny something gets no protection.

## 3. Hard parts

**Failure & partial failure.**
- *The sandbox is irreversible.* `Sandbox::apply()` calls Landlock's
  `restrict_self()` (`sandbox/linux.rs:738`) or Seatbelt's `sandbox_init()`
  (`sandbox/macos.rs`). There is deliberately **no API to expand permissions**
  afterward (CLAUDE.md "Key Design Decision 1"). This cuts both ways: it is the
  security guarantee, and it is the most likely 3am page — an agent run dies
  mid-task because a path or host was not in the profile, and the running
  process cannot be widened. The fix is to amend the profile and re-run. The
  `diagnostic` module exists precisely for this: when a sandboxed child exits
  non-zero, it prints a `nono diagnostic` footer naming the probable missing
  capability and the exact flag to grant it — phrased "may be due to," not
  "was," because the failure could be unrelated.
- *Fail-secure is doctrine.* CLAUDE.md: "On any error, deny access. Never
  silently degrade." "Configuration load failures must be fatal." The named
  footgun: `unwrap_or_default()` on a security list returns empty permissions —
  which reads as *no protection*. The build enforces the ethos:
  `clippy::unwrap_used = "deny"` workspace-wide, and `panic = "abort"` in the
  release profile.
- *The proxy is a single point.* Under `NetworkMode::ProxyOnly` the sandbox
  blocks all direct egress; the agent reaches the network only via the local
  proxy. If the proxy process dies, the agent loses all connectivity; if it is
  slow, requests hang (upstream timeout ~30s). The proxy is also unsandboxed
  and sees every credential and every decrypted byte.
- *TLS interception breaks cert-pinning.* The proxy MITMs TLS with an ephemeral
  CA; an agent that pins a real certificate fails the intercepted handshake —
  a hard fail, no fallback.

**Delivery / ordering / consistency.** Not a distributed system — no delivery
guarantee to name. The relevant consistency property is **enforcement
ordering**: in supervised mode the child must apply Landlock *before*
installing the seccomp-notify filter — seccomp traps every `openat`, and
Landlock's `restrict_self()` itself opens path fds, so the reverse order
deadlocks (`exec_strategy.rs` child path). Capability resolution is
deterministic: paths canonicalized at grant time.

**Concurrency & contention.** The serialization point is `fork()` in supervised
mode. The child allocates memory post-fork (Landlock/Seatbelt setup); a thread
in the parent holding the allocator lock at fork time would deadlock the child.
So `ThreadingContext` gates the fork: `Strict` (default) aborts if the process
has more than 1 thread; `KeyringExpected` tolerates ≤4 idle keyring workers;
`CryptoExpected` tolerates ≤7. The proxy is async (tokio, task-per-connection);
the audit log is an `Arc<Mutex<Vec<_>>>` capped at 4096 events.

**State & invariants.**
- *Capabilities canonicalized at grant time.* `FsCapability::new_dir/new_file`
  canonicalize first, then check type on the resolved inode — closing the
  TOCTOU window between `exists()` and `canonicalize()` (`capability.rs:105`).
  A residual TOCTOU remains at the kernel enforcement boundary: a symlink can
  still change between resolve and use. Invariant `separate-read-write`: read
  and write grants are distinct, never conflated.
- *Irreversibility invariant:* once applied, the capability set only ever
  shrinks. The supervisor's runtime "expansion" is not a violation — it is the
  unsandboxed parent issuing a new, narrower grant the child consumes.
- *WSL2 / platform detection is spoofing-resistant:* trusts only
  kernel-controlled indicators (`/proc/version`, binfmt entry), explicitly
  *not* the caller-controlled `WSL_DISTRO_NAME` env var, "to prevent a security
  downgrade."

**At least one real number.** Linux Landlock ABI is probed V6→V1
(`ABI_PROBE_ORDER`); **TCP network filtering requires ABI v4+** — below that,
nono falls back to a seccomp filter that is all-or-nothing (`BlockAll`) or
proxy-only, never a partial host allow-list. Landlock needs kernel 5.13+. The
proxy's session token is **256-bit**, compared in constant time; the ephemeral
intercept CA is valid **24 hours**, leaf certs 1 hour. Profile inheritance
(`extends`) is bounded at depth 10.

## 4. The alternative not taken

- **Allow-list over deny-list.** nono is strictly allow-list — Landlock cannot
  even *express* deny-within-allow on Linux. A deny-list would be far easier to
  author (block the dangerous things, allow the rest) but fails *open* on
  anything unforeseen. Allow-list fails *closed*; the cost is authoring labour,
  which nono pays down with `learn` mode and shippable profiles.
- **In-place kernel sandbox over a guest OS / VM.** The README states the
  choice outright. A VM or microVM gives a stronger isolation boundary; nono
  chose in-process kernel mediation so the agent keeps the *real* dev
  environment. The cost: the boundary is a kernel LSM, not a hypervisor — a
  kernel-level Landlock/Seatbelt bug is a full escape.
- **Policy in the CLI over policy in the library.** Baking default policy into
  the library would make it safe-by-default for casual callers. nono refused:
  the library stays a pure primitive so every binding shares one mechanism. The
  cost is a sharp-edged library and a heavier CLI (70k of the 108k lines).
- **Credential injection via a proxy over an env-var.** Injecting
  `ANTHROPIC_API_KEY` into the process is trivial. nono instead keeps the key
  *outside* the sandbox: the agent holds only a phantom session token, and the
  proxy swaps it for the real credential on the way out. The cost is the whole
  TLS-MITM apparatus and a privileged unsandboxed proxy.

## 5. Do the tests prove the claimed behavior

The claim is "kernel-enforced isolation." Unit tests are plentiful — ~722 test
functions in the library, ~1135 in the CLI — but a unit test cannot prove the
*kernel* denied a syscall; it proves the policy logic computed the right
`CapabilitySet`. The load-bearing proof is the **24 integration shell scripts**
in `tests/integration/`, which actually launch a sandboxed process and attempt
escapes: `test_bypass_protection.sh`, `test_fs_access.sh`, `test_network.sh`,
`test_tls_intercept.sh`, `test_exec_strategy.sh`, `test_wsl2.sh`. Those are the
tests that would fail if isolation regressed. Gap: they are end-to-end and
platform-specific — CI must run both Linux and macOS or a platform divergence
slips through (CLAUDE.md footgun #6 names exactly this).

## 6. Blast radius

Several versioned wire formats: the **profile JSON schema** (with a deliberate
deprecation path — `deprecated_schema.rs`, `deprecated_policy.rs` — that warns
on legacy shapes), the embedded `policy.json`, `SandboxState` serialization
(forward/back skew handled explicitly: the `unix_sockets` field is
`#[serde(default)]` so states written by older builds still load), the
`TrustPolicy` (`TRUST_POLICY_VERSION = 1`, version-checked on load), and the C
ABI header `nono.h` (cbindgen-generated — any change to the FFI surface is an
ABI break for the language bindings). How on-call notices misbehaviour: the
`diagnostic` footer on a sandboxed failure, plus the audit ledger. Rollback
cost is low for a *run* (re-invoke with a corrected profile) and the `undo`
module gives content-addressable filesystem rollback for changes a run made.
Note: CLAUDE.md still documents a `Monitor` exec strategy ("sandbox-then-fork,
default") that **no longer exists** — the real enum is `Direct | Supervised`,
default `Supervised` (`ExecStrategy::default()`, asserted at
`exec_strategy.rs:3376`). Stale docs, not a code bug.

## 7. Verdict inputs

- **Disposition** — a sound, security-first architecture, honestly built. The
  library/CLI split is the right seam; the irreversibility and fail-secure
  doctrine are real, not slogans, and the build config enforces them. Approve
  as an architecture, with eyes open.
- **The single biggest residual risk** — the proxy. It is an unsandboxed,
  privileged TLS man-in-the-middle that sees every credential and every
  decrypted byte. It is the largest trusted component in a tool whose whole
  pitch is shrinking what you must trust. A bug there is a credential
  disclosure, not a contained failure.
- **What to watch** — (1) platform divergence: Landlock cannot deny-within-
  allow, Seatbelt can; the two will always need parallel reasoning and
  both-platform CI. (2) The allow-list authoring tax: if profiles are painful,
  users widen them until the sandbox is theatre — watch how good the default
  profiles and `learn` mode actually are. (3) The kernel LSM floor: nono is
  only ever as strong as Landlock and Seatbelt beneath it.
