// The OpenAI TTS provider — wraps the official `openai` npm package's
// `audio.speech.create()`.
//
// Capabilities:
//   - local            : false  — calls api.openai.com.
//   - nativeAlignment  : 'none' — OpenAI's basic TTS endpoints (`tts-1`,
//                                   `tts-1-hd`) do not emit alignment.
//                                   `gpt-4o-mini-tts` is newer and *may*
//                                   support timing — but we conservatively
//                                   declare 'none' for the cell that lives in
//                                   the registry; advanced users can downcast
//                                   via `TtsSynthesisResult.raw`.
//   - streaming        : true   — OpenAI returns a streaming Response. We
//                                   buffer it to a Uint8Array for now; future
//                                   work can wire a streaming sink.
//   - ssml             : false  — OpenAI's TTS API does NOT consume SSML.
//   - voiceCloning     : false  — closed voice set (alloy/echo/fable/onyx/
//                                   nova/shimmer).
//
// Credentials: `OPENAI_API_KEY` from `process.env`. Optional `OPENAI_BASE_URL`
// for a self-hosted endpoint with the OpenAI wire shape (use the dedicated
// `openai-compatible` provider for that case instead).

import type {
  TtsProvider,
  TtsProviderContext,
  TtsSynthesisOptions,
  TtsSynthesisResult,
  TtsVoice,
  TtsCapabilities,
} from '@docent/kit';
import {TtsProviderError} from '@docent/kit';

export const OPENAI_CAPABILITIES: TtsCapabilities = {
  nativeAlignment: 'none',
  streaming: true,
  ssml: false,
  voiceCloning: false,
  local: false,
};

// The closed voice set OpenAI exposes for the `tts-1` family.
const OPENAI_VOICES: TtsVoice[] = [
  {id: 'alloy', name: 'Alloy', language: 'en-US', gender: 'neutral'},
  {id: 'echo', name: 'Echo', language: 'en-US', gender: 'male'},
  {id: 'fable', name: 'Fable', language: 'en-GB', gender: 'male'},
  {id: 'onyx', name: 'Onyx', language: 'en-US', gender: 'male'},
  {id: 'nova', name: 'Nova', language: 'en-US', gender: 'female'},
  {id: 'shimmer', name: 'Shimmer', language: 'en-US', gender: 'female'},
];

// Module-level singleton — the openai SDK client is cheap to construct but
// re-use is cleaner.
let _openaiClient: any | null = null;
let _openaiApiKey: string | null = null;

const loadOpenAI = async (apiKey: string, baseURL?: string): Promise<any> => {
  if (_openaiClient && _openaiApiKey === apiKey) return _openaiClient;
  let mod: any;
  try {
    mod = await import('openai');
  } catch {
    throw new TtsProviderError(
      'openai',
      'openai provider requires `openai` npm package — bun add openai',
    );
  }
  const OpenAI = mod.OpenAI ?? mod.default;
  if (!OpenAI) {
    throw new TtsProviderError('openai', 'openai sdk does not export OpenAI constructor');
  }
  _openaiClient = new OpenAI({apiKey, ...(baseURL ? {baseURL} : {})});
  _openaiApiKey = apiKey;
  return _openaiClient;
};

class OpenAIProvider implements TtsProvider {
  readonly id = 'openai';
  readonly capabilities = OPENAI_CAPABILITIES;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseURL: string | undefined;

  constructor(apiKey: string, model: string, baseURL: string | undefined) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = baseURL;
  }

  async synth(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult> {
    if (options.ssml === true) {
      throw new TtsProviderError(
        'openai',
        'openai TTS does not support SSML — pass plain text',
      );
    }
    const client = await loadOpenAI(this.apiKey, this.baseURL);
    const responseFormat =
      options.format === 'pcm' ? 'pcm' : options.format === 'wav' ? 'wav' : 'mp3';

    let response: any;
    try {
      response = await client.audio.speech.create({
        model: this.model,
        voice: options.voice,
        input: text,
        response_format: responseFormat,
        speed: options.speed ?? 1.0,
        ...(options.providerOptions ?? {}),
      });
    } catch (e) {
      throw new TtsProviderError(
        'openai',
        `synth failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const ab: ArrayBuffer = await response.arrayBuffer();
    const audio = new Uint8Array(ab);

    const mediaType =
      responseFormat === 'mp3'
        ? 'audio/mpeg'
        : responseFormat === 'wav'
          ? 'audio/wav'
          : 'audio/pcm';

    // OpenAI does not emit a duration header. We pass 0 — the cascade can
    // re-probe with ffprobe if it needs an exact value.
    return {
      audio,
      mediaType,
      durationMs: 0,
      alignment: [],
      alignmentSource: 'none',
      raw: response,
    };
  }

  async listVoices(): Promise<TtsVoice[]> {
    return OPENAI_VOICES;
  }
}

/**
 * Construct a live OpenAI TTS provider instance from the engine-supplied
 * context. Throws `TtsProviderError` synchronously if `OPENAI_API_KEY` is not
 * present in the environment — the cascade should never reach the render
 * stage on a film that can't speak.
 */
export const createOpenAIProvider = async (
  ctx: TtsProviderContext,
): Promise<TtsProvider> => {
  const apiKey = ctx.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new TtsProviderError(
      'openai',
      'OPENAI_API_KEY env var is not set — required to use the openai TTS provider',
    );
  }
  const model = ctx.model ?? 'tts-1';
  const baseURL = ctx.env.OPENAI_BASE_URL;
  return new OpenAIProvider(apiKey, model, baseURL);
};
