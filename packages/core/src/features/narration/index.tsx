// narrationFeature — the per-beat narration overlay, expressed as a
// FeaturePlugin (see plugin-architecture-strategy.md §4.5).
//
// Wave A2 wires this through end-to-end: the cascade's TTS stage persists
// per-beat audio bytes under `<publicDir>/audio/<filmId>/`, the schedule
// threads each beat's audio path onto the timeline slot, and this plugin's
// `wrapsScenes` component mounts inside every scene's `<Sequence>` to lay
// the corresponding `<Audio>` overlays on the scene track.
//
// Hooks used today: `wrapsScenes` (the audio overlay), `wrapRender` (identity
// — held open for caption/post-process layers landing later).
// Hooks reserved for later phases: `injectStyleTokens` (caption typography),
// `registerModifiers` (R3 microsyntax).

import React from 'react';

import type {
  BeatTimelineSlot,
  FeaturePlugin,
  SceneFeatureProps,
  SceneOutput,
} from '@docent/kit';

import {Narration, type NarrationBeat} from './component.js';

export {Narration} from './component.js';
export type {NarrationBeat, NarrationProps} from './component.js';

/**
 * Composition-side adapter: turn each `BeatTimelineSlot` into the shape the
 * legacy `Narration` component consumes. The `audio` field arrives from the
 * persisted tts manifest threaded through `buildFrameSchedule`.
 */
const NarrationOverlay: React.FC<SceneFeatureProps> = ({ts, style}) => {
  const beats: NarrationBeat[] = ts.beats.map((b: BeatTimelineSlot) => ({
    audio: b.audio ?? null,
    from: b.startFrame - ts.startFrame,
    durationInFrames: b.frames,
    ...(b.beat.id !== undefined ? {id: b.beat.id} : {}),
  }));
  return <Narration beats={beats} style={style} />;
};

export const narrationFeature: FeaturePlugin = {
  kind: 'feature',
  name: 'narration',
  version: '1.0.0',

  // The composition mounts this component inside every scene's `<Sequence>`
  // alongside the scene renderer. The component lays one `<Audio>` per
  // beat with a synthesized clip; beats without audio render nothing.
  wrapsScenes: NarrationOverlay,

  // Held open as a no-op — a future revision (captions, post-mix volume
  // ducking) will move here. Today the audio overlay is enough.
  wrapRender(rendered: SceneOutput, _ctx): SceneOutput {
    return rendered;
  },
};

export default narrationFeature;
