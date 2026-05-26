// TTS stage — synthesizes narration for every beat in the film via the
// engine's TTS registry. The kit-side companion to `packages/engine/cli/tts-stage.ts`.
//
// What this stage does (mirroring the legacy engine cascade):
//
//   1. Reads `spec.meta.tts.provider` (or falls back to the well-known
//      `'kokoro'` providerId).
//   2. Resolves the plugin via `engine.tts.get(providerId)`. Throws a
//      `TtsProviderError` with a precise message if no provider is registered.
//   3. Constructs the provider via `plugin.create(ctx)` — credentials/config
//      are checked NOW so a missing key fails BEFORE the render burns
//      minutes.
//   4. For each beat in `spec.scenes[].beats`: calls `provider.synth(text)`
//      and records per-beat metrics (clipSeconds, wpm, alignment source).
//   5. Returns a manifest in memory. Persisting it to disk is the caller's
//      responsibility — the kit stays renderer-agnostic and filesystem-light.
//
// Per-beat silence trim (the legacy `pipeline/tts.py` behaviour) lives in
// the kokoro provider's `synth()` itself; other providers ship un-trimmed
// audio. The kit makes no decisions about audio shape.
//
// **Caching is intentionally NOT done here.** The legacy engine cascade
// caches based on text+provider+voice signatures and writes to a per-film
// manifest; that's a CLI-layer concern. The kit's cascade re-synthesizes
// every beat. A future feature plugin (or the CLI itself) layers caching
// on top by inspecting the spec and short-circuiting beats that already
// have a fresh audio file.

import type {Engine} from '../engine';
import type {FilmSpec, Beat, Scene} from '../types/spec';
import type {
  TtsProvider,
  TtsProviderContext,
  TtsSynthesisOptions,
  TtsSynthesisResult,
  TtsBeatMetrics,
} from '../types/tts';
import {TtsProviderError} from '../types/tts';

/** Options accepted by `runTtsStage`. */
export interface TtsStageOptions {
  /** Cache dir handed to the provider's `create` context. */
  cacheDir?: string;
  /** Override the env passed to the provider (defaults to `process.env`). */
  env?: Readonly<Record<string, string | undefined>>;
}

/** Per-beat result row returned in the manifest. */
export interface TtsBeatResult {
  /** Scene index in `spec.scenes`. */
  readonly sceneIndex: number;
  /** Beat index inside the scene. */
  readonly beatIndex: number;
  /** The beat's id, if it carries one. */
  readonly beatId?: string;
  /** The (lossy) clip length in seconds. */
  readonly clipSeconds: number;
  /** Words-per-minute, when the provider supplied a metric. */
  readonly wpm: number | null;
  /** Provider-reported media type (e.g. `audio/wav`, `audio/mpeg`). */
  readonly mediaType: string;
  /** Where the alignment came from. */
  readonly alignmentSource: 'native' | 'aligner' | 'none';
  /** The raw provider result — opaque, surfaced so a caller can persist it. */
  readonly synth: TtsSynthesisResult;
}

/** The manifest the stage returns. */
export interface TtsStageManifest {
  readonly providerId: string;
  readonly voice: string;
  readonly totalSeconds: number;
  readonly beats: ReadonlyArray<TtsBeatResult>;
}

/**
 * Run the TTS stage over a film spec. Returns the manifest; throws a
 * `TtsProviderError` if the provider is missing or fails to initialize, and
 * a plain `Error` if a per-beat synth call fails.
 */
export const runTtsStage = async (
  spec: FilmSpec,
  engine: Engine,
  opts: TtsStageOptions = {},
): Promise<TtsStageManifest> => {
  // Provider precedence — `meta.tts.provider` > legacy top-level `tts.provider`
  // > the well-known 'kokoro' fallback. Matches the legacy engine cascade.
  const metaTts = spec.meta?.tts ?? {};
  const legacyTts = spec.tts ?? {};
  const providerId: string = metaTts.provider ?? legacyTts.provider ?? 'kokoro';

  // Voice precedence — meta.tts.voice (if set in provider options) >
  // meta.voice > 'af_heart' (the kokoro default). Provider plugins that
  // need a different default expose it on their TtsCapabilities.
  const voice: string =
    (metaTts.providerOptions?.voice as string | undefined) ??
    spec.meta?.voice ??
    'af_heart';

  const model: string | undefined = metaTts.model ?? legacyTts.model;
  const providerOptions: Record<string, unknown> | undefined =
    metaTts.providerOptions ?? legacyTts.providerOptions;

  const plugin = engine.tts.get(providerId);
  if (!plugin) {
    const known = engine.tts
      .all()
      .map((p) => p.providerId)
      .sort()
      .join(', ');
    throw new TtsProviderError(
      providerId,
      `no TTS provider registered with id "${providerId}" — known: ${known || '(none)'}`,
    );
  }

  // We type `process` defensively — `@docent/kit` does NOT depend on
  // `@types/node`, so we read `process.env` through `globalThis` and fall
  // back to an empty object in non-Node environments (browser, Deno
  // without node-compat, etc.).
  const env: Readonly<Record<string, string | undefined>> =
    opts.env ??
    ((globalThis as {process?: {env?: Record<string, string | undefined>}}).process
      ?.env ??
      {});

  // Build the context defensively under `exactOptionalPropertyTypes`: an
  // optional field must be OMITTED (not set to undefined). The
  // TtsProviderContext interface is readonly, so we compose with spreads.
  const ctx: TtsProviderContext = {
    env,
    cacheDir: opts.cacheDir ?? '',
    ...(model !== undefined ? {model} : {}),
    ...(providerOptions !== undefined ? {providerOptions} : {}),
  };

  let provider: TtsProvider;
  try {
    provider = await plugin.create(ctx);
  } catch (e) {
    if (e instanceof TtsProviderError) throw e;
    throw new TtsProviderError(
      providerId,
      `failed to initialize — ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const beats: TtsBeatResult[] = [];
  let totalSeconds = 0;

  try {
    const scenes: Scene[] = spec.scenes ?? [];
    for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
      const scene = scenes[sceneIndex];
      if (!scene || !Array.isArray(scene.beats)) continue;
      const sceneBeats = scene.beats as Beat[];
      for (let beatIndex = 0; beatIndex < sceneBeats.length; beatIndex++) {
        const beat = sceneBeats[beatIndex];
        if (!beat) continue;
        const text = beat.narration ?? '';
        if (text.length === 0) continue;

        const synthOpts: TtsSynthesisOptions = {voice};
        if (beat.pace !== undefined) synthOpts.pace = beat.pace;
        let result: TtsSynthesisResult;
        try {
          result = await provider.synth(text, synthOpts);
        } catch (e) {
          throw new Error(
            `tts stage: synth failed for scene ${sceneIndex}, beat ${beatIndex} (${beat.id ?? '<no-id>'}) — ${e instanceof Error ? e.message : String(e)}`,
          );
        }

        const m: TtsBeatMetrics | undefined = result.metrics;
        const clipSeconds =
          m?.clipSeconds ?? (result.durationMs > 0 ? result.durationMs / 1000 : 0);
        const wpm = m?.wpm ?? null;

        const row: TtsBeatResult = {
          sceneIndex,
          beatIndex,
          clipSeconds: Number(clipSeconds.toFixed(3)),
          wpm,
          mediaType: result.mediaType,
          alignmentSource: result.alignmentSource,
          synth: result,
          ...(beat.id !== undefined ? {beatId: beat.id} : {}),
        };
        beats.push(row);
        totalSeconds += clipSeconds;
      }
    }
  } finally {
    // Dispose the provider — free ONNX runtimes, WebSocket handles, etc.
    if (provider.dispose) {
      try {
        await provider.dispose();
      } catch {
        // tolerable — the run itself already succeeded or failed.
      }
    }
  }

  return {
    providerId,
    voice,
    totalSeconds: Number(totalSeconds.toFixed(3)),
    beats,
  };
};
