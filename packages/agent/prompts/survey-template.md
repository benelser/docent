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

## § 1.5 The premise  *(architecture mode — mandatory)*

What does this system claim about the world? What is its bet? One short
paragraph. State the claim the system would lose its reason to exist without —
not what it does, but what it asserts. ("Schedulers should re-decide at
runtime, not at admission." / "The replica is a file, not a service.")

## § 1.6 The novelty  *(architecture mode — mandatory)*

What does this system do that prior systems don't? Where does it draw a new
line? **One sentence — the line itself, not the consequences of it.** Not
"this system is faster" (a consequence) but "this system makes the scheduling
decision at runtime rather than at admission time" (the line). If the novelty
cannot be stated as a *line drawn somewhere a prior system did not draw it*,
the system has no novelty and the film has no argument.

## § 1.7 Prior and similar works  *(architecture mode — mandatory)*

Name **2 to 4 systems** that occupy similar terrain. For each, give:

- **Name** — the real name (no "older systems" or "traditional approaches").
- **Year or version context** — when it appeared, or the version you are
  reading against (e.g. "Mesos, 2009"; "Litestream v0.3, 2022").
- **The dimensional trade-off that distinguishes it from the subject.** Not
  "X is better" — "X traded the timestamp-correctness for the concurrency."
  Each system should differ on at least one of the **2-4 trade-off
  dimensions** you will compare on; pick dimensions that are *choices the
  field has made differently* (storage layout, when the decision is made,
  what the unit of replication is), never qualities ("speed", "ease of use").
- **One of the dimensions is the novelty dimension** — the row the film will
  argue from, the one carrying § 1.6. Mark it.

The film's Prior Art scene reads directly from this section. A survey that
lists components without naming a lineage will not author a Prior Art scene;
a film without a Prior Art scene cannot pass AR validation.

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
- **At least one real number, and every number does work** — Big-O on the hot
  path, a latency, a hard cap, quorum math, a benchmark gap. State, for each
  number you will use, the *claim it pressures* or the *mechanism it carries*.
  A number that only decorates (an impressive total cited as atmosphere, a
  count repeated from the source without a load-bearing role) is rejected. A
  review without a number is a brochure; a review where the numbers only set
  the mood is a slide deck.

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

## 6.5 The landscape — when the argument is *placement*

If the subject's argument places N alternatives on a 2-D trade-off plane
(cost vs value, simplicity vs power, latency vs throughput) — the classic
tool-survey shape — reach for **`landscape`**. Name the two axes BEFORE
plotting; the axes are the argument, the markers prove it. A landscape on
"simplicity vs simplicity" is a category error; one whose subjects cluster
is a brochure not a survey.

Each axis is a trade-off, not a quantity: a `lowLabel` phrase at the min
end, a `highLabel` phrase at the max end. Subjects sit at normalized
{x, y} ∈ [0..1]². 2-8 subjects per scene; each placement must follow from a
property the survey established (positions are argued, not asserted). Optional
quadrant labels (TL/TR/BL/BR) name the four cells when they are themselves
load-bearing — "fast & expensive" / "slow & cheap" / etc.

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
