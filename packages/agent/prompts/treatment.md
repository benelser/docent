# Treatment — the scoping brief

A **treatment**, in the cinema sense, is the prose outline of a film, agreed
*before* anything is shot. docent borrows the word exactly. Between the survey
(what the subject is) and the spec (the JSON the engine renders) sits one
human checkpoint: the treatment. You write it; a human reads it, edits it,
steers it; only an approved treatment becomes a spec.

This brief governs **both halves** of that checkpoint:

- **Authoring a treatment** — turn survey notes into a plain-language film
  outline a non-technical reader can review.
- **Authoring a spec from an approved treatment** — turn that outline,
  faithfully, into `films/<id>.json`.

The treatment is the *human* contract. The spec is the *engine* contract. They
are different documents for different readers. Never blur them.

---

## Part A — authoring the treatment

You are given a film id, a subject, and survey notes at `analysis/<id>.md`.
Write `treatments/<id>.md`: a plain-language outline of the proposed film.

### The reader

Picture the person reading this: they understand the *subject* — they may have
commissioned the review — but they do not know docent's machinery and never
will. They are an editor, not an engineer. They decide **what the film is
about**, **what it emphasises**, **how it is framed**, and **in what order** it
unfolds. They do not decide — and must never be shown — *how* docent renders
any of it.

### Zero technical leakage — the hard rule

The treatment is plain language, end to end. Concretely:

- **Never name a scene type.** Not `frame`, `structure`, `progression`,
  `walkthrough`, `compare`, `quantities`, `probe`, `tension`, `closeup`,
  `demonstrate`, `recap`, `diff` — none of them. The reader does not know
  these words exist, and choosing among them is *your* job, done later, in
  private.
- **Never show JSON, schema, field names, or file paths into the engine.**
  No `films/<id>.json`, no `beats`, no `nodes`, no `accent`.
- **No jargon about docent itself** — no "spec", no "depthcheck", no "the
  grammar", no "scene". Say *part of the film*, *section*, *moment*, *beat of
  understanding* instead.
- Subject-domain technical terms are fine — if the film is about a Raft
  quorum, the treatment may say "Raft quorum". The ban is on *docent's*
  vocabulary, not the subject's.

If a sentence would only make sense to someone who has read the schema, it
does not belong in the treatment. Rewrite it as something an editor would say.

### The shape of the file

Write `treatments/<id>.md` as Markdown with exactly these parts, in order.

**1. Header** — a short block, four lines:

- *Subject* — what the film is about, one phrase.
- *Audience* — who it is for, and what they are assumed to already know.
  This is a real editorial choice; state it so the human can change it.
- *Angle* — the through-line. Not "an overview of X" but the specific claim
  or question the film pursues — what makes it a *review*, not a tour.
- *Estimated length* — a rough running time (docent films run about six to
  ten minutes; estimate from the scene count, roughly a minute a scene).

**2. The outline** — a numbered list of proposed scenes. One list item per
scene, in screen order. Each item is:

- **A short title** — three to six words, what this stretch of the film is
  *about*. A topic or a beat of understanding — never a format. Good:
  "Why the heap sat on the hot path". Bad: "Diagram of the queue" (names a
  format), "Scene 3" (says nothing).
- **One sentence of intent** — what the viewer should understand or feel by
  the end of this part, and why it earns its place. Written as the *point*,
  not the *mechanics*. Good: "Show that every comparison paid for two hash
  lookups, so the cost was real, not cosmetic." Bad: "A code diff with four
  highlighted regions."

Aim for six to eight scenes — the same depth a docent film carries. The
outline must still *interrogate*: it includes the moment the film names what
could break, the moment it states a real number, and the moment it reaches a
verdict or an honest scorecard. Surface those as ordinary outline items in
plain language ("Where this design strains", "The numbers behind the claim",
"The verdict") — the depth bar is editorial too, and the human should see it.

**Architecture-review films carry one fixed early beat: the lineage.** Right
after the opening, before any part of the system is shown, the film places
the subject against 2-4 prior systems that occupy similar terrain and names —
**dimensionally** — what is new. Not "X is better than Y" but "X took this
trade-off; Y took that one". Carry this as the second outline item — title
something like "The lineage and the divergence" or "Against the prior art".
Commit to one *novelty dimension* — the single row of comparison the film
argues from, the line of difference the rest of the film will pay off. Name
that dimension explicitly in the outline item's intent ("argues the novelty
is *when the decision is made* — at runtime, not at admission"). A treatment
that names prior systems but does not commit to a novelty dimension is not
yet approved.

**Explainer films carry one fixed late beat: the Big Idea.** The
next-to-last outline item is always **"The Big Idea — <sentence>"**: one
sentence (≤ 20 words) the viewer leaves with, written out in the outline so
the human can edit it. Phrase it as a real claim — not "Anchoring matters"
but the specific sentence that carries the mechanism. The recap that follows
formalizes; the Big Idea is the moment the film commits. State it as plainly
as you would say it aloud — the editor will judge whether the sentence is
the one the film should land on, and they cannot do that if the takeaway is
buried in machinery.

**3. Open choices** — one to three *genuine* framing forks, each a real
decision the human is better placed to make than you are. For each:

- State the choice as a short question.
- Enumerate two or three concrete options, lettered (A / B / C).
- Say, in one line, what each option would cost or buy — the trade.
- Recommend one, and say why — but make clear the human overrides you.

A genuine fork is one where the survey genuinely supports more than one good
film: depth-vs-breadth, which subsystem to centre, whether to spend a scene on
a rejected alternative, how blunt the verdict should be. Do **not** invent
forks to fill the section, and do **not** smuggle in technical choices ("which
scene type for part 4") — that is yours, not theirs. If the survey only
supports one honest framing, say so and offer fewer.

### After you write it

The human now reads `treatments/<id>.md` and either edits it directly or
re-runs you with feedback. Do not author a spec in Part A. Write only
`treatments/<id>.md`, then print `DONE`.

If you are re-run with human feedback, treat the *current* contents of
`treatments/<id>.md` plus the feedback as binding: the human's edits win over
your earlier draft.

---

## Part B — authoring the spec from an approved treatment

You are given an **approved** `treatments/<id>.md` and the survey notes at
`analysis/<id>.md`. Author `films/<id>.json` — the engine's contract.

The treatment is now **fixed scope**. Your job is faithful translation, not
re-scoping:

- **One treatment scene maps to one film scene**, in the same order. The
  treatment's outline *is* the film's spine. Do not add scenes the treatment
  did not propose, drop scenes it did include, or reorder them.
- **Choosing the scene type is your job — and it is hidden from the human.**
  This is the one place the two contracts meet. Read each treatment item's
  intent and pick the grammar scene type that best realises it:
  - an opening title / framing → `frame`
  - the single takeaway sentence (explainer mode, immediately before recap)
    → `big-idea`
  - **the lineage and what is new (AR only) → `prior-art`** — a side-by-side
    table of 2-4 prior systems against 2-4 trade-off dimensions, with the
    *novelty dimension* lighting up. AR films require exactly one, sitting
    immediately after `frame` and before the first `structure`.
  - components and how they connect → `structure`
  - stages along a path or over time → `progression`
  - a message-passing flow between actors → `walkthrough`
  - options judged against criteria → `compare`
  - magnitudes, a figure, or a numeric grid → `quantities`
  - vary one input, follow the consequence → `probe`
  - failure modes, trade-offs, or a verdict → `tension`
  - a close read of real source → `closeup`
  - a rendered clip / animation → `demonstrate`
  - a closing scorecard → `recap`
  - a before → after change → `diff`

  Match the intent, not the title's wording. If a treatment item reads
  "The numbers behind the claim", that is a `quantities` scene; if it reads
  "Where this design strains", that is `tension`.
- **The depth the human approved must survive into the spec.** The treatment
  item about what breaks becomes a `tension` scene; the verdict item adjudicates
  (PR mode) or the scorecard names a fragility (architecture mode); a real
  number from the survey lands in the narration. The resulting spec must clear
  the depth contract — that is non-negotiable and the human already signed off
  on the substance of it in the treatment.
- **Honour the resolved Open choices.** Whatever the human chose (or the edited
  treatment now reflects) is binding. If the treatment's "Open choices" section
  still shows an unresolved fork, the treatment was not approved — stop and say
  so rather than guessing.
- **The narration carries the substance; the survey carries the facts.** Pull
  concrete detail — real numbers, real file names, real failure modes — from
  `analysis/<id>.md`. The treatment says *what* each scene is about; the survey
  says the true things the narration must say.

### The spec contract

`films/<id>.json` must validate against `packages/engine/schema/film.schema.json`
and match the worked examples. Read before authoring:

- `packages/engine/schema/film.schema.json` — the structural contract.
- `films/linear-algebra.json` — a worked **explainer** film. The default
  reference for any non-code subject: match its format, its scene
  directives, its narration voice.
- `films/euclid-primes.json` — a second worked explainer with a different
  subject but the same contract — useful when the first feels too topic-specific.
- `films/kubernetes-pr.json` — a worked **PR-mode** film. Useful for shared
  JSON idioms, not for explainer framing.
- `packages/agent/instructions/docent.md` — the review method and depth bar.

Every scene needs `id`, `type`, and a non-empty `beats` array; every beat needs
a unique `id` (the TTS cache keys on it) and non-empty `narration`. The 12
legal scene types are the enum above; the six legal accents are `blue`, `cyan`,
`green`, `amber`, `rose`, `violet`.

### Self-check

Run:

```
bun run docent depthcheck <id>
```

Revise `films/<id>.json` until it validates and the depth contract reports met
with no failures. Do **not** run TTS or a full render — the harness does that.

Write only `films/<id>.json`. Print `DONE` when finished.
