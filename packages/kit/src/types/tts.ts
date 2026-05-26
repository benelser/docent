// TTS protocol — recapitulated from Build A's `packages/engine/src/tts/types.ts`.
//
// The kit OWNS the canonical shape of the TTS contract. `@docent/core` and
// every `@docent/tts-*` package implement against this. The current
// `packages/engine/src/tts/types.ts` is the source of truth that this file
// mirrors; once the engine is ripped out and replaced with `@docent/core`,
// those types move to live HERE — but the values do not change.
//
// **The kit's TtsProviderPlugin is the canonical one.** This file's
// definition adds the `kind: 'tts'` discriminator + `name: string` field
// (the PluginBase requirement) so `engine.use(plugin)` can route. Otherwise
// it is identical, byte for byte, to Build A's contract.

import type {PluginBase} from '../protocols';

/* ───────── capability matrix (Rig-shaped) ───────── */

/**
 * The capability matrix. Identical to Build A's `TtsCapabilities`. The
 * engine reads this at:
 *   - spec-resolution time (a `passage` scene requiring `nativeAlignment:
 *     'word'` fails on a provider whose value is `'none'` — warn by default,
 *     hard-fail when `meta.tts.strict: true`).
 *   - runtime (`synth(text, {ssml: true})` against a provider with
 *     `ssml: false` is rejected before the network call).
 */
export interface TtsCapabilities {
  readonly nativeAlignment: 'word' | 'character' | 'chunk' | 'none';
  readonly streaming: boolean;
  readonly ssml: boolean;
  readonly voiceCloning: boolean;
  readonly local: boolean;
}

/* ───────── construction context ───────── */

export interface TtsProviderContext {
  readonly model?: string;
  readonly providerOptions?: Record<string, unknown>;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cacheDir: string;
}

/* ───────── the plugin (registry-time) ───────── */

/**
 * The TtsProviderPlugin. Extends the kit's `PluginBase` with the
 * `kind: 'tts'` discriminator + the TTS-specific surface from Build A.
 *
 * **The shape every `@docent/tts-*` package exports.** A future migration
 * of Build A's existing four providers (kokoro, openai, elevenlabs,
 * openai-compatible) into the new package layout is mechanical — add
 * `kind: 'tts'` + `name`, leave everything else untouched.
 */
export interface TtsProviderPlugin extends PluginBase {
  readonly kind: 'tts';
  /**
   * Stable provider id used in film specs:
   * `"kokoro" | "openai" | "elevenlabs" | "openai-compatible" | …`.
   */
  readonly providerId: string;
  /** Type-level capability declaration. */
  readonly capabilities: TtsCapabilities;
  /**
   * Construct an instance from the active environment + spec config.
   *
   * MUST throw if credentials/config are insufficient (env var missing,
   * voice unknown, etc.) BEFORE the cascade burns minutes on a render.
   */
  create(ctx: TtsProviderContext): Promise<TtsProvider>;
}

/* ───────── runtime options + result ───────── */

export interface TtsSynthesisOptions {
  voice: string;
  format?: 'mp3' | 'wav' | 'pcm';
  sampleRate?: number;
  speed?: number;
  language?: string;
  ssml?: boolean;
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  /**
   * docent-side hint about the trailing-silence trim ceiling. Used by the
   * kokoro provider for its per-beat silence trim. Other providers may
   * ignore it.
   */
  pace?: 'hold' | 'settle' | 'normal' | 'brisk';
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
  /** Empty array when neither provider nor aligner produced one. */
  alignment: WordAlignment[];
  alignmentSource: 'native' | 'aligner' | 'none';
  /** Provider-native blob — echoes Rig's `Response: T`. */
  raw?: unknown;
  /**
   * Per-beat rhythm telemetry — the move from `pipeline/tts.py`'s manifest.
   * Only the kokoro provider fills it today.
   */
  metrics?: TtsBeatMetrics;
}

export interface TtsBeatMetrics {
  clipSeconds: number;
  wordCount: number;
  wpm: number | null;
  leadingSilenceMs: number | null;
  trailingSilenceMs: number | null;
  leadingSilencePreTrimMs?: number;
  trailingSilencePreTrimMs?: number;
  pace?: 'hold' | 'settle' | 'normal' | 'brisk' | null;
  trimmed?: boolean;
}

export interface TtsVoice {
  id: string;
  name: string;
  language: string;
  gender?: string;
  metadata?: Record<string, unknown>;
}

/* ───────── the instance (runtime) ───────── */

export interface TtsProvider {
  readonly id: string;
  readonly capabilities: TtsCapabilities;
  synth(
    text: string,
    options: TtsSynthesisOptions,
  ): Promise<TtsSynthesisResult>;
  listVoices(): Promise<TtsVoice[]>;
  dispose?(): Promise<void>;
}

/* ───────── error ───────── */

/**
 * The sentinel error the engine, the CLI, and the cascade all treat as the
 * "credentials missing / dep missing / config invalid" signal.
 */
export class TtsProviderError extends Error {
  readonly providerId: string;
  constructor(providerId: string, message: string) {
    super(`[${providerId}] ${message}`);
    this.providerId = providerId;
    this.name = 'TtsProviderError';
  }
}
