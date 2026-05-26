// Local Narration — lays each beat's narration audio on the scene timeline.
//
// MIRROR of packages/engine/src/components/Narration.tsx, adapted to the
// kit's BeatTimelineSlot shape. When the audio-rhythm / narration
// FeaturePlugin lands in @docent/core, this file goes away in favour of a
// shared import.

import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import type {Beat, BeatTimelineSlot, ResolvedStyle} from '@docent/kit';

// The engine's narration pipeline attaches an `audio: string | null` to
// each beat (the path to the synthesized mp3, relative to public/). Reads
// the open index signature on Beat.
const audioPath = (beat: Beat): string | null => {
  const v = (beat as {audio?: unknown}).audio;
  return typeof v === 'string' ? v : null;
};

export const Narration: React.FC<{
  beats: ReadonlyArray<BeatTimelineSlot>;
  style: ResolvedStyle;
}> = ({beats, style}) => {
  // `style` is reserved for future token use (caption typography); the
  // Narration is audio-only today.
  void style;
  return (
    <>
      {beats.map((b) => {
        const src = audioPath(b.beat);
        if (!src) return null;
        const key = (typeof b.beat.id === 'string' && b.beat.id) || `beat-${b.beatIndex}`;
        return (
          <Sequence
            key={key}
            from={b.startFrame}
            durationInFrames={b.frames}
            name={`♪ ${key}`}
          >
            <Audio src={staticFile(src)} />
          </Sequence>
        );
      })}
    </>
  );
};
