# docent — Agent Instructions

You turn what can be learned about a **codebase** into a **narrated, animated
explainer** — a short film that *shows* and *explains* software, the way a
museum docent walks a visitor through an exhibit.

docent is **generic machinery**. Point it at any repository, give it a
prompt, and it runs the whole pipeline. It works in **two modes**:

- **Architecture review** — the whole system, or a subsystem, in depth: the
  components, how control and data flow, the idioms that make it what it is.
- **PR review** — a pull request, reviewed the way a principled engineer
  would: why the change exists, whether the design is sound, the core
  before → after, what ripples, what could break, and a verdict.

Either way the job is the same: **survey it, write a film spec, run the
build.** A film is a flowing narrative, never a checklist. This file is your
brief.

## The core principle

**Content is data; presentation is the engine.** You never write animation
code for a particular codebase. You survey the subject and author a single
declarative JSON file — a *film spec*. The engine renders it. The engine knows
nothing about any specific repository.

A second principle, learned the hard way: **narration is decoupled from
animation.** Speech is its own pipeline stage with its own cache. No renderer
ever blocks on TTS.

## The stack

All local — no API keys, no cloud.

- **Remotion** — the render engine. Scenes are typed React/TSX components,
  driven entirely by the film spec. Embarrassingly parallel: it shards frames
  across every core.
- **Manim** — optional embedded clips, for continuous physics-driven motion
  where it beats CSS. Rendered as transparent video, composited by Remotion.
- **Kokoro** — local neural TTS (voice `af_heart`).
- **bun** — runs the pipeline and the Remotion CLI. **ffmpeg** — encode/mux.

One-time setup: `bun install` and `uv sync`.

## The pipeline — a cascade, parallel at every stage

```
survey   →  films/<id>.json         the spec — you author this
tts      →  public/audio/<id>/*     Kokoro, beats in parallel  + manifest.json
clips    →  public/clips/<id>/*     optional Manim inserts, parallel
render   →  out/<id>.mp4            Remotion, frames in parallel
```

Stages are decoupled and individually cached — re-running redoes only what
changed. Run the whole cascade with `bun run build --film <id>`.

## The workflow — every subject

1. **Survey.** Read the real code, the real diff, the real history. Never
   guess. Write findings to `analysis/<id>.md`, citing concrete files and
   commits. Every box in the film must trace to something real.
2. **Author the spec.** Write `films/<id>.json` — scenes, narration, the
   diagram of nodes and edges. Register it: add one line to `FILMS` in
   `src/engine/spec.ts`. The spec format is below.
3. **Build.** `bun run build --film <id>`. This runs TTS, then renders.
4. **Verify.** Spot-check frames (`bun run build --film <id> --still <frame>`)
   and watch the result. Fix the spec; rebuild (TTS is cached).

## The film spec format

`films/<id>.json`:

```jsonc
{
  "meta": {
    "id": "codex", "title": "...", "subject": "...",
    "repo": "...", "prompt": "architecture review",
    "fps": 30, "width": 1920, "height": 1080, "voice": "af_heart"
  },
  "scenes": [ /* see scene types */ ]
}
```

Every scene has: `id`, `type`, `accent` (one of `blue cyan green amber rose
violet`), `kicker` (the small corner label), and `beats`. A **beat** is one
unit of narration — `{ "id": "...", "narration": "..." }` — plus directives
that depend on the scene type. Beat timing is set automatically by the length
of its rendered speech. Spell acronyms for the voice: `C-L-I`, `M-C-P`.

**`title`** — the opening card. Fields: `title`, `tagline`, `footnote`.
Each beat carries `show: "title" | "tagline" | "footnote"` — the element it
brings on screen.

**`diagram`** — the workhorse: a graph of boxes and arrows. Edges are live —
once drawn they carry flowing data. Fields:
- `heading` — the scene's on-screen title.
- `grid: { cols, rows }` — node positions are grid cells (fractional allowed).
- `nodes: [{ id, label, sub, tag?, col, row, accent?, emphasis?, wide? }]` —
  `tag` is a short corner marker (`trait`, `×27`, `crate`).
- `edges: [{ id, from, to, kind?, label? }]` — `kind: "escalate"` draws a
  curved feedback arrow with an optional `label`.
- Beat directives:
  - `reveal: ["nodeId", "edgeId", ...]` — ids that appear at this beat
    (cumulative — once revealed, they stay).
  - `focus: ["id", ...]` — ids to emphasize; everything else dims.
  - `pulse: [["from","to"], ...]` — packets that travel those edges during
    the beat, staggered in order. Used to trace flow.

**`sequence`** — a sequence diagram: actors with lifelines, and messages that
arrive one beat at a time. The way to show a request, or a unit of data,
moving *through* a system over time. Fields:
- `heading`; `actors: [{ id, label, sub? }]` (3–5 read best).
- Each beat carries `message: { from, to, label, kind? }` —
  `kind: "call" | "return"`. `from === to` draws a self-message.

**`code`** — a deep-dive on real source: a syntax-highlighted code window.
Fields: `heading`, `file`, `lang` (`rust`, `go`, `typescript`, `yaml`, …),
`code` (the excerpt, ≤ 20 lines). Each beat carries
`highlight: [firstLine, lastLine]` — the range to spotlight — and an optional
`note`. Use it for the idiomatic detail a technical audience wants.

**`diff`** — the PR-review workhorse: a unified diff. Same fields as `code`,
but each line of `code` begins with a marker — `+` added, `-` removed, ` `
context — which the engine strips and tints (green / rose). Beats `highlight`
a hunk. Use it to show a change *before → after*.

**`sketch`** — the hand-drawn chalkboard, for the *reasoning* layer (roughjs,
the engine behind Excalidraw). Where the crisp scenes show the system **as
built**, the sketch shows the **thinking** — trade-offs, the alternative not
taken, the failure modes, the verdict. Same fields as `diagram`; a node may be
`kind: "risk"` (rose, hand-circled) or `kind: "rejected"` (crossed out). Use it
for the depth layer below; reach for it once or twice a film, never more.

**`recap`** — the closing list. Fields: `heading`, `points: ["...", ...]`.
Each beat carries `reveal: N` — the number of points visible by that beat. In
PR films, prefer a `sketch` *verdict* scene over a plain recap.

Keep each scene legible: **5–9 nodes**, one idea per scene, 30–90 s. A film is
typically 6–8 scenes — and earns its keep with **a `sequence` scene** (data
flow over time) and **a `code` scene** (an idiomatic deep-dive), not boxes alone.

## The depth bar — a film *interrogates*, it does not admire

The line between a tour and a review: a tour explains the happy path; a review
goes to the edges. Every film must visibly *reason*, including reaching
conclusions uncomfortable for the subject. The survey notes (`analysis/*.md`)
must carry a **"hard parts"** section so the depth is found before the spec is
written.

**Architecture review** — survey languages, build, entry points, the
components and how control and data flow. Then go deeper: for every arrow,
*what happens when it fails*; name delivery/ordering/consistency with the real
words (at-least-once, **duplicates**, idempotent, eventually consistent); the
serialization points and which inputs *cannot* be back-pressured; every piece
of mutable state and what invalidates it; **at least one real number** (Big-O,
a latency, a hard cap, quorum math); the trust boundary; and — mandatory —
*"the designers chose X over Y; X costs Z."* ~8 scenes: `title`; the system
`diagram`; a `diagram` per subsystem; a `code` deep-dive; a `sequence` of one
real operation; **a `sketch` "failure modes & trade-offs" scene**; a `recap`
that is an honest **scorecard** (strengths, fragilities, *when not to choose
this*). `films/kubernetes.json` is the worked example.

**PR review** — find a substantive merged PR (`gh pr list --json
number,title,additions,deletions`; skip dep bumps and generated code; run `gh`
with `GITHUB_TOKEN` unset if auth fails). Review it as a principal engineer:
*why this shape* and one named **alternative**; one weird-input and one
at-scale **failure mode**; whether the **tests prove** the specific claimed
behavior (naming that tests exist is worth nothing); how you'd **know in
prod**; version-skew **compatibility**; **rollback cost and ownership**; and a
**verdict that adjudicates** — a disposition, the single biggest residual
risk, and what you'd watch. ~6 scenes: `title`; a `diagram` of what it touches
and why; a `diff` of the core before → after; a second `diff`/`code` for the
mechanism; a `diagram` of the evidence and consequences (with **one risk node**,
`kind: "risk"`); and a `sketch` **verdict**. Reason as prose — **never** a
checklist. Allow a non-clean verdict. `films/kubernetes-pr.json` is the worked
example.

Other subjects follow the same shape: survey, spec, build.

## Rules

- **Accuracy over polish.** Depict only what is in the code or the diff. Every
  node maps to something real — name it in `analysis/`. Never invent a
  component, a connection, or a change.
- **Explain, don't enumerate.** Narration conveys *why* something exists and
  how it fits — not a recital of names.
- **One idea per scene.** 5–9 nodes. Clear labels.
- **Extend the engine, not a scene.** If a film needs a primitive that does
  not exist, add it to `src/components/` or a new scene type — never hard-code
  a subject into the engine.
- **Verify.** Render stills as you go; watch the final film before claiming
  it done.
