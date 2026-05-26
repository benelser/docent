// Local EmbeddedScene — Sprint B compositional grammar tableau.
//
// MIRROR of the subset of packages/engine/src/scenes/EmbeddedScene.tsx
// the tree scene actually consumes. The tree allowlist for
// `tree.children[].embed` is `tree | compare | quantities`; the three
// renderers below carry the same pixel-for-pixel layout as the v2.5.x
// engine, just inlined here so the tree scene's worktree carries no
// dependency on packages/engine.
//
// An EmbeddedScene renders a STATIC visual tableau for one of the
// allowlisted embed types inside the host's allocated bounds. No
// animation, no audio, no beats: only the resting visual state. The host
// owns timing (when the embed appears, when it dims) via reveal/focus on
// the slot's id; this component owns the pixels.
//
// At integration, the integrator replaces this file with a shared
// import (the full EmbeddedScene with all 8 embed types) and this file
// goes away.

import React from 'react';
import type {ResolvedStyle} from '@docent/kit';

import {
  ACCENTS,
  fitFontSize,
  glow,
  paletteSceneHex,
  truncateForSlot,
} from '../../_shared';

export type EmbedBounds = {cx: number; cy: number; w: number; h: number};

// Embedded scene spec — the tree's children carry whatever an embed wants
// (the kit treats it as opaque); the per-type renderers narrow to the
// fields they read. We keep the shape permissive so we don't lock the
// embed schema in this file.
export interface EmbeddedSceneSpec {
  type?: string;
  caption?: string;
  // tree-embed fields:
  root?: {id: string; label: string; children?: ReadonlyArray<EmbeddedSceneSpec['root']>};
  // compare-embed fields:
  columns?: ReadonlyArray<{id: string; label: string}>;
  rows?: ReadonlyArray<{
    id: string;
    label: string;
    cells?: ReadonlyArray<{text?: string; verdict?: 'win' | 'lose' | undefined}>;
  }>;
  // quantities-embed fields:
  metrics?: ReadonlyArray<{id: string; label: string; unit?: string}>;
  figures?: ReadonlyArray<{id: string; label: string; value?: string | number; unit?: string}>;
  [k: string]: unknown;
}

type Props = {
  embed: EmbeddedSceneSpec;
  bounds: EmbedBounds;
  inheritedStyle: ResolvedStyle;
  // The parent scene's accent — the embed inherits it when the embed has
  // no explicit accent of its own.
  parentAccent: string;
};

const accentOf = (key: string | undefined, style: ResolvedStyle): string => {
  const map = style.tokens.accent as unknown as Record<string, string | undefined>;
  return (key && map[key]) || map.blue || ACCENTS.blue;
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
  const items: Array<{id: string; label: string; value: string; unit?: string}> =
    (embed.metrics ?? []).map((m) => ({
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
  type AnyNode = {id: string; label: string; children?: ReadonlyArray<AnyNode>};
  const walk = (n: AnyNode, depth: number, parent: string | null): void => {
    if (!levels[depth]) levels[depth] = [];
    const entry: Lvl = {id: n.id, label: n.label, depth, parent, xFrac: 0};
    levels[depth].push(entry);
    all.push(entry);
    if (Array.isArray(n.children)) n.children.forEach((c) => walk(c as AnyNode, depth + 1, n.id));
  };
  walk(root as AnyNode, 0, null);
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
          maxWidth: (bounds.w / Math.max(1, (levels[n.depth] || []).length)) * 0.85,
          basePx: Math.max(7, Math.min(11, bounds.w * 0.035)),
          floorPx: 6,
          charAdvance: 0.6,
        });
        const txt = truncateForSlot(n.label, {
          maxWidth: (bounds.w / Math.max(1, (levels[n.depth] || []).length)) * 0.85,
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
// Render any allowlisted embed type. The host scene passes its bounding
// box and the resolved style. The result is an SVG group meant to live
// inside the host's outer SVG (viewBox 0 0 1920 1080).

export const EmbeddedScene: React.FC<Props> = ({
  embed,
  bounds,
  inheritedStyle,
  parentAccent,
}) => {
  void accentOf; // exported for future per-embed accent overrides
  const accentHex =
    paletteSceneHex(undefined, undefined, inheritedStyle) || parentAccent;
  const monoFamily = inheritedStyle.tokens.typography.family.mono;
  const ink = inheritedStyle.tokens.ink;
  // Sized to half the embed dims (the parent's allocation), tuned for
  // ~ -1..0 padding inside the slot frame.
  const inner: EmbedBounds = {
    cx: bounds.cx,
    cy: bounds.cy - (embed.caption ? 8 : 0),
    w: bounds.w - 12,
    h: bounds.h - 16 - (embed.caption ? 16 : 0),
  };
  let body: React.ReactNode = null;
  switch (embed.type) {
    case 'quantities':
      body = renderQuantitiesEmbed(embed, inner, inheritedStyle, accentHex);
      break;
    case 'compare':
      body = renderCompareEmbed(embed, inner, inheritedStyle, accentHex);
      break;
    case 'tree':
      body = renderTreeEmbed(embed, inner, inheritedStyle, accentHex);
      break;
    default:
      // Other embed types are not allowlisted for tree children; the
      // validator rejects them at the engine level. Render nothing here
      // rather than throw so a half-written spec in studio degrades
      // gracefully.
      body = null;
  }
  // Subtle outline (the brief's "thing-within-a-thing" affordance) +
  // optional caption beneath the embed.
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
