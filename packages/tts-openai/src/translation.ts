// The OpenAI translation provider — wraps `chat.completions.create` with a
// clean "Translate to <lang>" system prompt. Lives alongside the TTS provider
// because they both speak to the OpenAI SDK; users typically register either
// or both via `docent.config.ts`.
//
// **Init only when OPENAI_API_KEY is set.** The plugin's `create()` throws a
// `TranslationProviderError` synchronously if the env var is missing — the
// cascade catches that and refuses to run a translate stage on a film that
// can't actually speak the target language. The default `noop` provider
// (shipped in `@bjelser/core`) is the safety net: a build with `--lang es`
// but no OPENAI_API_KEY surfaces the noop warning and renders source-
// language narration instead of failing the run.
//
// Capabilities:
//   - local            : false  — calls api.openai.com.
//   - targetLanguages  : '*'    — gpt-4o-mini speaks every ISO 639-1 code;
//                                 we don't enumerate (and we'd be wrong if
//                                 we tried — the model knows more codes than
//                                 we'd hard-code).
//
// Credentials: `OPENAI_API_KEY` from `process.env`. Optional `OPENAI_BASE_URL`
// for an OpenAI-compatible endpoint.

import type {
  TranslationProvider,
  TranslationProviderContext,
  TranslationProviderPlugin,
  TranslationCapabilities,
} from '@bjelser/kit';
import {TranslationProviderError} from '@bjelser/kit';

export const OPENAI_TRANSLATION_CAPABILITIES: TranslationCapabilities = {
  // gpt-4o-mini handles every language the model was trained on (which is
  // far more than we'd want to enumerate). Declare '*' and let the cascade
  // pass any code through.
  targetLanguages: '*',
  local: false,
};

// Module-level singleton — re-use the OpenAI SDK client across translate
// calls. The SDK client itself is cheap but stable identity makes timing
// and rate-limit behavior cleaner.
let _openaiClient: any | null = null;
let _openaiApiKey: string | null = null;

const loadOpenAI = async (apiKey: string, baseURL?: string): Promise<any> => {
  if (_openaiClient && _openaiApiKey === apiKey) return _openaiClient;
  let mod: any;
  try {
    mod = await import('openai');
  } catch {
    throw new TranslationProviderError(
      'openai',
      'openai translation provider requires `openai` npm package — bun add openai',
    );
  }
  const OpenAI = mod.OpenAI ?? mod.default;
  if (!OpenAI) {
    throw new TranslationProviderError(
      'openai',
      'openai sdk does not export OpenAI constructor',
    );
  }
  _openaiClient = new OpenAI({apiKey, ...(baseURL ? {baseURL} : {})});
  _openaiApiKey = apiKey;
  return _openaiClient;
};

/**
 * Human-readable name for an ISO 639-1 code — surfaced in the system
 * prompt so the model sees "Translate to Spanish" rather than
 * "Translate to es". The model handles raw codes fine but spelling out
 * the name is closer to the canonical prompt pattern.
 *
 * Falls through to the raw code when unknown — the model can usually
 * interpret it.
 */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  ja: 'Japanese',
  zh: 'Mandarin Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  he: 'Hebrew',
  hi: 'Hindi',
  ru: 'Russian',
  pl: 'Polish',
  tr: 'Turkish',
});

const languageName = (code: string): string => {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code;
};

class OpenAITranslationProvider implements TranslationProvider {
  readonly id = 'openai';
  readonly capabilities = OPENAI_TRANSLATION_CAPABILITIES;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseURL: string | undefined;

  constructor(apiKey: string, model: string, baseURL: string | undefined) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = baseURL;
  }

  async translate(text: string, targetLang: string): Promise<string> {
    const client = await loadOpenAI(this.apiKey, this.baseURL);
    const langName = languageName(targetLang);

    let response: any;
    try {
      response = await client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              `You are a translator. Translate the user's text into ${langName} (ISO 639-1: ${targetLang}). ` +
              'Preserve meaning, register, and any markup. Return ONLY the translated text — no preamble, ' +
              'no quotation marks, no commentary. If the text is already in the target language, return ' +
              'it unchanged.',
          },
          {role: 'user', content: text},
        ],
        temperature: 0,
      });
    } catch (e) {
      throw new TranslationProviderError(
        'openai',
        `translate failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const out: unknown = response?.choices?.[0]?.message?.content;
    if (typeof out !== 'string' || out.length === 0) {
      throw new TranslationProviderError(
        'openai',
        'translate failed: response did not include a text completion',
      );
    }
    return out.trim();
  }
}

/**
 * Construct an OpenAI translation provider. Throws
 * `TranslationProviderError` synchronously if `OPENAI_API_KEY` is not set —
 * the cascade catches that and the user sees a guided message instead of a
 * mid-render stack trace.
 */
export const createOpenAITranslationProvider = async (
  ctx: TranslationProviderContext,
): Promise<TranslationProvider> => {
  const apiKey = ctx.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new TranslationProviderError(
      'openai',
      'OPENAI_API_KEY env var is not set — required to use the openai translation provider',
    );
  }
  const model = ctx.model ?? 'gpt-4o-mini';
  const baseURL = ctx.env.OPENAI_BASE_URL;
  return new OpenAITranslationProvider(apiKey, model, baseURL);
};

/**
 * The OpenAI translation provider plugin. Register via
 * `docent.config.ts`:
 *
 * ```ts
 * import {openaiTranslationPlugin} from '@bjelser/tts-openai';
 * export default {plugins: [openaiTranslationPlugin]};
 * ```
 *
 * Then `docent build my-film --lang es` translates every beat's narration
 * to Spanish before the TTS stage runs.
 */
export const openaiTranslationPlugin: TranslationProviderPlugin = {
  kind: 'translation',
  name: 'openai-translation',
  version: '1.0.0',
  providerId: 'openai',
  capabilities: OPENAI_TRANSLATION_CAPABILITIES,
  create: async (ctx) => createOpenAITranslationProvider(ctx),
};
