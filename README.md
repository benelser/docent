# docent

> **A visualization rendering engine for explanation itself.**
>
> A closed grammar of cognitive moves — `frame`, `structure`, `tension`,
> `quantities`, `recap` — rendered by a deterministic Remotion pipeline.
> You author a JSON film spec. The engine renders an HD MP4 that *argues*
> for what it explains.
>
> **v3.0 is the framework/implementation split.** `@docent/kit` is the
> framework. `@docent/core` is the 29-scene default implementation. A
> third party can ship `@theirorg/docent-*` plugins against the same
> public protocol `@docent/core` uses — no fork.

[![release](https://img.shields.io/github/v/release/benelser/docent?label=release&color=32d287)](https://github.com/benelser/docent/releases)
[![corpus](https://img.shields.io/badge/corpus-5%2F5%20PASS-32d287)](#the-corpus)
[![architecture](https://img.shields.io/badge/architecture-v3.0%20framework%2Fimpl-6ea8fe)](#the-architecture)
[![license](https://img.shields.io/badge/license-MIT-c0c5cf)](LICENSE)

## Table of contents

- [Watch docent on four real subjects](#watch-docent-on-four-real-subjects)
- [What changed in v3.0](#what-changed-in-v30)
- [Install](#install)
- [Quick start](#quick-start)
- [Plugin authoring](#plugin-authoring) — *ship `@theirorg/docent-*`*
- [The architecture](#the-architecture)
- [The 29 canonical scenes](#the-29-canonical-scenes)
- [CLI reference](#cli-reference)
- [Versioning](#versioning)
- [Contributing](#contributing)

---

## Watch docent on four real subjects

Four films, four domains, four agent-authored cascades through the same
closed grammar. **No film below shares a template with any other** —
the agent picked the scenes, named the trade-off, committed to the
takeaway. The engine just rendered.

Hover for motion, click for the full HD mp4.

|  |  |
|---|---|
| [![docent reviewing its own architecture](docs/stills/docent-self-preview.gif)](https://github.com/benelser/docent/releases/download/v3.0.0-rc.0/docent-self.mp4) | [![OpenClaw — one local daemon, twenty-two channels](docs/stills/openclaw-ar-preview.gif)](https://github.com/benelser/docent/releases/download/v3.0.0-rc.0/openclaw-ar.mp4) |
| **▶ docent** *— reviewing its own architecture* — 11 min · 52 MB · [▶ play full HD](https://github.com/benelser/docent/releases/download/v3.0.0-rc.0/docent-self.mp4)<br/>`frame · prior-art · structure · progression · compare · tension · quantities · recap` | **▶ OpenClaw** *— one local daemon, twenty-two channels* — 12 min · 80 MB · [▶ play full HD](https://github.com/benelser/docent/releases/download/v3.0.0-rc.0/openclaw-ar.mp4)<br/>`frame · prior-art · structure · walkthrough · structure · tension · quantities · recap` |
| [![The Lethal Trifecta](docs/stills/lethal-trifecta-blog-preview.gif)](https://github.com/benelser/docent/releases/download/v3.0.0-rc.0/lethal-trifecta-blog.mp4) | [![Let the Barbarians In](docs/stills/arxiv-2512-14806-preview.gif)](https://github.com/benelser/docent/releases/download/v3.0.0-rc.0/arxiv-2512-14806.mp4) |
| **▶ The Lethal Trifecta** *— Simon Willison's essay on agent security* — 12 min · 62 MB · [▶ play full HD](https://github.com/benelser/docent/releases/download/v3.0.0-rc.0/lethal-trifecta-blog.mp4)<br/>`frame · structure · passage · walkthrough · quantities · compare · tension · big-idea · recap` | **▶ Let the Barbarians In** *— a recent arXiv paper, fetched as PDF* — 11 min · 56 MB · [▶ play full HD](https://github.com/benelser/docent/releases/download/v3.0.0-rc.0/arxiv-2512-14806.mp4)<br/>`frame · compare · structure · quantities · tension · probe · big-idea · recap` |

Each film went **survey → treatment → spec → judge → render** through
the same engine. The grammar is what's shared. The argument is what
each film commits to.

> **v3.0-rc.0 re-renders.** Every film above is freshly rendered through
> `@docent/cli` against the new `@docent/kit` + `@docent/core` architecture
> (full HD, full Kokoro narration, AAC 48 kHz). The §10 acceptance test —
> a third-party plugin pack rendering end-to-end without forking `@docent/core` —
> is green. The 18-item stabilization sprint that landed the new architecture
> is captured in [`docs/design/v3-stabilization.COMPLETE.md`](docs/design/v3-stabilization.COMPLETE.md).

---

## What changed in v3.0

`v2.5.x` was a monolithic Remotion app: one `packages/engine/`, a 29-arm
switch in `Film.tsx`, a hand-written `film.schema.json`, every TTS
provider and preset hard-coded inside the bin.

`v3.0` carves that monolith into:

- **`@docent/kit`** — the framework. Zero opinions, zero implementations.
  Owns the plugin protocols (`ScenePlugin`, `PresetPlugin`, `FeaturePlugin`,
  `TtsProviderPlugin`), the registries, the spec validator, the cascade
  orchestrator, the Remotion bindings, **and the depthcheck + judge
  contract every scene must honor**.
- **`@docent/core`** — the default implementation. The 29 canonical scene
  plugins, 6 presets, the Kokoro TTS adapter, the default narration and
  audio-rhythm features. Depends on `@docent/kit` and registers every
  default through the framework's public API. **There is no private
  path.** A third-party plugin pack has exactly the same powers and
  constraints as `@docent/core`.
- **`@docent/cli`** — the thin `docent` binary. Loads `@docent/core` by
  default plus any `docent.config.ts` your project ships.
- **`@docent/agent`** — the existing skill / survey / prompt layer
  (consumer of the new public CLI surface; no architectural change).
- **`@docent/tts-*`** — per-provider TTS plugins (Kokoro local, OpenAI,
  ElevenLabs, OpenAI-compatible). Each ships as a separate npm package
  with `peerDependencies` on the underlying SDK — you only pay (in
  bundle, install time, code) for what you install.

The acceptance test (rendered, green): `tests/example-docent-scifi/` is
a third-party plugin pack that adds a custom `holodeck` scene type and
a custom `scifi-noir` preset, registered via `docent.config.ts`, and
renders end-to-end through `docent build` without touching
`@docent/core`. The framework/implementation split is real.

**The scene library is open; the rendering discipline stays closed.**
Anyone can register a scene type. What enforces quality is the
depthcheck + judge contract every scene must declare — not membership
in a curated list. See [§11.5 of the strategy doc](docs/design/plugin-architecture-strategy.md)
for the explicit list of what's open vs. closed.

---

## Install

```bash
bun add @docent/kit @docent/core @docent/cli
```

Or with npm:

```bash
npm install @docent/kit @docent/core @docent/cli
```

The only mandatory peer is `bun` (or Node ≥ 22). Remotion handles its own
runtime. Kokoro voice weights download on first synth.

Paid TTS providers ship separately — install on demand:

```bash
bun add @docent/tts-openai openai                      # peer: openai SDK
bun add @docent/tts-elevenlabs @elevenlabs/elevenlabs-js  # peer: elevenlabs SDK
bun add @docent/tts-compatible                         # OpenAI-compatible endpoints
```

The `peerDependency` model is intentional: a docent install with only
`@docent/kit` + `@docent/core` has *zero* paid-API code in its bundle.

---

## Quick start

### 1. Write a film spec

`films/hello.json`:

```jsonc
{
  "meta": {
    "id": "hello",
    "title": "What docent is",
    "subject": "the visualization rendering engine for explanation",
    "prompt": "explainer",
    "fps": 30,
    "width": 1920,
    "height": 1080,
    "voice": "af_heart"
  },
  "style": { "preset": "engineering" },
  "scenes": [
    {
      "type": "frame",
      "id": "open",
      "kicker": "DOCENT // v3.0",
      "title": "Render an idea",
      "tagline": "Closed grammar, deterministic pipeline, plugin protocol",
      "beats": [
        { "id": "f1", "narration": "Hand the engine a spec. Get back a film that argues for what it explains." }
      ]
    },
    {
      "type": "recap",
      "id": "close",
      "title": "Three packages.",
      "beats": [
        { "id": "r1", "narration": "Kit, core, CLI. Everything else is a plugin." }
      ]
    }
  ]
}
```

### 2. Render it

```bash
docent build hello --scale 0.5
```

The cascade runs in four cached stages — `validate → tts → render` —
and writes `out/hello.mp4`. Re-run; only changed beats re-synthesize and
re-render.

### 3. Watch

```bash
open out/hello.mp4
```

---

## Plugin authoring

> **The "stranger could ship a plugin" bar.** This section is the
> contract: an external developer reads it once and ships
> `@theirorg/docent-*` in an hour.

A plugin is a tagged value. The framework's `engine.use(plugin)` sniffs
`plugin.kind` and dispatches to the right registry. Authors do not
subclass anything.

```ts
type PluginKind = 'scene' | 'preset' | 'tts' | 'feature';

interface PluginBase {
  readonly name: string;     // '@theirorg/docent-finance/ohlc'
  readonly version: string;  // semver
  readonly kind: PluginKind;
}
```

Four runnable reference packs live under [`tests/example-docent-*/`](tests/) — each is a complete `@example/docent-*` package with a working film, ready to fork.

| Pack | What it demonstrates | Film |
|---|---|---|
| [`tests/example-docent-scifi/`](tests/example-docent-scifi/) | A third-party **scene + preset** pack (one `holodeck` scene, one `scifi-noir` preset) — the §10 acceptance test that proves you can extend the surface without forking `@docent/core`. | `scifi-demo.json` |
| [`tests/example-docent-finance/`](tests/example-docent-finance/) | A **vertical scene pack** — two new `scene.type` discriminators (`ohlc`, `candlestick`), each with its own schema branch, depth rules, and judge dimensions. The pattern for `docent-scenes-<vertical>`. | `finance-primer.json` |
| [`tests/example-docent-preset-brand/`](tests/example-docent-preset-brand/) | A **brand preset** (`acme`, navy + gold) — design tokens + visualization style, no scene code. The pattern for `docent-preset-<brand>`. | `acme-quarterly.json` |
| [`tests/example-docent-feature-captions/`](tests/example-docent-feature-captions/) | A **feature plugin** that writes a sidecar SRT next to the rendered mp4 via the `FeaturePlugin.afterRender` hook. The pattern for cross-cutting concerns (captions, transcripts, chapter markers). | `captions-demo.json` |

Treat scifi as the simplest fork point. Reach for finance/brand/captions when your plugin shape matches theirs.

### The four plugin kinds

| `kind` | What it ships | Example |
|---|---|---|
| `scene` | A new `scene.type` discriminator with its own schema branch, Remotion component, depth rules, and judge dimensions. | `@example/docent-scifi/holodeck`, `@example/docent-finance/{ohlc,candlestick}` |
| `preset` | A new visual register — design tokens, visualization style. | `@example/docent-scifi/scifi-noir`, `@example/docent-preset-brand/acme` |
| `feature` | Cross-cutting concerns (captions, watermarks, music). Touches multiple registries; can write sidecars via `afterRender`. | `narrationFeature` in `@docent/core`, `@example/docent-feature-captions` |
| `tts` | A speech provider implementing `TtsProvider`. | `@docent/tts-openai`, `@docent/tts-elevenlabs`, `@docent/tts-compatible` |

### `ScenePlugin` — the load-bearing shape

```ts
import type { ScenePlugin } from '@docent/kit';

export const holodeckPlugin: ScenePlugin<HolodeckSceneSpec> = {
  kind: 'scene',
  name: '@theirorg/docent-scifi/holodeck',
  version: '0.1.0',

  // The discriminator value in spec.scenes[].type. Globally unique
  // within the active engine — conflicts hard-fail at engine.use().
  sceneType: 'holodeck',

  // Which cognitive cluster this scene belongs to — drawn from the
  // CLOSED 7-cluster taxonomy. `null` is reserved for chrome scenes
  // (frame, recap) that bracket the film without a cognitive move.
  cluster: 'experience',

  // JSON Schema fragment for this scene type. The kit assembles the
  // full discriminated union at Engine.schema() call time — no hand-
  // written film.schema.json.
  schema: holodeckSchema,

  // The Remotion-compatible React component that renders the scene.
  component: HolodeckSceneComponent,

  // Optional structural validation beyond JSON Schema. Empty array = clean.
  validate: (scene) => { /* … */ return []; },

  // depthcheck rules contributed by this scene type. The framework
  // refuses to render anything that doesn't declare a contract.
  depthRules: [
    {
      id: 'holodeck-needs-anchor',
      severity: 'warn',
      check: (scene) => scene.title ? null : { path: 'title', message: '…' },
    },
  ],

  // Judge dimensions contributed by this scene type.
  judgeDimensions: [/* … */],

  // R5 cross-bind: scenes declare what they need from the active TTS.
  // The engine checks at spec-resolution time (warn / hard-fail
  // per meta.tts.strict).
  requiresTtsCapabilities: { nativeAlignment: 'word' },
};
```

See [`packages/kit/src/protocols.ts`](packages/kit/src/protocols.ts) for
the full, JSDoc'd type surface and [`tests/example-docent-scifi/src/scenes/holodeck/index.ts`](tests/example-docent-scifi/src/scenes/holodeck/index.ts)
for the working example.

### The cognitive-cluster taxonomy (closed list)

Every `ScenePlugin` declares its cluster from this **closed** list of 7.
The taxonomy is what makes the recommender (`docent scene-fit`)
deterministic even as the library grows. Adding a new cluster is a
major version bump of `@docent/kit`.

| Cluster | The cognitive move |
|---|---|
| `connection` | Relationships, dependencies, links between entities (graph, tree, dependency). |
| `time` | Temporal sequencing, before/after, progressions, timelines, epochs, phases. |
| `flow` | Control flow, data flow, state transitions, pipelines, cycles, feedback loops. |
| `comparison` | Side-by-side options, trade-offs, scoring, ranking, measurements, charts on real axes. |
| `categorization` | Taxonomies, set membership, boundaries between kinds, matrices. |
| `experience` | The human angle — a journey, a perception, a walk through what it feels like. |
| `narrative` | Story, argument, commitment, the rhetorical "we chose X because of Y." |

Chrome-only scenes (`frame`, `recap`) declare `cluster: null` — they
bracket the film but perform no cognitive move. See
[`packages/kit/src/taxonomy/cognitive-clusters.ts`](packages/kit/src/taxonomy/cognitive-clusters.ts)
for the canonical definition.

### The depthcheck + judge contract — what every scene must honor

The framework refuses to render anything that doesn't declare its
depthcheck rules and judge dimensions. **This contract is what enforces
quality across the open library — not membership in a curated list.**

- `depthRules: DepthRule<TSpec>[]` — rules that grade the *spec*. Each
  rule has an `id`, `severity` (`error` | `warn`), and a `check(scene,
  ctx)` function returning a finding or `null`. Rules run as part of
  `docent depthcheck` and gate the cascade.
- `judgeDimensions: JudgeDimension[]` — dimensions the adversarial
  judge grades each film on. Standard dimensions (carried over from
  v2.5.x): `triage`, `where-wrong`, `tests-prove-it`, `the-numbers`,
  `the-trade-off`, `verdict-adjudicates`, `takeaway-earned`. A scene
  plugin can add a dimension specific to its move.

A film the judge rejects does not ship. The loop reliably lifts
first-draft specs by ~7 points on a 30-point scale (carried over from
v2.5.x; v3.0 keeps the same contract).

### Project-side registration: `docent.config.ts`

The CLI walks up from `cwd` looking for a `docent.config.ts` (or `.js`
or `.json`). When found, its `plugins` array is registered on top of
`@docent/core`'s defaults. Conflicts (same `sceneType`, same
`presetName`) hard-fail at `engine.use()` time with both plugin names
surfaced.

```ts
// docent.config.ts
import scifi from '@theirorg/docent-scifi';
import { ohlcPlugin } from '@theirorg/docent-finance';

export default {
  plugins: [...scifi, ohlcPlugin],
};
```

A plugin pack typically exports an array of plugins as its default
export — see [`tests/example-docent-scifi/src/index.ts`](tests/example-docent-scifi/src/index.ts):

```ts
import type { Plugin } from '@docent/kit';
import { holodeckPlugin } from './scenes/holodeck';
import { scifiNoirPreset } from './presets/scifi-noir';

const plugins: ReadonlyArray<Plugin> = [holodeckPlugin, scifiNoirPreset];
export default plugins;
```

### The `peerDependency` model for paid TTS adapters

A paid TTS plugin declares the underlying SDK as a `peerDependency`,
not a hard `dependency`:

```jsonc
// @docent/tts-elevenlabs/package.json
{
  "name": "@docent/tts-elevenlabs",
  "peerDependencies": {
    "@docent/kit": "^3.0.0",
    "@elevenlabs/elevenlabs-js": "^1.0.0"
  }
}
```

A user who wants ElevenLabs runs `bun add @docent/tts-elevenlabs
@elevenlabs/elevenlabs-js`. The SDK is not in `@docent/core`'s dep tree
at all. **The plugin package is the entire feature flag.** This pattern
generalizes to any heavy dependency a plugin may need (a custom Manim
runtime, a remote rendering service, a font subsetter).

A `TtsProviderPlugin` declares its capabilities at the type level:

```ts
interface TtsCapabilities {
  nativeAlignment: 'word' | 'character' | 'chunk' | 'none';
  streaming: boolean;
  ssml: boolean;
  voiceCloning: boolean;
  local: boolean;
}
```

Scenes that need word-level alignment (e.g. `passage`) declare it via
`requiresTtsCapabilities`; the engine refuses to schedule incompatible
combinations at spec-resolution time, not five minutes into a render.

### Publishing checklist

1. Name the package `@theirorg/docent-*` (the `docent-` prefix is the
   convention — `docent-scenes-finance`, `docent-preset-brand`,
   `docent-tts-azure`).
2. Set `"peerDependencies": { "@docent/kit": "^3.0.0" }`. Pin the
   `@docent/kit` major; minor/patch float.
3. Export your plugins as the default export, or expose them
   individually as named exports.
4. Declare every `ScenePlugin`'s `depthRules` and `judgeDimensions` —
   the framework refuses to render scenes without a contract.
5. Publish under MIT (or a compatible OSS license). The reference
   implementation is MIT.

See [`docs/design/plugin-architecture.md`](docs/design/plugin-architecture.md)
for the full design — verbatim interfaces, lifecycle hooks, and the
forward-compat surface for R3 (custom modifiers), R4 (preset
composition), and R6 (inline microsyntax).

---

## The architecture

```
                       films/<id>.json
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  @docent/agent — skills, surveys, prompts (LLM-author layer)       │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  @docent/cli — docent build / validate / depthcheck / hermetic     │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  @docent/kit — THE FRAMEWORK (zero opinions)                       │
│                                                                    │
│    class Engine {                                                  │
│      use(plugin): this              // sniff plugin.kind           │
│      scenes / presets / tts / features / modifiers                 │
│      schema(): JSONSchema7          // computed from registry      │
│      validate(spec): Issue[]                                       │
│      render(spec, opts): Promise<RenderResult>                     │
│    }                                                               │
│                                                                    │
│  Protocols: PluginBase, ScenePlugin, PresetPlugin, FeaturePlugin,  │
│             TtsProviderPlugin, ModifierRegistry (R3 stub)          │
│  Cascade: validate → tts → render. Remotion bindings.              │
└────────────────────────────────────────────────────────────────────┘
                              ▲
              ┌───────────────┼───────────────────┐
              │               │                    │
              ▼               ▼                    ▼
┌──────────────────────┐ ┌───────────────┐ ┌────────────────────────┐
│  @docent/core        │ │ @docent/tts-* │ │  @theirorg/docent-*    │
│    29 ScenePlugin    │ │   kokoro      │ │    scenes (e.g. ohlc)  │
│    6 PresetPlugin    │ │   openai      │ │    preset-fintech      │
│    narration feat    │ │   elevenlabs  │ │    feature-captions    │
│    audio-rhythm feat │ │   compatible  │ │                        │
└──────────────────────┘ └───────────────┘ └────────────────────────┘
```

The discipline: **`@docent/core` is one consumer of `@docent/kit`'s
public API. It is never the privileged path.** A third-party plugin
pack has exactly the same powers and constraints.

For the deep dive — sequencing, protocols verbatim, forward-compat for
R3/R4/R6, and the locked-in commitments — read
[`docs/design/plugin-architecture-strategy.md`](docs/design/plugin-architecture-strategy.md).

The architectural DAG (which depends on which) lives at
[`docs/design/plugin-architecture-dag.md`](docs/design/plugin-architecture-dag.md).

---

## The 29 canonical scenes

The opinionated default `@docent/core` ships. Pick the scene whose
*native shape* is your move — don't force-fit. A quoted text belongs in
`passage`, not `closeup`; an image in `figure`.

| Scene | Cluster | Reach for this when… |
|---|---|---|
| `frame` | *(chrome)* | …you need to set up the subject — kicker, title, tagline, footnote. |
| `recap` | *(chrome)* | …you need to land the takeaway — one held sentence the viewer leaves with. |
| `structure` | connection | …the parts of the subject relate in a graph (entails, causes, depends-on). |
| `tree` | connection | …relationships are hierarchical — a taxonomy, an org chart, a tree. |
| `map` | connection | …entities are positioned by something *other* than time (a landscape, a territory). |
| `walkthrough` | connection | …one instance unfolds step by step — a trace through a specific path. |
| `progression` | time | …stages along a path — linear, cycle, braided, or iterate. |
| `timeline` | time | …explicit epochs / phases / dates on a real time axis. |
| `mechanism` | flow | …how the *machine* works — gears, ports, the inside view of the process. |
| `causal-loop` | flow | …feedback loops, reinforcing / balancing dynamics, system archetypes. |
| `diff` | flow | …before vs. after — what changed in a code or design transformation (PR films). |
| `compare` | comparison | …two or three options held side by side. |
| `quantities` | comparison | …a number that must *land* — figure cards, animated counters. |
| `chart` | comparison | …data on real axes — a curve, bars that grow, a point on a curve. |
| `probe` | comparison | …vary one input, follow the consequence (sensitivity, what-if). |
| `prior-art` | comparison | …survey of what came before — name what others tried, name what's new here. |
| `landscape` | comparison | …a 2D positioning of options against two axes. |
| `venn` | comparison | …set membership — overlap and disjoint regions. |
| `tension` | categorization | …the trade-off, the failure mode, where the design breaks. |
| `closeup` | experience | …annotate one code artifact — a function, a struct, a config block. |
| `journey-map` | experience | …a perception arc — how something *feels* across stages. |
| `passage` | narrative | …annotate a plain text by phrase — a poem, prose, a primary source. |
| `figure` | narrative | …annotate a still image by region — a painting, a map, a photograph. |
| `epigraph` | narrative | …a single quote held alone, attribution beneath. |
| `provocation` | narrative | …the question or claim the film opens with — to pull tension forward. |
| `objection` | narrative | …name the counter-argument the film must answer. |
| `concession` | narrative | …grant what's true on the other side, before pressing yours. |
| `big-idea` | narrative | …the held sentence the rest of the film *earned*. |
| `demonstrate` | narrative | …play the phenomenon itself — an audio clip, an interaction, the thing in motion. |

29 scenes. 7 clusters. The taxonomy is closed; the library is open —
ship a 30th scene in `@theirorg/docent-scenes-x` if your domain has a
move docent didn't.

---

## CLI reference

`@docent/cli` is intentionally thin — every subcommand is a few lines
on top of `@docent/kit`'s public Engine surface.

```
docent — render explanatory films via @docent/kit.

USAGE
  docent <command> [args]

COMMANDS
  build <film-id>      Render a film to MP4 at out/<film-id>.mp4.
  validate <film-id>   Structurally validate a film spec via engine.validate().
  depthcheck <film-id> Aggregate every plugin's depthRules over a film spec.
  hermetic             Render the 4 gallery fixtures end to end.
  help                 Print this usage and exit.

BUILD FLAGS
  --scale <n>          Render scale (0.25, 0.5, 1). Default: 1.
  --concurrency <n>    Render frame concurrency. Default: Remotion's auto.
  --still <s>          Render a single still at second offset s.
  --skip-tts           Skip the TTS stage — produces a silent mp4.
  --output-dir <p>     Override the output directory.
  --films-dir <p>      Override the films/ directory.
  --project-root <p>   Override the project root (config + entry generation).

EXAMPLES
  docent build linear-algebra --scale 0.5
  docent validate kubernetes-pr
  docent depthcheck euclid-primes
  docent render-check openclaw-ar
  docent grammar-check
  docent scene-fit list
  docent scene-fit recommend linear-algebra --top 8
  docent doctor
  docent hermetic --scale 0.5
```

### `docent build`

Runs the full cascade: validate → tts (Kokoro by default) → render.
Per-beat audio is mounted into the Remotion composition; per-stage
caching means re-runs only synthesize and render what changed.

### `docent validate`

Runs `engine.validate(spec)` — JSON Schema (the computed union of every
registered scene's schema fragment) plus each plugin's structural
`validate(scene, ctx)` hook. Exit code is non-zero on any `error`-level
issue.

### `docent depthcheck`

Aggregates every plugin's `depthRules` over the spec and reports
findings. The cascade gates on this in CI — a depth regression is a
hard fail. The judge surface (the 7-dimension grader) runs on top of
depthcheck; see [`docs/design/plugin-architecture-strategy.md`](docs/design/plugin-architecture-strategy.md)
§4.2.

### `docent render-check`

Holds the **visual-integrity invariant**:

> A film with narration cannot ship blank scene bodies.

The build path is the kind that can fail silently — audio plays, chrome
renders, but a scene's body content (nodes, edges, panels, quantities)
stays at frame-0 state because a reveal-gate never fires. `render-check`
catches it: builds at low scale + `--skip-tts`, then per scene with
narration samples three frames at 10% / 50% / 90% of the window, hashes
each, and **fails if a scene's three samples are pixel-identical**.

```bash
docent render-check openclaw-ar
```

Exit code 0 on full pass, 4 when at least one narrated scene is static.
A per-film sidecar (`out/.render-check-<id>/check.json`) records every
sample for follow-up forensics.

### `docent doctor`

The **plugin conformance** check. Reads the engine registry (core + any
plugins from `docent.config.ts`) and grades every registered plugin
against the protocol contract.

```bash
docent doctor          # human-readable
docent doctor --json   # machine-readable for CI gates
```

Reports:

- **ERROR** — structural violations that will fail renders (missing
  `sceneType`, bad `cluster`, missing `schema` or `component`, bad
  signal weights, registry conflicts). Exit code **6**.
- **WARN** — valid but missing things authors want (no `cue` for
  `scene-fit list`, no `signals` on a non-chrome scene, undeclared
  `depthRules`/`judgeDimensions` arrays). Exit code **0** — warnings
  are informational.
- **INFO** — counts + cluster distribution for orientation.

Run from a project root and `doctor` sees the user's plugins too —
the line `+2 from docent.config.ts` confirms the pack is loaded.
This is the first command extension authors should reach for after
`bunx tsc --noEmit`: it answers "did I honor the contract?" without
needing to render a film.

### `docent scene-fit`

The **agent-facing introspection** over the 29-scene grammar — the
recommender that closes the "which scene fits which cognitive move"
loop. Without it, an undirected agent reflex-defaults to
`frame / structure / compare / tension / recap` on every film, producing
tour-shaped specs instead of arguments.

```bash
# enumerate registered scene plugins by cluster, with a "reach for it when" cue
docent scene-fit list [--json]

# read analysis/<id>.md and recommend the top N scene types with rationales
docent scene-fit recommend <subject-id> [--top N] [--json]
```

`list` reads from the engine registry, so third-party plugins
registered via `docent.config.ts` surface alongside core. `recommend`
runs a rule-based mapper (NOT an LLM call) — every signal needle in
the survey contributes a weighted vote toward one scene type. When the
top N is a subset of the default-rut five, the result raises a
`warningOnDefault` flag prompting the author to re-read the survey for
the more specific primitives they may have skipped.

### `docent grammar-check`

The **closed-grammar invariant** — one command, three asks:

1. **Coverage** — every registered `ScenePlugin`'s `sceneType` appears
   in at least one demo film in the cover set. A scene plugin nobody
   ever uses is dead weight; a scene plugin nobody can use is a bug.
2. **Taxonomy** — every registered `ScenePlugin` declares a `cluster`
   field from the closed 7-cluster taxonomy (or `null` for chrome).
   The recommender (`docent scene-fit`) navigates by these clusters;
   a missing or typo'd cluster breaks scene-fit.
3. **Pipeline** — every film in the cover set survives validate → render
   → `render-check`. A scene plugin that can't make it through the
   cascade end-to-end isn't usable.

The default cover set is **six small demo films** that union-cover all
29 canonical scene types in minutes, not hours:
`grammar-check` (15 scenes), `rhetorical-primer` (4 unique),
`sprint-b-composition-demo` (7 unique via embeds), `causal-loop-primer`,
`multi-region-db`, `prior-art-primer`.

```bash
docent grammar-check
```

Per-scene status table prints the cluster tag + which film(s) exercise
it. Exit code 0 on green; 5 on any taxonomy, coverage, or pipeline
failure. Third-party plugin packs registered via `docent.config.ts`
are folded in automatically — register a `@yourorg/docent-finance/ohlc`
scene and the next grammar-check will surface "uncovered" until a demo
film cites it.

### `docent hermetic`

Renders the 4 gallery fixtures (`linear-algebra`, `kubernetes-pr`,
`euclid-primes`, `stopping-by-woods`) end to end through the same
`@docent/cli` path a user takes. The CI signal for "v3.0 still ships
the gallery."

### The corpus

The four gallery fixtures + the kitchen-sink test — every one passes
the depthcheck contract through `@docent/cli`:

| Film | Subject | Domain | Verdict |
|---|---|---|---|
| `linear-algebra` | The dot product as the keystone operation | Math | 26 / 30 PASS |
| `kubernetes-pr` | The Kubernetes scheduler heap refactor | Software | 26 / 30 PASS |
| `euclid-primes` | Euclid's proof of infinitely many primes | Math proof | 23 / 30 PASS |
| `stopping-by-woods` | A close reading of Robert Frost | Literature | 27 / 30 PASS, first try |
| `grammar-check` | Kitchen-sink scene grammar test | Engineering | (test fixture) |

Specs live in `films/*.json`. Render any of them: `docent build <id>`.

---

## Versioning

The `@docent/*` packages move in lockstep at the major. Each package's
`peerDependencies` pin `@docent/kit: ^X.0.0` where X is the current
major. Inside a major, packages move independently.

| Change | semver impact |
|---|---|
| Breaking a protocol in [`packages/kit/src/protocols.ts`](packages/kit/src/protocols.ts) (`ScenePlugin`, `PresetPlugin`, `FeaturePlugin`, `TtsProviderPlugin`, `ModifierRegistry`). | **major** |
| Removing a `@docent/kit` public export. | **major** |
| Removing the `engine.use(plugin)` API or any `Engine` method. | **major** |
| Changing the closed cognitive-cluster taxonomy (adding or removing a cluster). | **major** |
| Removing a canonical scene from `@docent/core`. | **major** |
| Adding an optional field to a protocol interface. | **minor** |
| Adding a new scene plugin to `@docent/core`. | **minor** |
| Adding a new CLI subcommand. | **minor** |
| Tightening a depth rule's `check` (false-positive surface narrows). | **patch** |
| Loosening a depth rule's `check` (false-positive surface widens). | **minor** (behavioral change) |
| Bug fixes that don't change a public type or visible behavior. | **patch** |

What v3.0 locked in **permanently** (only recoverable through a v4):

- The plugin API is public. Breaking any protocol is a breaking change.
- Registry-based dispatch — no fast path that bypasses the registry.
- Schema is computed from the registry — `film.schema.json` is a build
  artifact, not a hand-written source of truth.
- The `@docent/*` npm scope.
- The framework/implementation split — no private path from
  `@docent/core` into `@docent/kit` internals.
- The open scene library — verification, if it ever ships, is layered
  on top as a quality signal, never as a gate.

See [`docs/design/plugin-architecture-strategy.md`](docs/design/plugin-architecture-strategy.md)
§12 for the full list.

---

## Contributing

### To `@docent/core` — proposing a new canonical scene

The bar for landing a scene type in `@docent/core` is high: **the scene
must be a cognitive move, not a visual treatment.** Concretely:

1. The scene's *native shape* is something existing scenes can't carry
   without force-fit. A `treemap` is a visual treatment of `tree`; a
   `sankey` is a distinct cognitive move (continuous flow with
   conserved magnitude).
2. The scene declares a `cluster` from the 7-closed list. If no cluster
   fits, the proposal needs to extend the taxonomy — a major version
   bump of `@docent/kit`, separately considered.
3. The scene contributes `depthRules` that catch the *failure mode
   specific to this move*. A `tension` scene without a named
   trade-off fails its own depth rule.
4. The scene contributes `judgeDimensions` if the standard 7 don't
   capture what makes *this* scene's quality.
5. At least one corpus film uses the scene end-to-end, and the
   acceptance test (`docent hermetic`) is green.

Open an issue with the proposed scene's name, cluster, depth rules,
and a paragraph on the cognitive move it makes that the existing 29
can't. PRs without an accepted proposal are not reviewed — the bar is
deliberately high.

### To ship outside `@docent/core` — the easy path

If your scene is domain-specific (an OHLC chart for finance, a Sankey
for material flow, a UML diagram for software) — ship it as
`@theirorg/docent-scenes-x` and skip the core PR. The plugin protocol
is the public contract; there is no second-class citizenship.

### To `@docent/kit` — protocol changes

`@docent/kit` is the frozen surface. Protocol changes need a written
case for *why* the existing protocol can't carry the use case. The
`FeaturePlugin` lifecycle hooks are intentionally open — most
"protocol change" instincts are actually "new optional `FeaturePlugin`
hook" requests, which are additive and non-breaking.

---

## License

MIT (see [`LICENSE`](LICENSE)). All `@docent/*` packages publish under
the same scope; the reference plugin pack at
[`tests/example-docent-scifi/`](tests/example-docent-scifi/) is the
working starter you can fork.

---

> *"docent gets better as it runs."* The judge grades every film. The
> revise loop closes the gap. The outer flywheel distills recurring
> weaknesses back into the brief. Each generation raises the floor for
> the next.
