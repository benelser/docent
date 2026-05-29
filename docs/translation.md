# translation — one spec, N narration languages

A docent film spec is authored in one language. The translation pipeline lets
you render it in any other language — Spanish, Japanese, Mandarin, German,
French — without forking the spec. Every other artifact in the cascade (the
TTS clips, the captions sidecars, the alignment data) sees the translated
text as if it were authored that way.

## The contract — three protocols, one stage

The translation pipeline introduces three new public types in `@bjelser/kit`:

- **`TranslationProvider`** — the runtime instance. One method: `translate(text, targetLang)`. Mirrors `TtsProvider`.
- **`TranslationProviderPlugin`** — the registry-time descriptor. `engine.use(plugin)` routes it into `engine.translations`. Mirrors `TtsProviderPlugin`.
- **`TranslationCapabilities`** — declarative: `targetLanguages: ReadonlyArray<string> | '*'`, `local: boolean`. The cascade reads this at translate-stage time to decide whether the provider can handle the requested target language.

A new cascade stage runs between `resolveStyle` and `tts`:

```
preprocessSpec → applyModifiers → validate → resolveStyle → translate → tts → render
```

The stage is a no-op when `RenderOptions.lang` is unset (the default).

## The safe-default noop provider

`@bjelser/core` ships a `noopTranslationPlugin` registered under
`providerId: 'noop'`. It returns the source text unchanged and writes a
single warning to stderr:

```
[translate] no translation provider configured — narration unchanged. Register a real provider (e.g. openaiTranslationPlugin from @bjelser/tts-openai) in docent.config.ts to actually translate.
```

**Why a noop is the safe default.** Translation is an *add-on* — the film is
already authored in the source language. The failure mode for "no provider
configured" should be "you get the source film with a warning" not "the run
fails". So `docent build my-film --lang es` always produces an mp4 — even
without an LLM API key — just with source-language narration when no real
provider is wired up.

## CLI flags

```
docent build <film-id> [options]

  --lang <code>             Translate narration into <code> (ISO 639-1:
                            es, fr, de, ja, zh, ar, he, hi, ...). Output
                            filename becomes out/<film-id>-<code>.mp4.

  --voice <id>              Override the TTS voice (e.g. af_heart, bm_george).
                            When --lang is set without --voice, the CLI
                            consults a built-in lang→voice map.

  --translation-provider <id>
                            Pick a registered translation provider by id.
                            Defaults to meta.translation.provider, then 'noop'.
```

A typical translated build:

```bash
bunx docent build kubernetes-architecture --lang es
# → out/kubernetes-architecture-es.mp4
```

## Output naming

`docent build <film-id> --lang <code>` writes to
`out/<film-id>-<code>.mp4`. Without `--lang`, the default
`out/<film-id>.mp4` path is used. This lets multiple language renders of
the same film co-exist on disk:

```
out/
├── kubernetes-architecture.mp4         # source (English, as authored)
├── kubernetes-architecture-es.mp4      # Spanish
├── kubernetes-architecture-ja.mp4      # Japanese
└── kubernetes-architecture-zh.mp4      # Mandarin
```

The `--output-dir` flag stacks with this: `--output-dir build --lang fr`
writes `build/<film-id>-fr.mp4`.

## Voice routing

A film's voice is set on `meta.voice` (e.g. `'af_heart'`). When you pass
`--lang es`, the source voice — usually English-only — will speak Spanish
text. That's audible but accented; a real production flow picks a voice
that natively speaks the target language.

The CLI follows this precedence:

1. **`--voice <id>`** — explicit override. Always wins.
2. **Built-in lang→voice map** (`DEFAULT_LANG_TO_VOICE` in `@bjelser/kit`)
   — keyed by ISO 639-1 code. Used when `--lang` is set without
   `--voice`.
3. **`meta.tts.providerOptions.voice`** — provider-specific override on
   the spec.
4. **`meta.voice`** — the spec's default.
5. **The provider's built-in default** (e.g. `'af_heart'` for kokoro).

### A caveat about kokoro

Kokoro — the default TTS provider in `@bjelser/core` — is **English-only
today**. Every shipped voice is `en-us` or `en-gb`. The built-in lang→voice
map points every non-English code at `'af_heart'`, so an `--lang es` build
without a real multilingual TTS provider produces translated Spanish text
spoken with an English accent. That's the safest default short of failing.

For genuine multilingual TTS, register a provider that handles your target
language — `@bjelser/tts-elevenlabs` (multilingual_v2), a self-hosted XTTS,
or OpenAI's `gpt-4o-mini-tts` with a language hint. Each provider exposes
its own voice list via `engine.tts.get(id).listVoices()`.

## Registering a translation provider

The OpenAI translation provider ships in `@bjelser/tts-openai`. Register it
in your project's `docent.config.ts`:

```ts
// docent.config.ts
import {openaiTtsPlugin, openaiTranslationPlugin} from '@bjelser/tts-openai';

export default {
  plugins: [
    openaiTtsPlugin,           // for synthesis
    openaiTranslationPlugin,   // for translation
  ],
};
```

The provider is gated behind an env-var check: `create()` throws
`TranslationProviderError` synchronously when `OPENAI_API_KEY` is not set, so
the cascade refuses to run a translate stage on a film that can't actually
speak the target language.

Pin a specific model via `meta.translation.model` on the spec:

```json
{
  "meta": {
    "id": "my-film",
    "translation": {
      "provider": "openai",
      "model": "gpt-4o-mini"
    }
  }
}
```

When `meta.translation.provider` is set, the cascade uses it without
requiring a CLI flag. The `--translation-provider` CLI flag overrides the
spec when set.

## Writing your own translation provider

The shape is intentionally tiny — one method per runtime instance. Here's a
DeepL-backed provider (sketch):

```ts
// my-deepl-translation.ts
import type {
  TranslationProvider,
  TranslationProviderPlugin,
  TranslationProviderContext,
} from '@bjelser/kit';
import {TranslationProviderError} from '@bjelser/kit';

class DeepLProvider implements TranslationProvider {
  readonly id = 'deepl';
  readonly capabilities = {targetLanguages: '*', local: false};
  constructor(private readonly apiKey: string) {}

  async translate(text: string, targetLang: string): Promise<string> {
    const r = await fetch('https://api.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({text: [text], target_lang: targetLang.toUpperCase()}),
    });
    const j: any = await r.json();
    return j.translations?.[0]?.text ?? text;
  }
}

export const deeplTranslationPlugin: TranslationProviderPlugin = {
  kind: 'translation',
  name: 'deepl',
  version: '1.0.0',
  providerId: 'deepl',
  capabilities: {targetLanguages: '*', local: false},
  create: async (ctx: TranslationProviderContext) => {
    const apiKey = ctx.env.DEEPL_API_KEY;
    if (!apiKey) {
      throw new TranslationProviderError('deepl', 'DEEPL_API_KEY not set');
    }
    return new DeepLProvider(apiKey);
  },
};
```

Drop it into `docent.config.ts`:

```ts
import {deeplTranslationPlugin} from './my-deepl-translation';
export default {plugins: [deeplTranslationPlugin]};
```

Then:

```bash
bunx docent build my-film --lang fr --translation-provider deepl
```

## Examples

### Spanish

```bash
bunx docent build kubernetes-architecture --lang es
# → out/kubernetes-architecture-es.mp4 (uses 'af_heart' voice)
```

With OpenAI's TTS for a more natural voice:

```ts
// docent.config.ts
import {openaiTtsPlugin, openaiTranslationPlugin} from '@bjelser/tts-openai';
export default {plugins: [openaiTtsPlugin, openaiTranslationPlugin]};
```

```bash
bunx docent build kubernetes-architecture \
  --lang es \
  --voice nova \
  --translation-provider openai
# → out/kubernetes-architecture-es.mp4, narrated by OpenAI's `nova` voice
```

### Japanese

Kokoro can't speak Japanese — register a multilingual TTS provider or
accept the English-accented fallback:

```bash
bunx docent build kubernetes-architecture --lang ja --voice af_heart
# → out/kubernetes-architecture-ja.mp4 (translated, English-accented)
```

For genuine Japanese narration:

```ts
// docent.config.ts (with a self-hosted XTTS provider)
import {xttsTtsPlugin} from '@example/tts-xtts';
import {openaiTranslationPlugin} from '@bjelser/tts-openai';
export default {plugins: [xttsTtsPlugin, openaiTranslationPlugin]};
```

```bash
bunx docent build kubernetes-architecture --lang ja --voice xtts-ja-female
# → out/kubernetes-architecture-ja.mp4, natively-Japanese voice
```

### Mandarin

Same shape, different lang code:

```bash
bunx docent build kubernetes-architecture --lang zh
# → out/kubernetes-architecture-zh.mp4
```

## What gets translated

The translate stage walks `spec.scenes[].beats[]` and translates each beat's
`narration` field. Everything else stays in the source language by default —
scene titles, node labels, kicker text, recap points. That's the right call
for most films: the *narration* is the prose; the *visuals* are typographic
content where translation often hurts more than helps (a typeset code
sample, a UI screenshot caption, a brand name).

If you need to translate visual content, a follow-on iteration could add a
`scene.translate?: string[]` field listing which scene-level keys to route
through the provider. Today, edit the spec directly or fork it.

## Known limits and friction

- **Caching.** Every build calls the provider for every beat — no cache
  layer is shipped today. For an iterative dev loop on a 30-beat film with
  a paid API, this gets expensive. A future iteration could hash
  `(text, targetLang, provider, model)` and short-circuit on a hit; that
  layer would sit at the CLI level (the kit's cascade should stay pure).
- **Multi-language single-build.** Today `--lang` is single-valued. If you
  want es+fr+ja off one spec, run `docent build` thrice; each gets a
  distinct output. A `--lang es,fr,ja` flag or a `meta.languages: string[]`
  list would let one cascade fan out — at the cost of needing to think
  about audio-dir naming (audio currently uses `audio/<filmId>/`, not
  `audio/<filmId>-<lang>/`).
- **Partial translation failures.** A single beat that throws from the
  provider hard-fails the cascade today. Soft-fall-through (translate what
  you can, leave the rest source-language with a per-beat warning) would
  rescue a mostly-translatable film from a single bad beat. The provider
  shape supports this — implement it in your `translate()` method.
- **Right-to-left languages.** Arabic, Hebrew, Persian have visual
  consequences a translation pipeline alone can't address — the rendered
  text needs `direction: rtl` styling for chrome scenes (`frame`, `recap`)
  that surface narration in-frame. Today the renderer treats every string
  as LTR. RTL support is a render-side concern; the translation pipeline
  produces RTL strings cleanly, the visual flow needs work.
