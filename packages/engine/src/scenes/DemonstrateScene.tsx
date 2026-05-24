import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {glow} from '../theme';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import type {SceneProps} from '../engine/spec';
import type {ResolvedStyle} from '../style';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string>;
  return (key && map[key]) || map.blue;
};

// Shows the phenomenon itself: an embedded screen-capture clip, framed in a
// device-style panel, with the narration playing over it. When no clip is
// supplied the scene degrades gracefully to a centred placeholder panel — it
// must never crash on a missing file.
export const DemonstrateScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  meta,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accentOf(style, scene.accent);
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  const intro = spring({frame, fps, config: {damping: 200}});
  const scale = interpolate(intro, [0, 1], [0.94, 1]);

  // The framed stage the clip (or placeholder) sits inside.
  const panelW = 1340;
  const panelH = 632;

  const panelStyle: React.CSSProperties = {
    width: panelW,
    height: panelH,
    opacity: intro,
    transform: `scale(${scale})`,
    borderRadius: 18,
    overflow: 'hidden',
    background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
    border: `1.5px solid ${accentHex}`,
    boxShadow: `0 0 0 1px ${glow(accentHex, 0.3)}, 0 40px 90px -36px #000000ee`,
    display: 'flex',
    flexDirection: 'column',
  };

  // A title bar, so the clip reads as a captured window.
  const titleBar = (
    <div
      style={{
        height: 46,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 18px',
        background: bg.void,
        borderBottom: `1px solid ${bg.line}`,
      }}
    >
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
        <div key={c} style={{width: 12, height: 12, borderRadius: '50%', background: c, opacity: 0.85}} />
      ))}
      <div
        style={{
          marginLeft: 14,
          fontFamily: monoFamily,
          fontSize: 14,
          letterSpacing: 0.6,
          color: ink.low,
        }}
      >
        {scene.clip ? scene.clip : `${meta.subject} · demonstration`}
      </div>
    </div>
  );

  return (
    <SceneFrame
      style={style}      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div style={{...panelStyle, marginTop: 36}}>
          {titleBar}
          {scene.clip ? (
            <OffthreadVideo
              src={staticFile(`clips/${meta.id}/${scene.clip}`)}
              style={{width: '100%', height: '100%', objectFit: 'contain', background: bg.void}}
            />
          ) : (
            // graceful placeholder — no clip, no crash
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                background: `radial-gradient(circle at 50% 42%, ${glow(accentHex, 0.08)} 0%, transparent 64%)`,
              }}
            >
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  border: `2px solid ${accentHex}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 0 30px -6px ${glow(accentHex, 0.6)}`,
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    marginLeft: 6,
                    borderTop: '15px solid transparent',
                    borderBottom: '15px solid transparent',
                    borderLeft: `24px solid ${accentHex}`,
                  }}
                />
              </div>
              <div
                style={{
                  fontFamily: sansFamily,
                  fontSize: 28,
                  fontWeight: 600,
                  color: ink.hi,
                }}
              >
                {scene.heading ?? 'Demonstration'}
              </div>
              <div
                style={{
                  fontFamily: monoFamily,
                  fontSize: 16,
                  letterSpacing: 1,
                  color: ink.low,
                }}
              >
                clip unavailable · narrated walkthrough
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
