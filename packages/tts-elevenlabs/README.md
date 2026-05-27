# @docent/tts-elevenlabs

ElevenLabs TTS provider for `@docent/kit`. Synthesizes per-beat narration with ElevenLabs voices and exposes **word-level alignment** for karaoke-style passage / read-along scenes.

## Install

```bash
npm install @docent/tts-elevenlabs @elevenlabs/elevenlabs-js
# or
bun add @docent/tts-elevenlabs @elevenlabs/elevenlabs-js
```

`@elevenlabs/elevenlabs-js` is a **peer dependency** — bring your own SDK version.

## Use

```ts
// docent.config.ts
import {corePlugins} from '@docent/core';
import {elevenlabsTtsProvider} from '@docent/tts-elevenlabs';

export default {
  plugins: [...corePlugins, elevenlabsTtsProvider],
};
```

```json
// films/my-film.json
{
  "meta": {
    "voice": {
      "provider": "elevenlabs",
      "voice": "rachel",
      "model": "eleven_multilingual_v2"
    }
  }
}
```

Set `ELEVENLABS_API_KEY` in the environment.

## Capabilities

- `nativeAlignment`: `'word'` — emits per-word timestamps the renderer can bind to highlight / karaoke effects
- `voiceCloning`: `true` (via ElevenLabs' Instant Voice Cloning)
- `languages`: per ElevenLabs' published list

A scene plugin that declares `requiresTtsCapabilities: { nativeAlignment: 'word' }` will pass the cross-bind check when this provider is registered.

## License

MIT
