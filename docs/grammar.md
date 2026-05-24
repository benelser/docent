# docent's grammar — the index

> A closed grammar of explanation. 25 scene types, each one a cognitive move
> a human can make. The agent picks moves; the engine renders them.

This page is the **chooser** — when authoring a film, you (or the agent)
pick scenes from this list. The survey template (`packages/agent/prompts/
survey-template.md`) and the explainer survey (`survey-explainer.md`) each
restate the relevant subset for their mode.

## The grammar by cognitive cluster

### Connection — entities and their relationships

| Scene | The move | Reach for it when |
|---|---|---|
| `structure` | a node-and-edge diagram | the subject IS its components and how they connect |
| `walkthrough` | actors exchanging messages over a sequence | the argument depends on *who passes what to whom and when* |
| `tree` | a rooted hierarchy | the structure is *parent-child*; the levels mean something |
| `map` | regions in space, with optional markers and connections | *where* something is matters — geography, topology, proximity |

### Time

| Scene | The move | Reach for it when |
|---|---|---|
| `timeline` | events on a real date axis | the *gaps* between dates are part of the argument |
| `progression` | ordinal stages along a track | the order matters but the dates don't |

### Flow and process

| Scene | The move | Reach for it when |
|---|---|---|
| `diff` | before / after, side by side | the argument is "this changed" |
| `mechanism` | parts arranged in a working motion | the argument is *how it operates* — feedback loops, state cycles |
| `causal-loop` | variables influencing each other in a closed cycle | the dynamics come from *reinforcement or balancing*, not motion |

### Comparison and measurement

| Scene | The move | Reach for it when |
|---|---|---|
| `compare` | a table — options × criteria | a head-to-head call with discrete cells |
| `landscape` | 2-D scatter on labeled axes | options on a *trade-off plane*; quadrant analysis |
| `quantities` | figures, a matrix, or named metrics | the numbers are the argument |
| `chart` | plotted data on numeric axes | continuous data, trend, curve, distribution |
| `prior-art` | the subject placed against 2-4 prior systems × dimensions | argument hinges on *novelty*: what's new dimensionally |
| `venn` | overlap analysis of 2-3 sets | argument is about what lives *only in the intersection* |

### Categorization and boundaries

| Scene | The move | Reach for it when |
|---|---|---|
| `tension` | chosen / rejected / risk ledger | the argument is a *trade-off*: what was kept, what was set aside |
| `compare` | (see Comparison) | … when the categories are discrete cells |

### Human experience

| Scene | The move | Reach for it when |
|---|---|---|
| `journey-map` | stages × emotion across an experience | the argument is how a *person* moves through something |
| `closeup` | code or text excerpt, annotated | a specific span needs to land at the line level |

### Narrative + commitment

| Scene | The move | Reach for it when |
|---|---|---|
| `frame` | title, tagline, footnote — the film's opening commitment | every film opens with one |
| `passage` | a typeset text artifact with marked spans | the source text is the artifact (a poem, a quote, a statute) |
| `figure` | a still image with annotated regions | the visual is the artifact (a chart screenshot, a photograph) |
| `demonstrate` | a video clip played inline | only the moving image conveys it (a Manim render, a UI demo) |
| `big-idea` | one held sentence the viewer should leave with | every explainer film carries one, sits before recap |
| `recap` | a closing ruling — points the film proved | every explainer ends here |

## How to choose

The first scene of every film is `frame`. The last is `recap` (or
`provocation`, when that ships in Sprint C).

For everything in the middle, pick by **the cognitive move the argument
makes at that point**, not by the visualization you want. *"I'm about to
argue that two-front planning made the local crisis continental"* is a
causal claim → `tension` or `structure` with `entails` edges. *"I'm
about to walk the failure path that the design exposes"* is mechanism
→ `walkthrough` for sequence, `mechanism` for cycle, `causal-loop` for
feedback.

A film that uses 3-5 different scene types reads as varied and considered.
A film that uses the same scene type 4 times in a row reads as a
PowerPoint deck.

## What's coming

| Sprint | Adds |
|---|---|
| **B** (queued) | compositional grammar — scenes can embed scenes (a `landscape` whose markers are `mechanism` thumbnails) |
| **C** (queued) | `epigraph`, `concession`, `objection`, `provocation` — rhetorical scenes, same status as `tension` |

When those ship, the grammar grows to ~29 primitives. The chooser stays
the same shape: pick by the move.

## The deep rule

> **The engine owns every pixel. The grammar is closed. The author picks
> moves; the renderer doesn't take freeform style instructions.**

If you find yourself wanting a scene type that isn't on this list, file an
issue with the *cognitive move* you're trying to make, not a description
of the diagram you want to draw. The grammar grows by cognitive coverage,
not by visualization wishlist.
