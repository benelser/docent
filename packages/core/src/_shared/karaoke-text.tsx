// KaraokeText — R5's reference karaoke-style sub-component.
//
// Renders an array of words with a per-word color/opacity tween anchored on
// each word's `[startFrame, endFrame)`. Before its start frame, a word reads
// `dim`; during, it interpolates UP to `accent`; after, it holds `accent`.
//
// The component is intentionally MINIMAL — it does not handle multi-line
// layout, fitted-text shrinkage, or focus dimming. Higher-level scene
// components (passage, captions, …) compose KaraokeText with their own
// chrome. Browser-safe; uses Remotion's `useCurrentFrame` + `interpolate`.
//
// Friction notes:
//   - The `frame` the hook reads is SCENE-relative when this component is
//     mounted under a `<Sequence>` (every scene already is), but each
//     word's `startFrame` is CLIP-relative (0 == clip start). The caller
//     passes `clipStartFrame` so we can normalise.
//   - Multi-line wrap: when a word breaks mid-highlight, the consumer
//     should pre-render each word in its own inline-block so the browser
//     wraps at word boundaries instead of mid-word. KaraokeText already
//     does this.

import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

import type {WordTiming} from '@bjelser/kit';

export interface KaraokeTextProps {
  /** Frame-quantised words to render. */
  readonly words: ReadonlyArray<WordTiming>;
  /**
   * Frame offset to apply to each word's `startFrame/endFrame`. Use this
   * when the parent `<Sequence>` is anchored to a beat's `startFrame` and
   * the words are clip-relative — pass `beatStartFrame` here.
   */
  readonly clipStartFrame: number;
  /** The color a word reads before its window opens. */
  readonly dimColor: string;
  /** The color a word reads inside (and after) its window. */
  readonly accentColor: string;
  /** Optional inline style applied to the wrapping container. */
  readonly style?: React.CSSProperties;
  /**
   * Inner-text builder that wraps each word's `<span>`. Defaults to a
   * simple identity render. Use this slot to add per-word effects (a
   * scale-up on activation, a glow, etc.) — the default keeps the
   * footprint small.
   */
  readonly renderWord?: (
    word: WordTiming,
    color: string,
    opacity: number,
  ) => React.ReactNode;
  /**
   * Whether to render an underline beneath the active word. Off by
   * default; the passage scene already has its own highlight chrome and
   * doesn't want the extra rule.
   */
  readonly underlineActive?: boolean;
}

const defaultRenderWord = (
  word: WordTiming,
  color: string,
  opacity: number,
): React.ReactNode => (
  <span
    style={{
      color,
      opacity,
      transition: 'color 60ms linear',
    }}
  >
    {word.text}
  </span>
);

/**
 * Renders the words as inline-block spans separated by single spaces.
 * The wrapping is handled by the browser at the spaces between word spans —
 * no word is ever broken mid-character.
 */
export const KaraokeText: React.FC<KaraokeTextProps> = ({
  words,
  clipStartFrame,
  dimColor,
  accentColor,
  style,
  renderWord,
  underlineActive,
}) => {
  const frame = useCurrentFrame();
  const render = renderWord ?? defaultRenderWord;
  return (
    <span style={style}>
      {words.map((w, i) => {
        const start = w.startFrame + clipStartFrame;
        const end = w.endFrame + clipStartFrame;
        const opacity = interpolate(
          frame,
          [start - 2, start, end, end + 2],
          [0.55, 1, 1, 1],
          {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
        );
        const isActive = frame >= start && frame < end;
        const isPast = frame >= end;
        const color = isActive || isPast ? accentColor : dimColor;
        const node = render(w, color, opacity);
        return (
          <React.Fragment key={`${i}-${w.text}`}>
            <span
              style={{
                display: 'inline-block',
                whiteSpace: 'pre',
                ...(underlineActive && isActive
                  ? {borderBottom: `2px solid ${accentColor}`}
                  : {}),
              }}
            >
              {node}
            </span>
            {i < words.length - 1 ? ' ' : null}
          </React.Fragment>
        );
      })}
    </span>
  );
};
