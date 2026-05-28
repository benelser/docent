// An edge between two cards. It is not a static line: once drawn, it carries
// a continuous stream of flowing dashes — the wire shows data moving through
// it.
//
// MIRROR of packages/engine/src/components/Connector.tsx. `kind` types what
// the edge asserts (`relation`/`feedback`/`entails`/`causes`); `strength`
// qualifies a `causes` edge's weight. `cadence` shapes the draw-on.

import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {evolvePath} from '@remotion/paths';
import type {Beat, ResolvedStyle} from '@bjelser/kit';

import {fitFontSize, glow, monoFamily, truncateForSlot} from '../../_shared';
import {connectorPath, curvedPath, type Box} from './_layout';

type Cadence = Beat['cadence'];

export type EdgeState = 'hidden' | 'normal' | 'dim' | 'focus';

export const Connector: React.FC<{
  from: Box;
  to: Box;
  accentHex: string;
  state: EdgeState;
  enterFrame: number;
  kind?: 'relation' | 'feedback' | 'entails' | 'causes' | undefined;
  strength?: 'necessary' | 'contributing' | undefined;
  label?: string | undefined;
  cadence?: Cadence;
  style: ResolvedStyle;
}> = ({from, to, accentHex, state, enterFrame, kind, strength, label, cadence, style}) => {
  void style;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - enterFrame;
  const drawMass = cadence === 'snap' ? 0.32 : 0.5;
  const draw =
    local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass: drawMass}});

  if (state === 'hidden') return null;

  const feedback = kind === 'feedback';
  const entails = kind === 'entails';
  const causes = kind === 'causes';
  const heavy = entails || (causes && strength === 'necessary');
  const curved = feedback ? curvedPath(from, to) : null;
  const straight = feedback ? null : connectorPath(from, to);
  const path = curved ?? straight!;
  const evolve = evolvePath(draw, path.d);
  const dim = state === 'dim';
  const focus = state === 'focus';
  const opacity = dim ? 0.26 : 1;

  const flowIn = interpolate(local, [12, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const speed = focus ? 2.6 : 1.6;
  const flowOffset = -((frame * speed) % 26);
  const flowOpacity = flowIn * opacity * (focus ? 1 : dim ? 0.4 : 0.7);

  const ref = curved ? curved.mid : straight!.start;
  const end = path.end;
  const mid = curved
    ? curved.mid
    : {x: (straight!.start.x + end.x) / 2, y: (straight!.start.y + end.y) / 2};
  const angle = (Math.atan2(end.y - ref.y, end.x - ref.x) * 180) / Math.PI;
  const headOpacity = Math.max(0, (draw - 0.6) / 0.4) * opacity;

  // entailment / causation rendering: an `entails` or `causes` edge is a
  // logical/causal claim, not a data wire — no flowing dashes. `entails` is
  // a doubled wire (the rail of a "therefore"); a `necessary` claim is heavy.
  const logical = entails || causes;
  const railOffset = (() => {
    if (!entails || feedback) return {x: 0, y: 0};
    const s = straight!.start;
    const dx = end.x - s.x;
    const dy = end.y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    return {x: (-dy / len) * 3.2, y: (dx / len) * 3.2};
  })();
  const wireWidth = heavy ? 4.6 : causes ? 3.0 : 2.4;

  return (
    <svg
      style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
      viewBox="0 0 1920 1080"
    >
      <path
        d={path.d}
        fill="none"
        stroke={accentHex}
        strokeWidth={feedback ? 2.2 : logical ? wireWidth : 2.4}
        strokeLinecap="round"
        strokeDasharray={feedback ? '9 9' : evolve.strokeDasharray}
        strokeDashoffset={feedback ? 0 : evolve.strokeDashoffset}
        opacity={
          feedback
            ? draw * 0.85 * opacity
            : logical
              ? draw * (heavy ? 0.92 : 0.6) * opacity
              : 0.3 * opacity
        }
      />
      {entails ? (
        <path
          d={`M ${straight!.start.x + railOffset.x} ${straight!.start.y + railOffset.y} L ${end.x + railOffset.x} ${end.y + railOffset.y}`}
          fill="none"
          stroke={accentHex}
          strokeWidth={wireWidth}
          strokeLinecap="round"
          strokeDasharray={evolve.strokeDasharray}
          strokeDashoffset={evolve.strokeDashoffset}
          opacity={draw * 0.92 * opacity}
        />
      ) : null}
      {feedback || logical ? null : (
        <path
          d={path.d}
          fill="none"
          stroke={accentHex}
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeDasharray="13 13"
          strokeDashoffset={flowOffset}
          opacity={flowOpacity}
          style={{filter: `drop-shadow(0 0 5px ${glow(accentHex, 0.6)})`}}
        />
      )}
      <g transform={`translate(${end.x} ${end.y}) rotate(${angle})`} opacity={headOpacity}>
        <path
          d={heavy ? 'M 5 0 L -22 -11 L -22 11 Z' : 'M 3 0 L -16 -8 L -16 8 Z'}
          fill={accentHex}
          style={{filter: `drop-shadow(0 0 5px ${glow(accentHex, 0.65)})`}}
        />
      </g>
      {entails ? (
        <text
          x={mid.x}
          y={mid.y - 14}
          textAnchor="middle"
          fontFamily={monoFamily}
          fontSize={30}
          fontWeight={700}
          fill={accentHex}
          opacity={draw}
          style={{filter: `drop-shadow(0 0 6px ${glow(accentHex, 0.6)})`}}
        >
          ∴
        </text>
      ) : null}
      {label ? (() => {
        const fromLeft = from.cx - from.w / 2;
        const fromRight = from.cx + from.w / 2;
        const fromTop = from.cy - from.h / 2;
        const fromBottom = from.cy + from.h / 2;
        const toLeft = to.cx - to.w / 2;
        const toRight = to.cx + to.w / 2;
        const toTop = to.cy - to.h / 2;
        const toBottom = to.cy + to.h / 2;
        const dxBoxes = to.cx - from.cx;
        const dyBoxes = to.cy - from.cy;
        const horizontalEdge = Math.abs(dxBoxes) >= Math.abs(dyBoxes);
        let gapW: number;
        let innerCenterX: number;
        let innerCenterY: number;
        if (horizontalEdge) {
          const innerLeft = Math.min(fromRight, toRight);
          const innerRight = Math.max(fromLeft, toLeft);
          gapW = Math.max(0, innerRight - innerLeft - 32);
          innerCenterX = (innerLeft + innerRight) / 2;
          innerCenterY = mid.y;
        } else {
          const innerTop = Math.min(fromBottom, toBottom);
          const innerBottom = Math.max(fromTop, toTop);
          const verticalGap = Math.max(0, innerBottom - innerTop - 24);
          gapW = Math.min(Math.min(from.w, to.w) * 0.9, verticalGap > 0 ? 520 : Math.min(from.w, to.w) * 0.9);
          innerCenterX = mid.x;
          innerCenterY = (innerTop + innerBottom) / 2;
        }
        const maxW = Math.min(520, gapW);
        const FLOOR = 11;
        const charAdvance = 0.6;
        if (maxW < FLOOR * charAdvance * 4) return null;
        const fs = fitFontSize(label, {maxWidth: maxW, basePx: 17, floorPx: FLOOR, charAdvance});
        const visible = truncateForSlot(label, {maxWidth: maxW, fontSize: fs, charAdvance});
        return (
          <text
            x={innerCenterX}
            y={innerCenterY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily={monoFamily}
            fontSize={fs}
            letterSpacing={0.3}
            fill={accentHex}
            opacity={draw}
            stroke="#0e1116"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {visible}
          </text>
        );
      })() : null}
    </svg>
  );
};
