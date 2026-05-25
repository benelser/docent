import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {FILMS, buildTimeline, cutFrames, DEFAULT_CUT} from './engine/spec';
import {resolveStyle} from './style';
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
import {BigIdeaScene} from './scenes/BigIdeaScene';
import {PriorArtScene} from './scenes/PriorArtScene';
import {TimelineScene} from './scenes/TimelineScene';
import {TreeScene} from './scenes/TreeScene';
import {MapScene} from './scenes/MapScene';
import {JourneyMapScene} from './scenes/JourneyMapScene';
import {CausalLoopScene} from './scenes/CausalLoopScene';
import {LandscapeScene} from './scenes/LandscapeScene';
import {MechanismScene} from './scenes/MechanismScene';
import {VennScene} from './scenes/VennScene';

// v2.4.0 removed the per-scene `treatment` knob — the skin a scene draws
// with is now welded to its type again: `tension` always renders through
// TensionScene (the sketch/chalkboard renderer), `structure` always through
// StructureScene (the crisp node-diagram renderer). The cross-treatment
// swap (structure-as-sketch, tension-as-whiteboard) was retired with the
// knob; visual variety now flows through `FilmSpec.style` instead.

// Assembles a film spec into a single composition: every scene rendered by the
// template for its type, cross-faded together.
export const Film: React.FC<{filmId: string}> = ({filmId}) => {
  const film = FILMS[filmId];
  const timeline = buildTimeline(film);
  const count = timeline.scenes.length;
  // Resolve once per film. `resolveStyle(undefined)` returns byte-identical
  // neutral, so a film with no `style` field is unchanged. The resolved
  // bundle is threaded into the `common` props every scene receives so the
  // chrome components (and, later, the scene renderers themselves) can read
  // tokens off it. M2 and M3 will wire the scene callsites to actually pass
  // `style={common.style}` through to each renderer.
  const style = resolveStyle(film.style);
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
          const common = {ts, sceneIndex: i, sceneCount: count, meta: film.meta, style};
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
            ) : t === 'big-idea' ? (
              <BigIdeaScene {...common} />
            ) : t === 'prior-art' ? (
              <PriorArtScene {...common} />
            ) : t === 'timeline' ? (
              <TimelineScene {...common} />
            ) : t === 'tree' ? (
              // tree — a rooted hierarchy / classification. The renderer reads
              // depth off the recursion rather than off a (col, row) grid, so
              // levels carry meaning (kingdom→phylum→class, model→toolset→
              // orchestrator→application).
              <TreeScene {...common} />
            ) : t === 'map' ? (
              <MapScene {...common} />
            ) : t === 'journey-map' ? (
              <JourneyMapScene {...common} />
            ) : t === 'causal-loop' ? (
              <CausalLoopScene {...common} />
            ) : t === 'landscape' ? (
              <LandscapeScene {...common} />
            ) : t === 'mechanism' ? (
              <MechanismScene {...common} />
            ) : t === 'venn' ? (
              <VennScene {...common} />
            ) : t === 'tension' ? (
              // tension renders through the sketch/chalkboard renderer; the
              // cross-treatment skin-swap (structure-as-sketch, tension-as-
              // crisp) retired with the `treatment` knob in v2.4.0.
              <TensionScene {...common} />
            ) : t === 'structure' ? (
              <StructureScene {...common} />
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
                durationInFrames: cutFrames(timeline.scenes[i - 1].scene.cut ?? DEFAULT_CUT),
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
