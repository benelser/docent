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
// **Content-hash caching (R1).** Each beat's audio is keyed by
// `SHA256(text | voice | model | stableJsonStringify(providerOptions))`
// and the per-film manifest records that hash next to the persisted
// `file`. On the next run, if the slot's recorded `contentHash` matches
// the freshly-computed `wantHash` AND the file still exists on disk, the
// stage SKIPS the API call and reuses the persisted bytes verbatim. This
// is opt-out only — pass `opts.useCache = false` (CLI: `--no-tts-cache`)
// to force a full re-synth.

import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync, renameSync} from 'node:fs';
import {join} from 'node:path';

import type {Engine} from '../engine';
import type {FilmSpec, Beat, Scene} from '../types/spec';
import type {
  TtsProvider,
  TtsProviderContext,
  TtsSynthesisOptions,
  TtsSynthesisResult,
  TtsBeatMetrics,
  WordAlignment,
  WordTiming,
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
  /**
   * Voice id override. When set, this voice is passed to the provider
   * instead of resolving from `meta.tts.providerOptions.voice` or
   * `meta.voice`. The CLI uses this together with `--voice` so a
   * translated film can pick a voice that speaks the target language.
   */
  voice?: string;
  /**
   * Content-hash cache (R1). When `true` (default), the stage looks up
   * each beat in the existing per-film manifest by `<sceneIndex>-<beatIndex>`
   * and reuses the persisted audio bytes if its `contentHash` matches a
   * freshly-computed SHA256 over (text | voice | model | providerOptions)
   * AND the file still exists on disk. Set to `false` to force every beat
   * to re-synth (the CLI's `--no-tts-cache` flag wires this).
   *
   * Caching only applies when persistence is enabled (`publicDir` +
   * `filmId` are supplied); without a manifest there's nothing to hit.
   */
  useCache?: boolean;
}

/** Deterministic JSON.stringify — sort object keys recursively so two
 * equivalent objects with reordered keys hash identically. Arrays preserve
 * order (their order is meaningful). `undefined` values are dropped (they
 * disappear from JSON anyway). */
const stableJsonStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableJsonStringify(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    parts.push(JSON.stringify(k) + ':' + stableJsonStringify(v));
  }
  return '{' + parts.join(',') + '}';
};

/** Compute the content hash for a beat — the cache key. */
const computeBeatHash = (
  text: string,
  voice: string,
  model: string | undefined,
  providerOptions: Record<string, unknown> | undefined,
): string => {
  const h = createHash('sha256');
  h.update(text);
  h.update('|');
  h.update(voice);
  h.update('|');
  h.update(model ?? '');
  h.update('|');
  h.update(stableJsonStringify(providerOptions ?? {}));
  return h.digest('hex');
};

/** Best-effort duration sniff for a `audio/wav` blob — the legacy kokoro
 * provider ships WAVs without populating `durationMs` in some code paths.
 * Returns `null` when the file isn't a recognizable RIFF/WAVE header. */
const sniffWavSeconds = (bytes: Uint8Array): number | null => {
  if (bytes.length < 44) return null;
  // 'RIFF' at offset 0, 'WAVE' at offset 8
  if (
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46
  )
    return null;
  if (
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x41 ||
    bytes[10] !== 0x56 ||
    bytes[11] !== 0x45
  )
    return null;
  // fmt chunk usually at offset 12. Read sampleRate at offset 24, byteRate at 28.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const byteRate = view.getUint32(28, true);
  const dataStart = bytes.length >= 44 ? 44 : null;
  if (byteRate === 0 || dataStart === null) return null;
  const dataBytes = bytes.length - dataStart;
  return dataBytes / byteRate;
};

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
  /**
   * `true` when this beat was served from the content-hash cache — the
   * persisted audio file was reused and `provider.synth()` was NOT called.
   * `false` when the beat was synthesized in this run.
   */
  readonly cached: boolean;
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
 *
 * R1: each beat carries a `contentHash` and the per-film `provider`
 * descriptor used as the cache key. The next run re-derives the same SHA
 * over (text + voice + model + providerOptions) and short-circuits the
 * API call when it matches.
 */
export interface TtsPersistedManifest {
  readonly filmId: string;
  readonly providerId: string;
  readonly voice: string;
  readonly totalSeconds: number;
  readonly beats: Readonly<Record<string, TtsPersistedBeat>>;
  /**
   * Provider descriptor — surfaced at the manifest level so a future
   * build can recover the exact same hash input. Per-beat `contentHash`
   * is the authoritative cache key; this is here for debuggability.
   */
  readonly provider?: TtsManifestProvider;
  /**
   * Manifest shape version. Bumped when an incompatible field is added
   * or moved. R5 introduces `version: 2` to carry per-beat frame-quantised
   * `words[]`. A manifest without `version` (or with `version < 2`) is
   * treated as legacy by the render-side hook — it MAY be reused for
   * audio playback but its absence of word timings forces karaoke
   * consumers to fall through to their static path.
   */
  readonly version?: number;
  /**
   * Frame rate the per-beat `words[].startFrame/endFrame` are expressed
   * in. Recorded so a future render at a different fps can detect the
   * mismatch and re-quantise from ms (when surfaced by the provider).
   */
  readonly fps?: number;
}

/** Current manifest version. Bumped on incompatible additions. */
export const TTS_MANIFEST_VERSION = 2;

/**
 * Provider descriptor recorded on the manifest. Mirrors the inputs to
 * the SHA256 cache key so a stale manifest is recognizable on inspection.
 */
export interface TtsManifestProvider {
  readonly id: string;
  readonly model?: string;
  readonly voiceSettings?: Record<string, unknown>;
}

export interface TtsPersistedBeat {
  readonly sceneIndex: number;
  readonly beatIndex: number;
  readonly beatId?: string;
  /** Public-folder-relative path (`audio/<filmId>/beat-N-M.wav`). */
  readonly file: string;
  readonly seconds: number;
  readonly mediaType: string;
  /**
   * SHA256 hex of `text | voice | model | stableJsonStringify(providerOptions)`.
   * Optional for legacy manifests written before R1 — the cache treats a
   * missing hash as a miss and re-synthesizes.
   */
  readonly contentHash?: string;
  /**
   * R5: frame-quantised word timings. Persisted at TTS time so the render
   * side never has to recompute ms → frames. Absent when the provider
   * supplied no word-level alignment — downstream karaoke consumers fall
   * through to their static path. The frames are clip-relative (0 == clip
   * start), at the film's render fps recorded on the manifest.
   */
  readonly words?: ReadonlyArray<WordTiming>;
}

/**
 * Convert a provider's ms-based word alignment into the frame-quantised
 * shape persisted on the manifest. Pure — exposed for tests + the render-
 * side migration path.
 */
export const wordsToFrames = (
  words: ReadonlyArray<WordAlignment>,
  fps: number,
): WordTiming[] => {
  if (!fps || fps <= 0) return [];
  const out: WordTiming[] = [];
  for (const w of words) {
    if (!w || typeof w.text !== 'string' || w.text.length === 0) continue;
    const startFrame = Math.max(0, Math.round((w.startMs / 1000) * fps));
    const endFrame = Math.max(
      startFrame + 1,
      Math.round((w.endMs / 1000) * fps),
    );
    out.push({text: w.text, startFrame, endFrame});
  }
  return out;
};

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

  // Voice precedence — opts.voice (CLI / cascade override) >
  // meta.tts.providerOptions.voice > meta.voice > 'af_heart' (the kokoro
  // default). The override slot lets a `--voice` flag survive past
  // schedule-resolution time. Provider plugins that need a different
  // default expose it on their TtsCapabilities.
  const voice: string =
    opts.voice ??
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

  // We type `process` defensively — `@bjelser/kit` does NOT depend on
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

  // R5: resolve the film's fps so we can quantise provider-reported ms-based
  // word alignments into frame-based `WordTiming`s at persistence time.
  // Render-side consumers (karaoke-text, R8 music choreography) read frames
  // only — never ms — so the conversion lives at the boundary.
  const metaAny = spec.meta as unknown as {
    fps?: number;
    resolution?: {fps?: number};
  };
  const fps =
    metaAny.resolution?.fps ?? metaAny.fps ?? 30;

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

  // R1: content-hash cache. Caching is opt-out — default ON. Only loads a
  // prior manifest when persistence is on (no manifest = no cache hits).
  const useCache = opts.useCache !== false;
  const cacheManifestPath = persistEnabled ? join(audioDirAbs, 'manifest.json') : '';
  let priorManifest: TtsPersistedManifest | undefined;
  if (useCache && persistEnabled && existsSync(cacheManifestPath)) {
    try {
      const raw = readFileSync(cacheManifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<TtsPersistedManifest>;
      if (parsed && typeof parsed === 'object' && parsed.beats && typeof parsed.beats === 'object') {
        priorManifest = parsed as TtsPersistedManifest;
      }
    } catch {
      // Corrupt or unreadable manifest — treat as no cache.
    }
  }

  const beats: TtsBeatResult[] = [];
  let totalSeconds = 0;
  const persisted: Record<string, TtsPersistedBeat> = {};
  let synthCount = 0;
  let cachedCount = 0;

  try {
    const scenes: Scene[] = spec.scenes ?? [];
    for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
      const scene = scenes[sceneIndex];
      if (!scene) continue;

      // Defensive DevEx — a common new-user mistake is putting narration at
      // the scene level instead of in beats[]. The cascade silently ignores
      // it and the render falls back to default frame count (a 2-second
      // silent film). Surface a clear warning, then auto-promote: synthesize
      // a single synthetic beat from the scene-level narration so the user's
      // intent still produces an audible film while they learn the shape.
      if (!Array.isArray(scene.beats)) {
        const sceneNarration = (scene as {narration?: unknown}).narration;
        if (typeof sceneNarration === 'string' && sceneNarration.trim().length > 0) {
          process.stderr.write(
            `[tts] scene[${sceneIndex}] (type=${scene.type}) has scene-level \`narration\` ` +
              `but no beats[]. The cascade only reads narration from \`beats[].narration\`. ` +
              `Promoting your scene-level narration to a synthetic beat — but you should ` +
              `lift it into \`beats: [{narration: "..."}]\` to control timing properly.\n`,
          );
          scene.beats = [{narration: sceneNarration} as Beat];
        } else {
          continue;
        }
      }
      const sceneBeats = scene.beats as Beat[];
      for (let beatIndex = 0; beatIndex < sceneBeats.length; beatIndex++) {
        const beat = sceneBeats[beatIndex];
        if (!beat) continue;
        const text = beat.narration ?? '';
        if (text.length === 0) continue;

        const slot = `${sceneIndex}-${beatIndex}`;

        // ─── R1 cache lookup ─────────────────────────────────────────────
        // Compute the hash now so we can compare against the manifest. Only
        // a hit when (1) caching is on, (2) prior manifest exists, (3) slot
        // has the same hash, AND (4) the persisted audio file is still on
        // disk. Any miss falls through to synth.
        const wantHash = computeBeatHash(text, voice, model, providerOptions);
        if (useCache && persistEnabled && priorManifest) {
          const priorBeat = priorManifest.beats[slot];
          if (
            priorBeat &&
            priorBeat.contentHash === wantHash &&
            priorBeat.file
          ) {
            const persistedAbs = join(opts.publicDir!, priorBeat.file);
            if (existsSync(persistedAbs)) {
              // Cache hit — read bytes from disk and skip the API call.
              const bytes = readFileSync(persistedAbs);
              // Reconstruct a minimal TtsSynthesisResult shape so the rest
              // of the cascade (afterRender hooks, RenderResult.tts) sees
              // the same fields it would on a fresh synth.
              const cachedSeconds = priorBeat.seconds;
              const cachedResult: TtsSynthesisResult = {
                audio: new Uint8Array(
                  bytes.buffer,
                  bytes.byteOffset,
                  bytes.byteLength,
                ),
                mediaType: priorBeat.mediaType,
                durationMs: Math.round(cachedSeconds * 1000),
                alignment: [],
                alignmentSource: 'none',
              };
              const fileRel = priorBeat.file;
              // R5: preserve persisted word timings on the cache-hit path.
              // The audio bytes are byte-identical (same content hash) so
              // the prior frame-quantised words are still correct.
              const priorWords = priorBeat.words;
              const persistedRow: TtsPersistedBeat = {
                sceneIndex,
                beatIndex,
                file: fileRel,
                seconds: cachedSeconds,
                mediaType: priorBeat.mediaType,
                contentHash: wantHash,
                ...(beat.id !== undefined ? {beatId: beat.id} : {}),
                ...(priorWords && priorWords.length > 0
                  ? {words: priorWords}
                  : {}),
              };
              persisted[slot] = persistedRow;
              const row: TtsBeatResult = {
                sceneIndex,
                beatIndex,
                clipSeconds: cachedSeconds,
                wpm: null,
                mediaType: priorBeat.mediaType,
                alignmentSource: 'none',
                synth: cachedResult,
                cached: true,
                ...(beat.id !== undefined ? {beatId: beat.id} : {}),
                file: fileRel,
              };
              beats.push(row);
              totalSeconds += cachedSeconds;
              cachedCount++;
              continue;
            }
          }
        }
        // ─── end cache lookup ────────────────────────────────────────────

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
        synthCount++;

        const m: TtsBeatMetrics | undefined = result.metrics;
        let clipSeconds =
          m?.clipSeconds ?? (result.durationMs > 0 ? result.durationMs / 1000 : 0);
        // Defensive fallback — if the provider returned no metric AND no
        // durationMs but the bytes are a WAV, sniff the header so the
        // persisted cache row carries a meaningful seconds value (which
        // the next-run cache-hit path then reuses verbatim).
        if (clipSeconds === 0 && result.mediaType === 'audio/wav') {
          const sniffed = sniffWavSeconds(result.audio);
          if (sniffed !== null) clipSeconds = sniffed;
        }
        const wpm = m?.wpm ?? null;

        // R5: quantise the provider's ms-based word timing into frames.
        // Prefer the canonical `words` slot, fall back to the legacy
        // `alignment` slot (mirrored shape). Quantising at persist-time
        // means render-side consumers never have to know about ms.
        const providerWords: ReadonlyArray<WordAlignment> | undefined =
          result.words && result.words.length > 0
            ? result.words
            : result.alignment.length > 0
              ? result.alignment
              : undefined;
        const wordTimings: WordTiming[] = providerWords
          ? wordsToFrames(providerWords, fps)
          : [];

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
            contentHash: wantHash,
            ...(beat.id !== undefined ? {beatId: beat.id} : {}),
            ...(wordTimings.length > 0 ? {words: wordTimings} : {}),
          };
          persisted[slot] = persistedRow;
        }

        const row: TtsBeatResult = {
          sceneIndex,
          beatIndex,
          clipSeconds: Number(clipSeconds.toFixed(3)),
          wpm,
          mediaType: result.mediaType,
          alignmentSource: result.alignmentSource,
          synth: result,
          cached: false,
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
    const providerDescriptor: TtsManifestProvider = {
      id: providerId,
      ...(model !== undefined ? {model} : {}),
      ...(providerOptions !== undefined ? {voiceSettings: providerOptions} : {}),
    };
    const manifestOut: TtsPersistedManifest = {
      filmId,
      providerId,
      voice,
      totalSeconds: Number(totalSeconds.toFixed(3)),
      beats: persisted,
      provider: providerDescriptor,
      // R5: bump manifest version + record the fps the per-beat
      // `words[].startFrame/endFrame` were quantised against. A render at a
      // different fps re-runs the TTS stage (the orchestrator already
      // re-hashes by content) and a legacy manifest without a version is
      // recognized by the render-side hook.
      version: TTS_MANIFEST_VERSION,
      fps,
    };
    manifestPath = join(audioDirAbs, 'manifest.json');
    const tmp = `${manifestPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(manifestOut, null, 2) + '\n');
    renameSync(tmp, manifestPath);
  }

  // R1: summary line — "TTS: N beats · X cached (P%) · Y synthesized".
  // Prints to stderr so it interleaves with the cascade's progress output
  // without polluting stdout-driven pipelines.
  const totalBeats = beats.length;
  if (totalBeats > 0) {
    const pct = Math.round((cachedCount / totalBeats) * 100);
    const cachePart = useCache
      ? `${cachedCount} cached (${pct}%) · ${synthCount} synthesized`
      : `${synthCount} synthesized · cache disabled`;
    process.stderr.write(`TTS: ${totalBeats} beats · ${cachePart}\n`);
  }

  return {
    providerId,
    voice,
    totalSeconds: Number(totalSeconds.toFixed(3)),
    beats,
    ...(manifestPath !== undefined ? {manifestPath} : {}),
  };
};
