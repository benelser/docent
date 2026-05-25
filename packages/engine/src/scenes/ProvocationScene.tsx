import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {glow} from '../theme';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {FittedText} from '../components/FittedText';
import type {SceneProps} from '../engine/spec';
import type {ResolvedStyle} from '../style';

// ProvocationScene — an incomplete closing that hands the question to the
// viewer.
//
// The right ending for a research-frontier or open-policy film: "and this is
// where we don't know yet." A provocation is mutually exclusive with the
// big-idea — a film either COMMITS to a takeaway, or HANDS OFF an open
// question. The validator enforces the position contract (last scene of the
// film) and the mutual exclusion.
//
// Render contract: a quiet final scene, typographically intense. The
// `unresolved` question renders in display-size type with a trailing
// ellipsis; the `why` and `invitation` sit beneath in muted ink. No chrome
// beyond the SceneFrame kicker/heading — this is the moment the film hands
// the viewer the next question.

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string>;
  return (key && map[key]) || map.blue;
};

export const ProvocationScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accentOf(style, undefined);
  const ink = style.tokens.ink;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  // Strip any trailing punctuation the author may have written, then append
  // an em-ellipsis. The provocation's typography IS the ellipsis: the
  // question is deliberately open.
  const raw = (scene.unresolved ?? '').trim().replace(/[.?…]+$/, '');
  const unresolved = raw + '…';
  const why = scene.why ?? '';
  const invitation = scene.invitation ?? '';

  // Tiered font size for the unresolved question — it is the visual centre.
  const fontSize =
    raw.length <= 50 ? 88 :
    raw.length <= 90 ? 70 :
    raw.length <= 140 ? 58 :
    48;

  // Three-stage enter — the question first (the eye lands on it), then the
  // why, then the invitation. The invitation arrives last and lingers.
  const questionEnter = spring({frame: frame - 10, fps, config: {damping: 200, mass: 1.4}});
  const whyEnter = spring({frame: frame - 42, fps, config: {damping: 200, mass: 1.2}});
  const invitationEnter = spring({frame: frame - 72, fps, config: {damping: 200, mass: 1.2}});

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 56,
          padding: '200px 200px 240px',
        }}
      >
        {/* The unresolved — display-size, the accent glow under it. */}
        <div
          style={{
            opacity: questionEnter,
            transform: `translateY(${(1 - questionEnter) * 18}px)`,
            maxWidth: 1480,
            textAlign: 'center',
          }}
        >
          <FittedText
            text={unresolved}
            maxWidth={1480}
            basePx={fontSize}
            floorPx={36}
            charAdvance={0.55}
            mode="shrink-wrap"
            maxLines={4}
            lineHeight={1.16}
            style={{
              fontFamily: sansFamily,
              fontWeight: 600,
              color: ink.hi,
              letterSpacing: -0.6,
              textAlign: 'center',
              textShadow: `0 16px 80px ${glow(accentHex, 0.28)}`,
            }}
          />
        </div>

        {/* Accent rule — a deliberately open one: a single dot at the end
            instead of a closing tick, the visual echo of the typographic
            ellipsis above. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            opacity: whyEnter * 0.75,
          }}
        >
          <div
            style={{
              width: interpolate(whyEnter, [0, 1], [0, 200]),
              height: 2,
              background: `linear-gradient(90deg, transparent, ${accentHex}, transparent)`,
            }}
          />
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              background: accentHex,
              boxShadow: `0 0 8px ${accentHex}`,
            }}
          />
        </div>

        {/* The why — quiet mono kicker + sans body. Names why the film
            leaves the question open. */}
        {why ? (
          <div
            style={{
              maxWidth: 1280,
              textAlign: 'center',
              opacity: whyEnter,
              transform: `translateY(${(1 - whyEnter) * 10}px)`,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontFamily: monoFamily,
                fontSize: 16,
                color: ink.low,
                letterSpacing: 3,
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              why this stays open
            </div>
            <FittedText
              text={why}
              maxWidth={1280}
              basePx={26}
              floorPx={18}
              charAdvance={0.55}
              mode="shrink-wrap"
              maxLines={3}
              lineHeight={1.36}
              style={{
                fontFamily: sansFamily,
                fontWeight: 400,
                color: ink.mid,
                letterSpacing: -0.2,
                textAlign: 'center',
                fontStyle: 'italic',
              }}
            />
          </div>
        ) : null}

        {/* The invitation — what the viewer is asked to do with the open
            question. The closing breath of the film. */}
        {invitation ? (
          <div
            style={{
              maxWidth: 1280,
              textAlign: 'center',
              opacity: invitationEnter,
              transform: `translateY(${(1 - invitationEnter) * 8}px)`,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontFamily: monoFamily,
                fontSize: 16,
                color: accentHex,
                letterSpacing: 3,
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              your turn
            </div>
            <FittedText
              text={invitation}
              maxWidth={1280}
              basePx={26}
              floorPx={18}
              charAdvance={0.55}
              mode="shrink-wrap"
              maxLines={3}
              lineHeight={1.36}
              style={{
                fontFamily: sansFamily,
                fontWeight: 500,
                color: ink.hi,
                letterSpacing: -0.2,
                textAlign: 'center',
              }}
            />
          </div>
        ) : null}
      </AbsoluteFill>
      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
