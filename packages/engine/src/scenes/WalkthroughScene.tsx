import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {accent, theme, glow} from '../theme';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {FittedText} from '../components/FittedText';
import {STAGE} from '../engine/layout';
import {activeBeatIndex, type SceneProps} from '../engine/spec';

// A sequence diagram: actors with lifelines, and messages that arrive one beat
// at a time — the way to show a request, or a unit of data, moving through a
// system over time.
export const WalkthroughScene: React.FC<SceneProps> = ({
  ts,
  sceneIndex,
  sceneCount,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accent(scene.accent);
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

  const messages = ts.beats.filter((b) => b.message);
  const msgTop = lifeTop + 96;
  const rowGap = Math.min(
    108,
    (lifeBottom - 64 - msgTop) / Math.max(1, messages.length - 1),
  );

  const intro = spring({frame, fps, config: {damping: 200}});
  const active = activeBeatIndex(ts.beats, frame);
  const curMsg = ts.beats[active]?.message;

  return (
    <SceneFrame
      accentHex={accentHex}
      kicker={scene.kicker}
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
              stroke={lit ? accentHex : theme.bg.lineHi}
              strokeWidth={lit ? 2 : 1.5}
              strokeDasharray="2 10"
              strokeDashoffset={-((frame * 1.1) % 24)}
              opacity={(lit ? 0.75 : 0.4) * intro}
            />
          );
        })}

        {/* messages */}
        {messages.map((b, mi) => {
          const m = b.message;
          if (!m) return null;
          const y = msgTop + mi * rowGap;
          const local = frame - b.from;
          if (local < 0) return null;
          const draw = spring({frame: local, fps, config: {damping: 200, mass: 0.5}});
          const isCurrent = b === ts.beats[active];
          const op = (isCurrent ? 1 : 0.42) * intro;
          const x1 = actorX[m.from];
          const x2 = actorX[m.to];
          const ret = m.kind === 'reply';
          const self = m.from === m.to;

          if (self) {
            const r = 78;
            const d = `M ${x1} ${y} L ${x1 + r} ${y} L ${x1 + r} ${y + 34} L ${x1 + 11} ${y + 34}`;
            return (
              <g key={b.id} opacity={op}>
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
            <g key={b.id} opacity={op}>
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
              background: `linear-gradient(158deg, ${theme.bg.panelHi}, ${theme.bg.panel})`,
              border: `1.5px solid ${lit ? accentHex : theme.bg.line}`,
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
                color: theme.ink.hi,
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
                  color: theme.ink.low,
                  textAlign: 'center',
                }}
              />
            ) : null}
          </div>
        );
      })}

      {/* message labels */}
      {messages.map((b, mi) => {
        const m = b.message;
        if (!m) return null;
        const local = frame - b.from;
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
        return (
          <div
            key={b.id}
            style={{
              position: 'absolute',
              left: midX,
              top: y - (self ? 14 : 40),
              transform: 'translateX(-50%)',
              opacity: labelIn * (isCurrent ? 1 : 0.5),
              background: theme.bg.base,
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
                color: m.kind === 'reply' ? theme.ink.low : accentHex,
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
                color: isCurrent ? theme.ink.hi : theme.ink.mid,
              }}
            />
          </div>
        );
      })}

      <Narration beats={ts.beats} />
    </SceneFrame>
  );
};
