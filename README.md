# docent

Turn any **codebase** — or any **pull request** — into a **narrated, animated
explainer**: a short film that shows and explains software the way a museum
docent walks you through an exhibit.

docent works in two modes:

- **PR review** — `docent pr <repo> <pr#>`. A pull request reviewed the way a
  principal engineer would: why the change exists, the core before → after,
  what could break, a verdict. Built for the sprawling AI-agent PR no human can
  review as a wall of text — the film *triages* it.
- **Architecture review** — `docent ar <repo> [subsystem]`. A whole system, or
  one subsystem, in depth: the components, the flow, the failure modes, the
  trade-offs.

## How it works

**Content is data; the engine is generic.** A coding agent surveys a subject
and authors one declarative JSON file — a *film spec*. The engine renders it.
The engine knows nothing about any specific repository.

The pipeline is a cascade, cached per stage:

```
survey   →  films/<id>.json       the spec — authored by the agent
tts      →  public/audio/<id>/*   Kokoro narration, beats in parallel
clips    →  public/clips/<id>/*   optional Manim inserts
render   →  out/<id>.mp4          Remotion, frame-parallel
```

## Two packages

docent is a bun workspace of two packages, split along the line between the
*runtime* and the *brain*:

- **`@docent/engine`** — the Remotion render engine, the cascade pipeline, and
  the `docent` CLI. The runtime.
- **`@docent/agent`** — the agent layer: review skills, the structured survey
  prompt, the depth-review sub-agent. Distributed via
  [APM](https://github.com/microsoft/apm) so docent rides inside any coding
  agent (Claude Code, Codex, …) rather than being bound to one.

The boundary between them is the film spec JSON Schema
(`packages/engine/schema/film.schema.json`). Any agent that produces a
schema-valid, depth-checked spec works — docent is not bound to Claude.

## The docent CLI

```
docent doctor                    validate the environment, per cascade stage
docent pr    <repo> <pr#>        a PR-review film
docent ar    <repo> [subsystem]  an architecture-review film
docent score <owner/repo> <pr#>  the triggering matrix — skip / glance / full
docent depthcheck <film>         the depth contract over a spec
docent hermetic [id] [--full]    end-to-end cascade validation
docent build <film> [--still N]  run the cascade for a known spec
docent env                       resolved paths and versions
```

## Depth enforcement

A docent film must *interrogate*, not admire. Three layers enforce it:

1. the structured survey — `packages/agent/prompts/survey-template.md`
2. `docent depthcheck` — a machine-checkable contract: a risk node, a
   quantified claim, a failure-modes scene, a verdict that adjudicates
3. the depth-review sub-agent — `packages/agent/agents/depth-review.md`

## The hermetic harness

`docent hermetic` validates the engine cascade end-to-end against pinned
fixtures (`hermetic/fixtures.json`): doctor green, spec valid, depth contract
met, cascade renders, output a valid video. It is also the eval rig for the
depth-prompt work.

## The stack — all local, no API keys

| layer            | tool                                             |
|------------------|--------------------------------------------------|
| render engine    | **Remotion** — typed React/TSX, frame-parallel   |
| precise motion   | **Manim** — optional embedded transparent clips  |
| narration        | **Kokoro** — local neural TTS (`af_heart`)       |
| pipeline runtime | **bun**  ·  encode/mux: **ffmpeg**               |

## Setup

```
bun install      # the engine + workspace
uv sync          # Kokoro TTS + Manim
docent doctor    # confirm the cascade is ready
```

## Layout

```
docent/
  packages/
    engine/   @docent/engine — src/ (engine), pipeline/, cli/, schema/
    agent/    @docent/agent  — APM package: instructions/, prompts/, agents/
  films/      film specs — one JSON per subject
  analysis/   the agent's survey notes
  hermetic/   fixtures + the harness report
  public/     rendered narration + clips (cache)
  out/        rendered films
```
