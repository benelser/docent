// A labelled component box — a module, service, file, or actor. Carries an
// optional corner `tag` (a kind marker, e.g. `trait`, `×27`).
//
// MIRROR of packages/engine/src/components/Card.tsx.
//
// `cadence` (a beat knob) shapes the card's entrance: `snap` is a sharper,
// lower-mass spring; `cascade`/`together`/undefined keep the original
// {damping: 200, mass: 0.7} spring. The cascade *stagger* is applied by the
// caller via `enterFrame`.

import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Beat, ResolvedStyle} from '@bjelser/kit';

import {cadenceSpringConfig, glow, interFamily, monoFamily} from '../../_shared';
import type {Box} from './_layout';

type Cadence = Beat['cadence'];

export type CardState = 'hidden' | 'normal' | 'focus' | 'dim';
export type CardWeight = 'hero' | 'primary' | 'normal' | 'recede';

export const Card: React.FC<{
  box: Box;
  label: string;
  sub?: string | undefined;
  tag?: string | undefined;
  accentHex: string;
  emphasis?: boolean | undefined;
  weight?: CardWeight | undefined;
  state: CardState;
  enterFrame: number;
  cadence?: Cadence | undefined;
  style: ResolvedStyle;
}> = ({box, label, sub, tag, accentHex, emphasis, weight, state, enterFrame, cadence, style}) => {
  const {bg, ink} = style.tokens;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - enterFrame;
  const appear =
    local <= 0 ? 0 : spring({frame: local, fps, config: cadenceSpringConfig(cadence)});

  if (state === 'hidden') return null;

  const w: CardWeight = weight ?? (emphasis ? 'hero' : 'normal');
  const dim = state === 'dim';
  const focus = state === 'focus' || w === 'hero';
  const glowing = focus || w === 'primary';
  const baseOpacity = dim ? 0.32 : w === 'recede' ? 0.56 : 1;
  const opacity = appear * baseOpacity;
  const scale = interpolate(appear, [0, 1], [0.9, 1]);
  const breathe = focus ? 0.5 + 0.5 * Math.sin((frame / fps) * 3.2) : 0;

  const innerW = Math.max(60, box.w - 5 - 52 - (tag ? 92 : 0));
  const fitFont = (text: string, base: number, floor: number, lines = 1): number => {
    const budget = innerW * lines;
    const est = text.length * base * 0.6;
    return est <= budget ? base : Math.max(floor, budget / (text.length * 0.6));
  };
  const labelSize = fitFont(label, w === 'hero' ? 30 : 27, 13, 1);
  const subSize = sub ? fitFont(sub, 15.5, 11, 2) : 15.5;

  return (
    <div
      style={{
        position: 'absolute',
        left: box.cx - box.w / 2,
        top: box.cy - box.h / 2,
        width: box.w,
        height: box.h,
        opacity,
        transform: `scale(${scale})`,
        borderRadius: 18,
        background: focus
          ? `radial-gradient(120% 140% at 0% 0%, ${glow(accentHex, 0.14)} 0%, ${bg.panelHi} 42%, ${bg.panel} 100%)`
          : `linear-gradient(158deg, ${bg.panelHi} 0%, ${bg.panel} 100%)`,
        border: `1.5px solid ${glowing ? accentHex : bg.line}`,
        boxShadow: focus
          ? `0 0 0 1px ${glow(accentHex, 0.35)}, 0 24px 60px -22px ${glow(
              accentHex,
              0.45 + breathe * 0.22,
            )}, inset 0 1px 0 ${glow('#ffffff', 0.05)}`
          : `0 18px 44px -24px #000000cc, inset 0 1px 0 ${glow('#ffffff', 0.04)}`,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: 5,
          alignSelf: 'stretch',
          background: accentHex,
          boxShadow: `0 0 20px ${glow(accentHex, focus ? 0.95 : 0.5)}`,
        }}
      />
      <div
        style={{
          padding: '0 26px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontFamily: interFamily,
            fontSize: labelSize,
            fontWeight: 600,
            color: ink.hi,
            letterSpacing: -0.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: innerW,
          }}
        >
          {label}
        </div>
        {sub ? (
          <div
            style={{
              fontFamily: monoFamily,
              fontSize: subSize,
              color: focus ? ink.mid : ink.low,
              letterSpacing: 0.2,
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
              maxWidth: innerW,
              lineHeight: 1.25,
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>
      {tag ? (
        <div
          style={{
            position: 'absolute',
            top: 13,
            right: 14,
            fontFamily: monoFamily,
            fontSize: 12.5,
            letterSpacing: 0.6,
            color: accentHex,
            padding: '3px 9px',
            borderRadius: 6,
            background: glow(accentHex, 0.12),
            border: `1px solid ${glow(accentHex, 0.32)}`,
          }}
        >
          {tag}
        </div>
      ) : null}
    </div>
  );
};
