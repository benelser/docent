import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {glow} from '../theme';
import type {ResolvedStyle} from '../style';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {
  activeBeatIndex,
  type Beat,
  type CausalEdge,
  type CausalLoop,
  type CausalVariable,
  type SceneProps,
} from '../engine/spec';
import {
  cadenceOffset,
  cadenceSpringConfig,
  paletteAccentKey,
  paletteGlowScale,
  paletteSceneHex,
} from '../engine/knobs';

// CausalLoopScene — the system-dynamics primitive.
//
// Variables sit as labelled discs arranged around a ring; directed edges
// between them carry a polarity glyph (+ or -) stating whether an increase
// in the source pushes the target UP (+) or DOWN (-). One or more closed
// `loops` overlay the diagram; each loop's centre label is R (reinforcing —
// even count of '-' edges, the cycle compounds) or B (balancing — odd count
// of '-' edges, the cycle self-corrects). The validator enforces the
// labelling math; this renderer reads the spec's `kind` and shows it.
//
// The argument the scene makes IS the cycle. Reveal beats animate variables
// → edges → the loop label, so the viewer sees the loop close before the
// glyph that names what it does. A causal loop is fundamentally STATIC: the
// edges argue *what causes what*, not data flowing through them. There are
// no pulses; the polarity glyph carries the assertion.

// ----- ring layout ---------------------------------------------------------

// The stage where the loop lives — a centred circle inside the standard
// stage band. The radius is set so 3 variables (the minimum) sit comfortably
// apart and 8 (the maximum) don't crowd.
const RING = {cx: 960, cy: 612, r: 230};
const NODE_R = 86;   // variable disc radius
const ARROW_GAP = 14; // pixels between the arrow tip and the node edge

// The angle (radians) at which variable `i` of `n` sits on the ring. The
// first variable sits at the top (−π/2), then proceeds clockwise.
const angleOf = (i: number, n: number): number =>
  -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);

const nodeCenter = (i: number, n: number): {x: number; y: number} => {
  const a = angleOf(i, n);
  return {x: RING.cx + RING.r * Math.cos(a), y: RING.cy + RING.r * Math.sin(a)};
};

// The point on the unit circle from `from` → `to`, offset inward by ARROW_GAP
// from each disc's edge. Used so the arrow tip kisses the disc without
// burying into it.
const edgePoints = (
  from: {x: number; y: number},
  to: {x: number; y: number},
): {start: {x: number; y: number}; end: {x: number; y: number}} => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const off = NODE_R + ARROW_GAP;
  return {
    start: {x: from.x + ux * off, y: from.y + uy * off},
    end: {x: to.x - ux * off, y: to.y - uy * off},
  };
};

// A curved path between two ring nodes — bulges outward away from the ring
// centre so the cycle reads as going around. `bulge` controls how far the
// curve pushes; 60 reads as a gentle arc on a ring of radius 230.
const arcPath = (
  start: {x: number; y: number},
  end: {x: number; y: number},
  bulge = 60,
): {d: string; mid: {x: number; y: number}} => {
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  // Outward normal — away from RING.cx, RING.cy. The arc bows outward.
  const ox = mx - RING.cx;
  const oy = my - RING.cy;
  const olen = Math.hypot(ox, oy) || 1;
  const cx = mx + (ox / olen) * bulge;
  const cy = my + (oy / olen) * bulge;
  return {d: `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`, mid: {x: cx, y: cy}};
};

export const CausalLoopScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const {bg, ink, accent: accentTokens} = style.tokens;
  const accentOf = (k?: string): string =>
    (k && ((accentTokens as unknown) as Record<string, string>)[k]) || accentTokens.blue;
  const accentHex = paletteSceneHex(scene.palette, scene.accent);
  const variables: CausalVariable[] = scene.variables ?? [];
  const edges: CausalEdge[] = scene.causalEdges ?? [];
  const loops: CausalLoop[] = scene.loops ?? [];
  const n = variables.length;

  // Variable id → index on the ring (and so its (x,y) centre).
  const varIndex: Record<string, number> = {};
  variables.forEach((v, i) => {
    varIndex[v.id] = i;
  });
  const centerOf = (id: string): {x: number; y: number} =>
    nodeCenter(varIndex[id] ?? 0, n);

  // ----- reveal frames — variables / edges / loops are all named ids -------
  // A beat's `reveal` is the *set* of ids it brings on screen at its start
  // frame (with cadence stagger applied per item). Loop ids land alongside
  // variable / edge ids; the renderer reads which loops are live at the
  // current frame and draws their centre R/B label then.
  const revealFrame: Record<string, number> = {};
  const revealCadence: Record<string, Beat['cadence']> = {};
  ts.beats.forEach((b) => {
    if (Array.isArray(b.reveal)) {
      b.reveal.forEach((id, order) => {
        if (revealFrame[id] === undefined) {
          revealFrame[id] = b.from + cadenceOffset(b.cadence, order);
          revealCadence[id] = b.cadence;
        }
      });
    }
  });
  const cadenceOf = (id: string): Beat['cadence'] => revealCadence[id];

  const active = activeBeatIndex(ts.beats, frame);
  const focusIds = new Set(ts.beats[active]?.focus ?? []);
  const hasFocus = focusIds.size > 0;

  // ----- variable accent — palette-spread over the ring ---------------------
  // Without a palette every variable resolves the scene's accent; with one,
  // they spread across the family in declared order — same shape as
  // StructureScene's nodes. Authors who pin a single accent get a unified
  // ring; signal/cool/warm spreads spread it.
  const variableHex = (i: number): string =>
    accentOf(paletteAccentKey(scene.palette, scene.accent, undefined, i));

  // A variable's eased 0..1 entrance progress. Mirrors Card's appear logic.
  // An id that no beat has revealed yet sits at 0 — invisible.
  const variableAppear = (id: string): number => {
    if (!(id in revealFrame)) return 0;
    const enter = revealFrame[id];
    const local = frame - enter;
    if (local <= 0) return 0;
    return spring({frame: local, fps, config: cadenceSpringConfig(cadenceOf(id))});
  };

  // An edge / loop's draw-on progress — same shape as Connector's `draw`.
  const drawProgress = (id: string): number => {
    if (!(id in revealFrame)) return 0;
    const enter = revealFrame[id];
    const local = frame - enter;
    if (local <= 0) return 0;
    const mass = cadenceOf(id) === 'snap' ? 0.32 : 0.5;
    return spring({frame: local, fps, config: {damping: 200, mass}});
  };

  // A flag for "this id has been revealed by some beat at or before the
  // current frame" — used to gate render. An id never appearing in any
  // reveal is treated as never visible.
  const isVisible = (id: string): boolean =>
    id in revealFrame && frame >= revealFrame[id];

  return (
    <SceneFrame
      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      glowScale={paletteGlowScale(scene.palette)}
    >
      <AbsoluteFill>
        <svg
          style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
          viewBox="0 0 1920 1080"
        >
          {/* ----- edges — drawn first so they sit behind the variable discs */}
          {edges.map((e) => {
            if (!isVisible(e.id)) return null;
            const from = centerOf(e.from);
            const to = centerOf(e.to);
            if (!from || !to) return null;
            const {start, end} = edgePoints(from, to);
            const {d, mid} = arcPath(start, end, 60);
            const draw = drawProgress(e.id);
            const fromFocus = hasFocus && focusIds.has(e.id);
            const dim = hasFocus && !fromFocus && !focusIds.has(e.from) && !focusIds.has(e.to);
            const opacity = dim ? 0.32 : 1;

            // The arrow's angle at the tip — read off the tangent of the
            // quadratic curve at t=1, i.e. the chord from the control point
            // (mid) to the end.
            const angle = (Math.atan2(end.y - mid.y, end.x - mid.x) * 180) / Math.PI;
            const headOpacity = Math.max(0, (draw - 0.6) / 0.4) * opacity;
            const isPositive = e.polarity === '+';
            // Polarity glyph anchored at the curve's control point — pushed
            // slightly further outward so it sits clear of the line itself.
            const ox = mid.x - RING.cx;
            const oy = mid.y - RING.cy;
            const olen = Math.hypot(ox, oy) || 1;
            const glyphX = mid.x + (ox / olen) * 18;
            const glyphY = mid.y + (oy / olen) * 18;

            return (
              <g key={e.id} opacity={opacity}>
                {/* the wire — draws itself on */}
                <path
                  d={d}
                  fill="none"
                  stroke={accentHex}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={`${draw} 1`}
                  opacity={0.85}
                  style={{filter: `drop-shadow(0 0 6px ${glow(accentHex, 0.45)})`}}
                />
                {/* arrowhead */}
                <g transform={`translate(${end.x} ${end.y}) rotate(${angle})`} opacity={headOpacity}>
                  <path d="M 3 0 L -16 -8 L -16 8 Z" fill={accentHex} />
                </g>
                {/* polarity glyph — the line's *assertion*. + = same
                    direction, − = opposite direction. A small disc gives the
                    glyph a background that reads cleanly over a busy ring. */}
                <g opacity={draw}>
                  <circle
                    cx={glyphX}
                    cy={glyphY}
                    r={15}
                    fill={bg.base}
                    stroke={isPositive ? accentHex : '#ff7d97'}
                    strokeWidth={1.8}
                  />
                  <text
                    x={glyphX}
                    y={glyphY + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily={monoFamily}
                    fontSize={22}
                    fontWeight={700}
                    fill={isPositive ? accentHex : '#ff7d97'}
                  >
                    {isPositive ? '+' : '−'}
                  </text>
                </g>
                {/* optional one-liner — placed below the glyph */}
                {e.label ? (
                  <text
                    x={glyphX}
                    y={glyphY + 36}
                    textAnchor="middle"
                    fontFamily={monoFamily}
                    fontSize={14}
                    letterSpacing={0.2}
                    fill={ink.mid}
                    opacity={draw}
                    stroke={bg.base}
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {e.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* ----- loop centre labels — R (reinforcing) / B (balancing) ----
              Each loop's centroid is the average of its variables' centres.
              The R / B glyph sits in that centroid, with a small curved
              indicator arrow under it (the "loop" arc) so the label reads as
              a *loop*, not as decoration. */}
          {loops.map((loop) => {
            if (!isVisible(loop.id)) return null;
            const pts = loop.path.map((id) => centerOf(id)).filter(Boolean);
            if (pts.length < 2) return null;
            const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
            const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
            const draw = drawProgress(loop.id);
            const isR = loop.kind === 'reinforcing';
            const label = isR ? 'R' : 'B';
            const labelHex = isR ? accentHex : '#ff7d97';
            const scale = interpolate(draw, [0, 1], [0.7, 1]);

            return (
              <g key={loop.id} opacity={draw}>
                {/* the loop arc — a small circular arrow at the centre,
                    spinning slowly to read as ongoing process */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={48 * scale}
                  fill="none"
                  stroke={labelHex}
                  strokeWidth={2}
                  strokeDasharray="6 6"
                  strokeDashoffset={-((frame * (isR ? 1.4 : -1.4)) % 24)}
                  opacity={0.6}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={30 * scale}
                  fill={bg.base}
                  stroke={labelHex}
                  strokeWidth={2.2}
                  opacity={0.95}
                  style={{filter: `drop-shadow(0 0 18px ${glow(labelHex, 0.6)})`}}
                />
                <text
                  x={cx}
                  y={cy + 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily={interFamily}
                  fontSize={32 * scale}
                  fontWeight={700}
                  fill={labelHex}
                >
                  {label}
                </text>
                {loop.label ? (
                  <text
                    x={cx}
                    y={cy + 64 * scale}
                    textAnchor="middle"
                    fontFamily={monoFamily}
                    fontSize={15}
                    letterSpacing={0.8}
                    fill={ink.mid}
                    stroke={bg.base}
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {loop.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {/* ----- variable discs — labelled circles arranged on the ring -----
            Drawn as DOM (not SVG) so the typography matches the rest of the
            engine (the Card body uses interFamily / monoFamily). A focused
            variable breathes; a dimmed one fades to background; an
            unrevealed one is hidden. */}
        {variables.map((v, i) => {
          const p = nodeCenter(i, n);
          const appear = variableAppear(v.id);
          if (appear <= 0) return null;
          const focused = focusIds.has(v.id);
          const dim = hasFocus && !focused;
          const opacity = appear * (dim ? 0.34 : 1);
          const scale = interpolate(appear, [0, 1], [0.86, 1]);
          const breathe = focused ? 0.5 + 0.5 * Math.sin((frame / fps) * 3.2) : 0;
          const hex = variableHex(i);

          return (
            <div
              key={v.id}
              style={{
                position: 'absolute',
                left: p.x - NODE_R,
                top: p.y - NODE_R,
                width: NODE_R * 2,
                height: NODE_R * 2,
                opacity,
                transform: `scale(${scale})`,
                borderRadius: '50%',
                background: `radial-gradient(120% 140% at 30% 30%, ${glow(hex, 0.16)} 0%, ${bg.panelHi} 50%, ${bg.panel} 100%)`,
                border: `2px solid ${focused ? hex : bg.line}`,
                boxShadow: focused
                  ? `0 0 0 1px ${glow(hex, 0.35)}, 0 0 ${28 + breathe * 18}px ${glow(hex, 0.65)}`
                  : `0 12px 36px -16px #000000cc`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: 10,
                gap: 4,
              }}
            >
              <div
                style={{
                  fontFamily: interFamily,
                  // Auto-shrink so the label always fits inside the disc.
                  fontSize:
                    v.label.length <= 8 ? 22
                    : v.label.length <= 14 ? 17
                    : v.label.length <= 20 ? 14
                    : 12,
                  fontWeight: 600,
                  color: ink.hi,
                  letterSpacing: -0.2,
                  lineHeight: 1.1,
                  maxWidth: NODE_R * 2 - 16,
                }}
              >
                {v.label}
              </div>
              {v.sub ? (
                <div
                  style={{
                    fontFamily: monoFamily,
                    fontSize: 11,
                    color: focused ? ink.mid : ink.low,
                    letterSpacing: 0.2,
                    lineHeight: 1.15,
                    maxWidth: NODE_R * 2 - 16,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 2,
                  }}
                >
                  {v.sub}
                </div>
              ) : null}
            </div>
          );
        })}
      </AbsoluteFill>

      <Narration beats={ts.beats} />
    </SceneFrame>
  );
};
