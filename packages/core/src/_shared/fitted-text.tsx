// FittedText — the canonical "make this text fit its slot" primitive.
//
// Every scene renderer has the same problem: a slot of fixed width (a card,
// a cell, a label tag) and a string whose length is unknown until render.
// The naive default is wrong in two opposite directions: a fixed font size
// either lets long text overflow (uglier than truncation), or pre-emptively
// shrinks short text down to make the worst case fit (the common case looks
// timid). The right answer is *bound* the slot and let the helper decide:
// hold the base size while it fits, step down through tiers as text grows,
// and if even the floor would overflow, wrap to a bounded line count and
// (only as the very last fallback) ellipsis with a proper U+2026 character.
//
// This is the long-text-strategy chooser: one helper, three modes.
//
//   - `mode: 'shrink-single'` (default) — single-line. fontSize steps down
//     toward `floorPx`; if still too wide, `text-overflow: ellipsis` kicks
//     in. Suited to known-bounded slots: axis labels, metric values, node
//     labels, file paths in window chrome.
//
//   - `mode: 'shrink-wrap'` — up to `maxLines` (default 2). Each line gets
//     its share of `maxWidth`; if the *total* text is too long to fit at
//     base size across that many lines, fontSize steps down toward
//     `floorPx`; if the floor would still overflow, the trailing line
//     ellipses via `-webkit-line-clamp`. Suited to prose-shaped slots:
//     taglines, narration notes, bullet points, ledger sub-lines.
//
//   - `mode: 'wrap'` — no shrink, just controlled line wrap. The text uses
//     `maxLines` of room at the base size, with the trailing-line ellipsis
//     for any overflow past that. Use when the slot has been sized
//     generously (a passage panel, a recap point); the eye wants a steady
//     visual cadence at one fontSize.
//
// MIRROR of `packages/engine/src/components/FittedText.tsx`. The two
// numerical helpers below (`fitFontSize`, `truncateForSlot`) are for SVG
// `<text>` callers — SVG can't host `-webkit-line-clamp`, so the best
// strategy there is single-line shrink-or-truncate.

import React from 'react';

export type FittedTextMode = 'shrink-single' | 'shrink-wrap' | 'wrap';

export interface FittedTextProps {
  text: string;
  maxWidth: number;
  basePx: number;
  floorPx?: number;
  charAdvance?: number;
  mode?: FittedTextMode;
  maxLines?: number;
  lineHeight?: number;
  style?: React.CSSProperties;
  as?: 'div' | 'span';
  title?: string;
}

// The font size that fits `text` on `lines` lines inside `maxWidth` at
// `charAdvance` per character. Steps down geometrically rather than per-tier
// so the result is smooth across the input length distribution. Floored at
// `floorPx`.
const fitFont = (
  text: string,
  basePx: number,
  floorPx: number,
  maxWidth: number,
  charAdvance: number,
  lines: number,
): number => {
  const len = Math.max(1, text.length);
  const budget = maxWidth * lines;
  const baseWidth = len * basePx * charAdvance;
  if (baseWidth <= budget) return basePx;
  const fit = budget / (len * charAdvance);
  return Math.max(floorPx, Math.min(basePx, fit));
};

export const FittedText: React.FC<FittedTextProps> = ({
  text,
  maxWidth,
  basePx,
  floorPx,
  charAdvance,
  mode = 'shrink-single',
  maxLines = 2,
  lineHeight = 1.25,
  style,
  as = 'div',
  title,
}) => {
  const floor = floorPx ?? Math.max(11, Math.min(basePx - 1, 12));
  const advance = charAdvance ?? 0.6;
  const lines = mode === 'shrink-single' ? 1 : Math.max(1, maxLines);
  const fontSize =
    mode === 'wrap'
      ? basePx
      : fitFont(text, basePx, floor, maxWidth, advance, lines);

  const layoutStyle: React.CSSProperties = (() => {
    if (mode === 'shrink-single') {
      return {
        maxWidth,
        fontSize,
        lineHeight,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      };
    }
    return {
      maxWidth,
      fontSize,
      lineHeight,
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical' as const,
      WebkitLineClamp: lines,
      overflow: 'hidden',
      overflowWrap: 'break-word',
      wordBreak: 'normal',
    };
  })();

  const merged: React.CSSProperties = {...layoutStyle, ...style};
  const props: React.HTMLAttributes<HTMLElement> = {
    style: merged,
    title: title ?? (text.length > 60 ? text : undefined),
  };
  if (as === 'span') return <span {...props}>{text}</span>;
  return <div {...props}>{text}</div>;
};

// fitFontSize — the bare-numerical version of fitFont, for callers that
// render `<text>` (SVG) and need to compute a font size without wrapping
// the element in a React component. Same semantics as FittedText's
// internal shrink. Use when you have an SVG `<text>` (axis labels, chart
// ticks, connector labels) — SVG can't host -webkit-line-clamp, so the
// best strategy for it is single-line shrink-or-truncate.
export const fitFontSize = (
  text: string,
  opts: {
    maxWidth: number;
    basePx: number;
    floorPx?: number;
    charAdvance?: number;
    lines?: number;
  },
): number => {
  const floor = opts.floorPx ?? Math.max(11, Math.min(opts.basePx - 1, 12));
  const advance = opts.charAdvance ?? 0.6;
  const lines = opts.lines ?? 1;
  return fitFont(text, opts.basePx, floor, opts.maxWidth, advance, lines);
};

// truncateForSlot — single-line shrink-then-ellipsis applied to a *string*
// at a known font size. Returns the same text untouched if it fits, else a
// string with a trailing U+2026 ellipsis (the real character, not "..."),
// cropped to fit. Use for SVG `<text>` where the layout can't carry a CSS
// ellipsis and font-size has already been fixed by the design.
export const truncateForSlot = (
  text: string,
  opts: {
    maxWidth: number;
    fontSize: number;
    charAdvance?: number;
  },
): string => {
  const advance = opts.charAdvance ?? 0.6;
  const charW = opts.fontSize * advance;
  if (charW <= 0) return text;
  const maxChars = Math.floor(opts.maxWidth / charW);
  if (text.length <= maxChars) return text;
  // Prefer a word boundary — slice back to the last space (or hyphen) inside
  // the budget so we never chop mid-word. Falls back to char-truncation only
  // when there's no boundary inside ~half of the budget.
  const keepRaw = Math.max(1, maxChars - 1);
  const candidate = text.slice(0, keepRaw);
  const boundary = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('-'));
  if (boundary > Math.floor(keepRaw * 0.5)) {
    return candidate.slice(0, boundary).trimEnd() + '…';
  }
  // Keep room for the U+2026 glyph.
  const keep = Math.max(1, maxChars - 1);
  return text.slice(0, keep).trimEnd() + '…';
};
