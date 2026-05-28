// ChartScene — a plotted coordinate graph: axes with tick labels, a
// function curve that draws itself on, bars that grow to their value, and
// a point that rides a curve. The `comparison` cluster's plotted move —
// the analogue of StructureScene's diagram, but for quantities that live
// in a continuous x/y domain.
//
// Migrated from packages/engine/src/scenes/ChartScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. Behavior is UNCHANGED from
// the v2.5.x renderer; only import paths and the prop shape were updated:
//   - props receive `SceneRenderProps<ChartSceneSpec>` from @bjelser/kit
//     (the kit-owned `{scene, common}` envelope), rather than the legacy
//     `SceneProps` (the engine-owned `ts: TimedScene` envelope).
//   - the engine-shared chrome (SceneFrame, Narration, FittedText, fonts,
//     theme.glow, layout.STAGE, engine/spec activeBeatIndex/tweenValue)
//     lives as colocated helpers in this scene's directory until the
//     shared-infra migration agent lands; the integrator will swap the
//     underscore-prefixed local helpers for shared imports at merge time.

import React from 'react';
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {evolvePath} from '@remotion/paths';
import type {ResolvedStyle, SceneRenderProps} from '@bjelser/kit';

import {
  Narration,
  SceneFrame,
  activeBeatIndex,
  fitFontSize,
  glow,
  interFamily,
  monoFamily,
  truncateForSlot,
} from '../../_shared';
import {STAGE, tweenValue} from './_helpers';
import type {
  ChartAxis as Axis,
  ChartScene as ChartSceneSpec,
  ChartSeries as Series,
} from './validate';

// The closed allowlist of named shapes. This is intent-level: the author
// names a curve, the engine owns the math. There is no expression
// evaluator. Mirrors packages/engine/src/scenes/ChartScene.tsx:FN exactly.
type ChartFn =
  | 'linear'
  | 'x^2'
  | 'sqrt'
  | 'sin'
  | 'exp'
  | 'log'
  | 'reciprocal';

const FN: Record<ChartFn, (x: number) => number> = {
  linear: (x) => x,
  'x^2': (x) => x * x,
  sqrt: (x) => (x >= 0 ? Math.sqrt(x) : NaN),
  sin: (x) => Math.sin(x),
  exp: (x) => Math.exp(x),
  log: (x) => (x > 0 ? Math.log(x) : NaN),
  reciprocal: (x) => (x !== 0 ? 1 / x : NaN),
};

// Sane fallback domains when a scene omits an axis.
const fallbackAxis = (label: string): Axis => ({
  kind: 'chart',
  label,
  min: 0,
  max: 10,
  ticks: 5,
});

// Round-ish tick labels — integers when the span is whole, else one decimal.
const fmtTick = (v: number, span: number): string => {
  if (Math.abs(v) < 1e-9) return '0';
  if (span >= 4 && Number.isInteger(v)) return String(v);
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string | undefined>;
  return (key ? map[key] : undefined) ?? map.blue ?? '#5cb6ff';
};

// `visualization` is a family-level renderer-knob bundle resolved on the
// ResolvedStyle. We read three knobs here:
//   - gridLines           — gate the grid (defaults true).
//   - axisLabels          — gate the numeric tick labels (defaults true).
//   - maxLabelsPerSeries  — clamp the bar count (defaults 8).
interface ChartVisualizationKnobs {
  gridLines?: boolean;
  axisLabels?: boolean;
  maxLabelsPerSeries?: number;
}

export const ChartSceneComponent: React.FC<SceneRenderProps<ChartSceneSpec>> = ({
  scene,
  common,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  const {bg, ink} = style.tokens;
  const viz = style.visualization as unknown as ChartVisualizationKnobs;
  const accentHex = accentOf(style, undefined);

  // ChartScene reads its OWN axis variant — the numeric domain. Narrow the
  // widened `Axis | LandscapeAxis` via the `kind` discriminator; the
  // validator pins `kind === 'chart'` on every chart scene's axes.
  const xAxis: Axis =
    scene.xAxis?.kind === 'chart' ? scene.xAxis : fallbackAxis('x');
  const yAxis: Axis =
    scene.yAxis?.kind === 'chart' ? scene.yAxis : fallbackAxis('y');
  const series: Series[] = scene.series ?? [];

  // ----- reveal timing -----------------------------------------------------
  // A series id appears like a node does in StructureScene — the
  // `startFrame` of the first beat whose `reveal` array names it. The kit's
  // BeatTimelineSlot exposes the beat's own `reveal` via the inner `beat`
  // (typed open through Beat's index signature).
  const revealFrame: Record<string, number> = {};
  ts.beats.forEach((b) => {
    const reveal = (b.beat as {reveal?: unknown}).reveal;
    if (Array.isArray(reveal)) {
      (reveal as unknown[]).forEach((rid) => {
        if (typeof rid === 'string' && revealFrame[rid] === undefined) {
          revealFrame[rid] = b.startFrame;
        }
      });
    }
  });
  // If a scene names no reveals at all, everything is visible from the start.
  const anyReveal = Object.keys(revealFrame).length > 0;
  const revealOf = (id: string): number =>
    revealFrame[id] ?? (anyReveal ? Infinity : 0);

  const active = activeBeatIndex(ts.beats, frame);
  const activeFocus = ts.beats[active]
    ? ((ts.beats[active].beat as {focus?: unknown}).focus)
    : undefined;
  const focusIds = new Set<string>(
    Array.isArray(activeFocus)
      ? (activeFocus as unknown[]).filter(
          (v): v is string => typeof v === 'string',
        )
      : [],
  );
  const hasFocus = focusIds.size > 0;

  // ----- the axis → pixel mapper (the analogue of cellCenter) -------------
  // The plot area: the STAGE rectangle, inset to leave room for tick labels
  // and axis titles below / left.
  const padL = 86; // left gutter for y tick labels + title
  const padB = 74; // bottom gutter for x tick labels + title
  const padT = 16; // a little headroom above the highest point
  const padR = 24;
  const plot = {
    x: STAGE.x + padL,
    y: STAGE.y + padT,
    w: STAGE.w - padL - padR,
    h: STAGE.h - padT - padB,
  };

  const xMin = xAxis.min ?? 0;
  const xMax = xAxis.max ?? 10;
  const yMin = yAxis.min ?? 0;
  const yMax = yAxis.max ?? 10;

  const worldToScreen = (x: number, y: number): {x: number; y: number} => {
    const sx = plot.x + ((x - xMin) / (xMax - xMin || 1)) * plot.w;
    // y grows upward — invert.
    const sy =
      plot.y + plot.h - ((y - yMin) / (yMax - yMin || 1)) * plot.h;
    return {x: sx, y: sy};
  };

  // ----- axis ticks --------------------------------------------------------
  const tickList = (a: Axis): number[] => {
    const min = a.min ?? 0;
    const max = a.max ?? 10;
    const n = Math.max(2, Math.min(10, a.ticks ?? 5));
    return Array.from({length: n}, (_, i) => min + (i * (max - min)) / (n - 1));
  };
  const xTicks = tickList(xAxis);
  const yTicks = tickList(yAxis);
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;

  const origin = worldToScreen(xMin, yMin);
  const xEnd = worldToScreen(xMax, yMin);
  const yEnd = worldToScreen(xMin, yMax);

  // The whole frame fades in once (matching the matrix `intro` in Quantities).
  const intro = spring({frame, fps, config: {damping: 200}});

  // ----- curve sampling ----------------------------------------------------
  // A line series, named-fn or explicit-points, sampled into clipped world
  // coordinates and resolved to a screen-space SVG path.
  const SAMPLES = 120;
  const curveSamples = (s: Series): [number, number][] => {
    if (s.kind !== 'line') return [];
    if (Array.isArray(s.points) && s.points.length > 0) {
      // points is `[number, number][]` at runtime — validator gates this.
      const pts = (s.points as [number, number][]).slice();
      return pts.sort((a, b) => a[0] - b[0]);
    }
    if (s.fn) {
      const fn = FN[s.fn as ChartFn];
      if (!fn) return [];
      const out: [number, number][] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const x = xMin + (i * xSpan) / SAMPLES;
        const y = fn(x);
        if (Number.isFinite(y)) out.push([x, y]);
      }
      return out;
    }
    return [];
  };

  // The y of a line series at world-x `x` — used by `point` markers. Linear
  // interpolation between the nearest samples (so explicit-points curves work
  // too, not just closed-form functions).
  const curveYAt = (s: Series, x: number): number => {
    const pts = curveSamples(s);
    if (pts.length === 0) return yMin;
    // pts[0] / pts[len-1] / pts[i] / pts[i-1]: all bounded by explicit length
    // checks above; the `!` is a deliberate index-safety statement.
    if (x <= pts[0]![0]) return pts[0]![1];
    if (x >= pts[pts.length - 1]![0]) return pts[pts.length - 1]![1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i]![0]) {
        const [x0, y0] = pts[i - 1]!;
        const [x1, y1] = pts[i]!;
        const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
        return y0 + t * (y1 - y0);
      }
    }
    return pts[pts.length - 1]![1];
  };

  // World-space path → screen-space SVG `d`.
  const screenPath = (pts: [number, number][]): string =>
    pts
      .map(([x, y], i) => {
        const p = worldToScreen(x, y);
        return `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
      })
      .join(' ');

  // Bars: at most 8, evenly spaced inside the plot. Each bar's height is a
  // tweened value — `tweenValue` keyed on `chart:<seriesId>:<i>` if a beat
  // drives it, else a default grow 0 → datum on the series' reveal beat.
  const barColor = (s: Series): string =>
    s.accent ? accentOf(style, s.accent) : accentHex;

  // The bar-count cap. `visualization.maxLabelsPerSeries` (a style knob)
  // clamps how many bars a series can show. Default 8 matches the historic
  // cap; an executive preset narrows it.
  const maxBars = viz?.maxLabelsPerSeries ?? 8;
  const showGrid = viz?.gridLines !== false;
  const showAxisLabels = viz?.axisLabels !== false;

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <AbsoluteFill>
        <svg
          style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
          viewBox="0 0 1920 1080"
        >
          {/* ---- gridlines ---- */}
          {/* `visualization.gridLines` (a style knob) gates these. When the
              caller pins it false, the chart drops both grid axes — the
              ticks still render. Default is true so the historic look is
              preserved. */}
          {showGrid
            ? yTicks.map((t, i) => {
                const p = worldToScreen(xMin, t);
                return (
                  <line
                    key={`yg-${i}`}
                    x1={origin.x}
                    y1={p.y}
                    x2={xEnd.x}
                    y2={p.y}
                    stroke={bg.line}
                    strokeWidth={1}
                    opacity={0.55 * intro}
                  />
                );
              })
            : null}
          {showGrid
            ? xTicks.map((t, i) => {
                const p = worldToScreen(t, yMin);
                return (
                  <line
                    key={`xg-${i}`}
                    x1={p.x}
                    y1={origin.y}
                    x2={p.x}
                    y2={yEnd.y}
                    stroke={bg.line}
                    strokeWidth={1}
                    opacity={0.55 * intro}
                  />
                );
              })
            : null}

          {/* ---- axes ---- */}
          <line
            x1={origin.x}
            y1={origin.y}
            x2={xEnd.x}
            y2={xEnd.y}
            stroke={ink.low}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={intro}
          />
          <line
            x1={origin.x}
            y1={origin.y}
            x2={yEnd.x}
            y2={yEnd.y}
            stroke={ink.low}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={intro}
          />

          {/* ---- x tick labels ---- */}
          {/* `visualization.axisLabels` (a style knob) gates the numeric tick
              labels on both axes. Axis *titles* (the x/y label strings) stay
              — they're the scene's own data, not chrome. Default is true. */}
          {showAxisLabels
            ? xTicks.map((t, i) => {
                const p = worldToScreen(t, yMin);
                return (
                  <text
                    key={`xt-${i}`}
                    x={p.x}
                    y={origin.y + 30}
                    textAnchor="middle"
                    fontFamily={monoFamily}
                    fontSize={17}
                    fill={ink.low}
                    opacity={intro}
                  >
                    {fmtTick(t, xSpan)}
                  </text>
                );
              })
            : null}
          {/* ---- y tick labels ---- */}
          {showAxisLabels
            ? yTicks.map((t, i) => {
                const p = worldToScreen(xMin, t);
                return (
                  <text
                    key={`yt-${i}`}
                    x={origin.x - 16}
                    y={p.y + 6}
                    textAnchor="end"
                    fontFamily={monoFamily}
                    fontSize={17}
                    fill={ink.low}
                    opacity={intro}
                  >
                    {fmtTick(t, ySpan)}
                  </text>
                );
              })
            : null}

          {/* ---- axis titles ---- */}
          {(() => {
            const xLabel = xAxis.label ?? '';
            const fs = fitFontSize(xLabel, {
              maxWidth: plot.w - 40,
              basePx: 19,
              floorPx: 12,
              charAdvance: 0.58,
            });
            const txt = truncateForSlot(xLabel, {
              maxWidth: plot.w - 40,
              fontSize: fs,
              charAdvance: 0.58,
            });
            return (
              <text
                x={(origin.x + xEnd.x) / 2}
                y={origin.y + 62}
                textAnchor="middle"
                fontFamily={interFamily}
                fontSize={fs}
                fontWeight={600}
                fill={ink.mid}
                opacity={intro}
              >
                {txt}
              </text>
            );
          })()}
          {(() => {
            const yLabel = yAxis.label ?? '';
            // Rotated label budget = plot height (it runs along the y axis).
            const fs = fitFontSize(yLabel, {
              maxWidth: plot.h - 40,
              basePx: 19,
              floorPx: 12,
              charAdvance: 0.58,
            });
            const txt = truncateForSlot(yLabel, {
              maxWidth: plot.h - 40,
              fontSize: fs,
              charAdvance: 0.58,
            });
            return (
              <text
                x={STAGE.x + 22}
                y={(origin.y + yEnd.y) / 2}
                textAnchor="middle"
                fontFamily={interFamily}
                fontSize={fs}
                fontWeight={600}
                fill={ink.mid}
                opacity={intro}
                transform={`rotate(-90 ${STAGE.x + 22} ${(origin.y + yEnd.y) / 2})`}
              >
                {txt}
              </text>
            );
          })()}

          {/* ---- line series — drawn on with evolvePath ---- */}
          {series
            .filter((s) => s.kind === 'line')
            .map((s) => {
              const id = s.id ?? '';
              const rf = revealOf(id);
              if (frame < rf) return null;
              const local = frame - rf;
              const draw =
                local <= 0
                  ? 0
                  : spring({frame: local, fps, config: {damping: 200, mass: 0.6}});
              const pts = curveSamples(s);
              if (pts.length < 2) return null;
              const d = screenPath(pts);
              const evolve = evolvePath(draw, d);
              const focused = focusIds.has(id);
              const dim = hasFocus && !focused;
              const col = barColor(s);
              return (
                <path
                  key={id}
                  d={d}
                  fill="none"
                  stroke={col}
                  strokeWidth={focused ? 4.4 : 3.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={evolve.strokeDasharray}
                  strokeDashoffset={evolve.strokeDashoffset}
                  opacity={dim ? 0.32 : 1}
                  style={{filter: `drop-shadow(0 0 7px ${glow(col, 0.55)})`}}
                />
              );
            })}

          {/* ---- bar series — heights are tweened values ---- */}
          {series
            .filter((s) => s.kind === 'bars')
            .map((s) => {
              const id = s.id ?? '';
              // `visualization.maxLabelsPerSeries` clamps how many bars (and
              // therefore datum labels) a series can show. Default 8 matches
              // the historic cap; an executive preset narrows it.
              const rawData = Array.isArray(s.data) ? (s.data as Array<{label: string; value: number}>) : [];
              const data = rawData.slice(0, maxBars);
              if (data.length === 0) return null;
              const rf = revealOf(id);
              if (frame < rf) return null;
              const col = barColor(s);
              const focused = focusIds.has(id);
              const dim = hasFocus && !focused;
              const baseOp = dim ? 0.32 : 1;
              // Even slots across the x extent; bar width is a fraction of a slot.
              const slot = plot.w / data.length;
              const barW = Math.min(slot * 0.6, 132);

              return (
                <g key={id} opacity={baseOp}>
                  {data.map((d, i) => {
                    // The bar's height: a tweened value. A beat may drive it
                    // explicitly via `set` keyed `chart:<id>:<i>`; otherwise it
                    // grows 0 → datum on the series' reveal beat.
                    const tweenKey = `chart:${id}:${i}`;
                    const driven = ts.beats.some((b) => {
                      const setObj = (b.beat as {set?: unknown}).set;
                      return (
                        setObj &&
                        typeof setObj === 'object' &&
                        !Array.isArray(setObj) &&
                        tweenKey in (setObj as object)
                      );
                    });
                    let value: number;
                    if (driven) {
                      value = tweenValue(ts.beats, tweenKey, frame, fps);
                    } else {
                      const local = frame - rf;
                      const grow =
                        local <= 0
                          ? 0
                          : spring({
                              frame: local,
                              fps,
                              config: {damping: 200, mass: 0.8},
                            });
                      value = d.value * grow;
                    }
                    const cx = plot.x + slot * (i + 0.5);
                    const base = worldToScreen(xMin, Math.max(yMin, 0));
                    const top = worldToScreen(xMin, value);
                    const hPx = Math.max(0, base.y - top.y);
                    return (
                      <g key={`${id}-${i}`}>
                        <rect
                          x={cx - barW / 2}
                          y={base.y - hPx}
                          width={barW}
                          height={hPx}
                          rx={6}
                          fill={col}
                          opacity={0.9}
                          style={{filter: `drop-shadow(0 0 9px ${glow(col, 0.45)})`}}
                        />
                        {/* the datum's value, riding the top of the bar */}
                        <text
                          x={cx}
                          y={base.y - hPx - 14}
                          textAnchor="middle"
                          fontFamily={monoFamily}
                          fontSize={20}
                          fontWeight={600}
                          fill={ink.hi}
                          opacity={hPx > 4 ? 1 : 0}
                        >
                          {Math.abs(value % 1) < 1e-6
                            ? String(Math.round(value))
                            : value.toFixed(1)}
                        </text>
                        {/* the datum label, below the axis. Bar slot is
                            `slot` wide; shrink-then-ellipsis so a
                            longer category name stays inside its slot. */}
                        {(() => {
                          const fs = fitFontSize(d.label, {
                            maxWidth: slot - 8,
                            basePx: 17,
                            floorPx: 10,
                            charAdvance: 0.58,
                          });
                          const txt = truncateForSlot(d.label, {
                            maxWidth: slot - 8,
                            fontSize: fs,
                            charAdvance: 0.58,
                          });
                          return (
                            <text
                              x={cx}
                              y={origin.y + 30}
                              textAnchor="middle"
                              fontFamily={interFamily}
                              fontSize={fs}
                              fill={ink.mid}
                              opacity={intro}
                            >
                              {txt}
                            </text>
                          );
                        })()}
                      </g>
                    );
                  })}
                </g>
              );
            })}

          {/* ---- point markers — x = tweenValue(bind), y on a bound curve ---- */}
          {series
            .filter((s) => s.kind === 'point')
            .map((s) => {
              const id = s.id ?? '';
              const rf = revealOf(id);
              if (frame < rf) return null;
              const col = barColor(s);
              const focused = focusIds.has(id);
              const dim = hasFocus && !focused;
              // x — a tweened `set` key. If `bind` is unset or undriven the
              // marker rests at the domain's start.
              const x = s.bind
                ? tweenValue(ts.beats, s.bind, frame, fps)
                : xMin;
              // y — read off the bound curve, else 0.
              const host = s.along
                ? series.find((o) => o.id === s.along && o.kind === 'line')
                : undefined;
              const y = host ? curveYAt(host, x) : 0;
              const p = worldToScreen(x, y);
              const breathe = 0.5 + 0.5 * Math.sin((frame / fps) * 3.2);
              return (
                <g key={id} opacity={dim ? 0.4 : 1}>
                  {/* drop lines to each axis */}
                  <line
                    x1={p.x}
                    y1={p.y}
                    x2={p.x}
                    y2={origin.y}
                    stroke={col}
                    strokeWidth={1.5}
                    strokeDasharray="5 6"
                    opacity={0.5}
                  />
                  <line
                    x1={p.x}
                    y1={p.y}
                    x2={origin.x}
                    y2={p.y}
                    stroke={col}
                    strokeWidth={1.5}
                    strokeDasharray="5 6"
                    opacity={0.5}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={focused ? 11 : 9}
                    fill={col}
                    stroke={bg.base}
                    strokeWidth={3}
                    style={{
                      filter: `drop-shadow(0 0 ${10 + breathe * 12}px ${glow(col, 0.8)})`,
                    }}
                  />
                </g>
              );
            })}
        </svg>
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};

export default ChartSceneComponent;
