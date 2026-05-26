# Plugin Architecture — Strategic Implementation Plan

> Status: **COMMITTED**. This is the plan. We ship to this. Nothing sacred.
>
> The current monolithic `packages/engine/` is ripped out and replaced with a
> framework/implementation split. The 29 scenes, 6 presets, the cascade, the
> narration pipeline — every one of them — becomes a plugin of the new
> framework, registered through exactly the same public API a third party
> would use.
>
> R3 (custom modifiers), R4 (preset composition), R6 (inline microsyntax) are
> out of scope for this build, but every protocol surface we ship leaves a
> documented hook so they slot in without breaking changes.

---

## 1. Mission

Carve docent into:

- **`@docent/kit`** — the framework. Zero opinions, zero implementations.
  Owns the plugin protocols, the registry, the spec validator, the cascade
  orchestrator, the Remotion bindings, the agent-facing CLI surface.
- **`@docent/core`** — the default implementation. The 29 scenes, 6 presets,
  the Kokoro TTS adapter, the default narration feature, the default audio
  rhythm. Depends on `@docent/kit` and registers everything through the
  framework's public API. There is no private path.
- **`@docent/cli`** — a thin shell that wires `docent` subcommands to engine
  methods.
- **`@docent/agent`** — the existing skill / survey / prompt layer (no
  architectural change; consumer of the new public surface).
- **`@docent/tts-*`** — per-provider TTS plugins (already in Build A, the
  TTS adapter sprint).

The framework/implementation split is load-bearing. If `@docent/core` ever
has to reach into private `@docent/kit` internals to register a scene, the
API is wrong — fix the API, not the workaround.

This plan rip-and-replaces the engine. Every file under `packages/engine/`
either moves into one of the new packages or is deleted. No legacy parallel
API survives.

---

## 2. End-state architecture

```
                     films/<id>.json
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  @docent/agent — skills, surveys, prompts, treatment templates    │
│  (the LLM-author layer; consumer of the public CLI)               │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  @docent/cli — thin shell:                                        │
│    docent build / depthcheck / judge / style / scene-fit /        │
│    tts / hermetic / doctor                                        │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  @docent/kit — THE FRAMEWORK (zero opinions)                      │
│                                                                   │
│    class Engine {                                                 │
│      use(plugin): this              // sniff plugin.kind          │
│      scenes(): SceneRegistry                                      │
│      presets(): PresetRegistry                                    │
│      tts(): TtsRegistry                                           │
│      features(): FeatureRegistry                                  │
│      modifiers(): ModifierRegistry  // R3 forward-compat          │
│      schema(): JSONSchema7          // computed from registry     │
│      validate(spec): Issue[]                                      │
│      render(spec, opts): Promise<RenderResult>                    │
│    }                                                              │
│                                                                   │
│  Protocols: PluginBase, ScenePlugin, PresetPlugin, TtsProvider,   │
│             FeaturePlugin, ModifierRegistry (stub)                │
│  Cascade orchestrator: validate → tts → render                    │
│  Remotion bindings (composition spec, frame schedule)             │
└──────────────────────────────────────────────────────────────────┘
                            ▲
              ┌─────────────┼──────────────────────┐
              │             │                       │
        engine.use(...) the only way to extend
              │             │                       │
              ▼             ▼                       ▼
┌─────────────────────┐ ┌───────────────┐ ┌────────────────────────┐
│  @docent/core       │ │ @docent/tts-* │ │  @third-party/*        │
│    29 ScenePlugin   │ │   openai      │ │    scifi (scenes)      │
│    6 PresetPlugin   │ │   elevenlabs  │ │    preset-fintech      │
│    kokoro adapter   │ │   cartesia    │ │    captions feature    │
│    narration feat   │ │   compatible  │ │                        │
│    audio-rhythm feat│ └───────────────┘ │  (the acceptance test) │
└─────────────────────┘                   └────────────────────────┘
```

The discipline: **`@docent/core` is one consumer of `@docent/kit`'s public
API. It is never the privileged path.** A third-party plugin pack has
exactly the same powers and constraints.

---

## 3. Package layout — final shape, single release

| Package | Role | Approximate size |
|---|---|---|
| `@docent/kit` | Framework: protocols, registries, engine class, cascade orchestrator, AST, Remotion bindings | ~2,500 LOC |
| `@docent/core` | All 29 scene plugins, 6 preset plugins, Kokoro TTS plugin, default narration & audio-rhythm features | ~12,000 LOC (existing scene code, repackaged) |
| `@docent/cli` | Thin `docent` binary, subcommand routing, doctor, hermetic orchestrator | ~1,500 LOC |
| `@docent/agent` | The existing skill/survey/prompt/treatment layer (kept as a package, name normalized to scope) | (existing) |
| `@docent/tts-openai` | OpenAI TTS plugin (Build A) | ~500 LOC |
| `@docent/tts-elevenlabs` | ElevenLabs TTS plugin (Build A) | ~500 LOC |
| `@docent/tts-compatible` | Generic OpenAI-compatible TTS plugin (Build A) | ~400 LOC |
| `@example/docent-scifi` | **Acceptance-test plugin** under `tests/` — 1 scene + 1 preset + 1 demo film | ~300 LOC |

All published under the `@docent` npm scope. Per-provider TTS plugins use
`peerDependencies` to gate their underlying SDKs — users only pay (in
bundle size, in install time, in code) for what they install.

---

## 4. Core protocols — the API surface

All of these live in `@docent/kit/src/protocols.ts`. Once shipped, breaking
them is a major version bump.

### 4.1 The base plugin

```ts
export type PluginKind = 'scene' | 'preset' | 'tts' | 'feature';

export interface PluginBase {
  readonly name: string;        // 'frame', 'engineering', 'kokoro', 'captions'
  readonly version: string;     // semver, used for compat checks
  readonly kind: PluginKind;
}
```

`engine.use(plugin)` sniffs `plugin.kind` and dispatches to the right
registry — mirroring Marp's `marpit.use()` polymorphism.

### 4.2 ScenePlugin (R2)

```ts
export interface ScenePlugin<TSpec = unknown> extends PluginBase {
  readonly kind: 'scene';

  // The discriminator value in spec.scenes[].type
  readonly sceneType: string;

  // Contributed to the computed film schema as one branch of the union.
  // The scene's own per-type fields live here, not in a god-schema.
  readonly schema: JSONSchema7;

  // Remotion-compatible component that renders this scene type.
  readonly component: React.ComponentType<SceneRenderProps<TSpec>>;

  // Per-scene structural validation (replaces the per-type blocks in
  // the current validate.ts). Returns issues; an empty array means OK.
  readonly validate?: (scene: TSpec, ctx: SceneValidationContext) => SceneIssue[];

  // depthcheck rules contributed by this scene type.
  readonly depthRules?: DepthRule<TSpec>[];

  // judge dimensions contributed by this scene type.
  readonly judgeDimensions?: JudgeDimension[];

  // R5 cross-bind: scenes can declare what they need from the active TTS.
  // The engine checks at spec-resolution time (warn / hard-fail per meta.tts.strict).
  readonly requiresTtsCapabilities?: Partial<TtsCapabilities>;

  // Beat-level resolution hook — scenes that introduce new beat fields
  // (e.g. mechanism's freezes, journey-map's curve points) declare it here.
  readonly resolveBeat?: (beat: BeatSpec, ctx: BeatResolutionContext) => BeatSpec;
}
```

### 4.3 PresetPlugin

```ts
export interface PresetPlugin extends PluginBase {
  readonly kind: 'preset';

  readonly presetName: string;        // 'engineering', 'editorial', ...

  readonly tokens: DesignTokens;      // bg, ink, accent, typography, spacing, radius, stroke
  readonly visualization: VisualizationStyle;
  readonly notes: string;

  // R4 forward-compat: preset can declare it inherits from another preset
  // by name. In this build, the resolver IGNORES this field (presets remain
  // flat). R4 lands by implementing the composition semantics on top of an
  // existing schema field — non-breaking.
  readonly extends?: string;
}
```

### 4.4 TtsProvider (already in Build A — recapitulated for completeness)

```ts
export interface TtsCapabilities {
  readonly nativeAlignment: 'word' | 'character' | 'chunk' | 'none';
  readonly streaming: boolean;
  readonly ssml: boolean;
  readonly voiceCloning: boolean;
  readonly local: boolean;
}

export interface TtsProviderPlugin extends PluginBase {
  readonly kind: 'tts';
  readonly providerId: string;          // 'kokoro', 'openai', 'elevenlabs'
  readonly capabilities: TtsCapabilities;
  create(ctx: TtsProviderContext): Promise<TtsProvider>;
}

export interface TtsProvider {
  synth(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult>;
  listVoices(): Promise<TtsVoice[]>;
  dispose?(): Promise<void>;
}
```

(Full surface in `docs/design/plugin-architecture.md` Appendix A.)

### 4.5 FeaturePlugin (R5)

The pattern that lets `@docent/core` express itself as a feature pack
rather than a god-object. Cross-cutting concerns — captions, watermarks,
music, lower-thirds — become self-contained modules each of which can
touch multiple registries at once.

```ts
export interface FeaturePlugin extends PluginBase {
  readonly kind: 'feature';

  // Optional lifecycle hooks — every one is optional, so adding new hooks
  // later is additive (non-breaking).

  registerScenes?(reg: SceneRegistry): void;
  registerPresets?(reg: PresetRegistry): void;
  registerTtsProviders?(reg: TtsRegistry): void;
  registerModifiers?(reg: ModifierRegistry): void;        // R3 forward

  // Inject style tokens that augment the resolved preset.
  injectStyleTokens?(resolved: ResolvedStyle, ctx: StyleContext): Partial<DesignTokens>;

  // Wrap or post-process the rendered scene output (e.g., overlay captions).
  wrapRender?(rendered: SceneOutput, ctx: RenderContext): SceneOutput;

  // Pre-process the spec before validation (e.g., expand modifier shortcuts).
  preprocessSpec?(spec: FilmSpec): FilmSpec;
}
```

### 4.6 ModifierRegistry (R3 forward-compat — stub in this build)

The protocol exists from day 1; **the registry is empty in this build**.
R3 lands by populating it (and by exposing a user-facing config surface
for projects to register custom modifiers).

```ts
export type ModifierTier = 'film' | 'scene' | 'beat';

export type ModifierFn<TValue, TPartial> = (value: TValue, ctx: ModifierContext) => Partial<TPartial>;

export interface ModifierRegistry {
  readonly film: Map<string, ModifierFn<unknown, FilmMeta>>;
  readonly scene: Map<string, ModifierFn<unknown, Scene>>;
  readonly beat: Map<string, ModifierFn<unknown, Beat>>;
}
```

By shipping the type from day 1, R3 implementation never breaks
`@docent/kit`'s public API — it adds the resolution semantics on top of an
already-stable type.

### 4.7 The Engine class

```ts
export class Engine {
  readonly scenes: SceneRegistry;
  readonly presets: PresetRegistry;
  readonly tts: TtsRegistry;
  readonly features: FeatureRegistry;
  readonly modifiers: ModifierRegistry;

  use(plugin: PluginBase | PluginBase[]): this;

  schema(): JSONSchema7;                       // computed union from scenes
  validate(spec: unknown): Issue[];
  resolveStyle(spec: FilmSpec): ResolvedStyle;
  render(spec: FilmSpec, opts?: RenderOptions): Promise<RenderResult>;
}
```

The engine is constructed in `@docent/cli` as:

```ts
import {Engine} from '@docent/kit';
import * as core from '@docent/core';

const engine = new Engine().use(core);                // load all @docent/core plugins
// + optional project plugins from docent.config.ts:
const userConfig = await loadDocentConfig();
for (const p of userConfig.plugins ?? []) engine.use(p);
```

A third-party scene pack registers via `engine.use(scifi)`. The acceptance
test fixture in `tests/example-docent-scifi/` demonstrates this.

---

## 5. Migration plan — single release, no alpha/beta

The user explicitly rejected an alpha/beta rollout. The migration happens
as one coherent body of work that lands as one tag (`v3.0.0`). No parallel
APIs survive the release boundary.

### Ordering of work (still single release, but with natural sequencing)

#### Phase A — Protocols & framework skeleton

Build `@docent/kit` end to end with all registries, all interfaces, empty
implementations:

- `protocols.ts` — every type sketched in §4.
- `registries/scene.ts`, `registries/preset.ts`, `registries/tts.ts`,
  `registries/feature.ts`, `registries/modifier.ts`.
- `engine.ts` — the `Engine` class wiring registries together.
- `cascade.ts` — orchestrator: validate → resolve style → synth audio → render frames.
- `remotion-bindings.ts` — composition spec builder, frame schedule.

`bunx tsc --noEmit` clean from `@docent/kit` with no implementations.

#### Phase B — Move scenes into `@docent/core`

Mechanical migration: each of the 29 existing scene renderers becomes a
`ScenePlugin`. The before/after for one scene:

```ts
// before (packages/engine/src/scenes/FrameScene.tsx)
export const FrameScene: React.FC<SceneProps & {style: ResolvedStyle}> = (props) => { ... };

// after (@docent/core/src/scenes/frame/index.ts)
export const framePlugin: ScenePlugin<FrameSpec> = {
  kind: 'scene',
  name: 'frame',
  version: '1.0.0',
  sceneType: 'frame',
  schema: frameSchema,                  // moved from the god-schema
  component: FrameSceneComponent,       // existing React component
  validate: validateFrame,              // moved from validate.ts
  depthRules: frameDepthRules,          // moved from depthcheck.ts
  judgeDimensions: frameJudgeDimensions, // moved from judge.ts
};

export default framePlugin;
```

`@docent/core/src/index.ts` exports an array of every plugin:

```ts
export const corePlugins: PluginBase[] = [
  framePlugin, structurePlugin, walkthroughPlugin, /* ... 29 scenes ... */
  neutralPreset, engineeringPreset, /* ... 6 presets ... */
  kokoroTtsProviderPlugin,                       // when Build A lands its kokoro adapter
  narrationFeature,                              // the default narration overlay
  audioRhythmFeature,                            // the default audio-rhythm trim
];
```

#### Phase C — Schema from registry

Delete `packages/engine/schema/film.schema.json` as a hand-written artifact.
Replace with `Engine.schema()`:

```ts
schema(): JSONSchema7 {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://docent.dev/schema/film.schema.json',
    type: 'object',
    required: ['meta', 'scenes'],
    properties: {
      meta: metaSchema,
      scenes: {
        type: 'array',
        items: {
          oneOf: this.scenes.all().map(p => ({
            type: 'object',
            properties: {type: {const: p.sceneType}, ...p.schema.properties},
            required: p.schema.required,
          })),
        },
      },
    },
  };
}
```

At build time, the schema is emitted to `films/schema.json` for IDE
completion. CI re-emits and fails on drift. This is what kills the
"scenes are closed" gravity for good.

#### Phase D — Pipeline integration

Refactor `Film.tsx`: replace the 29-way switch with a 5-line dispatch:

```ts
const SceneComponent = engine.scenes.get(scene.type)?.component;
if (!SceneComponent) throw new Error(`unregistered scene type: ${scene.type}`);
return <SceneComponent scene={scene} common={common} />;
```

Refactor `cascade.ts` to call only `engine.*` methods. The CLI never
reaches into providers or renderers directly — it talks to the engine
through its public API.

#### Phase E — Acceptance test

Build `tests/example-docent-scifi/` as a third-party plugin pack:

- 1 new scene type: `holodeck` (a scifi-themed structure variant)
- 1 new preset: `scifi-noir`
- 1 demo film: `films/scifi-demo.json` that uses both

The hermetic harness loads this fixture via `engine.use(scifi)` and renders
it. If the render succeeds without forking `@docent/core`, the
framework/implementation split works.

#### Phase F — CLI + agent surface

`@docent/cli` becomes a thin shell. Each subcommand is a few lines:

```ts
// @docent/cli/src/commands/build.ts
import {createEngine} from '@docent/cli/engine-factory';
export async function buildCommand(args: BuildArgs) {
  const engine = await createEngine();          // loads @docent/core + user plugins
  const spec = await Bun.file(filmPath).json();
  await engine.render(spec, {scale: args.scale});
}
```

`@docent/agent` (the existing skill/survey layer) updates to mention the
new CLI surface where relevant. The prompts that already reference
`docent style recommend`, `docent scene-fit recommend`, etc. continue to
work — those subcommands stay.

---

## 6. Forward-compat hooks for R3 / R4 / R6

Each is preserved in this build so that future implementation never
breaks public API.

### R3 — Custom modifiers

- `ModifierRegistry` exists in `@docent/kit` from day 1.
- `FeaturePlugin.registerModifiers` is in the protocol.
- Engine's `validate()` and `render()` already include an empty-but-typed
  "modifier resolution" pass — when the registry is populated, the pass
  becomes load-bearing. When empty (this build), it's a no-op.

### R4 — Preset composition

- `PresetPlugin.extends?: string` is in the type from day 1.
- The preset resolver in this build IGNORES the field but the schema
  reserves it.
- R4 implementation: walk the inheritance chain, merge tokens in order,
  emit one composed preset. Drop-in.

### R6 — Inline microsyntax

- No design decision in this build forecloses microsyntax shortcuts.
- Spec stays JSON.
- A future microsyntax decoder runs BEFORE schema validation, as a
  `FeaturePlugin.preprocessSpec` hook (already in the protocol).
- Reserve no fields, no naming conventions. Open territory.

---

## 7. What gets ripped out

Nothing sacred. The following die in this release:

| Going away | Replacement |
|---|---|
| `packages/engine/` monolith | `@docent/kit` + `@docent/core` |
| 29-way switch in `Film.tsx` | `engine.scenes.get(type).component` |
| Hand-written `film.schema.json` | `engine.schema()` computed |
| Per-scene-type validators in `validate.ts` | `ScenePlugin.validate` fields |
| Per-scene-type depth rules in `depthcheck.ts` | `ScenePlugin.depthRules` fields |
| Per-scene-type judge dimensions in `judge.ts` | `ScenePlugin.judgeDimensions` fields |
| Per-scene-type entries in `films.generated.ts` | Computed from `engine.scenes` |
| Direct `import {accent, theme} from '../theme'` in scene files | Already migrated in v2.2.0; remaining references eliminated |
| Any private path between engine and renderers | The public plugin API; private paths are outlawed |
| `pipeline/tts.py` Python subprocess | Already going away in Build A (kokoro-js TTS plugin) |
| `theme.ts` god-object | `@docent/core/src/presets/` + the kit's `DesignTokens` type |

The agent layer (`packages/agent/`) is the **only** thing that survives
mostly intact — it normalizes to `@docent/agent` and updates a few
references but the prompt/skill/survey logic is unchanged. The agent is a
consumer of the new public CLI surface; the CLI surface stays coherent.

---

## 8. What stays the same (the coherent surfaces)

**User-facing surfaces are preserved.** The implementation rip-and-replace
happens behind these contracts:

- **The film spec JSON shape.** Every existing film in `films/` validates
  against the computed schema. Specs are byte-comparable except for the
  removal of the already-deprecated v2.4 legacy knobs (which are already
  gone).
- **The CLI surface.** `docent build`, `docent depthcheck`, `docent judge`,
  `docent style {list,resolve,recommend}`, `docent scene-fit {list,recommend}`,
  `docent tts {list-providers,list-voices,synth}`, `docent hermetic*` —
  all the same commands.
- **The agent's skill cascades.** `/docent-doctor`, `/docent-pr`, `/docent-ar`,
  `/docent-explain` continue to work.
- **The README.** The four hero films still render through the same shell
  command. mp4 URLs continue at `releases/download/v3.0.0/*`.
- **Hermetic gallery.** The 4 fixtures plus every demo film must depthcheck
  + render at parity with v2.5.x.

---

## 9. Risk surface and mitigations

| Risk | Mitigation |
|---|---|
| Migration regresses existing films | Hermetic harness runs at every commit; the acceptance test is "every film in `films/` validates + depthchecks + renders". Tolerance for ≤5% mp4 byte delta from v2.5.x (compression noise); zero tolerance for depthcheck regression. |
| Plugin API design wrong (forces a breaking change in R3/R4) | Every lifecycle hook is optional. Adding new hooks later is additive. Schema discriminates by `plugin.kind` so new kinds are also additive. |
| Performance: registry dispatch vs. switch | Negligible (Map lookup vs. JavaScript switch is the same big-O). Benchmark after Phase B to confirm. |
| Bundling: `@docent/kit` transitively pulling in React/Remotion | React/Remotion are `peerDependencies` of `@docent/core`, not `@docent/kit`. Kit stays renderer-agnostic where the type system allows. |
| Bun + Node both work | Hermetic runs both at PR time. (Existing pipeline uses `bun` primarily; Node compatibility is a soft target.) |
| Schema-from-registry drift between code and `films/schema.json` | CI re-emits the schema and fails on diff. |
| Third-party plugin pack breaks `@docent/core` | `engine.use()` is order-insensitive. Conflicts (two plugins registering the same `sceneType` or `presetName`) hard-fail with a clear error naming both plugins. |
| User installs `@docent/tts-openai` but doesn't `bun add openai` | `peerDependency` warning at install + runtime error at first synthesis call: `"openai provider requires \`openai\` package: bun add openai"`. |

---

## 10. The acceptance test

The single hard test that proves the architecture works:

```bash
# 1. Install only the core packages
bun add @docent/kit @docent/core @docent/cli

# 2. Render every existing film — same byte output as v2.5.x (within tolerance)
docent hermetic --scale 0.5    # → 4/4 GREEN, depthcheck unchanged on every film

# 3. Install a third-party plugin pack
bun add @example/docent-scifi

# 4. Configure to use it
cat > docent.config.ts << EOF
import scifi from '@example/docent-scifi';
export default { plugins: [scifi] };
EOF

# 5. Render a film that uses the third-party scene
docent build films/scifi-demo.json --scale 0.5

# 6. The render succeeds. The scene component is loaded from @example/docent-scifi.
#    @docent/core has not been forked, modified, or even touched.
```

When step 6 passes, the framework/implementation split is real.

---

## 11. Sequencing within the build

Even though the release is single-shot, the work has a natural order. Each
phase ends with `bunx tsc --noEmit` clean and hermetic green; we don't
move forward on red.

1. **Phase A — Protocols.** Build `@docent/kit` skeleton. All types defined,
   all registries instantiable, engine class constructible. No
   implementations. tsc green.
2. **Phase B — Scene migration.** Move all 29 scene renderers into
   `@docent/core/src/scenes/*` as `ScenePlugin[]`. Move all 6 presets into
   `@docent/core/src/presets/*` as `PresetPlugin[]`. Move per-scene-type
   validators, depth rules, judge dimensions onto each plugin. tsc green.
3. **Phase C — Schema-from-registry.** Delete hand-written
   `film.schema.json`. Implement `Engine.schema()`. Emit at build time to
   `films/schema.json` for IDE completion. CI gates on drift.
4. **Phase D — Pipeline integration.** Refactor `Film.tsx` to dispatch via
   registry. Refactor `cascade.ts` to call only `engine.*`. Move TTS calls
   to `engine.tts.synth()` (depends on Build A landing first; otherwise
   wraps the existing kokoro adapter in a `KokoroTtsProviderPlugin` shim).
5. **Phase E — Acceptance test.** Build `@example/docent-scifi` fixture.
   Wire into hermetic. Confirm third-party scene type renders without
   forking core.
6. **Phase F — CLI + agent surface.** Carve out `@docent/cli` as a thin
   shell. Update agent prompts where they reference CLI subcommands. The
   skill cascades don't change.
7. **Phase G — Publish.** First release of the `@docent/*` npm packages.
   Cut `v3.0.0`. Update the README install story to the new package set.
   Re-render the 4 README films from `@docent/cli` proper.

Estimated calendar: **4-6 weeks** end to end for a careful build.
Estimated regression surface: every code path in the engine — but the
hermetic gallery is the safety net at each phase.

---

## 12. What this rules out (permanently)

Shipping this locks in the following decisions. Going back is a major
version bump (we'd have to re-ship the whole architecture).

- **The plugin API is public.** Breaking any of the protocols in §4 is a
  breaking change.
- **Registry-based dispatch.** There is no fast-path that bypasses the
  registry. There never will be.
- **Schema is computed.** Hand-written `film.schema.json` is gone forever.
- **`@docent/*` npm scope.** Package names are locked.
- **The framework/implementation split.** No private path from
  `@docent/core` into `@docent/kit` internals. The day someone proposes
  one is the day the discipline dies.

These are intentional. The whole point of the rip-and-replace is to
commit to the new architecture — there is no fallback.

---

## 13. Open coordination items

The TTS adapter sprint (Build A, currently in flight) lands first as the
proof of concept for the plugin protocol. Its `KokoroTtsProviderPlugin`,
`OpenAiTtsProviderPlugin`, `ElevenLabsTtsProviderPlugin`, and
`OpenAiCompatibleTtsProviderPlugin` ALL become legitimate plugins of
`@docent/kit` once the framework lands.

Dependency order:

1. Build A (TTS adapter) lands → validates the plugin pattern at small
   scope, ships kokoro-js, ships paid providers.
2. This build (R1 + R2 + R5) lands → carves the rest of the architecture
   around the plugin pattern. TTS plugins continue working unchanged.

R3, R4, R6 land in subsequent releases when there's product pull — the
forward-compat hooks are already in place.

---

## 14. The naming commitment

Per the Marp research's closing note: naming locks discipline. Once we
say `@docent/kit` is the framework and `@docent/core` is the
implementation, every time someone proposes a "small" shortcut from
`@docent/core` into `@docent/kit` internals, the names remind them what's
happening. That's the protection against the architecture decaying back
into a monolith over time.

The names are:

- `@docent/kit` — the framework
- `@docent/core` — the default implementation (registered through `@docent/kit`'s public API)
- `@docent/cli` — the binary
- `@docent/agent` — the LLM-author surface
- `@docent/tts-*` — per-provider TTS plugins
- `@example/docent-*` — third-party plugin packs (the acceptance test)

These are locked once we publish.

---

## 15. The commitment

This document is the plan. Future PRs against `packages/engine/` should
not exist — work moves into the new package structure. The current
`v2.5.x` line is the last release of the monolithic engine.

We commit to:
- One release (`v3.0.0`), no alpha/beta.
- Every existing film still renders.
- Every existing CLI subcommand still works.
- The agent layer (`packages/agent/`) consumes the new public surface.
- `@example/docent-scifi` is the public proof that the split is real.
- R3, R4, R6 land later through the forward-compat hooks shipped here —
  never by breaking the protocols in §4.

When the acceptance test (§10) passes, the architecture is done.
