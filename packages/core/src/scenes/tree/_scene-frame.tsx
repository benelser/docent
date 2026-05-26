// Local SceneFrame — the parallaxed chrome every scene sits in.
//
// MIRROR of packages/engine/src/components/SceneFrame.tsx. The v3.0
// fan-out moves each scene into its own directory; shared component
// infrastructure (SceneFrame, Narration, FittedText, fonts) will be
// migrated by a separate agent and reconciled by the integrator at merge
// time. Inlining a verbatim copy here keeps the tree scene's worktree
// self-contained and `tsc --noEmit` clean.

import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ResolvedStyle} from '@docent/kit';

import {FittedText} from './_fitted-text';
import {glow} from './_helpers';
import {interFamily, monoFamily} from './_fonts';

// Seeded RNG so the starfield is identical every render.
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const STARS = (() => {
  const r = rng(20260522);
  return Array.from({length: 150}, () => ({
    x: r() * 1920,
    y: r() * 1080,
    rad: 0.4 + r() * 1.7,
    o: 0.06 + r() * 0.5,
  }));
})();

const MOTES = (() => {
  const r = rng(77123);
  return Array.from({length: 14}, () => ({
    x: r() * 1920,
    y: r() * 1080,
    rad: 1.5 + r() * 3,
    ph: r() * Math.PI * 2,
    sp: 0.18 + r() * 0.3,
  }));
})();

export interface CameraState {
  tx: number;
  ty: number;
  scale: number;
}

// A parallax layer: shifts a fraction of the camera move.
const par = (cam: CameraState | undefined, depth: number): string => {
  if (!cam) return 'none';
  return `translate(${cam.tx * depth}px, ${cam.ty * depth}px) scale(${1 + (cam.scale - 1) * depth})`;
};

export const SceneFrame: React.FC<{
  accentHex: string;
  kicker: string;
  heading?: string | undefined;
  sceneIndex: number;
  sceneCount: number;
  cam?: CameraState | undefined;
  glowScale?: number | undefined;
  transparentBackdrop?: boolean | undefined;
  style: ResolvedStyle;
  children?: React.ReactNode;
}> = ({
  accentHex,
  kicker,
  heading,
  sceneIndex,
  sceneCount,
  cam,
  glowScale = 1,
  transparentBackdrop,
  style,
  children,
}) => {
  const {bg, ink} = style.tokens;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const intro = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const t = frame / fps;

  const motes = useMemo(
    () =>
      MOTES.map((m) => ({
        ...m,
        cx: m.x + Math.sin(t * m.sp + m.ph) * 60,
        cy: m.y + Math.cos(t * m.sp * 0.8 + m.ph) * 40,
      })),
    [t],
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: transparentBackdrop ? 'transparent' : bg.base,
        fontFamily: interFamily,
      }}
    >
      <AbsoluteFill style={{transformOrigin: '50% 50%', transform: par(cam, 0.1)}}>
        <svg width="100%" height="100%" viewBox="0 0 1920 1080">
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.rad} fill="#aab6d0" opacity={s.o} />
          ))}
        </svg>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          transformOrigin: '50% 50%',
          transform: par(cam, 0.26),
          backgroundImage: `radial-gradient(${bg.line} 1.15px, transparent 1.15px)`,
          backgroundSize: '46px 46px',
          opacity: 0.26,
        }}
      />

      <div
        style={{
          position: 'absolute',
          width: 1700,
          height: 1700,
          right: -460,
          top: -640,
          transform: par(cam, 0.16),
          background: `radial-gradient(circle, ${glow(accentHex, 0.22 * glowScale)} 0%, transparent 60%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1300,
          height: 1300,
          left: -440,
          bottom: -580,
          transform: par(cam, 0.16),
          background: `radial-gradient(circle, ${glow(accentHex, 0.1 * glowScale)} 0%, transparent 64%)`,
        }}
      />

      <AbsoluteFill style={{transformOrigin: '50% 50%', transform: par(cam, 0.46)}}>
        <svg width="100%" height="100%" viewBox="0 0 1920 1080">
          {motes.map((m, i) => (
            <circle
              key={i}
              cx={m.cx}
              cy={m.cy}
              r={m.rad}
              fill={accentHex}
              opacity={0.12 + 0.1 * Math.sin(t * 0.6 + m.ph)}
              style={{filter: `blur(1.5px)`}}
            />
          ))}
        </svg>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 74% 66% at 50% 44%, transparent 38%, ${bg.void}e0 100%)`,
        }}
      />

      {children}

      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 86,
          opacity: intro,
          transform: `translateX(${(1 - intro) * -18}px)`,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              background: accentHex,
              boxShadow: `0 0 14px ${accentHex}`,
            }}
          />
          <FittedText
            text={kicker}
            maxWidth={1480}
            basePx={21}
            floorPx={13}
            charAdvance={0.78}
            mode="shrink-single"
            style={{
              fontFamily: monoFamily,
              letterSpacing: 4,
              color: accentHex,
              fontWeight: 500,
            }}
          />
        </div>
        {heading ? (
          <FittedText
            text={heading}
            maxWidth={1680}
            basePx={
              heading.length <= 38
                ? 54
                : heading.length <= 50
                  ? 46
                  : heading.length <= 64
                    ? 40
                    : 34
            }
            floorPx={26}
            charAdvance={0.55}
            mode="shrink-wrap"
            maxLines={2}
            lineHeight={1.06}
            style={{
              fontWeight: 700,
              color: ink.hi,
              marginTop: 14,
              letterSpacing: -0.5,
            }}
          />
        ) : null}
      </div>

      <div style={{position: 'absolute', left: 122, bottom: 66, display: 'flex', gap: 9}}>
        {Array.from({length: sceneCount}).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === sceneIndex ? 42 : 20,
              height: 4,
              borderRadius: 2,
              background: i <= sceneIndex ? accentHex : bg.line,
              boxShadow: i === sceneIndex ? `0 0 10px ${accentHex}` : 'none',
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          right: 122,
          bottom: 62,
          fontFamily: monoFamily,
          fontSize: 17,
          color: ink.faint,
          letterSpacing: 3,
        }}
      >
        docent
      </div>
    </AbsoluteFill>
  );
};
