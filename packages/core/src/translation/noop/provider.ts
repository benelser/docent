// The default translation provider — a no-op that returns the source text
// unchanged and emits a one-line warning the first time it's called per
// process. Ships in `@bjelser/core` so `--lang <code>` always resolves to a
// real provider, even when the user hasn't configured one.
//
// **Why a noop is the safe default.** Translation is an *add-on* — the spec
// is already authored in the source language. The failure mode for "no
// provider configured" should be "you get the source film" not "you get
// nothing". A user who passes `--lang es` without registering a real
// provider gets:
//   - A clear warning: "no translation provider configured — narration
//     unchanged".
//   - A built film with source-language narration intact.
//
// The user can then register an LLM-backed provider (e.g.
// `@bjelser/tts-openai`'s `openaiTranslationPlugin`) in `docent.config.ts`
// to actually translate.
//
// The warning fires once per provider instance, not once per beat — the
// cascade calls `translate()` N times per build, and we don't want N copies
// of the same line.

import type {
  TranslationProvider,
  TranslationProviderContext,
  TranslationCapabilities,
} from '@bjelser/kit';

export const NOOP_CAPABILITIES: TranslationCapabilities = {
  // The noop "supports" every language — it accepts any code and returns
  // the input unchanged. Declaring '*' here means the cascade does NOT
  // short-circuit on unknown codes; it calls translate() and gets the
  // input back.
  targetLanguages: '*',
  local: true,
};

class NoopTranslationProvider implements TranslationProvider {
  readonly id = 'noop';
  readonly capabilities = NOOP_CAPABILITIES;
  #warned = false;

  async translate(text: string, _targetLang: string): Promise<string> {
    if (!this.#warned) {
      process.stderr.write(
        '[translate] no translation provider configured — narration unchanged. ' +
          'Register a real provider (e.g. openaiTranslationPlugin from @bjelser/tts-openai) ' +
          'in docent.config.ts to actually translate.\n',
      );
      this.#warned = true;
    }
    return text;
  }
}

/**
 * Construct the no-op translation provider. Never throws — it has no
 * dependencies and no credentials to validate.
 */
export const createNoopTranslationProvider = async (
  _ctx: TranslationProviderContext,
): Promise<TranslationProvider> => {
  return new NoopTranslationProvider();
};
