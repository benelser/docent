// The TTS adapter contract — the Rig-shaped, Marp-shaped abstraction over
// every TTS provider docent can speak through. This file is the centerpiece
// of the TTS abstraction layer; it is referenced verbatim from
// docs/design/plugin-architecture.md §5 and Appendix A.
//
// Two layers:
//   - `TtsProviderPlugin`  — the *plugin* that gets registered in the registry.
//                             Declares the provider exists and how to construct
//                             a live instance.
//   - `TtsProvider`        — the *instance* — a configured, live client that
//                             can synthesise text. Constructed lazily by the
//                             plugin's `create(ctx)` when a film actually
//                             needs TTS.
//
// `capabilities` is on both — on the plugin so the cascade can pre-decide
// whether a provider satisfies a scene's requirements before construction,
// and on the instance so a constructed provider can refuse a request that
// asks for a capability it doesn't have (e.g. an OpenAI-compatible adapter
// pointed at a custom endpoint that doesn't actually support SSML).
//
// `alignment` is ALWAYS present in the result. An empty array with
// `alignmentSource: 'none'` is a valid, observable state — downstream
// depthcheck rules can grade on alignment without `if (result.alignment) {}`
// everywhere.
//
// `raw` mirrors Rig's `Response: T` associated type — an advanced consumer
// can downcast to a provider-native blob. The engine never reads it.

/**
 * Capability matrix — Rig's `Capabilities` trait ported to TS as a field on
 * the plugin. Every cell is a literal: a discriminated value telling the
 * engine, at compile time AND run time, which features this provider
 * supports.
 *
 * The engine uses these at:
 *   - spec-resolution time (a scene that needs per-word alignment fails on a
 *     provider with `nativeAlignment: 'none'` — warn by default, hard-fail
 *     when `meta.tts.strict: true`).
 *   - runtime (a `synth(text, {ssml: true})` against a provider with
 *     `ssml: false` is rejected before the API call leaves the process).
 */
export interface TtsCapabilities {
  /**
   * Native per-word or per-character alignment.
   *
   *  - `'word'`       — provider returns word-level timestamps (e.g. some
   *                     OpenAI gpt-4o-mini-tts paths).
   *  - `'character'`  — provider returns per-character timestamps (ElevenLabs
   *                     `with_timestamps`).
   *  - `'chunk'`      — provider returns chunk-level timestamps (rougher than
   *                     word — e.g. some self-hosted SDKs).
   *  - `'none'`       — no native alignment. Future: a WhisperX forced-aligner
   *                     can fill in `WordAlignment[]` post-synthesis.
   */
  readonly nativeAlignment: 'word' | 'character' | 'chunk' | 'none';
  /** Streams audio bytes incrementally — used by future studio preview. */
  readonly streaming: boolean;
  /**
   * Accepts SSML input. The engine MUST refuse a `synth(text, {ssml: true})`
   * call to providers with `ssml: false`.
   */
  readonly ssml: boolean;
  /** Supports voice cloning via the spec/CLI. */
  readonly voiceCloning: boolean;
  /** Runs entirely on the local machine — no API key, no outbound HTTP. */
  readonly local: boolean;
}

/**
 * The construction context the engine passes into a plugin's `create()`. Holds
 * provider-scoped knobs (model, voice, providerOptions), credentials (always
 * from `process.env`, never from the spec), and a cache directory the
 * provider may write to (e.g. for one-time model downloads).
 */
export interface TtsProviderContext {
  /** From the film spec's `meta.tts.model`. Provider-scoped. */
  readonly model?: string;
  /**
   * From the film spec's `meta.tts.providerOptions`. The Rig-shaped escape
   * hatch — provider-specific knobs that don't belong in the shared schema.
   */
  readonly providerOptions?: Record<string, unknown>;
  /**
   * From `process.env`. The contract: credentials live here, never in the
   * spec. A provider that needs `OPENAI_API_KEY` reads it off `env`, never
   * off `providerOptions`.
   */
  readonly env: Readonly<Record<string, string | undefined>>;
  /**
   * Where the engine wants cached audio (or one-time downloads) to land.
   * Per-film for output audio; the engine creates it before calling `create`.
   */
  readonly cacheDir: string;
}

/**
 * The plugin — what gets registered. Declares the provider exists, its
 * capabilities at the type level, and how to construct a live instance.
 *
 * MUST throw on `create()` if credentials or configuration are insufficient
 * (env var missing, model unknown, etc.) BEFORE the cascade burns minutes on
 * a render that will fail.
 */
export interface TtsProviderPlugin {
  /**
   * Stable provider id used in film specs:
   * `"kokoro" | "openai" | "elevenlabs" | "openai-compatible" | …`.
   *
   * The string an author writes in `meta.tts.provider`.
   */
  readonly providerId: string;
  /** Plugin author-declared semver. Used by `docent doctor` and discovery. */
  readonly version: string;
  /** Type-level capability declaration — Rig's `Capabilities` ported to TS. */
  readonly capabilities: TtsCapabilities;
  /**
   * Construct an instance from the active environment + spec config.
   *
   * MUST throw if credentials/config are insufficient (env var missing,
   * voice unknown, etc.) BEFORE the cascade runs the long render.
   */
  create(ctx: TtsProviderContext): Promise<TtsProvider>;
}

/**
 * The options to `synth()`. `voice` is the only required field: every TTS
 * provider expects to be told who is speaking. `format`, `sampleRate`,
 * `speed`, `language`, `ssml` are optional; `providerOptions` is the
 * Rig-shaped escape hatch.
 */
export interface TtsSynthesisOptions {
  /**
   * Provider-scoped voice id. Required — mirrors Rig's type-state
   * `Missing → Provided` discipline (a TS-level required field, enforced at
   * compile time).
   */
  voice: string;
  /** Default `mp3`. Some providers cannot honour every format. */
  format?: 'mp3' | 'wav' | 'pcm';
  /** Default 24000 — matches the current docent Python-Kokoro path. */
  sampleRate?: number;
  /** 0.25..4.0, default 1.0. */
  speed?: number;
  /** BCP-47 — e.g. `en-US`, `en-GB`. */
  language?: string;
  /** Engine validates this against `capabilities.ssml` before calling. */
  ssml?: boolean;
  /**
   * Provider-specific escape hatch — Rig's `additional_params: Option<Value>`.
   * The engine never touches this; it is passed verbatim to the provider.
   */
  providerOptions?: Record<string, unknown>;
  /** Honoured if the provider supports cancellation. */
  abortSignal?: AbortSignal;
  /**
   * `pace` is a docent-side hint about the trailing-silence trim ceiling.
   * Used by the kokoro provider for its per-beat silence trim (the move
   * from `pipeline/tts.py`). Other providers may ignore it.
   */
  pace?: 'hold' | 'settle' | 'normal' | 'brisk';
}

/**
 * Word-level alignment. ElevenLabs returns character-level; the engine
 * folds those into words. A `WordAlignment` row pins a word (or token) to
 * its in-clip start and end times in milliseconds.
 */
export interface WordAlignment {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * The result of a `synth()` call. `audio` is the bytes the engine writes to
 * disk; `durationMs` lets the engine time the beat without re-probing the
 * file; `alignment` carries word-level timings (may be empty); `raw` echoes
 * Rig's `Response: T` for advanced callers.
 *
 * `metrics` is the docent-side per-beat rhythm telemetry that lived in the
 * old Python `pipeline/tts.py`. It is optional — only kokoro fills it today.
 */
export interface TtsSynthesisResult {
  audio: Uint8Array;
  /** e.g. `audio/mpeg`, `audio/wav`. */
  mediaType: string;
  durationMs: number;
  /** Word-level alignment. Empty array when neither provider nor aligner produced one. */
  alignment: WordAlignment[];
  /** Provenance — depthcheck rules grade on this. */
  alignmentSource: 'native' | 'aligner' | 'none';
  /**
   * The raw, provider-native response (echoing Rig's `Response: T` associated
   * type). Advanced callers can downcast; the engine ignores this.
   */
  raw?: unknown;
  /**
   * Per-beat rhythm telemetry — wordCount, clipSeconds, wpm,
   * leadingSilenceMs, trailingSilenceMs. Optional; only the kokoro provider
   * fills it today (the move from `pipeline/tts.py`).
   */
  metrics?: TtsBeatMetrics;
}

/**
 * Per-beat rhythm telemetry — the move from `pipeline/tts.py`'s manifest.
 * Surfaced on the result so depthcheck rules (`narration-rhythm`) can grade
 * on rhythm without re-probing the audio file.
 */
export interface TtsBeatMetrics {
  /** Total clip length in seconds (post-trim, what the viewer hears). */
  clipSeconds: number;
  /** Number of words in the narration. */
  wordCount: number;
  /** Words per minute = (wordCount / clipSeconds) * 60. */
  wpm: number | null;
  /** Leading silence in ms (post-trim). */
  leadingSilenceMs: number | null;
  /** Trailing silence in ms (post-trim). */
  trailingSilenceMs: number | null;
  /** Pre-trim leading silence (diagnostic). */
  leadingSilencePreTrimMs?: number;
  /** Pre-trim trailing silence (diagnostic). */
  trailingSilencePreTrimMs?: number;
  /** The beat's `pace` knob that drove the trim ceiling. */
  pace?: 'hold' | 'settle' | 'normal' | 'brisk' | null;
  /** Whether the silence trim was applied this run. */
  trimmed?: boolean;
}

/**
 * One voice the provider exposes. `id` is the string passed to `synth({voice})`;
 * `metadata` is provider-native (the gallery UI may surface this).
 */
export interface TtsVoice {
  id: string;
  name: string;
  language: string;
  gender?: string;
  /** Provider-native metadata for the voice — gallery UI may surface this. */
  metadata?: Record<string, unknown>;
}

/**
 * The live, configured provider instance. Returned by `TtsProviderPlugin.create()`.
 * Owns one logical client (and any handles it carries — ONNX runtime, fetch
 * client, WebSocket, etc.). `dispose()` is optional but recommended: the
 * cascade calls it after each film to free heavy resources.
 */
export interface TtsProvider {
  /** Matches the plugin's `providerId`. */
  readonly id: string;
  /**
   * The capability matrix this *instance* exposes. Usually identical to the
   * plugin's; an OpenAI-compatible adapter may discover at construction time
   * that the configured endpoint has more or fewer capabilities.
   */
  readonly capabilities: TtsCapabilities;
  /** Render one utterance to one clip. */
  synth(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult>;
  /**
   * Enumerate available voices. The engine caches the result;
   * a provider may hit the network on first call.
   */
  listVoices(): Promise<TtsVoice[]>;
  /** Optional teardown — close WebSockets, free ONNX runtimes, etc. */
  dispose?(): Promise<void>;
}

/**
 * Custom error class — the engine, the CLI, and the cascade all treat this
 * as the "credentials missing / dep missing / config invalid" sentinel.
 *
 * The `providerId` field lets the CLI surface a focused error message:
 *   `openai provider requires \`openai\` npm package — bun add openai`
 */
export class TtsProviderError extends Error {
  readonly providerId: string;
  constructor(providerId: string, message: string) {
    super(`[${providerId}] ${message}`);
    this.providerId = providerId;
    this.name = 'TtsProviderError';
  }
}
