import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {glow} from '../theme';
import type {ResolvedStyle} from '../style';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {STAGE} from '../engine/layout';
import {activeBeatIndex, type SceneProps} from '../engine/spec';

// A sequence diagram: actors with lifelines, and messages that arrive one beat
// at a time — the way to show a request, or a unit of data, moving through a
// system over time.
export const WalkthroughScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const {bg, ink, accent: accentTokens} = style.tokens;
  const accentOf = (k?: string): string =>
    (k && ((accentTokens as unknown) as Record<string, string>)[k]) || accentTokens.blue;
  const accentHex = accentOf(scene.accent);
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
              stroke={lit ? accentHex : bg.lineHi}
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
            <div
              style={{
                fontFamily: interFamily,
                fontSize:
                  a.label.length <= 14 ? 22 : a.label.length <= 20 ? 18 : 15,
                fontWeight: 600,
                color: ink.hi,
                textAlign: 'center',
                lineHeight: 1.1,
                maxWidth: '100%',
              }}
            >
              {a.label}
            </div>
            {a.sub ? (
              <div
                style={{
                  fontFamily: monoFamily,
                  fontSize:
                    a.sub.length <= 24 ? 13 : a.sub.length <= 34 ? 11 : 10,
                  color: ink.low,
                  textAlign: 'center',
                  lineHeight: 1.2,
                  maxWidth: '100%',
                }}
              >
                {a.sub}
              </div>
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
        return (
          <div
            key={b.id}
            style={{
              position: 'absolute',
              left: midX,
              top: y - (self ? 14 : 40),
              transform: 'translateX(-50%)',
              opacity: labelIn * (isCurrent ? 1 : 0.5),
              fontFamily: monoFamily,
              fontSize: 16.5,
              letterSpacing: 0.3,
              color: isCurrent ? ink.hi : ink.mid,
              whiteSpace: 'nowrap',
              background: bg.base,
              padding: '2px 12px',
              borderRadius: 6,
            }}
          >
            <span style={{color: m.kind === 'reply' ? ink.low : accentHex}}>
              {m.kind === 'reply' ? '◁ ' : '▶ '}
            </span>
            {m.label}
          </div>
        );
      })}

      <Narration beats={ts.beats} />
    </SceneFrame>
  );
};
