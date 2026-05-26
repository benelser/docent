// A comet of data travelling an edge — a bright head with a tapering trail.
// `t` is 0..1 along the from→to edge.
//
// MIRROR of packages/engine/src/components/Pulse.tsx.

import React from 'react';
import type {ResolvedStyle} from '@docent/kit';

import {glow} from './_helpers';
import {edgePoint, type Box} from './_layout';

export const Pulse: React.FC<{
  from: Box;
  to: Box;
  accentHex: string;
  t: number;
  style: ResolvedStyle;
}> = ({from, to, accentHex, t, style}) => {
  void style;
  if (t <= 0 || t >= 1) return null;
  const s = edgePoint(from, to.cx, to.cy);
  const e = edgePoint(to, from.cx, from.cy);
  const at = (u: number) => ({
    x: s.x + (e.x - s.x) * u,
    y: s.y + (e.y - s.y) * u,
  });
  const o = Math.min(1, Math.min(t, 1 - t) * 7);
  const head = at(t);
  const trail = [0.045, 0.09, 0.145, 0.21, 0.29];

  return (
    <svg
      style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
      viewBox="0 0 1920 1080"
    >
      {trail.map((d, i) => {
        const p = at(Math.max(0, t - d));
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={Math.max(2, 9.5 - d * 26)}
            fill={accentHex}
            opacity={o * Math.max(0, 1 - d * 3.4)}
          />
        );
      })}
      <circle cx={head.x} cy={head.y} r={25} fill="none" stroke={accentHex} strokeWidth={2} opacity={o * 0.3} />
      <circle
        cx={head.x}
        cy={head.y}
        r={10}
        fill={accentHex}
        opacity={o}
        style={{filter: `drop-shadow(0 0 16px ${glow(accentHex, 0.95)})`}}
      />
    </svg>
  );
};
