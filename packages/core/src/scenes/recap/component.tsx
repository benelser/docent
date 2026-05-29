// RecapScene — the closing chrome move that formalizes what the film
// argued.
//
// Migrated from packages/engine/src/scenes/RecapScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. Behavior is UNCHANGED from
// the v2.5.x renderer; only import paths and the prop shape were
// updated:
//   - props receive `SceneRenderProps<RecapSceneSpec>` from @bjelser/kit
//     (the kit-owned `{scene, common}` envelope), rather than the
//     legacy `SceneProps` (the engine-owned `ts: TimedScene` envelope).
//   - the engine-shared chrome (SceneFrame, Narration, FittedText,
//     fonts, glow, activeBeatIndex) lives as colocated helpers in this
//     scene's directory until the shared-infra migration agent lands;
//     the integrator will swap the underscore-prefixed local helpers
//     for shared imports at merge time.
//   - the legacy `TimedBeat.from` is read through `BeatTimelineSlot.
//     startFrame`; the legacy numeric `beat.reveal` (a 1-based point
//     index — the recap scene's only beat-level field) is read through
//     the kit Beat's open index signature, since the kit-level
//     `Beat.reveal` is typed `string[]` but the recap's reveal is a
//     number. Behavior is unchanged.

import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ResolvedStyle, SceneRenderProps} from '@bjelser/kit';
import {useStage} from '@bjelser/kit';

import {FittedText, Narration, SceneFrame, activeBeatIndex, glow} from '../../_shared';
import type {RecapScene as RecapSceneSpec} from './validate';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string>;
  return (key && map[key]) || map.blue || '#3B82F6';
};

// The recap's beats carry a legacy NUMERIC `reveal` — the 1-based index
// of the point this beat surfaces (the v2.5.x shape, preserved
// byte-equivalently). The kit's `Beat.reveal` is typed as a string[]
// (a node-id list — meaningful for `structure` and friends), so we read
// the recap-specific shape via the open index signature.
const numericReveal = (beat: unknown): number | undefined => {
  const v = (beat as {reveal?: unknown}).reveal;
  return typeof v === 'number' ? v : undefined;
};

export const RecapSceneComponent: React.FC<SceneRenderProps<RecapSceneSpec>> = ({
  scene,
  common,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  const accentHex = accentOf(style, undefined);
  const points = scene.points ?? [];
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;
  // Aspect-aware column width — at 16:9 the recap column is 1680 wide
  // starting at left=120 (the legacy hand-tuned safe band). In portrait /
  // square the column shrinks to the worldW minus chrome margins so the
  // numbered points don't overflow.
  const stage = useStage();
  const colLeft = stage.worldW === 1920 ? 120 : 60;
  const colWidth = stage.worldW === 1920 ? 1680 : stage.worldW - colLeft * 2;
  const colTop = stage.worldH === 1080 ? 268 : 320;

  // The reveal frame for point i is the `startFrame` of the first beat
  // whose numeric `reveal` reaches i+1.
  const revealFrameFor = (i: number): number => {
    const b = ts.beats.find((bt) => {
      const r = numericReveal(bt.beat);
      return typeof r === 'number' && r >= i + 1;
    });
    return b ? b.startFrame : 0;
  };

  const active = activeBeatIndex(ts.beats, frame);
  const closing = frame > (ts.beats[active]?.startFrame ?? 0) + 30;

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      {/* Explicitly positioned column — the SceneFrame heading sits at top:86
          with a 54px line, so points must start safely below it. Using an
          absolute `top` (rather than a centred AbsoluteFill) so the heading
          can never collide with point 1, regardless of points count. */}
      <div
        style={{
          position: 'absolute',
          left: colLeft,
          top: colTop,
          width: colWidth,
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        {points.map((p, i) => {
          const local = frame - revealFrameFor(i);
          const a =
            local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});
          // Auto-fit font: long points shrink so they don't wrap into many
          // lines that push the next row out of the safe area.
          const fs = p.length <= 70 ? 32 : p.length <= 110 ? 28 : 25;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 26,
                opacity: a,
                transform: `translateX(${interpolate(a, [0, 1], [-26, 0])}px)`,
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 12,
                  flexShrink: 0,
                  background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
                  border: `1.5px solid ${accentHex}`,
                  boxShadow: `0 0 22px -6px ${glow(accentHex, 0.6)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: monoFamily,
                  fontSize: 22,
                  fontWeight: 600,
                  color: accentHex,
                  marginTop: 2,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              {/* Bullet text. Available width inside the row is
                  1680 - (54 + 26) = 1600px. Allow up to 4 wrapped lines
                  per bullet, then auto-shrink past that — so a very
                  long bullet stays inside the safe band without
                  pushing later bullets off-screen. */}
              <FittedText
                text={p}
                maxWidth={1600}
                basePx={fs}
                floorPx={16}
                charAdvance={0.55}
                mode="shrink-wrap"
                maxLines={4}
                lineHeight={1.32}
                style={{
                  fontFamily: sansFamily,
                  fontWeight: 500,
                  color: ink.hi,
                  letterSpacing: -0.3,
                  flex: 1,
                  minWidth: 0,
                }}
              />
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          left: colLeft,
          bottom: 130,
          fontFamily: monoFamily,
          fontSize: 22,
          letterSpacing: 2,
          color: ink.low,
          opacity: closing ? 1 : 0,
        }}
      >
        surveyed from source · docent
      </div>
      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
