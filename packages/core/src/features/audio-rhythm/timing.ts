// audio-rhythm — beat-timing utility.
//
// The `pace` knob (hold | settle | normal | brisk) is a *rhythm* directive,
// not a TTS-provider concern: it shapes how much silence the engine ALLOWS
// to bracket a beat once the speech-bearing core has been isolated. The
// historical implementation lived in `pipeline/tts.py` and was ported into
// `packages/engine/src/tts/silence.ts` so the kokoro provider could keep
// byte-comparable output with the Python sidecar.
//
// In the new plugin architecture the silence-trim itself stays in the TTS
// provider (kokoro applies it inline, where it has the raw Float32 samples)
// — what `@docent/core/features/audio-rhythm` OWNS is the *policy*: the
// per-pace ceilings, declared in one place, consumable by:
//
//   - the kokoro provider (for its inline trim),
//   - the cascade's TTS stage (for telemetry / depthcheck reporting),
//   - any future analysis tooling.
//
// The numbers below are verbatim from `packages/engine/src/tts/silence.ts`
// — changing them changes the audio rhythm of every existing film, so they
// are part of the feature's public contract.

import type {BeatPace} from '@docent/kit';

/**
 * Maximum leading silence we KEEP, regardless of pace. Kokoro tends to emit
 * a few tens of ms of pre-roll; below this ceiling we let it through so the
 * beat doesn't start on a hard speech transient.
 */
export const LEADING_SILENCE_CEIL_MS = 50;

/**
 * Per-pace ceilings for trailing silence (ms). `hold` opts out entirely
 * (the beat keeps ALL the trailing silence the synth emitted — useful when
 * the *whole point* of the beat is the silence after it lands).
 *
 * `default` is the fallback when `pace` is undefined.
 */
export const TRAILING_SILENCE_CEIL_MS: Record<
  BeatPace | 'default',
  number | null
> = {
  brisk: 80,
  normal: 150,
  default: 150,
  settle: 250,
  hold: null,
};

/**
 * The result of `computeBeatTiming` — what the consumer applies to the
 * trimmed clip. `trailingSilenceMs === null` is the `hold` opt-out: keep
 * whatever the synth emitted.
 */
export interface BeatTiming {
  /** Maximum leading silence to retain after trim (ms). */
  readonly leadingSilenceMs: number;
  /** Maximum trailing silence to retain after trim (ms); null = keep all. */
  readonly trailingSilenceMs: number | null;
}

/**
 * Compute the per-beat silence-padding policy for the given pace.
 *
 * This is the SINGLE source of truth for the `pace` → silence-ceiling map.
 * Consumers (kokoro provider, TTS stage) call this rather than referencing
 * the constants directly so the feature plugin remains the rhythm gate —
 * a future feature-flag or override can intercept here.
 */
export const computeBeatTiming = (pace: BeatPace | undefined): BeatTiming => {
  const ceilKey: BeatPace | 'default' = pace ?? 'default';
  return {
    leadingSilenceMs: LEADING_SILENCE_CEIL_MS,
    trailingSilenceMs: TRAILING_SILENCE_CEIL_MS[ceilKey],
  };
};
