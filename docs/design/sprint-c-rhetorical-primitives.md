# Sprint C — rhetorical primitives

> Queued. Dispatches after Sprint B (compositional grammar) and the
> migration sprint both merge. Four parallel agents — same pattern as
> Sprint A.

---

## Why rhetorical primitives matter

I argued earlier that "rhetorical" wasn't a category of visualization
primitive. That was wrong. `tension` is already in the grammar as a
rhetorical move rendered visually — chosen / rejected / risk is a
ledger of *editorial commitments*, not a diagram of a thing. `big-idea`
is the same. `prior-art` is the same.

What we're missing is the *rest* of the rhetorical-move vocabulary that
serious essays, papers, and arguments use. These primitives don't fit
into any of the 9 cognitive-representation clusters because they're not
about *representing a subject* — they're about the *author's stance
toward the subject*. They are visualization moves, just at a different
level.

## Four new scene types

### 1. `epigraph` — a cited authority opens the film

```ts
type EpigraphScene = {
  quote: string;         // the cited passage (≤ 60 words)
  attribution: string;   // 'Karl Popper, 1934' or 'Aristotle, Metaphysics'
  treatment?: 'block' | 'pull';  // block = centered on its own panel;
                                  // pull = inline-marginal with rule
  beats: Beat[];  // typically one beat — narration enters the film
                  // FROM the quote
};
```

**Render contract:** a quiet scene. Large serif type, minimal chrome,
the attribution beneath in smaller mono. No nodes, no diagrams.

**Killer subjects:** any explainer that wants to anchor in a tradition.
Opens with a quote that frames the film's argument.

**Position:** the validator requires exactly zero or one epigraph per
film; if present, it sits at index 0 OR immediately after `frame`.

**New depthcheck rule:** `epigraph-on-point` — the quote must be
verifiable against the survey's source list (the survey's anchor
discipline applies). A bare attribution with no source span fails.

**New judge dimension:** `epigraph-earned` — does the rest of the film
argue with the quote, or just decorate from it?

### 2. `concession` — the film explicitly states what it does not cover

```ts
type ConcessionScene = {
  scope: string[];      // what IS in scope (verbatim from the survey's section 0)
  outOfScope: string[]; // what is explicitly NOT in scope
  reason?: string;      // optional one-line WHY this cut was made
  beats: Beat[];
};
```

**Render contract:** two columns — IN SCOPE (kept) / OUT OF SCOPE (set
aside). The set-aside items render dimmed with a strike-through ledger
mark.

**Killer subjects:** every film that argues something narrow ought to
have one. Most don't because the spec author doesn't think to add it.
Concession is the move that strengthens every other claim — by drawing
the line.

**Position:** must sit after `frame` and before any claim scene (the
first `structure` or `compare` or `tension`). The validator enforces
this.

**New depthcheck rule:** `concession-non-trivial` — at least 2 items
in `outOfScope`, and the `outOfScope` items must not be tautological
("not relevant" fails; "outside the present-day version we are
analyzing — historical OS forks before 2018 are out of scope" passes).

**New judge dimension:** `scope-honest` — the concession honestly
narrows; the film doesn't sneak claims about out-of-scope items back
in later.

### 3. `objection` — the film argues against itself, then refutes

```ts
type ObjectionScene = {
  claim: string;          // what the film has been arguing
  objection: string;      // the steelman against it
  evidence: string[];     // what the objection cites or implies
  refutation: string;     // the film's response — NOT a hand-wave
  refutationStrength: 'partial' | 'full';
                          // 'partial' admits the objection partly holds
  beats: Beat[];
};
```

**Render contract:** three stacked panels — CLAIM (lit, with the film's
accent), OBJECTION (rose accent, slightly dimmed), REFUTATION (lit,
back to the film's accent or stronger). Visual rhetoric: the
refutation visually overlays the objection panel, dimming it but not
deleting it.

**Killer subjects:** any film whose argument has been challenged in
the actual literature. Distinct from `tension` — `tension` is the
design trade-off the author chose; `objection` is the *intellectual
counterattack the author has anticipated*.

**Position:** must sit AFTER at least one claim scene and BEFORE the
`recap` / `big-idea`. The validator enforces this.

**New depthcheck rule:** `objection-steelmanned` — the objection
string must NOT be a strawman. Specifically: it must be ≥ 12 words
(too short is a slogan); it must NOT be evaluative ("This argument is
weak" fails; "The argument under-states the cost of cluster-wide
synchronization in production" passes); and `refutationStrength` must
match the rhetorical force of the refutation paragraph (a film that
says `partial` but writes a full refutation is being dishonest about
its own concession).

**New judge dimension:** `objection-real` — does the objection cite a
real counterposition, or is the film inventing a weak opponent to
defeat?

### 4. `provocation` — an incomplete closing that asks the viewer to extend

```ts
type ProvocationScene = {
  unresolved: string;     // the question the film deliberately doesn't answer
  why: string;            // why the film leaves this open
  invitation: string;     // what the viewer is invited to do with it
  beats: Beat[];
};
```

**Render contract:** a quiet final scene, typographically intense.
The `unresolved` rendered in display-size type with a trailing
ellipsis; the `why` and `invitation` smaller, beneath, in muted ink.
No chrome — this is the moment the film hands the viewer the next
question.

**Killer subjects:** academic talks where the right ending is "and
this is where we don't know yet." Research-frontier films. Policy
films that argue for a position but admit the implementation is
unsettled.

**Position:** the absolute last scene of the film, instead of `recap`
or `big-idea`. Mutually exclusive with `big-idea` — a film either
COMMITS to a takeaway (big-idea) or HANDS OFF an open question
(provocation), never both.

**New depthcheck rule:** `provocation-specific` — the `unresolved`
must be a specific question, not a vague gesture. ("More research is
needed" fails; "Whether the cluster-wide rebalancer can be made
incremental without sacrificing the latency invariant" passes.)

**New judge dimension:** `provocation-load-bearing` — does the
unresolved question follow from what the film argued, or is it bolted
on as a "what's next" generic?

## Same dispatch pattern as Sprint A

Four parallel agents, one per primitive, isolated worktrees. Each
ships:

- Scene renderer
- Spec types (append to union)
- Schema (append to enum + properties + $defs)
- Validator (per-scene block + spec-level position contract)
- Depthcheck dimension
- Judge dimension
- Survey-template / survey-explainer additions
- Demo film proof at scale 0.5

## Non-regression contract

The full hermetic gallery still passes. Gallery films don't use the
new scenes (they predate this sprint and are grandfathered for the
spec-level position contracts — same grandfather pattern as `big-idea`).

## A note on what these are NOT

These four scene types do not render diagrams of subjects. They render
*the author's stance toward the subject's argument*. That makes them
visualization primitives in the same way `tension` and `big-idea` are
— they are the visual form of an editorial commitment. Don't argue
them out of the grammar again. Tension is in the grammar; epigraph
belongs with it.
