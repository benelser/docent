# Depth Review — Architecture-Review Films (docent)

Auditor's note: this reviews the *depth* of the four architecture-review specs
(`codex`, `rig`, `vector`, `kubernetes`). The question is not "is it accurate" —
it is — but "does it interrogate the system the way a distinguished engineer
would." It does not. What follows is candid and specific.

---

## 1. Verdict

These films are a **competent, well-written surface tour — and they sit a full
tier below best-in-class deep systems analysis.** They are accurate, the prose is
disciplined, and the box-and-arrow models are clean. But every one of them
narrates the *happy path and only the happy path*. They describe what each
component *is* and how a request flows *when nothing goes wrong*. A deep
architecture review is defined by the opposite instinct: it spends its time at
the edges — partial failure, contention, ordering, back-pressure, the numbers,
and above all the *trade-offs the designers chose and the alternatives they
rejected*. None of the four films names a single rejected alternative, quantifies
a single limit, or describes a single failure mode beyond the reassuring
gestures ("safe by default", "never lost"). The films even *raise* the hard
topics — Vector's `topology` scene is literally titled "Buffers, backpressure,
acknowledgement", Kubernetes has a whole `reconcile` scene — and then resolve
them with a comforting sentence instead of an interrogation. The result reads
like high-quality marketing-grade developer education, not an architecture
review. A reviewer who watched these would learn the *shape* of each system and
nothing about *how it behaves under stress, where it breaks, or what it cost to
build it this way* — which is the entire job of the review.

The single biggest tell: a viewer finishes any of these films unable to answer
"what would page me at 3am, and why." That is the bar, and it is not met.

---

## 2. Specific gaps

Cited by `film / beat-id`. For each: what the narration says, and what a deep
analysis would have said instead.

### codex / loop-4 — the orchestrator
> *"It is the single place for approvals, for selecting a sandbox, and for
> retrying when that sandbox is too tight. Every tool call is gated here."*

This is the most security-critical chokepoint in the entire system and the film
treats it as a routing detail. A deep analysis would ask: **what is the trust
model of the approval itself?** Approvals are TOCTOU-shaped — the command is
approved as a string, then executed; does anything prevent the model from
getting `rm -rf` past a human who approved `rm -rf ./build`? What is the
*granularity* (per-command, per-session, "always allow")? Is the retry-on-denial
loop bounded — can a model burn the user down by repeatedly requesting
escalation? Is approval state per-turn or sticky, and what invalidates it? The
orchestrator is also a *serialization point*: are tool calls within a turn
concurrent or strictly sequential, and if the model emits three `apply_patch`
calls, what orders them and what happens on partial failure of call 2 of 3?

### codex / sandbox-4 — escalation on denial
> *"When the policy is too tight, the orchestrator does not simply fail. It asks
> you, and on your approval, retries the command under a wider sandbox. Safe by
> default; escalated only with consent."*

This is the film's emotional climax ("safe by default") and it is precisely
where a reviewer must be most skeptical. Unasked: **the sandbox is not a security
boundary against the model — it is a guardrail against mistakes.** Seatbelt
profiles, Landlock, and bubblewrap have materially *different* enforcement
strength and *different escape surfaces*; the film flattens three unequal
mechanisms into one reassuring box. What about network access — is it sandboxed
at all, or is exfiltration via an allowed `curl` simply out of scope? What
happens on a platform with *no* sandbox available — does it fail closed or fall
back to `danger-full-access`? "Safe by default" is an assertion the film should
have *stress-tested on screen*, not delivered as a closing line.

### codex / turn-5 — the rollout file
> *"Every event along the way is written to a rollout file — the conversation,
> saved and replayable."*

Mutable persistent state introduced in one sentence at the very end. Deep
questions: is the rollout write **synchronous on the turn's hot path** (latency
cost per event) or buffered (data loss on crash)? Is it append-only — and
therefore safe under concurrent sessions — or can two `codex` processes in the
same repo corrupt it? "Replayable" implies determinism: replaying re-runs tool
calls against a *changed* filesystem and a *non-deterministic* model — so what
does replay actually reconstruct, and what are its guarantees? This is the one
piece of durable state in Codex and it gets less attention than the npm
launcher.

### rig / providers-4 — "swapping GPT for Claude is a one-line change"
> *"So swapping GPT for Claude is a one-line change. The trait is the seam; the
> rest of your application does not move."*

This is the film's headline claim and it is **the most important place a deep
review would push back.** A uniform trait is a *leaky abstraction* over
providers that genuinely differ: tool-calling formats, system-prompt semantics,
token limits, streaming event shapes, rate-limit behavior, structured-output
support. The interesting architectural content is exactly what the trait
*cannot* hide and what Rig does about it — least-common-denominator API, or
provider-specific escape hatches? What does the trait cost? "One-line change" is
the marketing claim; "here is what leaks through the seam and how Rig copes" is
the review.

### rig / pipelines-1 / pipelines-4 — "no runtime underneath" / "no scheduler beneath it"
> *"built from idiomatic Rust traits, with no runtime underneath … a directed
> graph of operations, type-checked end to end, with no scheduler beneath it."*

The film repeats "no runtime / no scheduler" as if it were unambiguously a win.
A deep analysis names the **trade-off**: Airflow and Dagster have a runtime *for
reasons* — retries, persistence, observability, resuming a half-finished DAG,
back-pressure between stages. Rig's compile-time DAG gives up all of that. If a
`prompt` op fails on node 7 of a 10-node pipeline, what happens? Is there
retry/checkpoint, or does the whole `await` just return an error and lose the
work? `try_op.rs` and `parallel.rs` exist in the tree (per the survey) and the
film never mentions error handling or concurrency in pipelines at all. "No
runtime" is a choice with a bill attached; the film collects only the upside.

### rig / flow-2 and flow-6 — the agent loop
> *"assembles the real request … and streams it to the model" … "That
> observation goes back to the model — and now the loop is visible."*

The agent loop is shown as a clean 8-message ladder where the model always
behaves. Missing: **the loop is unbounded and the model is adversarial-by-
accident.** What caps iteration count — what stops an infinite reason→tool→
reason cycle? What happens when assembled context (preamble + tools + RAG +
growing tool results) exceeds the model's context window — truncation, error,
silent drop of earliest turns? A tool that throws — is the error surfaced to the
model as an observation (so it can recover) or does it abort the turn? These are
the questions that decide whether the agent is usable in production.

### vector / topology-3 — back-pressure
> *"If a sink slows down, its buffer fills, and the slowdown propagates upstream
> — Vector slows the source, rather than dropping data or exhausting memory."*

This is the best beat in the whole set — and it *still* stops one question
short. Back-pressure propagating to the source is only benign if the source
*can* be slowed. A file source can; **a UDP syslog source or a scraped metrics
endpoint cannot** — back-pressure there means dropped datagrams or missed scrapes,
i.e. silent data loss at the very edge the film promised was safe. And the
disk-buffer mode has its own failure surface: what happens when the *disk* fills?
A deep review draws the distinction between back-pressure-able and
non-back-pressure-able sources explicitly, because that distinction is the whole
story of whether you lose data.

### vector / topology-4 and flow-6 — end-to-end acks / "never lost"
> *"a crash mid-pipeline does not silently lose events" … "Crash anywhere in the
> middle, and the event is simply read again — never lost, never silently
> dropped."*

"Never lost" is stated twice and is **half the truth**. Re-reading on crash is
*at-least-once* delivery, which means **duplicates** — and the film never says
the word. The unasked questions: are sinks idempotent, or does a downstream
Elasticsearch now have double-counted events? Does the disk buffer give
true durability or only best-effort (is the write `fsync`'d)? End-to-end acks
also cost latency and memory — the source pins every in-flight record until its
ack returns; how deep can that get, and what is the memory ceiling? A delivery-
guarantees scene that never utters "at-least-once", "exactly-once", "idempotent",
or "duplicate" has not engaged its own topic.

### vector / vrl-4 — "compiled, not interpreted… never a 3am surprise"
> *"VRL is compiled, not interpreted. A bad program is a startup error, never a
> three A-M surprise."*

Compilation catches *type* errors. It does **not** catch the 3am surprises that
actually happen: a `parse_json!` that aborts on one malformed event in a million,
an unbounded field that blows up per-event memory, a regex that is O(n²) on a
hostile input. VRL runs **once per event on the hottest path in the system** —
the review should be asking about per-event CPU cost and what a `!`-abort does to
*that one event* (dropped? routed to a dead-letter? halts the transform?). The
film mentions the `!` operator and then claims safety; it never says what the
abort actually *does* at runtime.

### kubernetes / cp-3 — etcd
> *"Behind it, etcd — a consistent, distributed key-value store … Lose etcd, and
> you have lost the cluster."*

"Consistent, distributed" is doing enormous unexamined work. etcd is a **Raft**
cluster — that is the single most important distributed-systems fact in
Kubernetes and the film skips it. Deep content: it needs a **quorum** (majority
of an odd-numbered set), so it tolerates exactly `(n-1)/2` failures and a
partition takes the minority side *read-and-write unavailable*; the whole control
plane's availability is therefore bounded by etcd's. It has a hard practical
**database size limit** (single-digit GB) and watch/range performance that is the
real scaling ceiling of a cluster. "Lose etcd and you've lost the cluster" is
true but shallow — the interesting part is the *gradient* of degradation before
you lose it.

### kubernetes / cp-2 and recap-2 — "every other component is stateless"
> *"every other component is stateless around it."*

Repeated as a clean idea; it is **an oversimplification that hides the real
mechanism.** Controllers and the scheduler keep substantial *in-memory* state —
informer caches, the watch-driven local mirror of cluster state. They are
"stateless" only in that the cache is *reconstructible*, not that it does not
exist. That cache is the entire performance story: without it every reconcile
would hammer the API server. And caches go **stale** — a controller acts on a
slightly old view, which is *why* the API server uses optimistic concurrency
(`resourceVersion`) and conflicting writes are retried. The film never mentions
informers, watch cache, resourceVersion, or optimistic concurrency — the actual
machinery that makes the "stateless" claim survivable.

### kubernetes / rc-5 and flow-6 — reconciliation / "the system simply converges"
> *"the very next turn of the loop pulls it back. No one is paged; the system
> simply converges."*

Convergence is presented as guaranteed. A deep review knows reconciliation can
**fail to converge**: a controller can thrash (two controllers fighting over one
object), a reconcile can wedge on a permanent error and retry forever with
exponential back-off, a pod can `CrashLoopBackOff` so reality *never* reaches
spec. "Watch, diff, act" also elides **level- vs edge-triggered** design (a core,
deliberate Kubernetes decision — controllers re-list on resync precisely because
watch events can be missed). And `flow-6` says "pull image, start container" as
one cheerful step — image-pull failures, registry rate limits, and admission/
quota rejection are exactly where `kubectl apply` actually goes wrong in
production. The self-healing story is real but it is *bounded*, and the bounds
are the review.

### All four / every `recap` scene
Each recap is "N ideas" of pure affirmation: "small traits, composed well", "a
pipeline you can actually trust with your data", "the discipline that makes it
safe". A best-in-class review's closing should carry the **honest scorecard** —
where the design is strong, where it is fragile, what it traded away, when you
should *not* pick it. Ending on unqualified praise is the clearest single signal
these are tours, not reviews.

---

## 3. A depth rubric — the questions the next spec MUST answer

Not a generic checklist. These are the specific questions an architecture-review
film has to put on screen to clear the bar. If a film cannot answer one, that is
itself the finding and should be narrated as such ("the source does not say —
and that is a gap").

**A. Failure & partial failure.** For every dependency and every hop drawn on a
diagram: what happens when it is slow, returns an error, or disappears mid-
operation? Does the system fail *open* or *closed*? Pick the single most likely
3am page and trace it. *If a film draws an arrow, it owes the viewer "and when
that arrow fails…".*

**B. Delivery, ordering, consistency.** Name the guarantee out loud using the
real words: at-most-once / at-least-once / exactly-once; ordered or unordered;
strongly / eventually consistent; idempotent or not. If the answer is
at-least-once, the film must say "duplicates" and say how downstream copes.

**C. Concurrency & contention.** Where is the serialization point? What is
concurrent vs sequential? Where are the locks, queues, and caches — and what is
their behavior when full? Back-pressure: who slows down, and which inputs
*cannot* be slowed (and therefore drop data)?

**D. State & its invariants.** Point at every piece of mutable and persistent
state. What invariant must hold? What invalidates or migrates it? Is a write on
the hot path? What happens to that state on crash, on concurrent access, on
restart? "Stateless" claims must be defended or retracted.

**E. The numbers.** At least one real quantity per film: hot-path Big-O, a
latency or throughput figure, a memory ceiling, a hard limit (max object size,
max replicas, context-window cap, quorum math). A review without a number is a
brochure.

**F. Trust & security boundaries.** Draw the boundary explicitly. Who is trusted,
who is not, what crosses it. What is *in scope* for the threat model and what is
*explicitly out* (and is the viewer told it is out?). For anything that runs
untrusted input, name the actual escape surface.

**G. Trade-offs and rejected alternatives — mandatory.** Every film must, at
least once, say: "the designers chose X over Y; X costs Z." No film currently
does this once. This is the line between a tour and a review. "No runtime",
"one trait", "one front door", "one Event type" are all *choices with bills* —
name the bill.

A film should be allowed to *not know* an answer. "The source doesn't reveal the
buffer's fsync behavior" is a legitimate, honest narration beat. Silent omission
is not.

---

## 4. Structural suggestions

The current 6–8 scene shape is fine as a skeleton; the depth has to come from
*what the scenes do*, plus targeted additions.

**1. Add a mandatory "Failure modes & trade-offs" scene before the recap.** Every
film, no exceptions. This is the single highest-leverage change. It is where
rubric items A, B, C, G land. Diagram type works: the happy-path diagram from
earlier, re-drawn with the edges that *break* highlighted and a failure narrated
per edge. For Vector this is the back-pressure-able vs not distinction; for
Kubernetes, etcd quorum loss and reconcile thrash; for Codex, the trust model of
approvals; for Rig, what leaks through the provider seam.

**2. Make the recap honest.** Replace "N ideas" affirmation with a scorecard:
2–3 genuine strengths, 2–3 real fragilities or limits, and one sentence on "when
*not* to choose this." A review that cannot name a weakness was not a review.

**3. New scene type: `tradeoff` (or repurpose `diagram`).** A two-column "chosen
vs rejected" visual — the decision on the left, the alternative on the right,
the cost of each underneath. This forces rubric item G structurally instead of
hoping the narration gets there. Cheap to build, and it is the most review-shaped
artifact the tool could produce.

**4. Use the `sequence` type for a *failure* path, not only the happy path.**
The current sequence scenes (`rig/flow`, `vector/flow`, `kubernetes/flow`) are
all blue-sky. A second, short sequence — "the same flow, but the sink is down" /
"but the tool throws" / "but etcd has lost quorum" — would teach more than the
happy path did. The message kinds already support it; add an `error` kind.

**5. Require one quantified beat per film.** Enforce rubric item E at the spec
level: a film without a single number does not pass. This need not be a new
scene — one beat in an existing diagram, with the real figure on a node's `sub`
field.

**6. Length: modestly longer, and reallocated.** These run ~6–8 scenes; going to
8–10 is fine, but the bigger fix is *reallocation*. Codex spends two scenes
(`overview`, `surfaces`) on "core has four front doors" — a single idea — and
zero scenes on failure. Cut the redundant overview, spend the budget on the
edges. Depth per minute matters more than total minutes.

**7. The survey notes (`analysis/*.md`) should carry a "hard parts" section.**
Right now the surveys are inventories — files, crates, the happy-path turn. They
should explicitly list the failure modes, limits, and trade-offs found in the
source, so the film author is *handed* the depth material instead of having to
rediscover it. The survey is where rubric items A–G should first be answered;
the film just dramatizes them. Notably the surveys themselves never mention
Raft, idempotency, context-window limits, or informer caches — the gap starts
upstream of the film.

---

## Summary

**Verdict:** A full tier below best-in-class. Accurate, polished, well-narrated —
and exclusively happy-path. No film names a rejected alternative, quantifies a
limit, or traces a failure. They teach the *shape* of each system and nothing
about how it behaves under stress.

**Top 5 gaps:**
1. **`codex / sandbox-4`** — "safe by default" asserted, never stress-tested;
   three unequal sandbox mechanisms flattened into one box; network/exfiltration
   and no-sandbox-available cases ignored.
2. **`vector / flow-6` & `topology-4`** — "never lost" stated twice; the words
   "at-least-once", "duplicate", and "idempotent" never appear. The actual
   delivery guarantee is unnamed.
3. **`rig / providers-4`** — "swapping GPT for Claude is a one-line change" is the
   headline marketing claim; the review owed the viewer "here is what leaks
   through the trait seam and what it costs."
4. **`kubernetes / cp-3` & `cp-2`** — etcd's Raft/quorum model — the most
   important distributed-systems fact in the system — is skipped; "every other
   component is stateless" hides informer caches, staleness, and optimistic
   concurrency.
5. **No film, anywhere, names a trade-off it chose or an alternative it
   rejected.** "No runtime", "one front door", "one Event type" are choices with
   bills; the films collect only the upside. Plus: zero quantified limits across
   all four, and every recap closes on unqualified praise.

**File written:** `/Users/belser/ventures/archcast/analysis/depth-review-architecture.md`
