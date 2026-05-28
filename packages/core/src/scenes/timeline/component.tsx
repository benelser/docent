// TimelineScene — events plotted on a real date axis.
//
// Migrated from packages/engine/src/scenes/TimelineScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. Behavior is UNCHANGED from the
// v2.5.x renderer; only import paths and the prop shape were updated:
//   - props receive `SceneRenderProps<TimelineSceneSpec>` from @bjelser/kit
//     (the kit-owned `{scene, common}` envelope), rather than the legacy
//     `SceneProps` (the engine-owned `ts: TimedScene` envelope).
//   - the engine-shared chrome (SceneFrame, Narration, FittedText, fonts,
//     STAGE, glow, activeBeatIndex, palette resolvers, parseTimelineDate,
//     yearOf, EmbeddedScene) lives as colocated underscore-prefixed local
//     helpers in this scene's directory until the shared-infra migration
//     agent lands; the integrator will swap them at merge time.
//
// A timeline: events plotted on a real date axis. Progression renders
// ordinal stages — "first, then, then" — and cannot say *how far apart*
// two things are. Timeline can: the seven years between 1907 and 1914
// occupy a visible fraction of the axis, and that fraction *is* part of
// the argument. The gap is load-bearing.
//
// The axis spans `axis.start` to `axis.end` (parseable date strings).
// Ticks can be authored explicitly (`axis.ticks`) or auto-spaced. Each
// event is a dated marker; `lane` (0..N) stacks events vertically when
// they cluster. Spans are horizontal bars between two dates — wars, eras,
// treaty periods.

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {SceneRenderProps} from '@bjelser/kit';

import {EmbeddedScene} from './_embedded-scene';
import {
  FittedText,
  Narration,
  SceneFrame,
  activeBeatIndex,
  fitFontSize,
  glow,
  paletteGlowScale,
  paletteSceneHex,
  truncateForSlot,
} from '../../_shared';
import {parseTimelineDate, yearOf} from './_time';
import {STAGE} from './_helpers';
import type {
  TimelineEvent,
  TimelineScene as TimelineSceneSpec,
  TimelineSpan,
} from './validate';

// The plot rectangle — the axis line sits along the bottom of STAGE, with
// generous headroom for events and lane stacking above it. Spans sit just
// below the axis so they read as the "ground" the events stand on.
const PAD_L = 100;
const PAD_R = 80;
const PAD_T = 80;
const AXIS_FROM_BOTTOM = 220;

// Lane height — vertical pitch between stacked events. The first lane (0)
// sits just above the axis; lane 1 sits higher, lane 2 higher still.
const LANE_H = 130;

export const TimelineSceneComponent: React.FC<
  SceneRenderProps<TimelineSceneSpec>
> = ({scene, common}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  // paletteSceneHex reads the resolved-style accent table (or falls back to
  // theme.ts ACCENTS when style is undefined). Threading `style` makes a
  // preset's accent overrides reach this scene.
  const accentHex = paletteSceneHex(undefined, undefined, style);
  const events: TimelineEvent[] = scene.events ?? [];
  const spans: TimelineSpan[] = scene.spans ?? [];
  const axis = scene.axis;
  // v2.4.0 — `treatment` is no longer authored; the sketch/whiteboard skin
  // retired with the knob. Timeline renders in its crisp default.
  const sketch = false;
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  // The axis bounds. If `axis` is missing or unparseable the scene degrades
  // gracefully — the validator should have caught this, but the renderer
  // never crashes on a bad spec.
  const startMs = parseTimelineDate(axis?.start);
  const endMs = parseTimelineDate(axis?.end);
  const validAxis = startMs !== null && endMs !== null && endMs > startMs;
  const sMs = validAxis ? (startMs as number) : 0;
  const eMs = validAxis ? (endMs as number) : 1;

  // The plot box — STAGE coordinates (1920×1080), axis along the bottom.
  const plotL = STAGE.x + PAD_L;
  const plotR = STAGE.x + STAGE.w - PAD_R;
  const axisY = STAGE.y + STAGE.h - AXIS_FROM_BOTTOM + 120;
  const plotTop = STAGE.y + PAD_T;
  void plotTop; // reserved for future lane-cap geometry; preserved from v2.5.x

  const dateToX = (ms: number): number =>
    plotL + ((ms - sMs) / (eMs - sMs)) * (plotR - plotL);

  // Tick list: authored ticks parsed verbatim, else auto-spaced years across
  // the span. We pick 5–7 ticks for a span <= 20 years, every 5–10 years
  // otherwise. The author can override by passing `axis.ticks`.
  const autoTicks = (): {ms: number; label: string}[] => {
    if (!validAxis) return [];
    const years = (eMs - sMs) / (365.25 * 24 * 3600 * 1000);
    let step = 1;
    if (years > 200) step = 50;
    else if (years > 80) step = 20;
    else if (years > 30) step = 10;
    else if (years > 12) step = 5;
    else if (years > 6) step = 2;
    else step = 1;
    const startY = new Date(sMs).getUTCFullYear();
    const endY = new Date(eMs).getUTCFullYear();
    const out: {ms: number; label: string}[] = [];
    // Snap the first tick up to a multiple of `step`, but always include the
    // axis start as the leading tick (the floor) and the axis end as the
    // trailing tick — so the viewer never has to extrapolate.
    out.push({ms: sMs, label: yearOf(sMs)});
    const firstSnap = Math.ceil(startY / step) * step;
    for (let y = firstSnap; y < endY; y += step) {
      const ms = Date.UTC(y, 0, 1);
      if (ms <= sMs || ms >= eMs) continue;
      out.push({ms, label: String(y)});
    }
    out.push({ms: eMs, label: yearOf(eMs)});
    return out;
  };
  const authoredTicks = (axis?.ticks ?? [])
    .map((t) => ({label: t, ms: parseTimelineDate(t)}))
    .filter((t): t is {label: string; ms: number} => t.ms !== null);
  const ticks = authoredTicks.length > 0 ? authoredTicks : autoTicks();

  // Reveal map — an event/span appears on the first beat that names it in
  // `reveal`. Anything not named in any beat is visible from frame 0 (the
  // common case for a scene that only uses `focus` to walk the story).
  const revealFrame: Record<string, number> = {};
  ts.beats.forEach((b) => {
    const reveal = (b.beat as {reveal?: unknown}).reveal;
    if (Array.isArray(reveal)) {
      reveal.forEach((id) => {
        if (typeof id !== 'string') return;
        if (revealFrame[id] === undefined) revealFrame[id] = b.startFrame;
      });
    }
  });
  const anyReveal = Object.keys(revealFrame).length > 0;
  const revealOf = (id: string): number =>
    revealFrame[id] ?? (anyReveal ? Infinity : 0);

  const active = activeBeatIndex(ts.beats, frame);
  const focusRaw = (ts.beats[active]?.beat as {focus?: unknown})?.focus;
  const focusIds = new Set<string>(
    Array.isArray(focusRaw)
      ? focusRaw.filter((s): s is string => typeof s === 'string')
      : [],
  );
  const hasFocus = focusIds.size > 0;

  // Lane y — lane 0 is the band closest to the axis; higher lanes float up.
  const laneY = (lane: number): number =>
    axisY - 80 - Math.max(0, lane) * LANE_H;

  // Span y — spans sit BELOW the axis as a ground band; if multiple spans
  // overlap, lane stacks them downward.
  const spanY = (lane: number): number =>
    axisY + 26 + Math.max(0, lane) * 32;

  // Intro fade — the chrome appears once across ~18 frames.
  const intro = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

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
          {/* the axis — the spine. A dashed line in sketch/whiteboard so it
              reads as drawn, a solid stroke otherwise. */}
          <line
            x1={plotL}
            y1={axisY}
            x2={plotR}
            y2={axisY}
            stroke={ink.low}
            strokeWidth={sketch ? 2.4 : 2.5}
            strokeLinecap="round"
            strokeDasharray={sketch ? '7 6' : undefined}
            opacity={intro}
          />

          {/* tick marks and tick labels */}
          {validAxis &&
            ticks.map((t, i) => {
              const x = dateToX(t.ms);
              return (
                <g key={`tick-${i}-${t.label}`} opacity={intro}>
                  <line
                    x1={x}
                    y1={axisY - 8}
                    x2={x}
                    y2={axisY + 8}
                    stroke={ink.low}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                  <text
                    x={x}
                    y={axisY + 116}
                    textAnchor="middle"
                    fontFamily={monoFamily}
                    fontSize={18}
                    fill={ink.mid}
                    letterSpacing={0.6}
                  >
                    {t.label}
                  </text>
                </g>
              );
            })}

          {/* spans — horizontal bars beneath the axis. Each is a labelled
              ground band; the "war years", "the regime", "the era". */}
          {validAxis &&
            spans.map((sp) => {
              const f = parseTimelineDate(sp.from);
              const t = parseTimelineDate(sp.to);
              if (f === null || t === null) return null;
              const rf = revealOf(sp.id);
              if (frame < rf) return null;
              const local = frame - rf;
              const a =
                local <= 0
                  ? 0
                  : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});
              const x1 = dateToX(Math.min(f, t));
              const x2 = dateToX(Math.max(f, t));
              const y = spanY(sp.lane ?? 0);
              const focused = focusIds.has(sp.id);
              const dim = hasFocus && !focused;
              const op = a * (dim ? 0.32 : 1);
              return (
                <g key={sp.id} opacity={op}>
                  <rect
                    x={x1}
                    y={y - 11}
                    width={Math.max(2, x2 - x1)}
                    height={22}
                    rx={6}
                    fill={accentHex}
                    opacity={0.22}
                  />
                  <rect
                    x={x1}
                    y={y - 11}
                    width={Math.max(2, x2 - x1)}
                    height={22}
                    rx={6}
                    fill="none"
                    stroke={accentHex}
                    strokeWidth={focused ? 2.2 : 1.6}
                    opacity={0.85}
                  />
                  {/* span label — fits inside the span bar's pixel width;
                      shrink past the floor or ellipsis. */}
                  {(() => {
                    const w = Math.max(40, x2 - x1 - 12);
                    const fs = fitFontSize(sp.label, {
                      maxWidth: w,
                      basePx: 14,
                      floorPx: 9,
                      charAdvance: 0.6,
                    });
                    const txt = truncateForSlot(sp.label, {
                      maxWidth: w,
                      fontSize: fs,
                      charAdvance: 0.6,
                    });
                    return (
                      <text
                        x={(x1 + x2) / 2}
                        y={y + 5}
                        textAnchor="middle"
                        fontFamily={monoFamily}
                        fontSize={fs}
                        fill={ink.hi}
                        letterSpacing={0.5}
                      >
                        {txt}
                      </text>
                    );
                  })()}
                </g>
              );
            })}
        </svg>

        {/* event markers and cards — pinned to their parsed date on the
            axis. A focused event glows; unfocused events dim when any focus
            is active. Lane stacks vertically when events cluster. */}
        {validAxis &&
          events.map((e) => {
            const ms = parseTimelineDate(e.date);
            if (ms === null) return null;
            // Events that fall outside the axis still render but are
            // clamped to the axis edges — defensive; the validator HARD
            // FAILS on out-of-bounds dates, so this should never trigger.
            const x = dateToX(Math.max(sMs, Math.min(eMs, ms)));
            const rf = revealOf(e.id);
            if (frame < rf) return null;
            const local = frame - rf;
            const a =
              local <= 0
                ? 0
                : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});
            if (a <= 0) return null;
            const focused = focusIds.has(e.id);
            const dim = hasFocus && !focused;
            const opacity = a * (dim ? 0.36 : 1);
            const scale = interpolate(a, [0, 1], [0.84, 1]);
            const breathe = focused ? 0.5 + 0.5 * Math.sin((frame / fps) * 3.2) : 0;
            const y = laneY(e.lane ?? 0);

            return (
              <React.Fragment key={e.id}>
                {/* drop line — from the event card down to the axis tick */}
                <svg
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                  }}
                  viewBox="0 0 1920 1080"
                >
                  <line
                    x1={x}
                    y1={y + 32}
                    x2={x}
                    y2={axisY - 4}
                    stroke={focused ? accentHex : bg.lineHi}
                    strokeWidth={focused ? 2.2 : 1.4}
                    strokeDasharray={sketch ? '5 5' : '4 6'}
                    opacity={opacity * 0.85}
                  />
                  {/* axis dot — the event's footprint on the timeline */}
                  <circle
                    cx={x}
                    cy={axisY}
                    r={focused ? 8 : 6}
                    fill={focused || !hasFocus ? accentHex : bg.panelHi}
                    stroke={accentHex}
                    strokeWidth={2}
                    opacity={opacity}
                    style={{
                      filter: focused
                        ? `drop-shadow(0 0 ${10 + breathe * 12}px ${glow(accentHex, 0.85)})`
                        : `drop-shadow(0 0 6px ${glow(accentHex, 0.5)})`,
                    }}
                  />
                </svg>

                {/* event card — the dated label + sub. Sits above the axis
                    on its lane; alternates left/right anchor based on x to
                    keep clusters legible. */}
                <div
                  style={{
                    position: 'absolute',
                    left: x - 150,
                    top: y - 36,
                    width: 300,
                    opacity,
                    transform: `scale(${scale})`,
                    borderRadius: 12,
                    background: sketch
                      ? `linear-gradient(160deg, ${bg.panel}, ${bg.base})`
                      : `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
                    border: `1.5px solid ${focused ? accentHex : bg.line}`,
                    boxShadow: focused
                      ? `0 0 0 1px ${glow(accentHex, 0.35)}, 0 22px 54px -22px ${glow(accentHex, 0.6)}`
                      : '0 16px 40px -24px #000000cc',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      fontFamily: monoFamily,
                      fontSize: 12,
                      letterSpacing: 1.1,
                      color: accentHex,
                    }}
                  >
                    {e.date}
                  </div>
                  {/* event card label — 300px wide, 32px horizontal pad
                      reserved on the card. Wrap to 2 lines so a longer
                      event name reads cleanly; auto-shrink under the
                      wrap budget. */}
                  <FittedText
                    text={e.label}
                    maxWidth={300 - 32}
                    basePx={
                      e.label.length <= 18 ? 21
                      : e.label.length <= 28 ? 18
                      : e.label.length <= 38 ? 15
                      : 13
                    }
                    floorPx={11}
                    charAdvance={0.58}
                    mode="shrink-wrap"
                    maxLines={2}
                    lineHeight={1.14}
                    style={{
                      fontFamily: sansFamily,
                      fontWeight: 600,
                      color: ink.hi,
                      letterSpacing: -0.2,
                    }}
                  />
                  {e.sub ? (
                    <FittedText
                      text={e.sub}
                      maxWidth={300 - 32}
                      basePx={
                        e.sub.length <= 32 ? 13
                        : e.sub.length <= 48 ? 11.5
                        : 10.5
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
                </div>
                {/* Sprint B — compositional embed. A timeline event may carry
                    a static sub-scene tableau, drawn beside the event card so
                    it doesn't fight the drop line down to the axis. */}
                {e.embed ? (() => {
                  const embedW = 240;
                  const embedH = 160;
                  // Place the embed above the card if there's room, else
                  // below. Lane geometry usually keeps the upper half open.
                  const cardTop = y - 36;
                  const above = cardTop - embedH / 2 - 10;
                  const cy = above > 200 ? above : y + 60 + embedH / 2;
                  return (
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
                        embed={e.embed!}
                        bounds={{cx: x, cy, w: embedW, h: embedH}}
                        inheritedStyle={style}
                        parentAccent={accentHex}
                      />
                    </svg>
                  );
                })() : null}
              </React.Fragment>
            );
          })}

        {/* axis title — start → end, the span the film argues from. Sits
            below the tick labels so the viewer reads it last, after the
            individual dates. */}
        {validAxis && axis ? (
          <div
            style={{
              position: 'absolute',
              left: plotL,
              top: axisY + 152,
              width: plotR - plotL,
              textAlign: 'center',
              opacity: intro,
              fontFamily: monoFamily,
              fontSize: 14,
              letterSpacing: 2,
              color: ink.low,
            }}
          >
            {axis.start} → {axis.end}
          </div>
        ) : null}
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
