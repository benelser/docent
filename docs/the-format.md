# Docent — the format

> **Markdown for video. Built for LLMs.**

Docent is a file format for **structured explainer video**. You write JSON. An engine renders it to a narrated MP4. A grammar of cognitive moves keeps the form coherent. A depth contract keeps the *content* honest.

A docent film is one file:

```json
{
  "meta": { "id": "openclaw-ar", "title": "OpenClaw — one daemon, twenty-two channels", "fps": 30 },
  "scenes": [
    { "type": "frame", "title": "OpenClaw", "heading": "One daemon, twenty-two channels" },
    { "type": "prior-art", "systems": [...], "dimensions": [...], "novelty": {...} },
    { "type": "structure", "nodes": [...], "edges": [...] },
    { "type": "tension", "chosen": [...], "rejected": [...], "risks": [...] },
    { "type": "recap", "points": ["..."] }
  ]
}
```

That's the whole format. Run `docent build openclaw-ar` and a 12-minute narrated film lands at `out/openclaw-ar.mp4`.

## Why structure

Most video tools start with the canvas — a timeline, layers, keyframes. Docent starts with **the moves an explanation can make**. There are 29:

```
connection      structure · walkthrough · tree · map
time            timeline · progression
flow            diff · mechanism · causal-loop
comparison      compare · landscape · quantities · chart · prior-art · venn · probe
categorization  tension
experience      journey-map · closeup
narrative       frame · passage · figure · demonstrate · big-idea · recap
                concession · epigraph · objection · provocation
```

These are a **closed taxonomy**. Adding a 30th scene type is a major version bump — that restraint *is* the format. If you can author your subject with these 29 moves, you can author it with docent. If you can't, you probably don't have an explanation yet.

## Why this matters in an LLM world

An LLM authoring video by itself produces slop. Visual filler. Narration over moving stock images. No argument.

The reason isn't that LLMs can't be creative — it's that the *output medium* has no contract. There's no spec the model can fail. There's no quality bar that refuses to render. Whatever the model emits, the renderer renders.

Docent inverts this. The contract is the format:

- **Every scene declares its schema.** A `prior-art` scene without prior systems doesn't render. A `recap` without three points doesn't render. The author finds out *before* the render burns minutes.
- **Every scene declares its depth rules.** A `tension` that names a chosen path without naming what was rejected doesn't pass `docent depthcheck`. The film argues the trade-off, or it doesn't ship.
- **Every scene declares its cognitive cluster.** The LLM picks moves the way a writer picks paragraphs — by what the move *does*, not by what it looks like.

The result: LLM-authored films that aren't slop. They're argued. Auditable. Diffable. The file is the source; the render is the artifact.

## What a docent looks like in practice

Four real films, four real subjects:

| Subject | Scenes | Domain |
|---|---|---|
| docent reviewing its own architecture | frame · prior-art · structure · progression · compare · tension · quantities · recap | software |
| OpenClaw — one local daemon, twenty-two channels | frame · prior-art · structure · walkthrough · structure · tension · quantities · recap | software |
| The Lethal Trifecta — Simon Willison's essay on agent security | frame · structure · passage · walkthrough · quantities · compare · tension · big-idea · recap | explainer |
| *Let the Barbarians In* — arXiv:2512-14806 | frame · compare · structure · quantities · tension · probe · big-idea · recap | research |

Same engine. Same grammar. Different subjects, different scenes, different *arguments*. Watch them at [the gallery](#).

## The extension surface

Docent ships as four moving parts:

- **`@docent/kit`** — the framework. The plugin protocols, the Engine, the cascade, the Remotion bindings. Zero opinions, zero implementations.
- **`@docent/core`** — the 29 canonical scenes, the 6 presets, the Kokoro TTS adapter, the default narration. Registered through the same public protocol third-party packs use.
- **`@docent/cli`** — the `docent` binary. Build, validate, depthcheck, render-check, scene-fit, style, doctor.
- **`@docent/agent`** — the LLM-side scripts. Survey a subject. Author a treatment. Compile a spec. Review a draft.

Anyone can ship `@yourorg/docent-*` plugin packs that register through the same path `@docent/core` uses. There is no private path. Seven reference packs ship today — one per documented extension hook (scene, preset, preset composition, feature, modifier registry, microsyntax preprocessor, TTS adapter).

## What docent isn't

- Not a video editor. There is no timeline, no canvas, no keyframes.
- Not a generator. Docent doesn't invent content — it renders a spec you (or an agent) wrote.
- Not a deck tool. Slides are static; docent scenes are temporal and narrated.
- Not Sora / Veo / Pika. Those generate video from a prompt. Docent renders an *explanation* from a structured grammar.

The distinction matters. Generators replace the author. Docent gives the author — human or LLM — a grammar to author in.

## What we're shipping next

This is v3.0 — the format and the engine are stable. What lands next sits on top:

- **`docent.studio`** — this site. The format manifesto, the docs, eventually the share surface.
- **`docent shorts`** — a 60-second format mode for shareability.
- **`docent studio` (the CLI command)** — live preview as you edit the spec.
- **Domain packs** — `@docent/medicine`, `@docent/security`, `@docent/education`. Vertical scene libraries.
- **Depth scoreboard** — public quality signal on every shared film.
- **Translation pipeline** — one spec, N voice languages.

The roadmap is in [docs/design/v3-roadmap.md](https://github.com/benelser/docent/blob/main/docs/design/v3-roadmap.md).

## Install

```bash
npm install @docent/cli @docent/core @docent/kit
# or
bun add @docent/cli @docent/core @docent/kit
```

Write a spec at `films/<id>.json`. Run `docent build <id>`. Watch.

The grammar's in [the README](https://github.com/benelser/docent#plugin-authoring). The protocols are JSDoc'd in [`@docent/kit/protocols.ts`](https://github.com/benelser/docent/blob/main/packages/kit/src/protocols.ts). The seven reference packs are at [`tests/example-docent-*/`](https://github.com/benelser/docent/tree/main/tests).

---

*Docent is open source under the MIT license. The repo lives at [github.com/benelser/docent](https://github.com/benelser/docent).*
