// CloseupScene — annotate a code artifact.
//
// A deep-dive on real source: a code window whose lines render with
// syntax highlighting, then highlight range by range as the narration
// walks through them. A short annotation (the beat's `note`) sits below
// the window, tinted by the active accent.
//
// Migrated from packages/engine/src/scenes/CloseupScene.tsx as part of
// the v3.0 plugin-architecture rip-and-replace. Behavior is UNCHANGED
// from the v2.5.x renderer; only import paths and the prop shape were
// updated:
//   - props receive `SceneRenderProps<CloseupSceneSpec>` from @bjelser/kit
//     (the kit-owned `{scene, common}` envelope), rather than the legacy
//     `SceneProps` (the engine-owned `ts: TimedScene` envelope).
//   - the engine-shared chrome (SceneFrame, Narration, FittedText, fonts,
//     code-theme, glow, activeBeatIndex) lives as colocated helpers in
//     this scene's directory until the shared-infra migration agent
//     lands; the integrator will swap the underscore-prefixed local
//     helpers for shared imports at merge time.

import React from 'react';
import {Highlight} from 'prism-react-renderer';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ResolvedStyle, SceneRenderProps} from '@bjelser/kit';

import {
  FittedText,
  Narration,
  SceneFrame,
  activeBeatIndex,
  codeTheme,
  glow,
} from '../../_shared';
import type {CloseupScene as CloseupSceneSpec} from './validate';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string | undefined>;
  return (key ? map[key] : undefined) ?? map.blue ?? '#5cb6ff';
};

export const CloseupSceneComponent: React.FC<SceneRenderProps<CloseupSceneSpec>> = ({
  scene,
  common,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  const accentHex = accentOf(style, undefined);
  const code = (scene.code ?? '').replace(/\s+$/, '');
  const lineCount = code.split('\n').length;

  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  // The mono face for source listings is sourced from the resolved tokens.
  // The `engineering` preset selects JetBrains Mono (and so does `neutral`);
  // any preset that swaps the mono stack will be honoured here.
  const monoFamily = style.tokens.typography.family.mono;

  const active = activeBeatIndex(ts.beats, frame);
  const activeBeat = ts.beats[active]?.beat as
    | {highlight?: [number, number]; note?: string}
    | undefined;
  const hl = activeBeat?.highlight;
  const note = activeBeat?.note;

  // ── Auto-fit layout ──────────────────────────────────────────────────
  // The closeup MUST fit inside the canvas — content that spills off the
  // right edge or below the wordmark band is a hard regression. Three
  // levers, applied in order: widen the window, shrink the font, and
  // (only as a last resort, when even the floor font doesn't fit) crop
  // the visible code to a window around the active highlight.
  const headerH = 52;
  const padY = 22;
  const winW = 1640;
  // The vertical safe band: top of the code window down to the bottom
  // of the canvas, minus room for the per-beat note + wordmark below.
  // STAGE assumed 1920×1080 (the closeup scene only ships 16:9 today).
  const codeTopY = 214;
  const safeBandH = 1080 - codeTopY - 120;
  const linesH = Math.max(0, safeBandH - headerH - padY * 2);

  // The longest line in the listing dictates the horizontal fit. Tabs
  // are treated as 4 chars for advance estimation.
  const codeLines = code.split('\n');
  const longestLineLen = codeLines.reduce(
    (a, l) => Math.max(a, l.replace(/\t/g, '    ').length),
    0,
  );
  // Available horizontal pixels inside the code column.
  const lineNumCol = 66;
  const codeWAvail = winW - lineNumCol - 24;

  // Font candidates from each constraint, then pick the binding one.
  const BASE_FONT = 21;
  const FLOOR_FONT = 12;
  const charAdvance = 0.62;
  const lineHRatio = 33 / 21; // preserve the original ratio
  const fitFontFromHeight = (linesH / Math.max(1, lineCount)) / lineHRatio;
  const fitFontFromWidth = codeWAvail / Math.max(1, longestLineLen * charAdvance);
  const fitFont = Math.min(BASE_FONT, fitFontFromHeight, fitFontFromWidth);
  const fontSize = Math.max(FLOOR_FONT, Math.floor(fitFont));
  const lineH = Math.round(fontSize * lineHRatio);

  // If even the floor font + widened window cannot show all lines,
  // crop to a window around the active highlight (or the top of the
  // file if no beat is highlighting). The cap is whatever the floor
  // font allows in the safe band — *always* fits, never bleeds.
  const maxVisibleLines = Math.max(8, Math.floor(linesH / lineH));
  const needsCrop = lineCount > maxVisibleLines;
  let visibleStartLine = 1; // 1-indexed
  let visibleEndLine = lineCount;
  if (needsCrop) {
    if (hl) {
      // Center the highlight range with padding.
      const center = Math.round((hl[0] + hl[1]) / 2);
      const half = Math.floor(maxVisibleLines / 2);
      visibleStartLine = Math.max(1, center - half);
      visibleEndLine = Math.min(lineCount, visibleStartLine + maxVisibleLines - 1);
      // Snap back if we ran off the end.
      if (visibleEndLine === lineCount) {
        visibleStartLine = Math.max(1, lineCount - maxVisibleLines + 1);
      }
    } else {
      visibleEndLine = maxVisibleLines;
    }
  }
  const visibleLineCount = visibleEndLine - visibleStartLine + 1;

  const winH = headerH + visibleLineCount * lineH + padY * 2;
  const top = codeTopY + Math.max(0, (safeBandH - winH) / 2);

  // The window reaches full opacity fast — code must be legible immediately.
  // A gentle scale spring adds life without ever dimming the text.
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
              width is `winW`; budget the rest for the path with a clean
              shrink-then-ellipsis. When the visible range is cropped
              (file too long for one slide), append `(L<start>–L<end>)`
              so the viewer knows they're seeing a window, not the file
              from the top. */}
          <FittedText
            text={
              (scene.file ?? '') +
              (needsCrop
                ? `  ·  L${visibleStartLine}–L${visibleEndLine} of ${lineCount}`
                : '')
            }
            maxWidth={winW - 60 - 60}
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
                {tokens
                  .filter((_, i) => {
                    const lineNo = i + 1;
                    return (
                      lineNo >= visibleStartLine && lineNo <= visibleEndLine
                    );
                  })
                  .map((line, i) => {
                  const lineNo = visibleStartLine + i;
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

      {/* per-beat annotation — sits below the code window, centred to
          the window's width (winW), with maxLines=2 so a sentence-
          length note never wraps into the wordmark below. */}
      {note ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: top + winH + 26,
            transform: 'translateX(-50%)',
            width: winW,
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <FittedText
            text={note}
            maxWidth={winW - 40}
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
