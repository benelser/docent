# Survey template — explainer mode (non-code subjects)

This is the survey method for `docent`'s **explainer** mode (`ex`) — when the
subject is not a code repository but *content to be explained*: a book chapter,
an essay, a blog post, a wiki, a knowledge base. The companion of
`survey-template.md` (the code version); read that first to see the shape, then
use this instead when the subject is prose.

Fill this in *before* authoring `films/<id>.json`. A film cannot have depth the
survey never found. Write the completed survey to `analysis/<id>.md`. Every
section is mandatory; "the source does not reveal this" is a legitimate
answer — silent omission is not.

The subject here is **an idea**, not a system. You are not tracing code. You
are interrogating a claim: where it is true, where it is counterintuitive,
where it breaks, and whether the source actually earns it. A non-code film
still clears the depth bar — it **interrogates the idea, it does not relay
it**. A relay is a summary; a film is a review.

---

## 0. Content boundary — *the most important section*

A book, a wiki, or a long essay contains far more than one film. Resolve the
subject to **one explainable unit** before surveying — that unit is the film's
scope, and everything else is a named neighbour or out of scope.

- **Pick one load-bearing idea.** One chapter, one essay, or one connected
  cluster of concepts that stands on its own. A film explains *one thing* well.
- **If the source is a wiki or knowledge base** (a directory of pages, or a URL
  with an index): start at the index / table of contents, follow its links,
  and map the territory — then choose the single most central or most
  load-bearing page/cluster. Name the pages you are *setting aside* and why.
- **If the source is a single document**: the whole document may be the unit,
  or — if it sprawls — one argument within it. State the cut.
- **State the boundary explicitly**: the chapter/section/page(s) the film
  covers, the prerequisite ideas it assumes the viewer already has, and what is
  deliberately out of scope. Every scene falls inside that boundary or is a
  named neighbour at its edge.

## 1. Triage — the load-bearing idea vs. the mechanical setup

Rank the content. What is **load-bearing** — the one consequential idea, the
claim the piece exists to make — versus **mechanical**: throat-clearing,
historical preamble, definitions, restatement, examples that merely decorate?
State the cut line explicitly: what the film will interrogate, and what it will
name in one sentence and set aside. The triage *is* the survey: a chapter gets
a film because a reader cannot extract its spine themselves.

## 2. What the idea is / why it exists

The idea, in two or three sentences — in your own words, not the author's. Why
does this idea exist: what question does it answer, what problem does it solve,
what prior belief does it correct or replace?

## 3. The hard parts of the idea

This is where a film stops being a summary. For the load-bearing idea:

- **Where it is counterintuitive** — the part a smart person gets wrong on
  first contact. What does intuition predict, and how does the idea differ?
- **The misconception it must kill** — name the specific wrong model the
  viewer probably arrives with. A good explainer does not just state the right
  answer; it *displaces* the wrong one. What is that wrong answer?
- **Where it breaks** — the boundary case, the paradox, the place the idea
  strains or appears to contradict itself, the objection a sharp critic raises.
- **The mechanism, not just the conclusion** — *why* is it true, not only
  *that* it is true. If the source asserts a conclusion without a mechanism,
  that is itself a finding (see section 5).

## 4. Is the claim earned

Point at the central claim and ask: is it **grounded** — in a cited source, a
worked example, data, an experiment, a proof, a concrete case — or is it merely
**asserted** with confidence? Naming that the author sounds authoritative is
worth nothing. Distinguish:

- claims the source *demonstrates* (example, evidence, derivation present),
- claims the source *cites* (defers to an authority — is the citation load-
  bearing or decorative?),
- claims the source *asserts* (stated as obvious, no support).

Treat a confident, unsupported central claim as a yellow flag, and say so in
the verdict.

## 5. The scope of the claim — where the idea does not apply

Every real idea has a boundary. Name at least one place the idea **does not
hold**: the assumption it depends on, the domain it silently excludes, the
condition under which it reverses, the population it was derived from but is
being over-generalized beyond. "True when X; fails when Y." An idea presented
as universal that is actually conditional is the most important thing a film
can surface. If the source itself names no limits, that is a finding.

## 6. The competing explanation

Name at least one **rival idea, alternative framing, or serious objection** —
and say why this one wins, or where the contest is genuinely unresolved. If
there is no competing view, the idea was never tested. ("This account beats X
because Z; it costs W.") A film that presents one idea as the only idea is a
brochure.

## 7. Verdict inputs — a takeaway that adjudicates

A non-code film still ends on a stated position, never "this is interesting."

- **Disposition** — is the idea, as presented, *sound* / *sound with caveats* /
  *overstated*? Take a position and justify it.
- **The single biggest weak point** — even for a strong idea: the assumption
  most likely to be wrong, the unearned step, the over-generalization.
- **What you would tell the viewer to carry away** — the one durable sentence,
  and the one thing to stay skeptical of. The takeaway adjudicates the idea; it
  does not admire it.
