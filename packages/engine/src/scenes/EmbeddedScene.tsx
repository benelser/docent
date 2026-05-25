import React from 'react';
import type {ResolvedStyle} from '../style';
import type {EmbeddedScene as EmbeddedSceneSpec} from '../engine/spec';
import {fitFontSize, truncateForSlot} from '../components/FittedText';
import {paletteSceneHex} from '../engine/knobs';
import {glow} from '../theme';

// Sprint B — compositional grammar.
//
// An EmbeddedScene renders a static visual tableau for one of the six embed
// types inside the host's allocated bounds. No animation, no audio, no beats:
// only the resting visual state. The host owns the timing (when the embed
// appears, when it dims) via reveal/focus on the slot's id; this component
// owns the pixels.
//
// Bounds are in stage (1920×1080) coordinates so the host can place the embed
// inside the parent's SVG/AbsoluteFill without an extra transform. The
// inherited style flows through paletteSceneHex / the ink+bg tokens.
//
// Why one component instead of six embedded-mode flags on the host renderers:
// the host renderers carry beat-orchestration, narration overlays, camera, and
// full-stage layouts — none of which apply inside a slot. A single tableau
// renderer per embed type keeps the change surface small and the static-only
// contract impossible to violate by accident.

export type EmbedBounds = {cx: number; cy: number; w: number; h: number};

type Props = {
  embed: EmbeddedSceneSpec;
  bounds: EmbedBounds;
  inheritedStyle: ResolvedStyle;
  // The parent scene's accent — the embed inherits it when the embed has no
  // explicit accent of its own.
  parentAccent: string;
};

// ----- per-type tableau renderers ------------------------------------------
// Each takes the spec, bounds, and resolved tokens, and returns an SVG group
// that draws the resting state of the scene type. Long text routes through
// fitFontSize / truncateForSlot.

const accentOf = (key: string | undefined, style: ResolvedStyle): string =>
  (key && ((style.tokens.accent as unknown) as Record<string, string>)[key]) ||
  style.tokens.accent.blue;

const renderMechanismEmbed = (
  embed: EmbeddedSceneSpec,
  bounds: EmbedBounds,
  style: ResolvedStyle,
  accentHex: string,
): React.ReactNode => {
  const parts = embed.parts ?? [];
  const motion = embed.motion;
  const ink = style.tokens.ink;
  const monoFamily = style.tokens.typography.family.mono;
  const x0 = bounds.cx - bounds.w / 2;
  const y0 = bounds.cy - bounds.h / 2;
  // Map each part's 0..1 position into the embed bounds.
  const partPx = (p: {pos: {x: number; y: number}}): {x: number; y: number} => ({
    x: x0 + p.pos.x * bounds.w,
    y: y0 + p.pos.y * bounds.h,
  });
  return (
    <g>
      {/* edges between parts named by the motion path — drawn as a static
          skeleton. The motion would carry a token around this path live;
          here we show the structure of the loop. */}
      {motion?.kind === 'cycle' && Array.isArray(motion.path) ? (
        <g opacity={0.85}>
          {motion.path.map((id, i) => {
            const from = parts.find((p) => p.id === id);
            const to = parts.find((p) => p.id === motion.path[(i + 1) % motion.path.length]);
            if (!from || !to) return null;
            const a = partPx(from);
            const b = partPx(to);
            return (
              <line
                key={`mech-edge-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={accentHex}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                opacity={0.6}
              />
            );
          })}
        </g>
      ) : null}
      {parts.map((p) => {
        const c = partPx(p);
        const r = Math.min(bounds.w, bounds.h) * 0.06;
        const labelFs = fitFontSize(p.label, {
          maxWidth: bounds.w * 0.32,
          basePx: Math.max(9, Math.min(13, bounds.w * 0.04)),
          floorPx: 8,
          charAdvance: 0.6,
        });
        const labelTxt = truncateForSlot(p.label, {
          maxWidth: bounds.w * 0.32,
          fontSize: labelFs,
          charAdvance: 0.6,
        });
        return (
          <g key={p.id}>
            <circle
              cx={c.x}
              cy={c.y}
              r={r}
              fill={accentHex}
              opacity={0.85}
              stroke={style.tokens.bg.base}
              strokeWidth={1}
              style={{filter: `drop-shadow(0 0 4px ${glow(accentHex, 0.4)})`}}
            />
            <text
              x={c.x}
              y={c.y + r + labelFs + 2}
              textAnchor="middle"
              fontFamily={monoFamily}
              fontSize={labelFs}
              fill={ink.mid}
            >
              {labelTxt}
            </text>
          </g>
        );
      })}
    </g>
  );
};

const renderVennEmbed = (
  embed: EmbeddedSceneSpec,
  bounds: EmbedBounds,
  style: ResolvedStyle,
  accentHex: string,
): React.ReactNode => {
  const sets = embed.sets ?? [];
  const ink = style.tokens.ink;
  const monoFamily = style.tokens.typography.family.mono;
  const n = Math.min(3, Math.max(2, sets.length));
  const cx = bounds.cx;
  const cy = bounds.cy;
  // Radius and offsets sized to the embed bounds.
  const r = Math.min(bounds.w, bounds.h) * 0.28;
  const off = r * 0.55;
  const positions =
    n === 2
      ? [
          {x: cx - off, y: cy},
          {x: cx + off, y: cy},
        ]
      : [
          {x: cx, y: cy - off},
          {x: cx - off * 0.95, y: cy + off * 0.55},
          {x: cx + off * 0.95, y: cy + off * 0.55},
        ];
  return (
    <g>
      {sets.slice(0, n).map((s, i) => (
        <g key={s.id}>
          <circle
            cx={positions[i].x}
            cy={positions[i].y}
            r={r}
            fill={accentHex}
            fillOpacity={0.12}
            stroke={accentHex}
            strokeWidth={1.4}
            opacity={0.9}
          />
          {(() => {
            const fs = fitFontSize(s.label, {
              maxWidth: bounds.w * 0.28,
              basePx: Math.max(9, Math.min(12, bounds.w * 0.035)),
              floorPx: 8,
              charAdvance: 0.6,
            });
            const txt = truncateForSlot(s.label, {
              maxWidth: bounds.w * 0.28,
              fontSize: fs,
              charAdvance: 0.6,
            });
            // Label outside the circle, away from the center.
            const dx = positions[i].x - cx;
            const dy = positions[i].y - cy;
            const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            const lx = positions[i].x + (dx / len) * (r + 14);
            const ly = positions[i].y + (dy / len) * (r + 14);
            return (
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                fontFamily={monoFamily}
                fontSize={fs}
                fill={ink.mid}
              >
                {txt}
              </text>
            );
          })()}
        </g>
      ))}
    </g>
  );
};

const renderChartEmbed = (
  embed: EmbeddedSceneSpec,
  bounds: EmbedBounds,
  style: ResolvedStyle,
  accentHex: string,
): React.ReactNode => {
  const ink = style.tokens.ink;
  const x0 = bounds.cx - bounds.w / 2 + bounds.w * 0.1;
  const y0 = bounds.cy - bounds.h / 2 + bounds.h * 0.1;
  const w = bounds.w * 0.8;
  const h = bounds.h * 0.8;
  // Draw axes.
  const axesEl = (
    <>
      <line
        x1={x0}
        y1={y0 + h}
        x2={x0 + w}
        y2={y0 + h}
        stroke={ink.low}
        strokeWidth={1.5}
      />
      <line x1={x0} y1={y0} x2={x0} y2={y0 + h} stroke={ink.low} strokeWidth={1.5} />
    </>
  );
  // Render each series in its final/resting state.
  const series = embed.series ?? [];
  return (
    <g>
      {axesEl}
      {series.map((s, si) => {
        if (s.kind === 'line') {
          let pts: [number, number][] = [];
          if (Array.isArray(s.points) && s.points.length > 0) {
            // Normalize against the (min, max) of the points themselves.
            const xs = s.points.map((p) => p[0]);
            const ys = s.points.map((p) => p[1]);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const rangeX = maxX - minX || 1;
            const rangeY = maxY - minY || 1;
            pts = s.points.map(
              ([x, y]) =>
                [x0 + ((x - minX) / rangeX) * w, y0 + h - ((y - minY) / rangeY) * h] as [number, number],
            );
          } else if (s.fn) {
            // Sample the named function across 0..1 normalized then map to axes.
            const samples = 24;
            const fnEval: Record<string, (x: number) => number> = {
              linear: (x) => x,
              'x^2': (x) => x * x,
              sqrt: (x) => Math.sqrt(Math.max(0, x)),
              sin: (x) => 0.5 + 0.5 * Math.sin(x * Math.PI * 2),
              exp: (x) => (Math.exp(x) - 1) / (Math.E - 1),
              log: (x) => Math.log(x * (Math.E - 1) + 1),
              reciprocal: (x) => 1 / (x * 9 + 1),
            };
            const f = fnEval[s.fn] ?? fnEval.linear;
            pts = Array.from({length: samples}, (_, i) => {
              const x = i / (samples - 1);
              const y = Math.max(0, Math.min(1, f(x)));
              return [x0 + x * w, y0 + h - y * h] as [number, number];
            });
          }
          if (pts.length === 0) return null;
          const d = pts
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
            .join(' ');
          return (
            <path
              key={`l-${si}`}
              d={d}
              stroke={accentOf(s.accent, style) || accentHex}
              strokeWidth={2}
              fill="none"
            />
          );
        }
        if (s.kind === 'bars' && Array.isArray(s.data)) {
          const maxV = Math.max(0, ...s.data.map((d) => d.value));
          const barW = (w / s.data.length) * 0.65;
          return (
            <g key={`b-${si}`}>
              {s.data.map((d, di) => {
                const bx = x0 + (di + 0.5) * (w / s.data!.length) - barW / 2;
                const bh = maxV > 0 ? (d.value / maxV) * h : 0;
                return (
                  <rect
                    key={di}
                    x={bx}
                    y={y0 + h - bh}
                    width={barW}
                    height={bh}
                    fill={accentOf(s.accent, style) || accentHex}
                    opacity={0.8}
                  />
                );
              })}
            </g>
          );
        }
        return null;
      })}
    </g>
  );
};

const renderQuantitiesEmbed = (
  embed: EmbeddedSceneSpec,
  bounds: EmbedBounds,
  style: ResolvedStyle,
  accentHex: string,
): React.ReactNode => {
  const ink = style.tokens.ink;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;
  // Prefer metrics (the tweened figures), else fall back to figures.
  const items = (embed.metrics ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    value: '—', // metrics' values are tweened; in a tableau we show the label only
    unit: m.unit,
  }));
  const figures = embed.figures ?? [];
  for (const f of figures) {
    items.push({id: f.id, label: f.label, value: String(f.value ?? ''), unit: f.unit});
  }
  const n = items.length;
  if (n === 0) return null;
  const cols = Math.min(3, n);
  const rows = Math.ceil(n / cols);
  const cellW = bounds.w / cols;
  const cellH = bounds.h / rows;
  const x0 = bounds.cx - bounds.w / 2;
  const y0 = bounds.cy - bounds.h / 2;
  return (
    <g>
      {items.map((it, i) => {
        const ci = i % cols;
        const ri = Math.floor(i / cols);
        const cx = x0 + (ci + 0.5) * cellW;
        const cy = y0 + (ri + 0.5) * cellH;
        const labelFs = fitFontSize(it.label, {
          maxWidth: cellW * 0.85,
          basePx: Math.max(8, Math.min(11, cellW * 0.07)),
          floorPx: 7,
          charAdvance: 0.6,
        });
        const labelTxt = truncateForSlot(it.label, {
          maxWidth: cellW * 0.85,
          fontSize: labelFs,
          charAdvance: 0.6,
        });
        const valFs = Math.max(12, Math.min(28, cellH * 0.32));
        const valTxt = truncateForSlot(it.value + (it.unit ? ` ${it.unit}` : ''), {
          maxWidth: cellW * 0.85,
          fontSize: valFs,
          charAdvance: 0.6,
        });
        return (
          <g key={it.id}>
            <text
              x={cx}
              y={cy - 2}
              textAnchor="middle"
              fontFamily={sansFamily}
              fontWeight={700}
              fontSize={valFs}
              fill={accentHex}
            >
              {valTxt}
            </text>
            <text
              x={cx}
              y={cy + valFs * 0.7 + 4}
              textAnchor="middle"
              fontFamily={monoFamily}
              fontSize={labelFs}
              fill={ink.mid}
            >
              {labelTxt}
            </text>
          </g>
        );
      })}
    </g>
  );
};

const renderCompareEmbed = (
  embed: EmbeddedSceneSpec,
  bounds: EmbedBounds,
  style: ResolvedStyle,
  accentHex: string,
): React.ReactNode => {
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const monoFamily = style.tokens.typography.family.mono;
  const cols = embed.columns ?? [];
  const rows = embed.rows ?? [];
  if (cols.length === 0 || rows.length === 0) return null;
  const x0 = bounds.cx - bounds.w / 2;
  const y0 = bounds.cy - bounds.h / 2;
  const headerH = bounds.h * 0.18;
  const gutterW = bounds.w * 0.32;
  const colW = (bounds.w - gutterW) / cols.length;
  const rowH = (bounds.h - headerH) / rows.length;
  return (
    <g>
      {/* column headers */}
      {cols.map((c, ci) => {
        const cx = x0 + gutterW + (ci + 0.5) * colW;
        const fs = fitFontSize(c.label, {
          maxWidth: colW * 0.85,
          basePx: Math.max(9, Math.min(13, colW * 0.16)),
          floorPx: 8,
          charAdvance: 0.6,
        });
        const txt = truncateForSlot(c.label, {
          maxWidth: colW * 0.85,
          fontSize: fs,
          charAdvance: 0.6,
        });
        return (
          <g key={c.id}>
            <line
              x1={x0 + gutterW + ci * colW}
              y1={y0 + headerH}
              x2={x0 + gutterW + (ci + 1) * colW}
              y2={y0 + headerH}
              stroke={accentHex}
              strokeWidth={1}
              opacity={0.6}
            />
            <text
              x={cx}
              y={y0 + headerH - 6}
              textAnchor="middle"
              fontFamily={monoFamily}
              fontSize={fs}
              fontWeight={600}
              fill={ink.hi}
            >
              {txt}
            </text>
          </g>
        );
      })}
      {rows.map((r, ri) => {
        const ry = y0 + headerH + (ri + 0.5) * rowH;
        const fs = fitFontSize(r.label, {
          maxWidth: gutterW * 0.9,
          basePx: Math.max(8, Math.min(11, gutterW * 0.08)),
          floorPx: 7,
          charAdvance: 0.6,
        });
        const txt = truncateForSlot(r.label, {
          maxWidth: gutterW * 0.9,
          fontSize: fs,
          charAdvance: 0.6,
        });
        return (
          <g key={r.id}>
            <text
              x={x0 + 6}
              y={ry + fs * 0.3}
              textAnchor="start"
              fontFamily={monoFamily}
              fontSize={fs}
              fill={ink.mid}
            >
              {txt}
            </text>
            {(r.cells ?? []).slice(0, cols.length).map((cell, ci) => {
              const cx = x0 + gutterW + (ci + 0.5) * colW;
              const isWin = cell?.verdict === 'win';
              const isLose = cell?.verdict === 'lose';
              const cellFs = fitFontSize(cell?.text ?? '—', {
                maxWidth: colW * 0.85,
                basePx: Math.max(7, Math.min(10, colW * 0.13)),
                floorPx: 6,
                charAdvance: 0.6,
              });
              const cellTxt = truncateForSlot(cell?.text ?? '—', {
                maxWidth: colW * 0.85,
                fontSize: cellFs,
                charAdvance: 0.6,
              });
              return (
                <g key={`${r.id}-${ci}`}>
                  <rect
                    x={x0 + gutterW + ci * colW + 4}
                    y={ry - rowH / 2 + 4}
                    width={colW - 8}
                    height={rowH - 8}
                    rx={4}
                    fill={isWin ? glow(accentHex, 0.16) : bg.panel}
                    stroke={isWin ? accentHex : bg.line}
                    strokeWidth={1}
                    opacity={isLose ? 0.45 : 1}
                  />
                  <text
                    x={cx}
                    y={ry + cellFs * 0.3}
                    textAnchor="middle"
                    fontFamily={monoFamily}
                    fontSize={cellFs}
                    fontWeight={isWin ? 600 : 500}
                    fill={isWin ? accentHex : isLose ? ink.low : ink.mid}
                  >
                    {cellTxt}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
};

const renderStructureEmbed = (
  embed: EmbeddedSceneSpec,
  bounds: EmbedBounds,
  style: ResolvedStyle,
  accentHex: string,
): React.ReactNode => {
  const nodes = embed.nodes ?? [];
  const edges = embed.edges ?? [];
  const grid = embed.grid ?? {cols: 3, rows: 3};
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const monoFamily = style.tokens.typography.family.mono;
  const x0 = bounds.cx - bounds.w / 2;
  const y0 = bounds.cy - bounds.h / 2;
  const cellW = bounds.w / Math.max(1, grid.cols);
  const cellH = bounds.h / Math.max(1, grid.rows);
  const boxOf = (n: {col: number; row: number; wide?: boolean}) => {
    const w = (n.wide ? 2 : 1) * cellW * 0.85;
    const h = cellH * 0.7;
    const cx = x0 + (n.col + (n.wide ? 1 : 0.5)) * cellW;
    const cy = y0 + (n.row + 0.5) * cellH;
    return {cx, cy, w, h};
  };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <g>
      {edges.map((e) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return null;
        const aB = boxOf(a);
        const bB = boxOf(b);
        return (
          <line
            key={e.id}
            x1={aB.cx}
            y1={aB.cy}
            x2={bB.cx}
            y2={bB.cy}
            stroke={ink.low}
            strokeWidth={1}
            opacity={0.7}
          />
        );
      })}
      {nodes.map((n) => {
        const b = boxOf(n);
        const fs = fitFontSize(n.label, {
          maxWidth: b.w * 0.85,
          basePx: Math.max(8, Math.min(12, b.w * 0.13)),
          floorPx: 7,
          charAdvance: 0.6,
        });
        const txt = truncateForSlot(n.label, {
          maxWidth: b.w * 0.85,
          fontSize: fs,
          charAdvance: 0.6,
        });
        return (
          <g key={n.id}>
            <rect
              x={b.cx - b.w / 2}
              y={b.cy - b.h / 2}
              width={b.w}
              height={b.h}
              rx={4}
              fill={bg.panel}
              stroke={n.weight === 'hero' || n.emphasis ? accentHex : bg.line}
              strokeWidth={1.2}
            />
            <text
              x={b.cx}
              y={b.cy + fs * 0.3}
              textAnchor="middle"
              fontFamily={monoFamily}
              fontSize={fs}
              fontWeight={600}
              fill={ink.hi}
            >
              {txt}
            </text>
          </g>
        );
      })}
    </g>
  );
};

const renderCausalLoopEmbed = (
  embed: EmbeddedSceneSpec,
  bounds: EmbedBounds,
  style: ResolvedStyle,
  accentHex: string,
): React.ReactNode => {
  const vars = embed.variables ?? [];
  const edges = embed.causalEdges ?? [];
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const monoFamily = style.tokens.typography.family.mono;
  const cx = bounds.cx;
  const cy = bounds.cy;
  const r = Math.min(bounds.w, bounds.h) * 0.36;
  const positions = new Map<string, {x: number; y: number}>();
  vars.forEach((v, i) => {
    const theta = (i / vars.length) * Math.PI * 2 - Math.PI / 2;
    positions.set(v.id, {
      x: cx + r * Math.cos(theta),
      y: cy + r * Math.sin(theta),
    });
  });
  return (
    <g>
      {edges.map((e) => {
        const a = positions.get(e.from);
        const b = positions.get(e.to);
        if (!a || !b) return null;
        return (
          <line
            key={e.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={accentHex}
            strokeWidth={1.2}
            opacity={0.65}
            markerEnd="url(#none)"
          />
        );
      })}
      {vars.map((v) => {
        const p = positions.get(v.id);
        if (!p) return null;
        const dotR = Math.min(bounds.w, bounds.h) * 0.06;
        const fs = fitFontSize(v.label, {
          maxWidth: bounds.w * 0.3,
          basePx: Math.max(8, Math.min(11, bounds.w * 0.04)),
          floorPx: 7,
          charAdvance: 0.6,
        });
        const txt = truncateForSlot(v.label, {
          maxWidth: bounds.w * 0.3,
          fontSize: fs,
          charAdvance: 0.6,
        });
        return (
          <g key={v.id}>
            <circle
              cx={p.x}
              cy={p.y}
              r={dotR}
              fill={bg.panel}
              stroke={accentHex}
              strokeWidth={1.4}
            />
            <text
              x={p.x}
              y={p.y + dotR + fs + 1}
              textAnchor="middle"
              fontFamily={monoFamily}
              fontSize={fs}
              fill={ink.mid}
            >
              {txt}
            </text>
          </g>
        );
      })}
    </g>
  );
};

const renderTreeEmbed = (
  embed: EmbeddedSceneSpec,
  bounds: EmbedBounds,
  style: ResolvedStyle,
  accentHex: string,
): React.ReactNode => {
  const root = embed.root;
  if (!root) return null;
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const monoFamily = style.tokens.typography.family.mono;
  // Flatten the tree into levels (BFS).
  type Lvl = {id: string; label: string; depth: number; parent: string | null; xFrac: number};
  const levels: Lvl[][] = [];
  const all: Lvl[] = [];
  const walk = (n: any, depth: number, parent: string | null): void => {
    if (!levels[depth]) levels[depth] = [];
    const entry: Lvl = {id: n.id, label: n.label, depth, parent, xFrac: 0};
    levels[depth].push(entry);
    all.push(entry);
    if (Array.isArray(n.children)) n.children.forEach((c: any) => walk(c, depth + 1, n.id));
  };
  walk(root, 0, null);
  // Assign x positions per level.
  levels.forEach((lvl) => {
    lvl.forEach((n, i) => {
      n.xFrac = (i + 1) / (lvl.length + 1);
    });
  });
  const x0 = bounds.cx - bounds.w / 2;
  const y0 = bounds.cy - bounds.h / 2;
  const levelH = bounds.h / Math.max(1, levels.length);
  const posOf = (n: Lvl): {x: number; y: number} => ({
    x: x0 + n.xFrac * bounds.w,
    y: y0 + (n.depth + 0.5) * levelH,
  });
  const byId = new Map(all.map((n) => [n.id, n]));
  return (
    <g>
      {all.map((n) => {
        if (!n.parent) return null;
        const p = byId.get(n.parent);
        if (!p) return null;
        const a = posOf(p);
        const b = posOf(n);
        return (
          <line
            key={`t-edge-${n.id}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={ink.low}
            strokeWidth={1}
            opacity={0.6}
          />
        );
      })}
      {all.map((n) => {
        const p = posOf(n);
        const fs = fitFontSize(n.label, {
          maxWidth: bounds.w / Math.max(1, (levels[n.depth] || []).length) * 0.85,
          basePx: Math.max(7, Math.min(11, bounds.w * 0.035)),
          floorPx: 6,
          charAdvance: 0.6,
        });
        const txt = truncateForSlot(n.label, {
          maxWidth: bounds.w / Math.max(1, (levels[n.depth] || []).length) * 0.85,
          fontSize: fs,
          charAdvance: 0.6,
        });
        return (
          <g key={n.id}>
            <circle
              cx={p.x}
              cy={p.y}
              r={Math.max(4, bounds.w * 0.03)}
              fill={n.depth === 0 ? accentHex : bg.panel}
              stroke={accentHex}
              strokeWidth={1.2}
            />
            <text
              x={p.x}
              y={p.y + Math.max(4, bounds.w * 0.03) + fs + 1}
              textAnchor="middle"
              fontFamily={monoFamily}
              fontSize={fs}
              fill={ink.mid}
            >
              {txt}
            </text>
          </g>
        );
      })}
    </g>
  );
};

// ----- entry point ---------------------------------------------------------
//
// Render any embed type. The host scene passes its bounding box and the
// resolved style. The result is an SVG group meant to live inside the host's
// outer SVG (viewBox 0 0 1920 1080), so the host doesn't need to set up an
// extra coordinate system.

export const EmbeddedScene: React.FC<Props> = ({
  embed,
  bounds,
  inheritedStyle,
  parentAccent,
}) => {
  const accentHex =
    paletteSceneHex(undefined, undefined, inheritedStyle) || parentAccent;
  const monoFamily = inheritedStyle.tokens.typography.family.mono;
  const ink = inheritedStyle.tokens.ink;
  // Sized to half the embed dims (the parent's allocation), tuned for ~ -1..0
  // padding inside the slot frame.
  const inner: EmbedBounds = {
    cx: bounds.cx,
    cy: bounds.cy - (embed.caption ? 8 : 0),
    w: bounds.w - 12,
    h: bounds.h - 16 - (embed.caption ? 16 : 0),
  };
  let body: React.ReactNode = null;
  switch (embed.type) {
    case 'mechanism':
      body = renderMechanismEmbed(embed, inner, inheritedStyle, accentHex);
      break;
    case 'venn':
      body = renderVennEmbed(embed, inner, inheritedStyle, accentHex);
      break;
    case 'chart':
      body = renderChartEmbed(embed, inner, inheritedStyle, accentHex);
      break;
    case 'quantities':
      body = renderQuantitiesEmbed(embed, inner, inheritedStyle, accentHex);
      break;
    case 'compare':
      body = renderCompareEmbed(embed, inner, inheritedStyle, accentHex);
      break;
    case 'structure':
      body = renderStructureEmbed(embed, inner, inheritedStyle, accentHex);
      break;
    case 'causal-loop':
      body = renderCausalLoopEmbed(embed, inner, inheritedStyle, accentHex);
      break;
    case 'tree':
      body = renderTreeEmbed(embed, inner, inheritedStyle, accentHex);
      break;
    default:
      body = null;
  }
  // Subtle outline (the brief's "thing-within-a-thing" affordance) + optional
  // caption beneath the embed.
  const x0 = bounds.cx - bounds.w / 2;
  const y0 = bounds.cy - bounds.h / 2;
  const captionFs = Math.max(8, Math.min(12, bounds.w * 0.04));
  const captionText = (embed.caption ?? '').slice(0, 24);
  return (
    <g>
      <rect
        x={x0}
        y={y0}
        width={bounds.w}
        height={bounds.h}
        rx={6}
        fill="none"
        stroke={accentHex}
        strokeOpacity={0.3}
        strokeWidth={1.5}
      />
      {body}
      {captionText ? (
        <text
          x={bounds.cx}
          y={y0 + bounds.h - 4}
          textAnchor="middle"
          fontFamily={monoFamily}
          fontSize={captionFs}
          fill={ink.low}
        >
          {captionText}
        </text>
      ) : null}
    </g>
  );
};
