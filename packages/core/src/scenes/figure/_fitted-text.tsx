// Local FittedText — single-line / wrap text fitter.
//
// MIRROR of packages/engine/src/components/FittedText.tsx (the
// FittedText component only; the SVG helpers fitFontSize and
// truncateForSlot are not used by the figure scene and are omitted). At
// integration, the integrator replaces this file with an import from the
// shared infra location.

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
