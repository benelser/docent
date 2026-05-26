// The ElevenLabs TTS provider — wraps the `elevenlabs` npm package.
//
// The killer feature: native CHARACTER-level alignment via the
// `convertWithTimestamps` endpoint. The plugin folds those character-level
// timestamps into word-level `WordAlignment[]` for the engine.
//
// Capabilities:
//   - local            : false       — calls api.elevenlabs.io.
//   - nativeAlignment  : 'character' — character-level timestamps, folded
//                                       into words. The killer feature.
//   - streaming        : true        — ElevenLabs has a streaming endpoint.
//                                       We use the non-streaming
//                                       `convertWithTimestamps` for now and
//                                       buffer; future work can wire stream.
//   - ssml             : false       — ElevenLabs consumes plain text.
//   - voiceCloning     : true        — voices include user-cloned ones.
//
// Credentials: `ELEVENLABS_API_KEY` from `process.env`.
//
// Voice ids: ElevenLabs voice UUIDs (e.g. `21m00Tcm4TlvDq8ikWAM` for Rachel).

import type {
  TtsProvider,
  TtsProviderContext,
  TtsProviderPlugin,
  TtsSynthesisOptions,
  TtsSynthesisResult,
  TtsVoice,
  WordAlignment,
  TtsCapabilities,
} from '../types';
import {TtsProviderError} from '../types';

const ELEVENLABS_CAPABILITIES: TtsCapabilities = {
  nativeAlignment: 'character',
  streaming: true,
  ssml: false,
  voiceCloning: true,
  local: false,
};

// Module-level singleton.
let _elevenLabsClient: any | null = null;
let _elevenLabsApiKey: string | null = null;

const loadElevenLabs = async (apiKey: string): Promise<any> => {
  if (_elevenLabsClient && _elevenLabsApiKey === apiKey) return _elevenLabsClient;
  let mod: any;
  try {
    mod = await import('elevenlabs');
  } catch (e) {
    throw new TtsProviderError(
      'elevenlabs',
      'elevenlabs provider requires `elevenlabs` npm package — bun add elevenlabs',
    );
  }
  const ElevenLabsClient = mod.ElevenLabsClient ?? mod.default?.ElevenLabsClient;
  if (!ElevenLabsClient) {
    throw new TtsProviderError(
      'elevenlabs',
      'elevenlabs SDK does not export ElevenLabsClient — check version (expected ^1.x)',
    );
  }
  _elevenLabsClient = new ElevenLabsClient({apiKey});
  _elevenLabsApiKey = apiKey;
  return _elevenLabsClient;
};

/**
 * Fold ElevenLabs' character-level alignment into word-level `WordAlignment[]`.
 *
 * Strategy: walk the characters; a whitespace boundary closes the current
 * word. The word's `startMs` is the start of its first non-whitespace char;
 * `endMs` is the end of its last non-whitespace char. Empty words are dropped.
 */
const foldCharsToWords = (
  characters: string[],
  starts: number[],
  ends: number[],
): WordAlignment[] => {
  const words: WordAlignment[] = [];
  let buf = '';
  let bufStart = 0;
  let bufEnd = 0;
  let inWord = false;
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    if (/\s/.test(c)) {
      if (inWord) {
        words.push({
          text: buf,
          startMs: Math.round(bufStart * 1000),
          endMs: Math.round(bufEnd * 1000),
        });
        buf = '';
        inWord = false;
      }
    } else {
      if (!inWord) {
        bufStart = starts[i] ?? 0;
        inWord = true;
      }
      buf += c;
      bufEnd = ends[i] ?? bufStart;
    }
  }
  if (inWord && buf) {
    words.push({
      text: buf,
      startMs: Math.round(bufStart * 1000),
      endMs: Math.round(bufEnd * 1000),
    });
  }
  return words;
};

class ElevenLabsProvider implements TtsProvider {
  readonly id = 'elevenlabs';
  readonly capabilities = ELEVENLABS_CAPABILITIES;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async synth(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult> {
    if (options.ssml === true) {
      throw new TtsProviderError(
        'elevenlabs',
        'elevenlabs does not support SSML — pass plain text',
      );
    }
    const client = await loadElevenLabs(this.apiKey);

    let response: any;
    try {
      response = await client.textToSpeech.convertWithTimestamps(options.voice, {
        text,
        model_id: this.model,
        ...(options.providerOptions ?? {}),
      });
    } catch (e) {
      throw new TtsProviderError(
        'elevenlabs',
        `synth failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // audio_base64 is base64-encoded mp3.
    const audio = Uint8Array.from(Buffer.from(response.audio_base64, 'base64'));
    const align = response.alignment ?? response.normalized_alignment;
    const alignment: WordAlignment[] = align
      ? foldCharsToWords(
          align.characters ?? [],
          align.character_start_times_seconds ?? [],
          align.character_end_times_seconds ?? [],
        )
      : [];

    // Approximate duration from last alignment end, or 0 if no alignment.
    const durationMs =
      alignment.length > 0
        ? alignment[alignment.length - 1].endMs
        : 0;

    return {
      audio,
      mediaType: 'audio/mpeg',
      durationMs,
      alignment,
      alignmentSource: alignment.length > 0 ? 'native' : 'none',
      raw: response,
    };
  }

  async listVoices(): Promise<TtsVoice[]> {
    const client = await loadElevenLabs(this.apiKey);
    try {
      const result = await client.voices.getAll();
      const voices: any[] = result.voices ?? [];
      return voices.map((v) => ({
        id: v.voice_id,
        name: v.name,
        language: v.fine_tuning?.language ?? 'en',
        gender: v.labels?.gender,
        metadata: v.labels ?? undefined,
      }));
    } catch (e) {
      throw new TtsProviderError(
        'elevenlabs',
        `listVoices failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

export const elevenLabsProvider: TtsProviderPlugin = {
  providerId: 'elevenlabs',
  version: '1.0.0',
  capabilities: ELEVENLABS_CAPABILITIES,
  async create(ctx: TtsProviderContext): Promise<TtsProvider> {
    const apiKey = ctx.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new TtsProviderError(
        'elevenlabs',
        'ELEVENLABS_API_KEY env var is not set — required to use the elevenlabs TTS provider',
      );
    }
    const model = ctx.model ?? 'eleven_multilingual_v2';
    return new ElevenLabsProvider(apiKey, model);
  },
};
