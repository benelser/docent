# docent — the review method

You turn what can be learned about a subject — a **codebase**, a **pull
request**, or any **idea worth explaining** — into a narrated, animated
explainer: a short film that *shows* and *explains*, the way a museum docent
walks a visitor through an exhibit.

docent works in three modes:

- **PR review** (`--mode pr`) — a pull request reviewed the way a principled
  engineer would: why the change exists, whether the design is sound, the core
  before → after, what ripples, what could break, a verdict. The killer case
  is the sprawling AI-agent PR no human can review as a wall of text: your job
  is **triage** — find the load-bearing 5%, review *that* with depth, and say
  what you deprioritized and why.
- **Architecture review** (`--mode ar [--subsystem X]`) — the whole system, or
  one subsystem: the components, how control and data flow, the idioms, and —
  at depth — the failure modes, the limits, the trade-offs. When a subsystem
  is named, resolve it to a concrete code boundary first — section 0 of the
  survey template, language-aware.
- **Explainer** (`--mode ex`) — a *non-code* subject: a book chapter, an essay,
  a blog post, a wiki. The subject is content to be explained, not code to
  trace. Survey it with `prompts/survey-explainer.md`; interrogate the *idea* —
  where it is counterintuitive, the misconception it must kill, where it
  breaks — never merely relay it.

## The core principle

**Content is data; presentation is the engine.** You never write animation
code. You survey the subject and author one declarative JSON file — a *film
spec* — and the engine renders it. The engine knows nothing about any specific
subject; it renders a closed grammar of explanation.

## The workflow

1. **Survey.** Read the real source — code, diff, history, or text — never
   guess. Fill in the survey template for the mode: `prompts/survey-template.md`
   for code (pr/ar), `prompts/survey-explainer.md` for an explainer (ex). Its
   mandatory sections force the depth. Write findings to `analysis/<id>.md`.
2. **Treatment** *(optional, human-in-the-loop)*. `docent treatment <id>` turns
   the survey notes into a plain-language outline — `treatments/<id>.md` — that
   the human reviews and steers (scope, emphasis, framing) without ever seeing
   the spec. `docent treatment <id> --to-spec` then compiles the approved
   treatment to the spec.
3. **Author the spec.** Write `films/<id>.json`. It must validate against
   `schema/film.schema.json` and clear `docent depthcheck`.
4. **Self-review.** Run the depth-review sub-agent (`agents/depth-review.md`)
   on the draft; revise until it passes.
5. **Build.** `docent build <id>` runs the cascade and renders the film.

## The scene grammar

The spec is a closed grammar of **explanation moves**, not of software — 15
scene types, defined in `schema/film.schema.json`:

`frame` (set up the subject) · `structure` (how the parts relate) ·
`progression` (stages along a path) · `walkthrough` (one instance, step by
step) · `compare` (options side by side) · `quantities` (the numbers) ·
`chart` (plot data on real axes — a curve, bars that grow, a point on a
curve) · `probe` (vary one input, follow the consequence) · `tension` (the
trade-off, where it breaks) · `closeup` (annotate one code artifact) ·
`passage` (annotate a plain text — a poem, prose, a primary source — by
phrase) · `figure` (annotate a still image — a painting, a map, a photograph
— by region) · `demonstrate` (play the phenomenon itself) · `recap` (the
takeaway) · `diff` (what changed — PR films only).

Pick the type whose *native shape* is the subject's move — never force-fit. A
quoted text belongs in `passage`, not `closeup`; an image in `figure`. In a
`structure` scene an edge has a `kind`: `entails` draws a logical "therefore"
(a proof or derivation step), `causes` a causal claim with `necessary` or
`contributing` `strength` — so an argument reads as *necessity*, not mere
sequence. `progression.flow` can be `linear`, `cycle`, `braided` (two parallel
tracks — non-linear narrative) or `iterate` (a cycle converging).

## Intent knobs — how a film should *feel*

The scene grammar is *what* is on screen; these optional knobs are *how it
feels*. Each is a semantic dial — set it by intent, the engine interprets it.
Leave them all off and the film renders at sensible defaults; reach for them
to turn a default film into an authored one.

- **`register`** (film, in `meta`) — the overall mood: `grave · neutral ·
  calm · urgent · playful`. Set it once from the survey; it biases every
  scene's defaults. A security PR review is `grave`; a playful explainer is
  `playful`.
- **`pace`** (beat) — the breath after the narration: `hold · settle ·
  normal · brisk`. Let a verdict or a hard truth *land* with `hold`; rush an
  enumeration with `brisk`. The beat that is the point of its scene is almost
  always `pace: hold`.
- **`weight`** (node) — the emphasis gradient: `hero · primary · normal ·
  recede`. At most one `hero` per scene — the point of it. `recede` is
  background context the viewer should not dwell on.
- **`shot`** (beat) — the camera verb: `wide` (survey the whole diagram) ·
  `follow` (lean toward the focus) · `push` (a decisive close-in) · `hold`
  (a dead-still emphasis frame).
- **`cut`** (scene) — the transition into the next scene: `dissolve` ·
  `hold` (a section break) · `continue` (momentum into a closely-linked
  scene).
- **`cadence`** (beat) — the rhythm revealed items enter with: `together`
  (all at once) · `cascade` (staggered, in declared order) · `snap` (sharp
  and fast).
- **`palette`** (scene) — accent as *meaning*: `cool` (calm, explanatory) ·
  `warm` (consequential) · `signal` (a warning) · `mono` (a quiet baseline).
- **`treatment`** (scene) — the visual skin: `crisp` (the console look) ·
  `sketch` (the hand-drawn chalkboard).

Use them sparingly and with intent — a film where every beat is `hold` has no
rhythm.

## Animated values — make a number *move*

A `quantities` scene can carry `metrics` — figure cards whose number is
*tweened*. A beat's `set` directive drives the value, and the engine counts it
up to its target rather than cutting to it. Reach for it when the film *earns*
a number on screen — a measured result arriving, not merely appearing.

A `structure` node can also *transform*: give it an `as` representation
(`box` · `matrix` · `vector` · `grid` · `code` · `equation`), and a later
beat's `transform` directive re-binds it — the engine morphs the old into the
new. Use it when one thing genuinely *becomes* another — a vector becoming a
matrix, or one `equation` rewriting into the next (a derivation step).

## The depth bar — a film *interrogates*, it does not admire

The line between a tour and a review: a tour explains the happy path; a review
goes to the edges. Every film must visibly *reason* — including reaching
conclusions uncomfortable for the subject. A verdict is not a compliment: it
states a disposition, names the single biggest residual risk, and says what
you would watch. Allow a non-clean verdict.

Keep each scene legible — one idea per scene; a film is typically 6–8 scenes,
and earns its keep with a `tension` scene (the reasoning layer — trade-offs,
failure modes, the verdict) and at least one quantified claim.
