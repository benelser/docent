// DiffScene — the PR-review move: a unified diff.
//
// Migrated from packages/engine/src/scenes/DiffScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. Behavior is UNCHANGED from the
// v2.5.x renderer; only import paths and the prop shape were updated:
//   - props receive `SceneRenderProps<DiffSceneSpec>` from @docent/kit
//     (the kit-owned `{scene, common}` envelope), rather than the legacy
//     `SceneProps` (the engine-owned `ts: TimedScene` envelope).
//   - the engine-shared chrome (SceneFrame, Narration, FittedText, fonts,
//     code-theme, glow, activeBeatIndex) lives as colocated helpers in
//     this scene's directory until the shared-infra migration agent
//     lands; the integrator will swap the underscore-prefixed local
//     helpers for shared imports at merge time.
//
// Each line of `code` begins with a marker — '+' added, '-' removed, ' '
// context — which the renderer strips, tints, and counts. Beats spotlight
// a hunk via `highlight: [startLine, endLine]`.

import React from 'react';
import {Highlight} from 'prism-react-renderer';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ResolvedStyle, SceneRenderProps} from '@docent/kit';

import {
  FittedText,
  Narration,
  SceneFrame,
  activeBeatIndex,
  codeTheme,
  glow,
} from '../../_shared';
import type {DiffScene as DiffSceneSpec} from './validate';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string | undefined>;
  return (key ? map[key] : undefined) ?? map.blue ?? '#5cb6ff';
};

export const DiffSceneComponent: React.FC<SceneRenderProps<DiffSceneSpec>> = ({
  scene,
  common,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  const accentHex = accentOf(style, undefined);
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
  const hl = (ts.beats[active]?.beat as {highlight?: [number, number]} | undefined)
    ?.highlight;

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
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
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
              <div
                key={c}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  background: c,
                  opacity: 0.9,
                }}
              />
            ))}
          </div>
          {/* file path — single-line shrink with ellipsis. */}
          <FittedText
            text={scene.file ?? ''}
            maxWidth={1320 - 60 - 140 - 60}
            basePx={16}
            floorPx={11}
            charAdvance={0.62}
            mode="shrink-single"
            style={{
              fontFamily: monoFamily,
              color: ink.mid,
              letterSpacing: 0.3,
              flexShrink: 1,
              minWidth: 0,
            }}
          />
          <div
            style={{
              marginLeft: 'auto',
              fontFamily: monoFamily,
              fontSize: 15,
              letterSpacing: 0.5,
              flexShrink: 0,
            }}
          >
            <span style={{color: GREEN}}>+{adds}</span>
            <span style={{color: ink.faint}}> / </span>
            <span style={{color: ROSE}}>&minus;{dels}</span>
          </div>
        </div>

        <div style={{padding: `${padY}px 0`}}>
          <Highlight
            theme={codeTheme}
            code={cleanCode}
            language={(scene.lang ?? 'rust') as never}
          >
            {({tokens, getTokenProps}) => (
              <div
                style={{
                  fontFamily: monoFamily,
                  fontSize,
                  lineHeight: `${lineH}px`,
                }}
              >
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

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
