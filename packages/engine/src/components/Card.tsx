import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme, glow} from '../theme';
import {interFamily, monoFamily} from '../fonts';
import type {Box} from '../engine/layout';

export type CardState = 'hidden' | 'normal' | 'focus' | 'dim';
// `weight` — the node's authorial emphasis, a 4-step gradient. `hero` is the
// point of the scene; `recede` is background context. Supersedes `emphasis`.
export type CardWeight = 'hero' | 'primary' | 'normal' | 'recede';

// A labelled component box — a module, service, file, or actor. Carries an
// optional corner `tag` (a kind marker, e.g. `trait`, `×27`).
export const Card: React.FC<{
  box: Box;
  label: string;
  sub?: string;
  tag?: string;
  accentHex: string;
  emphasis?: boolean; // legacy — superseded by `weight`
  weight?: CardWeight;
  state: CardState;
  enterFrame: number;
}> = ({box, label, sub, tag, accentHex, emphasis, weight, state, enterFrame}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - enterFrame;
  const appear =
    local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});

  if (state === 'hidden') return null;

  // `weight` sets the resting treatment; `state` is the per-beat focus and
  // overrides it. `hero` reads as the active-focus look at rest; `primary`
  // takes the accent border without the breathing glow; `recede` sits quiet.
  const w: CardWeight = weight ?? (emphasis ? 'hero' : 'normal');
  const dim = state === 'dim';
  const focus = state === 'focus' || w === 'hero';
  const glowing = focus || w === 'primary';
  const baseOpacity = dim ? 0.32 : w === 'recede' ? 0.56 : 1;
  const opacity = appear * baseOpacity;
  const scale = interpolate(appear, [0, 1], [0.9, 1]);
  const breathe = focus ? 0.5 + 0.5 * Math.sin((frame / fps) * 3.2) : 0;

  // Fit text to the card — overflow must be impossible. Reserve room for the
  // corner tag so a label can never collide with it.
  const innerW = box.w - 5 - 52 - (tag ? 92 : 0);
  const fitFont = (text: string, base: number): number => {
    const est = text.length * base * 0.6; // conservative per-char advance
    return est <= innerW ? base : Math.max(13, innerW / (text.length * 0.6));
  };
  const labelSize = fitFont(label, w === 'hero' ? 30 : 27);
  const subSize = sub ? fitFont(sub, 15.5) : 15.5;

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
          ? `radial-gradient(120% 140% at 0% 0%, ${glow(accentHex, 0.14)} 0%, ${theme.bg.panelHi} 42%, ${theme.bg.panel} 100%)`
          : `linear-gradient(158deg, ${theme.bg.panelHi} 0%, ${theme.bg.panel} 100%)`,
        border: `1.5px solid ${glowing ? accentHex : theme.bg.line}`,
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
            color: theme.ink.hi,
            letterSpacing: -0.2,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        {sub ? (
          <div
            style={{
              fontFamily: monoFamily,
              fontSize: subSize,
              color: focus ? theme.ink.mid : theme.ink.low,
              letterSpacing: 0.2,
              whiteSpace: 'nowrap',
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
