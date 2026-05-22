import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {accent, theme, glow} from '../theme';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {activeBeatIndex, type SceneProps} from '../engine/spec';

export const RecapScene: React.FC<SceneProps> = ({
  ts,
  sceneIndex,
  sceneCount,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accent(scene.accent);
  const points = scene.points ?? [];

  // The reveal frame for point i is the `from` of the first beat whose numeric
  // `reveal` reaches i+1.
  const revealFrameFor = (i: number): number => {
    const b = ts.beats.find(
      (bt) => typeof bt.reveal === 'number' && bt.reveal >= i + 1,
    );
    return b ? b.from : 0;
  };

  const active = activeBeatIndex(ts.beats, frame);
  const closing = frame > (ts.beats[active]?.from ?? 0) + 30;

  return (
    <SceneFrame
      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <AbsoluteFill
        style={{alignItems: 'center', justifyContent: 'center'}}
      >
        <div style={{display: 'flex', flexDirection: 'column', gap: 30, width: 1180}}>
          {points.map((p, i) => {
            const local = frame - revealFrameFor(i);
            const a =
              local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 30,
                  opacity: a,
                  transform: `translateX(${interpolate(a, [0, 1], [-26, 0])}px)`,
                }}
              >
                <div
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: 14,
                    flexShrink: 0,
                    background: `linear-gradient(158deg, ${theme.bg.panelHi}, ${theme.bg.panel})`,
                    border: `1.5px solid ${accentHex}`,
                    boxShadow: `0 0 24px -6px ${glow(accentHex, 0.6)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: monoFamily,
                    fontSize: 26,
                    fontWeight: 600,
                    color: accentHex,
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div
                  style={{
                    fontFamily: interFamily,
                    fontSize: 37,
                    fontWeight: 500,
                    color: theme.ink.hi,
                    letterSpacing: -0.3,
                  }}
                >
                  {p}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 78,
            fontFamily: monoFamily,
            fontSize: 22,
            letterSpacing: 2,
            color: theme.ink.low,
            opacity: closing ? 1 : 0,
          }}
        >
          surveyed from source · docent
        </div>
      </AbsoluteFill>
      <Narration beats={ts.beats} />
    </SceneFrame>
  );
};
