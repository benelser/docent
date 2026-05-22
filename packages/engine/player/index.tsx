import React from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '@remotion/player';
import {Film} from '../src/Film';
import {FILMS, buildTimeline} from '../src/engine/spec';

// `staticFile()` (used by the engine for narration audio) resolves against
// `window.remotion_staticBase` when it is set. The build step injects a base
// of "." so audio resolves to bundle-relative paths; the dev server leaves it
// unset so audio resolves to "/audio/...", served straight from `public/`.
declare global {
  interface Window {
    remotion_staticBase?: string;
    __DOCENT_FILM__?: string;
  }
}

const filmIds = Object.keys(FILMS);

// Film id resolution order:
//   1. a build-time pinned id (set when bundling a single film)
//   2. the `?film=` query param
//   3. the first film in the registry
const pinnedId =
  typeof window !== 'undefined' ? window.__DOCENT_FILM__ : undefined;
const queryId =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('film') ?? undefined
    : undefined;

const requestedId = pinnedId ?? queryId;
const filmId =
  requestedId && filmIds.includes(requestedId) ? requestedId : filmIds[0];

const Picker: React.FC<{current: string}> = ({current}) => {
  // A picker only makes sense when more than one film ships in the bundle and
  // no single film was pinned at build time.
  if (pinnedId || filmIds.length < 2) return null;
  return (
    <div className="docent-picker">
      <span className="docent-title">Film</span>
      {filmIds.map((id) => (
        <a
          key={id}
          href={`?film=${encodeURIComponent(id)}`}
          className={id === current ? 'active' : undefined}
        >
          {FILMS[id].meta.title ?? id}
        </a>
      ))}
    </div>
  );
};

const App: React.FC = () => {
  const film = FILMS[filmId];
  const timeline = buildTimeline(film);
  const durationInFrames = Math.max(1, Math.round(timeline.total));

  return (
    <div className="docent-player-shell">
      <Picker current={filmId} />
      <div className="docent-player-frame">
        <Player
          component={Film}
          inputProps={{filmId}}
          durationInFrames={durationInFrames}
          fps={timeline.fps}
          compositionWidth={timeline.width}
          compositionHeight={timeline.height}
          style={{width: '100%'}}
          controls
          clickToPlay
          doubleClickToFullscreen
          spaceKeyToPlayOrPause
          acknowledgeRemotionLicense
        />
      </div>
      <span className="docent-title">{film.meta.title ?? filmId}</span>
    </div>
  );
};

const container = document.getElementById('root');
if (!container) throw new Error('player: #root not found');
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
