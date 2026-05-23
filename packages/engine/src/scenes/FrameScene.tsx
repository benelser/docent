import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {accent, theme} from '../theme';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import type {SceneProps} from '../engine/spec';

export const FrameScene: React.FC<SceneProps> = ({
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

  // Auto-fit the title — long titles (a poem name, a multi-clause subject)
  // would otherwise blow through the safe band at the static 158px size and
  // run flush to the frame edges. Shrink in steps; clamp the box.
  const titleText = scene.title ?? '';
  const titleFont =
    titleText.length <= 15 ? 158 :
    titleText.length <= 22 ? 132 :
    titleText.length <= 30 ? 108 :
    titleText.length <= 40 ? 88 :
    72;

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

        {/* title — auto-fit for long titles; maxWidth keeps the box inside the safe band */}
        <div
          style={{
            fontSize: titleFont,
            fontWeight: 700,
            color: theme.ink.hi,
            letterSpacing: -titleFont * 0.019,
            opacity: titleA,
            transform: `scale(${interpolate(titleA, [0, 1], [0.92, 1])})`,
            textShadow: `0 30px 90px ${accentHex}30`,
            maxWidth: 1680,
            textAlign: 'center',
            lineHeight: 1.05,
            padding: '0 16px',
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

        {/* footnote — auto-shrink + maxWidth so a long footnote never bleeds
            past the safe band. Same belt-and-braces shape as the heading in
            SceneFrame.tsx: tier fontSize by length, cap width, centre. */}
        {(() => {
          const text = scene.footnote ?? '';
          const fs = text.length <= 80 ? 23
                   : text.length <= 130 ? 19
                   : text.length <= 180 ? 16
                   : 14;
          return (
            <div
              style={{
                fontFamily: monoFamily,
                fontSize: fs,
                color: theme.ink.low,
                opacity: footA,
                transform: `translateY(${(1 - footA) * 12}px)`,
                marginTop: 70,
                letterSpacing: 1,
                maxWidth: 1480,
                textAlign: 'center',
                lineHeight: 1.4,
                padding: '0 16px',
                alignSelf: 'center',
              }}
            >
              {text}
            </div>
          );
        })()}
      </AbsoluteFill>
      <Narration beats={ts.beats} />
    </SceneFrame>
  );
};
