// Narration — the per-beat audio overlay.
//
// MIGRATED from `packages/engine/src/components/Narration.tsx` (behaviour
// unchanged). The component lays each beat's narration audio on the scene
// timeline; when TTS has not run yet (no audio in the manifest), it renders
// nothing and the film plays silent with estimated timing.
//
// In Phase D, the engine's `Film.tsx` becomes a dispatcher that routes scenes
// through registered `FeaturePlugin.wrapRender` hooks — at which point THIS
// component is what the `narrationFeature` plugin attaches via that hook. For
// now (v1 of the plugin protocol) the component is preserved as-is and the
// plugin shape is the formal surface; the engine still calls Narration
// directly from its own copy of `Film.tsx`.

import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';

import type {ResolvedStyle} from '@bjelser/kit';

/**
 * The shape Narration consumes from a beat. Mirrors the four fields the
 * engine's `TimedBeat` exposes that this component reads — kept local so the
 * feature is decoupled from engine-private timing types.
 *
 * `id`               — used as the Remotion `<Sequence>` key + name suffix.
 * `audio`            — public-folder path to the per-beat narration clip
 *                      (null when TTS has not been run yet).
 * `from`             — start frame, relative to the scene.
 * `durationInFrames` — beat window length.
 */
export interface NarrationBeat {
  readonly id?: string;
  readonly audio: string | null;
  readonly from: number;
  readonly durationInFrames: number;
}

export interface NarrationProps {
  readonly beats: ReadonlyArray<NarrationBeat>;
  readonly style: ResolvedStyle;
}

// Lays each beat's narration audio on the scene timeline. When TTS has not run
// yet (no audio in the manifest), it simply renders nothing and the film plays
// silent with estimated timing.
export const Narration: React.FC<NarrationProps> = ({beats, style}) => {
  // `style` is reserved for future token use (e.g. caption typography);
  // Narration is audio-only today, so the prop is threaded but unused.
  void style;
  return (
    <>
      {beats.map((b, i) =>
        b.audio ? (
          <Sequence
            key={b.id ?? `beat-${i}`}
            from={b.from}
            durationInFrames={b.durationInFrames}
            name={`♪ ${b.id ?? i}`}
          >
            <Audio src={staticFile(b.audio)} />
          </Sequence>
        ) : null,
      )}
    </>
  );
};
