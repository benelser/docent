# @docent/tts-compatible

OpenAI-compatible TTS provider for `@docent/kit`. Drives any TTS endpoint that speaks the OpenAI `/v1/audio/speech` shape — self-hosted Kokoro servers, OpenWebUI endpoints, or any community-built OpenAI-compatible bridge.

This is the lever for callers who need PyTorch Kokoro parity or any other server-side TTS not directly wrapped by a dedicated `@docent/tts-*` package.

## Install

```bash
npm install @docent/tts-compatible
# or
bun add @docent/tts-compatible
```

No peer dependency — this provider talks to its endpoint via plain `fetch`.

## Use

```ts
// docent.config.ts
import {corePlugins} from '@docent/core';
import {compatibleTtsProvider} from '@docent/tts-compatible';

export default {
  plugins: [...corePlugins, compatibleTtsProvider],
};
```

```json
// films/my-film.json
{
  "meta": {
    "voice": {
      "provider": "openai-compatible",
      "endpoint": "http://localhost:8000/v1/audio/speech",
      "voice": "af_heart",
      "model": "kokoro"
    }
  }
}
```

If the endpoint expects an `Authorization: Bearer …` header, set `OPENAI_COMPATIBLE_API_KEY`.

## Capabilities

- `nativeAlignment`: `null` (chunk-level only — OpenAI-shaped endpoints don't expose word timings)
- `voiceCloning`: depends on the underlying server
- `languages`: depends on the underlying server

## License

MIT
