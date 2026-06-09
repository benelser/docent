// WaterfallScene — renders a distributed-trace waterfall (Jaeger /
// Tempo / Zipkin / OpenTelemetry idiom). Each span is a row; child
// spans indent under their parent; bar widths are proportional to
// durationMs / total trace duration. Beats activate spans through the
// existing reveal/focus model: `reveal` brings span rows on (with a
// bar-extension animation), `focus` narrows to one span and opens an
// attributes panel to the right. Zero-duration spans (the AgentOps
// flow_checkpoint and hallucination_flag) render as a diamond marker
// on the row, not a bar; hallucination_flag carries a dashed border
// to mark "event, not span." Status-false spans get a red error
// border.
//
// The aesthetic is "Jaeger UI, but cleaner": a dark panel, a top-of-
// stage time axis with ms ticks, indented rows, and span-kind-colored
// bars with a desaturated fill + a 2px solid border in the accent.
// Engineers should recognize "oh, that's a trace waterfall" within
// 0.5s.

import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Beat, ResolvedStyle, SceneRenderProps} from '@bjelser/kit';

import {FittedText, Narration, SceneFrame, activeBeatIndex, glow} from '../../_shared';
import type {WaterfallScene as WaterfallSceneSpec, WaterfallSpan, WaterfallSpanKind} from './validate';

// ---------------------------------------------------------------------------
// Layout constants
//
// The framed stage every scene sits inside. Same dims as FigureScene so the
// waterfall reads at the same scale as a still figure. Inside the stage:
//   PAD_X / PAD_Y       — inner gutter between the stage edge and content
//   AXIS_H              — height reserved for the ms tick axis at the top
//   LABEL_W             — width of the per-row label gutter on the left
//   INDENT_PX           — px of indent per parent-child depth level
//   ROW_H_MIN / ROW_H_MAX — row height auto-shrinks when there are many spans
//                           so a 50-span trace still fits without scrolling
//   BAR_H               — bar height inside its row
//   BAR_R               — bar corner radius
//   FOCUS_PANEL_W       — width of the focus-attributes side panel
//   FOCUS_PANEL_PAD     — internal padding of the focus panel
// ---------------------------------------------------------------------------

const STAGE_W = 1340;
const STAGE_H = 716;

const PAD_X = 32;
const PAD_Y = 28;
const AXIS_H = 56;
const LABEL_W = 360;
const INDENT_PX = 32;
const ROW_H_MIN = 32;
const ROW_H_MAX = 52;
const BAR_H_RATIO = 0.6; // bar height / row height
const BAR_R = 4;
const FOCUS_PANEL_W = 420;
const FOCUS_PANEL_PAD = 18;

// ---------------------------------------------------------------------------
// Span-kind palette
//
// The AgentOps taxonomy maps to specific accent keys. The component looks up
// the actual hex through `style.tokens.accent` so a preset override (e.g.
// engineering preset's cooler blues) propagates here for free. Falls back to
// the ACCENTS hardcoded map when the accent key isn't in the preset table.
// ---------------------------------------------------------------------------

interface KindStyle {
  /** Key into `style.tokens.accent`. */
  accent: string;
  /** Single-character glyph that decorates the row label. */
  glyph: string;
  /** Whether the row carries the dashed-border event treatment. */
  isEvent: boolean;
}

const KIND_STYLES: Record<WaterfallSpanKind, KindStyle> = {
  // Five AgentOps span types
  'plan-step':          {accent: 'violet', glyph: '◆', isEvent: false},
  'llm-call':           {accent: 'green',  glyph: '●', isEvent: false},
  'tool-call':          {accent: 'amber',  glyph: '▶', isEvent: false},
  'agent-decision':     {accent: 'blue',   glyph: '◈', isEvent: false},
  'flow-checkpoint':    {accent: 'cyan',   glyph: '◇', isEvent: false},
  // The event (not a span)
  'hallucination-flag': {accent: 'rose',   glyph: '!',  isEvent: true},
  // Generic primitives — useful for non-AgentOps traces
  'http':               {accent: 'blue',   glyph: '⇄', isEvent: false},
  'db':                 {accent: 'cyan',   glyph: '⌬', isEvent: false},
  'generic':            {accent: 'blue',   glyph: '·', isEvent: false},
};

const accentHexOf = (style: ResolvedStyle, key: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string | undefined>;
  return map[key] ?? map.blue ?? '#5cb6ff';
};

// ---------------------------------------------------------------------------
// Time-axis tick computation
//
// Pick a "nice" tick interval given a total trace duration. We aim for
// ≈5–8 ticks across the available width — too few and the trace looks
// undimensioned, too many and the labels collide. The interval is rounded
// to the 1/2/5 × 10ⁿ sequence so ticks land on readable round numbers:
//   50ms trace   → ticks at 10ms      (0, 10, 20, 30, 40, 50)
//   600ms trace  → ticks at 100ms     (0, 100, 200, 300, 400, 500, 600)
//   5000ms trace → ticks at 1000ms    (0, 1k, 2k, 3k, 4k, 5k)
// ---------------------------------------------------------------------------

const niceTickInterval = (totalMs: number): number => {
  if (totalMs <= 0) return 1;
  const target = totalMs / 6;
  const exp = Math.floor(Math.log10(target));
  const base = Math.pow(10, exp);
  const m = target / base;
  // Round to 1, 2, 5 × 10ⁿ — the "engineering-nice" sequence.
  const nice = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return nice * base;
};

const formatTickLabel = (ms: number, interval: number): string => {
  // Decide units once based on the interval — every tick reads in the
  // same unit, the eye never has to mode-switch mid-axis.
  if (interval >= 1000) {
    const v = ms / 1000;
    // Drop trailing .0 — "1s" not "1.0s"
    return `${Number.isInteger(v) ? v : v.toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
};

// ---------------------------------------------------------------------------
// Tree ordering — flatten the spans into a render order
//
// The waterfall renders rows depth-first, preserving the declared order
// within each level (the order the author wrote in the JSON). We compute
// this once per scene render — pure over the spans array.
// ---------------------------------------------------------------------------

interface OrderedRow {
  span: WaterfallSpan;
  depth: number;
  /** Index in render order — 0 for the first row. */
  order: number;
}

const orderRows = (spans: ReadonlyArray<WaterfallSpan>): OrderedRow[] => {
  const childrenOf: Record<string, WaterfallSpan[]> = {};
  const roots: WaterfallSpan[] = [];
  spans.forEach((s) => {
    if (s.parentId) {
      (childrenOf[s.parentId] ?? (childrenOf[s.parentId] = [])).push(s);
    } else {
      roots.push(s);
    }
  });
  const out: OrderedRow[] = [];
  let order = 0;
  const walk = (s: WaterfallSpan, depth: number): void => {
    out.push({span: s, depth, order: order++});
    const kids = childrenOf[s.id] ?? [];
    kids.forEach((k) => walk(k, depth + 1));
  };
  roots.forEach((r) => walk(r, 0));
  return out;
};

// ---------------------------------------------------------------------------
// Reveal-state machine — exactly the figure-scene pattern, adapted to
// span ids. A span's reveal frame is the start of the first beat whose
// `reveal` list includes its id; if no beat reveals it, it's visible
// from frame 0 (parity with figure's `revealOf` default).
// ---------------------------------------------------------------------------

export const WaterfallSceneComponent: React.FC<SceneRenderProps<WaterfallSceneSpec>> = ({
  scene,
  common,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  // Scene-level accent — the kicker/heading band reads this. The waterfall's
  // chrome (axis line, frame border) uses violet by convention since plan_step
  // (the AgentOps root span) is violet; preset overrides flow through.
  const sceneAccentHex = accentHexOf(style, 'violet');

  const rows = React.useMemo(() => orderRows(scene.spans), [scene.spans]);
  const totalMs = React.useMemo(() => {
    let max = 0;
    for (const s of scene.spans) {
      const end = (s.startMs ?? 0) + (s.durationMs ?? 0);
      if (end > max) max = end;
    }
    // Guard the zero-only case (all spans are events at t=0). Render a 1ms
    // span so the bar arithmetic doesn't divide by zero — visually the
    // entire stage is the trace, which is the correct "trace lasts zero
    // wall time" reading.
    return Math.max(1, max);
  }, [scene.spans]);

  // ---- reveal map (figure-scene parity) ------------------------------------
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
  const revealOf = (id: string): number => revealFrame[id] ?? 0;

  const active = activeBeatIndex(ts.beats, frame);
  const activeBeat: Beat | undefined = ts.beats[active]?.beat;
  const focusList = (activeBeat as {focus?: unknown} | undefined)?.focus;
  const focusIds = new Set<string>(
    Array.isArray(focusList)
      ? focusList.filter((id): id is string => typeof id === 'string')
      : [],
  );
  const hasFocus = focusIds.size > 0;
  const focusedSpan = hasFocus
    ? scene.spans.find((s) => focusIds.has(s.id))
    : undefined;

  // ---- row-height auto-shrink ---------------------------------------------
  // Decide a row height that lets all (currently revealed-or-future) spans
  // fit in the available column height. With ≤12 rows we sit at ROW_H_MAX;
  // past that we shrink linearly toward ROW_H_MIN, which is the
  // 50-span friction-flag territory.
  const availableRowH = STAGE_H - PAD_Y * 2 - AXIS_H;
  const rowH = Math.max(
    ROW_H_MIN,
    Math.min(ROW_H_MAX, Math.floor(availableRowH / Math.max(1, rows.length))),
  );

  // ---- time axis geometry --------------------------------------------------
  // The bar gutter starts at x = PAD_X + LABEL_W and ends at the right edge
  // of the stage (less padding and, when a focus panel is open, less the
  // panel width + its margin). We collapse the bar area when focused so the
  // attribute panel has room.
  const focusPanelOpen = !!focusedSpan;
  const barAreaLeft = PAD_X + LABEL_W;
  const barAreaRight =
    STAGE_W - PAD_X - (focusPanelOpen ? FOCUS_PANEL_W + 24 : 0);
  const barAreaW = Math.max(80, barAreaRight - barAreaLeft);
  const tickInterval = niceTickInterval(totalMs);
  const ticks: number[] = [];
  for (let t = 0; t <= totalMs + 1e-6; t += tickInterval) ticks.push(t);

  // x for a given ms inside the bar gutter
  const xAt = (ms: number): number =>
    barAreaLeft + (ms / totalMs) * barAreaW;

  // ---- intro spring (figure-parity) ----------------------------------------
  const intro = spring({frame, fps, config: {damping: 200, mass: 0.6}});
  const stageScale = interpolate(intro, [0, 1], [0.98, 1]);

  // ---- per-row render -------------------------------------------------------
  const renderRow = (r: OrderedRow): React.ReactNode => {
    const {span, depth} = r;
    const enter = revealOf(span.id);
    if (frame < enter) return null;
    const local = frame - enter;
    const enterT =
      local <= 0
        ? 0
        : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});

    const dim = hasFocus && !focusIds.has(span.id);
    const isFocus = hasFocus && focusIds.has(span.id);
    const opacity = enterT * (dim ? 0.4 : 1);

    const kindStyle = KIND_STYLES[span.kind] ?? KIND_STYLES.generic;
    const accentHex = accentHexOf(style, kindStyle.accent);
    const errored = span.statusOk === false;
    const borderColor = errored ? accentHexOf(style, 'rose') : accentHex;
    const borderStyle = kindStyle.isEvent ? 'dashed' : 'solid';

    const rowTop = PAD_Y + AXIS_H + r.order * rowH;
    const barH = Math.floor(rowH * BAR_H_RATIO);
    const barTop = rowTop + Math.floor((rowH - barH) / 2);
    const isZeroDuration = (span.durationMs ?? 0) <= 0;
    const startX = xAt(span.startMs ?? 0);
    const endX = xAt((span.startMs ?? 0) + (span.durationMs ?? 0));
    // Animated bar extension: start at width 0, interpolate to full width
    // over the entrance spring. The zero-duration markers don't extend —
    // they pop in scaled.
    const fullW = Math.max(2, endX - startX);
    const barW = Math.max(2, Math.round(fullW * enterT));

    // Label row — indent + glyph + truncated label
    const labelLeft = PAD_X + depth * INDENT_PX;
    const labelMaxW = LABEL_W - depth * INDENT_PX - 16;

    return (
      <div key={span.id} style={{position: 'absolute', inset: 0, opacity}}>
        {/* row label — indented, glyph + label */}
        <div
          style={{
            position: 'absolute',
            left: labelLeft,
            top: rowTop,
            height: rowH,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              fontFamily: monoFamily,
              fontSize: Math.max(11, Math.floor(rowH * 0.42)),
              color: accentHex,
              width: 16,
              textAlign: 'center',
              lineHeight: 1,
            }}
          >
            {kindStyle.glyph}
          </div>
          <FittedText
            text={span.label}
            maxWidth={Math.max(60, labelMaxW)}
            basePx={Math.max(11, Math.floor(rowH * 0.4))}
            floorPx={10}
            charAdvance={0.55}
            mode="shrink-single"
            style={{
              fontFamily: monoFamily,
              color: isFocus ? ink.hi : ink.mid,
              fontWeight: isFocus ? 600 : 500,
              letterSpacing: 0.2,
            }}
          />
        </div>

        {/* bar OR zero-duration marker */}
        {isZeroDuration ? (
          // Diamond marker — rotated square. Hallucination_flag gets a
          // dashed border to mark "event, not span".
          <div
            style={{
              position: 'absolute',
              left: startX - 9,
              top: barTop + Math.floor(barH / 2) - 9,
              width: 18,
              height: 18,
              transform: `rotate(45deg) scale(${interpolate(enterT, [0, 1], [0.5, 1])})`,
              background: glow(accentHex, 0.4),
              border: `2px ${borderStyle} ${borderColor}`,
              boxShadow: isFocus
                ? `0 0 18px ${glow(accentHex, 0.7)}`
                : `0 0 10px ${glow(accentHex, 0.3)}`,
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              left: startX,
              top: barTop,
              width: barW,
              height: barH,
              borderRadius: BAR_R,
              background: `linear-gradient(180deg, ${glow(accentHex, 0.55)}, ${glow(accentHex, 0.25)})`,
              border: `2px ${borderStyle} ${borderColor}`,
              boxShadow: isFocus
                ? `0 0 18px ${glow(accentHex, 0.6)}`
                : 'none',
            }}
          >
            {/* duration label, inside-right when there's room, outside-right otherwise */}
            {barW > 60 ? (
              <div
                style={{
                  position: 'absolute',
                  right: 6,
                  top: 0,
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  fontFamily: monoFamily,
                  fontSize: Math.max(9, Math.floor(barH * 0.5)),
                  color: ink.hi,
                  opacity: 0.85,
                }}
              >
                {span.durationMs}ms
              </div>
            ) : (
              <div
                style={{
                  position: 'absolute',
                  left: barW + 6,
                  top: 0,
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  fontFamily: monoFamily,
                  fontSize: Math.max(9, Math.floor(barH * 0.5)),
                  color: ink.low,
                  whiteSpace: 'nowrap',
                }}
              >
                {span.durationMs}ms
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ---- focus panel ----------------------------------------------------------
  const renderFocusPanel = (): React.ReactNode => {
    if (!focusedSpan) return null;
    const kindStyle = KIND_STYLES[focusedSpan.kind] ?? KIND_STYLES.generic;
    const accentHex = accentHexOf(style, kindStyle.accent);
    const attrs = focusedSpan.attributes ?? {};
    const entries = Object.entries(attrs);
    const panelLeft = STAGE_W - PAD_X - FOCUS_PANEL_W;
    const panelTop = PAD_Y + AXIS_H;
    const panelEnter = spring({
      frame: frame - (ts.beats[active]?.startFrame ?? 0),
      fps,
      config: {damping: 200, mass: 0.7},
    });
    return (
      <div
        style={{
          position: 'absolute',
          left: panelLeft,
          top: panelTop,
          width: FOCUS_PANEL_W,
          maxHeight: STAGE_H - panelTop - PAD_Y,
          padding: FOCUS_PANEL_PAD,
          borderRadius: 14,
          background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
          border: `1.5px solid ${accentHex}`,
          boxShadow: `0 0 0 1px ${glow(accentHex, 0.3)}, 0 30px 60px -24px #000000ee`,
          opacity: panelEnter,
          transform: `translateX(${interpolate(panelEnter, [0, 1], [16, 0])}px)`,
          overflow: 'hidden',
        }}
      >
        {/* kind tag */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: monoFamily,
            fontSize: 12,
            letterSpacing: 1.5,
            color: accentHex,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          <span>{kindStyle.glyph}</span>
          <span>{focusedSpan.kind}</span>
          {focusedSpan.statusOk === false ? (
            <span style={{color: accentHexOf(style, 'rose'), marginLeft: 6}}>
              · error
            </span>
          ) : null}
        </div>
        {/* span label */}
        <FittedText
          text={focusedSpan.label}
          maxWidth={FOCUS_PANEL_W - FOCUS_PANEL_PAD * 2}
          basePx={20}
          floorPx={13}
          charAdvance={0.58}
          mode="shrink-wrap"
          maxLines={2}
          lineHeight={1.2}
          style={{
            fontFamily: sansFamily,
            fontWeight: 700,
            color: ink.hi,
            letterSpacing: -0.2,
          }}
        />
        {/* duration line */}
        <div
          style={{
            fontFamily: monoFamily,
            fontSize: 13,
            color: ink.low,
            marginTop: 6,
          }}
        >
          {focusedSpan.durationMs}ms @ {focusedSpan.startMs}ms
        </div>
        {/* divider */}
        <div
          style={{
            height: 1,
            background: bg.line,
            margin: '14px 0 12px 0',
          }}
        />
        {/* attributes table */}
        {entries.length === 0 ? (
          <div
            style={{
              fontFamily: monoFamily,
              fontSize: 12,
              color: ink.faint,
              fontStyle: 'italic',
            }}
          >
            no attributes
          </div>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
            {entries.map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  padding: '6px 0',
                  borderBottom: `1px solid ${bg.line}`,
                }}
              >
                <div
                  style={{
                    fontFamily: monoFamily,
                    fontSize: 11,
                    color: ink.low,
                    letterSpacing: 0.6,
                  }}
                >
                  {k}
                </div>
                <div
                  style={{
                    fontFamily: monoFamily,
                    fontSize: 14,
                    color: ink.hi,
                    wordBreak: 'break-all',
                  }}
                >
                  {String(v)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <SceneFrame
      style={style}
      accentHex={sceneAccentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 224,
          width: STAGE_W,
          height: STAGE_H,
          transform: `translateX(-50%) scale(${stageScale})`,
          opacity: intro,
          borderRadius: 18,
          background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
          border: `1.5px solid ${sceneAccentHex}`,
          boxShadow: `0 0 0 1px ${glow(sceneAccentHex, 0.3)}, 0 40px 90px -36px #000000ee`,
          overflow: 'hidden',
        }}
      >
        {/* time axis — ms ticks across the top of the bar gutter */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: PAD_Y,
            width: STAGE_W,
            height: AXIS_H,
          }}
        >
          {/* axis baseline */}
          <div
            style={{
              position: 'absolute',
              left: barAreaLeft,
              right: STAGE_W - barAreaRight,
              bottom: 0,
              height: 1,
              background: bg.lineHi,
            }}
          />
          {/* "duration" header above the bar gutter */}
          <div
            style={{
              position: 'absolute',
              left: barAreaLeft,
              top: 0,
              fontFamily: monoFamily,
              fontSize: 11,
              color: ink.faint,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            trace · {totalMs.toFixed(0)}ms total
          </div>
          {/* "spans" header above the label gutter */}
          <div
            style={{
              position: 'absolute',
              left: PAD_X,
              top: 0,
              fontFamily: monoFamily,
              fontSize: 11,
              color: ink.faint,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            spans
          </div>
          {/* ticks */}
          {ticks.map((t, i) => {
            const x = xAt(t);
            return (
              <div key={i}>
                <div
                  style={{
                    position: 'absolute',
                    left: x,
                    bottom: 0,
                    height: 6,
                    width: 1,
                    background: bg.lineHi,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: x - 30,
                    bottom: 10,
                    width: 60,
                    textAlign: 'center',
                    fontFamily: monoFamily,
                    fontSize: 11,
                    color: ink.low,
                  }}
                >
                  {formatTickLabel(t, tickInterval)}
                </div>
              </div>
            );
          })}
        </div>

        {/* vertical gridlines under the bar gutter, on each tick */}
        {ticks.map((t, i) => {
          if (i === 0) return null; // skip the leftmost (axis already implies it)
          const x = xAt(t);
          return (
            <div
              key={`g-${i}`}
              style={{
                position: 'absolute',
                left: x,
                top: PAD_Y + AXIS_H,
                bottom: PAD_Y,
                width: 1,
                background: bg.line,
                opacity: 0.45,
              }}
            />
          );
        })}

        {/* rows */}
        {rows.map((r) => renderRow(r))}

        {/* focus side-panel */}
        {renderFocusPanel()}
      </div>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};

export default WaterfallSceneComponent;
