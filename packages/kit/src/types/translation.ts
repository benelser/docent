// Translation protocol — one spec, N narration languages.
//
// The kit OWNS the canonical shape of the translation contract. `@bjelser/core`
// ships the safe-default no-op provider; `@bjelser/tts-openai` ships an LLM-
// backed one. Every translation provider implements the same shape, mirroring
// the way TTS providers do.
//
// **The cascade hook**: when `RenderOptions.lang` is set, a translation stage
// runs BEFORE TTS, mapping each beat's `narration` through the active
// provider. The TTS stage then sees the translated narration as if it were
// authored that way. Captions sidecars, SRT generators, anything downstream
// also sees the translated text.
//
// The shape is intentionally tiny — one method, one return — so a third-party
// translation provider (DeepL, Google Translate, Anthropic, your own LLM
// gateway) is a 30-line module.

import type {PluginBase} from '../protocols';

/* ───────── capability matrix ───────── */

/**
 * Capability matrix every translation provider declares. The cascade reads
 * this at translate-stage time to decide whether the provider can handle the
 * requested target language at all — a provider that only speaks `'es'` and
 * `'fr'` declares so, and `--lang ja` fails fast with a guided error rather
 * than silently passing through.
 *
 * The shape is intentionally minimal — translation is a much narrower
 * contract than TTS. Add capability dimensions later if needed (RTL hints,
 * formality tiers, glossary support) — the registry-time descriptor can grow
 * additive fields without breaking the runtime instance.
 */
export interface TranslationCapabilities {
  /**
   * ISO 639-1 language codes the provider can translate INTO. `'*'` means
   * the provider can attempt any language (LLM-backed providers usually
   * declare this); a finite list means the cascade can short-circuit
   * unsupported targets at translate-stage time.
   */
  readonly targetLanguages: ReadonlyArray<string> | '*';
  /** Whether the provider runs locally (no network call). */
  readonly local: boolean;
}

/* ───────── construction context ───────── */

/**
 * Context handed to {@link TranslationProviderPlugin.create}. Mirrors
 * {@link TtsProviderContext} — env vars, cache dir, optional model id.
 */
export interface TranslationProviderContext {
  /** Provider-specific model id (e.g. `'gpt-4o-mini'`, `'claude-haiku'`). */
  readonly model?: string;
  /** Free-form provider-specific options block from the film spec / config. */
  readonly providerOptions?: Record<string, unknown>;
  /** Snapshot of `process.env` — read API keys etc. from here. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Directory the provider may use for caching translated strings. */
  readonly cacheDir: string;
}

/* ───────── the plugin (registry-time) ───────── */

/**
 * The TranslationProviderPlugin — the registry-time descriptor of a
 * translation provider. Lives in the kit's `translations` registry;
 * constructed by its author; registered via `engine.use(translationPlugin)`.
 *
 * **Plugin shape vs. runtime instance**: the plugin (this interface)
 * carries the metadata (id, capabilities) and the factory (`create`). The
 * runtime instance (see {@link TranslationProvider}) is what `create()`
 * returns and what the cascade calls `translate()` on.
 */
export interface TranslationProviderPlugin extends PluginBase {
  /** The plugin-kind discriminator. */
  readonly kind: 'translation';
  /**
   * Stable provider id used in film specs / CLI config. Examples:
   * `'noop' | 'openai' | 'deepl' | 'anthropic'`. Must be globally unique
   * within the active engine.
   */
  readonly providerId: string;
  /** Type-level capability declaration. See {@link TranslationCapabilities}. */
  readonly capabilities: TranslationCapabilities;
  /**
   * Construct a runtime {@link TranslationProvider} instance from the
   * active environment + spec config.
   *
   * MAY throw {@link TranslationProviderError} when credentials/config are
   * insufficient (env var missing, model unknown, etc.) BEFORE the cascade
   * burns minutes synthesizing audio that would be in the wrong language.
   */
  create(ctx: TranslationProviderContext): Promise<TranslationProvider>;
}

/* ───────── runtime instance ───────── */

/**
 * A runtime translation provider instance — what
 * {@link TranslationProviderPlugin.create} returns. The cascade calls
 * `translate()` once per beat with narration text.
 *
 * The no-op provider returns the input unchanged + warns once per cascade.
 * That's the safe default: a user who passes `--lang es` without configuring
 * a real provider gets a film built with the SOURCE narration (not a broken
 * render), plus a clear "no translation provider configured" warning.
 */
export interface TranslationProvider {
  /** The provider id (matches `TranslationProviderPlugin.providerId`). */
  readonly id: string;
  /** Echoes the plugin's capabilities for runtime introspection. */
  readonly capabilities: TranslationCapabilities;
  /**
   * Translate one beat's narration to the target language. The cascade
   * calls this once per beat with narration text.
   *
   * `targetLang` is an ISO 639-1 code (`'es'`, `'fr'`, `'ja'`, `'zh'`).
   * Implementations SHOULD treat unknown codes as a soft failure — return
   * the input unchanged and emit a warning — rather than throw, so a single
   * unsupported language code does not torpedo an otherwise-translatable
   * film.
   */
  translate(text: string, targetLang: string): Promise<string>;
  /** Optional teardown hook — called once at the end of the cascade. */
  dispose?(): Promise<void>;
}

/* ───────── error ───────── */

/**
 * The sentinel error the engine, CLI, and cascade all treat as the
 * "translation provider failed to initialize" signal. Mirrors
 * {@link TtsProviderError} so the CLI's diagnostic surface treats both
 * symmetrically.
 */
export class TranslationProviderError extends Error {
  /** The provider id the error pertains to. */
  readonly providerId: string;
  constructor(providerId: string, message: string) {
    super(`[${providerId}] ${message}`);
    this.providerId = providerId;
    this.name = 'TranslationProviderError';
  }
}

/* ───────── voice routing ───────── */

/**
 * Built-in default-voice map for the Kokoro provider, keyed by ISO 639-1
 * language code. The CLI uses this to pick a voice when the user passes
 * `--lang <code>` without `--voice`; the author can always override via
 * `--voice <id>` or `meta.voice`.
 *
 * **Kokoro is English-only today** (per `node_modules/kokoro-js/dist/voices`):
 * every shipped voice is `en-us` or `en-gb`. So this map points every
 * non-English code at the kokoro default — the film still renders, but the
 * voice will speak English-accented translated text. This is the safest
 * default short of failing.
 *
 * A real multilingual TTS provider (ElevenLabs, OpenAI's gpt-4o-mini-tts
 * with language hints, a self-hosted XTTS) should override this map in its
 * own plugin or via `docent.config.ts`.
 *
 * Keys are ISO 639-1 codes; values are Kokoro voice ids.
 */
export const DEFAULT_LANG_TO_VOICE: Readonly<Record<string, string>> =
  Object.freeze({
    // English — the only language kokoro genuinely speaks.
    en: 'af_heart',
    'en-us': 'af_heart',
    'en-gb': 'bf_emma',
    // Every other language falls back to the kokoro default (English
    // accent). The author SHOULD pass --voice explicitly or register a
    // real multilingual TTS provider.
    es: 'af_heart',
    fr: 'af_heart',
    de: 'af_heart',
    it: 'af_heart',
    pt: 'af_heart',
    nl: 'af_heart',
    ja: 'af_heart',
    zh: 'af_heart',
    ko: 'af_heart',
    ar: 'af_heart',
    he: 'af_heart',
    hi: 'af_heart',
    ru: 'af_heart',
    pl: 'af_heart',
    tr: 'af_heart',
  });

/**
 * Pick a default voice for a target language. Returns the mapped voice if
 * one is registered for the lang code; falls back to the supplied default
 * (or the kokoro default `'af_heart'`). Used by the CLI when `--lang` is
 * set without an explicit `--voice`.
 */
export const defaultVoiceForLang = (
  lang: string,
  fallback: string = 'af_heart',
): string => {
  const code = lang.toLowerCase();
  return DEFAULT_LANG_TO_VOICE[code] ?? fallback;
};
