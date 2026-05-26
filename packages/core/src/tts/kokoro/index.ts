// @docent/core/tts/kokoro — the default TTS provider plugin.
//
// The Kokoro adapter — moved verbatim from `packages/engine/src/tts/providers/
// kokoro.ts` — wrapped as a `TtsProviderPlugin` so `engine.use(plugin)` can
// route it into the kit's `TtsRegistry`.
//
// The plugin shape adds the two `PluginBase` fields (`kind`, `name`) that the
// kit's registry routing requires; the runtime behaviour is identical to the
// existing engine adapter (same synth path, same silence trim, same default
// voice, same WAV encoding).

import type {TtsProviderPlugin} from '@docent/kit';
import {createKokoroProvider, KOKORO_CAPABILITIES} from './provider';

export const kokoroTtsPlugin: TtsProviderPlugin = {
  kind: 'tts',
  name: 'kokoro',
  version: '1.0.0',
  providerId: 'kokoro',
  capabilities: KOKORO_CAPABILITIES,
  create: async (ctx) => createKokoroProvider(ctx),
};

export default kokoroTtsPlugin;
