// Local EmbeddedScene — Sprint B compositional grammar (PLACEHOLDER).
//
// The full v2.5.x EmbeddedScene
// (packages/engine/src/scenes/EmbeddedScene.tsx — ~900 lines, dispatching
// across mechanism / venn / chart / quantities / compare / structure /
// causal-loop / tree tableau renderers) is engine-shared infrastructure
// that has not yet been migrated into @docent/core. Per the migration
// brief, this scene's worktree may not modify packages/engine/, so we
// inline a MINIMAL placeholder that:
//
//   - draws the embed's outer "thing-within-a-thing" outline + optional
//     caption (the affordance that signals the cell carries a sub-scene),
//   - emits nothing for the per-type body.
//
// This is a deliberate, narrow deviation from byte-identical v2.5.x
// behaviour: a compare cell that carries an embed still gets the OUTLINE
// + CAPTION (so the cell visually communicates that it hosts a sub-scene),
// but loses the per-type interior tableau until the shared EmbeddedScene
// migrates into @docent/core. The integrator swaps this file for the
// shared import at merge time; the compare component reads the embed
// component through `./_embedded-scene` so the swap is one import.

import React from 'react';
import type {ResolvedStyle} from '@docent/kit';

export type EmbedBounds = {cx: number; cy: number; w: number; h: number};

// Mirror of packages/engine/src/engine/spec.ts:EmbeddedScene — `type` is
// the only field we read here; the rest are forwarded to the eventual
// shared renderer untouched.
export interface EmbeddedSceneSpec {
  type: string;
  caption?: string;
  [key: string]: unknown;
}

interface Props {
  embed: EmbeddedSceneSpec;
  bounds: EmbedBounds;
  inheritedStyle: ResolvedStyle;
  parentAccent: string;
}

export const EmbeddedScene: React.FC<Props> = ({
  embed,
  bounds,
  inheritedStyle,
  parentAccent,
}) => {
  const monoFamily = inheritedStyle.tokens.typography.family.mono;
  const ink = inheritedStyle.tokens.ink;
  const x0 = bounds.cx - bounds.w / 2;
  const y0 = bounds.cy - bounds.h / 2;
  const captionFs = Math.max(8, Math.min(12, bounds.w * 0.04));
  const captionText = (embed.caption ?? '').slice(0, 24);
  return (
    <g>
      <rect
        x={x0}
        y={y0}
        width={bounds.w}
        height={bounds.h}
        rx={6}
        fill="none"
        stroke={parentAccent}
        strokeOpacity={0.3}
        strokeWidth={1.5}
      />
      {captionText ? (
        <text
          x={bounds.cx}
          y={y0 + bounds.h - 4}
          textAnchor="middle"
          fontFamily={monoFamily}
          fontSize={captionFs}
          fill={ink.low}
        >
          {captionText}
        </text>
      ) : null}
    </g>
  );
};
