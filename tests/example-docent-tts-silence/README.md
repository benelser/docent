# @example/docent-tts-silence

The smallest realistic **third-party `TtsProviderPlugin`** — what a community-authored TTS adapter looks like. Produces synthetic WAV silence sized to narration length. Useful for:

- **Teaching** the TTS protocol shape without external API keys
- **CI runs** that need the full cascade (validate → tts → render) without burning real synthesis quota
- **Forking** as the starter for a real adapter (Piper, Coqui, in-process Whisper, custom model)

The 3 first-party packs (`@docent/tts-openai`, `@docent/tts-elevenlabs`, `@docent/tts-compatible`) follow the same shape — replace `synth` with the real call.

## What it ships

| Plugin | Kind | Provider id | Voice id | Capabilities |
|---|---|---|---|---|
| `@example/docent-tts-silence` | `tts` | `silence` | `silence` | `nativeAlignment: 'none'`, `streaming: false`, `ssml: false`, `voiceCloning: false`, `local: true` |

The `synth` implementation:

1. Estimate seconds from text at 150 wpm
2. Build a PCM16 / 24 kHz mono WAV of that duration
3. Return `{ audio, mediaType: 'audio/wav', durationMs, alignment: [], alignmentSource: 'none' }`

That's the whole adapter — `<100 lines` of TypeScript.

## Run it

```bash
bun ../../packages/cli/src/index.ts build silence-demo --scale 0.25
```

Note: **no `--skip-tts` flag**. The cascade runs the silence TtsProvider for each beat. The resulting mp4 has a silent AAC audio track sized to the cumulative beat duration.

## What to study

- `src/index.ts` — the full plugin (≈100 lines). Notice:
  - `TtsCapabilities` declared once and reused by both the plugin shape and the runtime instance.
  - `create(ctx)` is async and could throw `TtsProviderError` if credentials/config were missing. The silence pack needs nothing, so `create` is trivial.
  - `synth(text, options)` returns the kit's `TtsSynthesisResult` shape — `audio: Uint8Array`, `mediaType: 'audio/wav'`, `durationMs`, `alignment: WordAlignment[]` (empty for chunk-level providers), `alignmentSource: 'native' | 'aligner' | 'none'`.
  - `listVoices()` returns the available voices for `docent` introspection.
- `docent.config.ts` — registers the plugin alongside `@docent/core`.

## How a real adapter differs

Replace these three things to ship a real provider:

1. **`silenceCapabilities`** — declare what your provider actually supports. If you stream, set `streaming: true`. If you support SSML, set `ssml: true`. The `nativeAlignment` field is what `ScenePlugin.requiresTtsCapabilities` cross-binds against — declare it honestly.
2. **`synth(text, options)`** — replace `buildSilentWav` with an API call (OpenAI / ElevenLabs / Piper subprocess / in-process Whisper). Return real audio bytes.
3. **`create(ctx)`** — read env vars / config from `ctx`. Throw `TtsProviderError` BEFORE the cascade burns minutes on a render if credentials are missing.

The remaining contract (registration via `engine.use()`, the cascade calling `synth` per beat, the narration feature mounting `<Audio>` per clip) doesn't change — your adapter participates in the same path the 4 shipping ones use.

## License

MIT
