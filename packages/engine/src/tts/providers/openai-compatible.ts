// The OpenAI-compatible TTS provider — a generic adapter for any endpoint
// that speaks the OpenAI `/v1/audio/speech` wire shape.
//
// Unlocks:
//   - LiteLLM proxies (the cheapest cross-provider router).
//   - Self-hosted endpoints (e.g. a local Kokoro-FastAPI server, an Inference
//     Endpoint, a vLLM TTS server).
//   - Alternative providers that mimic the OpenAI shape.
//
// Capabilities (declared conservatively — a custom endpoint may add more,
// surfaced through `providerOptions.capabilities`):
//   - local            : false  — over HTTP (could be 127.0.0.1, but the
//                                   adapter doesn't presume).
//   - nativeAlignment  : 'none' — no shared timing extension across OpenAI-
//                                   compatible servers.
//   - streaming        : false  — buffered for the v1 of this adapter.
//   - ssml             : false  — no shared SSML extension.
//   - voiceCloning     : false  — no shared cloning API.
//
// Configuration via env (the contract: credentials live in env, never in spec):
//   - DOCENT_TTS_BASE_URL  — REQUIRED. The base URL (e.g. http://localhost:4000/v1).
//   - DOCENT_TTS_API_KEY   — Optional. Passed as Authorization: Bearer.
//
// `providerOptions.model` (or `ctx.model`) names the model.
// `providerOptions.headers` adds extra headers — useful for routers that key
// off an org id or a project tag.

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

const OPENAI_COMPATIBLE_CAPABILITIES: TtsCapabilities = {
  nativeAlignment: 'none',
  streaming: false,
  ssml: false,
  voiceCloning: false,
  local: false,
};

class OpenAICompatibleProvider implements TtsProvider {
  readonly id = 'openai-compatible';
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  private readonly baseURL: string;
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(
    baseURL: string,
    model: string,
    apiKey: string | undefined,
    extraHeaders: Record<string, string>,
  ) {
    this.baseURL = baseURL.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.model = model;
    this.extraHeaders = extraHeaders;
  }

  async synth(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult> {
    if (options.ssml === true) {
      throw new TtsProviderError(
        'openai-compatible',
        'openai-compatible adapter declares ssml: false — pass plain text',
      );
    }
    const responseFormat =
      options.format === 'pcm' ? 'pcm' : options.format === 'wav' ? 'wav' : 'mp3';

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...this.extraHeaders,
    };
    if (this.apiKey) headers['authorization'] = `Bearer ${this.apiKey}`;

    const body = JSON.stringify({
      model: this.model,
      voice: options.voice,
      input: text,
      response_format: responseFormat,
      speed: options.speed ?? 1.0,
      ...(options.providerOptions ?? {}),
    });

    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/audio/speech`, {
        method: 'POST',
        headers,
        body,
        signal: options.abortSignal,
      });
    } catch (e) {
      throw new TtsProviderError(
        'openai-compatible',
        `synth fetch failed (baseURL ${this.baseURL}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new TtsProviderError(
        'openai-compatible',
        `synth HTTP ${response.status}: ${errBody.slice(0, 200)}`,
      );
    }
    const ab = await response.arrayBuffer();
    const audio = new Uint8Array(ab);

    const mediaType =
      responseFormat === 'mp3'
        ? 'audio/mpeg'
        : responseFormat === 'wav'
          ? 'audio/wav'
          : 'audio/pcm';

    return {
      audio,
      mediaType,
      durationMs: 0,
      alignment: [],
      alignmentSource: 'none',
      raw: {status: response.status, headers: Object.fromEntries(response.headers)},
    };
  }

  /**
   * OpenAI-compatible endpoints do not have a shared voices listing endpoint.
   * Many implementations expose `/v1/audio/voices`, others `/v1/voices`,
   * others none. We try `/audio/voices` first and fall back to the OpenAI
   * voice list if the endpoint 404s.
   */
  async listVoices(): Promise<TtsVoice[]> {
    const headers: Record<string, string> = {...this.extraHeaders};
    if (this.apiKey) headers['authorization'] = `Bearer ${this.apiKey}`;
    try {
      const r = await fetch(`${this.baseURL}/audio/voices`, {headers});
      if (r.ok) {
        const j = await r.json();
        const voices: any[] = Array.isArray(j) ? j : (j.voices ?? j.data ?? []);
        return voices.map((v) => ({
          id: v.id ?? v.voice_id ?? v.name,
          name: v.name ?? v.id ?? v.voice_id,
          language: v.language ?? v.locale ?? 'en',
          gender: v.gender,
          metadata: v,
        }));
      }
    } catch {
      // fall through
    }
    // Default fallback — the canonical OpenAI voice set.
    return [
      {id: 'alloy', name: 'Alloy', language: 'en-US', gender: 'neutral'},
      {id: 'echo', name: 'Echo', language: 'en-US', gender: 'male'},
      {id: 'fable', name: 'Fable', language: 'en-GB', gender: 'male'},
      {id: 'onyx', name: 'Onyx', language: 'en-US', gender: 'male'},
      {id: 'nova', name: 'Nova', language: 'en-US', gender: 'female'},
      {id: 'shimmer', name: 'Shimmer', language: 'en-US', gender: 'female'},
    ];
  }
}

export const openaiCompatibleProvider: TtsProviderPlugin = {
  providerId: 'openai-compatible',
  version: '1.0.0',
  capabilities: OPENAI_COMPATIBLE_CAPABILITIES,
  async create(ctx: TtsProviderContext): Promise<TtsProvider> {
    const baseURL = ctx.env.DOCENT_TTS_BASE_URL;
    if (!baseURL) {
      throw new TtsProviderError(
        'openai-compatible',
        'DOCENT_TTS_BASE_URL env var is not set — required to use the openai-compatible TTS provider',
      );
    }
    const apiKey = ctx.env.DOCENT_TTS_API_KEY;
    const model = ctx.model ?? 'tts-1';
    const extraHeaders =
      (ctx.providerOptions?.headers as Record<string, string> | undefined) ?? {};
    return new OpenAICompatibleProvider(baseURL, model, apiKey, extraHeaders);
  },
};
