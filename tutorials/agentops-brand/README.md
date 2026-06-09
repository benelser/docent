# `@agentops/brand-pack` — the AgentOps preset

A real third-party brand pack for [docent](https://github.com/bjelser/docent),
authored to give the `agentops-lunch-and-learn` film a single, propagated
visual identity. Sits alongside `tutorialBrandPreset` — the tutorial scaffold
— as the first non-teaching preset shipped on the `PresetPlugin` extension
point.

## What this preset is

A `PresetPlugin` whose registered id is `'agentops'`. A film opts in by
writing:

```jsonc
{
  "meta": { /* … */ },
  "style": { "preset": "agentops" }
}
```

The engine then resolves every scene's tokens against the AgentOps register:
deep-navy ground, Inter + JetBrains Mono typography, and six accent hues
that map 1:1 onto the runbook's span taxonomy.

## The colour decisions — span taxonomy is the source of truth

The runbook (`~/ventures/agentops/runbook/02-the-agentops-taxonomy.md`)
ships the canonical span taxonomy diagram
(`~/ventures/agentops/diagrams/02-span-taxonomy.png`). Every span type
already has a colour readers learn to recognise. The preset honours those
exact hues:

| Span type           | Hex       | Meaning                                              |
|---------------------|-----------|------------------------------------------------------|
| `plan_step`         | `#a78bfa` | reasoning — the root of an agent trace               |
| `llm_call`          | `#4ade80` | one model invocation: tokens, latency, cost          |
| `tool_call`         | `#c08552` | external action — earthy tan, "we touched the world" |
| `agent_decision`    | `#5cb6ff` | the fork point — which path was chosen               |
| `flow_checkpoint`   | `#9ca3af` | sibling marker — gray by design, neutral             |
| `hallucination`     | `#ef4444` | the only saturated red on screen                     |

### Mapping six runbook hues onto a closed enum

The kit's `AccentTokens` interface is a CLOSED enum of six names —
`blue · cyan · green · amber · rose · violet`. The six agentops hues
have to MAP onto those keys. Each existing scene component already reads
`accent.blue` as its default, so the most-used span colour (the one the
"don't-pick-a-key" scenes should fall through to) goes there.

```
accent.blue   → agent_decision   (default — closest to docent's neutral blue)
accent.violet → plan_step        (semantically nearest — purple)
accent.green  → llm_call         (a brighter, more saturated green than neutral)
accent.amber  → tool_call        (warm tan — sits as the "warm" channel)
accent.cyan   → flow_checkpoint  (the muted/neutral channel — gray)
accent.rose   → hallucination    (THE red — saturated, only one on the palette)
```

## Typography

Engineering / technical, but not cold:

- `sans`: **Inter** for chrome, headings, narration captions.
- `mono`: **JetBrains Mono** for code (closeup scenes) and span-name keys.

Both families are already preloaded by `@bjelser/core`'s
`_shared/fonts.ts` module via `@remotion/google-fonts` — the preset just
declares them in the CSS family stack; no additional loader hook is needed
in this pack.

## Token tuning beyond colour + type

A few small, deliberate departures from neutral:

- **Background ramp is navy** (`#0b1220` base) rather than neutral's
  near-black (`#0a0c10`). Reads as the night-shift observability console
  without the console-bleak.
- **Panel borders are slightly more saturated** (`bg.line` is `#2a3856`
  rather than neutral's `#252d3c`) so the structure scenes — span
  hierarchies, taxonomy diagrams — read as the blueprints they are.
- **Stroke widths a touch heavier** so diagram lines stay legible on the
  deeper navy ground.

## How to register

Wired into the repo-root `docent.config.ts`:

```typescript
import {tutorialBrandPreset} from './tutorials/brand-pack/presets/tutorial-brand';
import {agentopsBrand} from './tutorials/agentops-brand/presets/agentops-brand';
import {openaiTtsPlugin} from '@bjelser/tts-openai';

export default {
  plugins: [tutorialBrandPreset, openaiTtsPlugin, agentopsBrand],
};
```

## Layout

```
tutorials/agentops-brand/
├── README.md                                      ← this file
└── presets/
    └── agentops-brand/
        ├── index.ts                               ← the PresetPlugin definition
        └── tokens.ts                              ← the DesignTokens bundle
```

## Limitations — what the preset cannot reach

Some scene components are accent-key aware (`structure`, `progression`,
`closeup` callouts), so the per-node accent gets the right span hue when
the spec asks for it. But the **figure** scene renders ALL its callouts in
a single accent (`accent.blue` — the default). For the taxonomy scene in
`films/agentops-lunch-and-learn.json` that means every callout ring
appears in agent-decision blue, not the six different span hues. This is a
docent-core limitation, not a preset choice — it would require a per-callout
`accent` field on the figure-scene schema to fix, and is flagged as a
follow-up.
