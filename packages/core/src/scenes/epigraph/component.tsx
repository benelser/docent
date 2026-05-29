import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ResolvedStyle} from '@bjelser/kit';
import {useStage} from '@bjelser/kit';

// EpigraphScene — a cited authority opens the film.
//
// The quiet typographic scene. A short quote in large serif type, the
// attribution beneath in smaller mono. No diagrams, no nodes — the scene exists
// to *anchor in a tradition*: the film enters the argument from a quoted line
// the rest of the film will argue with, not merely decorate from.
//
// Two treatments — `block` (the default) renders the quote centered on its
// own panel, framed by tasteful rules above and below the attribution.
// `pull` renders the quote inline-marginal with a single leading rule, more
// editorial — appropriate for prose-shaped explainer subjects. Both are
// quiet by design; the depth of the scene is in the words.
//
// Migration note (Phase B → D.1): the engine version of this scene wrapped
// its body in `SceneFrame` and laid `Narration` audio on top. Those wrappers
// are engine-internal primitives that have not yet migrated to @bjelser/kit;
// D.1 (Film.tsx → registry dispatch) attaches the frame + narration via the
// engine's scene shell rather than each scene calling them directly. The
// renderer below produces the same `body` element the engine version did —
// the wrappers come back at integration time.

// Translucent accent fills, for glows and panel washes. Inlined from
// packages/engine/src/theme.ts so this scene has no cross-package import
// into the engine's internals (the rip-and-replace forbids that path).
const glow = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
};

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string>;
  return (key && map[key]) || map.blue || '#5cb6ff';
};

export interface EpigraphSceneRendererProps {
  scene: {
    quote?: string;
    attribution?: string;
    epigraphTreatment?: 'block' | 'pull';
  };
  style: ResolvedStyle;
}

export const EpigraphSceneRenderer: React.FC<EpigraphSceneRendererProps> = ({
  scene,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const accentHex = accentOf(style, undefined);
  const ink = style.tokens.ink;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  const quote = scene.quote ?? '';
  const attribution = scene.attribution ?? '';
  // `pull` lays the quote more editorial — left rule, slightly smaller
  // type, asymmetric. `block` (default) centers on its own panel.
  const treatment: 'block' | 'pull' = scene.epigraphTreatment === 'pull' ? 'pull' : 'block';

  // Auto-fit the quote — a 60-word ceiling still varies in character count.
  // The tiered base size keeps short quotes large and steps down for the
  // longer ones so the safe band holds.
  const fontSize =
    quote.length <= 60 ? 64 :
    quote.length <= 120 ? 54 :
    quote.length <= 200 ? 46 :
    40;

  // Two-stage enter: the quote rises first; the attribution follows a beat
  // later, the way an epigraph reads on a printed page.
  const quoteEnter = spring({frame: frame - 8, fps, config: {damping: 200, mass: 1.4}});
  const attrEnter = spring({frame: frame - 36, fps, config: {damping: 200, mass: 1.1}});

  const isPull = treatment === 'pull';
  // Aspect-aware width caps — at 16:9 stay at the legacy 1400/1480/1340.
  const stage = useStage();
  const blockMaxW = stage.worldW === 1920 ? 1480 : stage.worldW - 120;
  const pullMaxW = stage.worldW === 1920 ? 1400 : stage.worldW - 140;
  const pullInnerMaxW = stage.worldW === 1920 ? 1340 : stage.worldW - 200;

  return (
    <AbsoluteFill
      style={{
        alignItems: isPull ? 'flex-start' : 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: isPull ? 36 : 48,
        padding: isPull ? '220px 260px 240px 320px' : '200px 240px 240px',
      }}
    >
      {/* Top rule — only in block treatment; the marginal pull uses a left
          rule attached to the quote itself. */}
      {isPull ? null : (
        <div
          style={{
            width: interpolate(quoteEnter, [0, 1], [0, 120]),
            height: 2,
            background: `linear-gradient(90deg, transparent, ${accentHex}, transparent)`,
            opacity: quoteEnter * 0.75,
          }}
        />
      )}

      {/* The quote — large serif type, the visual centre of the scene. In
          pull treatment a single accent rule sits to its left. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: isPull ? 30 : 0,
          maxWidth: isPull ? pullMaxW : blockMaxW,
          opacity: quoteEnter,
          transform: `translateY(${(1 - quoteEnter) * 14}px)`,
        }}
      >
        {isPull ? (
          <div
            style={{
              width: 3,
              alignSelf: 'stretch',
              background: `linear-gradient(180deg, transparent, ${accentHex}, transparent)`,
              opacity: 0.85,
              borderRadius: 1.5,
              boxShadow: `0 0 12px ${glow(accentHex, 0.45)}`,
            }}
          />
        ) : null}
        {/* FittedText lives in the engine's component library — see migration
            note at the top of this file. Until D.1 brings that primitive
            forward into @bjelser/kit, render the quote as a plain centered/
            left block at the tiered base size. The visual register matches
            the engine version for the common case (≤ 60 words). */}
        <div
          style={{
            // Serif quote — the typographic register of an epigraph. We use
            // the family stack so the engine picks the configured serif when
            // present, with reliable fallbacks.
            fontFamily: `Georgia, "Times New Roman", "Iowan Old Style", ${sansFamily}, serif`,
            fontWeight: 400,
            color: ink.hi,
            letterSpacing: -0.2,
            fontStyle: 'italic',
            textAlign: isPull ? 'left' : 'center',
            textShadow: `0 12px 60px ${glow(accentHex, 0.18)}`,
            fontSize,
            lineHeight: 1.34,
            maxWidth: isPull ? pullInnerMaxW : blockMaxW,
          }}
        >
          {`“${quote}”`}
        </div>
      </div>

      {/* Divider rule between the quote and its attribution. */}
      <div
        style={{
          width: interpolate(attrEnter, [0, 1], [0, isPull ? 140 : 90]),
          height: 1,
          background: accentHex,
          opacity: attrEnter * 0.7,
          marginLeft: isPull ? 33 : 0,
        }}
      />

      {/* Attribution — small mono caps, the way a printed page sets it. */}
      <div
        style={{
          fontFamily: monoFamily,
          fontSize: 22,
          color: ink.mid,
          letterSpacing: 3,
          textTransform: 'uppercase',
          opacity: attrEnter,
          transform: `translateY(${(1 - attrEnter) * 8}px)`,
          textAlign: isPull ? 'left' : 'center',
          marginLeft: isPull ? 33 : 0,
        }}
      >
        — {attribution}
      </div>
    </AbsoluteFill>
  );
};
