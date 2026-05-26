// CandlestickSceneComponent — the close-read of one bar.
//
// One big candlestick centred in the frame, with labeled levels (open, high,
// low, close) annotated on the right. Optional pattern name + note rendered
// below the title.
//
// The narration carries the close-read; the renderer's only job is to make
// the wick, the body, and the four price levels legible at a glance.

import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

import type {SceneRenderProps} from '@docent/kit';

import type {CandlestickSceneSpec} from './schema';

const COLOR = {
  bg: '#06080d',
  ink: '#e8eef7',
  inkMid: '#8a96ad',
  inkLow: '#4f5a72',
  axis: '#2a3142',
  up: '#22c55e',
  down: '#ef4444',
  annotate: '#fbbf24',
};

export const CandlestickSceneComponent: React.FC<
  SceneRenderProps<CandlestickSceneSpec>
> = ({scene, common}) => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const bar = scene.bar;
  const isUp = bar.close >= bar.open;
  const color = isUp ? COLOR.up : COLOR.down;

  // Plot bounds — a single big candle in the middle of the frame.
  const W = 1920;
  const H = 1080;
  const cx = W / 2;
  const plotTop = 260;
  const plotBottom = H - 160;
  const plotH = plotBottom - plotTop;

  const range = bar.high - bar.low;
  const pad = range * 0.1 || 1;
  const yMin = bar.low - pad;
  const yMax = bar.high + pad;

  const yScale = (v: number): number =>
    plotTop + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const yHigh = yScale(bar.high);
  const yLow = yScale(bar.low);
  const yOpen = yScale(bar.open);
  const yClose = yScale(bar.close);
  const bodyW = 200;
  const bodyTop = Math.min(yOpen, yClose);
  const bodyH = Math.max(4, Math.abs(yClose - yOpen));

  // Animated wick: draw from middle outward.
  const wickDraw = Math.max(0, Math.min(1, (appear - 0.15) / 0.35));
  const yMidWick = (yHigh + yLow) / 2;
  const wickStart = yMidWick - (yMidWick - yHigh) * wickDraw;
  const wickEnd = yMidWick + (yLow - yMidWick) * wickDraw;

  // Body grows from the open price baseline.
  const bodyGrow = Math.max(0, Math.min(1, (appear - 0.4) / 0.4));

  return (
    <AbsoluteFill
      style={{
        background: COLOR.bg,
        color: COLOR.ink,
        fontFamily:
          common.style.tokens.typography.family.sans ??
          'Inter, system-ui, sans-serif',
      }}
    >
      {/* header */}
      <div
        style={{
          position: 'absolute',
          top: 64,
          left: 160,
          right: 160,
          opacity: appear,
        }}
      >
        {scene.kicker ? (
          <div
            style={{
              color: COLOR.inkMid,
              letterSpacing: 3,
              fontSize: 18,
              marginBottom: 12,
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            }}
          >
            {scene.kicker}
          </div>
        ) : null}
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: COLOR.ink,
            lineHeight: 1.1,
          }}
        >
          {scene.title ?? bar.label ?? 'One bar, close-read'}
        </div>
        {scene.subtitle ? (
          <div
            style={{
              fontSize: 22,
              color: COLOR.inkMid,
              marginTop: 12,
              maxWidth: 1400,
            }}
          >
            {scene.subtitle}
          </div>
        ) : null}
      </div>

      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{position: 'absolute', inset: 0}}
      >
        {/* wick */}
        <line
          x1={cx}
          x2={cx}
          y1={wickStart}
          y2={wickEnd}
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
        />
        {/* body — grows from the open price */}
        <rect
          x={cx - bodyW / 2}
          y={isUp ? yOpen - (yOpen - bodyTop) * bodyGrow : bodyTop}
          width={bodyW}
          height={bodyH * bodyGrow}
          fill={color}
          stroke={color}
          strokeWidth={2}
          rx={4}
        />

        {/* level annotations — right side */}
        {[
          {label: 'high', v: bar.high, y: yHigh, color: COLOR.inkMid},
          {label: 'open', v: bar.open, y: yOpen, color: COLOR.ink},
          {label: 'close', v: bar.close, y: yClose, color},
          {label: 'low', v: bar.low, y: yLow, color: COLOR.inkMid},
        ].map((row, i) => (
          <g key={i} opacity={appear}>
            <line
              x1={cx + bodyW / 2 + 24}
              x2={cx + bodyW / 2 + 60}
              y1={row.y}
              y2={row.y}
              stroke={row.color}
              strokeWidth={1.5}
              strokeDasharray="2 4"
            />
            <text
              x={cx + bodyW / 2 + 72}
              y={row.y + 6}
              fill={row.color}
              fontSize={20}
              fontFamily="JetBrains Mono, ui-monospace, monospace"
            >
              {row.label} · {row.v.toFixed(2)}
            </text>
          </g>
        ))}

        {/* label below body */}
        {bar.label ? (
          <text
            x={cx}
            y={plotBottom + 32}
            textAnchor="middle"
            fill={COLOR.inkMid}
            fontSize={18}
            fontFamily="JetBrains Mono, ui-monospace, monospace"
            opacity={appear}
          >
            {bar.label}
          </text>
        ) : null}
      </svg>

      {/* pattern annotation */}
      {scene.pattern ? (
        <div
          style={{
            position: 'absolute',
            top: plotTop - 8,
            left: 96,
            opacity: appear,
            maxWidth: 480,
          }}
        >
          <div
            style={{
              color: COLOR.annotate,
              fontSize: 14,
              letterSpacing: 2,
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              marginBottom: 6,
            }}
          >
            PATTERN
          </div>
          <div
            style={{
              color: COLOR.ink,
              fontSize: 30,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            {scene.pattern}
          </div>
          {scene.patternNote ? (
            <div
              style={{
                color: COLOR.inkMid,
                fontSize: 16,
                lineHeight: 1.45,
              }}
            >
              {scene.patternNote}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          bottom: 48,
          right: 64,
          color: COLOR.inkLow,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 14,
          opacity: appear,
        }}
      >
        scene {common.sceneIndex + 1} of {common.sceneCount}
      </div>
    </AbsoluteFill>
  );
};
