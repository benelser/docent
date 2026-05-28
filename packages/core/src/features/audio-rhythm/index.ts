// audio-rhythm feature — the per-beat silence trim + `pace` knob, expressed
// as a FeaturePlugin per the §4.5 contract.
//
// In v1 this plugin is intentionally MOSTLY DECLARATIVE: it doesn't have a
// runtime hook of its own yet. Registering it gates "audio rhythm is on"
// semantically — the actual mechanics live where they need the raw samples
// (the kokoro provider's inline trim) or the per-beat metadata (the
// cascade's TTS stage). Both consumers import `computeBeatTiming` from this
// module so the per-pace ceilings live in ONE place.
//
// The `wrapRender` hook is a pass-through stub — present so the plugin's
// presence is discoverable to introspection tooling, and ready to take on
// real rhythm work (e.g. cross-beat envelope shaping, ducking, gap-aware
// captions) without a protocol bump.

import type {FeaturePlugin, SceneOutput, RenderContext} from '@bjelser/kit';

import {
  computeBeatTiming,
  LEADING_SILENCE_CEIL_MS,
  TRAILING_SILENCE_CEIL_MS,
} from './timing';
import type {BeatTiming} from './timing';

export const audioRhythmFeature: FeaturePlugin = {
  kind: 'feature',
  name: 'audio-rhythm',
  version: '1.0.0',

  /**
   * Pass-through stub. Real rhythm work happens upstream of render (in the
   * kokoro provider's inline silence trim + the cascade's TTS stage). When
   * the rhythm feature grows render-time concerns — beat-aligned captions,
   * cross-scene ducking, etc. — they land here.
   */
  wrapRender(rendered: SceneOutput, _ctx: RenderContext): SceneOutput {
    return rendered;
  },
};

// Re-export the timing utilities so consumers (kokoro provider, cascade
// TTS stage) import them from the feature itself — keeping the rhythm
// policy in one place.
export {
  computeBeatTiming,
  LEADING_SILENCE_CEIL_MS,
  TRAILING_SILENCE_CEIL_MS,
};
export type {BeatTiming};

export default audioRhythmFeature;
