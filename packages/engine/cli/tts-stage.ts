// The TTS stage — the cascade calls this to render every beat's narration to
// disk. Replaces the historical `uv run python pipeline/tts.py` invocation.
//
// What this stage does, in order:
//
//   1. Reads the film spec, picks the provider per `meta.tts.provider` (or
//      falls back to `kokoro`).
//   2. Constructs the provider via the registry (`ttsRegistry.create`). Throws
//      a `TtsProviderError` with a precise message if credentials/config are
//      insufficient — BEFORE burning minutes on a render.
//   3. For each beat: if a cached audio file exists at the expected path and
//      the beat text/provider hasn't changed (signature embedded in the
//      per-film manifest), re-uses it. Otherwise calls `provider.synth()`,
//      writes the bytes, and records the manifest entry.
//   4. Writes the global `public/audio/manifest.json` (`{file, seconds}` per
//      `<filmId>/<beatId>` key — engine-facing, schema unchanged) AND the
//      per-film `public/audio/<filmId>/manifest.json` (full rhythm telemetry,
//      depthcheck-facing).
//
// The per-beat silence trim (the move from `pipeline/tts.py`) lives in the
// kokoro provider's `synth()` itself; other providers ship un-trimmed audio.

import {existsSync, mkdirSync, writeFileSync, readFileSync, renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {paths} from './paths';
import {ttsRegistry} from '../src/tts';
import type {TtsProvider, TtsSynthesisResult, TtsBeatMetrics} from '../src/tts';

export interface TtsStageOptions {
  film: string;
  force?: boolean;
}

export interface TtsStageResult {
  beats: number;
  rendered: number;
  cached: number;
  providerId: string;
  totalSeconds: number;
}

interface BeatJob {
  id: string;
  text: string;
  pace: 'hold' | 'settle' | 'normal' | 'brisk' | undefined;
}

const fileExtensionForMediaType = (mediaType: string): string => {
  if (mediaType === 'audio/mpeg') return 'mp3';
  if (mediaType === 'audio/wav') return 'wav';
  if (mediaType === 'audio/pcm') return 'pcm';
  // best-effort fallback
  const m = mediaType.match(/audio\/(\w+)/);
  return m ? m[1] : 'bin';
};

const sigFor = (text: string, providerId: string, voice: string): string => {
  const h = createHash('sha1');
  h.update(providerId);
  h.update('');
  h.update(voice);
  h.update('');
  h.update(text);
  return h.digest('hex').slice(0, 16);
};

// Determine the on-disk filename for a beat. The legacy Python sidecar wrote
// `<beatId>.mp3` regardless of source — for the kokoro path the move to WAV
// is functionally invisible (the cascade points the engine manifest at
// whatever file is on disk). We honour both, but bias toward the provider's
// declared media type for new files.
const beatPaths = (audioDir: string, beatId: string, ext: string) => ({
  primary: join(audioDir, `${beatId}.${ext}`),
  legacyMp3: join(audioDir, `${beatId}.mp3`),
  legacyWav: join(audioDir, `${beatId}.wav`),
});

export const runTtsStage = async (opts: TtsStageOptions): Promise<TtsStageResult> => {
  const specPath = join(paths.films, `${opts.film}.json`);
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const ttsCfg = spec?.meta?.tts ?? {};
  const providerId: string = ttsCfg.provider ?? 'kokoro';
  // Voice precedence — meta.tts.voice > meta.voice > 'af_heart'.
  const voice: string = ttsCfg.voice ?? spec?.meta?.voice ?? 'af_heart';
  const model: string | undefined = ttsCfg.model;

  const audioDir = join(paths.publicDir, 'audio', opts.film);
  mkdirSync(audioDir, {recursive: true});

  // Instantiate the provider through the registry. Lazy creation — credentials
  // are checked NOW so a missing key fails before any synth call.
  let provider: TtsProvider;
  try {
    provider = await ttsRegistry.create(providerId, {
      env: process.env as Readonly<Record<string, string | undefined>>,
      cacheDir: audioDir,
      model,
      providerOptions: ttsCfg.providerOptions,
    });
  } catch (e) {
    throw new Error(
      `tts stage: provider "${providerId}" failed to initialize — ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const beats: BeatJob[] = [];
  for (const scene of spec.scenes ?? []) {
    if (!Array.isArray(scene.beats)) continue;
    for (const b of scene.beats) {
      beats.push({id: b.id, text: b.narration, pace: b.pace});
    }
  }

  // Per-film manifest — full rhythm telemetry. Used to detect cache hits via
  // the embedded signature (provider, voice, text → sigFor).
  const filmManifestPath = join(audioDir, 'manifest.json');
  let filmManifest: any = {};
  if (existsSync(filmManifestPath)) {
    try {
      filmManifest = JSON.parse(readFileSync(filmManifestPath, 'utf8'));
    } catch {
      filmManifest = {};
    }
  }
  const cachedBeats: Record<string, any> = (filmManifest.beats as Record<string, any>) ?? {};

  // The global engine-facing manifest.
  const globalManifestPath = join(paths.publicDir, 'audio', 'manifest.json');
  let globalManifest: Record<string, {file: string; seconds: number}> = {};
  if (existsSync(globalManifestPath)) {
    try {
      globalManifest = JSON.parse(readFileSync(globalManifestPath, 'utf8'));
    } catch {
      globalManifest = {};
    }
  }

  const metrics: Record<string, any> = {};
  let rendered = 0;
  let cached = 0;

  for (const beat of beats) {
    const sig = sigFor(beat.text, providerId, voice);
    const cachedEntry = cachedBeats[beat.id];
    const cacheValid =
      !opts.force &&
      cachedEntry &&
      cachedEntry.sig === sig &&
      cachedEntry.file &&
      existsSync(join(paths.publicDir, cachedEntry.file));
    if (cacheValid) {
      metrics[beat.id] = {...cachedEntry};
      cached += 1;
      continue;
    }

    // Synthesize a fresh clip.
    const t0 = performance.now();
    let result: TtsSynthesisResult;
    try {
      result = await provider.synth(beat.text, {voice, pace: beat.pace});
    } catch (e) {
      throw new Error(
        `tts stage: synth failed for beat "${beat.id}" — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const elapsedMs = performance.now() - t0;

    const ext = fileExtensionForMediaType(result.mediaType);
    const fname = `${beat.id}.${ext}`;
    const fullPath = join(audioDir, fname);
    writeFileSync(fullPath, result.audio);

    // Compute clipSeconds from the result; fall back to result.metrics when
    // the provider already calculated it (kokoro path).
    const m: TtsBeatMetrics =
      result.metrics ??
      ({
        clipSeconds: result.durationMs > 0 ? result.durationMs / 1000 : 0,
        wordCount: beat.text.split(/\s+/).filter((w) => w.trim().length > 0).length,
        wpm: null,
        leadingSilenceMs: null,
        trailingSilenceMs: null,
        pace: beat.pace ?? null,
      } satisfies TtsBeatMetrics);

    const seconds = m.clipSeconds || result.durationMs / 1000;
    const relPath = `audio/${opts.film}/${fname}`;
    metrics[beat.id] = {
      sig,
      seconds: Number(seconds.toFixed(3)),
      file: relPath,
      providerId,
      voice,
      mediaType: result.mediaType,
      alignmentSource: result.alignmentSource,
      ...m,
    };
    rendered += 1;
    process.stdout.write(
      `[tts]   ${beat.id}  ${seconds.toFixed(2)}s  ${providerId}/${voice}  ${elapsedMs.toFixed(0)}ms\n`,
    );
  }

  // Dispose the provider — free any heavy handles (ONNX runtime, WebSockets).
  if (provider.dispose) {
    try {
      await provider.dispose();
    } catch {
      // tolerable
    }
  }

  // Write the global manifest (engine-facing — schema unchanged).
  for (const beat of beats) {
    const m = metrics[beat.id];
    globalManifest[`${opts.film}/${beat.id}`] = {file: m.file, seconds: m.seconds};
  }
  const globalTmp = `${globalManifestPath}.tmp`;
  writeFileSync(globalTmp, JSON.stringify(globalManifest, null, 2) + '\n');
  renameSync(globalTmp, globalManifestPath);

  // Write the per-film manifest (depthcheck-facing).
  const filmManifestOut = {
    film: opts.film,
    providerId,
    voice,
    sampleRate: 24000,
    beats: Object.fromEntries(beats.map((b) => [b.id, metrics[b.id]])),
  };
  const filmTmp = `${filmManifestPath}.tmp`;
  writeFileSync(filmTmp, JSON.stringify(filmManifestOut, null, 2) + '\n');
  renameSync(filmTmp, filmManifestPath);

  const totalSeconds = Object.values(metrics).reduce(
    (a, m: any) => a + (m.seconds ?? 0),
    0,
  );
  process.stdout.write(
    `[tts] ${opts.film}: ${beats.length} beats — ${rendered} rendered, ${cached} cached · ${providerId}/${voice} · ${totalSeconds.toFixed(1)}s narration\n`,
  );
  return {
    beats: beats.length,
    rendered,
    cached,
    providerId,
    totalSeconds,
  };
};
