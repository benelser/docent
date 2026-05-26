// OhlcSceneComponent — a finance-vertical scene.
//
// The classic candlestick chart: each bar is a wick (low ↔ high) crossed
// by a body (open ↔ close). Standard convention: green up (close ≥ open),
// red down (close < open). Volume, when present, is a small bar under the
// price body.
//
// This component is intentionally simple — the demonstration is "a vertical
// can ship a domain-specific renderer through the kit's protocol", not "we
// re-implement TradingView." A clean axis, a labelled set of bars, an
// optional volume strip. The narration carries the argument.

import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

import type {SceneRenderProps} from '@docent/kit';

import type {OhlcSceneSpec, OhlcBar} from './schema';

const COLOR = {
  bg: '#06080d',
  panel: '#0d1118',
  ink: '#e8eef7',
  inkMid: '#8a96ad',
  inkLow: '#4f5a72',
  axis: '#2a3142',
  up: '#22c55e', // green up
  down: '#ef4444', // red down
  volume: '#6b7488',
};

interface PlotRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Plot one OHLC bar inside the plot rect. */
const renderBar = (
  bar: OhlcBar,
  i: number,
  bars: ReadonlyArray<OhlcBar>,
  rect: PlotRect,
  yMin: number,
  yMax: number,
  volMax: number,
  showVolume: boolean,
  appear: number,
): React.ReactElement => {
  const colW = rect.w / bars.length;
  const cx = rect.x + colW * (i + 0.5);
  const bodyW = Math.max(6, Math.min(colW * 0.6, 32));
  const yScale = (v: number): number =>
    rect.y + rect.h - ((v - yMin) / (yMax - yMin)) * rect.h;

  const yHigh = yScale(bar.high);
  const yLow = yScale(bar.low);
  const yOpen = yScale(bar.open);
  const yClose = yScale(bar.close);

  const isUp = bar.close >= bar.open;
  const color = isUp ? COLOR.up : COLOR.down;

  // Staggered fade-in across bars — bar i appears at frame i * 4.
  const localAppear = Math.max(0, Math.min(1, appear - i * 0.04));

  const bodyTop = Math.min(yOpen, yClose);
  const bodyH = Math.max(2, Math.abs(yClose - yOpen));

  // Volume strip — small bar under the plot, ~12% of plot height.
  const volStripH = showVolume ? rect.h * 0.12 : 0;
  const volTop = rect.y + rect.h + 36;
  const volBarH =
    showVolume && bar.volume !== undefined && volMax > 0
      ? Math.max(2, (bar.volume / volMax) * volStripH)
      : 0;

  return (
    <g key={i} opacity={localAppear}>
      {/* wick */}
      <line
        x1={cx}
        x2={cx}
        y1={yLow}
        y2={yHigh}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* body */}
      <rect
        x={cx - bodyW / 2}
        y={bodyTop}
        width={bodyW}
        height={bodyH}
        fill={color}
        stroke={color}
        strokeWidth={1.5}
        rx={2}
      />
      {/* label */}
      {bar.label ? (
        <text
          x={cx}
          y={rect.y + rect.h + 20}
          textAnchor="middle"
          fill={COLOR.inkMid}
          fontSize={14}
          fontFamily="JetBrains Mono, ui-monospace, monospace"
        >
          {bar.label}
        </text>
      ) : null}
      {/* volume bar */}
      {showVolume && bar.volume !== undefined ? (
        <rect
          x={cx - bodyW / 2}
          y={volTop + volStripH - volBarH}
          width={bodyW}
          height={volBarH}
          fill={COLOR.volume}
          opacity={0.55}
        />
      ) : null}
    </g>
  );
};

export const OhlcSceneComponent: React.FC<
  SceneRenderProps<OhlcSceneSpec>
> = ({scene, common}) => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [0, 24], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const bars = scene.bars;
  if (!bars || bars.length === 0) {
    return <AbsoluteFill style={{background: COLOR.bg}} />;
  }

  // Plot bounds — leave room for title/subtitle on top and labels on bottom.
  const W = 1920;
  const H = 1080;
  const plotRect: PlotRect = {
    x: 160,
    y: 240,
    w: W - 320,
    h: H - 480,
  };

  // Y range with 5% padding so the highest/lowest don't kiss the frame.
  const allPrices = bars.flatMap((b) => [b.high, b.low]);
  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const pad = (rawMax - rawMin) * 0.05 || 1;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  const showVolume = bars.some((b) => typeof b.volume === 'number');
  const volMax = showVolume
    ? Math.max(...bars.map((b) => b.volume ?? 0))
    : 0;

  // 5 horizontal gridlines.
  const gridTicks = 5;
  const gridLines: React.ReactElement[] = [];
  for (let i = 0; i <= gridTicks; i++) {
    const v = yMin + ((yMax - yMin) * i) / gridTicks;
    const y = plotRect.y + plotRect.h - (i / gridTicks) * plotRect.h;
    gridLines.push(
      <g key={`grid-${i}`}>
        <line
          x1={plotRect.x}
          x2={plotRect.x + plotRect.w}
          y1={y}
          y2={y}
          stroke={COLOR.axis}
          strokeWidth={1}
          strokeDasharray="4 6"
          opacity={0.6}
        />
        <text
          x={plotRect.x - 12}
          y={y + 4}
          textAnchor="end"
          fill={COLOR.inkLow}
          fontSize={13}
          fontFamily="JetBrains Mono, ui-monospace, monospace"
        >
          {v.toFixed(2)}
        </text>
      </g>,
    );
  }

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
          {scene.title ?? 'Open · High · Low · Close'}
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

      {/* y-label */}
      {scene.yLabel ? (
        <div
          style={{
            position: 'absolute',
            top: plotRect.y + plotRect.h / 2,
            left: 32,
            color: COLOR.inkMid,
            fontSize: 14,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            transform: 'rotate(-90deg)',
            transformOrigin: 'left top',
            opacity: appear,
          }}
        >
          {scene.yLabel}
        </div>
      ) : null}

      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{position: 'absolute', inset: 0, opacity: appear}}
      >
        {/* gridlines */}
        {gridLines}
        {/* axis */}
        <line
          x1={plotRect.x}
          x2={plotRect.x + plotRect.w}
          y1={plotRect.y + plotRect.h}
          y2={plotRect.y + plotRect.h}
          stroke={COLOR.axis}
          strokeWidth={1.5}
        />
        {/* bars */}
        {bars.map((bar, i) =>
          renderBar(bar, i, bars, plotRect, yMin, yMax, volMax, showVolume, appear),
        )}
        {/* volume label */}
        {showVolume ? (
          <text
            x={plotRect.x}
            y={plotRect.y + plotRect.h + 36 - 8}
            fill={COLOR.inkLow}
            fontSize={12}
            fontFamily="JetBrains Mono, ui-monospace, monospace"
          >
            volume
          </text>
        ) : null}
      </svg>

      {/* legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 48,
          right: 64,
          display: 'flex',
          gap: 24,
          opacity: appear,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 14,
          color: COLOR.inkMid,
        }}
      >
        <span>
          <span style={{color: COLOR.up}}>▲</span> close ≥ open
        </span>
        <span>
          <span style={{color: COLOR.down}}>▼</span> close &lt; open
        </span>
        <span style={{color: COLOR.inkLow}}>
          scene {common.sceneIndex + 1} of {common.sceneCount}
        </span>
      </div>
    </AbsoluteFill>
  );
};
