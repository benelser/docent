import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {accent, theme, glow} from '../theme';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {activeBeatIndex, type SceneProps} from '../engine/spec';
import {
  cadenceOffset,
  cadenceSpringConfig,
  numericRevealMap,
  paletteGlowScale,
  paletteSceneHex,
} from '../engine/knobs';

// An ordered timeline track: stages laid left-to-right along a path, each a
// marker with a label, sub, and the duration of its segment. A `gate` stage is
// preceded by a distinct milestone diamond. `flow: 'cycle'` curves the track
// back to its start. Stages appear one beat at a time.
export const ProgressionScene: React.FC<SceneProps> = ({
  ts,
  sceneIndex,
  sceneCount,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  // `palette` (a scene knob) re-selects the chrome accent over its family;
  // without a palette this is exactly `accent(scene.accent)`.
  const accentHex = paletteSceneHex(scene.palette, scene.accent);
  const stages = scene.stages ?? [];
  const cycle = scene.flow === 'cycle';

  // `cadence` (a beat knob) shapes how the set of stages a beat reveals
  // enters. The numeric-reveal map gives, per stage index, the revealing
  // beat's frame, its cadence, and the stage's order within that beat's
  // batch. A knob-free scene yields `from` == the original `revealFrameFor`.
  const reveals = numericRevealMap(ts.beats, stages.length);
  // The base reveal frame (no cadence stagger) — used by the track-grow,
  // which advances toward the latest stage rather than per-item.
  const revealFrameFor = (i: number): number => reveals[i]?.from ?? 0;
  // The cadence-staggered entrance frame for stage i's marker/card.
  const stageEnterFor = (i: number): number => {
    const r = reveals[i];
    return r ? r.from + cadenceOffset(r.cadence, r.order) : 0;
  };

  const active = activeBeatIndex(ts.beats, frame);
  const focusIds = new Set(ts.beats[active]?.focus ?? []);
  const hasFocus = focusIds.size > 0;

  // Track geometry. Stages sit evenly along a horizontal band; a cycle adds a
  // returning arc below.
  const left = 270;
  const right = 1650;
  const trackY = 560;
  const n = Math.max(1, stages.length);
  const stageX = (i: number): number =>
    n === 1 ? (left + right) / 2 : left + (i * (right - left)) / (n - 1);

  // How far the track has been drawn — it grows toward the latest revealed
  // stage as that stage springs in.
  const lastRevealed = stages.reduce(
    (acc, _s, i) => (frame >= revealFrameFor(i) ? i : acc),
    -1,
  );
  const lineGrow = (() => {
    if (lastRevealed < 0) return 0;
    if (n === 1) return 1;
    const local = frame - revealFrameFor(lastRevealed);
    const p = local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200}});
    const prev = Math.max(0, lastRevealed - 1) / (n - 1);
    const here = lastRevealed / (n - 1);
    return prev + (here - prev) * p;
  })();
  const lineEnd = left + (right - left) * Math.min(1, lineGrow);

  return (
    <SceneFrame
      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      glowScale={paletteGlowScale(scene.palette)}
    >
      <AbsoluteFill>
        <svg
          style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
          viewBox="0 0 1920 1080"
        >
          {/* the resting track */}
          <line
            x1={left}
            y1={trackY}
            x2={right}
            y2={trackY}
            stroke={theme.bg.line}
            strokeWidth={3}
            strokeLinecap="round"
          />
          {/* the drawn-so-far track */}
          <line
            x1={left}
            y1={trackY}
            x2={lineEnd}
            y2={trackY}
            stroke={accentHex}
            strokeWidth={3.5}
            strokeLinecap="round"
            style={{filter: `drop-shadow(0 0 8px ${glow(accentHex, 0.5)})`}}
          />
          {/* cycle: a returning arc back to the start */}
          {cycle ? (
            <path
              d={`M ${right} ${trackY} C ${right + 90} ${trackY + 180}, ${left - 90} ${trackY + 180}, ${left} ${trackY}`}
              fill="none"
              stroke={lastRevealed >= n - 1 ? accentHex : theme.bg.line}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray="10 9"
              strokeDashoffset={-((frame * 1.3) % 38)}
              opacity={lastRevealed >= n - 1 ? 0.8 : 0.4}
            />
          ) : null}
        </svg>

        {stages.map((s, i) => {
          const local = frame - stageEnterFor(i);
          const a =
            local <= 0
              ? 0
              : spring({frame: local, fps, config: cadenceSpringConfig(reveals[i]?.cadence)});
          if (a <= 0) return null;
          const x = stageX(i);
          const focused = focusIds.has(s.id);
          const dim = hasFocus && !focused;
          const opacity = a * (dim ? 0.34 : 1);
          const scale = interpolate(a, [0, 1], [0.86, 1]);
          const breathe = focused ? 0.5 + 0.5 * Math.sin((frame / fps) * 3.2) : 0;
          // The segment between this stage and the next carries the duration.
          const segDur = s.duration && i < n - 1;

          return (
            <React.Fragment key={s.id}>
              {/* gate milestone — a diamond sitting just before the stage */}
              {s.gate ? (
                <div
                  style={{
                    position: 'absolute',
                    left: x - (i === 0 ? 0 : 78) - 13,
                    top: trackY - 13,
                    width: 26,
                    height: 26,
                    opacity,
                    transform: 'rotate(45deg)',
                    background: theme.bg.panelHi,
                    border: `2px solid ${accentHex}`,
                    boxShadow: `0 0 18px -2px ${glow(accentHex, 0.7)}`,
                  }}
                />
              ) : null}

              {/* the segment duration tag */}
              {segDur ? (
                <div
                  style={{
                    position: 'absolute',
                    left: (x + stageX(i + 1)) / 2,
                    top: trackY + 16,
                    transform: 'translateX(-50%)',
                    opacity: opacity * 0.9,
                    fontFamily: monoFamily,
                    fontSize: 15,
                    letterSpacing: 0.4,
                    color: theme.ink.low,
                    background: theme.bg.base,
                    padding: '2px 9px',
                    borderRadius: 6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.duration}
                </div>
              ) : null}

              {/* track node */}
              <div
                style={{
                  position: 'absolute',
                  left: x - 12,
                  top: trackY - 12,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  opacity,
                  background: focused || !hasFocus ? accentHex : theme.bg.panelHi,
                  border: `2.5px solid ${accentHex}`,
                  boxShadow: `0 0 ${14 + breathe * 14}px ${glow(accentHex, 0.75)}`,
                }}
              />

              {/* stage card — alternates above / below the track */}
              <div
                style={{
                  position: 'absolute',
                  left: x - 130,
                  top: i % 2 === 0 ? trackY - 196 : trackY + 64,
                  width: 260,
                  opacity,
                  transform: `scale(${scale})`,
                  borderRadius: 14,
                  background: `linear-gradient(158deg, ${theme.bg.panelHi}, ${theme.bg.panel})`,
                  border: `1.5px solid ${focused ? accentHex : theme.bg.line}`,
                  boxShadow: focused
                    ? `0 0 0 1px ${glow(accentHex, 0.35)}, 0 22px 54px -22px ${glow(accentHex, 0.5)}`
                    : '0 16px 40px -24px #000000cc',
                  padding: '18px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                }}
              >
                <div
                  style={{
                    fontFamily: monoFamily,
                    fontSize: 13,
                    letterSpacing: 1,
                    color: accentHex,
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div
                  style={{
                    fontFamily: interFamily,
                    fontSize: 24,
                    fontWeight: 600,
                    color: theme.ink.hi,
                    letterSpacing: -0.2,
                  }}
                >
                  {s.label}
                </div>
                {s.sub ? (
                  <div
                    style={{
                      fontFamily: monoFamily,
                      fontSize: 14.5,
                      color: focused ? theme.ink.mid : theme.ink.low,
                    }}
                  >
                    {s.sub}
                  </div>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}
      </AbsoluteFill>

      <Narration beats={ts.beats} />
    </SceneFrame>
  );
};
