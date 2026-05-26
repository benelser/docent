# Migration brief templates

> Ready-to-dispatch agent brief templates for the Phase B fan-out. Each
> template is a parameterized prompt — substitute the placeholders and
> dispatch.
>
> When A.1 (`a225031c8e1a21fc8`) returns and `@docent/kit` is merged to
> main, dispatch up to 15 parallel agents from these templates.

---

## How to use this doc

1. Wait for A.1 to land.
2. Merge A.1's worktree into main.
3. Hermetic check.
4. Open this doc, copy the appropriate template for each task in the DAG, substitute the placeholders, dispatch as a background agent with `isolation: worktree`.
5. As agents return, merge their work into main one at a time. Run hermetic between merges.

---

## Template 1 — Scene migration (`B.scene.<sceneType>`)

Use this for each of the 29 scenes. Placeholders: `<SCENE_TYPE>`, `<COGNITIVE_CLUSTER>`, `<COMPONENT_NAME>`.

```
You are migrating ONE scene type from packages/engine/src/scenes/ into the new @docent/core package as a ScenePlugin. This is part of the Phase B fan-out of the v3.0 plugin-architecture rip-and-replace.

# Read these first

1. docs/design/plugin-architecture-strategy.md — §4.2 ScenePlugin definition
2. docs/design/plugin-architecture-dag.md — §6 file ownership rules
3. packages/kit/src/protocols.ts — the ScenePlugin type you'll implement
4. packages/engine/src/scenes/<COMPONENT_NAME>.tsx — the existing scene component you're migrating
5. packages/engine/cli/validate.ts — find the <SCENE_TYPE>-specific validation block; you'll move it
6. packages/engine/cli/depthcheck.ts — find the <SCENE_TYPE> depth rules; you'll move them
7. packages/engine/cli/judge.ts — find the <SCENE_TYPE> judge dimensions; you'll move them
8. packages/engine/schema/film.schema.json — find <SCENE_TYPE>-specific fields; you'll express them in your plugin's schema field

# Scope

In your isolated worktree, create:

```
packages/core/src/scenes/<SCENE_TYPE>/
├── index.ts                 # the plugin export
├── component.tsx            # the React component (moved from packages/engine/src/scenes/<COMPONENT_NAME>.tsx — UNCHANGED behaviorally, only import paths update to reference @docent/kit)
├── schema.ts                # JSONSchema7 for this scene's spec branch (the per-type fields, NOT the common scene fields)
├── validate.ts              # per-scene structural validator (moved from validate.ts)
├── depth-rules.ts           # depth rules (moved from depthcheck.ts)
└── judge-dimensions.ts      # judge dimensions (moved from judge.ts)
```

Then `index.ts` exports the plugin:

```ts
import type {ScenePlugin} from '@docent/kit';
import {Component} from './component';
import {schema} from './schema';
import {validate} from './validate';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';

export const <sceneType>Plugin: ScenePlugin = {
  kind: 'scene',
  name: '<SCENE_TYPE>',
  version: '1.0.0',
  sceneType: '<SCENE_TYPE>',
  cluster: '<COGNITIVE_CLUSTER>',     // one of: 'connection' | 'time' | 'flow' | 'comparison' | 'categorization' | 'experience' | 'narrative' | null
  schema,
  component: Component,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities — only set if this scene needs word-level alignment
  //   (passage with karaoke reveal, closeup with line-by-line, etc).
  //   Most scenes do NOT need this; leave undefined.
};

export default <sceneType>Plugin;
```

# Critical constraints

- DO NOT modify packages/engine/. It stays preserved during the rip-and-replace. You may READ from it (specifically the existing scene file, validate.ts, depthcheck.ts, judge.ts) but you may not EDIT it.
- DO NOT touch packages/core/src/index.ts (the plugin manifest). The integrator (main session) assembles that at merge time.
- DO NOT touch any other scene's directory. Only your assigned <SCENE_TYPE>.
- The component's behavior must be unchanged from packages/engine/src/scenes/<COMPONENT_NAME>.tsx. The only differences allowed: import paths point to @docent/kit types instead of relative paths.
- `bunx tsc --noEmit` clean from packages/core/.
- Tests pass: `cd packages/core && bunx tsc --noEmit` after your changes.

# Verification

After your changes:
1. `bunx tsc --noEmit` clean from packages/core.
2. Visual inspection: the plugin exports correctly, the React component renders the same JSX, the validator returns the same SceneIssue[] for the same inputs.

# Report back

(a) Files created.
(b) The plugin's cluster declaration (e.g., 'connection').
(c) Whether you declared `requiresTtsCapabilities` (most scenes don't).
(d) Any behavior that subtly changed during migration (should be NONE — flag anything you noticed).
(e) Commit SHA on your branch.

**Commit your work.** Do NOT push.
```

### Scene → cognitive cluster assignments

The cluster is part of the cognitive-cluster taxonomy (closed list of 7). When dispatching, substitute the correct cluster per scene:

| Scene | Cluster |
|---|---|
| `frame` | `null` (chrome scene, no cognitive content) |
| `recap` | `null` (chrome scene) |
| `structure` | `connection` |
| `walkthrough` | `connection` |
| `tree` | `connection` |
| `map` | `connection` |
| `timeline` | `time` |
| `progression` | `time` |
| `diff` | `flow` |
| `mechanism` | `flow` |
| `causal-loop` | `flow` |
| `compare` | `comparison` |
| `landscape` | `comparison` |
| `quantities` | `comparison` |
| `chart` | `comparison` |
| `prior-art` | `comparison` |
| `venn` | `comparison` |
| `tension` | `categorization` |
| `journey-map` | `experience` |
| `closeup` | `experience` |
| `passage` | `narrative` |
| `figure` | `narrative` |
| `demonstrate` | `narrative` |
| `big-idea` | `narrative` |
| `probe` | `comparison` |
| `epigraph` | `narrative` |
| `concession` | `narrative` |
| `objection` | `narrative` |
| `provocation` | `narrative` |

---

## Template 2 — Preset migration (`B.preset.<presetName>`)

Use this for each of the 6 presets. Placeholders: `<PRESET_NAME>`.

```
You are migrating ONE preset from packages/engine/src/style/stylePresets.ts into @docent/core as a PresetPlugin.

# Read these first

1. docs/design/plugin-architecture-strategy.md — §4.3 PresetPlugin definition
2. packages/kit/src/protocols.ts — the PresetPlugin type
3. packages/engine/src/style/stylePresets.ts — find the <PRESET_NAME> preset definition

# Scope

Create:

```
packages/core/src/presets/<PRESET_NAME>/
├── index.ts
└── tokens.ts
```

`index.ts`:

```ts
import type {PresetPlugin} from '@docent/kit';
import {tokens} from './tokens';

export const <presetName>Preset: PresetPlugin = {
  kind: 'preset',
  name: '<PRESET_NAME>',
  version: '1.0.0',
  presetName: '<PRESET_NAME>',
  tokens,
  visualization: { /* moved from stylePresets.ts */ },
  notes: '/* moved from stylePresets.ts */',
  // extends?: undefined — R4 forward-compat field; leave undefined in v1
};

export default <presetName>Preset;
```

# Critical constraints

- DO NOT modify packages/engine/.
- DO NOT touch other presets' directories.
- The tokens must be byte-identical to the v2.5.x value in packages/engine/src/style/stylePresets.ts.

# Report back

(a) Files created.
(b) Confirmation that tokens are byte-identical to v2.5.x.
(c) Commit SHA on your branch.

**Commit your work.** Do NOT push.
```

### Preset list

The 6 presets to dispatch: `neutral`, `engineering`, `editorial`, `paper`, `analytical`, `executive`.

---

## Template 3 — Feature migration (`B.feature.<featureName>`)

Two features ship in @docent/core:

- `B.feature.narration` — the existing narration overlay
- `B.feature.audio-rhythm` — the per-beat silence trim + pace knob

```
You are migrating the <FEATURE_NAME> feature into @docent/core as a FeaturePlugin. Cross-cutting concerns that touch multiple registries.

# Read these first

1. docs/design/plugin-architecture-strategy.md — §4.5 FeaturePlugin definition
2. packages/kit/src/protocols.ts — the FeaturePlugin type
3. <PATH_TO_EXISTING_FEATURE> — the current implementation

# Scope

Create:

```
packages/core/src/features/<FEATURE_NAME>/
├── index.ts
└── (any supporting files moved from packages/engine/)
```

The feature plugin declares which lifecycle hooks it implements:
- `registerScenes?` — usually no for these features
- `registerPresets?` — usually no
- `registerTtsProviders?` — only audio-rhythm if it bundles a provider
- `registerModifiers?` — R3 forward-compat; usually no in v1
- `injectStyleTokens?` — augments resolved style
- `wrapRender?` — post-processes the rendered output
- `preprocessSpec?` — R6 forward-compat; usually no in v1

# Report back

(a) Files created.
(b) Which lifecycle hooks the feature uses.
(c) Commit SHA on your branch.

**Commit your work.** Do NOT push.
```

### Feature-specific details

**`narration`** — the per-beat narration overlay. Wraps render output to attach captions/text from the beat's `text` field. Hook: `wrapRender`.

**`audio-rhythm`** — the per-beat silence trim controlled by the `pace` knob. Hook: probably `wrapRender` (it processes the audio after synthesis but before muxing) OR `preprocessSpec` (it computes timings from the spec).

---

## Template 4 — TTS Kokoro plugin migration (`B.tts.kokoro`)

```
You are migrating the Kokoro TTS provider from packages/engine/src/tts/providers/kokoro.ts into @docent/core as a TtsProviderPlugin.

# Read these first

1. docs/design/plugin-architecture-strategy.md — §4.4 TtsProvider definition
2. packages/kit/src/protocols.ts — the TtsProviderPlugin type
3. packages/engine/src/tts/providers/kokoro.ts — the existing implementation

# Scope

Create:

```
packages/core/src/tts/kokoro/
├── index.ts
├── provider.ts             # the synth() implementation (moved from kokoro.ts)
└── silence-trim.ts         # the per-beat silence trim (moved from packages/engine/src/tts/silence.ts)
```

The plugin re-exports the existing kokoro adapter as a TtsProviderPlugin.

# Report back

(a) Files created.
(b) Confirmation that synth() output is byte-equivalent to packages/engine/src/tts/providers/kokoro.ts.
(c) Commit SHA on your branch.

**Commit your work.** Do NOT push.
```

The other 3 TTS providers (openai, elevenlabs, openai-compatible) stay in their current location for now. The strategic plan deferred them to separate `@docent/tts-*` packages; for the initial v3.0 release they ship inside `@docent/core`. Future work splits them out.

---

## Template 5 — Framework support tasks (A.2 through A.9)

These are smaller tasks against `@docent/kit`. Different from B because they're implementations of the framework itself, not registrations of plugins.

### A.2 — Registry implementations

```
You are implementing the 5 registries in @docent/kit. A.1 shipped the skeletons; you fill in the bodies.

# Read

1. packages/kit/src/registries/*.ts — the skeletons A.1 shipped
2. docs/design/plugin-architecture-strategy.md — §4.2 (registries) and §6.3 (Engine.use())

# Scope

Implement:
- SceneRegistry — Map<sceneType, ScenePlugin>; conflict detection on register
- PresetRegistry — same shape for presets
- TtsRegistry — same shape for TTS providers
- FeatureRegistry — Map<name, FeaturePlugin>; lifecycle-hook aggregation
- ModifierRegistry — three Maps (film/scene/beat); empty in v1, structurally typed

Each registry exposes:
- register(plugin)
- get(id) → plugin | undefined
- list() → plugin[]
- has(id) → boolean

Conflict-on-register hard-fails with both names in the error.

# Report back

(a) Files modified.
(b) Conflict-detection error message verbatim.
(c) tsc clean.
(d) Commit SHA.
```

### A.3 — Engine class

```
You are implementing the Engine class methods in @docent/kit/src/engine.ts. A.1 shipped the skeleton; you fill in:

- constructor() — initialize all 5 registries
- use(plugin | plugin[]) — polymorphic dispatch on plugin.kind; supports array spreads
- schema() — computed JSON schema (A.8 dependency; stub returning {} is acceptable here, A.8 fills it in)
- validate(spec) — calls every registered plugin's validate; aggregates issues
- resolveStyle(spec) — calls preset registry, applies overrides
- render(spec, opts) — stub throws 'not implemented — D.2'

# Report back as before.
```

### A.4 — Validation framework

Aggregates per-scene validators. Calls `ScenePlugin.validate?(scene, ctx)` for each scene. Returns aggregated issues.

### A.5 — Depthcheck framework

Aggregates per-scene depth rules. Calls every `ScenePlugin.depthRules[]` for each scene. Returns aggregated findings.

### A.6 — Judge framework

Aggregates per-scene judge dimensions. Surfaces them to the LLM judge call.

### A.7 — Cascade orchestrator

The pipeline coordinator: validate → resolve style → synth audio → render frames. Calls `engine.tts`, `engine.scenes`, etc.

### A.8 — Schema-from-registry

`Engine.schema()` computes the JSON schema by combining each `ScenePlugin.schema` into a oneOf union. Emits to `films/schema.json` for IDE completion.

### A.9 — Remotion bindings

Composition spec builder + frame schedule. The translation layer between docent's typed spec and Remotion's `<Composition>` config.

---

## The dispatch order (when A.1 returns)

Wave 1 (immediate, ~15 parallel agents):
- A.2 (registries)
- A.3 (engine)
- A.4 + A.5 + A.6 (frameworks — single agent, combined)
- A.7 (cascade)
- A.8 (schema)
- A.9 (Remotion)
- B.preset.neutral, B.preset.engineering, B.preset.editorial, B.preset.paper, B.preset.analytical, B.preset.executive (6 agents)
- B.tts.kokoro (1 agent)
- B.feature.narration, B.feature.audio-rhythm (2 agents)

Wave 2 (after Wave 1, scene migrations):
- B.scene.frame, B.scene.recap, B.scene.structure, B.scene.walkthrough, B.scene.tree, B.scene.map, B.scene.timeline, B.scene.progression, B.scene.diff, B.scene.mechanism, B.scene.causal-loop, B.scene.compare, B.scene.landscape, B.scene.quantities, B.scene.chart, B.scene.prior-art, B.scene.venn, B.scene.tension, B.scene.journey-map, B.scene.closeup, B.scene.passage, B.scene.figure, B.scene.demonstrate, B.scene.big-idea, B.scene.probe, B.scene.epigraph, B.scene.concession, B.scene.objection, B.scene.provocation

That's 29 scenes. Dispatch 10-15 in parallel; queue the rest. When 10 return, dispatch the next 10.

Wave 3 (after all of Phase B):
- D.1 (Film.tsx → registry dispatch)
- D.2 (cascade.ts → engine.*)

Wave 4 (after Wave 3):
- E.1 (acceptance test fixture)
- F.1 (`@docent/cli` thin shell)

Wave 5 (after Wave 4):
- F.2 (`@docent/agent` updates)
- G (publish — but per user direction, no version cut)

---

## Integration discipline

Per the DAG §6:

- Each agent works in its own worktree (`isolation: worktree`).
- Each agent commits before reporting back.
- The integrator (main session) merges each branch to main one at a time, runs hermetic between merges to catch regressions.
- `packages/core/src/index.ts` (the plugin manifest) is assembled by the integrator after all the per-plugin agents return. It re-exports every plugin from its directory and packages them as `corePlugins: PluginBase[]`.

The plugin manifest pattern (post-fan-out):

```ts
// packages/core/src/index.ts (assembled at merge time)
import {framePlugin} from './scenes/frame';
import {structurePlugin} from './scenes/structure';
// ... 27 more scene imports ...
import {neutralPreset} from './presets/neutral';
// ... 5 more preset imports ...
import {narrationFeature} from './features/narration';
import {audioRhythmFeature} from './features/audio-rhythm';
import {kokoroTtsPlugin} from './tts/kokoro';

export const corePlugins = [
  // scenes
  framePlugin, structurePlugin, /* ... */,
  // presets
  neutralPreset, /* ... */,
  // features
  narrationFeature, audioRhythmFeature,
  // tts
  kokoroTtsPlugin,
];

export default corePlugins;
```

This file is the SINGLE merge-conflict-prone point — kept manual on purpose so the integrator owns it.
