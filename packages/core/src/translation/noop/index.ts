// @bjelser/core/translation/noop — the default translation provider plugin.
//
// A safe-default no-op: returns the source text unchanged and warns once per
// cascade. Ships in @bjelser/core so `--lang <code>` always resolves to a
// registered provider; users who want real translation register a different
// provider in `docent.config.ts` (e.g. `openaiTranslationPlugin` from
// `@bjelser/tts-openai`).

import type {TranslationProviderPlugin} from '@bjelser/kit';
import {
  createNoopTranslationProvider,
  NOOP_CAPABILITIES,
} from './provider';

export const noopTranslationPlugin: TranslationProviderPlugin = {
  kind: 'translation',
  name: 'noop',
  version: '1.0.0',
  providerId: 'noop',
  capabilities: NOOP_CAPABILITIES,
  create: async (ctx) => createNoopTranslationProvider(ctx),
};

export default noopTranslationPlugin;
