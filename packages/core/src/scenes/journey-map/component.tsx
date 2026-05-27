// JourneyMapScene — the UX/service-design primitive.
//
// MIGRATED from packages/engine/src/scenes/JourneyMapScene.tsx as part of
// the v3.0 plugin-architecture rip-and-replace. Behavior is UNCHANGED from
// the v2.5.x renderer; only import paths and the prop shape were updated:
//   - props receive `SceneRenderProps<JourneyMapSceneSpec>` from
//     @docent/kit (the kit-owned `{scene, common}` envelope), rather than
//     the legacy `SceneProps` (the engine-owned `ts: TimedScene` envelope
//     with `ts.scene` and `ts.beats[i].from` / `ts.beats[i].focus`).
//   - the engine-shared chrome (SceneFrame, Narration, FittedText, fonts,
//     theme.glow, the knobs module) lives as colocated helpers in this
//     scene's directory until the shared-infra migration agent lands; the
//     integrator will swap the underscore-prefixed local helpers for
//     shared imports at merge time.
//   - the `EmbeddedScene` cross-scene primitive lives in
//     `_shared/embedded-scene.tsx` (A3 of v3.0 stabilization) and renders
//     the per-type tableau body. Allowlist for journey-map stages:
//     causal-loop | mechanism | compare.
//
// Horizontal stages along a journey, each with an emotion chip and
// optional touchpoints / painPoints. A continuous emotional curve runs
// across the top: high = good emotion, low = bad. Reveal beats walk one
// stage at a time; focused stages glow.

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {DesignTokens, ResolvedStyle, SceneRenderProps} from '@docent/kit';

import {
  EmbeddedScene,
  FittedText,
  Narration,
  SceneFrame,
  activeBeatIndex,
  cadenceOffset,
  cadenceSpringConfig,
  glow,
  interFamily,
  monoFamily,
  numericRevealMap,
  paletteGlowScale,
  paletteSceneHex,
  type EmbeddedSceneSpec,
} from '../../_shared';
import type {JourneyEmotion, JourneyMapScene as JourneyMapSceneSpec} from './validate';

// The closed allowlist of journey emotions, paired with a colour and a
// short label for the chip. The two ends (delight, pain) borrow the
// existing rose/green/amber accents so they sit inside docent's palette;
// intermediate states ramp through neutral grey to those poles. The author
// writes the emotion; the engine owns the chip's pixels. Built from the
// active token bundle so a preset can re-tune the chip palette through
// `tokens.accent`.
const buildEmotionPalette = (
  tokens: DesignTokens,
): Record<JourneyEmotion, {hex: string; label: string}> => ({
  delight: {hex: tokens.accent.green, label: 'delight'},
  curiosity: {hex: tokens.accent.cyan, label: 'curiosity'},
  satisfaction: {hex: tokens.accent.blue, label: 'satisfaction'},
  neutral: {hex: tokens.ink.low, label: 'neutral'},
  fatigue: {hex: tokens.accent.amber, label: 'fatigue'},
  frustration: {hex: tokens.accent.rose, label: 'frustration'},
  // pain — the deepest negative; rose-forward with darker mix at the chip.
  pain: {hex: '#d04060', label: 'pain'},
});

const emotionLabel = (
  palette: ReturnType<typeof buildEmotionPalette>,
  e: JourneyEmotion,
): string => palette[e]?.label ?? 'neutral';

// The emotion-curve geometry: a Catmull-Rom-ish smooth path through the
// (stageX, curveY) points, drawn at the top of the stage band. We work in
// SVG viewBox 1920 × 1080.
const buildCurvePath = (pts: [number, number][]): string => {
  if (pts.length === 0) return '';
  // pts[0]! after length guards: confirmed non-empty by the early return above.
  if (pts.length === 1) return `M ${pts[0]![0]} ${pts[0]![1]}`;
  // A simple smooth path: each segment uses two cubic control points
  // halfway to the neighbours, scaled by tension. Reads as one continuous
  // emotional arc rather than connected line segments.
  const t = 0.35;
  let d = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
};

export const JourneyMapSceneComponent: React.FC<
  SceneRenderProps<JourneyMapSceneSpec>
> = ({scene, common}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  const {bg, ink} = style.tokens;
  const emotionPalette = buildEmotionPalette(style.tokens);
  const emotionHex = (e: JourneyEmotion): string =>
    emotionPalette[e]?.hex ?? ink.low;
  // `palette` (a scene knob) re-selects the chrome accent; without a palette
  // this is exactly `accent(scene.accent)`.
  const accentHex = paletteSceneHex(undefined, undefined, style);
  const stages = scene.journeyStages ?? [];

  // `cadence` (a beat knob) shapes how a batch of stages enters; the
  // numeric reveal map gives, per stage index, the revealing beat's frame,
  // cadence, and within-batch order. A knob-free scene is byte-identical
  // with the pre-cadence behaviour. The shared helper reads a flat
  // `{from, reveal, cadence}` shape; we project the BeatTimelineSlot[]
  // inline so this scene reads the same `numericRevealMap` every other
  // list scene does.
  const revealBeats = ts.beats.map((b) => ({
    from: b.startFrame,
    reveal: typeof b.beat.reveal === 'number' ? b.beat.reveal : undefined,
    cadence: b.beat.cadence,
  }));
  const reveals = numericRevealMap(revealBeats, stages.length);
  const revealFrameFor = (i: number): number => reveals[i]?.from ?? 0;
  const stageEnterFor = (i: number): number => {
    const r = reveals[i];
    return r ? r.from + cadenceOffset(r.cadence, r.order) : 0;
  };

  const active = activeBeatIndex(ts.beats, frame);
  const focusRaw = (ts.beats[active]?.beat as {focus?: unknown})?.focus;
  const focusIds = new Set<string>(
    Array.isArray(focusRaw) ? (focusRaw.filter((v) => typeof v === 'string') as string[]) : [],
  );
  const hasFocus = focusIds.size > 0;

  // The journey band's geometry. Stages sit evenly along a horizontal
  // axis; the emotion curve runs in a band above them, the chips ride on
  // the axis, the touchpoint cards stack below.
  const left = 220;
  const right = 1700;
  const axisY = 580;
  const curveTop = 240; // y for curveValue == 1 (best emotion)
  const curveBot = 460; // y for curveValue == 0 (worst emotion)
  const n = Math.max(1, stages.length);
  const stageX = (i: number): number =>
    n === 1 ? (left + right) / 2 : left + (i * (right - left)) / (n - 1);
  const curveY = (v: number): number => {
    const clamped = Math.max(0, Math.min(1, v));
    return curveTop + (1 - clamped) * (curveBot - curveTop);
  };

  // How far the journey has been drawn — the axis line grows toward the
  // latest revealed stage, the curve fades in segment-by-segment.
  const lastRevealed = stages.reduce(
    (acc, _s, i) => (frame >= revealFrameFor(i) ? i : acc),
    -1,
  );
  const lineGrow = (() => {
    if (lastRevealed < 0) return 0;
    if (n === 1) return 1;
    const local = frame - revealFrameFor(lastRevealed);
    const p =
      local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200}});
    const prev = Math.max(0, lastRevealed - 1) / (n - 1);
    const here = lastRevealed / (n - 1);
    return prev + (here - prev) * p;
  })();
  const lineEnd = left + (right - left) * Math.min(1, lineGrow);

  // The curve points — only stages revealed so far contribute. Below the
  // first reveal the curve is empty; after, it extends to the current head.
  const revealedStages = stages.slice(0, Math.max(0, lastRevealed + 1));
  const curvePts: [number, number][] = revealedStages.map((s, i) => [
    stageX(i),
    curveY(s.curveValue),
  ]);
  const curvePath = buildCurvePath(curvePts);

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      glowScale={paletteGlowScale(undefined)}
    >
      <AbsoluteFill>
        <svg
          style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
          viewBox="0 0 1920 1080"
        >
          {/* curve band — faint guide rails at top (good) and bottom (bad) */}
          <line
            x1={left}
            y1={curveTop}
            x2={right}
            y2={curveTop}
            stroke={bg.line}
            strokeWidth={1}
            strokeDasharray="3 7"
            opacity={0.5}
          />
          <line
            x1={left}
            y1={curveBot}
            x2={right}
            y2={curveBot}
            stroke={bg.line}
            strokeWidth={1}
            strokeDasharray="3 7"
            opacity={0.5}
          />
          {/* the emotional arc — one continuous curve across the journey */}
          {curvePath ? (
            <path
              d={curvePath}
              fill="none"
              stroke={accentHex}
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{filter: `drop-shadow(0 0 10px ${glow(accentHex, 0.55)})`}}
            />
          ) : null}
          {/* dots along the curve, one per revealed stage — they let the
              eye pin a stage's specific feeling to a point on the arc */}
          {revealedStages.map((s, i) => (
            <circle
              key={`curveDot-${s.id}`}
              cx={stageX(i)}
              cy={curveY(s.curveValue)}
              r={6}
              fill={emotionHex(s.emotion)}
              stroke={bg.base}
              strokeWidth={2}
              style={{
                filter: `drop-shadow(0 0 8px ${glow(emotionHex(s.emotion), 0.7)})`,
              }}
            />
          ))}

          {/* the resting axis */}
          <line
            x1={left}
            y1={axisY}
            x2={right}
            y2={axisY}
            stroke={bg.line}
            strokeWidth={3}
            strokeLinecap="round"
          />
          {/* the drawn-so-far axis */}
          <line
            x1={left}
            y1={axisY}
            x2={lineEnd}
            y2={axisY}
            stroke={accentHex}
            strokeWidth={3.5}
            strokeLinecap="round"
            style={{filter: `drop-shadow(0 0 8px ${glow(accentHex, 0.45)})`}}
          />

          {/* y-axis labels — what the curve's top and bottom mean */}
          <text
            x={left - 22}
            y={curveTop + 4}
            textAnchor="end"
            fontFamily={monoFamily}
            fontSize={12}
            letterSpacing={1}
            fill={ink.low}
          >
            GOOD
          </text>
          <text
            x={left - 22}
            y={curveBot + 4}
            textAnchor="end"
            fontFamily={monoFamily}
            fontSize={12}
            letterSpacing={1}
            fill={ink.low}
          >
            BAD
          </text>
        </svg>

        {stages.map((s, i) => {
          const local = frame - stageEnterFor(i);
          const a =
            local <= 0
              ? 0
              : spring({
                  frame: local,
                  fps,
                  config: cadenceSpringConfig(reveals[i]?.cadence),
                });
          if (a <= 0) return null;

          const x = stageX(i);
          const focused = focusIds.has(s.id);
          const dim = hasFocus && !focused;
          const opacity = a * (dim ? 0.32 : 1);
          const scale = interpolate(a, [0, 1], [0.86, 1]);
          const breathe = focused ? 0.5 + 0.5 * Math.sin((frame / fps) * 3.2) : 0;
          const eHex = emotionHex(s.emotion);
          const eLabel = emotionLabel(emotionPalette, s.emotion);
          const touchpoints = s.touchpoints ?? [];
          const painPoints = s.painPoints ?? [];

          return (
            <React.Fragment key={s.id}>
              {/* axis marker — a hollow dot pinned to the journey axis */}
              <div
                style={{
                  position: 'absolute',
                  left: x - 11,
                  top: axisY - 11,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  opacity,
                  background: focused || !hasFocus ? accentHex : bg.panelHi,
                  border: `2.5px solid ${accentHex}`,
                  boxShadow: `0 0 ${12 + breathe * 14}px ${glow(accentHex, 0.7)}`,
                }}
              />

              {/* the stage card — sits below the axis, holds label/sub +
                  the emotion chip and (optional) touchpoints / painPoints */}
              <div
                style={{
                  position: 'absolute',
                  left: x - 145,
                  top: axisY + 52,
                  width: 290,
                  opacity,
                  transform: `scale(${scale})`,
                  borderRadius: 14,
                  background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
                  border: `1.5px solid ${focused ? accentHex : bg.line}`,
                  boxShadow: focused
                    ? `0 0 0 1px ${glow(accentHex, 0.35)}, 0 22px 54px -22px ${glow(accentHex, 0.5)}`
                    : '0 16px 40px -24px #000000cc',
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {/* index + stage label */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontFamily: monoFamily,
                      fontSize: 12,
                      letterSpacing: 1,
                      color: accentHex,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  {/* emotion chip */}
                  <div
                    style={{
                      fontFamily: monoFamily,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: 0.8,
                      color: eHex,
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: glow(eHex, 0.16),
                      border: `1px solid ${glow(eHex, 0.55)}`,
                      textTransform: 'uppercase',
                    }}
                  >
                    {eLabel}
                  </div>
                </div>
                {/* stage card label — the card is 290px wide with 18px
                    horizontal padding (~254px content). Wrap to 2 lines
                    for longer stage names; auto-shrink under the wrap
                    budget. */}
                <FittedText
                  text={s.label}
                  maxWidth={254}
                  basePx={
                    s.label.length <= 14
                      ? 22
                      : s.label.length <= 22
                        ? 18
                        : s.label.length <= 30
                          ? 15
                          : 13
                  }
                  floorPx={11}
                  charAdvance={0.58}
                  mode="shrink-wrap"
                  maxLines={2}
                  lineHeight={1.14}
                  style={{
                    fontFamily: interFamily,
                    fontWeight: 600,
                    color: ink.hi,
                    letterSpacing: -0.2,
                  }}
                />
                {s.sub ? (
                  <FittedText
                    text={s.sub}
                    maxWidth={254}
                    basePx={
                      s.sub.length <= 28 ? 13.5 : s.sub.length <= 40 ? 11.5 : 10.5
                    }
                    floorPx={9}
                    charAdvance={0.62}
                    mode="shrink-wrap"
                    maxLines={2}
                    lineHeight={1.22}
                    style={{
                      fontFamily: monoFamily,
                      color: focused ? ink.mid : ink.low,
                    }}
                  />
                ) : null}

                {touchpoints.length > 0 ? (
                  <div
                    style={{
                      marginTop: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: monoFamily,
                        fontSize: 10,
                        letterSpacing: 1.2,
                        color: ink.low,
                      }}
                    >
                      TOUCHPOINTS
                    </div>
                    {touchpoints.slice(0, 3).map((t, ti) => (
                      <div
                        key={`tp-${i}-${ti}`}
                        style={{
                          fontFamily: interFamily,
                          fontSize: 12,
                          color: ink.mid,
                          lineHeight: 1.25,
                          paddingLeft: 9,
                          position: 'relative',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 6,
                            width: 4,
                            height: 4,
                            borderRadius: '50%',
                            background: accentHex,
                          }}
                        />
                        {t}
                      </div>
                    ))}
                  </div>
                ) : null}

                {painPoints.length > 0 ? (
                  <div
                    style={{
                      marginTop: 4,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: monoFamily,
                        fontSize: 10,
                        letterSpacing: 1.2,
                        color: style.tokens.accent.rose,
                      }}
                    >
                      PAIN POINTS
                    </div>
                    {painPoints.slice(0, 3).map((t, ti) => (
                      <div
                        key={`pp-${i}-${ti}`}
                        style={{
                          fontFamily: interFamily,
                          fontSize: 12,
                          color: ink.mid,
                          lineHeight: 1.25,
                          paddingLeft: 9,
                          position: 'relative',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 6,
                            width: 4,
                            height: 4,
                            borderRadius: '50%',
                            background: style.tokens.accent.rose,
                          }}
                        />
                        {t}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {/* Sprint B — compositional embed. A journey-map stage may
                  carry a static sub-scene tableau, drawn above the axis
                  in the curve band area so it sits beside its curve dot.
                  Allowlist: causal-loop | mechanism | compare. */}
              {s.embed ? (
                <svg
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    opacity,
                  }}
                  viewBox="0 0 1920 1080"
                >
                  <EmbeddedScene
                    embed={s.embed as EmbeddedSceneSpec}
                    bounds={{cx: x, cy: 130, w: 220, h: 160}}
                    inheritedStyle={style}
                    parentAccent={accentHex}
                  />
                </svg>
              ) : null}
            </React.Fragment>
          );
        })}
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};

