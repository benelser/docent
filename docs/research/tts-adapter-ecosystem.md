# TTS adapter ecosystem — research brief

**Date:** 2026-05-26
**Author:** docent research agent
**Status:** research only, no implementation
**Question:** Does a "LiteLLM-for-TTS" pattern exist in the bun/TypeScript ecosystem, and if not, what should docent's adapter look like?

---

## 0. TL;DR

- **A viable, mature, batteries-included "LiteLLM-for-TTS" in TS does not exist yet.** The closest in spirit is `js-tts-wrapper` (25+ engines, MIT, abstract base class, word boundaries), but it is *niche* — ~112 weekly npm downloads, v0.1.81, single-maintainer. The closest by *adoption* is **Vercel AI SDK's `experimental_generateSpeech`** (millions of weekly downloads via the `ai` package, but minimal feature surface: no streaming, no alignment).
- **There is, however, a de facto interface standard**: OpenAI's `POST /v1/audio/speech` request shape — `{ model, input, voice, response_format, speed, instructions }` — has been adopted by LiteLLM, TTS.ai, openai-edge-tts, and several proxies. Adopting that as the *wire* shape buys docent the broadest "swap-the-base-url" compatibility for free.
- **Kokoro is already available as `kokoro-js`** (~52K weekly downloads, Apache-2.0, same `af_heart` voice). Docent can shed the Python subprocess for the default provider and unify everything behind a single TypeScript interface.
- **The hard part is not the providers — it's the per-beat timing.** Providers split into three tiers: native character/word timestamps (ElevenLabs, Cartesia, Azure, Polly neural, Google), no timestamps at all (OpenAI, Hume, LMNT, Kokoro), and streaming-only timing (Deepgram). Docent needs a *fallback alignment strategy* — likely Whisper-based forced alignment on rendered audio — to make any provider work for beat-synchronised animation.

## 1. Section headings

0. TL;DR
1. Section headings (this section)
2. Existing unified TTS libraries surveyed
3. Provider matrix — API shape, pricing, alignment, license
4. The common interface — what every adapter must expose
5. The de facto wire spec — OpenAI `/v1/audio/speech`
6. The alignment problem and the fallback strategy
7. Recommended adapter shape for docent
8. Integration touch-points in the docent pipeline
9. Open questions before building
10. Sources

## 2. Existing unified TTS libraries surveyed

### 2.1 `js-tts-wrapper` — the closest analogue to LiteLLM-for-TTS

| Field | Value |
|---|---|
| Package | `js-tts-wrapper` |
| Author | willwade (AACTools) |
| License | MIT |
| Latest | 0.1.81 (2026-04-21) |
| Weekly downloads | 112 |
| Stars | 19 |
| Engines | 25+ — Azure, Google, Polly, OpenAI, ElevenLabs, IBM Watson, PlayHT, Cartesia, Deepgram, Hume, xAI, Fish Audio, Mistral, Murf, Resemble, plus offline: SherpaOnnx, eSpeak NG, Windows SAPI |
| Abstract base | `AbstractTTSClient` |
| Word boundaries | yes — from `synthToBytestream()` and the `'boundary'` event |
| Local providers | yes — SherpaOnnx, eSpeak NG, SAPI |

The abstract interface (simplified from the repo):

```ts
abstract class AbstractTTSClient {
  constructor(protected credentials: TTSCredentials);
  protected abstract _getVoices(): Promise<UnifiedVoice[]>;
  abstract synthToBytes(text: string, options?: SpeakOptions): Promise<Uint8Array>;
  abstract synthToBytestream(text: string, options?: SpeakOptions): Promise<{
    audioStream: ReadableStream<Uint8Array>;
    wordBoundaries: Array<{ text: string; offset: number; duration: number }>;
  }>;
}
```

**Assessment.** The *shape* is right — abstract base, unified voice model, word boundaries returned as a structured side-channel from streaming synthesis, format conversion handled in the wrapper. The *maturity* is not. 112 weekly downloads on a 25-provider matrix means most engine paths are untested in production. Docent should treat js-tts-wrapper as a **reference implementation to learn from**, not a dependency to take on. The interface design is worth copying almost verbatim.

### 2.2 Vercel AI SDK — `experimental_generateSpeech`

| Field | Value |
|---|---|
| Package | `ai` |
| Weekly downloads | 13,030,359 |
| Status | experimental |
| Providers | OpenAI (`tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`), ElevenLabs, LMNT, Hume, Deepgram, Google |
| Streaming | **no** |
| Word timestamps | **no** |
| Voice cloning | not exposed |

```ts
const { audio } = await generateSpeech({
  model: openai.speech('tts-1'),
  text: 'Hello, world!',
  voice: 'alloy',
});
// audio.uint8Array, audio.base64, audio.mediaType
```

**Assessment.** This is the *adoption* leader by orders of magnitude — it ships in the SDK every TS dev already has installed. But for docent it's a poor fit: the SDK explicitly returns *a buffer, never an alignment*, and never streams. A community discussion on the Vercel repo flags the latency as "unacceptable for voice-to-voice pipelines" and asks for streaming support — not yet landed. Docent can *render through* AI SDK for the providers it covers, but must still solve alignment itself.

### 2.3 Mastra — `MastraVoice`

| Field | Value |
|---|---|
| Class | `MastraVoice` (abstract) |
| Engines | OpenAI, Azure, ElevenLabs, PlayAI, Speechify, Sarvam, Murf, Deepgram |
| `speak()` returns | `Promise<NodeJS.ReadableStream | void>` (Node stream, not Web stream) |
| Word boundaries | **not in the documented interface** |
| Per-package install | yes — `@mastra/voice-openai`, etc. |

**Assessment.** Cleaner per-provider package split than js-tts-wrapper, but the interface throws away the alignment data. The Node-stream return value is also a portability tax in a Bun-first project that prefers Web streams.

### 2.4 `tts-ai`

Three providers (OpenAI, Google, ElevenLabs), last published March 2024, 29 weekly downloads. Stale. Mentioned for completeness; not a candidate.

### 2.5 `@lobehub/tts`, `kokoro-js`, single-provider SDKs

- `@lobehub/tts` — React-hooks-shaped wrapper, opinionated for browser UI; not a backend adapter.
- `kokoro-js` — **single-provider, Kokoro only**, but critical for docent: runs the same `af_heart` voice in Node/Bun via `onnxruntime-node` (or WebGPU/WASM in-browser). 52K weekly downloads. Apache-2.0. Exposes a `tts.stream()` API that yields `{ text, phonemes, audio }` per chunk — phoneme info exists at the chunk boundary but not as a per-word time array.
- `elevenlabs` (188K weekly), `openai` (22M weekly), `@deepgram/sdk` (560K weekly), `@cartesia/cartesia-js` (41K weekly) — first-party single-provider SDKs are well-maintained and full-featured; **they are what every unified wrapper actually calls under the hood**.

### 2.6 LiteLLM (Python, for reference)

LiteLLM's `/audio/speech` endpoint supports OpenAI, Azure OpenAI, Vertex AI, AWS Polly, ElevenLabs, MiniMax. Model string format `"provider/model-name"` (e.g. `"openai/tts-1"`, `"vertex_ai/gemini-2.5-flash-preview-tts"`). It's an OpenAI-compatible proxy — write once against `/v1/audio/speech`, switch providers via the model string. No native word-timestamp surface; LiteLLM is a *wire-level* unifier, not a timing one.

## 3. Provider matrix

| Provider | Models / voices | Streaming | Alignment | SSML | Voice cloning | Best latency | Price /1M chars | License of client |
|---|---|---|---|---|---|---|---|---|
| **OpenAI** | `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` (instructions param), 6 voices | HTTP chunked | **none** | none | no | ~0.5s TTFB | $15 (tts-1), $30 (tts-1-hd), ~$12/1M audio tokens (gpt-4o-mini) | MIT |
| **ElevenLabs** | v1/v2/v2.5/v3 multilingual, Flash, Turbo, 1000+ community voices, custom clones | HTTP, WebSocket | **character-level** via `/with-timestamps` and `stream/with-timestamps` | partial | yes (instant + pro) | ~0.4s TTFB; Flash ~0.3s | tier-credit; ~$50–180/1M chars depending on plan | MIT |
| **Google Cloud TTS** | Standard, WaveNet, Neural2, Studio, Chirp 3 HD, Gemini-TTS; 40+ langs, 220+ voices | gRPC + HTTP chunked | **per-word `timepoints`** via SSML marks | full | no (Voice Cloning beta separate API) | ~0.4s | $4 (std), $16 (WaveNet/Neural2), $30 (Journey), $160 (Studio) | Apache-2.0 |
| **Amazon Polly** | Standard, Neural, Long-Form, Generative, ~100 voices | HTTP chunked | **word-level speech-marks JSON** (neural; **not** generative) | full | no | ~0.3s | $4 (std), $16 (neural), $30 (generative), $100 (long-form) | Apache-2.0 |
| **Azure Speech** | Neural, Neural HD, Dragon HD Omni, Turbo; SSML express-as styles | HTTP + WebSocket | **word boundary events** synchronized with audio playback | full | yes (Custom Neural Voice) | ~0.3s | $22 (Neural HD, as of Mar 2026; was $30) | MIT |
| **Cartesia Sonic** | Sonic 3, Sonic 2.0, Sonic Turbo | WebSocket-first | **`word_timestamps`** via `add_timestamps` flag | none | yes (10-second clones + Pro) | **~90 ms TTFA** | $46.70/1M chars (Sonic 2/Turbo) | MIT |
| **Deepgram Aura** | Aura-2, Aura | WebSocket-first | streaming flush boundaries (not per-word) | partial | no | **~90–200ms TTFB** | $30/1M chars ($0.030/1K) | MIT |
| **Hume** | Octave TTS (emotional control) | HTTP | no | partial | yes | ~0.5s | not publicly tabulated | MIT |
| **LMNT** | aurora, blizzard | HTTP, WebSocket | no | none | yes | ~0.4s | tiered | MIT |
| **Kokoro (local)** | 82M-param ONNX, 30+ voices (`af_heart`, `am_adam`…) | chunk-yielding generator | phoneme list per chunk, no per-word ms | none | no | depends on hardware (~real-time on CPU) | **free, Apache-2.0** | Apache-2.0 |
| **Anthropic** | none shipped | — | — | — | — | — | — | — |

**Key takeaways from the matrix:**

1. **Alignment splits the field cleanly.** ElevenLabs, Google, Polly-neural, Azure, and Cartesia all expose per-word (or finer) timing as first-class API output. OpenAI, Hume, LMNT, Kokoro, and Polly-generative do not. Deepgram is streaming-only and exposes flush boundaries, not words.
2. **Pricing varies 40x** across the matrix, from Google Standard at $4/M characters to Polly Long-Form at $100/M. For docent's typical film (~1,500 words ≈ 9,000 chars), even the most expensive provider is ~$1/film — *cost is not the gating factor*.
3. **Latency is irrelevant for docent.** Docent renders audio offline, ahead of video. Sub-100 ms TTFB is a feature for voice agents, not for pre-rendered films. Docent should weight *quality, alignment, and voice availability* above latency.
4. **OpenAI is the cheapest paid path with the worst alignment story.** It also happens to be the de facto wire spec everyone else copies (see §5).
5. **License is uniform** — every official client SDK is MIT or Apache-2.0. No licensing landmines in any adapter.

## 4. The common interface

Across every provider surveyed, the irreducible common surface is:

```text
Required input
  text: string                    (utterance)
  voice: string                   (provider-scoped voice id)

Optional input
  format: 'mp3' | 'wav' | 'pcm' | 'opus' | 'flac' | 'aac'
  sampleRate: number              (8000 / 16000 / 22050 / 24000 / 44100 / 48000)
  speed: number                   (0.25..4.0, default 1.0)
  language: string                (BCP-47)
  ssml: boolean                   (true if text is SSML)

Required output
  audio: Uint8Array | ReadableStream<Uint8Array>
  mediaType: string               ('audio/mpeg', 'audio/wav', ...)

Optional output (the docent-critical one)
  alignment?: Array<{ text: string; startMs: number; endMs: number }>
  durationMs?: number
```

**Per-character vs per-word alignment.** ElevenLabs and Cartesia expose *character*-level timing; Google, Polly, Azure expose *word*-level. The adapter should normalise to word-level alignment in its output shape — character-level can always be aggregated into words by the wrapper; the reverse is impossible without a re-aligner.

**Beyond the common core**, each provider has unique knobs (ElevenLabs' `stability`/`similarity_boost`/`style`, OpenAI `instructions`, Cartesia `emotion`, etc.). Following the Vercel AI SDK precedent, these belong in a typed `providerOptions: { elevenlabs?: {...}, openai?: {...} }` escape hatch.

## 5. The de facto wire spec — OpenAI `/v1/audio/speech`

Multiple proxies, paid services (TTS.ai, openai-edge-tts), and aggregators (LiteLLM) implement an OpenAI-compatible `/v1/audio/speech` endpoint. The request shape is:

```http
POST /v1/audio/speech
{
  "model": "tts-1" | "tts-1-hd" | "gpt-4o-mini-tts",
  "input": "text to speak",
  "voice": "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | string,
  "response_format": "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm",
  "speed": 0.25..4.0,
  "instructions": "speak in a friendly tone",   // gpt-4o-mini-tts only
  "stream_format": "audio" | "sse"              // sse for incremental
}
```

Response: raw audio bytes (or SSE chunks). **No alignment surface in the spec.**

**Implication for docent.** Adopting OpenAI-shape requests at the *wire* layer lets users point docent at any OpenAI-compatible TTS proxy (LiteLLM, TTS.ai, a self-hosted openai-edge-tts) with a base URL flip. That's a high-leverage zero-cost compatibility — but it does *not* solve alignment, and so cannot be the only adapter shape.

## 6. The alignment problem and the fallback strategy

Docent's pipeline currently times beats by *clip duration only* — the manifest stores `clipSeconds` per beat and Remotion plays each beat's mp3 as a black box. That works today because each beat is a self-contained narration unit; per-word sync would unlock new scene grammar (highlight-on-narration, syllable-aligned camera moves, karaoke-style passage scenes).

Across providers, alignment availability is three-tiered:

1. **Native, per-word** — ElevenLabs, Google, Polly-neural, Azure, Cartesia (returned in the same response as audio).
2. **None** — OpenAI, Hume, LMNT, Kokoro, Polly-generative.
3. **Streaming-only proxies** — Deepgram (chunk boundaries are not word boundaries).

**The fallback.** For tier-2 providers, run forced alignment on the rendered audio. The state of the art is **WhisperX** (Python, MIT, sub-100ms accuracy via wav2vec2 phoneme alignment) — perfectly suited because docent *already knows the text* (it generated it), turning a transcription problem into a forced-alignment problem. The cost: a few hundred ms of CPU per beat at render time. Docent already runs a Python sidecar for Kokoro, so adding `whisperx` to the same `.venv` is a small step.

The alignment surface then becomes a provider capability flag:

```ts
{
  capabilities: {
    nativeAlignment: 'character' | 'word' | 'chunk' | 'none',
    streaming: boolean,
    ssml: boolean,
    voiceCloning: boolean
  }
}
```

When `nativeAlignment === 'none'`, the adapter delegates to a project-level `aligner` (Whisper-based) before returning. When `'character'`, it aggregates to words.

## 7. Recommended adapter shape for docent

The right shape is **a thin docent-owned interface that wraps single-provider SDKs**, not a dependency on `js-tts-wrapper`. Reasons: js-tts-wrapper is too immature to bet a build on; Vercel AI SDK can't carry alignment; Mastra throws away alignment and ties us to Node streams. The interface itself is a 30-line file. We can copy the *shape* of js-tts-wrapper's `AbstractTTSClient` while owning the implementation.

### 7.1 The interface

```ts
// packages/engine/src/tts/types.ts

export interface TtsSynthesisOptions {
  /** Provider-scoped voice id (e.g. 'af_heart', 'alloy', '21m00Tcm4TlvDq8ikWAM'). */
  voice: string;
  /** Output container; provider must convert if it doesn't natively support. */
  format?: 'mp3' | 'wav' | 'pcm';
  /** Output sample rate in Hz. Default 24000 to match current docent pipeline. */
  sampleRate?: number;
  /** 0.25..4.0; default 1.0. */
  speed?: number;
  /** BCP-47 language. Provider-specific defaults. */
  language?: string;
  /** Whether `text` is SSML. Provider must reject if it can't honor it. */
  ssml?: boolean;
  /** Provider-specific escape hatch — typed per provider, opaque here. */
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
}

export interface WordAlignment {
  text: string;       // the word, as it should be spoken (matches input text)
  startMs: number;    // start time relative to clip start, post-trim
  endMs: number;
}

export interface TtsSynthesisResult {
  audio: Uint8Array;            // the rendered clip, in `format`
  mediaType: string;            // e.g. 'audio/mpeg'
  durationMs: number;
  /** Word-level alignment. Empty array if neither provider nor aligner produced one. */
  alignment: WordAlignment[];
  /** How the alignment was sourced — provenance matters for depthcheck. */
  alignmentSource: 'native' | 'aligner' | 'none';
}

export interface TtsProvider {
  readonly id: string;                         // 'kokoro', 'openai', 'elevenlabs', ...
  readonly capabilities: {
    nativeAlignment: 'word' | 'character' | 'chunk' | 'none';
    streaming: boolean;
    ssml: boolean;
    voiceCloning: boolean;
    local: boolean;                            // true for Kokoro, eSpeak, etc.
  };

  /** Render one utterance to a complete clip. Sync because docent renders offline. */
  synth(text: string, options: TtsSynthesisOptions): Promise<TtsSynthesisResult>;

  /** Enumerate available voices (cached by the engine). */
  listVoices(): Promise<Array<{ id: string; name: string; language: string; gender?: string }>>;
}
```

Notes on shape:

- **No streaming method.** Docent renders offline. A future `synthStream()` can be added when a use case appears (e.g. live captioning preview in the studio UI).
- **`alignment` always present in the result, possibly empty.** Empty array with `alignmentSource: 'none'` is a valid, observable state — downstream code can grade on this.
- **Provider exposes `capabilities` as a first-class field**, so docent's pipeline can decide upfront whether to dispatch to the Whisper aligner.

### 7.2 Concrete providers

Five adapters cover the realistic short list:

| Adapter | Underlying SDK | Notes |
|---|---|---|
| `KokoroProvider` | `kokoro-js` | The new FOSS default; replaces the Python subprocess. Voice ids match current docent specs (`af_heart`). No alignment — delegates to aligner. |
| `OpenAiSpeechProvider` | `openai` | Implements `gpt-4o-mini-tts` and `tts-1`. Honors `instructions` via `providerOptions.openai.instructions`. No alignment — delegates to aligner. |
| `ElevenLabsProvider` | `elevenlabs` | Calls `/with-timestamps`. Aggregates character-level → word-level. Honors `stability`/`similarity_boost`/`style` via `providerOptions.elevenlabs`. |
| `CartesiaProvider` | `@cartesia/cartesia-js` | Uses `add_timestamps: true`. Native word alignment. |
| `OpenAiCompatibleProvider` | `fetch` | Generic adapter for any OpenAI `/v1/audio/speech`-compatible endpoint — TTS.ai, LiteLLM proxy, openai-edge-tts, self-hosted. Configured by `baseUrl + apiKey + model`. No alignment. |

Google, Azure, Polly, Deepgram are second-wave; pattern is the same.

### 7.3 The fallback aligner

```ts
// packages/engine/src/tts/aligner.ts
export interface ForcedAligner {
  align(audio: Uint8Array, text: string, lang?: string): Promise<WordAlignment[]>;
}
```

Initial implementation: `WhisperXAligner` — Python subprocess calling `whisperx`, fed audio + the known transcript. Run once per beat when the chosen provider's `capabilities.nativeAlignment === 'none'`. Cached alongside the mp3.

### 7.4 Local providers and the Python question

Kokoro can now be pure TypeScript via `kokoro-js`. Two paths:

- **A. Drop Python entirely** — port `pipeline/tts.py` to `pipeline/tts.ts` calling `kokoro-js`. Loses: torch-based silence trimming (replace with `web-audio-api` or `audio-decode` + a tiny RMS pass). Gains: one runtime, faster cold start, no Python install, fits the user's bun preference.
- **B. Keep Python for the aligner only** — Kokoro through `kokoro-js`, but keep a `.venv` for `whisperx` (the aligner) and `ffmpeg` (loudnorm). Realistic short term.

Recommended: **B for now, A as a follow-up** once whisperx-equivalent is available in Node (Transformers.js Whisper exists and runs in Node; a Node-native aligner is feasible but not free to build).

## 8. Integration touch-points in the docent pipeline

Current state (`packages/engine/pipeline/tts.py`):

- Reads `films/<id>.json`, picks `meta.voice` (default `af_heart`).
- For each beat, calls Kokoro KPipeline, trims silence, normalises via ffmpeg, writes `public/audio/<film>/<beat>.mp3`.
- Records per-beat manifest with `clipSeconds`, `wpm`, silence ms, `pace`.

Proposed integration:

1. **Film spec — `meta.tts` block** (additive; backward-compatible):
   ```json
   "meta": {
     "voice": "af_heart",
     "tts": {
       "provider": "kokoro",         // or "openai" / "elevenlabs" / "openai-compatible"
       "model": "kokoro-82m-v1",     // optional, provider default if omitted
       "providerOptions": { ... }    // typed per provider
     }
   }
   ```
   Default: `provider: "kokoro"` to preserve current behavior verbatim. Specs that don't set `meta.tts` render exactly as they do today.

2. **Credentials — env-var-only**, never in the spec. One env var per provider, conventional names: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `CARTESIA_API_KEY`, `DEEPGRAM_API_KEY`, etc. A `DOCENT_TTS_BASE_URL` and `DOCENT_TTS_API_KEY` pair drives the `openai-compatible` adapter. Spec files commit safely.

3. **CLI override** — `docent build <id> --tts-provider openai --tts-voice nova` for one-off swaps without touching the spec. Honors the same env-var convention.

4. **Manifest schema** — additive. New fields:
   ```jsonc
   {
     "alignmentSource": "native" | "aligner" | "none",
     "alignment": [{ "text": "...", "startMs": 0, "endMs": 120 }, ...],
     "provider": "kokoro",
     "providerModel": "kokoro-82m-v1"
   }
   ```
   Existing fields (`seconds`, `clipSeconds`, `wpm`, `leadingSilenceMs`, `trailingSilenceMs`, `pace`) stay untouched. Older manifests load as before; depthcheck rules that depend on alignment skip when it's absent.

5. **Cache key** — currently the cache key is implicit (`<beat-id>.mp3` exists ⇒ cached). With multiple providers this must extend to `(provider, model, voice, text-hash)` so swapping providers invalidates correctly. Suggest a content-addressed layout `public/audio/<film>/<beat>/<sha8>.mp3` with the manifest pointing to the live SHA. The Remotion engine reads only the manifest, so it doesn't care.

6. **Depthcheck** — `narration-rhythm` rule unchanged. New rule `narration-alignment` (optional): warn when a scene that *could* benefit from word-level sync (e.g. `passage` scenes annotating prose) is being rendered through a provider with `nativeAlignment: 'none'` and no aligner configured.

## 9. Open questions before building

1. **Should the FOSS default move from Python-Kokoro to `kokoro-js`?** Pro: drops Python from the default path, single-runtime simplicity, bun-native. Con: loses the existing silence-trim numpy code (must reimplement); needs a Node ONNX runtime install (~100 MB extra in node_modules); WebGPU on macOS via Metal is patchier than CPU torch. **Recommendation: keep Python-Kokoro as the working default; add `kokoro-js` as a second adapter; flip the default later once parity is proven.**
2. **Do we ship the aligner now, or wait?** Without an aligner, switching to OpenAI/Hume/LMNT silently loses the per-beat-text timing depthcheck wants. With an aligner, we double the per-beat render cost. Cheap probe: ship the interface with `alignmentSource: 'none'` honest, leave the aligner as a follow-up, document the limitation in `meta.tts`. **Recommendation: ship interface first, alignment behind a `--align` flag once a use case lands.**
3. **Voice ids — do we normalise across providers?** Cartesia voice ids look like `a0e99841-...`; ElevenLabs like `21m00Tcm4TlvDq8ikWAM`; OpenAI like `alloy`; Kokoro like `af_heart`. A unified "docent voice" abstraction (e.g. `voice: "narrator-warm-female"` resolved per provider) is *ambitious* and probably wrong — voices don't equivalence across providers. **Recommendation: voice ids are provider-scoped strings, full stop. The spec's `meta.voice` is interpreted by the active provider.**
4. **Do we need streaming for the studio preview?** The current pipeline pre-renders. A future "type narration, hear preview instantly" studio mode wants streaming. Designing `synthStream()` now would future-proof — but YAGNI says wait. **Recommendation: defer until the studio asks for it.**
5. **Do we adopt the Vercel AI SDK as the OpenAI/ElevenLabs implementation, or call SDKs directly?** AI SDK gives us a unified upstream, free retries, and observability for the providers it covers — *at the cost of losing the alignment surface entirely* (since AI SDK throws alignment away). **Recommendation: call the first-party `openai` and `elevenlabs` packages directly; we need the alignment they return, and AI SDK can't carry it.**
6. **How do `ssml` differences get reconciled?** Google supports `<mark>` (which is how docent could *get* word timing from Google for free); OpenAI ignores all SSML; Polly-generative ignores most. A spec that uses SSML for one provider breaks on another. **Recommendation: keep narration as plain text in the spec; expose `ssml` as a `providerOptions` escape hatch. Document SSML support per provider.**
7. **Is the local-provider abstraction worth it for any provider other than Kokoro?** SherpaOnnx, eSpeak, Piper are real options for offline use. None match Kokoro's quality. **Recommendation: skip; ship Kokoro as the single local provider, revisit if users ask.**

## 10. Sources

- [tts-ai on npm](https://www.npmjs.com/package/tts-ai)
- [yousefhany77/tts-ai on GitHub](https://github.com/yousefhany77/tts-ai)
- [willwade/js-tts-wrapper on GitHub](https://github.com/willwade/js-tts-wrapper)
- [AI SDK Core: Speech](https://ai-sdk.dev/docs/ai-sdk-core/speech)
- [AI SDK Core: generateSpeech reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-speech)
- [Mastra Voice docs](https://mastra.ai/docs/voice/overview)
- [MastraVoice reference](https://mastra.ai/reference/voice/mastra-voice)
- [LiteLLM /audio/speech docs](https://docs.litellm.ai/docs/text_to_speech)
- [LiteLLM OpenAI TTS provider](https://docs.litellm.ai/docs/providers/openai/text_to_speech)
- [openai-edge-tts (OpenAI-compatible TTS proxy)](https://github.com/travisvn/openai-edge-tts)
- [OpenAI Text to Speech guide](https://platform.openai.com/docs/guides/text-to-speech)
- [ElevenLabs — Create speech with timing](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)
- [ElevenLabs — Stream speech with timing](https://elevenlabs.io/docs/api-reference/text-to-speech/stream-with-timestamps)
- [Cartesia — Text to Speech WebSocket](https://docs.cartesia.ai/api-reference/tts/websocket)
- [Cartesia Sonic product page](https://cartesia.ai/sonic)
- [Deepgram Aura WebSocket TTS](https://developers.deepgram.com/docs/tts-websocket)
- [Deepgram pricing](https://deepgram.com/pricing)
- [Google Cloud Text-to-Speech pricing](https://cloud.google.com/text-to-speech/pricing)
- [Google Cloud TTS supported voices](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types)
- [Amazon Polly pricing](https://aws.amazon.com/polly/pricing/)
- [Amazon Polly neural voices docs](https://docs.aws.amazon.com/polly/latest/dg/neural-voices.html)
- [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)
- [Azure Speech HD voices](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/high-definition-voices)
- [kokoro-js on npm](https://www.npmjs.com/package/kokoro-js)
- [kokoro.js source on GitHub](https://github.com/hexgrad/kokoro/tree/main/kokoro.js)
- [WhisperX (forced alignment)](https://github.com/m-bain/whisperx)
