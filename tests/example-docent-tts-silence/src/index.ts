// @example/docent-tts-silence — a minimal third-party TtsProvider.
//
// The smallest realistic TTS adapter a community pack can ship. Produces
// synthetic WAV silence sized to match the narration length — useful for
// CI runs, teaching the protocol shape, and renders where real audio
// isn't required but the cascade still must complete the TTS stage.
//
// This is what the FIRST community TTS plugin looks like. Real
// providers (OpenAI, ElevenLabs, Piper, Coqui, a custom in-process
// model) follow the same shape — replace `synth` with a real call.
//
// Capabilities advertised:
//   - voices: ['silence']                — only one voice; pick it via meta.tts.voice
//   - nativeAlignment: null              — chunk-level only, no word timings
//   - voiceCloning: false
//   - streaming: false
//   - ssml: false
//   - languages: null                    — null = language-agnostic
//   - costPerCharacter: 0                — free :)

import type {
  TtsCapabilities,
  TtsProvider,
  TtsProviderContext,
  TtsProviderPlugin,
  TtsSynthesisOptions,
  TtsSynthesisResult,
  TtsVoice,
} from '@docent/kit';

// Words-per-minute estimator — kept identical to the kit's per-beat
// estimator so synthetic clips match the cascade's tempo expectations.
const WPM = 150;

const estimateSeconds = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, words / (WPM / 60));
};

/**
 * Build a minimal WAV (PCM16, 24kHz mono) of `seconds` of silence.
 * Returns the bytes the cascade persists as `<publicDir>/audio/<id>.wav`.
 */
const buildSilentWav = (seconds: number): Uint8Array => {
  const sampleRate = 24000;
  const channels = 1;
  const bytesPerSample = 2; // PCM16
  const numSamples = Math.round(sampleRate * seconds);
  const dataSize = numSamples * channels * bytesPerSample;
  const fileSize = 44 + dataSize;

  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  let offset = 0;
  const writeString = (s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  };
  // RIFF header
  writeString('RIFF');
  view.setUint32(offset, fileSize - 8, true);
  offset += 4;
  writeString('WAVE');
  // fmt chunk
  writeString('fmt ');
  view.setUint32(offset, 16, true); offset += 4;            // chunk size
  view.setUint16(offset, 1, true); offset += 2;             // PCM
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * channels * bytesPerSample, true); offset += 4;
  view.setUint16(offset, channels * bytesPerSample, true); offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true); offset += 2;
  // data chunk
  writeString('data');
  view.setUint32(offset, dataSize, true); offset += 4;
  // PCM samples (left zeroed = silence)
  return new Uint8Array(buf);
};

const silenceCapabilities: TtsCapabilities = {
  nativeAlignment: 'none',
  streaming: false,
  ssml: false,
  voiceCloning: false,
  local: true,
};

const silenceProvider: TtsProvider = {
  id: 'silence',
  capabilities: silenceCapabilities,

  async synth(
    text: string,
    _options: TtsSynthesisOptions,
  ): Promise<TtsSynthesisResult> {
    const seconds = estimateSeconds(text);
    const audio = buildSilentWav(seconds);
    return {
      audio,
      mediaType: 'audio/wav',
      durationMs: Math.round(seconds * 1000),
      alignment: [],
      alignmentSource: 'none',
    };
  },

  async listVoices(): Promise<TtsVoice[]> {
    return [
      {
        id: 'silence',
        name: 'Silence',
        language: '*',
      },
    ];
  },
};

export const silenceTtsPlugin: TtsProviderPlugin = {
  kind: 'tts',
  name: '@example/docent-tts-silence',
  version: '0.1.0',
  providerId: 'silence',
  capabilities: silenceCapabilities,
  async create(_ctx: TtsProviderContext): Promise<TtsProvider> {
    return silenceProvider;
  },
};

export default silenceTtsPlugin;
