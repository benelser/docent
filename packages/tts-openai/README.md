# @docent/tts-openai

OpenAI TTS provider for `@docent/kit`. Synthesizes per-beat narration audio against OpenAI's `tts-1` / `tts-1-hd` / `gpt-4o-mini-tts` models.

## Install

```bash
npm install @docent/tts-openai openai
# or
bun add @docent/tts-openai openai
```

`openai` is a **peer dependency** — bring your own SDK version.

## Use

Register the provider with the engine, set `OPENAI_API_KEY`, and reference it from your film's `meta.voice` block.

```ts
// docent.config.ts
import {corePlugins} from '@docent/core';
import {openaiTtsProvider} from '@docent/tts-openai';

export default {
  plugins: [...corePlugins, openaiTtsProvider],
};
```

```json
// films/my-film.json
{
  "meta": {
    "voice": {
      "provider": "openai",
      "voice": "alloy",
      "model": "tts-1-hd"
    }
  }
}
```

## Capabilities

- `nativeAlignment`: `null` (chunk-level only — no native word timings)
- `voiceCloning`: `false`
- `languages`: per OpenAI's published list

If your scene declares `requiresTtsCapabilities: { nativeAlignment: 'word' }`, this provider will fail the cross-bind check at validation. Use a provider that supports word alignment (or remove the requirement).

## License

MIT
