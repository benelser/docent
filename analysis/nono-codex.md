# Survey — nono (architecture review, whole system)

Subject: `/Users/belser/ventures/arch-repos/nono`  
Mode: architecture review of the whole system  
Head traced: `9b54f4b` on `main` (`Merge pull request #975 from SequeI/binary_profile`)

The survey below is based on the real workspace layout, the real launch path, the real security docs, the real integration tests, and the recent merged history at head. The repo is read-only; no code was changed while surveying it.

## 0. Subsystem boundary

No subsystem was named. The boundary is the Cargo workspace itself. [Cargo.toml](/Users/belser/ventures/arch-repos/nono/Cargo.toml:1) declares four members:

- [crates/nono](/Users/belser/ventures/arch-repos/nono/crates/nono/src/lib.rs:1) is the core library. Its own module docs call it a “pure sandboxing primitive” that provides the mechanism for operating-system-enforced isolation without imposing policy, and the example shows the caller must grant even system paths like `/usr`, `/lib`, and `/bin` before a child can run.
- [crates/nono-cli](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/command_runtime.rs:78) is the command-line runtime. This is where profiles, trust scanning, network policy resolution, rollback, audit, session management, launch strategies, and user-facing diagnostics live.
- [crates/nono-proxy](/Users/belser/ventures/arch-repos/nono/crates/nono-proxy/src/server.rs:31) is the network and credential proxy. It runs in the trusted parent process, enforces header and route limits, and becomes part of the trusted computing base when proxy mode is active.
- [bindings/c](/Users/belser/ventures/arch-repos/nono/bindings/c/src/lib.rs:1) exposes a stable C A-B-I over the core library rather than reimplementing policy in another language.

The public surface into the system is therefore split cleanly:

- Library callers enter through [CapabilitySet` and `Sandbox::apply()`](/Users/belser/ventures/arch-repos/nono/crates/nono/src/lib.rs:15).
- End users enter through [`nono run` and its launch pipeline](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/command_runtime.rs:78).
- Credentialed network traffic enters through the [proxy runtime bootstrap](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/proxy_runtime.rs:184).

Out of scope for the film as primary subjects, though still traced as neighbors: pack publishing, query/introspection commands, and the full C binding surface. They matter, but they are not the system’s load-bearing seam.

## 1. Triage

Architecture mode, so there is no diff to rank. The equivalent cut line is which parts of a roughly `115,871`-line Rust codebase are structurally load-bearing.

The film will interrogate these seams:

- the policy-free library versus policy-heavy command-line runtime split
- profile, trust, and network policy compilation into a launch plan
- supervised execution, including the trusted parent and the sandboxed child
- proxy-based credential isolation
- the trade-offs that fall out of choosing same-host kernel enforcement over a guest boundary

It will name but set aside:

- the full rollback object-store internals, beyond the walk budget and restore contract
- the full Sigstore implementation details, beyond what the launch path enforces
- the audit attestation format, beyond the append-only chain and Merkle summary
- command-surface breadth such as `query`, `why`, `learn`, and pack publishing

Recent history reinforces that this cut line is the right one: head itself merged profile-level `binary` support, and the commits just below it are still refining profile authoring and platform rule ordering. The architecture is not frozen around the profile and launch seam.

## 2. What it is / why it exists

The repository describes itself as “a capability-based, policy-governed runtime for A-I agents” in the [README](/Users/belser/ventures/arch-repos/nono/README.md:34). The intended niche is explicit in the same file: it sits between “run the agent directly on my machine with full access to keys and files” and “seal it inside a separate guest O-S,” while still letting the agent work in the real repository and filesystem layout [README](/Users/belser/ventures/arch-repos/nono/README.md:38).

The deepest architectural choice is that the core library stays policy-free while the command-line layer owns every security judgment. The library docs say this directly: [“nono is a pure sandboxing primitive”](/Users/belser/ventures/arch-repos/nono/crates/nono/src/lib.rs:8). The README mirrors it: the [core library applies only the capabilities a caller provides, while the command-line tool, profiles, and packages carry policy](/Users/belser/ventures/arch-repos/nono/README.md:40). That seam explains most of the repo’s shape:

- the library can stay reusable and embeddable
- the command-line runtime can accumulate profiles, deny rules, trust scanning, audit, rollback, and proxy orchestration without contaminating the primitive
- the price is that casual library users do not get a safe default; the caller must know what to grant

## 3. Hard parts

### Failure and partial failure

The most important pre-exec failure point is trust scanning. [`prepare_trust_launch_options()`](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/launch_runtime.rs:291) loads the trust policy, runs a pre-exec scan, logs verified, blocked, and warned counts, and aborts the launch if `result.should_proceed()` is false [launch_runtime.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/launch_runtime.rs:313). This is fail-closed before the child is even launched.

The second sharp failure point is proxy-only networking on weak Linux floors. [`execute_sandboxed()`](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/execution_runtime.rs:241) explicitly refuses W-S-L two proxy-only mode when Landlock cannot enforce network restrictions and seccomp user notification is unavailable, because otherwise the child could bypass the credential proxy and open arbitrary outbound connections. The opt-in fallback is named `insecure_proxy`, and the warning text says exactly what is being lost [execution_runtime.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/execution_runtime.rs:249).

The supervisor path is also written to fail closed. The Linux supervisor module states its threat model in comments up front: parse or validation errors must deny the request, protected roots are authoritative, and trust-verified instruction files get a second digest check at file-descriptor open time [supervisor_linux.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/exec_strategy/supervisor_linux.rs:1). The public security model says the same thing more plainly: if the supervisor crashes, denies, rate-limits, or loses the race, the child does not get access [security-model.mdx](/Users/belser/ventures/arch-repos/nono/docs/cli/internals/security-model.mdx:249).

The likely three-a-m. page is not an exploit; it is authoring pressure. The sandbox is irreversible once applied, so an under-granted profile fails mid-task and must be fixed and rerun. The repo invests in a diagnostic footer precisely because this is expected operationally: the diagnostic formatter is explicitly worded as “may be due to,” not a false claim of certainty [diagnostic.rs](/Users/belser/ventures/arch-repos/nono/crates/nono/src/diagnostic.rs:9).

### Delivery, ordering, and consistency

This is not a distributed system, so the important ordering property is syscall and launch sequencing rather than message delivery semantics.

The critical ordering constraint is in supervised Linux mode: [Landlock must be applied before seccomp-notify is installed](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/exec_strategy.rs:724), because Landlock’s own `restrict_self()` path setup performs `openat` calls and seccomp-notify would trap those opens and deadlock the child if installed first. The code comments call this out directly, and then install seccomp only afterward [exec_strategy.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/exec_strategy.rs:765).

Trust verification is also ordered before the agent reads instruction files. The trust module’s own header says verification must complete before the agent can read those files, because otherwise the runtime would be trusting content it had not yet authenticated [trust_scan.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/trust_scan.rs:1).

### Concurrency and contention

The serialization point is the supervised fork. [`execute_supervised()`](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/exec_strategy.rs:589) validates threading before fork because the child allocates during sandbox setup; if another thread held allocator state at fork time, the child could deadlock. The code allows exactly one-thread strict mode, or small bounded exceptions for idle keyring and crypto workers, with explicit maxima enforced in code [exec_strategy.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/exec_strategy.rs:596).

Capability expansion is also intentionally serialized and throttled. The Linux supervisor’s rate limiter defaults to [ten requests per second with a burst of five](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/exec_strategy/supervisor_linux.rs:30), specifically to prevent a compromised child from flooding the terminal with approval prompts.

The attach path introduces another supervised concurrency seam. The P-T-Y proxy stands between the user’s real terminal and the child, and exposes a supervisor-owned attach socket for later reattachment [pty_proxy.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/pty_proxy.rs:1). The session file and attach socket are intentionally created before rollback initialization because the initial snapshot may take many seconds, and detached startup has a thirty-second timeout [supervised_runtime.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/supervised_runtime.rs:174).

### State and invariants

The first invariant is capability canonicalization. The library example and exported API surface both assume the caller constructs a concrete [`CapabilitySet`](/Users/belser/ventures/arch-repos/nono/crates/nono/src/lib.rs:15), and filesystem capabilities are canonicalized at grant time rather than at use time. This is the foundation for “grant only what was actually named.”

The second invariant is that the child never writes its own audit truth. The security model spells this out: the trusted parent records session metadata, supervisor-observed events, audit integrity data, and optional signatures; the child can only cause events, not author the record [security-model.mdx](/Users/belser/ventures/arch-repos/nono/docs/cli/internals/security-model.mdx:24). In code, the supervised runtime constructs the recorder in the parent and records `SessionStarted` before handing control to the execution strategy [supervised_runtime.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/supervised_runtime.rs:205). The recorder is append-only, maintains a running chain hash, and finalizes to an event count plus Merkle root [audit_integrity.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/audit_integrity.rs:68).

The third invariant is that rollback snapshot work is bounded. [`WalkBudget::default()`](/Users/belser/ventures/arch-repos/nono/crates/nono/src/undo/snapshot.rs:21) caps a snapshot walk at `300_000` entries and `2 GiB`, and errors rather than continuing indefinitely through `node_modules`, `target`, or similarly explosive trees.

The fourth invariant is that supervisor child-to-parent I-P-C is size- and identity-bounded. The supervisor socket uses a [four-byte length prefix and a sixty-four-kilobyte maximum message size](/Users/belser/ventures/arch-repos/nono/crates/nono/src/supervisor/socket.rs:19), creates owner-only socket paths with `0700` permissions, and authenticates the peer using kernel-provided credentials [supervisor/socket.rs](/Users/belser/ventures/arch-repos/nono/crates/nono/src/supervisor/socket.rs:75).

### At least one real number

There are several non-brochure numbers in the hot path:

- the workspace has four members [Cargo.toml](/Users/belser/ventures/arch-repos/nono/Cargo.toml:1)
- the repository currently contains `115,871` lines of Rust (`rg --files -g '*.rs' | xargs wc -l`)
- profile inheritance is capped at [depth ten](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/profile/mod.rs:2217)
- Landlock A-B-I probing runs from [V6 down to V1](/Users/belser/ventures/arch-repos/nono/crates/nono/src/sandbox/linux.rs:156), and [TCP network filtering requires V4+](/Users/belser/ventures/arch-repos/nono/crates/nono/src/sandbox/linux.rs:60)
- the proxy runtime is deliberately small, using [two Tokio worker threads](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/proxy_runtime.rs:206)
- every proxy session uses a [256-bit random token](/Users/belser/ventures/arch-repos/nono/docs/cli/internals/security-model.mdx:361)
- snapshot walks stop at [300,000 entries or 2 GiB](/Users/belser/ventures/arch-repos/nono/crates/nono/src/undo/snapshot.rs:35)

## 4. The alternative not taken

The repo is unusually explicit about roads not taken.

The most visible one is guest isolation versus same-host kernel mediation. The [README](/Users/belser/ventures/arch-repos/nono/README.md:38) says nono intentionally occupies the space between full host trust and a separate guest O-S. The chosen design gives fine-grained control over the real working tree and real host tools. The cost is that the trusted boundary is the host kernel plus the trusted parent, not a hypervisor boundary.

The Linux supervisor path rejects `SECCOMP_USER_NOTIF_FLAG_CONTINUE` for authorization decisions. The security model explains why: letting the child’s original syscall continue after the supervisor inspects a pointer argument creates a T-O-C-T-O-U race where the child can swap the path between approval and execution [security-model.mdx](/Users/belser/ventures/arch-repos/nono/docs/cli/internals/security-model.mdx:143). nono chooses supervisor-opened file descriptors instead. Chose supervisor-opened descriptors over “continue”; the cost is a larger trusted parent and more I-P-C complexity.

The design also rejects mount namespaces as the mandatory baseline. The security model notes that a mount namespace would close the filesystem reconnaissance leak, but requiring unprivileged user namespaces would make the base security boundary unavailable on many enterprise and distro-default Linux installs [security-model.mdx](/Users/belser/ventures/arch-repos/nono/docs/cli/internals/security-model.mdx:156). Chose Landlock plus seccomp over mandatory mount namespaces; the cost is that `stat` and `access` reconnaissance remains possible to a cooperative or adversarial child [security-model.mdx](/Users/belser/ventures/arch-repos/nono/docs/cli/internals/security-model.mdx:245).

Finally, the credential path chooses a trusted proxy over direct environment-variable injection. The [README](/Users/belser/ventures/arch-repos/nono/README.md:42) and [security model](/Users/belser/ventures/arch-repos/nono/docs/cli/internals/security-model.mdx:378) are aligned here: the child never sees the real credential; the proxy swaps it into the outbound request. Chose proxy-based credential isolation over simplicity; the cost is an unsandboxed network component that sees every secret and every decrypted byte.

## 5. Do the tests prove the claimed behavior

Mostly, yes, for the behaviors the architecture actually claims.

The strongest claims are enforced through integration tests that launch real sandboxed processes rather than only unit-testing policy compilation:

- [`test_bypass_protection.sh`](/Users/belser/ventures/arch-repos/nono/tests/integration/test_bypass_protection.sh:42) proves `bypass_protection` does not grant access by itself: it must match a real filesystem grant, and read-only grants stay read-only.
- [`test_tls_intercept.sh`](/Users/belser/ventures/arch-repos/nono/tests/integration/test_tls_intercept.sh:31) proves the T-L-S intercept wiring: the child gets the trust-bundle environment variables, the proxy prints route diagnostics, and the bundle lifecycle is real.
- [`test_trust_cli.sh`](/Users/belser/ventures/arch-repos/nono/tests/integration/test_trust_cli.sh:374) proves startup trust enforcement behavior, including the platform distinction for missing literal instruction files.
- [`test_audit.sh`](/Users/belser/ventures/arch-repos/nono/tests/integration/test_audit.sh:61) proves default supervised runs create audit sessions, `--no-audit` suppresses them, rollback enriches the session, and direct mode does not pretend to have parent-side audit semantics.

There is still a test-shape caveat. The architecture’s biggest risk is cross-platform divergence, and many behaviors are explicitly platform-conditional. The repo knows this; the docs themselves call both-platform testing mandatory for security changes. The tests prove the intended behavior only insofar as C-I runs the relevant matrix.

## 6. Blast radius

This repo has several compatibility surfaces, and the launch path touches most of them.

The profile layer is the broadest. [`Profile`](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/profile/mod.rs:1438) now includes `extends`, `packs`, `binary`, and `command_args`, and the latest merged change at head is specifically about profile-level target binaries. Backward compatibility therefore matters at both the schema and merge-behavior level. The inheritance resolver is bounded, cycle-checked, and left-to-right deterministic [profile/mod.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/profile/mod.rs:2236).

Network policy is another blast-radius boundary. [`network-policy.json` is loaded into groups, profiles, and credentials](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/network_policy.rs:17); groups are flattened and deduplicated [network_policy.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/network_policy.rs:136), and custom credentials override built-ins [network_policy.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/network_policy.rs:172). A mistake here changes what the proxy will authorize and what phantom-token routes the child will see.

The parent-side runtime also owns the operator-visible evidence. Session creation, attachability, audit, and rollback all live in the supervisor boundary [supervised_runtime.rs](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/supervised_runtime.rs:153). If that path misbehaves in production, the operator notices through session files, audit records, diagnostic footers, or a run that refuses to start. There is no external control plane or telemetry backend to catch it for you.

Ownership at three a.m. is effectively the `nono-cli` maintainers, because every high-blast-radius concern converges there: profiles, launch plans, platform downgrades, trust scanning, audit, rollback, sessions, and the proxy bootstrap. The library is narrower and cleaner; the command-line runtime carries the operational burden.

## 7. Verdict inputs

- **Disposition** — approve the architecture, with caveats. The central seam is coherent: a policy-free primitive in [the core library](/Users/belser/ventures/arch-repos/nono/crates/nono/src/lib.rs:8), policy compilation and operator ergonomics in [the command-line runtime](/Users/belser/ventures/arch-repos/nono/crates/nono-cli/src/command_runtime.rs:78), and explicit parent-side trust boundaries in [the security model](/Users/belser/ventures/arch-repos/nono/docs/cli/internals/security-model.mdx:24). The code matches the doctrine.
- **The single biggest residual risk** — the proxy and trusted parent boundary are the largest things you still have to trust. The docs are honest about that: the proxy runs in the unsandboxed parent, holds real credentials, and authenticates requests with a 256-bit session token [security-model.mdx](/Users/belser/ventures/arch-repos/nono/docs/cli/internals/security-model.mdx:348). If that boundary fails, the failure is credential exposure, not a neat contained denial.
- **What I would watch** — first, authoring pressure: the system is safest when profiles stay narrow, and least safe when users widen them until they are theatre. Second, platform skew: Landlock, Seatbelt, native Linux, macOS, and W-S-L two all have materially different enforcement floors. Third, launch-path creep: the newest merge at head extended profiles again, which is reasonable, but it keeps the highest-blast-radius surface active.
