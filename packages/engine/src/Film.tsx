import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {FILMS, buildTimeline, TRANSITION} from './engine/spec';
import {TitleScene} from './scenes/TitleScene';
import {DiagramScene} from './scenes/DiagramScene';
import {SequenceScene} from './scenes/SequenceScene';
import {CodeScene} from './scenes/CodeScene';
import {DiffScene} from './scenes/DiffScene';
import {SketchScene} from './scenes/SketchScene';
import {RecapScene} from './scenes/RecapScene';

// Assembles a film spec into a single composition: every scene rendered by the
// template for its type, cross-faded together.
export const Film: React.FC<{filmId: string}> = ({filmId}) => {
  const film = FILMS[filmId];
  const timeline = buildTimeline(film);
  const count = timeline.scenes.length;
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();

  // Bookend the film: fade up from black at the open, down to black at the end.
  const blackout = Math.max(
    interpolate(frame, [0, 16], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
    interpolate(frame, [durationInFrames - 30, durationInFrames - 2], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );

  return (
    <AbsoluteFill>
      <TransitionSeries>
        {timeline.scenes.flatMap((ts, i) => {
          const common = {ts, sceneIndex: i, sceneCount: count, meta: film.meta};
          const node =
            ts.scene.type === 'title' ? (
              <TitleScene {...common} />
            ) : ts.scene.type === 'sequence' ? (
              <SequenceScene {...common} />
            ) : ts.scene.type === 'code' ? (
              <CodeScene {...common} />
            ) : ts.scene.type === 'diff' ? (
              <DiffScene {...common} />
            ) : ts.scene.type === 'sketch' ? (
              <SketchScene {...common} />
            ) : ts.scene.type === 'recap' ? (
              <RecapScene {...common} />
            ) : (
              <DiagramScene {...common} />
            );
          const seq = (
            <TransitionSeries.Sequence
              key={ts.scene.id}
              durationInFrames={ts.durationInFrames}
            >
              {node}
            </TransitionSeries.Sequence>
          );
          if (i === 0) return [seq];
          return [
            <TransitionSeries.Transition
              key={`x-${ts.scene.id}`}
              timing={linearTiming({durationInFrames: TRANSITION})}
              presentation={fade()}
            />,
            seq,
          ];
        })}
      </TransitionSeries>
      <AbsoluteFill
        style={{backgroundColor: '#000000', opacity: blackout, pointerEvents: 'none'}}
      />
    </AbsoluteFill>
  );
};
