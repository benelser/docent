import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {accent, theme} from '../theme';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import type {SceneProps} from '../engine/spec';

export const TitleScene: React.FC<SceneProps> = ({
  ts,
  sceneIndex,
  sceneCount,
  meta,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accent(scene.accent);

  const enterOf = (name: string): number =>
    ts.beats.find((b) => b.show === name)?.from ?? 0;

  const rise = (at: number, mass = 0.8) => {
    const local = frame - at;
    return local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass}});
  };

  const titleA = rise(enterOf('title'), 1);
  const taglineA = rise(enterOf('tagline'));
  const footA = rise(enterOf('footnote'));
  const blink = Math.floor(frame / 18) % 2 === 0;

  return (
    <SceneFrame
      accentHex={accentHex}
      kicker={scene.kicker}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        {/* faux prompt */}
        <div
          style={{
            fontFamily: monoFamily,
            fontSize: 27,
            color: accentHex,
            opacity: titleA,
            marginBottom: 26,
            letterSpacing: 1,
          }}
        >
          <span style={{color: theme.ink.low}}>~ </span>
          <span style={{color: accentHex}}>❯</span> docent {meta.id}
          <span
            style={{
              display: 'inline-block',
              width: 13,
              height: 26,
              background: accentHex,
              marginLeft: 6,
              transform: 'translateY(4px)',
              opacity: blink ? 1 : 0,
            }}
          />
        </div>

        {/* title */}
        <div
          style={{
            fontSize: 158,
            fontWeight: 700,
            color: theme.ink.hi,
            letterSpacing: -3,
            opacity: titleA,
            transform: `scale(${interpolate(titleA, [0, 1], [0.92, 1])})`,
            textShadow: `0 30px 90px ${accentHex}30`,
          }}
        >
          {scene.title}
        </div>

        {/* divider */}
        <div
          style={{
            width: interpolate(taglineA, [0, 1], [0, 360]),
            height: 3,
            background: `linear-gradient(90deg, transparent, ${accentHex}, transparent)`,
            margin: '34px 0 30px',
            opacity: taglineA,
          }}
        />

        {/* tagline */}
        <div
          style={{
            fontSize: 41,
            fontWeight: 400,
            color: theme.ink.mid,
            opacity: taglineA,
            transform: `translateY(${(1 - taglineA) * 14}px)`,
            fontFamily: interFamily,
          }}
        >
          {scene.tagline}
        </div>

        {/* footnote */}
        <div
          style={{
            fontFamily: monoFamily,
            fontSize: 23,
            color: theme.ink.low,
            opacity: footA,
            transform: `translateY(${(1 - footA) * 12}px)`,
            marginTop: 70,
            letterSpacing: 1,
          }}
        >
          {scene.footnote}
        </div>
      </AbsoluteFill>
      <Narration beats={ts.beats} />
    </SceneFrame>
  );
};
