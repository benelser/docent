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
// preceded by a distinct milestone diamond. Stages appear one beat at a time.
//
// `flow` picks the track topology:
//  - `linear`  (default) — one path, stages left-to-right.
//  - `cycle`   — the track curves back to its start; a loop.
//  - `braided` — two parallel lanes (story-order vs plot-order); a stage's
//                `track` (0 or 1) puts it on a lane. Non-linear narrative.
//  - `iterate` — a cycle drawn so it visibly *repeats and converges*: nested
//                return arcs of shrinking radius, settling toward equilibrium.
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
  const flow = scene.flow ?? 'linear';
  const cycle = flow === 'cycle';
  const iterate = flow === 'iterate';
  const braided = flow === 'braided';

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

  // ----- braided flow — two parallel lanes -------------------------------
  // A braided progression runs two tracks at once (e.g. plot-order on lane 0,
  // story-order on lane 1). Each lane carries the subset of stages on its
  // `track`; a stage's x is its index *within its own lane*, so the two
  // narratives advance independently. The lanes sit above/below `trackY`.
  const laneGap = 150;
  const laneY = (track: 0 | 1): number => trackY + (track === 0 ? -laneGap : laneGap);
  const laneIndices: [number[], number[]] = [[], []];
  if (braided) {
    stages.forEach((s, i) => laneIndices[s.track === 1 ? 1 : 0].push(i));
  }
  // For a braided stage, its position along its lane and the lane size.
  const laneSlot = (i: number): {pos: number; count: number; track: 0 | 1} => {
    const track: 0 | 1 = stages[i]?.track === 1 ? 1 : 0;
    const idx = laneIndices[track];
    return {pos: idx.indexOf(i), count: Math.max(1, idx.length), track};
  };
  const braidedX = (i: number): number => {
    const {pos, count} = laneSlot(i);
    return count === 1
      ? (left + right) / 2
      : left + (pos * (right - left)) / (count - 1);
  };

  // The x/y a stage's marker resolves to — braided splits into lanes, every
  // other flow uses the single horizontal band.
  const markX = (i: number): number => (braided ? braidedX(i) : stageX(i));
  const markY = (i: number): number =>
    braided ? laneY(laneSlot(i).track) : trackY;

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

  // ----- braided lane grow — each lane draws to its own latest stage ------
  const laneGrow = (track: 0 | 1): number => {
    const idx = laneIndices[track];
    if (idx.length === 0) return 0;
    const lastInLane = idx.reduce(
      (acc, gi, li) => (frame >= revealFrameFor(gi) ? li : acc),
      -1,
    );
    if (lastInLane < 0) return 0;
    if (idx.length === 1) return 1;
    const local = frame - revealFrameFor(idx[lastInLane]);
    const p = local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200}});
    const prev = Math.max(0, lastInLane - 1) / (idx.length - 1);
    const here = lastInLane / (idx.length - 1);
    return prev + (here - prev) * p;
  };

  const fullyRevealed = lastRevealed >= n - 1;

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
          {braided ? (
            <>
              {/* braided — two parallel lanes, each with its own grown track */}
              {([0, 1] as const).map((track) => {
                const y = laneY(track);
                const end = left + (right - left) * Math.min(1, laneGrow(track));
                return (
                  <React.Fragment key={`lane-${track}`}>
                    <line
                      x1={left}
                      y1={y}
                      x2={right}
                      y2={y}
                      stroke={theme.bg.line}
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                    <line
                      x1={left}
                      y1={y}
                      x2={end}
                      y2={y}
                      stroke={accentHex}
                      strokeWidth={3.5}
                      strokeLinecap="round"
                      style={{filter: `drop-shadow(0 0 8px ${glow(accentHex, 0.5)})`}}
                    />
                  </React.Fragment>
                );
              })}
              {/* the braid — soft connectors tying the two lanes together */}
              {stages.map((s, i) => {
                if (i === 0) return null;
                const partner = stages[i - 1];
                if (s.track === partner.track) return null;
                if (frame < revealFrameFor(i)) return null;
                const x = markX(i);
                const px = markX(i - 1);
                const y = markY(i);
                const py = markY(i - 1);
                return (
                  <path
                    key={`braid-${s.id}`}
                    d={`M ${px} ${py} C ${(px + x) / 2} ${py}, ${(px + x) / 2} ${y}, ${x} ${y}`}
                    fill="none"
                    stroke={accentHex}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray="6 7"
                    opacity={0.45}
                  />
                );
              })}
            </>
          ) : (
            <>
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
                  stroke={fullyRevealed ? accentHex : theme.bg.line}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray="10 9"
                  strokeDashoffset={-((frame * 1.3) % 38)}
                  opacity={fullyRevealed ? 0.8 : 0.4}
                />
              ) : null}
              {/* iterate: nested return arcs of shrinking radius — the loop
                  visibly repeats and converges toward equilibrium. */}
              {iterate
                ? [0, 1, 2].map((k) => {
                    const shrink = 1 - k * 0.28;
                    const bulge = 180 * shrink;
                    // The arc spans narrow inward each pass, so the eye reads
                    // a process settling rather than just looping.
                    const inset = k * 120;
                    const l = left + inset;
                    const r = right - inset;
                    // Later passes appear only once the loop is established.
                    const live = fullyRevealed;
                    return (
                      <path
                        key={`iter-${k}`}
                        d={`M ${r} ${trackY} C ${r + 70 * shrink} ${trackY + bulge}, ${l - 70 * shrink} ${trackY + bulge}, ${l} ${trackY}`}
                        fill="none"
                        stroke={live ? accentHex : theme.bg.line}
                        strokeWidth={3 - k * 0.5}
                        strokeLinecap="round"
                        strokeDasharray="10 9"
                        strokeDashoffset={-((frame * (1.3 + k * 0.4)) % 38)}
                        opacity={live ? 0.8 - k * 0.22 : 0.32 - k * 0.08}
                      />
                    );
                  })
                : null}
              {/* iterate: the equilibrium point the converging loop settles
                  onto — a marked target at the track's centre. */}
              {iterate && fullyRevealed ? (
                <g>
                  <circle
                    cx={(left + right) / 2}
                    cy={trackY + 196}
                    r={9}
                    fill={accentHex}
                    opacity={0.5 + 0.5 * Math.sin((frame / fps) * 2.4)}
                    style={{filter: `drop-shadow(0 0 10px ${glow(accentHex, 0.8)})`}}
                  />
                  <text
                    x={(left + right) / 2}
                    y={trackY + 236}
                    textAnchor="middle"
                    fontFamily={monoFamily}
                    fontSize={15}
                    letterSpacing={0.6}
                    fill={theme.ink.low}
                  >
                    converges
                  </text>
                </g>
              ) : null}
            </>
          )}
        </svg>

        {/* braided — lane labels pinned to the left of each band */}
        {braided
          ? ([0, 1] as const).map((track) => (
              <div
                key={`lanelabel-${track}`}
                style={{
                  position: 'absolute',
                  left: 96,
                  top: laneY(track) - 12,
                  fontFamily: monoFamily,
                  fontSize: 13,
                  letterSpacing: 1,
                  color: accentHex,
                  opacity: laneIndices[track].length ? 0.85 : 0,
                }}
              >
                {track === 0 ? 'TRACK A' : 'TRACK B'}
              </div>
            ))
          : null}

        {stages.map((s, i) => {
          const local = frame - stageEnterFor(i);
          const a =
            local <= 0
              ? 0
              : spring({frame: local, fps, config: cadenceSpringConfig(reveals[i]?.cadence)});
          if (a <= 0) return null;
          const x = markX(i);
          const y = markY(i);
          const focused = focusIds.has(s.id);
          const dim = hasFocus && !focused;
          const opacity = a * (dim ? 0.34 : 1);
          const scale = interpolate(a, [0, 1], [0.86, 1]);
          const breathe = focused ? 0.5 + 0.5 * Math.sin((frame / fps) * 3.2) : 0;
          // The segment between this stage and the next carries the duration.
          // In a braided flow the duration tag sits between lane-neighbours.
          const next = braided
            ? laneIndices[laneSlot(i).track][laneSlot(i).pos + 1]
            : i + 1;
          const segDur = s.duration && next !== undefined && next < n;
          // The stage card sits above or below its track. For a braided lane
          // the card pushes away from the centre line so the two lanes' cards
          // never collide.
          const cardAbove = braided
            ? laneSlot(i).track === 0
            : i % 2 === 0;

          return (
            <React.Fragment key={s.id}>
              {/* gate milestone — a diamond sitting just before the stage */}
              {s.gate ? (
                <div
                  style={{
                    position: 'absolute',
                    left: x - (i === 0 ? 0 : 78) - 13,
                    top: y - 13,
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
                    left: (x + markX(next as number)) / 2,
                    top: y + 16,
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
                  top: y - 12,
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
                  top: cardAbove ? y - 196 : y + 64,
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
