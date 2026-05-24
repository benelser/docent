import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Highlight} from 'prism-react-renderer';
import {glow} from '../theme';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {FittedText} from '../components/FittedText';
import {codeTheme} from '../components/code-theme';
import {activeBeatIndex, type SceneProps} from '../engine/spec';
import type {ResolvedStyle} from '../style';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string>;
  return (key && map[key]) || map.blue;
};

// A deep-dive on real source: a code window whose lines reveal, then highlight
// range by range as the narration walks through them.
export const CloseupScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accentOf(style, scene.accent);
  const code = (scene.code ?? '').replace(/\s+$/, '');
  const lineCount = code.split('\n').length;

  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  // The mono face for source listings is sourced from the resolved tokens.
  // The `engineering` preset selects JetBrains Mono (and so does `neutral`);
  // any preset that swaps the mono stack will be honoured here.
  const monoFamily = style.tokens.typography.family.mono;

  const active = activeBeatIndex(ts.beats, frame);
  const beat = ts.beats[active];
  const hl = beat?.highlight;
  const note = beat?.note;

  const fontSize = 21;
  const lineH = 33;
  const headerH = 52;
  const padY = 22;
  const winW = 1300;
  const winH = headerH + lineCount * lineH + padY * 2;
  const top = 214 + Math.max(0, (806 - winH) / 2);

  // The window reaches full opacity fast — code must be legible immediately.
  // A gentle scale spring adds life without ever dimming the text.
  const winScale = spring({frame, fps, config: {damping: 200, mass: 0.6}});
  const winOpacity = interpolate(frame, [0, 9], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <SceneFrame
      style={style}      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top,
          width: winW,
          transform: `translateX(-50%) scale(${interpolate(winScale, [0, 1], [0.975, 1])})`,
          opacity: winOpacity,
          borderRadius: 16,
          overflow: 'hidden',
          background: bg.panel,
          border: `1.5px solid ${bg.line}`,
          boxShadow: `0 44px 110px -34px #000000, 0 0 0 1px ${glow(accentHex, 0.12)}`,
        }}
      >
        {/* window chrome */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '0 22px',
            height: headerH,
            background: bg.panelHi,
            borderBottom: `1px solid ${bg.line}`,
          }}
        >
          <div style={{display: 'flex', gap: 8}}>
            {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
              <div key={c} style={{width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.9}} />
            ))}
          </div>
          {/* file path — window-chrome label. The chrome reserves room
              for the traffic-light dots on the left (~60px). The window
              is 1300px wide; budget the rest for the path with a clean
              shrink-then-ellipsis. */}
          <FittedText
            text={scene.file ?? ''}
            maxWidth={1300 - 60 - 60}
            basePx={16}
            floorPx={11}
            charAdvance={0.62}
            mode="shrink-single"
            style={{
              fontFamily: monoFamily,
              color: ink.mid,
              letterSpacing: 0.3,
            }}
          />
        </div>

        {/* code body */}
        <div style={{padding: `${padY}px 0`}}>
          <Highlight theme={codeTheme} code={code} language={(scene.lang ?? 'rust') as never}>
            {({tokens, getTokenProps}) => (
              <div style={{fontFamily: monoFamily, fontSize, lineHeight: `${lineH}px`}}>
                {tokens.map((line, i) => {
                  const lineNo = i + 1;
                  const lit = hl ? lineNo >= hl[0] && lineNo <= hl[1] : true;
                  // Non-highlighted lines are de-emphasized, never illegible.
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        opacity: lit ? 1 : 0.66,
                        background: lit && hl ? glow(accentHex, 0.11) : 'transparent',
                        borderLeft: `3px solid ${lit && hl ? accentHex : 'transparent'}`,
                      }}
                    >
                      <span
                        style={{
                          width: 66,
                          textAlign: 'right',
                          paddingRight: 22,
                          color: ink.faint,
                          flexShrink: 0,
                        }}
                      >
                        {lineNo}
                      </span>
                      <span style={{flex: 1, whiteSpace: 'pre'}}>
                        {line.map((token, j) => (
                          <span key={j} {...getTokenProps({token})} />
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Highlight>
        </div>
      </div>

      {/* per-beat annotation — sits below the code window, centred. The
          window is 1300px wide; let the note breathe up to 2 wrapped
          lines so a fully-formed sentence ("This is the keystone — the
          pin every later cycle depends on") fits without spilling past
          the safe band or wrapping into the wordmark below. */}
      {note ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: top + winH + 26,
            transform: 'translateX(-50%)',
            width: 1300,
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <FittedText
            text={note}
            maxWidth={1260}
            basePx={19}
            floorPx={13}
            charAdvance={0.6}
            mode="shrink-wrap"
            maxLines={2}
            lineHeight={1.32}
            style={{
              fontFamily: monoFamily,
              color: accentHex,
              letterSpacing: 0.4,
              textAlign: 'center',
            }}
          />
        </div>
      ) : null}

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
