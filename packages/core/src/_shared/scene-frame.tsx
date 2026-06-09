// SceneFrame — the parallaxed chrome every scene sits in.
//
// MIRROR of `packages/engine/src/components/SceneFrame.tsx`, adapted to live
// inside `@bjelser/core` (resolves `ResolvedStyle` through `@bjelser/kit`,
// and carries its own minimal `CameraState` interface so it does not reach
// back into the engine for the camera-state shape).
//
// The shell every scene sits in: a deep, living, parallaxed space — and the
// kicker, heading, and progress as a fixed UI overlay above it.
//
// `glowScale` (set by the `palette` knob) scales the volumetric accent light:
// `mono` flattens it toward zero, `signal` lifts it. It defaults to 1, the
// identity — so a scene with no palette renders byte-identically.
//
// Chrome — the BACKGROUND PATTERN, mote density, vignette strength, kicker
// shape, and wordmark — is driven by `style.tokens.chrome` (ChromeTokens).
// When a film resolves without a chrome block, SceneFrame substitutes the
// `DEFAULT_CHROME` constant below — which is the verbatim legacy treatment.
// So a film that did not opt into chrome renders byte-identically.

import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ChromeTokens, ResolvedStyle} from '@bjelser/kit';
import {useStage} from '@bjelser/kit';

import {FittedText} from './fitted-text';
import {glow} from './helpers';
import {interFamily, monoFamily} from './fonts';

/**
 * The legacy chrome — the structural treatment SceneFrame painted before
 * `ChromeTokens` existed. A film that resolves to a tokens block WITHOUT
 * a `chrome` field substitutes this; the result is byte-identical to the
 * pre-chrome rendering path.
 */
export const DEFAULT_CHROME: ChromeTokens = Object.freeze({
  background: 'starfield',
  motes: 1,
  vignette: 1,
  kickerStyle: 'numeric',
  wordmark: 'docent',
}) as ChromeTokens;

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

/**
 * Camera-state shape SceneFrame reads. Mirrors the engine's `CameraState`
 * (tx/ty pixel offsets, scale 1.0 = identity). Re-declared locally so
 * `@bjelser/core` does not import from the engine.
 */
export interface CameraState {
  tx: number;
  ty: number;
  scale: number;
}

// A parallax layer: shifts a fraction of the camera move, so far layers lag
// near ones — real depth as the camera travels.
const par = (cam: CameraState | undefined, depth: number): string => {
  if (!cam) return 'none';
  return `translate(${cam.tx * depth}px, ${cam.ty * depth}px) scale(${1 + (cam.scale - 1) * depth})`;
};

/**
 * Transform a spec-author's kicker text per the active chrome `kickerStyle`.
 *
 * Authors write kickers like `"01 // THE CLAIM"` or `"DOCENT // TIMELINE"`.
 * The `kickerStyle` chrome token picks the shape: `numeric` is verbatim;
 * `bullet` swaps the leading slash-separated index for a coloured bullet;
 * `bracket` rewrites `"01 // THE CLAIM"` to `"[01] THE CLAIM"`; `agentops`
 * ignores the kicker text and emits `"<hint or sceneType uppercased> →"`;
 * `none` returns the empty string so the kicker row stays hidden.
 *
 * Exported for unit tests; the renderer is the only production caller.
 */
export const formatKicker = (
  kicker: string,
  kickerStyle: ChromeTokens['kickerStyle'],
  opts: {readonly sceneType?: string; readonly chromeKickerHint?: string},
): string => {
  if (kickerStyle === 'none') return '';
  if (kickerStyle === 'agentops') {
    const hint = opts.chromeKickerHint?.trim();
    if (hint) return `${hint.toUpperCase()} →`;
    if (opts.sceneType) return `${opts.sceneType.toUpperCase()} →`;
    // Fallback: strip the "NN // " prefix off whatever the author wrote so
    // the result still reads as a span name rather than "01 // FOO →".
    const stripped = kicker.replace(/^\s*\S+\s*\/\/\s*/i, '').trim();
    return stripped ? `${stripped.toUpperCase()} →` : kicker;
  }
  if (kickerStyle === 'bracket') {
    // Match "<head> // <tail>" (head is typically a number or short token).
    const m = kicker.match(/^\s*(\S+)\s*\/\/\s*(.+?)\s*$/);
    if (m) return `[${m[1]}] ${m[2]}`;
    return kicker;
  }
  if (kickerStyle === 'bullet') {
    // Strip a leading "<head> // " and prepend a bullet — keeping just the
    // semantic label. The bullet glyph itself is drawn by the renderer (it
    // wants the accent colour) so this returns just the label.
    const m = kicker.match(/^\s*\S+\s*\/\/\s*(.+?)\s*$/);
    return m ? (m[1] as string) : kicker;
  }
  // 'numeric' — verbatim (the legacy treatment).
  return kicker;
};

export const SceneFrame: React.FC<{
  accentHex: string;
  kicker: string;
  heading?: string | undefined;
  sceneIndex: number;
  sceneCount: number;
  cam?: CameraState | undefined;
  glowScale?: number | undefined;
  // When a caller paints its own backdrop *behind* SceneFrame (e.g. the
  // whiteboard/sketch BigIdeaScene), SceneFrame must NOT paint its dark
  // theme color over that backdrop. Set transparentBackdrop=true and the
  // outer fill goes transparent — caller's backdrop shows through, and
  // the chrome (kicker/heading/progress/wordmark) still draws on top.
  transparentBackdrop?: boolean | undefined;
  style: ResolvedStyle;
  /**
   * Optional — the scene's `type` discriminator. Read ONLY by the chrome
   * `agentops` kicker style when no `chromeKickerHint` is set. Existing
   * callers that omit it degrade to the kicker-text fallback.
   */
  sceneType?: string | undefined;
  /**
   * Optional — free-text override for the `agentops` chrome kicker style
   * (e.g. `"FLOW_DISCOVERY"`). Authors set this on the scene's spec; the
   * scene component threads it through to SceneFrame.
   */
  chromeKickerHint?: string | undefined;
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
  sceneType,
  chromeKickerHint,
  children,
}) => {
  const {bg, ink} = style.tokens;
  const chrome = style.tokens.chrome ?? DEFAULT_CHROME;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  // Aspect-aware world dims — drives the SVG viewBoxes for the starfield
  // and motes layers, and shifts the title band up in portrait so the
  // heading lands inside the chrome's safe area.
  const stage = useStage();
  const isPortrait = stage.worldH > stage.worldW;
  // In 16:9 / square the heading sits at 86 / 180; in portrait we lift it
  // to give the diagram more room — there's no horizontal headroom to
  // spare when the canvas is tall and narrow.
  const titleTop = isPortrait ? 80 : 86;
  const intro = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const t = frame / fps;

  // Multiply the legacy mote count by the chrome token. `0` disables the
  // layer entirely; `2` doubles it. We slice or cycle MOTES so the seed
  // stays deterministic across mote-count changes.
  const targetMoteCount = Math.max(0, Math.round(MOTES.length * chrome.motes));
  const moteSource = useMemo(() => {
    if (targetMoteCount === 0) return [] as typeof MOTES;
    if (targetMoteCount <= MOTES.length) return MOTES.slice(0, targetMoteCount);
    // Doubled (or more) — repeat the base set offset in space so the extra
    // motes don't sit on top of the originals.
    const out = [...MOTES];
    while (out.length < targetMoteCount) {
      const m = MOTES[out.length % MOTES.length]!;
      out.push({
        x: (m.x + 600) % 1920,
        y: (m.y + 380) % 1080,
        rad: m.rad,
        ph: m.ph + 1.3,
        sp: m.sp,
      });
    }
    return out;
  }, [targetMoteCount]);
  const motes = useMemo(
    () =>
      moteSource.map((m) => ({
        ...m,
        cx: m.x + Math.sin(t * m.sp + m.ph) * 60,
        cy: m.y + Math.cos(t * m.sp * 0.8 + m.ph) * 40,
      })),
    [t, moteSource],
  );

  // --- background pattern ----------------------------------------------------
  // Five named patterns. `starfield` is the legacy treatment (stars + dotted
  // grid). The other four replace the structural layer outright.
  const renderBackground = (): React.ReactNode => {
    if (chrome.background === 'flat') return null;
    if (chrome.background === 'gradient') {
      return (
        <AbsoluteFill
          style={{
            transformOrigin: '50% 50%',
            transform: par(cam, 0.1),
            background: `radial-gradient(ellipse at 50% 40%, ${bg.panel} 0%, ${bg.base} 70%)`,
          }}
        />
      );
    }
    if (chrome.background === 'grid') {
      // Dotted grid only — no stars. The grid keeps the same parallax depth
      // as in the legacy `starfield` so a film that swaps to `grid` feels
      // like the same camera, just emptier.
      return (
        <AbsoluteFill
          style={{
            transformOrigin: '50% 50%',
            transform: par(cam, 0.26),
            backgroundImage: `radial-gradient(${bg.line} 1.15px, transparent 1.15px)`,
            backgroundSize: '46px 46px',
            opacity: 0.34,
          }}
        />
      );
    }
    if (chrome.background === 'hex') {
      // Dot-based hex lattice via two offset radial-gradients. Pure CSS, no
      // SVG: a hex grid is just two rectangular dot grids — one shifted by
      // half a tile horizontally AND half vertically. Cheaper than an SVG
      // pattern (no extra DOM nodes) and renders the same on every frame.
      const tile = 56;
      const dot = 1.6;
      return (
        <>
          <AbsoluteFill
            style={{
              transformOrigin: '50% 50%',
              transform: par(cam, 0.18),
              backgroundImage: `radial-gradient(${bg.lineHi} ${dot}px, transparent ${dot}px)`,
              backgroundSize: `${tile}px ${tile * 1.7320508}px`,
              opacity: 0.42,
            }}
          />
          <AbsoluteFill
            style={{
              transformOrigin: '50% 50%',
              transform: par(cam, 0.18),
              backgroundImage: `radial-gradient(${bg.lineHi} ${dot}px, transparent ${dot}px)`,
              backgroundSize: `${tile}px ${tile * 1.7320508}px`,
              backgroundPosition: `${tile / 2}px ${(tile * 1.7320508) / 2}px`,
              opacity: 0.42,
            }}
          />
        </>
      );
    }
    // starfield (default / legacy) — stars + grid.
    return (
      <>
        <AbsoluteFill style={{transformOrigin: '50% 50%', transform: par(cam, 0.1)}}>
          <svg width="100%" height="100%" viewBox={`0 0 ${stage.worldW} ${stage.worldH}`}>
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
      </>
    );
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: transparentBackdrop ? 'transparent' : bg.base,
        fontFamily: interFamily,
      }}
    >
      {renderBackground()}

      {/* accent light — volumetric glow, scaled by the palette's glowScale */}
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

      {/* drifting motes — the nearest ambient layer. `chrome.motes`
          modulates COUNT (see `moteSource` above); a zero count drops the
          layer entirely. */}
      {motes.length > 0 ? (
        <AbsoluteFill style={{transformOrigin: '50% 50%', transform: par(cam, 0.46)}}>
          <svg width="100%" height="100%" viewBox={`0 0 ${stage.worldW} ${stage.worldH}`}>
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
      ) : null}

      {/* vignette — opacity floor multiplied by `chrome.vignette`. The
          legacy treatment dialled the dark stop to `e0` (≈88%); we keep
          that as the `vignette: 1` calibration and scale linearly. */}
      {chrome.vignette > 0 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 74% 66% at 50% 44%, transparent 38%, ${bg.void}${Math.max(0, Math.min(255, Math.round(224 * chrome.vignette))).toString(16).padStart(2, '0')} 100%)`,
          }}
        />
      ) : null}

      {children}

      {/* header — fixed UI overlay, above the parallax. The kicker glyph
          (a square indicator) is part of the legacy chrome; the `bullet`
          style replaces it with a coloured filled-square bullet that sits
          inline with the kicker text. `none` hides the whole row. */}
      <div
        style={{
          position: 'absolute',
          left: isPortrait ? 60 : 120,
          top: titleTop,
          right: isPortrait ? 60 : undefined,
          opacity: intro,
          transform: `translateX(${(1 - intro) * -18}px)`,
        }}
      >
        {chrome.kickerStyle !== 'none' ? (
          <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
            {chrome.kickerStyle === 'bullet' ? (
              // The bullet treatment swaps the legacy small-square indicator
              // for a filled bullet that reads as the kicker glyph itself.
              <div
                style={{
                  width: 12,
                  height: 12,
                  background: accentHex,
                  boxShadow: `0 0 14px ${accentHex}`,
                }}
              />
            ) : (
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: accentHex,
                  boxShadow: `0 0 14px ${accentHex}`,
                }}
              />
            )}
            {/* kicker — single-line auto-shrink with a hard cap. 4-px tracking
                makes "ARCHITECTURE REVIEW · DOCENT" the longest realistic
                kicker; if a film stretches it past the safe band the
                helper falls back to ellipsis rather than overflowing. The
                text itself is reshaped by `formatKicker` per the chrome
                `kickerStyle` — `agentops` reads the scene's type/hint, the
                others reshape the spec-author's kicker text. */}
            <FittedText
              text={formatKicker(kicker, chrome.kickerStyle, {
                ...(sceneType !== undefined ? {sceneType} : {}),
                ...(chromeKickerHint !== undefined ? {chromeKickerHint} : {}),
              })}
              maxWidth={isPortrait ? stage.worldW - 140 : 1480}
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
        ) : null}
        {heading ? (
          // Heading: the safe band is 120→1800px (1680 wide). The legacy
          // step-down handled lengths up to ~80 chars cleanly. FittedText
          // adds a hard cap at 2 lines — past that the trailing line
          // ellipses with a real U+2026 rather than spilling into the
          // chrome below. The tiered base size keeps short headings at
          // 54px (the design intent) and steps to a more-room font for
          // long ones, so the auto-shrink doesn't degrade the common case.
          <FittedText
            text={heading}
            maxWidth={isPortrait ? stage.worldW - 120 : 1680}
            basePx={
              heading.length <= 38
                ? (isPortrait ? 44 : 54)
                : heading.length <= 50
                  ? (isPortrait ? 38 : 46)
                  : heading.length <= 64
                    ? (isPortrait ? 32 : 40)
                    : (isPortrait ? 28 : 34)
            }
            floorPx={isPortrait ? 22 : 26}
            charAdvance={0.55}
            mode="shrink-wrap"
            maxLines={isPortrait ? 3 : 2}
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

      {/* progress */}
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
      {chrome.wordmark !== null ? (
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
          {chrome.wordmark}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
