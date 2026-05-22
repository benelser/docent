# nono PR #856 — TLS interception for L7-bearing CONNECT routes

- **PR:** #856 — `feat(proxy): add tls interception for l7-bearing connect routes`
- **URL:** https://github.com/always-further/nono/pull/856
- **Headline stat:** 28 files changed, +3,836 / -463. Closes issue #779.
- **Author:** lukehinds. State: MERGED.

## What it introduces / does

Before this PR, when a sandboxed agent opened an HTTPS `CONNECT` tunnel to a host
that `nono` had a credential/policy route for, the proxy could only see an opaque
encrypted pipe — so it returned `403` and forced the agent onto the plaintext
reverse-proxy path. This PR makes the proxy a *terminating* TLS endpoint for those
routes: it generates an ephemeral, in-memory Certificate Authority at startup,
mints per-hostname leaf certificates on demand, decrypts the inner HTTP/1.1
request, applies endpoint rules and credential injection, then re-encrypts and
forwards upstream over a real TLS connection. The agent is told to trust the
ephemeral CA via a layered trust bundle written to an owner-only file and exposed
through standard env vars (`SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, etc.). The net
effect: nono's L7 policy now reaches applications that use `CONNECT` tunnels and
previously bypassed all controls.

## What it touches

- **New `tls_intercept` subsystem** (`crates/nono-proxy/src/tls_intercept/`):
  - `ca.rs` — ephemeral ECDSA P-256 session CA; private key held in
    `Zeroizing<Vec<u8>>`, never written to disk.
  - `cert_cache.rs` — per-hostname leaf minting + cache; implements rustls'
    `ResolvesServerCert`.
  - `acceptor.rs` — builds the `rustls::ServerConfig` (HTTP/1.1-only ALPN).
  - `bundle.rs` — composes the three-layer trust bundle and writes it `0o400`.
  - `handle.rs` — the CONNECT-intercept entry point: terminates TLS, parses the
    inner request, selects a route, injects credentials, forwards.
  - `mod.rs` — module wiring and design-constraint documentation.
- **New shared `forward.rs` module** — common upstream-forwarding pipeline
  extracted from `external.rs` and `reverse.rs` so the intercept path and the
  reverse-proxy path converge on one wire-level implementation.
- **`route.rs`** — `LoadedRoute` gains `requires_intercept`,
  `requires_managed_credential`, `managed_auth_mechanism`, `managed_injection_mode`,
  all precomputed at load; new `lookup_by_upstream` / `has_intercept_route`.
- **`server.rs`** — `ProxyState` gains `cert_cache`; `ProxyHandle` gains
  `intercept_ca_path`, `route_diagnostics()`, a `Drop` impl for bundle cleanup;
  `CONNECT` dispatch rewritten into a three-case branch.
- **`crates/nono-cli/src/proxy_runtime.rs`** — picks a session dir under
  `~/.nono/sessions/`, reads the parent `SSL_CERT_FILE`, injects CA env vars, and
  grants the sandboxed child a read capability on the bundle.
- **`crates/nono/src/capability.rs`** — new `CapabilitySet::allow_file_mut`.
- **`crates/nono/src/sandbox/macos.rs`** + `undo/types.rs` — Seatbelt rule
  handling and new `audit` enum variants (`ProxyMode::ConnectIntercept`,
  `NetworkAuditDenialCategory::InterceptHandshakeFailed`, etc.).
- **`audit.rs`** — logging functions take a structured `EventContext`.
- **Docs/tests:** `docs/cli/internals/security-model.mdx`,
  `tests/integration/test_tls_intercept.sh`.

## The core change

Before — every `CONNECT` to a known route upstream was flatly rejected:

```rust
debug!("Blocked CONNECT to route upstream {} — use reverse proxy path instead", authority);
audit::log_denied(Some(&state.audit_log), audit::ProxyMode::Connect,
    host, port, "route upstream: CONNECT bypasses L7 filtering");
let response = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n";
stream.write_all(response.as_bytes()).await?;
return Ok(());
```

After — `CONNECT` to an intercept-eligible route, with a cert cache available,
is terminated and inspected instead of refused:

```rust
match (intercept_eligible, state.cert_cache.as_ref()) {
    (true, Some(cache)) => {
        token::validate_proxy_auth(&header_bytes, &state.session_token)?;
        tls_intercept::handle_intercept_connect(&mut stream, InterceptCtx {
            route_id, host: &host, port,
            cert_cache: Arc::clone(cache),
            /* route_store, credential_store, filter, audit_log, ... */
        }).await?;
    }
    // (true, None) / declarative route → existing 403; else → tunnel
}
```

The intercept handler answers `200 Connection Established`, then accepts an inner
TLS handshake whose leaf cert is minted live by the cert cache against the SNI
hostname. A central design constraint is **hard-fail on cert pinning**: if the
agent rejects the minted cert, the handshake fails, the connection is dropped, and
an `InterceptHandshakeFailed` audit event is recorded — the proxy never silently
degrades to a transparent tunnel for a route that asked for L7 enforcement.

## Ripple effects

- **New public API on `ProxyHandle`:** `intercept_ca_path()` and
  `route_diagnostics()`; consumed by the CLI.
- **Audit schema growth:** `audit::log_allowed/log_denied` now take a structured
  `EventContext` (touched call sites in `connect.rs`, `external.rs`, `reverse.rs`);
  new `ProxyMode::ConnectIntercept` and several `NetworkAuditDenialCategory`
  variants in `nono::undo`.
- **Child environment changes:** five CA-trust env vars are now set in the
  sandboxed child whenever interception is active — `SSL_CERT_FILE`,
  `REQUESTS_CA_BUNDLE`, `NODE_EXTRA_CA_CERTS`, `CURL_CA_BUNDLE`, `GIT_SSL_CAINFO`.
- **Sandbox policy interaction:** the bundle lives under `~/.nono`, which the
  protected-root deny rules cover; on macOS the grant must be emitted as
  action-matching `file-read-data`/`file-read-metadata` Seatbelt allows to win
  over the deny, while Linux uses a plain Landlock FS capability.
- **New dependencies:** `rcgen`, `zeroize`, `rustls-native-certs`, `time`
  (67 added lines in `Cargo.lock`).
- **Filesystem lifecycle:** a session dir `~/.nono/sessions/intercept-<pid>-<nanos>`
  is created `0o700`, the bundle written `0o400`, and both removed on
  `ProxyHandle::drop`.
- **Refactor risk:** `reverse.rs` shrank ~425 lines as forwarding logic moved into
  `forward.rs`; both the reverse path and the intercept path now share it.
- **Trust correctness:** the bundle layers parent `SSL_CERT_FILE` + system roots +
  ephemeral CA, so a corporate CA on the host is preserved rather than stripped by
  the env-var override; `bundle.rs` refuses to write a bundle with no roots at all.

## Why it matters

`CONNECT` tunnels were a hole in nono's threat model: any agent (or SDK) that chose
an HTTPS proxy tunnel instead of the reverse-proxy path could exfiltrate data or
use unmanaged credentials with zero policy enforcement and zero audit visibility.
This PR closes that hole by giving the proxy genuine L7 reach over TLS — extending
credential injection and endpoint filtering to the common case — while doing so
safely: the CA is ephemeral and memory-only, leaf and CA certs are short-lived, the
bundle is owner-locked, and cert pinning is honored as a hard failure rather than
quietly bypassed.

## Four beats

1. **Startup — mint the CA.** When at least one configured route requires L7
   visibility, the proxy generates an ephemeral ECDSA P-256 CA whose private key
   lives only in a zeroizing buffer, and writes a three-layer trust bundle
   (parent `SSL_CERT_FILE` + system roots + the new CA) to an owner-only file.
2. **Wire up the sandbox.** The CLI grants the child a read capability on the
   bundle file (action-specific Seatbelt rules on macOS, a Landlock FS cap on
   Linux) and injects `SSL_CERT_FILE`/`REQUESTS_CA_BUNDLE`/etc. so the agent
   trusts certificates the proxy will mint.
3. **Intercept the CONNECT.** An agent's `CONNECT api.example.com:443` to an
   intercept-eligible route is answered `200`, the proxy accepts an inner TLS
   handshake using a leaf certificate minted live for the SNI hostname, and
   decrypts the inner HTTP/1.1 request — or hard-fails the handshake and audits
   it if the agent pins certificates.
4. **Inspect, inject, forward.** The decrypted request is matched against the
   route's endpoint rules, the managed credential is injected, and the request
   is re-encrypted and forwarded upstream through the shared `forward` pipeline,
   emitting a `ConnectIntercept` audit event.
