// docent TTS — schema-driven, plugin-based abstraction over every TTS
// provider docent can speak through. The Rig-shaped, Marp-shaped contract
// defined in docs/design/plugin-architecture.md §5 (TtsProvider interfaces)
// and §7-8 (capability flags + pipeline integration).
//
// Public surface:
//
//   - The types (TtsProvider, TtsProviderPlugin, TtsCapabilities, …) for any
//     module that needs to interact with TTS at the type level.
//   - The registry (registerTtsProvider, ttsRegistry) for any consumer that
//     needs to enumerate or construct a provider.
//   - The 4 built-in providers, registered automatically at module load:
//       - kokoro            (default — local, no creds)
//       - openai            (paid, requires OPENAI_API_KEY)
//       - elevenlabs        (paid, requires ELEVENLABS_API_KEY)
//       - openai-compatible (generic OpenAI-shaped adapter)
//
// This is a "ship only TTS" scope. The broader Marp-inspired scene/preset
// plugin architecture is a separate concern and out of scope for this work.

export type {
  TtsProvider,
  TtsProviderPlugin,
  TtsProviderContext,
  TtsCapabilities,
  TtsSynthesisOptions,
  TtsSynthesisResult,
  TtsVoice,
  WordAlignment,
  TtsBeatMetrics,
} from './types';
export {TtsProviderError} from './types';

export {ttsRegistry, registerTtsProvider} from './registry';

// Side-effect — register the built-in providers on first import of this
// module. This is the load-bearing surface; deleting these registrations
// would un-ship the built-in providers.
import {ttsRegistry} from './registry';
import {kokoroProvider} from './providers/kokoro';
import {openaiProvider} from './providers/openai';
import {elevenLabsProvider} from './providers/elevenlabs';
import {openaiCompatibleProvider} from './providers/openai-compatible';

ttsRegistry.register(kokoroProvider);
ttsRegistry.register(openaiProvider);
ttsRegistry.register(elevenLabsProvider);
ttsRegistry.register(openaiCompatibleProvider);

// Re-export the built-in plugins for advanced callers that want to compose
// them programmatically (e.g. a future plugin pack that mirrors `@docent/core`).
export {kokoroProvider, openaiProvider, elevenLabsProvider, openaiCompatibleProvider};
