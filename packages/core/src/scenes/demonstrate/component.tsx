// DemonstrateScene — the docent move that *shows the phenomenon
// itself*: an embedded screen-capture clip, framed in a device-style
// panel, with the narration playing over it.
//
// Migrated from packages/engine/src/scenes/DemonstrateScene.tsx as part
// of the v3.0 plugin-architecture rip-and-replace. Behavior is
// UNCHANGED from the v2.5.x renderer; only import paths and the prop
// shape were updated:
//   - props receive `SceneRenderProps<DemonstrateSceneSpec>` from
//     @docent/kit (the kit-owned `{scene, common}` envelope) rather
//     than the legacy `SceneProps` (the engine-owned `ts: TimedScene`
//     envelope).
//   - the engine-shared chrome (SceneFrame, Narration, FittedText,
//     fonts, glow) lives as colocated helpers in this scene's
//     directory until the shared-infra migration agent lands; the
//     integrator will swap the underscore-prefixed local helpers for
//     shared imports at merge time.
//
// When the clip is absent the scene degrades to a centred placeholder
// panel — it must never crash on a missing file. The placeholder
// re-uses the scene heading as its caption and surfaces a
// "clip unavailable" annotation in mono ink-low.

import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {ResolvedStyle, SceneRenderProps} from '@docent/kit';

import {FittedText, Narration, SceneFrame, glow} from '../../_shared';
import type {DemonstrateScene as DemonstrateSceneSpec} from './validate';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string>;
  return (key && map[key]) || map.blue;
};

export const DemonstrateSceneComponent: React.FC<
  SceneRenderProps<DemonstrateSceneSpec>
> = ({scene, common}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, meta, style} = common;
  const accentHex = accentOf(style, undefined);
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  // The v2.5.x DemonstrateScene captioned the placeholder with
  // `meta.subject · demonstration`. The kit's canonical FilmMeta does
  // not carry `subject` (the engine-side FilmSpec did; the kit lifted
  // a smaller closed shape). To preserve the v2.5.x caption byte for
  // byte when a subject is present (every existing film carries it),
  // read it through the open shape and fall back to `meta.title` so
  // the placeholder remains useful even when no subject is set.
  const subjectish =
    (meta as {subject?: unknown}).subject &&
    typeof (meta as {subject?: unknown}).subject === 'string'
      ? ((meta as {subject?: unknown}).subject as string)
      : meta.title;

  const intro = spring({frame, fps, config: {damping: 200}});
  const scale = interpolate(intro, [0, 1], [0.94, 1]);

  // The framed stage the clip (or placeholder) sits inside.
  const panelW = 1340;
  const panelH = 632;

  const panelStyle: React.CSSProperties = {
    width: panelW,
    height: panelH,
    opacity: intro,
    transform: `scale(${scale})`,
    borderRadius: 18,
    overflow: 'hidden',
    background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
    border: `1.5px solid ${accentHex}`,
    boxShadow: `0 0 0 1px ${glow(accentHex, 0.3)}, 0 40px 90px -36px #000000ee`,
    display: 'flex',
    flexDirection: 'column',
  };

  // A title bar, so the clip reads as a captured window.
  const titleBar = (
    <div
      style={{
        height: 46,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 18px',
        background: bg.void,
        borderBottom: `1px solid ${bg.line}`,
      }}
    >
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
        <div key={c} style={{width: 12, height: 12, borderRadius: '50%', background: c, opacity: 0.85}} />
      ))}
      {/* clip caption — sits in the title bar. The panel is 1340px wide
          with ~76px reserved for the traffic-light dots; cap the caption
          at the remaining width and let it shrink rather than overflow. */}
      <FittedText
        text={scene.clip ? scene.clip : `${subjectish} · demonstration`}
        maxWidth={1340 - 76 - 36}
        basePx={14}
        floorPx={10}
        charAdvance={0.62}
        mode="shrink-single"
        style={{
          marginLeft: 14,
          fontFamily: monoFamily,
          letterSpacing: 0.6,
          color: ink.low,
        }}
      />
    </div>
  );

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div style={{...panelStyle, marginTop: 36}}>
          {titleBar}
          {scene.clip ? (
            <OffthreadVideo
              src={staticFile(`clips/${meta.id}/${scene.clip}`)}
              style={{width: '100%', height: '100%', objectFit: 'contain', background: bg.void}}
            />
          ) : (
            // graceful placeholder — no clip, no crash
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                background: `radial-gradient(circle at 50% 42%, ${glow(accentHex, 0.08)} 0%, transparent 64%)`,
              }}
            >
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  border: `2px solid ${accentHex}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 0 30px -6px ${glow(accentHex, 0.6)}`,
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    marginLeft: 6,
                    borderTop: '15px solid transparent',
                    borderBottom: '15px solid transparent',
                    borderLeft: `24px solid ${accentHex}`,
                  }}
                />
              </div>
              <div
                style={{
                  fontFamily: sansFamily,
                  fontSize: 28,
                  fontWeight: 600,
                  color: ink.hi,
                }}
              >
                {scene.heading ?? 'Demonstration'}
              </div>
              <div
                style={{
                  fontFamily: monoFamily,
                  fontSize: 16,
                  letterSpacing: 1,
                  color: ink.low,
                }}
              >
                clip unavailable · narrated walkthrough
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
