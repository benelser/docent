# docent

Turn any **codebase** — or any **pull request** — into a **narrated, animated
explainer**: a short film that shows and explains software, the way a museum
docent walks you through an exhibit. Point it at a repository, give it a
prompt, and it runs the whole pipeline.

docent works in two modes:

- **Architecture review** — the whole system, or a subsystem, in depth.
- **PR review** — a pull request, reviewed the way a principled engineer
  would: the motivation, the design, the core diff, the ripple, the verdict.

It is generic machinery. A coding agent surveys the subject and writes a
declarative **film spec**; the engine renders it.

## How it works

**Content is data; presentation is the engine.** You never write animation
code for a particular codebase — you author one JSON file (`films/<id>.json`)
describing scenes, narration, and a diagram of nodes and edges. The engine
knows nothing about any specific repository.

The pipeline is a cascade, parallel at every stage:

```
survey   →  films/<id>.json       the spec  (authored by the agent)
tts      →  public/audio/<id>/*   Kokoro narration, beats in parallel
clips    →  public/clips/<id>/*   optional Manim inserts, in parallel
render   →  out/<id>.mp4          Remotion, frames in parallel
```

Stages are decoupled and individually cached — narration never blocks
rendering, and re-running redoes only what changed.

## The stack — all local, no API keys

| layer            | tool                                             |
|------------------|--------------------------------------------------|
| render engine    | **Remotion** — typed React/TSX, frame-parallel   |
| precise motion   | **Manim** — optional embedded transparent clips  |
| narration        | **Kokoro** — local neural TTS (`af_heart`)       |
| pipeline runtime | **bun**  ·  encode/mux: **ffmpeg**               |

## Setup

```
bun install      # Remotion + React engine
uv sync          # Kokoro TTS + Manim
```

## Use

1. Open a coding agent here with **`AGENTS.md`** as its brief.
2. Tell it the repository and the prompt.
3. It surveys the code, writes `films/<id>.json`, and runs the build.

```
bun run build --film <id>               # full cascade → out/<id>.mp4
bun run build --film <id> --still 4980  # one frame, for quick checks
bun run studio                          # live preview in Remotion Studio
```

## Layout

```
docent/
  AGENTS.md       brief for the coding agent
  films/          film specs — one JSON per subject
  src/            the engine — scene templates, components, layout
    engine/         spec loader, timing, layout math
    components/     SceneFrame, Card, Connector, Pulse, Narration
    scenes/         TitleScene, DiagramScene, RecapScene
  pipeline/       build.ts (cascade), tts.py (Kokoro), clips.py (Manim)
  manim/          optional Manim clip scenes, per film
  analysis/       the agent's survey notes
  public/         rendered narration + clips
  out/            rendered films
```
