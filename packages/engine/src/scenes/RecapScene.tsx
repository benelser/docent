import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {glow} from '../theme';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {FittedText} from '../components/FittedText';
import {activeBeatIndex, type SceneProps} from '../engine/spec';
import type {ResolvedStyle} from '../style';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string>;
  return (key && map[key]) || map.blue;
};

export const RecapScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accentOf(style, scene.accent);
  const points = scene.points ?? [];
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

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
      style={style}      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      {/* Explicitly positioned column — the SceneFrame heading sits at top:86
          with a 54px line, so points must start safely below it. Using an
          absolute `top` (rather than a centred AbsoluteFill) so the heading
          can never collide with point 1, regardless of points count. */}
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 268,
          width: 1680,
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        {points.map((p, i) => {
          const local = frame - revealFrameFor(i);
          const a =
            local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});
          // Auto-fit font: long points shrink so they don't wrap into many
          // lines that push the next row out of the safe area.
          const fs = p.length <= 70 ? 32 : p.length <= 110 ? 28 : 25;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 26,
                opacity: a,
                transform: `translateX(${interpolate(a, [0, 1], [-26, 0])}px)`,
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 12,
                  flexShrink: 0,
                  background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
                  border: `1.5px solid ${accentHex}`,
                  boxShadow: `0 0 22px -6px ${glow(accentHex, 0.6)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: monoFamily,
                  fontSize: 22,
                  fontWeight: 600,
                  color: accentHex,
                  marginTop: 2,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              {/* Bullet text. Available width inside the row is
                  1680 - (54 + 26) = 1600px. Allow up to 4 wrapped lines
                  per bullet, then auto-shrink past that — so a very
                  long bullet stays inside the safe band without
                  pushing later bullets off-screen. */}
              <FittedText
                text={p}
                maxWidth={1600}
                basePx={fs}
                floorPx={16}
                charAdvance={0.55}
                mode="shrink-wrap"
                maxLines={4}
                lineHeight={1.32}
                style={{
                  fontFamily: sansFamily,
                  fontWeight: 500,
                  color: ink.hi,
                  letterSpacing: -0.3,
                  flex: 1,
                  minWidth: 0,
                }}
              />
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 120,
          bottom: 130,
          fontFamily: monoFamily,
          fontSize: 22,
          letterSpacing: 2,
          color: ink.low,
          opacity: closing ? 1 : 0,
        }}
      >
        surveyed from source · docent
      </div>
      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
