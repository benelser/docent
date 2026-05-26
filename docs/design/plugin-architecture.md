# docent plugin architecture

**Status:** design proposal, single coherent ship — no alpha/beta/v3 channel.
**Date:** 2026-05-26
**Author:** docent research agent
**Inputs:** [docs/research/marp-inspired-extensibility.md](../research/marp-inspired-extensibility.md), [docs/research/tts-adapter-ecosystem.md](../research/tts-adapter-ecosystem.md), Rig source (`rig-core` 0.37, the [`audio_generation`](https://docs.rs/rig-core/latest/rig_core/audio_generation/index.html) and [`client`](https://docs.rs/rig-core/latest/rig_core/client/index.html) modules, and the [`Capabilities`](https://docs.rs/rig-core/latest/rig_core/client/trait.Capabilities.html) pattern).
**Disposition:** one design, one release. The whole engine moves from monolith to `docent-kit` + `docent-core` in a single migration. No staged opt-in.

---

## 1. Motivation

docent ships as one Remotion app today. Three classes of extension already want a home and have nowhere to land:

1. **Third-party scene types** — somebody wants a `passage`-shaped scene tuned for sheet music, or a `chart` flavored for biology dose-response curves. Today every new scene type requires a PR into the engine.
2. **Third-party TTS providers** — the build cascade hardcodes `uv run python pipeline/tts.py`. There is no way for a film to declare `tts: { provider: 'elevenlabs', voice: '21m00…' }` without forking. The user has called this out as the place we're "reinventing the wheel."
3. **Third-party presets / themes** — `stylePresets.ts` is a closed object. A third party cannot publish `@someone/docent-preset-fintech` and have docent pick it up.

The three problems share one root: docent has **no plugin protocol**. Every extension surface today (scenes, TTS, presets) is a closed registry inside `packages/engine`.

Two reference designs already do this well in adjacent domains:

- **Marp** ([marp-team/marpit](https://github.com/marp-team/marpit)) — the framework/implementation split (Marpit/Marp Core), the unified `marpit.use(plugin)` chain, the custom-directives surface, the CSS-`@import` theme composition.
- **Rig** ([0xPlaygrounds/rig](https://github.com/0xPlaygrounds/rig)) — typed *capability classes* (TTS, embeddings, image-gen, transcription) where every provider declares which classes it supports at the *type level*, and the user picks a capability with one method call (`client.audio_generation_model("tts-1")`).

Marp gives us the registration discipline. Rig gives us the typed-capability discipline. This document fuses them into one TypeScript-shaped plugin architecture that covers all three extension surfaces (scenes, TTS, presets) under a single contract.

The non-goal: a v3 channel, a `--experimental` flag, or a parallel "new pipeline." The current built-ins move into the new model in one cut. The user has explicitly said: *no alpha/beta/v3*.

---

## 2. Rig's patterns — what we're taking

I read [`rig-core/src/audio_generation.rs`](https://docs.rs/rig-core/latest/src/rig_core/audio_generation.rs.html), [`rig-core/src/client/mod.rs`](https://docs.rs/rig-core/latest/src/rig_core/client/mod.rs.html), and the `impl Capabilities` blocks for both [OpenAI](https://docs.rs/rig-core/latest/src/rig_core/providers/openai/client.rs.html) (full TTS support) and [Anthropic](https://docs.rs/rig-core/latest/src/rig_core/providers/anthropic/client.rs.html) (no TTS). The patterns worth lifting:

### 2.1 One trait per capability class, with associated types

Rig's `AudioGenerationModel` is a sharp focused trait:

```rust
pub trait AudioGenerationModel: Sized + Clone + WasmCompatSend + WasmCompatSync {
    type Response: Send + Sync;
    type Client;
    fn make(client: &Self::Client, model: impl Into<String>) -> Self;
    fn audio_generation(
        &self,
        request: AudioGenerationRequest,
    ) -> impl Future<Output = Result<AudioGenerationResponse<Self::Response>, AudioGenerationError>> + Send;
    fn audio_generation_request(&self) -> AudioGenerationRequestBuilder<Self, Missing, Missing>;
}
```

The shape we copy: **one trait per capability**, the request as a flat struct, the response generic over a provider-native `Response` type the caller can downcast for advanced use (a Rig OpenAI caller can recover the original `bytes::Bytes` from `AudioGenerationResponse::<bytes::Bytes>::response`).

### 2.2 The escape hatch: `additional_params: Option<Value>`

`AudioGenerationRequest` has four fields — `text`, `voice`, `speed`, and `additional_params: Option<Value>`. That last field is Rig's escape hatch for provider-specific knobs (OpenAI's `instructions`, ElevenLabs' `stability`). We adopt this verbatim — typed as `Record<string, unknown>` in TS — and call it `providerOptions`, which is also what the [Vercel AI SDK](https://ai-sdk.dev/) does.

### 2.3 The `Capabilities` type-level matrix

This is the move. Rig has a `Capabilities` trait every provider implements:

```rust
pub trait Capabilities<H = reqwest::Client> {
    type Completion: Capability;
    type Embeddings: Capability;
    type Transcription: Capability;
    type ModelListing: Capability;
    #[cfg(feature = "image")]
    type ImageGeneration: Capability;
    #[cfg(feature = "audio")]
    type AudioGeneration: Capability;
}
```

OpenAI declares every cell `Capable<ConcreteModel>`. Anthropic declares `AudioGeneration = Nothing`. The compiler then refuses `anthropic.audio_generation_model("…")` outright — the method is only defined when `Capabilities::AudioGeneration` is `Capable<_>`.

Two-level partitioning in one type system:
- **Cargo features** (`audio`, `image`) gate the *capability class itself* — when feature is off, the whole trait/module is `#[cfg]`-ed out.
- **Per-provider associated types** gate *which providers implement that class*. Inside a single feature-enabled build, some providers have TTS, some don't.

We will adopt this exactly. TypeScript has no Cargo features but it has discriminated unions, conditional types, and the package boundary. §7 below details the TS translation.

### 2.4 Builder pattern with type-state validation

Rig's `AudioGenerationRequestBuilder<M, T = Missing, V = Missing>` won't compile a `.send()` until `T` and `V` are both `Provided<String>`. This is Rust-shaped but TypeScript can do the same with branded types — and *should*, because the alternative (runtime-thrown "voice is required" errors discovered minutes into a render) is exactly the regression we want to avoid in the new architecture.

### 2.5 What we are NOT taking from Rig

- **The `Agent` abstraction is chat-only.** Rig's agents compose completion models + tools; they do not orchestrate TTS or image gen. We don't have a chat agent need at the engine layer, so we don't import this concept.
- **`async-trait` / `impl Future` ergonomics.** We're in TS — `async/await` is native. No-op.
- **The full Rust type-state finesse on builders.** We adopt the spirit (compile-time required-field validation) but keep the TS implementation pragmatic — a `Required` brand on the builder rather than two phantom type parameters.

---

## 3. Marp's patterns — what we're taking

From [docs/research/marp-inspired-extensibility.md](../research/marp-inspired-extensibility.md), the three load-bearing moves:

### 3.1 Framework/implementation split

`docent-kit` owns the protocols, validation, AST, plugin registries. `docent-core` is a customer of `docent-kit` that registers all the default scenes/TTS/presets *through the same API a third party would use*. No fast paths.

The acceptance test (from R1 of the Marp brief, restated): can `@someone/docent-extras` add scenes + a preset + a TTS provider with one `docent.use(plugin)` call, no fork? After this design ships, yes.

### 3.2 Pluggable registries, not switch statements

Today `Film.tsx` is a 29-arm `t === 'frame' ? <FrameScene /> : t === 'progression' ? …`. The Marp brief's R2 says: replace this with a registry.

We adopt that exactly. The registry holds `{ schema, component, depthRules }` triples. `docent-core` calls `docent.registerScene('frame', { … })` 29 times at startup. A plugin calls the same method to add a 30th type.

### 3.3 Three-tier modifier surface — film / scene / beat

Marp's custom-directives surface (global / local / spot) maps cleanly onto docent's tiers (film / scene / beat). Adopting this gives authors a way to invent declarative knobs (`mood: anxious`, `branding: corporate`) that resolve to existing intent knobs without changing the schema or the renderer.

### 3.4 Three escape hatches for presets, in order of locality

Per R4 of the Marp brief: preset extends another preset (`@import`-shaped composition); film-level `style.override`; scene-level `style`. The Marp lesson: never make an author fork a preset for one tweak.

### 3.5 What we are NOT taking from Marp

- HTML-comment directives (we have JSON; we don't need to smuggle directives in comments).
- CSS-string themes with raw element selectors (our output is React/Remotion, not HTML; themes stay typed object trees).
- An engine-swap CLI flag (`--engine`) (we want one engine; plugins yes, full swap no).

---

## 4. The unified architecture

One package boundary, one plugin protocol, three registries.

```
┌────────────────────────────── @docent/kit ───────────────────────────────┐
│                                                                          │
│  protocols                          registries                           │
│  ─────────                          ──────────                           │
│  Scene plugin contract              SceneRegistry                        │
│  TtsProvider contract               TtsProviderRegistry                  │
│  Preset plugin contract             PresetRegistry                       │
│  Modifier contract                  ModifierRegistry (film/scene/beat)   │
│  Feature plugin contract            FeatureRegistry                      │
│                                                                          │
│  the Engine class — a Marpit-shaped container                            │
│  ─────────────────────────────────────────────                           │
│       const engine = new Engine();                                       │
│       engine.use(plugin);   // dispatches by shape                       │
│       engine.compile(spec); // validate → resolve → bundle               │
│                                                                          │
│  film AST + validation                                                   │
│  spec schema computed at runtime as the UNION of registered scene        │
│  schemas — not hand-written.                                             │
│                                                                          │
│  ZERO built-in scenes, TTS providers, or presets.                        │
│  Pure framework. (Marpit-shaped.)                                        │
└──────────────────────────────────────────────────────────────────────────┘
            ▲                                ▲
            │                                │
            │ uses                           │ uses
            │                                │
┌──────── @docent/core ──────────┐  ┌──────── @docent/tts-* ──────────────┐
│                                 │  │                                     │
│ the default impl — a CUSTOMER   │  │ @docent/tts-kokoro      (default)   │
│ of @docent/kit, no privilege:   │  │ @docent/tts-openai                  │
│                                 │  │ @docent/tts-elevenlabs              │
│ - registers all 29 scenes       │  │ @docent/tts-cartesia                │
│ - registers built-in presets    │  │ @docent/tts-openai-compatible       │
│   (engineering, editorial, …)   │  │                                     │
│ - registers a feature plugin    │  │ each is a stand-alone npm package   │
│   for narration/captions        │  │ that exports a TtsProviderPlugin    │
│ - exposes the Remotion          │  │                                     │
│   composition + Film.tsx        │  └─────────────────────────────────────┘
│                                 │
└─────────────────────────────────┘
            ▲
            │ depends on
            │
┌──────── @docent/cli ─────────────────────────────────────────────────────┐
│                                                                          │
│ the CLI surface — the only place users type a command.                   │
│                                                                          │
│ Auto-loads @docent/core. Discovers plugins by:                           │
│   1. `docent.config.{ts,json}` in repo root                              │
│   2. `package.json` "docent.plugins" field                               │
│   3. `--plugin <pkg>` CLI flag                                           │
│                                                                          │
│ Boots:                                                                   │
│   const engine = new Engine();                                           │
│   engine.use(docentCore);            // the default plugin pack          │
│   for (const p of discovered) engine.use(p);                             │
│   await engine.build(filmId);                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

Three rules govern the design:

**Rule 1 — `@docent/kit` ships zero implementations.** Not one scene. Not one TTS provider. Not one preset. The proof of extensibility is that the kit alone produces zero films but accepts any plugin.

**Rule 2 — `@docent/core` uses the public API, no private fast-paths.** Every default scene registers via `engine.registerScene(...)`. Every default preset via `engine.registerPreset(...)`. The Marp discipline.

**Rule 3 — A plugin is a tagged value, not a subclass.** `engine.use(plugin)` sniffs `plugin.kind` (`'scene'` | `'tts'` | `'preset'` | `'feature'` | `'bundle'`) and dispatches. Authors don't subclass anything. (This is what `marpit.use()` does today.)

---

## 5. The TypeScript interfaces

All interfaces live in `@docent/kit/src/plugins/`. Concrete file layout is given in §8.

### 5.1 The shared `Plugin` contract

Every plugin is a discriminated union. One field — `kind` — names which registry it lands in. One field — `id` — names the plugin globally.

```ts
// @docent/kit/src/plugins/types.ts

export type PluginKind = 'scene' | 'tts' | 'preset' | 'feature' | 'modifier' | 'bundle';

export interface PluginBase {
  /** Globally unique id (e.g. '@docent/tts-elevenlabs', 'my-org/scene-sankey'). */
  readonly id: string;
  /** The registry this plugin lands in. */
  readonly kind: PluginKind;
  /** Plugin author-declared semver, used by `docent doctor` and the discovery layer. */
  readonly version: string;
  /** Required @docent/kit semver range. Engine refuses to load on mismatch. */
  readonly kitRange?: string;
}

export type Plugin =
  | ScenePlugin
  | TtsProviderPlugin
  | PresetPlugin
  | FeaturePlugin
  | ModifierPlugin
  | BundlePlugin;

/** A plugin pack — what `@docent/core` itself is. Registers many things at once. */
export interface BundlePlugin extends PluginBase {
  readonly kind: 'bundle';
  /** Called by `engine.use()`. The bundle synchronously registers its children. */
  install(engine: Engine): void;
}
```

`engine.use(plugin)` switches on `kind`. A `bundle` plugin gets called back with the engine so it can call the other `register*` methods.

### 5.2 The `TtsProvider` interface

This is the centerpiece. It refines the shape from `tts-adapter-ecosystem.md` §7 using Rig's typed-capability discipline. Two layers — the *provider plugin* (declares the provider exists and how to construct it), and the *provider instance* (the live, configured client that can synthesize).

```ts
// @docent/kit/src/plugins/tts.ts

import type { PluginBase } from './types';

/* ───────── the provider plugin (what gets registered) ───────── */

export interface TtsProviderPlugin extends PluginBase {
  readonly kind: 'tts';
  /** Stable provider id used in film specs: `"kokoro" | "openai" | "elevenlabs" | "cartesia" | "openai-compatible" | ...`. */
  readonly providerId: string;

  /** Type-level capability declaration — Rig's `Capabilities` ported to TS. */
  readonly capabilities: TtsCapabilities;

  /**
   * Construct an instance from the active environment + spec config.
   *
   * MUST throw if credentials/config are insufficient (env var missing,
   * voice unknown, etc.) BEFORE the cascade burns minutes on a render.
   */
  create(ctx: TtsProviderContext): Promise<TtsProvider>;
}

export interface TtsProviderContext {
  /** From the film spec's `meta.tts`. Provider-scoped. */
  readonly model?: string;
  readonly providerOptions?: Record<string, unknown>;
  /** From `process.env` — never from the spec. The contract: credentials live here. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Where the engine wants cached audio to land. Used by the openai-compatible adapter for self-hosted endpoints. */
  readonly cacheDir: string;
}

/* ───────── capability matrix — Rig's pattern ─────────  */

/**
 * Mirrors Rig's `Capabilities` trait. Every cell is either a literal `true`
 * indicating the provider supports it, or `false`. The engine uses these at
 * BOTH compile time (TS narrowing — see §7) and run time (cascade decides
 * whether to dispatch to the forced aligner).
 */
export interface TtsCapabilities {
  /** Native per-word or per-character alignment. `'word' | 'character' | 'chunk' | 'none'`. */
  readonly nativeAlignment: 'word' | 'character' | 'chunk' | 'none';
  /** Streams audio bytes incrementally — used by future studio preview. */
  readonly streaming: boolean;
  /** Accepts SSML input. The engine MUST refuse `ssml: true` to providers with `false`. */
  readonly ssml: boolean;
  /** Supports voice cloning via the spec/CLI. */
  readonly voiceCloning: boolean;
  /** Runs entirely on the local machine — no API key, no outbound HTTP. */
  readonly local: boolean;
}

/* ───────── the provider instance (the live client) ─────────  */

export interface TtsProvider {
  readonly id: string;                       // matches plugin.providerId
  readonly capabilities: TtsCapabilities;

  /** Render one utterance to one clip. */
  synth(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult>;

  /** Enumerate available voices. Engine caches the result; provider may hit the network on first call. */
  listVoices(): Promise<TtsVoice[]>;

  /** Optional teardown — close WebSockets, free ONNX runtimes, etc. */
  dispose?(): Promise<void>;
}

export interface TtsSynthesisOptions {
  /** Provider-scoped voice id. Required — Rust's type-state `Missing → Provided` discipline,
   *  enforced at compile time via TS's required-property check. */
  voice: string;
  format?: 'mp3' | 'wav' | 'pcm';
  sampleRate?: number;        // default 24000 to match current docent
  speed?: number;             // 0.25..4.0, default 1.0
  language?: string;          // BCP-47
  ssml?: boolean;             // engine validates against capabilities.ssml before calling
  /** Provider-specific escape hatch — Rig's `additional_params: Option<Value>`. */
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
}

export interface TtsSynthesisResult {
  audio: Uint8Array;
  mediaType: string;                 // 'audio/mpeg', 'audio/wav', etc.
  durationMs: number;
  /** Word-level alignment. Empty array if neither provider nor aligner produced one. */
  alignment: WordAlignment[];
  /** Provenance — depthcheck rules grade on this. */
  alignmentSource: 'native' | 'aligner' | 'none';
  /** The raw, provider-native response (echoing Rig's `Response: T` associated type).
   *  Advanced callers can downcast; the engine ignores this. */
  raw?: unknown;
}

export interface WordAlignment {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TtsVoice {
  id: string;
  name: string;
  language: string;
  gender?: string;
  /** Provider-native metadata for the voice — gallery UI may surface this. */
  metadata?: Record<string, unknown>;
}
```

The four shape decisions worth flagging:

1. **`TtsProviderPlugin` (registry-time) vs `TtsProvider` (runtime).** Rig keeps these separate as well: `AudioGenerationClient::audio_generation_model(name)` returns a fresh `AudioGenerationModel` instance bound to the client. Same here — registering the plugin doesn't construct a client; `create(ctx)` does, lazily, only when a film actually asks.
2. **`capabilities` is on the plugin AND the instance.** On the plugin for *scheduling* decisions (the cascade can pre-decide whether the aligner is needed before constructing); on the instance for *runtime* checks (an OpenAI-compatible adapter pointed at a custom endpoint may discover at construction time that it does/doesn't have a feature).
3. **`alignment` is always present in the result.** Per the previous TTS brief, this is the most important shape decision: an empty array with `alignmentSource: 'none'` is a valid, observable state. Downstream depthcheck rules can grade on alignment without `if (result.alignment) {}` everywhere.
4. **`raw` mirrors Rig's `Response: T` associated type.** An advanced consumer of `ElevenLabsProvider` can pull the raw character-level timestamp blob if they need finer-grained data than `WordAlignment` exposes. The engine never reads `raw`.

### 5.3 The `Scene` plugin interface

This replaces the 29-arm switch in `Film.tsx` and the closed enum in `validate.ts`.

```ts
// @docent/kit/src/plugins/scene.ts

import type { PluginBase } from './types';
import type { JSONSchema7 } from 'json-schema';
import type React from 'react';

export interface ScenePlugin extends PluginBase {
  readonly kind: 'scene';
  /** The string that appears in `spec.scenes[].type`. Must be globally unique. */
  readonly sceneType: string;

  /** JSON Schema fragment for this scene's spec.
   *
   *  The engine COMPUTES the full `film.schema.json` at runtime by unioning
   *  every registered scene's schema. There is no hand-written union. This is
   *  the docent equivalent of Marpit computing the slide tokenization from
   *  the registered markdown-it rules. */
  readonly schema: JSONSchema7;

  /** The React/Remotion renderer. Receives the scene's resolved props + the
   *  shared `common` bundle (style, timing, video config, etc.). */
  readonly component: React.ComponentType<SceneRenderProps<any>>;

  /** Optional depth-review rules contributed by this scene type. */
  readonly depthRules?: DepthRule[];

  /** Optional structural validation beyond the JSON schema. Run during
   *  `docent validate`. Return a list of issues; empty array = clean. */
  readonly validate?: (scene: unknown, ctx: SceneValidationContext) => SceneIssue[];

  /** Optional plan-time hooks — see §5.5 (feature plugins). A scene plugin
   *  may declare interest in beat-level resolution (e.g. for camera/tween
   *  defaults specific to this type). */
  readonly resolveBeat?: (beat: unknown, ctx: BeatResolutionContext) => unknown;
}

export interface SceneRenderProps<TSpec> {
  /** The fully resolved scene spec — validated, modifiers expanded. */
  readonly scene: TSpec;
  /** Engine-shared props: timeline slot, style bundle, meta, etc. */
  readonly common: CommonSceneProps;
}

/* These types are owned by @docent/kit, exported for plugin authors. */
export interface CommonSceneProps {
  readonly ts: TimelineSlot;
  readonly sceneIndex: number;
  readonly sceneCount: number;
  readonly meta: FilmMeta;
  readonly style: ResolvedStyle;
}
export interface SceneValidationContext { readonly filmId: string; readonly sceneIndex: number; }
export interface BeatResolutionContext { readonly sceneType: string; readonly beatIndex: number; }
export interface SceneIssue { readonly path: string; readonly message: string; readonly severity: 'error' | 'warning'; }
```

The film schema is no longer a static JSON file. The engine builds it at runtime by walking the scene registry:

```ts
// in @docent/kit
function computeFilmSchema(registry: SceneRegistry): JSONSchema7 {
  return {
    $id: 'docent.film',
    type: 'object',
    required: ['meta', 'scenes'],
    properties: {
      meta: META_SCHEMA,
      scenes: {
        type: 'array',
        items: {
          oneOf: [...registry.values()].map((p) => ({
            type: 'object',
            properties: { type: { const: p.sceneType } },
            required: ['type'],
            allOf: [p.schema],
          })),
        },
      },
    },
  };
}
```

The committed `schema/film.schema.json` becomes a **build artifact**, regenerated by `docent doctor --emit-schema` from the registered scenes. CI checks it stays in sync.

### 5.4 The `Preset` plugin interface

Adopts Marp's three-tier escalation: preset extends preset, film overrides, scene overrides.

```ts
// @docent/kit/src/plugins/preset.ts

import type { PluginBase } from './types';
import type { DesignTokens, StyleIntent } from '../style/types';

export interface PresetPlugin extends PluginBase {
  readonly kind: 'preset';
  readonly presetId: string;

  /** Optional inheritance — preset extends another preset by id. Marp's
   *  `@import 'default'` in CSS. The engine resolves the chain at compile time. */
  readonly extends?: string;

  /** The token bundle this preset contributes. Merged shallowly over the
   *  parent preset (if any). */
  readonly tokens: Partial<DesignTokens>;

  /** Default intent mappings — `{ tone: 'editorial' } → { tokens override }`.
   *  Composes with the parent's intent map. */
  readonly intent?: Partial<Record<StyleIntent, Partial<DesignTokens>>>;

  /** Optional per-scene-type overrides (e.g. all `quantities` scenes in this
   *  preset use the warm accent). Marp's `section.lead { ... }` rule, ported. */
  readonly sceneOverrides?: Record<string, Partial<DesignTokens>>;
}
```

Resolution order, top-to-bottom (later wins):
1. `neutralTokens` (the always-present floor).
2. `extends`-chain of `PresetPlugin.tokens`.
3. `PresetPlugin.intent[currentIntent]`.
4. `PresetPlugin.sceneOverrides[scene.type]`.
5. `spec.style.override` (film-level escape hatch — Marp's `<style>` block).
6. `scene.style` (scene-level escape hatch — Marp's `<style scoped>`).

### 5.5 The `Feature` plugin interface

Cross-cutting concerns that touch multiple stages — narration/captions, music, watermark, lower-thirds. Adopted from Marp Core's feature-plugin pattern (`src/math/`, `src/emoji/`).

```ts
// @docent/kit/src/plugins/feature.ts

import type { PluginBase } from './types';

export interface FeaturePlugin extends PluginBase {
  readonly kind: 'feature';
  readonly featureId: string;

  /** Hook into spec resolution — modify the film/scene/beat after standard
   *  resolution but before rendering. */
  resolve?(spec: ResolvedSpec, ctx: ResolutionContext): ResolvedSpec | Promise<ResolvedSpec>;

  /** Hook into the cascade — add a new stage between TTS and render. The
   *  feature returns its stage descriptor or null to skip. */
  cascadeStage?(ctx: CascadeContext): CascadeStage | null;

  /** Hook into the React tree — wrap or annotate the rendered scene. The
   *  captions feature uses this to overlay text on the video. */
  wrapRender?(child: React.ReactElement, ctx: WrapRenderContext): React.ReactElement;

  /** Contribute depth-review rules. */
  depthRules?: DepthRule[];
}
```

This is what lets `@docent/core` itself be expressed as a bundle plugin that installs feature plugins for narration/captions/etc., rather than a god-object.

### 5.6 The `Modifier` plugin interface — the docent "custom directives"

Marp's `customDirectives.global/local`. The terser-spec win: an author declares `mood: anxious` and a project-local plugin expands it to three intent knobs.

```ts
// @docent/kit/src/plugins/modifier.ts

export interface ModifierPlugin extends PluginBase {
  readonly kind: 'modifier';
  /** Where this modifier lives. Three tiers (film/scene/beat) mirror Marp's
   *  three tiers (global/local/spot). */
  readonly tier: 'film' | 'scene' | 'beat';
  /** The spec key this modifier owns (e.g. `mood`, `branding`). */
  readonly key: string;
  /** Pure function — receives the user's value, returns a partial object
   *  merged into the resolved spec at the matching tier. Same shape as
   *  Marpit's directive resolver. */
  expand(value: unknown, ctx: ModifierContext): Partial<Record<string, unknown>>;
}
```

---

## 6. Provider registration & discovery

Two paths into the plugin set: explicit (`engine.use(plugin)`) and discovery (config file / package field / CLI flag).

### 6.1 The explicit path

```ts
// in @docent/core's bundle plugin (and in any third-party bundle)
const docentCore: BundlePlugin = {
  id: '@docent/core',
  kind: 'bundle',
  version: '1.0.0',
  install(engine) {
    // every default scene, registered through the public API
    engine.registerScene(frameScenePlugin);
    engine.registerScene(progressionScenePlugin);
    // ... 27 more
    // every default preset
    engine.registerPreset(engineeringPreset);
    engine.registerPreset(editorialPreset);
    // the narration feature
    engine.registerFeature(narrationFeature);
  },
};
```

`@docent/cli`'s bootstrap looks like:

```ts
const engine = new Engine();
engine.use(docentCore);          // batteries-included default
for (const plugin of await discoverPlugins(process.cwd())) {
  engine.use(plugin);
}
await engine.build(filmId);
```

### 6.2 The discovery path

Three sources, in order of precedence:

**a) `docent.config.{ts,json}` in the repo root** — explicit list, the most authoritative:

```ts
// docent.config.ts
import elevenlabs from '@docent/tts-elevenlabs';
import sciFi from '@someone/docent-scenes-scifi';
export default {
  plugins: [elevenlabs, sciFi],
};
```

**b) `package.json` `"docent"` field** — for installable plugin packs:

```json
{
  "docent": {
    "plugins": [
      "@docent/tts-elevenlabs",
      "@someone/docent-preset-fintech"
    ]
  }
}
```

The CLI does a *static* `import()` of each entry's default export and asserts it conforms to `Plugin`.

**c) `--plugin <pkg>` CLI flag** — one-off invocation:

```
docent build my-film --plugin @docent/tts-openai --tts-provider openai --tts-voice nova
```

Discovery is **strict and synchronous at boot.** No background plugin loading. No hot-reload. If a plugin fails to validate, `docent` refuses to start. The Marp discipline: extensibility is a contract, not a surprise.

### 6.3 The film spec picks a provider

```jsonc
{
  "meta": {
    "voice": "alloy",
    "tts": {
      "provider": "openai",          // matches TtsProviderPlugin.providerId
      "model": "gpt-4o-mini-tts",    // provider-scoped
      "providerOptions": {           // Rig's additional_params
        "openai": { "instructions": "speak in a calm, warm tone" }
      }
    }
  },
  "scenes": [/* ... */]
}
```

The `meta.tts` block is optional. When absent, the engine looks for a provider registered with `providerId === 'kokoro'` (the default — packaged in `@docent/core`). If even that's not registered (a bare `@docent/kit` install), validation fails with: *"no TTS provider registered — install `@docent/tts-kokoro` or set `meta.tts.provider`."*

### 6.4 Credentials live in the environment, never in the spec

Conventional names per provider — `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `CARTESIA_API_KEY`, `DOCENT_TTS_BASE_URL` + `DOCENT_TTS_API_KEY` for the OpenAI-compatible adapter. The engine passes the env to `TtsProviderPlugin.create(ctx)`; each plugin reads what it needs and throws on missing. Specs commit safely.

---

## 7. Capability flags — the TypeScript analog of Cargo features

Rig's two-axis design:
1. **Cargo features** (`#[cfg(feature = "audio")]`) gate whether *the capability class exists at all* in this build.
2. **Per-provider `Capabilities` associated types** gate which providers implement that class inside a feature-enabled build.

TypeScript has no Cargo features. The two-axis design still translates cleanly with three TS-native mechanisms:

### 7.1 Axis 1 — capability classes as separate npm packages

What Cargo's `[features]` table does for capability classes, npm scoped packages do for us:

- `@docent/kit` — the protocols.
- `@docent/kit/tts` — the TTS protocol module (subpath export). Importing nothing from this subpath ≡ the `audio` feature off.
- `@docent/kit/scene` — scene protocol.
- `@docent/kit/preset` — preset protocol.

A consumer who only needs scenes (e.g. a documentation site embedding docent for rendering, no TTS) imports `@docent/kit/scene` and the TTS code never lands in the bundle. Bundlers tree-shake the unused subpath. This is the cleanest TS analog to a Cargo feature.

The full `@docent/kit` barrel re-exports everything for the convenience case (the CLI, `@docent/core`). Anyone optimizing bundle size or surface area imports from subpaths.

### 7.2 Axis 2 — per-provider capability declarations as literal types

Rig's `type AudioGeneration = Capable<ConcreteModel> | Nothing` becomes a literal TS field on the plugin:

```ts
export interface TtsCapabilities {
  readonly nativeAlignment: 'word' | 'character' | 'chunk' | 'none';
  readonly streaming: boolean;
  readonly ssml: boolean;
  readonly voiceCloning: boolean;
  readonly local: boolean;
}
```

A plugin is **forced to declare these at definition time** — there is no default. A scene that wants per-word highlight-on-narration writes:

```ts
const passageScenePlugin: ScenePlugin = {
  // ...
  requiresTtsCapabilities: { nativeAlignment: 'word' /* or 'aligner-fallback' */ },
};
```

…and the engine, at *spec resolution time*, refuses to build a film where `passage` scenes are present but the active TTS provider has `nativeAlignment === 'none'` AND no `ForcedAligner` feature plugin is registered. This is the TS analog of Rig's `Capable<_>` vs `Nothing` — the check happens at compile/resolution time, not at render time five minutes into a long Remotion run.

### 7.3 Axis 3 — optional providers as separate packages with declared peer deps

What `[features] elevenlabs = ["dep:eleven_labs_sdk"]` does in Cargo:
- The `elevenlabs` feature, when off, removes the optional `eleven_labs_sdk` dep from compilation.
- When on, the dep is pulled in.

The npm analog is exactly **separate packages with `peerDependencies`**:

```jsonc
// @docent/tts-elevenlabs/package.json
{
  "name": "@docent/tts-elevenlabs",
  "version": "1.0.0",
  "peerDependencies": {
    "@docent/kit": "^1.0.0",
    "elevenlabs": "^1.0.0"
  }
}
```

A user who wants ElevenLabs runs `bun add @docent/tts-elevenlabs elevenlabs`. The `elevenlabs` SDK is not in `@docent/core`'s dep tree at all. The plugin package is the entire feature flag.

This is also exactly what [Mastra](https://mastra.ai/) does (`@mastra/voice-openai`, `@mastra/voice-elevenlabs`) — and our research already noted it's the cleanest provider-split pattern in the TS landscape.

### 7.4 Summary — the TS feature-flag model

| Rust | TypeScript |
|---|---|
| `Cargo.toml [features]` | npm packages + subpath exports |
| `#[cfg(feature = "audio")]` | `import` from `@docent/kit/tts` (or don't) |
| `type AudioGeneration = Capable<M>` | `TtsCapabilities` field on the plugin |
| `type AudioGeneration = Nothing` | The plugin doesn't exist / not installed |
| `cargo build --features elevenlabs` | `bun add @docent/tts-elevenlabs` |
| `impl AudioGenerationClient for OpenAI` | `export default openaiTtsPlugin` |

The net effect: a docent install with only `@docent/kit` + `@docent/core` (and the default `@docent/tts-kokoro`) has *zero* paid-API code in its bundle. Adding ElevenLabs is one `bun add`. The bundler enforces the boundary.

---

## 8. Pipeline integration — how cascade.ts, validate.ts, Film.tsx adopt this

### 8.1 New repository layout

```
packages/
  kit/                         # @docent/kit — protocols + registries, no impls
    src/
      plugins/
        types.ts               # PluginBase, Plugin union, BundlePlugin
        scene.ts               # ScenePlugin + types
        tts.ts                 # TtsProviderPlugin, TtsProvider + types
        preset.ts              # PresetPlugin
        feature.ts             # FeaturePlugin
        modifier.ts            # ModifierPlugin
      engine/
        engine.ts              # the Engine class — use(), register*(), build()
        registry.ts            # the typed registries
        resolve.ts             # spec resolution, modifier expansion
      validate/
        validate.ts            # validateSpec(spec, registry)
        depthcheck.ts          # depth review framework (rules are contributed by plugins)
      schema/
        computeSchema.ts       # union-the-scene-schemas
    package.json               # exports: ".", "./scene", "./tts", "./preset", "./feature"

  core/                        # @docent/core — the default plugin pack
    src/
      bundle.ts                # the BundlePlugin entrypoint
      scenes/                  # 29 ScenePlugins (one per existing scene)
        frame.ts
        progression.ts
        # ... etc
      presets/
        engineering.ts
        editorial.ts
        # ... etc
      features/
        narration.ts           # the FeaturePlugin replacing per-beat audio handling
      remotion/
        Film.tsx               # reads the scene registry, no more 29-arm switch
        Root.tsx
    package.json

  tts-kokoro/                  # @docent/tts-kokoro — the default TTS provider
    src/index.ts               # exports default: TtsProviderPlugin
    package.json               # peer: kokoro-js (or Python sidecar)

  tts-openai/
  tts-elevenlabs/
  tts-cartesia/
  tts-openai-compatible/       # each one a small npm package

  cli/                         # @docent/cli — discovery + bootstrap
    docent.ts
    cascade.ts                 # now a thin orchestrator on top of Engine
    discover.ts
```

### 8.2 `cascade.ts` becomes a thin orchestrator

Today `cascade.ts` hardcodes `uv run python pipeline/tts.py`. After the migration it calls the registered TTS provider through the `Engine`:

```ts
// in @docent/cli/cascade.ts
const engine = await bootEngine(REPO_ROOT);   // boots @docent/core + discovered plugins
const film = await engine.loadFilm(filmId);   // validates against the runtime schema

// stages run through Engine, not direct subprocess calls
const audio = await engine.runStage('tts', film);
const clips = await engine.runStage('clips', film);
await engine.runStage('render', film, { still: opts.still, scale: opts.scale });
```

Each stage is itself a feature plugin (or core capability) registered through the same protocol. The narration stage is `@docent/core`'s narration feature, which dispatches to the active `TtsProvider`.

### 8.3 `validate.ts` becomes registry-driven

The 29-element `SCENE_TYPES` array goes away. `validateSpec(spec)` resolves the active engine's scene registry and validates each scene against the registered plugin's `schema` and `validate` hook:

```ts
function validateSpec(spec: unknown, engine: Engine): SceneIssue[] {
  const filmSchema = engine.computeSchema();           // union of registered scenes
  const schemaIssues = ajv.validate(filmSchema, spec);
  const sceneIssues = spec.scenes.flatMap((s, i) => {
    const plugin = engine.sceneRegistry.get(s.type);
    return plugin?.validate?.(s, { filmId: spec.meta.id, sceneIndex: i }) ?? [];
  });
  return [...schemaIssues, ...sceneIssues];
}
```

### 8.4 `Film.tsx` reads the registry

The 29-arm conditional disappears:

```tsx
// @docent/core/remotion/Film.tsx (the new shape)
export const Film: React.FC<{ filmId: string }> = ({ filmId }) => {
  const engine = useEngine();
  const film = FILMS[filmId];
  const timeline = buildTimeline(film);
  const style = resolveStyle(film.style);

  return (
    <AbsoluteFill>
      <TransitionSeries>
        {timeline.scenes.flatMap((ts, i) => {
          const plugin = engine.sceneRegistry.get(ts.scene.type);
          if (!plugin) throw new Error(`unregistered scene type: ${ts.scene.type}`);
          const Component = plugin.component;
          const common = { ts, sceneIndex: i, sceneCount: timeline.scenes.length, meta: film.meta, style };
          // feature plugins get to wrap each scene
          let node = <Component scene={ts.scene} common={common} />;
          for (const feature of engine.features) {
            if (feature.wrapRender) node = feature.wrapRender(node, { sceneType: ts.scene.type, common });
          }
          return [
            <TransitionSeries.Sequence key={i} durationInFrames={ts.frames}>
              {node}
            </TransitionSeries.Sequence>,
            // transition logic preserved
          ];
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
```

### 8.5 Depthcheck is contributed, not centralized

Today depth rules live in `cli/depthcheck.ts`. After the migration, each `ScenePlugin` and `FeaturePlugin` contributes its rules:

```ts
const passageScenePlugin: ScenePlugin = {
  // ...
  depthRules: [
    { id: 'passage-source-attributed', severity: 'warn', check: (scene) => /* ... */ },
    { id: 'passage-needs-word-alignment', severity: 'warn', check: (scene, ctx) =>
        ctx.activeTts.capabilities.nativeAlignment === 'none' && !ctx.activeTts.aligner
          ? { path: scene.id, message: 'passage scene benefits from word alignment...' }
          : null,
    },
  ],
};
```

This is the Marp discipline applied to depthcheck: the core implementation is itself a customer of the rule contribution API a third party would use.

---

## 9. Migration plan — single-shot, no alpha/beta

The user has explicitly ruled out a parallel-track migration. Here is how the entire engine moves in one branch.

The plan is **one branch, one merge, one minor version bump** (2.x → 3.0, semver). After the merge, the old code paths are gone — there is no `--legacy` flag, no `engine.useLegacy()`, no `pipeline/tts.py` invocation outside the Kokoro plugin.

### 9.1 Branch sequence

1. **Lift the protocols.** Move types from `packages/engine/src/engine/`, `packages/engine/src/style/`, `packages/engine/cli/validate.ts` into `packages/kit/src/plugins/`. No behavior change yet — `packages/engine` still imports them through the new path.

2. **Extract the Engine class.** Move the registries (currently implicit in `validate.ts`'s arrays + `Film.tsx`'s switch) into `packages/kit/src/engine/`. `packages/engine` still works because it imports the engine and registers all 29 scenes explicitly.

3. **Carve out `@docent/core`.** Rename `packages/engine` → `packages/core`. Move scene components into `packages/core/src/scenes/`, presets into `packages/core/src/presets/`. Each scene becomes a `ScenePlugin` exported as default. Each preset becomes a `PresetPlugin`. The `BundlePlugin` (`packages/core/src/bundle.ts`) installs everything.

4. **Extract `@docent/cli`.** Move `cli/docent.ts`, `cli/cascade.ts`, `cli/validate.ts`, etc., into `packages/cli/`. The bin entry point becomes `packages/cli/docent.ts`. It boots the Engine with `@docent/core` by default.

5. **Carve out the Kokoro TTS plugin.** Move `packages/engine/pipeline/tts.py` and its TS wrapper into `packages/tts-kokoro/`. The `TtsProviderPlugin` shells out to the Python sidecar (or to `kokoro-js`, depending on the answer to Open Question O3 below). Behavior is byte-identical to today: same voice, same trim ceilings, same manifest schema. The default film with no `meta.tts` block resolves to `kokoro` automatically.

6. **Wire the alternative providers.** Build `@docent/tts-openai`, `@docent/tts-elevenlabs`, `@docent/tts-cartesia`, `@docent/tts-openai-compatible` against the new `TtsProviderPlugin` interface. Each one in its own package, each one in this branch — the user's ruling is no alpha/beta, so the alternatives ship together with the protocol.

7. **Regenerate the committed schema.** `docent doctor --emit-schema` writes `schema/film.schema.json` from the registry. CI runs this and fails if the artifact drifts.

8. **Migrate the gallery.** Run `scripts/migrate-films.ts` (already exists in repo) extended to add the implicit `meta.tts.provider: 'kokoro'` to every existing film. Render-byte-identical proof: render the full gallery on `main`, render again on the branch, diff the MP4s frame-by-frame (the existing hermetic test pattern). The migration must pass byte-equality on every existing film.

9. **Documentation, then merge.** Update README, AGENTS.md, the survey/treatment prompts. The Marp brief and this design doc become the architecture-of-record under `docs/design/`.

### 9.2 Acceptance criteria for the merge

- **Every film in `films/` renders byte-identically before/after.** Existing specs are unchanged.
- **`@docent/kit` builds with zero scene/TTS/preset code.** Smoke test: a brand-new package importing only `@docent/kit` compiles.
- **`@docent/core`'s scene/preset registration uses the public `engine.registerScene/registerPreset` API exclusively.** Grep the diff: zero accesses to private engine internals.
- **A demo plugin in `examples/scene-sankey/`** registers a new scene type via `docent.config.ts`. `docent build sankey-demo` succeeds with no fork.
- **All four alternative TTS providers** (`openai`, `elevenlabs`, `cartesia`, `openai-compatible`) successfully render a one-beat smoke-test film with their credentials in env.
- **Depthcheck rules** are contributed by plugins; `docent depthcheck` produces the same report on existing films before/after.

### 9.3 What we DON'T do in this migration

- No streaming TTS (`synthStream`). Defer until the studio asks. The interface is closed at `synth()` for ship.
- No forced aligner (`WhisperXAligner`). The interface admits one (`alignmentSource: 'aligner'`), but it's not built. A `passage` scene with an OpenAI TTS today gets `alignmentSource: 'none'` — and depthcheck warns.
- No browser-side plugin loading. Discovery is CLI/build-time only. The Remotion bundler resolves plugin imports statically.
- No hot-reload of plugins. `docent studio` restart on plugin change.

---

## 10. Open questions — need the user's call before implementation

**O1. Package scope: `@docent/*` or unscoped?**
The user is `benelser`. The git remote is `github.com/benelser/docent`. The npm scope `@docent` is unclaimed at the time of writing; `docent-*` unscoped is available. Scoped is cleaner for boundary discipline; unscoped is easier to publish without an npm org. **Recommendation: claim `@docent` on npm now, use it everywhere.**

**O2. `@docent/kit` vs another name.**
The Marp split is named `marpit` (framework) / `marp` (product). The brief in `docs/research/marp-inspired-extensibility.md` §11 raised the same question for docent. Candidates: `@docent/kit`, `@docent/stage`, `@docent/core` (framework) + `@docent/render` (impl), `explainer-kit`. **Recommendation: `@docent/kit` for the framework, `@docent/core` for the implementation pack, `@docent/cli` for the surface. Mirror Marp's discipline exactly.**

**O3. Kokoro Python sidecar vs `kokoro-js`.**
The previous TTS research (§7.4 of `tts-adapter-ecosystem.md`) ended on: "Recommended: B for now, A as a follow-up." If we're shipping a single-shot v3 migration with no alpha/beta, the right call is to pick one now. Option A drops Python entirely; option B keeps it for the (future) WhisperX aligner. **Recommendation: ship as B (Python-Kokoro stays, the plugin shells out exactly like today) to preserve byte-equality on the gallery. The migration from B to A becomes a normal patch release on `@docent/tts-kokoro` later, transparent to film specs.**

**O4. JSON-Schema runtime — Ajv or Zod or Valibot?**
The schema-from-registry computation needs a runtime JSON Schema validator. Today docent uses a hand-rolled validator in `validate.ts`. The plugin contract makes that unsustainable — every plugin can contribute a schema fragment, and the engine has to compose and check them. **Recommendation: Ajv (`ajv` 8.x) for JSON Schema validity + Zod for the engine's *own* internal types (Plugin shape, Engine.use args). Both have stable bun support.**

**O5. The schema artifact: still committed?**
Today `schema/film.schema.json` is hand-maintained and committed. After the migration it's a build artifact. Two paths: (a) keep it committed but auto-regenerated by CI on every PR; (b) drop it from VCS and produce it on-demand. Option (a) preserves IDE schema-completion in `films/*.json`; option (b) avoids the merge-conflict-on-schema noise. **Recommendation: (a) — IDE completion is too valuable to lose. CI re-emits and fails on drift.**

**O6. Plugin discovery sources — config file syntax.**
TS config (`docent.config.ts`) is the most expressive but requires a bun/tsx loader at boot. JSON config (`docent.config.json`) is dead-simple but can't `import` plugins as values — it has to name them as package strings the CLI resolves dynamically. **Recommendation: accept BOTH. TS config first (richer); JSON config as the fallback (zero-tooling case, the most "Marp-like" — just declare the plugin name). The `package.json` `"docent"` field is a third minor path for pure-string plugin lists.**

**O7. Capability mismatch policy: warn or hard-fail?**
A film with a `passage` scene rendered through OpenAI TTS — `nativeAlignment: 'none'` — is legal but lossy. Should the engine warn (`depth: 1 warn`) or hard-fail (`spec rejects this provider for this scene type`)? Marp's analog (a directive a theme doesn't understand) is a silent no-op, but docent's docent-method discipline argues for the louder signal. **Recommendation: warn for now; hard-fail when the spec explicitly opts-in via `meta.tts.strict: true`. The depthcheck rule `passage-needs-word-alignment` lands in `@docent/core`'s passage scene.**

**O8. Plugin install-time validation.**
Should `engine.use(plugin)` immediately call `TtsProviderPlugin.create({ env, … })` to check credentials, or lazy-construct on first `synth()`? Eager construction means `docent doctor` can show "openai: ok, elevenlabs: missing key" up front; lazy means `docent build` is faster on films that don't need TTS. **Recommendation: lazy by default; eager only in `docent doctor`. The plugin contract requires `create()` to throw cleanly on missing credentials — that's the doctor's signal.**

**O9. The `Modifier` plugin tier — ship now or later?**
The custom-modifier surface is the Marp brief's R3. It adds power but also a new authoring concept. We could ship the migration *without* it (the engine still registers built-in modifiers internally, just no plugin extension point), and add the plugin tier in a follow-up. **Recommendation: ship the protocol in this branch; have `@docent/core` register its built-in resolutions through it; do NOT expose the third-party path in the first release. The protocol is internal-only until a real use case lands. (Marp does this for some of its directives — `marpitPlugin` was internal before being promoted.)**

**O10. Versioning strategy across packages.**
The packages have a tight coupling (`@docent/core` 1.0.0 needs `@docent/kit` 1.0.0). Lockstep semver (all packages bump together) is simpler; independent semver is more honest. **Recommendation: lockstep at the major. Each package's `peerDependencies` pins `@docent/kit: ^X.0.0` where X is the current major. Inside a major, packages move independently.**

---

## Appendix A — the verbatim TtsProvider interface (copy-paste-ready)

```ts
// @docent/kit/src/plugins/tts.ts

import type { PluginBase } from './types';

export interface TtsCapabilities {
  readonly nativeAlignment: 'word' | 'character' | 'chunk' | 'none';
  readonly streaming: boolean;
  readonly ssml: boolean;
  readonly voiceCloning: boolean;
  readonly local: boolean;
}

export interface TtsProviderContext {
  readonly model?: string;
  readonly providerOptions?: Record<string, unknown>;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cacheDir: string;
}

export interface TtsProviderPlugin extends PluginBase {
  readonly kind: 'tts';
  readonly providerId: string;
  readonly capabilities: TtsCapabilities;
  create(ctx: TtsProviderContext): Promise<TtsProvider>;
}

export interface TtsSynthesisOptions {
  voice: string;
  format?: 'mp3' | 'wav' | 'pcm';
  sampleRate?: number;
  speed?: number;
  language?: string;
  ssml?: boolean;
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
}

export interface WordAlignment {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TtsSynthesisResult {
  audio: Uint8Array;
  mediaType: string;
  durationMs: number;
  alignment: WordAlignment[];
  alignmentSource: 'native' | 'aligner' | 'none';
  raw?: unknown;
}

export interface TtsVoice {
  id: string;
  name: string;
  language: string;
  gender?: string;
  metadata?: Record<string, unknown>;
}

export interface TtsProvider {
  readonly id: string;
  readonly capabilities: TtsCapabilities;
  synth(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult>;
  listVoices(): Promise<TtsVoice[]>;
  dispose?(): Promise<void>;
}
```

## Appendix B — the verbatim Scene plugin interface (copy-paste-ready)

```ts
// @docent/kit/src/plugins/scene.ts

import type { PluginBase } from './types';
import type { JSONSchema7 } from 'json-schema';
import type React from 'react';
import type { CommonSceneProps, SceneValidationContext, BeatResolutionContext, SceneIssue, DepthRule, TtsCapabilities } from './types';

export interface SceneRenderProps<TSpec> {
  readonly scene: TSpec;
  readonly common: CommonSceneProps;
}

export interface ScenePlugin extends PluginBase {
  readonly kind: 'scene';
  readonly sceneType: string;
  readonly schema: JSONSchema7;
  readonly component: React.ComponentType<SceneRenderProps<any>>;
  readonly depthRules?: DepthRule[];
  readonly validate?: (scene: unknown, ctx: SceneValidationContext) => SceneIssue[];
  readonly resolveBeat?: (beat: unknown, ctx: BeatResolutionContext) => unknown;
  /** Optional — declare which TTS capabilities this scene meaningfully uses.
   *  If set, the engine checks the active TTS provider satisfies them at
   *  spec-resolution time (and warns or hard-fails per O7). */
  readonly requiresTtsCapabilities?: Partial<TtsCapabilities>;
}
```

## Appendix C — the verbatim BundlePlugin pattern (how `@docent/core` registers itself)

```ts
// @docent/core/src/bundle.ts
import type { BundlePlugin } from '@docent/kit';
import { frameScenePlugin } from './scenes/frame';
import { progressionScenePlugin } from './scenes/progression';
// ... 27 more imports
import { engineeringPreset } from './presets/engineering';
import { editorialPreset } from './presets/editorial';
import { narrationFeature } from './features/narration';

export const docentCore: BundlePlugin = {
  id: '@docent/core',
  kind: 'bundle',
  version: '3.0.0',
  install(engine) {
    engine.registerScene(frameScenePlugin);
    engine.registerScene(progressionScenePlugin);
    // ...
    engine.registerPreset(engineeringPreset);
    engine.registerPreset(editorialPreset);
    engine.registerFeature(narrationFeature);
  },
};

export default docentCore;
```
