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
//   5. If `publicDir` + `filmId` are supplied: writes each beat's audio bytes
//      to `<publicDir>/audio/<filmId>/beat-<sceneIndex>-<beatIndex>.<ext>`
//      and a per-film manifest at `<publicDir>/audio/<filmId>/manifest.json`
//      mapping `<sceneIndex>-<beatIndex>` → `{file, seconds, beatId?}`. The
//      narration feature reads this manifest via Remotion's `staticFile()`
//      so per-beat `<Audio>` overlays attach during render.
//   6. Returns the manifest in memory regardless of persistence.
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

import {mkdirSync, writeFileSync, renameSync} from 'node:fs';
import {join} from 'node:path';

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
  /**
   * Absolute path of the project's Remotion `public/` directory. When set
   * together with `filmId`, the stage persists per-beat audio bytes under
   * `<publicDir>/audio/<filmId>/` and writes a per-film manifest there. When
   * omitted the stage runs in memory only (callers can persist
   * `manifest.beats[].synth.audio` themselves).
   */
  publicDir?: string;
  /** Required for persistence — the film id used to scope the audio dir. */
  filmId?: string;
}

/** Map a media type to a filesystem extension. */
const fileExtensionForMediaType = (mediaType: string): string => {
  if (mediaType === 'audio/mpeg') return 'mp3';
  if (mediaType === 'audio/wav') return 'wav';
  if (mediaType === 'audio/pcm') return 'pcm';
  const m = mediaType.match(/audio\/(\w+)/);
  return m ? m[1]! : 'bin';
};

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
  /**
   * Public-folder-relative path to the persisted audio file (e.g.
   * `audio/<filmId>/beat-0-1.wav`). Present only when the stage was given a
   * `publicDir` + `filmId` and successfully wrote bytes; consumed by the
   * narration feature via Remotion's `staticFile()`.
   */
  readonly file?: string;
}

/** The manifest the stage returns. */
export interface TtsStageManifest {
  readonly providerId: string;
  readonly voice: string;
  readonly totalSeconds: number;
  readonly beats: ReadonlyArray<TtsBeatResult>;
  /**
   * Absolute filesystem path to the persisted per-film manifest. Set only
   * when the stage persisted bytes (i.e. caller supplied `publicDir` +
   * `filmId`).
   */
  readonly manifestPath?: string;
}

/**
 * On-disk shape of the per-film manifest the tts stage writes. The render
 * entry reads this (statically, via the CLI generator) so the narration
 * feature can attach a per-beat `<Audio>` overlay in the composition.
 *
 * Indexed by `<sceneIndex>-<beatIndex>` so a beat's slot is always
 * recoverable from the schedule, even when `Beat.id` is absent.
 */
export interface TtsPersistedManifest {
  readonly filmId: string;
  readonly providerId: string;
  readonly voice: string;
  readonly totalSeconds: number;
  readonly beats: Readonly<Record<string, TtsPersistedBeat>>;
}

export interface TtsPersistedBeat {
  readonly sceneIndex: number;
  readonly beatIndex: number;
  readonly beatId?: string;
  /** Public-folder-relative path (`audio/<filmId>/beat-N-M.wav`). */
  readonly file: string;
  readonly seconds: number;
  readonly mediaType: string;
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

  // Persistence target — when both supplied, the stage writes per-beat
  // audio bytes + a per-film manifest. Done outside the loop so a single
  // mkdirSync is enough; per-beat writes only flush bytes.
  const persistEnabled = !!(opts.publicDir && opts.filmId);
  const filmId = opts.filmId ?? '';
  const audioDirRel = `audio/${filmId}`;
  const audioDirAbs = persistEnabled
    ? join(opts.publicDir!, 'audio', filmId)
    : '';
  if (persistEnabled) {
    mkdirSync(audioDirAbs, {recursive: true});
  }

  const beats: TtsBeatResult[] = [];
  let totalSeconds = 0;
  const persisted: Record<string, TtsPersistedBeat> = {};

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

        // Persist the bytes if we have a destination. Filename uses
        // sceneIndex/beatIndex so it's stable even when `Beat.id` is absent.
        let fileRel: string | undefined;
        if (persistEnabled) {
          const ext = fileExtensionForMediaType(result.mediaType);
          const fname = `beat-${sceneIndex}-${beatIndex}.${ext}`;
          const fullPath = join(audioDirAbs, fname);
          writeFileSync(fullPath, result.audio);
          fileRel = `${audioDirRel}/${fname}`;
          const persistedRow: TtsPersistedBeat = {
            sceneIndex,
            beatIndex,
            file: fileRel,
            seconds: Number(clipSeconds.toFixed(3)),
            mediaType: result.mediaType,
            ...(beat.id !== undefined ? {beatId: beat.id} : {}),
          };
          persisted[`${sceneIndex}-${beatIndex}`] = persistedRow;
        }

        const row: TtsBeatResult = {
          sceneIndex,
          beatIndex,
          clipSeconds: Number(clipSeconds.toFixed(3)),
          wpm,
          mediaType: result.mediaType,
          alignmentSource: result.alignmentSource,
          synth: result,
          ...(beat.id !== undefined ? {beatId: beat.id} : {}),
          ...(fileRel !== undefined ? {file: fileRel} : {}),
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

  // Write the per-film manifest (atomic via tmp + rename) so a partially-
  // written file is never observed by the render entry.
  let manifestPath: string | undefined;
  if (persistEnabled) {
    const manifestOut: TtsPersistedManifest = {
      filmId,
      providerId,
      voice,
      totalSeconds: Number(totalSeconds.toFixed(3)),
      beats: persisted,
    };
    manifestPath = join(audioDirAbs, 'manifest.json');
    const tmp = `${manifestPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(manifestOut, null, 2) + '\n');
    renameSync(tmp, manifestPath);
  }

  return {
    providerId,
    voice,
    totalSeconds: Number(totalSeconds.toFixed(3)),
    beats,
    ...(manifestPath !== undefined ? {manifestPath} : {}),
  };
};
