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

## § 2.5 Style commitment  *(mandatory)*

Before authoring the spec, commit to a `{preset, intent}` style block — this
is the visual register the film renders in, and the agent author MUST pin it
on `films/<id>.json` as a top-level `"style"` field.

**Run the recommender** (rule-based; not an LLM call):

```bash
bun packages/engine/cli/docent.ts style recommend <id>
```

It reads this survey file (`analysis/<id>.md`) and prints a recommended
`{preset, intent}` plus a one-line rationale. Treat the recommendation as a
default; override it ONLY when you can name a specific survey finding the
recommender missed.

**Pin the commitment in the survey.** Write the chosen preset, the intent
block, and a ONE-LINE rationale here. The rationale must tie to a *specific
survey finding*, not a vague register adjective. Bad: "engineering preset
because this is a technical subject." Good: "engineering preset because the
load-bearing change is a comparator in `pkg/scheduler/internal/heap/heap.go`
and the film must read code at the function level."

Format:

```
preset:    <neutral | engineering | editorial | paper | executive | analytical>
intent:    {tone, audience, medium, density, theme, emphasis} — only the axes you commit to
rationale: <one line tying the choice to a finding in this survey>
```

Available presets:

- **engineering** — code-heavy, dark register. PR films, subsystem films,
  docent-self. The console look.
- **editorial** — close-reading, prose-forward. Poetry, essays, blog posts.
  Cream-on-warm, serif body.
- **paper** — academic / arxiv-PDF. Light cream backdrop, marker-blue ink,
  no glow. For peer-reviewed papers, preprints, and journal-shaped subjects.
- **executive** — exec deck. High-contrast, generous spacing, fewer figures.
- **analytical** — math / proof — euclid-primes shape. Tight mono numerics
  on a graph-paper backdrop.
- **neutral** — the byte-identical default. Only when no other preset fits.

The skill markdown (e.g. `packages/agent/skills/docent-pr/SKILL.md`) is the
operational checklist — it tells the runner *when* in the cascade to call
`style recommend`. This section is where the SURVEY records what the runner
will eventually pin.

The depth-review judge scores `style-committed` on the rendered spec: a film
that ships with `style: {preset: "neutral"}` or no style block at all (and
the survey could have named a better fit) fails this dimension.

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

## § 6.5 When the subject is a *person's experience*

If the argument is about how a **person** moves through something — UX, customer
experience, patient flow, employee onboarding, a developer's first hour with a
new framework, a hire's first week — reach for `journey-map`. The shape is
fundamentally different from `progression` (system-internal stages) and
`walkthrough` (actors messaging): the spine of a journey-map is *a single
person's emotional arc*, anchored to the stages they walk through. **Specify
the emotion AND the touchpoint that causes it.** A journey-map without
touchpoints/pain-points on at least half its stages is a list of feelings, not
a journey — and the depthcheck contract will reject it.

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

## 8. When time is load-bearing — reach for `timeline`

If the argument hinges on **WHEN** things happened (not just the order), reach
for `timeline`. The gaps between dates are part of the argument: the four-year
silence between two releases, the seven years between a discovery and its
patent, the months between a CVE and its fix. `progression` shows ordinal
stages — "first, then, then" — and cannot say *how far apart* two events are;
`timeline` plots them on a real date axis with the proportional distance
visible on screen.

Use `timeline` when the survey turns up dated milestones whose **spacing**
carries the claim: a regulatory chain, the AI-lab capability race, a
scientific discovery timeline, a regression introduced months before it was
detected, the eras of a system's evolution. If the dates are placeholders
like "early 2024," "around that time," or "during the war," the scene fails —
the time axis exists because the gaps are real and the author must commit to
the dates.

---

## Appendix — scene-type cues

If the subject's structure is **parent-child** (taxonomies, classifications,
code namespaces, org reporting lines, dependency hierarchies), reach for
`tree`. The levels must mean something — depth should encode an actual
classification axis (kingdom → phylum → class; model → toolset → orchestrator
→ application; supervisor → manager → IC), not just shape. A tree whose
levels are decorative — every node a single child of the one above, or levels
that restate the level above — fails the `hierarchy-meaningful` judge
dimension and should be authored as a `progression` or `structure` instead.
A `tree` carries a *classification* claim; a `structure` carries a *relation*
claim. Pick the one whose shape the subject already has.

If the argument depends on *where* things are (geographic, topological,
proximity, transmission paths), reach for `map`. Position must mean
something — not random pin placement. Distributed-system topology, supply
chains, urban planning, military strategy, epidemiology: layouts where a
region's *place* on the page carries the load. A map with un-annotated
regions is decoration; depthcheck enforces a minimum annotation density
(`position-meaningful`) and the judge scores `space-is-load-bearing`.

- **If the argument is about how variables INFLUENCE EACH OTHER IN A CYCLE** —
  climate feedback, organizational dynamics, economic loops, control-system
  behaviour — reach for `causal-loop`. Mark every edge's polarity (`+` = an
  increase in `from` drives an increase in `to`; `-` = an increase drives a
  decrease). Name each loop **reinforcing** or **balancing**, and verify the
  labelling matches the polarity count: an even number of `-` edges along the
  path is reinforcing (R, the cycle compounds); an odd number is balancing
  (B, the cycle self-corrects). The validator will reject a loop that lies
  about its kind.

### Rhetorical primitives — when the film's *stance* is what's at issue

These four scene types render the **author's stance** toward the subject, not
the subject itself. They are the visual form of an editorial commitment —
distinct from `tension` (the design trade-off the film chose), `big-idea`
(the takeaway), and `prior-art` (the lineage). Reach for them when the
film's argument needs a rhetorical move the other primitives don't carry.

- **`epigraph`** — when the film should **anchor in a tradition**. A short
  cited quote (≤ 60 words) opens the film, naming the authority the rest of
  the argument will *argue with*, not merely decorate from. Position: at
  index 0 or immediately after the `frame` scene; at most one per film.
- **`concession`** — when the film argues something narrow and the surrounding
  reader might assume more. Two columns: IN SCOPE / OUT OF SCOPE. Strengthens
  every other claim by drawing the line; the move most films skip because
  the author forgets to. Position: after `frame`, before any claim scene.
- **`objection`** — when the film's argument has been **challenged in the
  actual literature** and the film must answer it. Three panels — CLAIM /
  OBJECTION / REFUTATION — the refutation overlaying but not deleting the
  objection. Distinct from `tension`: tension is the trade-off the author
  chose; objection is the intellectual counterattack the author *anticipates*.
  Position: after at least one claim scene, before the closing.
- **`provocation`** — when the right ending is *"and this is where we don't
  know yet"*. A specific, question-shaped unresolved replaces the takeaway.
  Mutually exclusive with `big-idea` — a film either COMMITS or HANDS OFF,
  never both. Position: the absolute last scene.
