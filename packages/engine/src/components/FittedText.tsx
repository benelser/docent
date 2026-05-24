import React from 'react';

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
// `padding` is the *internal* margin the renderer reserves inside the slot.
// `maxWidth` should be the *content-box* width — the slot's width minus
// horizontal padding/border the parent already accounts for. The helper
// itself paints no border or background — it only sets typography and
// overflow control, so a caller composes it inside whatever surface they
// already render.

export type FittedTextMode = 'shrink-single' | 'shrink-wrap' | 'wrap';

export type FittedTextProps = {
  // The text to render.
  text: string;
  // The content-box width (px) the text must fit inside. The caller has
  // already subtracted padding/borders from the parent's geometry.
  maxWidth: number;
  // Base font size (px) the text uses when it fits.
  basePx: number;
  // Floor font size (px). The helper never shrinks below this — it switches
  // to ellipsis/wrap fallback instead. A readable minimum is 11-12px at
  // 1920-wide canvas, but a tag chip can floor lower if its surface is small.
  floorPx?: number;
  // Approx character advance as a fraction of font size. 0.55 for serif /
  // proportional; 0.6 for proportional with bold; 0.62 for monospaced.
  // The default 0.6 is the conservative value used throughout Card.tsx.
  charAdvance?: number;
  // The chosen strategy.
  mode?: FittedTextMode;
  // Maximum line count for `shrink-wrap` / `wrap`. Defaults to 2.
  maxLines?: number;
  // Line-height multiplier. Defaults to 1.25.
  lineHeight?: number;
  // Optional caller-supplied style — applied *after* the helper's own
  // computed style, so the caller can override colour, font-family,
  // letter-spacing, font-weight, text-decoration, etc. Anything that affects
  // *layout* (width, font-size, white-space, overflow, line-clamp,
  // text-overflow, line-height) is owned by the helper.
  style?: React.CSSProperties;
  // The element type to render. Defaults to `div`. Use `span` when the
  // helper sits inline beside other content (rare; most slots take a div).
  as?: 'div' | 'span';
  // Pass-through for React's `title` attribute — when a caller hovers a
  // truncated label, the browser shows the full text. Renders to mp4 don't
  // care about hover, but this keeps the helper useful in studio/preview.
  title?: string;
};

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

  // Strategy → layout style. The helper owns these declarations; everything
  // else is the caller's.
  const layoutStyle: React.CSSProperties = (() => {
    if (mode === 'shrink-single') {
      return {
        maxWidth,
        fontSize,
        lineHeight,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        // textOverflow uses the real U+2026 glyph the spec calls for.
        textOverflow: 'ellipsis',
      };
    }
    // shrink-wrap / wrap — bounded line count with multi-line ellipsis.
    return {
      maxWidth,
      fontSize,
      lineHeight,
      // -webkit-line-clamp is the multi-line ellipsis pattern (the
      // Chromium engine Remotion runs supports it). Below maxLines the
      // text wraps normally; past it the last line ellipses cleanly.
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical' as const,
      WebkitLineClamp: lines,
      overflow: 'hidden',
      // Honest word-wrap so a single very-long token doesn't blow past
      // the box. `break-word` only fires on words that exceed the box
      // width on their own; normal text wraps at whitespace as usual.
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
  // Keep room for the U+2026 glyph.
  const keep = Math.max(1, maxChars - 1);
  return text.slice(0, keep).trimEnd() + '…';
};
