// Per-beat silence trim — ported from the historical `pipeline/tts.py`. Lives
// in the TTS abstraction so the default kokoro provider can apply it inline
// (preserving byte-comparability with the Python sidecar's output).
//
// The contract — verbatim from the Python docstring:
//
//   By default, leading and trailing silence are trimmed inline per beat's
//   `pace` knob — Kokoro routinely emits a few hundred ms of trailing
//   silence which, stacked on the engine's per-beat TAIL breath, produces an
//   "awkward pause" between beats. The trim ceiling is intentionally
//   conservative (we KEEP a floor of speech-shaped breath) and `pace: hold`
//   opts out entirely.
//
// Amplitude threshold for "this sample is speech, not silence." Kokoro emits
// clean (~no-noise) silence below ~1e-3; 0.01 gives plenty of headroom.

export const LEADING_SILENCE_CEIL_MS = 50;

// Per-pace trailing ceilings — `hold` opts out (null = keep all silence).
export const TRAILING_SILENCE_CEIL_MS: Record<
  'hold' | 'settle' | 'normal' | 'brisk' | 'default',
  number | null
> = {
  brisk: 80,
  normal: 150,
  default: 150,
  settle: 250,
  hold: null,
};

export const SILENCE_AMPLITUDE = 0.01;

/**
 * Index of first and (last+1) samples whose |amp| crosses SILENCE_AMPLITUDE.
 * Returns `[start, end]` such that `samples.subarray(start, end)` is the
 * speech-bearing core. If the entire clip is below threshold, returns
 * `[0, samples.length]` — a silent clip shouldn't happen for real narration.
 */
export const silenceBounds = (samples: Float32Array): [number, number] => {
  const n = samples.length;
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (Math.abs(samples[i]) > SILENCE_AMPLITUDE) {
      start = i;
      break;
    }
  }
  if (start < 0) return [0, n];
  let end = n;
  for (let i = n - 1; i >= start; i--) {
    if (Math.abs(samples[i]) > SILENCE_AMPLITUDE) {
      end = i + 1;
      break;
    }
  }
  return [start, end];
};

/**
 * Trim leading/trailing silence to per-pace ceilings. Mirrors `_trim_silence`
 * in `pipeline/tts.py` so the output is byte-comparable to the Python sidecar.
 *
 * Returns `{ trimmed, leadingMsPost, trailingMsPost, leadingMsPre,
 * trailingMsPre }`. The post-trim values are what the viewer actually hears
 * between beats; the pre-trim values are diagnostic (what the model emitted).
 */
export interface TrimResult {
  trimmed: Float32Array;
  leadingMsPost: number;
  trailingMsPost: number;
  leadingMsPre: number;
  trailingMsPre: number;
}

export const trimSilence = (
  samples: Float32Array,
  sampleRate: number,
  pace: 'hold' | 'settle' | 'normal' | 'brisk' | undefined,
): TrimResult => {
  const [start, end] = silenceBounds(samples);
  const leadingMsPre = (start / sampleRate) * 1000.0;
  const trailingMsPre = ((samples.length - end) / sampleRate) * 1000.0;

  const leadCeilSamples = Math.floor((LEADING_SILENCE_CEIL_MS / 1000.0) * sampleRate);
  const newStart = Math.max(0, start - leadCeilSamples);

  const ceilKey = pace ?? 'default';
  const tailCeilMs = TRAILING_SILENCE_CEIL_MS[ceilKey];
  let newEnd: number;
  if (tailCeilMs === null) {
    newEnd = samples.length;
  } else {
    const tailCeilSamples = Math.floor((tailCeilMs / 1000.0) * sampleRate);
    newEnd = Math.min(samples.length, end + tailCeilSamples);
  }

  const trimmed = samples.subarray(newStart, newEnd);
  const leadingMsPost = ((start - newStart) / sampleRate) * 1000.0;
  const trailingMsPost = ((newEnd - end) / sampleRate) * 1000.0;

  return {trimmed, leadingMsPost, trailingMsPost, leadingMsPre, trailingMsPre};
};

/**
 * Write a Float32 PCM stream to a WAV file (mono, 16-bit PCM). Used by the
 * kokoro provider — the Python sidecar wrote .wav too, so this preserves the
 * byte shape one layer up the cascade.
 */
export const encodeWav = (samples: Float32Array, sampleRate: number): Uint8Array => {
  const numSamples = samples.length;
  const byteRate = sampleRate * 2; // mono, 16-bit
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // 16-bit PCM samples (clamp to [-1..1] and scale).
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
};

const writeString = (view: DataView, offset: number, str: string): void => {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
};
