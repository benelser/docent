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

## § 2.5 Style commitment  *(mandatory)*

Before authoring the spec, commit to a `{preset, intent}` style block — this
is the visual register the film renders in, and the agent author MUST pin it
on `films/<id>.json` as a top-level `"style"` field.

**Run the recommender** (rule-based; not an LLM call):

```bash
bun run docent style recommend <id>
```

It reads this survey file (`analysis/<id>.md`) and prints a recommended
`{preset, intent}` plus a one-line rationale. Treat the recommendation as a
default; override it ONLY when you can name a specific survey finding the
recommender missed.

**Pin the commitment in the survey.** Write the chosen preset, the intent
block, and a ONE-LINE rationale here. The rationale must tie to a *specific
survey finding*, not a vague register adjective. Bad: "paper preset because
this is a research-y subject." Good: "paper preset because the source is
arxiv.org/abs/1706.03762, a peer-reviewed preprint with Figure 1 and Table 2
load-bearing; the film must render in journal style."

Format:

```
preset:    <neutral | engineering | editorial | paper | executive | analytical>
intent:    {tone, audience, medium, density, theme, emphasis} — only the axes you commit to
rationale: <one line tying the choice to a finding in this survey>
```

Available presets:

- **editorial** — close-reading, prose-forward. Poetry, essays, blog posts,
  literary subjects. Cream-on-warm, serif body, broader line-height.
- **paper** — academic / arxiv-PDF. Light cream backdrop, marker-blue ink,
  no glow. For peer-reviewed papers, preprints, and journal-shaped subjects.
- **analytical** — math / proof — euclid-primes shape. Tight mono numerics
  on a graph-paper backdrop.
- **engineering** — code-heavy, dark register. The console look — for
  explainers about code, systems, or developer tooling.
- **executive** — exec deck. High-contrast, generous spacing, fewer figures.
- **neutral** — the byte-identical default. Only when no other preset fits.

The skill markdown (e.g. `packages/agent/skills/docent-explain/SKILL.md`) is
the operational checklist — it tells the runner *when* in the cascade to
call `style recommend`. This section is where the SURVEY records what the
runner will eventually pin.

The depth-review judge scores `style-committed` on the rendered spec: a film
that ships with `style: {preset: "neutral"}` or no style block at all (and
the survey could have named a better fit) fails this dimension.

## § 2.6 Scene-set commitment  *(mandatory)*

Before authoring the spec, commit to a **scene set** — the cognitive moves
the film will make. Without this step, the agent reflex-defaults to the
suspected rut (`frame` → `structure` → `compare` → `tension` → `recap`) on
every film, regardless of whether the subject actually demands those
primitives. Most non-code subjects want something else: a `passage` for
prose, a `causal-loop` for a feedback dynamic, a `landscape` for a
trade-off plane, an `epigraph` + `objection` for a contested topic.

**Run the recommender** (rule-based; not an LLM call):

```bash
bun run docent scene-fit recommend <id>
```

It reads this survey file (`analysis/<id>.md`), scores every cognitive
signal it finds in the body against the 29-scene grammar, and prints the
top scene types with one-line rationales tying each to a specific survey
finding. If the recommender returns `warningOnDefault: true`, the survey
collapsed to the default rut — re-read the survey and ask whether you
actually surfaced the signals that would pull `causal-loop`, `landscape`,
`timeline`, `tree`, `map`, `journey-map`, `venn`, `mechanism`, `passage`,
`figure`, `probe`, `epigraph`, `concession`, `objection`, or `provocation`
into the recommendation. The fix is almost always in the survey itself
(a missing finding, vague language about "stages" or "components" instead
of the specific cognitive move), not in the spec.

**Pin the commitment.** Write the chosen scene set (in author order) plus
a ONE-LINE rationale per scene. The rationale must tie to a *specific
survey finding* — the same depth bar as the style commitment. Bad: "venn
because the topic is about overlap". Good: "venn because § 1 establishes
that A ∧ B alone leaks but cannot escape; only A ∧ B ∧ C composes the
full attack chain — the intersection IS the argument."

Format:

```
scenes:    [frame, <body picks>, big-idea, recap]
rationale per scene: <one line per scene tying to a survey finding>
```

Treat the recommender's output as a default; override it ONLY when you
can name a specific survey finding the recommender missed.

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

**If the subject's argument is HOW a thing works rather than WHAT it is,
reach for `mechanism`.** A `mechanism` scene shows a working diagram in
continuous motion — a feedback loop iterating, a thermostat compensating,
gradient descent walking, a state machine cycling. The motion IS the
argument; pick a motion kind that matches the actual mechanism, not a
pretty animation. The four kinds are closed: `cycle` for a feedback loop
visiting parts in order, `oscillate` for a value bouncing between two
parts, `descend` for a marker walking down a gradient, `iterate` for a
counter ticking through named phases. A beat can `freeze` the motion at a
phase to call out what's happening — narration that says "watch the
controller flip" while the motion holds. Mechanism is the right scene
when a static diagram cannot carry the argument.

## 7b. When the argument hinges on an overlap — reach for `venn`

If the subject's argument hinges on the **OVERLAP of multiple capabilities,
properties, or communities** — a security trifecta (private data + untrusted
input + outbound tools), a set-theoretic distinction between schemes (HMAC
vs signed JWT vs MAC), a market category intersection ("only the things in
the intersection of A, B, and C are X") — reach for the `venn` scene type.

State three things explicitly in the survey:

- **Which sets**: name the 2 or 3 sets the argument relies on (each one a
  distinct capability/property/community). Three is the upper bound: a 4+
  Venn has no clean planar layout and the argument almost certainly wants a
  different primitive.
- **Which intersection**: which region the argument hinges on — every set,
  or two of three, or just two of two. The intersection is the dangerous
  one: name it.
- **What that intersection alone proves**: the one-line mechanism. Not "the
  overlap is dangerous" (an evaluation), but "no token in this combination
  carries provenance, so the model cannot distinguish data from instruction"
  (a mechanism). The depthcheck contract `intersection-honest` rejects
  evaluative claims; the judge dimension `intersection-named` enforces it
  with judgement.

A film that needs a Venn but uses structure or tension will name the
components but lose the argument — the overlap is the point, and only the
Venn primitive renders it.

## 7.5 The landscape — when the argument is *placement*

If the subject's argument places N alternatives on a 2-D trade-off plane
(cost vs value, simplicity vs power, latency vs throughput, freedom vs
determinism), reach for **`landscape`**. Name the two axes BEFORE plotting;
the axes are the argument, the markers prove it. The plane fails the moment
the axes name the same trade-off twice ("simplicity vs simplicity" — the
quadrant has collapsed to a line) or the markers cluster — a landscape is a
landscape only when the spread itself reads as a claim.

Each axis is a trade-off, not a quantity: it carries a `lowLabel` phrase at
the min end and a `highLabel` phrase at the max end. Subjects sit at
normalized {x, y} ∈ [0..1]². 2-8 subjects per scene; positions are *argued*,
not asserted (each placement should follow from a property the survey already
established). Optional quadrant labels (TL/TR/BL/BR) name the four cells of
the analysis when they are themselves load-bearing.

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

## 9. When time is load-bearing — reach for `timeline`

If the argument hinges on **WHEN** things happened (not just the order), reach
for `timeline`. The gaps between dates are part of the argument: how long the
field sat on the wrong answer before correcting, how compressed the
breakthrough months were, how long an idea waited for its empirical proof.
`progression` shows ordinal stages; `timeline` plots events on a real date
axis with the proportional distance between them visible on screen.

Use `timeline` when the survey turns up dated milestones whose **spacing**
carries the claim: a chain of discoveries, the half-life of a paradigm, the
arc of an idea from publication to consensus. If the dates are placeholders
like "early 2024," "around that time," or "during the war," the scene fails —
the time axis exists because the gaps are real and the explainer must commit
to the dates.

## 10. FDE / SRE / engineering-team knowledge-base context

A curated engineering directory — a runbook, an on-call handbook, a
post-incident playbook, an internal wiki cluster — is a *different input
shape* from a book chapter or an essay. It is multi-asset (prose, diagrams,
screen-recordings, config snippets) and its author intent is **a teaching
film for a team**, not a publication for the public. The depth bar does
not move. The discipline below keeps a runbook film from collapsing into a
narrated Loom recording.

### (a) When this section applies

Trip into this section when *all* of the following hold:

- the subject is a **directory** (or a wiki-shaped URL) with an index page
  (`README.md`, a TOC, a landing wiki article) and multiple linked subpages;
- it contains **embedded media** — at least one diagram (`.png`, `.svg`) or
  one screen-recording (`.mp4`, `.mov`);
- it mixes **prose with config / code references** — alert payloads, YAML,
  CLI snippets, dashboard URLs;
- the author intent is **a film for an engineering team** (lunch-and-learn,
  on-call onboarding, post-incident teaching), not a film for the public.

When the subject is a single document, this section is inert and the rest
of the template stands as-is. When the subject is a knowledge-base
directory, this section is **mandatory** and composes with §§ 0-9: you
still pick one load-bearing idea, you still earn the claim, you still rule
in the recap.

### (b) Mixed-asset triage — what binds to what scene type

A directory is a pile of assets. Bind each asset to the scene type whose
**native shape** the asset already has — never force-fit. The grammar is
closed; everything below resolves to scene types defined in
`schema/film.schema.json`.

| Asset                                  | Scene type      | Why                                                                                  |
|----------------------------------------|-----------------|--------------------------------------------------------------------------------------|
| Wiki / runbook page (prose `.md`)      | `passage`       | annotate the runbook text by phrase — the words of the page are what the film argues |
| Architecture / flow diagram (`.png`)   | `figure`        | annotate the still image by region — the diagram's spatial layout carries the claim  |
| Screen-recording demo (`.mp4`)         | `demonstrate`   | play the phenomenon itself — the recording IS the thing, not a description of it     |
| Step-by-step runbook procedure         | `walkthrough`   | one instance, step by step — the procedure as a single ordered run through the steps |
| Alert payload / config snippet (JSON, YAML) | `closeup`  | annotate one structured artifact — the syntax of the payload IS the surface          |
| "When this runbook does NOT apply"     | `tension`       | the trade-off, where it breaks — the edge case the procedure makes worse             |
| Before/after metrics, SLO numbers      | `quantities`    | the numbers — a measured before vs after, an error budget, a p99                     |
| The one operational takeaway           | `recap`         | the takeaway — what the engineer does next time the alert fires                      |

Two reading rules for the table:

- The binding is one-way: an asset of the kind on the left **must** render
  as the scene type on the right. A `.mp4` cannot become a `figure`; a
  diagram cannot become a `demonstrate`. If the binding feels wrong, the
  asset is being asked to carry a move it does not have — pick a different
  asset.
- Most assets in the directory are **named neighbours** of one of these
  scenes, not their own scene. A directory with eight diagrams does not
  make an eight-`figure` film; it makes one `figure` on the hero diagram
  and seven named-and-set-aside.

### (c) Genre conventions — what makes an engineering teaching film *land*

These are the rules that distinguish a runbook *film* from a runbook
*tour*. They are not stylistic preferences; the depth-review judge applies
them.

1. **The actionable-ending rule.** A lunch-and-learn film is not done when
   the topic is explained — it is done when the engineer can act on it
   next time the alert fires. The final `recap` takeaway must be
   **operational**, naming the trigger and the action: *"When you see
   high p99 on the auth path AND error rate flat, do not roll back — page
   the database on-call. The reason is connection pool exhaustion, not a
   bad deploy."* A philosophical takeaway ("incident response is about
   communication") fails this rule.
2. **The misconception the film must kill.** Every engineering team
   carries shared folklore that is often wrong: "always page the on-call
   when latency spikes," "rollbacks fix bad deploys," "the dashboard tells
   you what broke." The survey must identify the **specific** wrong model
   this runbook exists to correct, and the film must visibly displace it
   — not state the right answer beside it. If the survey cannot name a
   misconception, the runbook is a **knowledge relay**, not a teaching
   film; stop and reconsider whether a film is the right artifact.
3. **The hero asset.** A directory has many artifacts. ONE diagram is the
   hero (almost always the request-flow or alert-decision-tree). ONE
   demo is the hero (the recording that shows the phenomenon, not the
   one that tours the dashboard UI). ONE wiki page carries the
   load-bearing claim. Name them in the survey; everything else is a
   named neighbour or out of scope. This is the same "pick one
   load-bearing idea" discipline from § 0, applied to assets — and it is
   the most common place a runbook film loses focus.
4. **The "when this doesn't apply" rule.** Every runbook has at least
   one edge case where following the standard procedure makes the
   incident worse — rolling back during a schema migration, restarting
   the leader during a quorum loss, scaling out under a thundering-herd
   retry storm. The film **must** include a `tension` scene that names
   at least one such case and the correct alternative action. A runbook
   film without a `tension` is a tutorial; a tutorial is the floor.
5. **The voice register.** Engineering teaching films lean `neutral` to
   `urgent` — a runbook describes an actual or potential incident, not a
   debate. `playful` reads as flippant when the film teaches an incident
   response; `grave` reads as performative for a routine runbook. Pin
   `meta.register: neutral` (procedural calm — the default) or
   `meta.register: urgent` (active incident, on-call onboarding) in the
   spec, and tie the choice to a specific survey finding.

### (d) Mandatory questions — the knowledge-base case

In addition to §§ 0-9, answer every question below. "The directory does
not reveal this" is a legitimate answer; silent omission is not.

- **The hero diagram.** Of every diagram in the directory, which ONE is
  load-bearing? Name it by path. State why — what claim it carries that
  no other diagram does. (If two diagrams tie, you have not done the
  triage; pick one or merge them in the spec.)
- **The hero demo.** Of every screen-recording, which ONE shows the
  *phenomenon* the film must `demonstrate` — the alert firing, the
  metric spiking, the failed deploy rolling back? Name it by path. State
  why. (A walkthrough of a static dashboard is NOT a phenomenon; it is a
  UI tour, and it goes in the named-neighbour list, not the spec.)
- **The misconception.** What does the team currently believe that this
  runbook exists to correct? State the wrong model in one sentence, and
  the right model in one sentence. If no misconception exists, this is a
  knowledge-relay, not a teaching film — **flag this and stop**; produce
  the survey only after the author has named one.
- **The "when this doesn't apply" case.** Name one concrete situation
  where following this runbook makes the incident worse, and state the
  correct alternative action. This is the seed of the `tension` scene; a
  vague "edge cases exist" is rejected.
- **The actionable close.** When the film ends, what does the engineer
  know to *do* next time? State it as an action verb plus its trigger:
  *page the database on-call when X*, *redirect traffic to the standby
  when Y*, *do not roll back when Z*. The verb is the seed of the
  `recap`; an abstract takeaway ("understand the system better") is
  rejected.

### (e) What this section does NOT change

- The **scene grammar is unchanged.** Use the same closed 15-type set
  defined in `schema/film.schema.json`. This section adds *binding rules*
  for a new input shape; it does not add a new scene type. If you find
  yourself wanting a "log excerpt" or "dashboard screenshot" type, render
  the log as a `passage` and the dashboard as a `figure` — those are the
  primitives that carry the move.
- The **depth bar is unchanged.** A runbook film still interrogates: the
  failure modes, the boundary case, the misconception, the verdict in
  the `recap`. Relay is rejected here too.
- The **treatment → spec → build flow is unchanged.** The survey still
  goes to `analysis/<id>.md`; the treatment (if used) still goes to
  `treatments/<id>.md`; the spec still goes to `films/<id>.json` and is
  still validated by `docent depthcheck`.
- This section adds **discipline for a new INPUT shape**, not a new
  mode. The mode remains `ex`; the recommenders in § 2.5 and § 2.6 still
  run; the appendix-scene-type cues below still apply.

---

## Appendix — scene-type cues

If the subject's structure is **parent-child** (taxonomies, classifications,
code namespaces, org reporting lines, dependency hierarchies, knowledge-graph
ontologies), reach for `tree`. The levels must mean something — depth should
encode an actual classification axis (kingdom → phylum → class; model → toolset
→ orchestrator → application), not just shape. A `tree` carries a
*classification* claim; a `structure` carries a *relation* claim. Pick the one
whose shape the subject already has. A `tree` whose levels are decorative —
every node a single child of the one above, or levels that restate the level
above — fails the `hierarchy-meaningful` judge dimension; author it as a
`progression` or a flat `structure` instead.

If the argument is about how variables INFLUENCE EACH OTHER IN A CYCLE —
climate feedback, organizational dynamics, economic loops, control-system
behaviour — reach for `causal-loop`. Mark every edge's polarity (`+` = an
increase in `from` drives an increase in `to`; `-` = an increase drives a
decrease). Name each loop **reinforcing** or **balancing**, and verify the
labelling matches the polarity count: an even number of `-` edges along the
path is reinforcing (R, the cycle compounds); an odd number is balancing
(B, the cycle self-corrects). The validator rejects a loop that lies about
its kind.

### Rhetorical primitives — when the film's *stance* is what's at issue

These four scene types render the **author's stance** toward the idea, not
the idea itself. They are the visual form of an editorial commitment —
distinct from `tension` (the trade-off the idea makes) and `big-idea` (the
takeaway). Reach for them when the film's argument needs a rhetorical move
the other primitives don't carry.

- **`epigraph`** — when the film should **anchor in a tradition**. A short
  cited quote (≤ 60 words) opens the film, naming the authority the rest of
  the explanation will *argue with*, not merely decorate from. The killer
  case for an essay or wiki article whose author quotes earlier thinkers.
  Position: at index 0 or immediately after the `frame` scene; at most one
  per film.
- **`concession`** — when the explainer covers a narrow slice of a broader
  topic. Two columns: IN SCOPE / OUT OF SCOPE. The move that strengthens
  every other claim by drawing the line; most explainers skip it because
  the author forgets to. Position: after `frame`, before any claim scene
  (structure / compare / tension / chart / venn / landscape / etc.).
- **`objection`** — when the idea has been **seriously challenged** and the
  film must answer the objection rather than ignore it. Three panels —
  CLAIM / OBJECTION / REFUTATION — the refutation overlaying but not
  deleting the objection. The strong version is a steelman the film
  anticipates from the actual literature, not a weak opponent invented to
  defeat. Position: after at least one claim scene, before the closing.
- **`provocation`** — when the right ending is *"and this is where we
  don't know yet"* — a research-frontier explainer, an essay arguing for
  a position whose implementation is unsettled, a policy piece. A specific,
  question-shaped unresolved replaces the takeaway. Mutually exclusive
  with `big-idea` — the film either COMMITS or HANDS OFF, never both.
  Position: the absolute last scene.

### Narration provider — `meta.tts` (optional)

Every explainer narrates through Kokoro by default — local, free, no
credentials. For a typical idea-explainer, omit `meta.tts` entirely.

Two reasons to override the default in an explainer film:

- **The explainer is a paid deliverable** (a client video, a film with a
  broad audience): consider `meta.tts.provider: "elevenlabs"` for the
  richer voice catalog and character-level alignment. Requires
  `ELEVENLABS_API_KEY` in env.
- **The explainer leans heavily on `passage` scenes** — a close reading,
  a verse-by-verse argument, a primary-source unpacking. `passage`
  benefits from word-level alignment (per-word highlight as narration
  plays). Pin an aligning provider for the polish; or accept the
  warn-by-default behaviour with the Kokoro defaults.

`docent tts list-providers` enumerates the registered providers.

