// TTS protocol — recapitulated from Build A's `packages/engine/src/tts/types.ts`.
//
// The kit OWNS the canonical shape of the TTS contract. `@bjelser/core` and
// every `@bjelser/tts-*` package implement against this. The current
// `packages/engine/src/tts/types.ts` is the source of truth that this file
// mirrors; once the engine is ripped out and replaced with `@bjelser/core`,
// those types move to live HERE — but the values do not change.
//
// **The kit's TtsProviderPlugin is the canonical one.** This file's
// definition adds the `kind: 'tts'` discriminator + `name: string` field
// (the PluginBase requirement) so `engine.use(plugin)` can route. Otherwise
// it is identical, byte for byte, to Build A's contract.

import type {PluginBase} from '../protocols';

/* ───────── capability matrix (Rig-shaped) ───────── */

/**
 * The capability matrix every TTS provider declares. Identical to Build A's
 * `TtsCapabilities`. The engine reads this at:
 *   - **spec-resolution time** — a `passage` scene requiring
 *     `nativeAlignment: 'word'` fails on a provider whose value is
 *     `'none'`; warn by default, hard-fail when `meta.tts.strict: true`.
 *   - **runtime** — `synth(text, {ssml: true})` against a provider with
 *     `ssml: false` is rejected before the network call.
 *
 * Surfaced as type-level declarations on {@link TtsProviderPlugin} so
 * `docent doctor` can inspect them without instantiating the provider.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.4
 */
export interface TtsCapabilities {
  /**
   * The granularity of timing the provider returns natively.
   * - `'word'` — per-word start/end ms (used by `passage` reveal).
   * - `'character'` — per-grapheme timing (rare; per-char captions).
   * - `'chunk'` — coarse phrase-level boundaries.
   * - `'none'` — duration only; an external aligner can fill the gap.
   */
  readonly nativeAlignment: 'word' | 'character' | 'chunk' | 'none';
  /** Whether the provider streams audio bytes incrementally. */
  readonly streaming: boolean;
  /** Whether the provider accepts SSML-tagged input. */
  readonly ssml: boolean;
  /** Whether the provider supports a custom voice from a sample. */
  readonly voiceCloning: boolean;
  /** Whether the provider runs locally (no network call). */
  readonly local: boolean;
  /**
   * Whether the provider accepts free-text performance direction at
   * synth-time (e.g. OpenAI `gpt-4o-mini-tts.instructions`, ElevenLabs
   * `voice_settings.style`, future SSML emotion tags). Surfaces the
   * beat-level `voiceDirection` field — when this is `true`, the
   * cascade routes the field through; when `false`, it's silently
   * ignored. The CLI's `docent voices` and `docent doctor` report
   * this so authors know whether their voiceDirection writing will
   * actually be honored.
   */
  readonly toneSteering: boolean;
}

/* ───────── construction context ───────── */

/**
 * Context handed to {@link TtsProviderPlugin.create}. Carries the
 * spec-supplied options + environment + cache location. The plugin reads
 * env vars (`OPENAI_API_KEY`, …) and config from here; it should NOT
 * read `process.env` directly.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.4
 */
export interface TtsProviderContext {
  /** Provider-specific model id (e.g. `'tts-1-hd'`, `'eleven_turbo_v2'`). */
  readonly model?: string;
  /** Free-form provider-specific options block from the film spec. */
  readonly providerOptions?: Record<string, unknown>;
  /** Snapshot of `process.env` — read API keys etc. from here. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Directory the provider may use for caching synthesized clips. */
  readonly cacheDir: string;
}

/* ───────── the plugin (registry-time) ───────── */

/**
 * The TtsProviderPlugin — the **registry-time** description of a TTS
 * provider. Lives in the kit's `tts` registry; constructed by its author;
 * registered via `engine.use(ttsPlugin)`.
 *
 * **Plugin shape vs. runtime instance**: the plugin (this interface)
 * carries the metadata (id, capabilities) and the factory (`create`). The
 * runtime instance (see {@link TtsProvider}) is what `create()` returns
 * and what the cascade calls `synth()` on. The split mirrors Build A's
 * shape; it lets `docent doctor` inspect capabilities without paying the
 * cost of credential checks.
 *
 * **The shape every `@bjelser/tts-*` package exports.** A future migration
 * of Build A's existing four providers (kokoro, openai, elevenlabs,
 * openai-compatible) into the new package layout is mechanical — add
 * `kind: 'tts'` + `name`, leave everything else untouched.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.4
 */
export interface TtsProviderPlugin extends PluginBase {
  /** The plugin-kind discriminator. */
  readonly kind: 'tts';
  /**
   * Stable provider id used in film specs (`meta.tts.provider`):
   * `"kokoro" | "openai" | "elevenlabs" | "openai-compatible" | …`.
   * Must be globally unique within the active engine.
   */
  readonly providerId: string;
  /** Type-level capability declaration. See {@link TtsCapabilities}. */
  readonly capabilities: TtsCapabilities;
  /**
   * Construct a runtime {@link TtsProvider} instance from the active
   * environment + spec config.
   *
   * **MUST throw if credentials/config are insufficient** (env var missing,
   * voice unknown, etc.) BEFORE the cascade burns minutes on a render.
   * Throw {@link TtsProviderError} for the sentinel signal the CLI matches on.
   */
  create(ctx: TtsProviderContext): Promise<TtsProvider>;
}

/* ───────── runtime options + result ───────── */

/**
 * Options passed to {@link TtsProvider.synth} for a single beat.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.4
 */
export interface TtsSynthesisOptions {
  /** Voice id — interpretation is provider-specific (see {@link TtsVoice}). */
  voice: string;
  /** Audio container format. Provider may downgrade to its native. */
  format?: 'mp3' | 'wav' | 'pcm';
  /** Sample rate in Hz (e.g. 24000). Provider may clamp. */
  sampleRate?: number;
  /** Speed multiplier; 1.0 is provider-native rate. */
  speed?: number;
  /** ISO language hint (e.g. `'en-US'`). */
  language?: string;
  /** Treat `text` as SSML. Requires `TtsCapabilities.ssml: true`. */
  ssml?: boolean;
  /** Pass-through provider-specific options. */
  providerOptions?: Record<string, unknown>;
  /** Abort the synthesis early — useful for cancellation. */
  abortSignal?: AbortSignal;
  /**
   * docent-side hint about the trailing-silence trim ceiling. Used by the
   * kokoro provider for its per-beat silence trim. Other providers may
   * ignore it.
   */
  pace?: 'hold' | 'settle' | 'normal' | 'brisk';
}

/**
 * A single word's timing within a synthesized clip — what `passage`
 * scenes use to reveal text in lock-step with the voice.
 */
export interface WordAlignment {
  /** The word as it appears in the input text. */
  text: string;
  /** Start time of the word in ms relative to clip start. */
  startMs: number;
  /** End time of the word in ms relative to clip start. */
  endMs: number;
}

/**
 * Frame-based word timing — the render-side IR consumed by karaoke-style
 * components. Produced from {@link WordAlignment} at TTS-persistence time
 * by quantising ms → frames against the film's `fps`. Persisted on the
 * per-beat manifest so the render side never recomputes (R5).
 *
 * The shape mirrors `/ventures/250/shorts/src/types.ts`'s `WordTiming` (the
 * source pattern for this IR) minus the redundant `*Seconds` fields — the
 * render side only ever reads frames.
 */
export interface WordTiming {
  /** The word as it appears in the source narration. */
  readonly text: string;
  /** Inclusive start frame (0 == clip start). */
  readonly startFrame: number;
  /** Exclusive end frame. */
  readonly endFrame: number;
}

/**
 * The result of a single {@link TtsProvider.synth} call.
 */
export interface TtsSynthesisResult {
  /** Synthesized audio bytes in the requested format. */
  audio: Uint8Array;
  /** MIME type for the bytes (e.g. `'audio/wav'`). */
  mediaType: string;
  /** Total clip duration in ms (post-trim). */
  durationMs: number;
  /** Per-word timing; empty when neither provider nor aligner produced one. */
  alignment: WordAlignment[];
  /** Origin of the alignment data — provider native vs. external aligner. */
  alignmentSource: 'native' | 'aligner' | 'none';
  /**
   * R5: word-level timing IR. The canonical opt-in field every consumer
   * downstream of TTS reads — karaoke-style passage reveal, music
   * choreography (R8), the prospective captions feature. Empty or
   * undefined means "this provider can't supply word timings"; the
   * feature gracefully degrades. Providers SHOULD populate this whenever
   * they also populate {@link TtsSynthesisResult.alignment} — `words`
   * is the public R5 name; `alignment` is the legacy slot kept for
   * compatibility (both carry the same data shape today).
   */
  words?: ReadonlyArray<WordAlignment>;
  /** Provider-native blob — echoes Rig's `Response: T`. */
  raw?: unknown;
  /**
   * Per-beat rhythm telemetry — the move from `pipeline/tts.py`'s manifest.
   * Only the kokoro provider fills it today.
   */
  metrics?: TtsBeatMetrics;
}

/**
 * Per-beat rhythm telemetry — the kokoro provider populates this; others
 * may ignore it. Surfaced in the {@link RenderResult.tts} bundle.
 */
export interface TtsBeatMetrics {
  /** Final clip duration in seconds (post-trim). */
  clipSeconds: number;
  /** Word count of the source text. */
  wordCount: number;
  /** Measured words per minute (null when unmeasurable). */
  wpm: number | null;
  /** Leading silence in ms after trim. */
  leadingSilenceMs: number | null;
  /** Trailing silence in ms after trim. */
  trailingSilenceMs: number | null;
  /** Leading silence before any trim (debug/diagnostic). */
  leadingSilencePreTrimMs?: number;
  /** Trailing silence before any trim (debug/diagnostic). */
  trailingSilencePreTrimMs?: number;
  /** The pace hint passed in (echoed for analytics). */
  pace?: 'hold' | 'settle' | 'normal' | 'brisk' | null;
  /** Whether trim actually fired. */
  trimmed?: boolean;
}

/**
 * Provider-reported voice metadata. Returned by {@link TtsProvider.listVoices}.
 */
export interface TtsVoice {
  /** The voice id passed to {@link TtsSynthesisOptions.voice}. */
  id: string;
  /** Human-readable voice name. */
  name: string;
  /** ISO language tag. */
  language: string;
  /** Optional gender label (provider-specific values). */
  gender?: string;
  /** Free-form provider-specific metadata. */
  metadata?: Record<string, unknown>;
}

/* ───────── the instance (runtime) ───────── */

/**
 * A runtime TTS provider instance — what {@link TtsProviderPlugin.create}
 * returns. The kit's cascade calls `synth()` on this for each beat.
 *
 * **Distinction**: {@link TtsProviderPlugin} is the registry-time
 * descriptor (metadata + factory). `TtsProvider` is the runtime instance
 * (actual `synth`/`listVoices` methods). The split mirrors Build A.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.4
 */
export interface TtsProvider {
  /** The provider id (matches `TtsProviderPlugin.providerId`). */
  readonly id: string;
  /** Echoes the plugin's capabilities for runtime introspection. */
  readonly capabilities: TtsCapabilities;
  /**
   * Synthesize one beat's narration to audio bytes. The cascade calls
   * this once per beat.
   */
  synth(
    text: string,
    options: TtsSynthesisOptions,
  ): Promise<TtsSynthesisResult>;
  /** List available voices for this provider. */
  listVoices(): Promise<TtsVoice[]>;
  /** Optional teardown hook — called once at the end of the cascade. */
  dispose?(): Promise<void>;
}

/* ───────── error ───────── */

/**
 * The sentinel error the engine, the CLI, and the cascade all treat as the
 * "credentials missing / dep missing / config invalid" signal. A TTS
 * provider's `create()` SHOULD throw this (not a plain `Error`) so the CLI
 * can produce a guided "set your API key" surface instead of a stack trace.
 *
 * @example
 * ```ts
 * if (!ctx.env.OPENAI_API_KEY) {
 *   throw new TtsProviderError('openai', 'OPENAI_API_KEY is not set');
 * }
 * ```
 *
 * @see docs/design/plugin-architecture-strategy.md §4.4
 */
export class TtsProviderError extends Error {
  /** The provider id the error pertains to. */
  readonly providerId: string;
  constructor(providerId: string, message: string) {
    super(`[${providerId}] ${message}`);
    this.providerId = providerId;
    this.name = 'TtsProviderError';
  }
}
