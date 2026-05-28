// @bjelser/tts-elevenlabs — the ElevenLabs TTS provider plugin.
//
// Wraps the `elevenlabs` npm package's `textToSpeech.convertWithTimestamps`
// endpoint. The killer feature: native character-level alignment, folded into
// word-level alignment for the engine — enables word-level karaoke-style
// scenes (e.g. a `passage` that highlights the spoken word).
//
// Install:
//   bun add @bjelser/tts-elevenlabs elevenlabs
//
// Register in `docent.config.ts`:
//
//   import elevenLabsTtsPlugin from '@bjelser/tts-elevenlabs';
//   export default {plugins: [elevenLabsTtsPlugin]};
//
// Credentials: `ELEVENLABS_API_KEY` (required).

import type {TtsProviderPlugin} from '@bjelser/kit';
import {createElevenLabsProvider, ELEVENLABS_CAPABILITIES} from './provider';

export const elevenLabsTtsPlugin: TtsProviderPlugin = {
  kind: 'tts',
  name: 'elevenlabs',
  version: '1.0.0',
  providerId: 'elevenlabs',
  capabilities: ELEVENLABS_CAPABILITIES,
  create: async (ctx) => createElevenLabsProvider(ctx),
};

export default elevenLabsTtsPlugin;
