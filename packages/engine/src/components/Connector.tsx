import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {evolvePath} from '@remotion/paths';
import {glow} from '../theme';
import {monoFamily} from '../fonts';
import type {Beat} from '../engine/spec';
import {connectorPath, curvedPath, type Box} from '../engine/layout';
import type {ResolvedStyle} from '../style';
import {fitFontSize, truncateForSlot} from './FittedText';

export type EdgeState = 'hidden' | 'normal' | 'dim' | 'focus';

// An edge between two cards. It is not a static line: once drawn, it carries a
// continuous stream of flowing dashes — the wire shows data moving through it.
//
// `kind` types what the edge *asserts*. `relation` (default) and `feedback`
// are unchanged. `entails` reads as a logical "therefore" — a doubled wire
// with a ∴ glyph at its midpoint, drawing necessity rather than mere flow.
// `causes` is a causal claim; its `strength` sets the line's heft — a
// `necessary` cause is visibly heavier than a `contributing` one.
//
// `cadence` (a beat knob) shapes the draw-on: `snap` lowers the spring mass
// for a sharper sweep; every other cadence keeps the original
// {damping: 200, mass: 0.5} — so a knob-free edge is unchanged. The cascade
// *stagger* is applied by the caller via `enterFrame`.
export const Connector: React.FC<{
  from: Box;
  to: Box;
  accentHex: string;
  state: EdgeState;
  enterFrame: number;
  kind?: 'relation' | 'feedback' | 'entails' | 'causes';
  strength?: 'necessary' | 'contributing';
  label?: string;
  cadence?: Beat['cadence'];
  style: ResolvedStyle;
}> = ({from, to, accentHex, state, enterFrame, kind, strength, label, cadence, style}) => {
  // `style` is reserved for future token use (stroke widths, accent lookups).
  // Today Connector only consumes accentHex + glow; the prop threads the
  // resolved style through the chrome layer so M2/M3 can adopt it without
  // a second signature change.
  void style;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - enterFrame;
  const drawMass = cadence === 'snap' ? 0.32 : 0.5;
  const draw =
    local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass: drawMass}});

  if (state === 'hidden') return null;

  const feedback = kind === 'feedback';
  const entails = kind === 'entails';
  const causes = kind === 'causes';
  // A `necessary` cause is drawn heavy; a `contributing` one stays at the
  // default weight. An `entails` edge always reads at the heavier weight —
  // logical necessity is not a hedge.
  const heavy = entails || (causes && strength === 'necessary');
  // Two path shapes: a straight connector has `.start`, a curved feedback edge
  // has `.mid`. Branch on `feedback` so each side keeps its concrete type
  // (rather than a union where neither member is statically known).
  const curved = feedback ? curvedPath(from, to) : null;
  const straight = feedback ? null : connectorPath(from, to);
  const path = curved ?? straight!;
  const evolve = evolvePath(draw, path.d);
  const dim = state === 'dim';
  const focus = state === 'focus';
  const opacity = dim ? 0.26 : 1;

  // flowing dashes — fade in once the wire is mostly drawn
  const flowIn = interpolate(local, [12, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const speed = focus ? 2.6 : 1.6;
  const flowOffset = -((frame * speed) % 26);
  const flowOpacity = flowIn * opacity * (focus ? 1 : dim ? 0.4 : 0.7);

  // arrowhead direction — its anchor is the curve's control point on a
  // feedback edge, or the connector's start on a straight one.
  const ref = curved ? curved.mid : straight!.start;
  const end = path.end;
  // label anchor — the curve's control point, or the straight chord's midpoint.
  const mid = curved
    ? curved.mid
    : {x: (straight!.start.x + end.x) / 2, y: (straight!.start.y + end.y) / 2};
  const angle = (Math.atan2(end.y - ref.y, end.x - ref.x) * 180) / Math.PI;
  const headOpacity = Math.max(0, (draw - 0.6) / 0.4) * opacity;

  // ----- entailment / causation rendering --------------------------------
  // An `entails` or `causes` edge is a logical/causal claim, not a data wire:
  // it carries no flowing dashes. Instead the line itself reads its meaning.
  // `entails` is a doubled wire (the rail of a "therefore"); a `necessary`
  // claim is heavy, a `contributing` one light. The unit perpendicular to
  // the straight chord offsets the second rail.
  const logical = entails || causes;
  const railOffset = (() => {
    if (!entails || feedback) return {x: 0, y: 0};
    const s = straight!.start;
    const dx = end.x - s.x;
    const dy = end.y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    return {x: (-dy / len) * 3.2, y: (dx / len) * 3.2};
  })();
  // The base wire weight: a heavy claim (entails, or a necessary cause) is
  // visibly thicker; a contributing cause stays near the default.
  const wireWidth = heavy ? 4.6 : causes ? 3.0 : 2.4;

  return (
    <svg
      style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
      viewBox="0 0 1920 1080"
    >
      {/* base wire — draws itself on */}
      <path
        d={path.d}
        fill="none"
        stroke={accentHex}
        strokeWidth={feedback ? 2.2 : logical ? wireWidth : 2.4}
        strokeLinecap="round"
        strokeDasharray={feedback ? '9 9' : evolve.strokeDasharray}
        strokeDashoffset={feedback ? 0 : evolve.strokeDashoffset}
        opacity={
          feedback
            ? draw * 0.85 * opacity
            : logical
              ? draw * (heavy ? 0.92 : 0.6) * opacity
              : 0.3 * opacity
        }
      />
      {/* entails — the second rail of the "therefore", offset perpendicular */}
      {entails ? (
        <path
          d={`M ${straight!.start.x + railOffset.x} ${straight!.start.y + railOffset.y} L ${end.x + railOffset.x} ${end.y + railOffset.y}`}
          fill="none"
          stroke={accentHex}
          strokeWidth={wireWidth}
          strokeLinecap="round"
          strokeDasharray={evolve.strokeDasharray}
          strokeDashoffset={evolve.strokeDashoffset}
          opacity={draw * 0.92 * opacity}
        />
      ) : null}
      {/* flowing data — only data wires flow; a logical/causal claim does not */}
      {feedback || logical ? null : (
        <path
          d={path.d}
          fill="none"
          stroke={accentHex}
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeDasharray="13 13"
          strokeDashoffset={flowOffset}
          opacity={flowOpacity}
          style={{filter: `drop-shadow(0 0 5px ${glow(accentHex, 0.6)})`}}
        />
      )}
      {/* arrowhead — heavier for an entailment / necessary cause */}
      <g transform={`translate(${end.x} ${end.y}) rotate(${angle})`} opacity={headOpacity}>
        <path
          d={heavy ? 'M 5 0 L -22 -11 L -22 11 Z' : 'M 3 0 L -16 -8 L -16 8 Z'}
          fill={accentHex}
          style={{filter: `drop-shadow(0 0 5px ${glow(accentHex, 0.65)})`}}
        />
      </g>
      {/* entails — the ∴ "therefore" glyph pinned at the chord midpoint */}
      {entails ? (
        <text
          x={mid.x}
          y={mid.y - 14}
          textAnchor="middle"
          fontFamily={monoFamily}
          fontSize={30}
          fontWeight={700}
          fill={accentHex}
          opacity={draw}
          style={{filter: `drop-shadow(0 0 6px ${glow(accentHex, 0.6)})`}}
        >
          ∴
        </text>
      ) : null}
      {label ? (() => {
        // Offset the label perpendicular to the line so it never sits inside a
        // card. On a straight edge, push it off the chord by 18px; on a curved
        // (feedback) edge, the control point is already off-axis, so just nudge
        // below it.
        let lx = mid.x;
        let ly = mid.y;
        if (curved) {
          ly = mid.y + 22;
        } else {
          const s = straight!.start;
          const dxL = end.x - s.x;
          const dyL = end.y - s.y;
          const lenL = Math.hypot(dxL, dyL) || 1;
          lx += (-dyL / lenL) * 18;
          ly += (dxL / lenL) * 18;
        }
        // The label gets up to ~60% of the chord length as a budget — past
        // that the edge label crowds the cards it connects. fitFontSize
        // steps the size down toward 11px; truncateForSlot ellipses if the
        // floor still can't hold the text on one line. SVG `<text>` can't
        // carry CSS line-clamp, so single-line shrink-then-ellipsis is the
        // right strategy here.
        const chord = Math.hypot(end.x - (straight?.start.x ?? mid.x), end.y - (straight?.start.y ?? mid.y));
        const maxW = Math.max(160, Math.min(520, chord * 0.6));
        const fs = fitFontSize(label, {maxWidth: maxW, basePx: 17, floorPx: 12, charAdvance: 0.6});
        const visible = truncateForSlot(label, {maxWidth: maxW, fontSize: fs, charAdvance: 0.6});
        // A subtle outer-stroke gives the label air against the card glow.
        return (
          <text
            x={lx}
            y={ly}
            textAnchor="middle"
            fontFamily={monoFamily}
            fontSize={fs}
            letterSpacing={0.3}
            fill={accentHex}
            opacity={draw}
            stroke="#0e1116"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {visible}
          </text>
        );
      })() : null}
    </svg>
  );
};
