import React from 'react';
import {Composition} from 'remotion';
import {Film} from './Film';
import {FILMS, buildTimeline} from './engine/spec';

// One composition per film spec under films/. Adding a film is one JSON file
// plus one line in the FILMS registry — no engine changes.
export const Root: React.FC = () => {
  return (
    <>
      {Object.keys(FILMS).map((filmId) => {
        const film = FILMS[filmId];
        const timeline = buildTimeline(film);
        return (
          <Composition
            key={filmId}
            id={filmId}
            component={Film}
            durationInFrames={Math.max(1, Math.round(timeline.total))}
            fps={film.meta.fps}
            width={film.meta.width}
            height={film.meta.height}
            defaultProps={{filmId}}
          />
        );
      })}
    </>
  );
};
