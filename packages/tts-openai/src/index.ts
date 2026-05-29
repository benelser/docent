// @bjelser/tts-openai — the OpenAI TTS provider plugin.
//
// Wraps the official `openai` npm package's `audio.speech.create()` and
// exposes it through `@bjelser/kit`'s `TtsProviderPlugin` contract.
//
// Install:
//   bun add @bjelser/tts-openai openai
//
// Register in `docent.config.ts`:
//
//   import openaiTtsPlugin from '@bjelser/tts-openai';
//   export default {plugins: [openaiTtsPlugin]};
//
// Credentials: `OPENAI_API_KEY` (required) and optionally `OPENAI_BASE_URL`
// for a custom endpoint that speaks the canonical OpenAI wire shape.

import type {TtsProviderPlugin} from '@bjelser/kit';
import {createOpenAIProvider, OPENAI_CAPABILITIES} from './provider';

export const openaiTtsPlugin: TtsProviderPlugin = {
  kind: 'tts',
  name: 'openai',
  version: '1.0.0',
  providerId: 'openai',
  capabilities: OPENAI_CAPABILITIES,
  create: async (ctx) => createOpenAIProvider(ctx),
};

// Translation provider — registered separately. Users wire either or both
// in their docent.config.ts.
export {
  openaiTranslationPlugin,
  createOpenAITranslationProvider,
  OPENAI_TRANSLATION_CAPABILITIES,
} from './translation';

export default openaiTtsPlugin;
