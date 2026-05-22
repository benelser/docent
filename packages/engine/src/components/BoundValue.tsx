import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {tweenValue, type Metric, type TimedBeat} from '../engine/spec';

// The projection of a tweened value at the current frame. The count-up is NOT
// a CSS animation — it is a pure function of `frame`: `tweenValue` resolves the
// eased value, and this renders its formatted text. docent renders frames in
// parallel, so a frame-exact, deterministic read is mandatory.

// Format the raw resolved number per the metric's `format`.
export const formatValue = (v: number, format?: Metric['format']): string => {
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

// Renders the formatted, frame-exact projection of a named tweened value.
export const BoundValue: React.FC<{
  beats: TimedBeat[];
  bind: string;
  format?: Metric['format'];
  style?: React.CSSProperties;
}> = ({beats, bind, format, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = tweenValue(beats, bind, frame, fps);
  return <span style={style}>{formatValue(v, format)}</span>;
};
