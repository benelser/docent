import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {evolvePath} from '@remotion/paths';
import {glow} from '../theme';
import {monoFamily} from '../fonts';
import {connectorPath, curvedPath, type Box} from '../engine/layout';

export type EdgeState = 'hidden' | 'normal' | 'dim' | 'focus';

// An edge between two cards. It is not a static line: once drawn, it carries a
// continuous stream of flowing dashes — the wire shows data moving through it.
export const Connector: React.FC<{
  from: Box;
  to: Box;
  accentHex: string;
  state: EdgeState;
  enterFrame: number;
  kind?: 'flow' | 'escalate';
  label?: string;
}> = ({from, to, accentHex, state, enterFrame, kind, label}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - enterFrame;
  const draw =
    local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass: 0.5}});

  if (state === 'hidden') return null;

  const escalate = kind === 'escalate';
  const path = escalate ? curvedPath(from, to) : connectorPath(from, to);
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

  // arrowhead direction
  const ref = escalate
    ? path.mid
    : (path as ReturnType<typeof connectorPath>).start;
  const end = path.end;
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
        strokeWidth={escalate ? 2.2 : 2.4}
        strokeLinecap="round"
        strokeDasharray={escalate ? '9 9' : evolve.strokeDasharray}
        strokeDashoffset={escalate ? 0 : evolve.strokeDashoffset}
        opacity={escalate ? draw * 0.85 * opacity : 0.3 * opacity}
      />
      {/* flowing data */}
      {escalate ? null : (
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
          x={path.mid.x - 18}
          y={path.mid.y + 5}
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
