import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import type {TimedBeat} from '../engine/spec';

// Lays each beat's narration audio on the scene timeline. When TTS has not run
// yet (no audio in the manifest), it simply renders nothing and the film plays
// silent with estimated timing.
export const Narration: React.FC<{beats: TimedBeat[]}> = ({beats}) => (
  <>
    {beats.map((b) =>
      b.audio ? (
        <Sequence
          key={b.id}
          from={b.from}
          durationInFrames={b.durationInFrames}
          name={`♪ ${b.id}`}
        >
          <Audio src={staticFile(b.audio)} />
        </Sequence>
      ) : null,
    )}
  </>
);
