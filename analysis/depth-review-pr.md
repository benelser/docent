# Depth Review — Docent PR-Review Films

Audit of five `pr review` films against a principal-engineer review bar.
Films: `kubernetes-pr`, `nono-pr`, `rig-pr`, `vector-pr`, `bun-pr`.

---

## 1. Verdict

These films are **excellent technical explainers and roughly mid-senior-level
reviews — but they are not yet principal-grade reviews.** They consistently
nail *why the change exists*, *what the change is*, and *how the mechanism
works*, and they are unusually good at one slice of real review judgment: the
"left the legacy path untouched / additive / surgical" backward-compatibility
argument shows up in every film and is genuinely well-reasoned. The narration
is precise, the diffs are well-chosen, and the survey notes confirm the films
are drawn from real, deeper analysis.

The shortfall is singular and consistent: **the films explain and admire; they
do not interrogate.** A principal review is adversarial in a constructive way —
it names what could go wrong, what the author did *not* do, what alternative
designs were on the table, and what you would watch in production after merge.
These films do almost none of that. The "verdict" recap is the clearest
symptom: in all five it *restates the four beats* and appends a complimentary
adjective ("a textbook performance refactor", "the kind a reviewer is glad to
approve", "earns trust rather than spending it"). That is a summary with a
sticker, not a judgment. A real verdict names residual risk, says what it would
want changed or followed up, and states what it would monitor. None of the five
do. The films also systematically under-engage **tests** (mentioned, never
scrutinized — do they *prove* the behavior?), **failure modes at scale / on
weird inputs**, **observability & operability**, **rollback**, and **ownership
after merge**. Five of those dimensions are absent or glancing across the board.
Closing that gap — primarily by making the verdict *adjudicate* and by adding
one tests/operability beat — is what would move these from "great explainer"
to "principal review."

---

## 2. Specific gaps (by scene/beat)

### The verdict never judges — it summarizes

- **`kubernetes-pr / recap-4`**, **`nono-pr / recap-4`**, **`rig-pr / recap-4`**,
  **`vector-pr / recap-4`**, **`bun-pr / recap-4`** — all five close with praise,
  not a judgment. "A textbook performance refactor." "The kind a reviewer is
  glad to approve." "Earns trust rather than spending it." "Small in lines;
  precise in every one of them." A principal reviewer's verdict has a different
  shape: *Approve, with these caveats / I'd want X before merge / here's what
  I'd watch in prod / here's who owns the follow-up.* Even on a clean PR the
  verdict should name the **one thing that could still bite** and **what you'd
  watch**. Concretely:
  - kubernetes: "Approve. The risk here isn't correctness, it's that the new
    `keyIndex` map must stay perfectly in sync with `queue` through every Swap —
    a class of bug the old design made impossible. I'd want the table-driven
    tests to include an invariant check that `keyIndex` agrees with `queue`
    after every mutation, and I'd watch scheduler p99 on the 5k-node job, not
    just the microbenchmark."
  - nono: "Approve with reservations. This is a +3,800-line security-critical
    change that *adds an MITM capability by design*. The thing I'd want before
    merge is an explicit answer to: what is the audit story when the cert cache
    is poisoned or the session CA outlives the session? And who owns
    `tls_intercept` at 3am?"

### Tests are named but never scrutinized

- **`kubernetes-pr / proof-2..proof-4`** — the "proof" scene is entirely
  *benchmarks*. The survey notes (`kubernetes-pr.md` lines 96-100) say the test
  suite was "substantially rewritten and expanded into table-driven cases" —
  the film never asks the reviewer's actual question: *do the new tests prove
  the heap invariant still holds?* A 24-46% speedup proves it's faster; it does
  not prove it's correct. A principal reviewer treats "tests were rewritten in
  the same PR as the optimization" as a mild yellow flag (the safety net was
  changed at the same time as the thing it protects) and wants to see that the
  new tests still pin pop-order and the key/index invariant.
- **`vector-pr`** has *no tests beat at all*, despite the survey notes implying
  substantial behavioral surface (fan-out, ack refusal, schema merge). The
  single most review-worthy question — *is there a test that proves an
  acknowledgement is actually refused when a frame is dropped?* — is never
  asked. `ripple-1` asserts the behavior; nothing verifies the assertion is
  tested.
- **`bun-pr`** — survey notes cite "a 16-case test suite" (`bun-pr.md` line 82);
  the film mentions it nowhere. For a contextual-keyword change the reviewer
  wants to know the tests cover the *negative* cases: `import defer from "x"`,
  `import { defer } from "x"`, the escaped-`defer` spelling. `keyword-3`
  claims the raw-byte comparison guards against escapes — a test-backed claim
  the film leaves unverified.
- **`rig-pr / wiring-4`** asserts the fatal-load / best-effort-append asymmetry
  is "deliberate" — but never asks whether a test *exercises* a load failure
  and a append failure to prove the asymmetry is real and not aspirational.

### Failure modes at scale / weird inputs — under-explored

- **`nono-pr / flow-5`** — handles exactly one failure mode (cert pinning).
  Good, but a terminating-proxy MITM has a much larger weird-input surface that
  the film never raises: a malformed ClientHello, an SNI that doesn't match the
  CONNECT authority, TLS 1.3 0-RTT, an upstream that *itself* fails its
  handshake after the proxy already told the agent `200`, cert-cache unbounded
  growth under an agent that visits thousands of hostnames. A principal review
  of a TLS interceptor lives in these cases.
- **`vector-pr / core-3`** — "drives the codec to end-of-input." What happens on
  a partially-buffered frame, a 2GB HEC body, a decoder that never reaches EOF?
  The fan-out (one envelope → many events) is a memory-amplification vector and
  the film never names it.
- **`kubernetes-pr / hotpath-4`** — "the standard library's heap never passes an
  out-of-range index, so guarding against it was dead code." This is stated as
  settled fact. A principal reviewer flags it as the *one place the PR traded
  defense-in-depth for speed*: it is now load-bearing that *every* caller goes
  through `container/heap`. If a future caller indexes `Less` directly, the old
  code returned `false`; the new code panics. That is a real, if small,
  durability tradeoff and deserves a sentence.
- **`bun-pr / wire-4`** — the cache version bump invalidates old caches "cleanly."
  The deeper question: what about a *forward* mismatch — a v21 cache read by an
  older Bun? `bun-pr.md` line 66 notes the deserializer validates phase bytes
  against untrusted on-disk data; that's a genuine safety property the film
  drops entirely.

### Observability / operability — nearly absent

- Across all five films, **only `nono-pr` engages observability** (the audit
  events). None of the others ask: when this misbehaves in prod, *how would the
  on-call engineer know?* `vector-pr`'s dropped-frame path (`ripple-1`) is the
  sharpest example — refusing an ack is correct, but is there a metric/log so an
  operator sees decode failures climbing? `rig-pr / wiring-4`'s best-effort
  append "only logs a warning" — a warning no one alerts on means silent memory
  loss; a principal reviewer asks for a counter.

### Alternatives / design space — rarely surfaced

- **`rig-pr / contract-4`** explains *that* the trait returns a boxed future for
  WASM object-safety, but never weighs the alternative (`async-trait`, generics)
  or the cost (allocation per call). **`bun-pr`** never asks why phase is a
  parallel `Vec<ModulePhase>` rather than folded into `FetchParameters`.
  **`kubernetes-pr`** never asks whether an open-addressed index or a generational
  slab was considered. A principal review names the road not taken and says why
  the chosen road is right.

### PR hygiene / reviewability — unaddressed

- **`nono-pr`** is +3,836 / −463 across 28 files and introduces 4 dependencies,
  a new subsystem, an audit-schema change, a sandbox-policy change, and a
  shared-forwarding refactor. *Software Engineering at Google*'s "small CLs"
  norm would ask out loud whether this should have been **split** (the
  `forward.rs` refactor is mechanically separable and could have landed first).
  The film treats the 28-file size as a neutral fact in `title-3`. A principal
  reviewer comments on whether the PR itself was easy to review.

### Ownership / deploy / rollback — absent everywhere

- No film names who owns the new surface after merge, or how you'd roll back.
  `nono-pr` (a security capability) and `bun-pr` (a cache-format bump — note a
  rollback re-invalidates caches again) are the two where this matters most,
  and both are silent.

---

## 3. A depth rubric for principal-grade PR-review films

Not a checklist to tick — a set of *questions the narration must visibly wrestle
with*. A film is principal-grade when a viewer can hear the reviewer **reasoning**,
including reaching conclusions that are uncomfortable for the PR.

1. **Why this, why now, why this shape.** Beyond "what it does" — does the film
   establish that the *problem* is real and worth solving, and does it name at
   least one **alternative design** and say why the chosen one wins? If there is
   no road not taken, the design was never actually reviewed.

2. **Where it could be wrong.** Every change has a failure surface. The film
   must walk at least one **weird input** and one **at-scale** failure mode, and
   say whether the change handles it, degrades, or breaks. "Surgical / additive /
   legacy path untouched" is a *correctness argument* and is welcome — but it is
   not a substitute for asking what happens on the path the change *does* touch.

3. **Do the tests prove the intended behavior.** Naming that tests exist is
   worth nothing. The film must point at the *specific* behavior the PR claims
   and ask: is there a test that would fail if that behavior regressed? Treat
   "tests rewritten alongside the change they protect" as a yellow flag worth a
   sentence.

4. **How you'd know in production.** If this misbehaves after merge, what does
   the on-call engineer see — a metric, a log, an audit event, nothing? A
   best-effort path that "only warns" is a silent-failure path unless someone
   can observe it. Name the observability, or name its absence as a gap.

5. **Data-model and compatibility blast radius.** Wire formats, cache versions,
   ABIs, audit schemas, public API: does the change round-trip old and new, and
   what happens on a *version-skew* read (forward, not just backward)?

6. **Operability: deploy, rollback, ownership.** Can this be turned off? Does
   rollback have a cost (e.g. re-invalidating a cache, or leaving a half-migrated
   schema)? Who owns this code at 3am, and is that team set up to?

7. **The PR as an artifact.** Was *this PR* easy to review — right size, one
   idea, mechanical refactors separated from behavior change? A reviewer who
   never comments on the reviewability of the CL is not doing the *Software
   Engineering at Google* job.

8. **A verdict that adjudicates.** The closing scene must do three things a
   summary cannot: (a) state a **disposition** (approve / approve-with-caveats /
   needs-work) and *why*; (b) name the **single biggest residual risk** even on
   a clean PR; (c) name **one thing to watch or follow up** post-merge. If the
   recap could be swapped for any other PR's recap by changing nouns, it is not
   a verdict.

A film does not need a dedicated scene for all eight — but a principal-grade
film should *visibly engage* at least items 2, 3, 4, and 8, every time. The
current films reliably hit only item 5 (compatibility) and half of item 1.

---

## 4. Structural suggestions

**A. Re-cut the verdict from "summary" to "judgment."** Keep the recap scene's
four points (they work as a memory aid), but change `recap-4`'s narration in
every film from a complimentary restatement to an actual ruling. Template for
the final beat: *"The disposition: [approve / approve-with-caveats]. The real
risk is [X — the one thing that could still bite]. Before I'd be fully
comfortable I'd want [Y]. And in production I'd watch [Z]."* This single change
closes the largest gap and requires no new scenes. Optionally add a fifth recap
point that is explicitly the risk/watch item, visually distinct (e.g. a rose
accent) from the four "what it does" points.

**B. Add a "Tests & failure modes" scene** between the mechanism scene and the
ripple scene — type `code` or `diff` showing an actual test case, or `sequence`
showing a failure path. Its job is item 3 + item 2 of the rubric: take the PR's
central behavioral claim and show the test that pins it (or note that no such
test exists). For `vector-pr` this is the ack-refusal test; for `bun-pr` the
negative-parse cases; for `rig-pr` a forced load failure; for `kubernetes-pr` the
key/index invariant check. This scene is where the film earns the word "review."

**C. Make the ripple scene carry one explicit "what could go wrong" node.** The
ripple diagrams already have ~6 nodes; today they are all "things the PR
correctly handles." Mandate that **at least one node is a named risk or open
question** the PR did *not* fully resolve — rendered in a warning accent (rose)
and spoken as a reservation, not a reassurance. e.g. nono: "Cert-cache growth —
unbounded under a hostile agent?"; vector: "Memory amplification — one envelope,
many events"; bun: "Forward skew — a v21 cache read by older Bun."

**D. Add an operability beat to the title or context scene.** One sentence
naming the deploy/rollback story and the owning team. Cheap, and it forces the
question to be answered. For changes with a real rollback cost (bun's cache bump,
nono's security surface) it is essential.

**E. Add an "alternatives" beat to the design/redesign scene.** Where the film
presents *the* redesign (`kubernetes-pr / redesign`, `bun-pr / wire`), add one
beat: "Here is what was *not* done, and why." This converts a presentation of a
design into a *review* of a design.

**F. Allow a non-clean verdict.** All five PRs here are merged and genuinely
good, so all five films land on approval — but the *form* trains the tool to
always flatter. At least one film should demonstrate the tool can say "this is
the part I'd push back on" out loud. nono's PR size and the kubernetes
defense-in-depth tradeoff are honest, real footholds for that — use them.

---

### One-line summary of the five concrete moves

Re-cut every `recap-4` into a ruling; add a Tests-&-failure-modes scene; force
one risk node into each ripple diagram; add an operability/ownership sentence;
add an "alternatives" beat to the design scene. Together these turn an
admiring explainer into a principal-engineer review.
