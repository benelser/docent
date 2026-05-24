import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {glow} from '../theme';
import type {ResolvedStyle} from '../style';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {fitFontSize, truncateForSlot} from '../components/FittedText';
import {
  activeBeatIndex,
  type LandscapeAxis,
  type LandscapeSubject,
  type SceneProps,
} from '../engine/spec';
import {paletteGlowScale, paletteSceneHex} from '../engine/knobs';

// Landscape — N options plotted on M dimensions in 2-D, the quadrant-analysis
// primitive. The classic strategic / tool-survey shape: "cost vs value",
// "simplicity vs power", "latency vs throughput". The axes are not a numeric
// domain — they are TRADE-OFFS, each with a phrase at its low end and a
// phrase at its high end. The subjects sit at normalized {x, y} ∈ [0..1]²;
// the engine maps them to pixels. Four optional quadrant labels pin a phrase
// to TL / TR / BL / BR so the cells of the quadrant analysis can be named.
//
// Subject markers are revealed beat-by-beat (the StructureScene reveal model)
// and a focused marker gets a glow ring so the narration's eye lands on it.
// The `treatment` knob (`sketch` / `whiteboard`) softens the rendering for
// hand-drawn skins; the default `crisp` is the dark-console look.

// The plot rectangle inside the 1920×1080 stage. Pulled in from the SceneFrame
// header band at top and the wordmark/progress band at bottom; left/right
// gutters hold the axis lowLabel/highLabel phrases.
const PLOT = {x: 280, y: 308, w: 1360, h: 608};

const sketchTreatment = (t?: string): boolean =>
  t === 'sketch' || t === 'whiteboard';

export const LandscapeScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const {bg, ink, accent: accentTokens} = style.tokens;
  const viz = style.visualization;
  const accentOf = (k?: string): string =>
    (k && ((accentTokens as unknown) as Record<string, string>)[k]) || accentTokens.blue;
  const accentHex = paletteSceneHex(scene.palette, scene.accent, style);
  // Narrow `Scene.xAxis`/`yAxis` (the widened `Axis | LandscapeAxis` union)
  // via the `kind` discriminator. The validator pins `kind === 'landscape'`
  // on every landscape scene's axes; this read is safe on any spec that
  // passes the contract.
  const xAxis: LandscapeAxis | undefined =
    scene.xAxis?.kind === 'landscape' ? scene.xAxis : undefined;
  const yAxis: LandscapeAxis | undefined =
    scene.yAxis?.kind === 'landscape' ? scene.yAxis : undefined;
  const subjects = scene.subjects ?? [];
  const quadrants = scene.quadrants;
  const isSketch = sketchTreatment(scene.treatment);

  // The whole frame fades in once.
  const intro = spring({frame, fps, config: {damping: 200}});

  // Per-subject reveal frame — the first beat that names this id under
  // `reveal`. The same model StructureScene uses.
  const revealFrame: Record<string, number> = {};
  ts.beats.forEach((b) => {
    if (Array.isArray(b.reveal)) {
      b.reveal.forEach((id) => {
        if (revealFrame[id] === undefined) revealFrame[id] = b.from;
      });
    }
  });
  const anyReveal = Object.keys(revealFrame).length > 0;
  const revealOf = (id: string): number =>
    revealFrame[id] ?? (anyReveal ? Infinity : 0);

  const active = activeBeatIndex(ts.beats, frame);
  const focusIds = new Set(ts.beats[active]?.focus ?? []);
  const hasFocus = focusIds.size > 0;

  // Normalized [0..1] → screen pixels. y inverts so 1 (high) is at the top.
  const toScreen = (nx: number, ny: number): {x: number; y: number} => {
    const x = Math.max(0, Math.min(1, nx));
    const y = Math.max(0, Math.min(1, ny));
    return {
      x: PLOT.x + x * PLOT.w,
      y: PLOT.y + (1 - y) * PLOT.h,
    };
  };

  // Per-subject color: an explicit override on the subject wins, else the
  // scene accent.
  const subjectColor = (s: LandscapeSubject): string =>
    s.accent ? accentOf(s.accent) : accentHex;

  // Quadrant centers — used for the optional faded-ink quadrant labels.
  const qPos = {
    tl: toScreen(0.18, 0.85),
    tr: toScreen(0.82, 0.85),
    bl: toScreen(0.18, 0.15),
    br: toScreen(0.82, 0.15),
  };

  const axisStroke = isSketch ? ink.mid : ink.low;
  const axisWidth = isSketch ? 2.0 : 2.2;
  const gridStroke = bg.line;

  return (
    <SceneFrame
      style={style}      accentHex={accentHex}
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
          {/* the soft gridlines — quartering the plot, faintly. `visualization.
              gridLines` (a style knob) gates them: an executive deck can drop
              them to keep the eye on the markers. Default is true. */}
          {viz.gridLines ? [0.25, 0.5, 0.75].map((t, i) => {
            const a = toScreen(0, t);
            const b = toScreen(1, t);
            const c = toScreen(t, 0);
            const d = toScreen(t, 1);
            const heavy = Math.abs(t - 0.5) < 1e-6;
            return (
              <g key={`grid-${i}`} opacity={intro}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={gridStroke}
                  strokeWidth={heavy ? 1.6 : 1}
                  opacity={heavy ? 0.7 : 0.4}
                  strokeDasharray={heavy ? undefined : '4 8'}
                />
                <line
                  x1={c.x}
                  y1={c.y}
                  x2={d.x}
                  y2={d.y}
                  stroke={gridStroke}
                  strokeWidth={heavy ? 1.6 : 1}
                  opacity={heavy ? 0.7 : 0.4}
                  strokeDasharray={heavy ? undefined : '4 8'}
                />
              </g>
            );
          }) : null}

          {/* x-axis (bottom) */}
          <line
            x1={PLOT.x}
            y1={PLOT.y + PLOT.h}
            x2={PLOT.x + PLOT.w}
            y2={PLOT.y + PLOT.h}
            stroke={axisStroke}
            strokeWidth={axisWidth}
            strokeLinecap="round"
            opacity={intro}
          />
          {/* y-axis (left) */}
          <line
            x1={PLOT.x}
            y1={PLOT.y}
            x2={PLOT.x}
            y2={PLOT.y + PLOT.h}
            stroke={axisStroke}
            strokeWidth={axisWidth}
            strokeLinecap="round"
            opacity={intro}
          />

          {/* All axis prose is SVG text — shrink-then-ellipsis via the
              raw fitFontSize/truncateForSlot helpers (CSS line-clamp
              doesn't work inside <text>). The budget is the plot width
              for horizontal labels, the plot height for the rotated
              y-axis title, and the half-plot-width for the corner
              "← lowLabel" / "highLabel →" tags. */}
          {xAxis?.label ? (() => {
            const fs = fitFontSize(xAxis.label, {maxWidth: PLOT.w - 80, basePx: 22, floorPx: 13, charAdvance: 0.56});
            const txt = truncateForSlot(xAxis.label, {maxWidth: PLOT.w - 80, fontSize: fs, charAdvance: 0.56});
            return (
              <text
                x={PLOT.x + PLOT.w / 2}
                y={PLOT.y + PLOT.h + 60}
                textAnchor="middle"
                fontFamily={interFamily}
                fontSize={fs}
                fontWeight={600}
                fill={ink.hi}
                opacity={intro}
              >
                {txt}
              </text>
            );
          })() : null}
          {xAxis?.lowLabel ? (() => {
            const raw = `← ${xAxis.lowLabel}`;
            const budget = PLOT.w / 2 - 20;
            const fs = fitFontSize(raw, {maxWidth: budget, basePx: 16, floorPx: 11, charAdvance: 0.6});
            const txt = truncateForSlot(raw, {maxWidth: budget, fontSize: fs, charAdvance: 0.6});
            return (
              <text
                x={PLOT.x + 6}
                y={PLOT.y + PLOT.h + 32}
                textAnchor="start"
                fontFamily={monoFamily}
                fontSize={fs}
                fill={ink.mid}
                opacity={intro}
              >
                {txt}
              </text>
            );
          })() : null}
          {xAxis?.highLabel ? (() => {
            const raw = `${xAxis.highLabel} →`;
            const budget = PLOT.w / 2 - 20;
            const fs = fitFontSize(raw, {maxWidth: budget, basePx: 16, floorPx: 11, charAdvance: 0.6});
            const txt = truncateForSlot(raw, {maxWidth: budget, fontSize: fs, charAdvance: 0.6});
            return (
              <text
                x={PLOT.x + PLOT.w - 6}
                y={PLOT.y + PLOT.h + 32}
                textAnchor="end"
                fontFamily={monoFamily}
                fontSize={fs}
                fill={ink.mid}
                opacity={intro}
              >
                {txt}
              </text>
            );
          })() : null}

          {yAxis?.label ? (() => {
            const fs = fitFontSize(yAxis.label, {maxWidth: PLOT.h - 60, basePx: 22, floorPx: 13, charAdvance: 0.56});
            const txt = truncateForSlot(yAxis.label, {maxWidth: PLOT.h - 60, fontSize: fs, charAdvance: 0.56});
            return (
              <text
                x={PLOT.x - 86}
                y={PLOT.y + PLOT.h / 2}
                textAnchor="middle"
                fontFamily={interFamily}
                fontSize={fs}
                fontWeight={600}
                fill={ink.hi}
                opacity={intro}
                transform={`rotate(-90 ${PLOT.x - 86} ${PLOT.y + PLOT.h / 2})`}
              >
                {txt}
              </text>
            );
          })() : null}
          {yAxis?.highLabel ? (() => {
            const raw = `↑ ${yAxis.highLabel}`;
            const budget = 240;
            const fs = fitFontSize(raw, {maxWidth: budget, basePx: 16, floorPx: 11, charAdvance: 0.6});
            const txt = truncateForSlot(raw, {maxWidth: budget, fontSize: fs, charAdvance: 0.6});
            return (
              <text
                x={PLOT.x - 18}
                y={PLOT.y + 12}
                textAnchor="end"
                fontFamily={monoFamily}
                fontSize={fs}
                fill={ink.mid}
                opacity={intro}
              >
                {txt}
              </text>
            );
          })() : null}
          {yAxis?.lowLabel ? (() => {
            const raw = `${yAxis.lowLabel} ↓`;
            const budget = 240;
            const fs = fitFontSize(raw, {maxWidth: budget, basePx: 16, floorPx: 11, charAdvance: 0.6});
            const txt = truncateForSlot(raw, {maxWidth: budget, fontSize: fs, charAdvance: 0.6});
            return (
              <text
                x={PLOT.x - 18}
                y={PLOT.y + PLOT.h - 4}
                textAnchor="end"
                fontFamily={monoFamily}
                fontSize={fs}
                fill={ink.mid}
                opacity={intro}
              >
                {txt}
              </text>
            );
          })() : null}

          {/* optional quadrant labels — italic ink in the four corners.
              Budget is half the plot width per quadrant minus the
              corner safety margin. */}
          {(() => {
            const renderQ = (txt: string | undefined, x: number, y: number, key: string) => {
              if (!txt) return null;
              const budget = PLOT.w / 2 - 60;
              const fs = fitFontSize(txt, {maxWidth: budget, basePx: 17, floorPx: 11, charAdvance: 0.56});
              const visible = truncateForSlot(txt, {maxWidth: budget, fontSize: fs, charAdvance: 0.56});
              return (
                <text
                  key={key}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  fontFamily={interFamily}
                  fontSize={fs}
                  fontStyle="italic"
                  fill={ink.faint}
                  opacity={intro * 0.85}
                >
                  {visible}
                </text>
              );
            };
            return (
              <>
                {renderQ(quadrants?.tl, qPos.tl.x, qPos.tl.y, 'tl')}
                {renderQ(quadrants?.tr, qPos.tr.x, qPos.tr.y, 'tr')}
                {renderQ(quadrants?.bl, qPos.bl.x, qPos.bl.y, 'bl')}
                {renderQ(quadrants?.br, qPos.br.x, qPos.br.y, 'br')}
              </>
            );
          })()}

          {/* subject markers — a dot + label + sub, with a glow ring on focus */}
          {subjects.map((s) => {
            const rf = revealOf(s.id);
            if (frame < rf) return null;
            const local = frame - rf;
            const a =
              local <= 0
                ? 0
                : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});
            const p = toScreen(s.x, s.y);
            const col = subjectColor(s);
            const focused = focusIds.has(s.id);
            const dim = hasFocus && !focused;
            const opacity = a * (dim ? 0.36 : 1);
            const dotR = focused ? 13 : 10;
            const ringR = focused ? 26 : 18;
            // Flip the label leftward when the marker sits in the right
            // third — keeps it inside the stage. Flip the sub above when the
            // marker sits in the bottom band so it doesn't go under the
            // axis.
            const flipLeft = s.x > 0.7;
            const flipUp = s.y < 0.18;

            return (
              <g key={s.id} opacity={opacity}>
                {/* glow ring — only for focused markers */}
                {focused ? (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={ringR}
                    fill="none"
                    stroke={col}
                    strokeWidth={2}
                    opacity={0.5}
                    style={{filter: `drop-shadow(0 0 14px ${glow(col, 0.85)})`}}
                  />
                ) : null}
                {/* the dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={dotR}
                  fill={col}
                  stroke={bg.base}
                  strokeWidth={3}
                  style={{
                    filter: `drop-shadow(0 0 ${focused ? 18 : 10}px ${glow(col, 0.7)})`,
                  }}
                />
                {/* the label + sub — pinned beside the dot. Budget the
                    available stage width on the dot's side so a longer
                    subject name doesn't bleed off-frame. */}
                {(() => {
                  const sideBudget = flipLeft
                    ? p.x - PLOT.x - dotR - 14
                    : PLOT.x + PLOT.w - p.x - dotR - 14;
                  const budget = Math.max(80, Math.min(420, sideBudget));
                  const fsLabel = fitFontSize(s.label, {maxWidth: budget, basePx: focused ? 22 : 20, floorPx: 12, charAdvance: 0.58});
                  const txtLabel = truncateForSlot(s.label, {maxWidth: budget, fontSize: fsLabel, charAdvance: 0.58});
                  return (
                    <text
                      x={p.x + (flipLeft ? -dotR - 10 : dotR + 10)}
                      y={p.y + (flipUp ? -10 : 6)}
                      textAnchor={flipLeft ? 'end' : 'start'}
                      fontFamily={interFamily}
                      fontSize={fsLabel}
                      fontWeight={600}
                      fill={ink.hi}
                      letterSpacing={-0.2}
                    >
                      {txtLabel}
                    </text>
                  );
                })()}
                {s.sub ? (() => {
                  const sideBudget = flipLeft
                    ? p.x - PLOT.x - dotR - 14
                    : PLOT.x + PLOT.w - p.x - dotR - 14;
                  const budget = Math.max(80, Math.min(420, sideBudget));
                  const fs = fitFontSize(s.sub, {maxWidth: budget, basePx: 14, floorPx: 10, charAdvance: 0.62});
                  const txt = truncateForSlot(s.sub, {maxWidth: budget, fontSize: fs, charAdvance: 0.62});
                  return (
                    <text
                      x={p.x + (flipLeft ? -dotR - 10 : dotR + 10)}
                      y={p.y + (flipUp ? -30 : 28)}
                      textAnchor={flipLeft ? 'end' : 'start'}
                      fontFamily={monoFamily}
                      fontSize={fs}
                      fill={ink.low}
                    >
                      {txt}
                    </text>
                  );
                })() : null}
              </g>
            );
          })}
        </svg>
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
