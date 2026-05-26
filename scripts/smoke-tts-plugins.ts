// Smoke test for the @docent/tts-* packages.
//
// Validates the discovery story documented in C1: a user's docent.config.ts
// imports each TTS provider plugin by name and registers it via the kit's
// `Engine.use(plugin)`. We don't synthesize anything (no API keys needed) —
// the registration step alone proves the package layout works end-to-end.

import {Engine} from '@docent/kit';
import {corePlugins} from '@docent/core';
import openaiTtsPlugin from '@docent/tts-openai';
import elevenLabsTtsPlugin from '@docent/tts-elevenlabs';
import openaiCompatibleTtsPlugin from '@docent/tts-compatible';

const engine = new Engine();
engine.use(corePlugins as any);
engine.use([
  openaiTtsPlugin,
  elevenLabsTtsPlugin,
  openaiCompatibleTtsPlugin,
] as any);

// Echo a one-line summary so the smoke test is observable.
const tts = engine.tts.all();
const ids = tts.map((p) => p.providerId).sort();
console.log(`registered TTS providers: ${ids.join(', ')}`);

// Hard-assert the three new providers are present alongside kokoro.
const expected = ['elevenlabs', 'kokoro', 'openai', 'openai-compatible'];
for (const id of expected) {
  if (!engine.tts.has(id)) {
    console.error(`MISSING provider: ${id}`);
    process.exit(1);
  }
}
console.log('SMOKE OK: 4 TTS providers registered (1 default + 3 carved)');
