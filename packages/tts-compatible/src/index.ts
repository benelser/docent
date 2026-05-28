// @bjelser/tts-compatible — the OpenAI-compatible TTS provider plugin.
//
// A generic adapter for any endpoint that speaks the OpenAI `/v1/audio/speech`
// wire shape. Unlocks LiteLLM proxies, self-hosted Kokoro-FastAPI servers,
// vLLM TTS servers, and alternative providers that mimic the OpenAI shape.
//
// Uses `fetch` — no SDK peerDependency.
//
// Install:
//   bun add @bjelser/tts-compatible
//
// Register in `docent.config.ts`:
//
//   import openaiCompatibleTtsPlugin from '@bjelser/tts-compatible';
//   export default {plugins: [openaiCompatibleTtsPlugin]};
//
// Configuration (via env):
//   - DOCENT_TTS_BASE_URL  — REQUIRED. Base URL (e.g. http://localhost:4000/v1).
//   - DOCENT_TTS_API_KEY   — Optional. Passed as Authorization: Bearer.

import type {TtsProviderPlugin} from '@bjelser/kit';
import {
  createOpenAICompatibleProvider,
  OPENAI_COMPATIBLE_CAPABILITIES,
} from './provider';

export const openaiCompatibleTtsPlugin: TtsProviderPlugin = {
  kind: 'tts',
  name: 'openai-compatible',
  version: '1.0.0',
  providerId: 'openai-compatible',
  capabilities: OPENAI_COMPATIBLE_CAPABILITIES,
  create: async (ctx) => createOpenAICompatibleProvider(ctx),
};

export default openaiCompatibleTtsPlugin;
