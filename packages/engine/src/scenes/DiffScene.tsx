import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Highlight} from 'prism-react-renderer';
import {glow} from '../theme';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {codeTheme} from '../components/code-theme';
import {activeBeatIndex, type SceneProps} from '../engine/spec';
import type {ResolvedStyle} from '../style';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string>;
  return (key && map[key]) || map.blue;
};

// A PR-review scene: a unified diff. Each line of `code` begins with a marker
// — '+' added, '-' removed, ' ' context — which the engine strips, tints, and
// renders. Beats spotlight a hunk.
export const DiffScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accentOf(style, scene.accent);
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const monoFamily = style.tokens.typography.family.mono;
  // add/remove tints are token-driven semantic colours; preset swaps (e.g.
  // paper's marker-green) flow through naturally.
  const GREEN = style.tokens.accent.green;
  const ROSE = style.tokens.accent.rose;

  const rawLines = (scene.code ?? '').replace(/\s+$/, '').split('\n');
  const markers = rawLines.map((l) =>
    l[0] === '+' || l[0] === '-' ? l[0] : ' ',
  );
  const bodies = rawLines.map((l) =>
    l[0] === '+' || l[0] === '-' || l[0] === ' ' ? l.slice(1) : l,
  );
  const cleanCode = bodies.join('\n');
  const lineCount = rawLines.length;
  const adds = markers.filter((m) => m === '+').length;
  const dels = markers.filter((m) => m === '-').length;

  const active = activeBeatIndex(ts.beats, frame);
  const hl = ts.beats[active]?.highlight;

  const fontSize = 20;
  const lineH = 32;
  const headerH = 52;
  const padY = 20;
  const winW = 1320;
  const winH = headerH + lineCount * lineH + padY * 2;
  const top = 214 + Math.max(0, (806 - winH) / 2);

  const winScale = spring({frame, fps, config: {damping: 200, mass: 0.6}});
  const winOpacity = interpolate(frame, [0, 9], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <SceneFrame
      accentHex={accentHex}
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
          <div style={{fontFamily: monoFamily, fontSize: 16, color: ink.mid, letterSpacing: 0.3}}>
            {scene.file}
          </div>
          <div style={{marginLeft: 'auto', fontFamily: monoFamily, fontSize: 15, letterSpacing: 0.5}}>
            <span style={{color: GREEN}}>+{adds}</span>
            <span style={{color: ink.faint}}> / </span>
            <span style={{color: ROSE}}>&minus;{dels}</span>
          </div>
        </div>

        <div style={{padding: `${padY}px 0`}}>
          <Highlight theme={codeTheme} code={cleanCode} language={(scene.lang ?? 'rust') as never}>
            {({tokens, getTokenProps}) => (
              <div style={{fontFamily: monoFamily, fontSize, lineHeight: `${lineH}px`}}>
                {tokens.map((line, i) => {
                  const m = markers[i];
                  const isAdd = m === '+';
                  const isDel = m === '-';
                  const lit = hl ? i + 1 >= hl[0] && i + 1 <= hl[1] : true;
                  const tint = isAdd
                    ? glow(GREEN, 0.13)
                    : isDel
                      ? glow(ROSE, 0.13)
                      : 'transparent';
                  const bar = isAdd ? GREEN : isDel ? ROSE : 'transparent';
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        opacity: lit ? 1 : 0.5,
                        background: tint,
                        borderLeft: `3px solid ${bar}`,
                      }}
                    >
                      <span
                        style={{
                          width: 38,
                          textAlign: 'center',
                          flexShrink: 0,
                          color: isAdd ? GREEN : isDel ? ROSE : ink.faint,
                          fontWeight: 600,
                        }}
                      >
                        {isAdd ? '+' : isDel ? '−' : ''}
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

      <Narration beats={ts.beats} />
    </SceneFrame>
  );
};
