// WalkthroughScene — a sequence diagram: actors with lifelines, and
// messages that arrive one beat at a time — the way to show a request,
// or a unit of data, moving through a system over time.
//
// Migrated from packages/engine/src/scenes/WalkthroughScene.tsx as part
// of the v3.0 plugin-architecture rip-and-replace. Behavior is UNCHANGED
// from the v2.5.x renderer; only import paths and the prop shape were
// updated:
//   - props receive `SceneRenderProps<WalkthroughScene>` from
//     @docent/kit (the kit-owned `{scene, common}` envelope), rather
//     than the legacy `SceneProps` (the engine-owned `ts: TimedScene`
//     envelope).
//   - beat timing reads `b.startFrame` / `b.frames` (kit's
//     BeatTimelineSlot) rather than `b.from` / `b.durationInFrames`
//     (engine's TimedBeat). Beat-level fields (`message`, `id`) read
//     through `b.beat.*` since the kit nests the user-declared beat under
//     `beat`.
//   - the engine-shared chrome (SceneFrame, Narration, FittedText, fonts,
//     glow, activeBeatIndex) lives as colocated helpers in this scene's
//     directory until the shared-infra migration agent lands; the
//     integrator will swap the underscore-prefixed local helpers for
//     shared imports at merge time.
//   - the engine's `STAGE` constant (the central 1450×560 region inside
//     the 1920×1080 frame) is inlined here — it ships from
//     packages/engine/src/engine/layout.ts in v2.5.x and the shared-infra
//     migration will hoist it back out.

import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ResolvedStyle, SceneRenderProps} from '@docent/kit';

import {
  FittedText,
  Narration,
  SceneFrame,
  activeBeatIndex,
  glow,
  interFamily,
  monoFamily,
} from '../../_shared';
import type {WalkthroughScene as WalkthroughSceneSpec} from './validate';

// Mirror of packages/engine/src/engine/layout.ts:STAGE — the central
// region inside the 1920×1080 frame the scene body draws within.
const STAGE = {x: 235, y: 338, w: 1450, h: 560};

interface WalkthroughMessage {
  from: string;
  to: string;
  label: string;
  kind?: 'forward' | 'reply' | 'aside';
}

const messageOf = (
  beat: {readonly [key: string]: unknown} | undefined,
): WalkthroughMessage | undefined => {
  const m = beat?.message;
  if (!m || typeof m !== 'object') return undefined;
  const rec = m as Record<string, unknown>;
  if (
    typeof rec.from !== 'string' ||
    typeof rec.to !== 'string' ||
    typeof rec.label !== 'string'
  ) {
    return undefined;
  }
  return rec as unknown as WalkthroughMessage;
};

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string | undefined>;
  return (key ? map[key] : undefined) ?? map.blue ?? '#5cb6ff';
};

export const WalkthroughSceneComponent: React.FC<
  SceneRenderProps<WalkthroughSceneSpec>
> = ({scene, common}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  const {bg, ink} = style.tokens;
  const accentHex = accentOf(style, undefined);
  const actors = scene.actors ?? [];

  const lifeTop = 366;
  const lifeBottom = 966;
  const left = STAGE.x + 140;
  const right = STAGE.x + STAGE.w - 140;
  const actorX: Record<string, number> = {};
  actors.forEach((a, i) => {
    actorX[a.id] =
      actors.length === 1
        ? (left + right) / 2
        : left + (i * (right - left)) / (actors.length - 1);
  });

  const messageSlots = ts.beats.filter((b) => messageOf(b.beat));
  const msgTop = lifeTop + 96;
  const rowGap = Math.min(
    108,
    (lifeBottom - 64 - msgTop) / Math.max(1, messageSlots.length - 1),
  );

  const intro = spring({frame, fps, config: {damping: 200}});
  const active = activeBeatIndex(ts.beats, frame);
  const curMsg = messageOf(ts.beats[active]?.beat);

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <svg
        style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
        viewBox="0 0 1920 1080"
      >
        {/* lifelines */}
        {actors.map((a) => {
          const x = actorX[a.id];
          const lit = Boolean(curMsg && (curMsg.from === a.id || curMsg.to === a.id));
          return (
            <line
              key={a.id}
              x1={x}
              y1={lifeTop}
              x2={x}
              y2={lifeTop + (lifeBottom - lifeTop) * intro}
              stroke={lit ? accentHex : bg.lineHi}
              strokeWidth={lit ? 2 : 1.5}
              strokeDasharray="2 10"
              strokeDashoffset={-((frame * 1.1) % 24)}
              opacity={(lit ? 0.75 : 0.4) * intro}
            />
          );
        })}

        {/* messages */}
        {messageSlots.map((b, mi) => {
          const m = messageOf(b.beat);
          if (!m) return null;
          const y = msgTop + mi * rowGap;
          const local = frame - b.startFrame;
          if (local < 0) return null;
          const draw = spring({frame: local, fps, config: {damping: 200, mass: 0.5}});
          const isCurrent = b === ts.beats[active];
          const op = (isCurrent ? 1 : 0.42) * intro;
          const x1 = actorX[m.from];
          const x2 = actorX[m.to];
          const ret = m.kind === 'reply';
          const self = m.from === m.to;
          const key = (typeof b.beat.id === 'string' && b.beat.id) || `msg-${b.beatIndex}`;

          if (self) {
            const r = 78;
            const d = `M ${x1} ${y} L ${x1 + r} ${y} L ${x1 + r} ${y + 34} L ${x1 + 11} ${y + 34}`;
            return (
              <g key={key} opacity={op}>
                <path
                  d={d}
                  fill="none"
                  stroke={accentHex}
                  strokeWidth={2.6}
                  strokeDasharray={ret ? '8 7' : undefined}
                  opacity={draw}
                />
                <path
                  d={`M ${x1 + 11} ${y + 34} l 15 -7 l 0 14 Z`}
                  fill={accentHex}
                  opacity={Math.max(0, (draw - 0.7) / 0.3)}
                />
              </g>
            );
          }

          const dir = x2 > x1 ? 1 : -1;
          const xEnd = x1 + (x2 - x1) * draw;
          const headAt = Math.max(0, (draw - 0.78) / 0.22);
          // comet on the current message
          const ct = isCurrent
            ? interpolate(local, [10, 34], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })
            : 1;
          const cx = x1 + (x2 - x1) * ct - dir * 14;
          return (
            <g key={key} opacity={op}>
              <line
                x1={x1}
                y1={y}
                x2={xEnd}
                y2={y}
                stroke={accentHex}
                strokeWidth={ret ? 2.4 : 3}
                strokeLinecap="round"
                strokeDasharray={ret ? '9 8' : '13 13'}
                strokeDashoffset={ret ? 0 : -((frame * (isCurrent ? 2.4 : 1.4)) % 26)}
                style={{filter: `drop-shadow(0 0 5px ${glow(accentHex, isCurrent ? 0.6 : 0.3)})`}}
              />
              <path
                d={`M ${x2} ${y} l ${-dir * 17} -8 l 0 16 Z`}
                fill={accentHex}
                opacity={headAt}
              />
              {isCurrent && ct > 0.02 && ct < 0.99 ? (
                <circle
                  cx={cx}
                  cy={y}
                  r={8}
                  fill={accentHex}
                  style={{filter: `drop-shadow(0 0 12px ${accentHex})`}}
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* actor headers */}
      {actors.map((a) => {
        const x = actorX[a.id];
        const lit = Boolean(curMsg && (curMsg.from === a.id || curMsg.to === a.id));
        return (
          <div
            key={a.id}
            style={{
              position: 'absolute',
              left: x - 116,
              top: lifeTop - 96,
              width: 232,
              height: 80,
              opacity: intro,
              borderRadius: 13,
              background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
              border: `1.5px solid ${lit ? accentHex : bg.line}`,
              boxShadow: lit
                ? `0 0 26px -6px ${glow(accentHex, 0.6)}`
                : '0 14px 34px -22px #000000cc',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              overflow: 'hidden',
              padding: '8px 12px',
              boxSizing: 'border-box',
            }}
          >
            {/* actor label / sub — the actor pill is 232px wide with 12px
                horizontal padding (~208px content). Allow up to 2 wrapped
                lines for long actor names ("Distributed Coordination
                Service"); auto-shrink kicks in past the wrap budget. */}
            <FittedText
              text={a.label}
              maxWidth={208}
              basePx={a.label.length <= 14 ? 22 : a.label.length <= 20 ? 18 : 15}
              floorPx={12}
              charAdvance={0.58}
              mode="shrink-wrap"
              maxLines={2}
              lineHeight={1.1}
              style={{
                fontFamily: interFamily,
                fontWeight: 600,
                color: ink.hi,
                textAlign: 'center',
              }}
            />
            {a.sub ? (
              <FittedText
                text={a.sub}
                maxWidth={208}
                basePx={a.sub.length <= 24 ? 13 : a.sub.length <= 34 ? 11 : 10}
                floorPx={9}
                charAdvance={0.62}
                mode="shrink-wrap"
                maxLines={2}
                lineHeight={1.2}
                style={{
                  fontFamily: monoFamily,
                  color: ink.low,
                  textAlign: 'center',
                }}
              />
            ) : null}
          </div>
        );
      })}

      {/* message labels */}
      {messageSlots.map((b, mi) => {
        const m = messageOf(b.beat);
        if (!m) return null;
        const local = frame - b.startFrame;
        if (local < 6) return null;
        const y = msgTop + mi * rowGap;
        const isCurrent = b === ts.beats[active];
        const self = m.from === m.to;
        const x1 = actorX[m.from];
        const x2 = actorX[m.to];
        const midX = self ? x1 + 92 : (x1 + x2) / 2;
        const labelIn = interpolate(local, [6, 20], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        // message label — the message label sits on its message line,
        // between the two actor lifelines. The chord length is
        // |x2-x1| (or 92 for a self-message); we budget 86% of that
        // so the label keeps clear air on each side, with a 200-px
        // minimum so a tight cluster still reads. Single-line shrink
        // so the label rides the wire; floor at 11px before
        // U+2026 truncation.
        const chord = self ? 184 : Math.abs(x2 - x1);
        const maxW = Math.max(200, Math.min(720, chord * 0.86 - 32));
        const key = (typeof b.beat.id === 'string' && b.beat.id) || `lbl-${b.beatIndex}`;
        return (
          <div
            key={key}
            style={{
              position: 'absolute',
              left: midX,
              top: y - (self ? 14 : 40),
              transform: 'translateX(-50%)',
              opacity: labelIn * (isCurrent ? 1 : 0.5),
              background: bg.base,
              padding: '2px 12px',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              maxWidth: maxW + 32,
            }}
          >
            <span
              style={{
                color: m.kind === 'reply' ? ink.low : accentHex,
                fontFamily: monoFamily,
                fontSize: 16.5,
                flexShrink: 0,
                marginRight: 6,
              }}
            >
              {m.kind === 'reply' ? '◁' : '▶'}
            </span>
            <FittedText
              text={m.label}
              maxWidth={maxW}
              basePx={16.5}
              floorPx={11}
              charAdvance={0.6}
              mode="shrink-single"
              style={{
                fontFamily: monoFamily,
                letterSpacing: 0.3,
                color: isCurrent ? ink.hi : ink.mid,
              }}
            />
          </div>
        );
      })}

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
