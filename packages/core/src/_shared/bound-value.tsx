// BoundValue — frame-exact projection of a tweened value, rendered as text.
//
// MIRROR of `packages/engine/src/components/BoundValue.tsx`, adapted to read
// over the kit's `BeatTimelineSlot[]` rather than the engine's `TimedBeat[]`.
//
// The count-up is NOT a CSS animation — it is a pure function of `frame`:
// `tweenValue` resolves the eased value, and this renders its formatted
// text. docent renders frames in parallel, so a frame-exact, deterministic
// read is mandatory.

import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {BeatTimelineSlot} from '@docent/kit';

import {tweenValue, type MetricFormat} from './helpers';

/**
 * Format the raw resolved number per the metric's `format`:
 *   `int`     (default) — `Math.round(v)`
 *   `float1`  — one decimal place
 *   `percent` — `Math.round(v)` followed by `%`
 */
export const formatValue = (v: number, format?: MetricFormat): string => {
  switch (format) {
    case 'float1':
      return v.toFixed(1);
    case 'percent':
      return `${Math.round(v)}%`;
    case 'int':
    default:
      return String(Math.round(v));
  }
};

/**
 * Render the formatted, frame-exact projection of a named tweened value
 * driven by `set` directives on the surrounding scene's beats.
 */
export const BoundValue: React.FC<{
  beats: ReadonlyArray<BeatTimelineSlot>;
  bind: string;
  format?: MetricFormat | undefined;
  style?: React.CSSProperties | undefined;
}> = ({beats, bind, format, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = tweenValue(beats, bind, frame, fps);
  return <span style={style}>{formatValue(v, format)}</span>;
};
