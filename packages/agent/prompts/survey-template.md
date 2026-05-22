# Survey template — Layer 1 of depth enforcement

Fill this in *before* authoring `films/<id>.json`. A film cannot have depth the
survey never found. Write the completed survey to `analysis/<id>.md`. Every
section is mandatory; "the source does not reveal this" is a legitimate
answer — silent omission is not.

---

## 1. Triage  *(PR mode — the most important section)*

Rank the diff. What is **load-bearing** (the consequential logic) versus
**mechanical** (renames, generated code, lockfiles, test scaffolding)? State
the cut line explicitly: which files the film will interrogate, and which it
will name and set aside. A 60-file agent PR gets a film *because* a human
cannot trial this themselves — so the triage is the review.

## 2. What it is / why it exists

The change or the system, in two or three sentences. For a PR: why this, why
now, why this *shape*.

## 3. Hard parts

- **Failure & partial failure** — for every dependency and every hop: what
  happens when it is slow, errors, or disappears mid-operation? Fail open or
  closed? Name the single most likely 3am page.
- **Delivery / ordering / consistency** — name the guarantee with the real
  words: at-most-once / at-least-once / exactly-once; ordered or not; strongly
  or eventually consistent; idempotent or not.
- **Concurrency & contention** — the serialization points; what is concurrent
  vs sequential; which inputs *cannot* be back-pressured.
- **State & invariants** — every piece of mutable/persistent state, what
  invariant must hold, what invalidates it.
- **At least one real number** — Big-O on the hot path, a latency, a hard cap,
  quorum math. A review without a number is a brochure.

## 4. The alternative not taken

Name at least one **rejected design** and say why the chosen one wins, and
what it costs. "chose X over Y; X costs Z." If there is no road not taken, the
design was never reviewed.

## 5. Do the tests prove the claimed behavior

Point at the *specific* behavior the change claims and ask: is there a test
that would fail if it regressed? Naming that tests exist is worth nothing.
Treat "tests rewritten alongside the change they protect" as a yellow flag.

## 6. Blast radius

Wire formats, cache versions, ABIs, schemas, public API: does it round-trip
old and new — including a *forward* version-skew read? How would the on-call
engineer know it misbehaved (a metric, a log, nothing)? Rollback cost. Who
owns this at 3am.

## 7. Verdict inputs

- **Disposition** — approve / approve-with-caveats / needs-work, and why.
- **The single biggest residual risk** — even on a clean change.
- **What you would watch** post-merge, or what you would want changed first.
