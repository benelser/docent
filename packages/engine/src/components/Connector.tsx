import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {evolvePath} from '@remotion/paths';
import {glow} from '../theme';
import {monoFamily} from '../fonts';
import type {Beat} from '../engine/spec';
import {connectorPath, curvedPath, type Box} from '../engine/layout';

export type EdgeState = 'hidden' | 'normal' | 'dim' | 'focus';

// An edge between two cards. It is not a static line: once drawn, it carries a
// continuous stream of flowing dashes — the wire shows data moving through it.
//
// `cadence` (a beat knob) shapes the draw-on: `snap` lowers the spring mass
// for a sharper sweep; every other cadence keeps the original
// {damping: 200, mass: 0.5} — so a knob-free edge is unchanged. The cascade
// *stagger* is applied by the caller via `enterFrame`.
export const Connector: React.FC<{
  from: Box;
  to: Box;
  accentHex: string;
  state: EdgeState;
  enterFrame: number;
  kind?: 'relation' | 'feedback';
  label?: string;
  cadence?: Beat['cadence'];
}> = ({from, to, accentHex, state, enterFrame, kind, label, cadence}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - enterFrame;
  const drawMass = cadence === 'snap' ? 0.32 : 0.5;
  const draw =
    local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass: drawMass}});

  if (state === 'hidden') return null;

  const feedback = kind === 'feedback';
  // Two path shapes: a straight connector has `.start`, a curved feedback edge
  // has `.mid`. Branch on `feedback` so each side keeps its concrete type
  // (rather than a union where neither member is statically known).
  const curved = feedback ? curvedPath(from, to) : null;
  const straight = feedback ? null : connectorPath(from, to);
  const path = curved ?? straight!;
  const evolve = evolvePath(draw, path.d);
  const dim = state === 'dim';
  const focus = state === 'focus';
  const opacity = dim ? 0.26 : 1;

  // flowing dashes — fade in once the wire is mostly drawn
  const flowIn = interpolate(local, [12, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const speed = focus ? 2.6 : 1.6;
  const flowOffset = -((frame * speed) % 26);
  const flowOpacity = flowIn * opacity * (focus ? 1 : dim ? 0.4 : 0.7);

  // arrowhead direction — its anchor is the curve's control point on a
  // feedback edge, or the connector's start on a straight one.
  const ref = curved ? curved.mid : straight!.start;
  const end = path.end;
  // label anchor — the curve's control point, or the straight chord's midpoint.
  const mid = curved
    ? curved.mid
    : {x: (straight!.start.x + end.x) / 2, y: (straight!.start.y + end.y) / 2};
  const angle = (Math.atan2(end.y - ref.y, end.x - ref.x) * 180) / Math.PI;
  const headOpacity = Math.max(0, (draw - 0.6) / 0.4) * opacity;

  return (
    <svg
      style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
      viewBox="0 0 1920 1080"
    >
      {/* base wire — draws itself on */}
      <path
        d={path.d}
        fill="none"
        stroke={accentHex}
        strokeWidth={feedback ? 2.2 : 2.4}
        strokeLinecap="round"
        strokeDasharray={feedback ? '9 9' : evolve.strokeDasharray}
        strokeDashoffset={feedback ? 0 : evolve.strokeDashoffset}
        opacity={feedback ? draw * 0.85 * opacity : 0.3 * opacity}
      />
      {/* flowing data */}
      {feedback ? null : (
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
      {/* arrowhead */}
      <g transform={`translate(${end.x} ${end.y}) rotate(${angle})`} opacity={headOpacity}>
        <path
          d="M 3 0 L -16 -8 L -16 8 Z"
          fill={accentHex}
          style={{filter: `drop-shadow(0 0 5px ${glow(accentHex, 0.65)})`}}
        />
      </g>
      {label ? (
        <text
          x={mid.x - 18}
          y={mid.y + 5}
          textAnchor="end"
          fontFamily={monoFamily}
          fontSize={17}
          letterSpacing={0.3}
          fill={accentHex}
          opacity={draw}
        >
          {label}
        </text>
      ) : null}
    </svg>
  );
};
