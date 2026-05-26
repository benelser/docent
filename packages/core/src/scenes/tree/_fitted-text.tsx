// Local FittedText — single-line / wrap text fitter.
//
// MIRROR of packages/engine/src/components/FittedText.tsx. The tree
// component uses the FittedText React component (for the kicker/heading
// in SceneFrame) and the bare-numerical helpers `fitFontSize` /
// `truncateForSlot` (for SVG `<text>` inside the embedded scene
// renderer). At integration, the integrator replaces this file with a
// shared import.

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

// ----- SVG helpers ---------------------------------------------------------
// fitFontSize — bare-numerical version of fitFont, for callers that render
// `<text>` (SVG) and need to compute a font size without wrapping the
// element in a React component.

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

// truncateForSlot — single-line shrink-then-ellipsis applied to a string
// at a known font size. Returns the same text untouched if it fits, else
// a string with a trailing U+2026 ellipsis (the real character, not
// "..."), cropped to fit. Used for SVG `<text>` where the layout can't
// carry a CSS ellipsis and font-size has already been fixed by the design.
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
  const keepRaw = Math.max(1, maxChars - 1);
  const candidate = text.slice(0, keepRaw);
  const boundary = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('-'));
  if (boundary > Math.floor(keepRaw * 0.5)) {
    return candidate.slice(0, boundary).trimEnd() + '…';
  }
  const keep = Math.max(1, maxChars - 1);
  return text.slice(0, keep).trimEnd() + '…';
};
