# Survey template — Layer 1 of depth enforcement

Fill this in *before* authoring `films/<id>.json`. A film cannot have depth the
survey never found. Write the completed survey to `analysis/<id>.md`. Every
section is mandatory; "the source does not reveal this" is a legitimate
answer — silent omission is not.

---

## 0. Subsystem boundary  *(architecture mode — when a subsystem is named)*

`docent ar <repo> <subsystem>` passes a free-text subsystem name. Resolve it to
a concrete code boundary *before* surveying — that boundary is the film's scope.

- **Resolve the name to code, language-aware.** A subsystem maps to a unit the
  project already has. Use the repo's own build manifest to find the real
  units, never invent one:
  - *Go* — a package under `pkg/` or `internal/` (`scheduler` → `pkg/scheduler`)
  - *Rust* — a crate in the workspace (`Cargo.toml` members), or a module
  - *Python* — a package directory (an `__init__.py` tree)
  - *JS/TS* — a workspace package, or a top-level directory under `src/`
  - *a monorepo* — a top-level component directory
- **If the name is ambiguous**, list the candidate boundaries you found, pick
  the dominant one, and say why.
- **State the boundary explicitly**: the directory or package, the entry points
  into it, its public surface (what the rest of the system calls), and what is
  deliberately out of scope. Every node in the film falls inside that boundary
  or is a named neighbour at its edge.
- A subsystem film is still a full architecture review with a tighter frame.
  The depth bar does not relax: failure modes, a real number, a trade-off, an
  honest scorecard — all scoped to the subsystem.

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

- **Failure & partial failure — walk one weird-input and one at-scale case to
  break.** For every dependency and every hop: what happens when it is slow,
  errors, or disappears mid-operation? Fail open or closed? Name the single
  most likely 3am page. Then pick the single most likely *weird-input* case
  AND the single most likely *at-scale* case, and walk each through to the
  failure: the trigger, the cascade, the observable symptom, the recovery (or
  its absence). Gesturing at "could fail" or naming a metric without a failure
  mode is rejected.
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

**Cite by name.** For each test claim the film will make, name the specific
test by `path::function` (e.g. `pkg/scheduler/internal_test.go::TestPopOrder`).
"The tests verify it" is rejected — the survey records the named test, and the
spec must carry it through into the narration. A claim with no named
test-anchor is treated as unproven.

## 6. Blast radius

Wire formats, cache versions, ABIs, schemas, public API: does it round-trip
old and new — including a *forward* version-skew read? How would the on-call
engineer know it misbehaved (a metric, a log, nothing)? Rollback cost. Who
owns this at 3am.

## 7. Verdict inputs — the recap must *rule*, not restate

The film's last scene adjudicates; it never summarizes. The judge rejects a
recap whose lines are approving labels ("sound", "earned", "grounded") or a
restatement of the film's own claims. State the verdict by saying three
concrete things:

- **Disposition** — approve / approve-with-caveats / needs-work, and *why*.
- **The single biggest residual risk** — even on a clean change. Name the
  specific failure mode you would not be surprised to see in production.
- **The precise skepticism the viewer should carry** — what to actively doubt
  about this change, and the concrete thing they would watch post-merge to
  know whether the doubt is warranted.

A recap that does not produce all three is rejected — it is touring its own
film, not reviewing the change.
