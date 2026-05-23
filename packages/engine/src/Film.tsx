import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {FILMS, buildTimeline, cutFrames, registerDefaults} from './engine/spec';
import {FrameScene} from './scenes/FrameScene';
import {StructureScene} from './scenes/StructureScene';
import {ProgressionScene} from './scenes/ProgressionScene';
import {WalkthroughScene} from './scenes/WalkthroughScene';
import {CompareScene} from './scenes/CompareScene';
import {QuantitiesScene} from './scenes/QuantitiesScene';
import {ProbeScene} from './scenes/ProbeScene';
import {CloseupScene} from './scenes/CloseupScene';
import {DemonstrateScene} from './scenes/DemonstrateScene';
import {DiffScene} from './scenes/DiffScene';
import {TensionScene} from './scenes/TensionScene';
import {RecapScene} from './scenes/RecapScene';
import {ChartScene} from './scenes/ChartScene';
import {PassageScene} from './scenes/PassageScene';
import {FigureScene} from './scenes/FigureScene';

// `treatment` (a scene knob) — the visual *skin*, decoupled from scene type.
// Today the hand-drawn chalkboard skin is welded to the `tension` type and the
// crisp dark-console skin to every other type. `treatment` breaks that weld:
// it names the skin a scene draws with, independent of what the scene *is*.
//
// The implicit default reproduces today exactly — `tension` defaults to
// `sketch`, every other type to `crisp` — so a film that sets no `treatment`
// renders byte-identically. An explicit `treatment` overrides:
//   structure + treatment:'sketch'     → the chalkboard renderer
//   tension   + treatment:'crisp'      → the crisp node-diagram renderer
//   any       + treatment:'whiteboard' → marker-on-paper, reuses the rough.js
//                                         renderer; TensionScene picks the palette
//
// The skin swap is honest only for the node-diagram family (structure ⇄
// tension): both consume the same `nodes`/`edges`/`grid` spec. See the report
// for the feature deltas a full version would need to close.
type Treatment = 'crisp' | 'sketch' | 'whiteboard';
const treatmentOf = (scene: {type: string; treatment?: Treatment}): Treatment =>
  scene.treatment ?? (scene.type === 'tension' ? 'sketch' : 'crisp');

// Assembles a film spec into a single composition: every scene rendered by the
// template for its type, cross-faded together.
export const Film: React.FC<{filmId: string}> = ({filmId}) => {
  const film = FILMS[filmId];
  const timeline = buildTimeline(film);
  const count = timeline.scenes.length;
  const reg = registerDefaults(film.meta.register);
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
          const t = ts.scene.type;
          // The node-diagram family — `structure` and `tension` share the
          // same `nodes`/`edges`/`grid` spec, so their *skin* is swappable:
          // the renderer is chosen by `treatment`, not by `type`. Every other
          // type keeps a type→renderer mapping (it has only the crisp skin).
          const node =
            t === 'frame' ? (
              <FrameScene {...common} />
            ) : t === 'progression' ? (
              <ProgressionScene {...common} />
            ) : t === 'walkthrough' ? (
              <WalkthroughScene {...common} />
            ) : t === 'compare' ? (
              <CompareScene {...common} />
            ) : t === 'quantities' ? (
              <QuantitiesScene {...common} />
            ) : t === 'probe' ? (
              <ProbeScene {...common} />
            ) : t === 'closeup' ? (
              <CloseupScene {...common} />
            ) : t === 'demonstrate' ? (
              <DemonstrateScene {...common} />
            ) : t === 'diff' ? (
              <DiffScene {...common} />
            ) : t === 'recap' ? (
              <RecapScene {...common} />
            ) : t === 'chart' ? (
              <ChartScene {...common} />
            ) : t === 'passage' ? (
              <PassageScene {...common} />
            ) : t === 'figure' ? (
              <FigureScene {...common} />
            ) : t === 'tension' || t === 'structure' ? (
              // Skin chosen by `treatment`: sketch → chalkboard, whiteboard →
              // marker-on-paper (same rough.js renderer, light palette picked
              // inside TensionScene), crisp → console. Default keeps
              // tension=sketch / structure=crisp.
              treatmentOf(ts.scene) === 'sketch' ||
              treatmentOf(ts.scene) === 'whiteboard' ? (
                <TensionScene {...common} />
              ) : (
                <StructureScene {...common} />
              )
            ) : (
              <StructureScene {...common} />
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
          // `cut` (a scene knob), read off the previous scene, sets how this
          // boundary feels: `hold` a longer settle, `continue` a quick fade.
          return [
            <TransitionSeries.Transition
              key={`x-${ts.scene.id}`}
              timing={linearTiming({
                durationInFrames: cutFrames(timeline.scenes[i - 1].scene.cut ?? reg.cut),
              })}
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
