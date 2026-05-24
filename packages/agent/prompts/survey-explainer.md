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

- **First — verify the source surface is rich enough.** Open the fetched
  source file you were given (`analysis/<id>.source.md`) and check its
  character count. If it is below ~5 000 characters, the fetcher hit a
  stub, abstract, or landing page — not the actual content. Stop and ask
  for a better URL **before** writing any survey. Common patterns to try:
  - `arxiv.org/abs/<id>` → the full paper lives at `/html/<id>` or
    `/pdf/<id>`.
  - A paper's homepage → look for a "Full text" or "PDF" link in the
    page body.
  - A wiki article's category/landing page → follow into the canonical
    article URL.
  - A blog index → follow into the specific post.
  If the page itself is the canonical surface and is genuinely short,
  say so explicitly and narrow the film's claim accordingly.
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
- **Where it breaks — walk one boundary case to the failure.** The boundary
  case, the paradox, the place the idea strains or appears to contradict
  itself, the objection a sharp critic raises. Pick the single most concrete
  failing case and walk it through: what assumption gives, what prediction
  misses, what an observer would actually see. Gesturing at "edges exist" is
  rejected.
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

**Anchor each claim.** For every claim the film will make, name the specific
source-anchor — a page, paragraph, section, or short quoted phrase that
locates it in the source. The survey records the anchor, and the spec must
carry it through into the narration. A claim with no named anchor is treated
as unearned.

**Numbers must do reasoning work.** If you put a quantity on screen — a count,
a magnitude, a percent, a ratio — state the *claim it pressures* or the
*mechanism it carries*. A number cited for atmosphere (an impressive
source-count repeated without a load-bearing role, a tonnage that sets mood
rather than testing the claim) is rejected. Decorative numbers belong on a
slide deck, not in a docent film.

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

## § 6.5 When the idea is a *person's experience*

If the argument is about how a **person** moves through something — UX research,
customer experience, a patient's flow through care, employee onboarding, a
developer's first hour with a new framework, a hire's first week — reach for
`journey-map`. The shape is fundamentally different from `progression`
(system-internal stages) and `walkthrough` (actors messaging): the spine of a
journey-map is *a single person's emotional arc*, anchored to the stages they
walk through. **Specify the emotion AND the touchpoint that causes it** — the
emotion alone is a feeling, the touchpoint alone is a list; the pair is what
makes the journey-map argue. A journey-map without touchpoints/pain-points on
at least half its stages is rejected by depthcheck.

## 7. The Big Idea

One sentence the viewer should leave with — the claim that survives if
everything else is forgotten. Not a verdict, not a summary; a takeaway.
≤ 20 words. Provide the sentence and one anchor (glyph, equation, image,
chart fragment) that lands it visually.

The sentence must do real work. It is the line that carries the idea after the
film ends, so:

- It is a **claim**, not an adjective. "Anchoring is fascinating" is rejected.
  "The first number rewrites the search itself" is a claim.
- It carries the **mechanism**, not just the conclusion. The sentence the film
  earns is the one that names *why*, not only *that*.
- It must not open with **"This is"** or **"It is"** — those are filler
  openings explainer authors fall into and they kill the claim. Write the
  sentence so the first word is load-bearing.
- It ends with a period. It is a statement.

Pair the sentence with the **anchor** — the visual that lands it. Pick the
kind that best carries the idea:

- **glyph** — a typographic mark or short symbol (a Greek letter, a single
  character, a tiny ideogram) when the idea has a memorable shorthand.
- **equation** — an algebra fragment the engine typesets, when the mechanism
  is a relation. Not a full derivation; the *fragment* that names the move.
- **image** — a still under `public/figures/<id>/`, when a primary source or
  diagram already carries the visual.
- **chart-fragment** — a sparkline (numeric pairs in normalized 0..1 space)
  when the idea is the *shape* of a curve — anchoring's pull, a power-law
  tail, a step function.

Surface the sentence and the anchor here. The treatment writer turns this
into the named beat in the outline; the spec author surfaces it before
rendering.

## 8. Verdict inputs — the recap must *rule*, not restate

A non-code film still ends on a stated position, never "this is interesting"
and never a restatement of its own claims. **Approving labels — "sound",
"earned", "grounded" — are rejected**: they read like a verdict but make no
ruling. State the verdict by saying three concrete things:

- **Disposition** — is the idea, as presented, *sound* / *sound with caveats* /
  *overstated*? Take a position and justify it.
- **The single biggest weak point** — even for a strong idea: the assumption
  most likely to be wrong, the unearned step, the over-generalization, the
  specific hardest-edge objection the source does not answer.
- **The precise skepticism to carry forward** — one durable sentence the
  viewer takes away, plus the one specific thing they should actively doubt
  about the idea from here on.

A recap that summarizes instead of adjudicating is rejected — the film is
touring itself, not reviewing the idea.
