// The default TTS provider — Kokoro, run locally via `kokoro-js`.
//
// `kokoro-js` is a JS-native port of the Kokoro model that runs through
// @huggingface/transformers (ONNX Runtime under the hood). The user has
// explicitly chosen this path over the Python sidecar for the default —
// the Python `pipeline/tts.py` script is replaced.
//
// Voice id default: `af_heart` — matches the existing `meta.voice` in every
// committed film spec.
//
// Capabilities:
//   - local            : true   — no API key, no outbound HTTP at synth time.
//                                   (The model weights are downloaded ONCE on
//                                   first call via @huggingface/transformers
//                                   and cached under `cacheDir`.)
//   - nativeAlignment  : 'none' — Kokoro emits audio only. Word-level
//                                   alignment is a follow-up via WhisperX.
//   - streaming        : false  — kokoro-js exposes a `.stream()` but the
//                                   plugin contract here is one-shot synth;
//                                   a future iteration can flip this to true
//                                   once the engine has a streaming sink.
//   - ssml             : false  — Kokoro consumes plain text only.
//   - voiceCloning     : false  — Kokoro voices are a closed set.
//
// Per-beat silence trim is applied INLINE on the trimmed Float32Array, then
// encoded as WAV — the same shape `pipeline/tts.py` wrote. The output is the
// raw WAV bytes (not mp3); the cascade may transcode to mp3 if needed, but
// for byte-comparability checks we hold the WAV here.
//
// Cache & re-use:
//   - The model is loaded ONCE per process (a module-level singleton).
//   - `KokoroTTS.from_pretrained` pulls weights from HF on first use; cached
//     under `~/.cache/huggingface` automatically.

import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
import type {
  TtsProvider,
  TtsProviderContext,
  TtsProviderPlugin,
  TtsSynthesisOptions,
  TtsSynthesisResult,
  TtsVoice,
  TtsCapabilities,
} from '../types';
import {TtsProviderError} from '../types';
import {trimSilence, encodeWav} from '../silence';

const KOKORO_CAPABILITIES: TtsCapabilities = {
  nativeAlignment: 'none',
  streaming: false,
  ssml: false,
  voiceCloning: false,
  local: true,
};

// Default model id — matches the canonical Kokoro 82M ONNX export on HF.
const DEFAULT_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
// Default voice — preserved from the committed film specs (`meta.voice`).
const DEFAULT_VOICE = 'af_heart';
// Default sample rate — preserved from `pipeline/tts.py` (24 kHz).
const DEFAULT_SAMPLE_RATE = 24000;

// Module-level singleton — kokoro-js is heavy (loads ONNX runtime + weights).
// We construct it once per process and re-use across every synth call.
let _kokoroModel: any | null = null;
let _kokoroModelId: string | null = null;

const loadKokoro = async (modelId: string): Promise<any> => {
  if (_kokoroModel && _kokoroModelId === modelId) return _kokoroModel;
  let mod: any;
  try {
    mod = await import('kokoro-js');
  } catch (e) {
    throw new TtsProviderError(
      'kokoro',
      'kokoro provider requires `kokoro-js` npm package — bun add kokoro-js',
    );
  }
  const KokoroTTS = mod.KokoroTTS ?? mod.default?.KokoroTTS;
  if (!KokoroTTS) {
    throw new TtsProviderError(
      'kokoro',
      `kokoro-js does not export KokoroTTS — incompatible version (expected ^1.2.x)`,
    );
  }
  // dtype: q8 is the smallest reasonable export; fp32 is the safest default
  // for "match the Python sidecar." The Python sidecar runs the model in
  // fp32; we mirror that for the byte-comparability target.
  _kokoroModel = await KokoroTTS.from_pretrained(modelId, {dtype: 'fp32'});
  _kokoroModelId = modelId;
  return _kokoroModel;
};

class KokoroProvider implements TtsProvider {
  readonly id = 'kokoro';
  readonly capabilities = KOKORO_CAPABILITIES;
  private readonly modelId: string;
  private readonly cacheDir: string;

  constructor(modelId: string, cacheDir: string) {
    this.modelId = modelId;
    this.cacheDir = cacheDir;
  }

  async synth(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult> {
    if (options.ssml === true) {
      throw new TtsProviderError(
        'kokoro',
        'kokoro does not support SSML — set `ssml: false` or pass plain text',
      );
    }
    const voice = options.voice || DEFAULT_VOICE;
    const speed = options.speed ?? 1.0;
    const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;

    const model = await loadKokoro(this.modelId);

    // generate() returns a RawAudio { audio: Float32Array, sampling_rate: number }
    const raw = await model.generate(text, {voice, speed});
    const samples: Float32Array = raw.audio;
    const actualSampleRate: number = raw.sampling_rate ?? sampleRate;

    // The DOCENT_TTS_NO_TRIM=1 escape hatch — kept for the baseline-capture
    // tooling that diagnoses rhythm regressions (used by depthcheck work).
    const noTrim = options.providerOptions?.noTrim === true || process.env.DOCENT_TTS_NO_TRIM === '1';

    let trimmed: Float32Array;
    let leadingMsPost: number;
    let trailingMsPost: number;
    let leadingMsPre: number;
    let trailingMsPre: number;
    if (noTrim) {
      trimmed = samples;
      const bounds = trimSilence(samples, actualSampleRate, options.pace);
      leadingMsPre = bounds.leadingMsPre;
      trailingMsPre = bounds.trailingMsPre;
      leadingMsPost = leadingMsPre;
      trailingMsPost = trailingMsPre;
    } else {
      const result = trimSilence(samples, actualSampleRate, options.pace);
      trimmed = result.trimmed;
      leadingMsPost = result.leadingMsPost;
      trailingMsPost = result.trailingMsPost;
      leadingMsPre = result.leadingMsPre;
      trailingMsPre = result.trailingMsPre;
    }

    const clipSeconds = trimmed.length / actualSampleRate;
    const wordCount = text.split(/\s+/).filter((w) => w.trim().length > 0).length;
    const wpm = clipSeconds > 0 ? (wordCount / clipSeconds) * 60.0 : 0;

    const audio = encodeWav(trimmed, actualSampleRate);
    return {
      audio,
      mediaType: 'audio/wav',
      durationMs: Math.round(clipSeconds * 1000),
      alignment: [],
      alignmentSource: 'none',
      raw,
      metrics: {
        clipSeconds: Number(clipSeconds.toFixed(3)),
        wordCount,
        wpm: Number(wpm.toFixed(1)),
        leadingSilenceMs: Number(leadingMsPost.toFixed(1)),
        trailingSilenceMs: Number(trailingMsPost.toFixed(1)),
        leadingSilencePreTrimMs: Number(leadingMsPre.toFixed(1)),
        trailingSilencePreTrimMs: Number(trailingMsPre.toFixed(1)),
        pace: options.pace ?? null,
        trimmed: !noTrim,
      },
    };
  }

  async listVoices(): Promise<TtsVoice[]> {
    const model = await loadKokoro(this.modelId);
    const voices = model.voices as Record<
      string,
      {name: string; language: string; gender: string; traits?: string}
    >;
    return Object.entries(voices).map(([id, meta]) => ({
      id,
      name: meta.name,
      language: meta.language,
      gender: meta.gender,
      metadata: meta.traits ? {traits: meta.traits} : undefined,
    }));
  }
}

/**
 * The default TTS provider plugin. Registered automatically at module load
 * via `src/tts/index.ts`.
 *
 * `create()` is cheap — the heavy ONNX model load is deferred to the first
 * `synth()` call. This matches the design doc's "lazy by default" policy
 * (Open Question O8).
 */
export const kokoroProvider: TtsProviderPlugin = {
  providerId: 'kokoro',
  version: '1.0.0',
  capabilities: KOKORO_CAPABILITIES,
  async create(ctx: TtsProviderContext): Promise<TtsProvider> {
    const modelId = ctx.model ?? DEFAULT_MODEL;
    // Ensure cacheDir exists so the model loader can write its scratch files.
    try {
      mkdirSync(ctx.cacheDir, {recursive: true});
    } catch {
      // tolerable — `synth()` will surface a clearer error if the dir is
      // genuinely unwritable.
    }
    return new KokoroProvider(modelId, ctx.cacheDir);
  },
};
