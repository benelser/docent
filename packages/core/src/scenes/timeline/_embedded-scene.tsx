// Stub for the EmbeddedScene compositional-grammar component.
//
// In v2.5.x, packages/engine/src/scenes/EmbeddedScene.tsx renders a static
// tableau for one of six embed types (mechanism, venn, chart, quantities,
// compare, structure) inside the host's allocated bounds. It is ~800 lines
// of per-type tableau renderers.
//
// In the v3.0 plugin-architecture rip-and-replace, embedded composition
// crosses scene-plugin boundaries (a timeline embeds a venn; a compare
// embeds a chart). The right home for the EmbeddedScene dispatcher is a
// shared piece of @docent/core infrastructure that the integrator wires up
// at merge time — not inside any one scene's directory. Until that lands,
// the timeline plugin renders this typed stub: an outlined card carrying
// the embed's caption (if any) so the bounds remain visible during dev,
// but the per-type tableau detail does not duplicate across scenes.
//
// The component shape (props, types) is byte-equivalent to the engine's so
// the integrator's swap is a one-import change. The visual difference is
// scoped to the embed payload's pixels — every other timeline pixel is
// identical to v2.5.x.

import React from 'react';
import type {ResolvedStyle} from '@docent/kit';

import {glow} from './_helpers';
import type {EmbeddedSceneSpec} from './validate';

export type EmbedBounds = {cx: number; cy: number; w: number; h: number};

type Props = {
  embed: EmbeddedSceneSpec;
  bounds: EmbedBounds;
  inheritedStyle: ResolvedStyle;
  // The parent scene's accent — the embed inherits it when the embed has no
  // explicit accent of its own.
  parentAccent: string;
};

export const EmbeddedScene: React.FC<Props> = ({
  embed,
  bounds,
  inheritedStyle,
  parentAccent,
}) => {
  const {bg, ink, typography} = inheritedStyle.tokens;
  const x0 = bounds.cx - bounds.w / 2;
  const y0 = bounds.cy - bounds.h / 2;
  const caption = embed.caption;
  const typeLabel = embed.type;
  return (
    <g>
      <rect
        x={x0}
        y={y0}
        width={bounds.w}
        height={bounds.h}
        rx={10}
        fill={bg.panel}
        stroke={parentAccent}
        strokeOpacity={0.55}
        strokeWidth={1.5}
        opacity={0.92}
      />
      <rect
        x={x0}
        y={y0}
        width={bounds.w}
        height={bounds.h}
        rx={10}
        fill={glow(parentAccent, 0.06)}
      />
      <text
        x={bounds.cx}
        y={y0 + bounds.h / 2 - 4}
        textAnchor="middle"
        fontFamily={typography.family.mono}
        fontSize={12}
        fill={ink.low}
        letterSpacing={2}
      >
        {typeLabel.toUpperCase()}
      </text>
      {caption ? (
        <text
          x={bounds.cx}
          y={y0 + bounds.h / 2 + 16}
          textAnchor="middle"
          fontFamily={typography.family.sans}
          fontSize={13}
          fill={ink.mid}
        >
          {caption}
        </text>
      ) : null}
    </g>
  );
};
