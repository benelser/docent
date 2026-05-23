import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {accent, theme, glow} from '../theme';
import {interFamily, monoFamily, handFamily} from '../fonts';
import {Narration} from '../components/Narration';
import {nodeBox, edgePoint, type Box} from '../engine/layout';
import {resolveCamera} from '../engine/camera';
import {roughRect, roughLine, roughEllipse, roughCrossOut, pathLen} from '../components/rough';
import {activeBeatIndex, type SceneProps, type Node} from '../engine/spec';

// The chalkboard. Where the crisp scenes show the system as built, the sketch
// scene shows the *thinking* — trade-offs, the alternative not taken, the
// failure mode, the verdict. Hand-drawn (roughjs, the engine behind Excalidraw),
// handwriting type, on a dark slate board.
//
// `treatment` chooses the palette: the original dark chalkboard (`sketch`, or
// no treatment set on a `tension` scene) or a light marker-on-paper register
// (`whiteboard`). Same rough.js machinery, same hand font, same geometry — only
// the colour table changes. The default branch is byte-identical to before.

const CHALK = '#e9e6da';
const seedOf = (s: string): number =>
  [...s].reduce((a, c) => a + c.charCodeAt(0), 11);

// A palette table — every named ink the scene reaches for. `sketch` is the
// chalkboard, `whiteboard` is marker-on-paper. The keys never grow; only the
// values change with the skin.
type Palette = {
  background: string;            // page / board fill
  smudge1: string;               // first erased-chalkboard / paper-grain blob
  smudge2: string;               // second blob
  smudge1Opacity: number;
  smudge2Opacity: number;
  vignetteInner: string;         // radial gradient inner — transparent on both
  vignetteOuter: string;         // radial gradient outer — darken or fade
  nodeFill: string;              // faint fill behind a node box
  nodeFillOpacity: number;       // scales by the node's intro progress
  textPrimary: string;           // labels — chalk-white or dark ink
  textSub: string;               // sub-labels (non-risk)
  textSubRisk: string;           // sub-labels when node.kind === 'risk'
  inkDefault: string;            // a normal node's outline (overridden by accent)
  inkRisk: string;               // a `kind: risk` node's outline and risk ring
  inkRejected: string;           // a `kind: rejected` node's outline and crossout
  edgeStroke: string;            // edge line + arrowhead
  edgeLabel: string;             // edge label text
  progressDim: string;           // unvisited progress dot
  brand: string;                 // "docent" wordmark in the corner
};

const PALETTES: Record<'sketch' | 'whiteboard', Palette> = {
  // The chalkboard — preserved exactly as it was hard-coded before the palette
  // table existed. Edit only in lockstep with a regression check.
  sketch: {
    background: '#0d0f0e',
    smudge1: '#1a1e1b',
    smudge2: '#20231f',
    smudge1Opacity: 0.7,
    smudge2Opacity: 0.5,
    vignetteInner: 'transparent',
    vignetteOuter: '#050605',
    nodeFill: '#191c1a',
    nodeFillOpacity: 0.9,
    textPrimary: CHALK,
    textSub: '#a9ab9f',
    textSubRisk: '#ff8aa0',
    inkDefault: '',                 // unused — chalkboard inks default to accent
    inkRisk: '#ff8aa0',
    inkRejected: '#8b8f86',
    edgeStroke: '#9a9c90',
    edgeLabel: '#c7c9bd',
    progressDim: '#2a2d29',
    brand: '#5b5e56',
  },
  // Marker on paper. A real warm off-white (not pure white) for the page; deep
  // blue for the confident default marker; ink black for text; red for risks,
  // green for the chosen path / accent. No hand cursor, no new fonts.
  whiteboard: {
    background: '#f6f1e6',          // warm off-white paper
    smudge1: '#ece5d2',             // a slightly warmer wash for paper texture
    smudge2: '#e7decb',
    smudge1Opacity: 0.55,
    smudge2Opacity: 0.4,
    vignetteInner: 'transparent',
    vignetteOuter: '#d9cfb8',       // soft edge darkening, like a worn page
    nodeFill: '#fffdf6',            // a cleaner inset where the marker sits
    nodeFillOpacity: 0.85,
    textPrimary: '#15161a',         // ink black for labels
    textSub: '#5a5d63',             // graphite for sub-labels
    textSubRisk: '#b3261e',         // red for risk sub-labels
    inkDefault: '#1f3a8a',          // deep marker blue — the confident default
    inkRisk: '#b3261e',             // marker red
    inkRejected: '#6c727a',         // graphite — visibly muted vs. ink black
    edgeStroke: '#15161a',          // ink black for connectors
    edgeLabel: '#15161a',
    progressDim: '#d6cdb6',
    brand: '#8a8472',
  },
};

const paletteFor = (treatment: 'crisp' | 'sketch' | 'whiteboard' | undefined): Palette =>
  treatment === 'whiteboard' ? PALETTES.whiteboard : PALETTES.sketch;

const drawOn = (paths: string[], progress: number) =>
  paths.map((d) => {
    const len = pathLen(d);
    return {d, dasharray: len, dashoffset: len * (1 - progress)};
  });

const SketchNode: React.FC<{
  node: Node;
  box: Box;
  accentHex: string;
  state: 'hidden' | 'normal' | 'focus' | 'dim';
  enterFrame: number;
  palette: Palette;
  isWhiteboard: boolean;
}> = ({node, box, accentHex, state, enterFrame, palette, isWhiteboard}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const seed = seedOf(node.id);
  const x = box.cx - box.w / 2;
  const y = box.cy - box.h / 2;

  const outline = useMemo(() => roughRect(x, y, box.w, box.h, seed, 1.05), [x, y, box.w, box.h, seed]);
  const cross = useMemo(
    () => (node.kind === 'rejected' ? roughCrossOut(x + 16, y + 14, box.w - 32, box.h - 28, seed) : []),
    [x, y, box.w, box.h, seed, node.kind],
  );
  const circle = useMemo(
    () => (node.kind === 'risk' ? roughEllipse(box.cx, box.cy, box.w + 54, box.h + 46, seed + 5, 1.7) : []),
    [box, seed, node.kind],
  );

  if (state === 'hidden') return null;
  const local = frame - enterFrame;
  const progress = local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});
  const dim = state === 'dim' || node.kind === 'rejected';
  const opacity = interpolate(progress, [0, 1], [0, dim ? 0.5 : 1]);

  // Ink resolution: chalkboard uses the scene accent as the default; whiteboard
  // overrides the default with confident marker blue so a tasteful palette
  // reads as one register rather than a wash of accent colours. Risk and
  // rejected paths still flow through the palette table.
  const defaultInk = isWhiteboard ? palette.inkDefault : accentHex;
  const ink =
    node.kind === 'risk'
      ? palette.inkRisk
      : node.kind === 'rejected'
        ? palette.inkRejected
        : defaultInk;

  return (
    <>
      <svg style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} viewBox="0 0 1920 1080">
        {/* faint board fill behind the node */}
        <rect x={x} y={y} width={box.w} height={box.h} rx={10} fill={palette.nodeFill} opacity={opacity * palette.nodeFillOpacity} />
        {drawOn(outline, progress).map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke={ink}
            strokeWidth={node.kind === 'risk' ? 3 : 2.4}
            strokeLinecap="round"
            strokeDasharray={p.dasharray}
            strokeDashoffset={p.dashoffset}
            opacity={dim ? 0.55 : 1}
          />
        ))}
        {circle.length > 0
          ? drawOn(circle, Math.max(0, (progress - 0.35) / 0.65)).map((p, i) => (
              <path key={`c${i}`} d={p.d} fill="none" stroke={palette.inkRisk} strokeWidth={3} strokeLinecap="round"
                strokeDasharray={p.dasharray} strokeDashoffset={p.dashoffset} />
            ))
          : null}
        {cross.length > 0
          ? drawOn(cross, Math.max(0, (progress - 0.45) / 0.55)).map((p, i) => (
              <path key={`x${i}`} d={p.d} fill="none" stroke={palette.inkRejected} strokeWidth={3.4} strokeLinecap="round"
                strokeDasharray={p.dasharray} strokeDashoffset={p.dashoffset} />
            ))
          : null}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: box.w,
          height: box.h,
          opacity,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          textAlign: 'center',
          padding: '0 20px',
        }}
      >
        <div style={{fontFamily: handFamily, fontSize: 38, fontWeight: 700, color: palette.textPrimary, lineHeight: 1, textDecoration: node.kind === 'rejected' ? 'line-through' : 'none'}}>
          {node.label}
        </div>
        {node.sub ? (
          <div style={{fontFamily: handFamily, fontSize: 25, fontWeight: 500, color: node.kind === 'risk' ? palette.textSubRisk : palette.textSub}}>
            {node.sub}
          </div>
        ) : null}
      </div>
    </>
  );
};

const SketchEdge: React.FC<{
  from: Box;
  to: Box;
  label?: string;
  enterFrame: number;
  palette: Palette;
}> = ({from, to, label, enterFrame, palette}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = edgePoint(from, to.cx, to.cy);
  const e = edgePoint(to, from.cx, from.cy);
  const seed = seedOf(`${s.x}-${e.y}`);
  const line = useMemo(() => roughLine(s.x, s.y, e.x, e.y, seed), [s.x, s.y, e.x, e.y, seed]);
  const ang = Math.atan2(e.y - s.y, e.x - s.x);
  const head = useMemo(() => {
    const L = 26;
    const a1 = ang + Math.PI - 0.42;
    const a2 = ang + Math.PI + 0.42;
    return [
      ...roughLine(e.x, e.y, e.x + L * Math.cos(a1), e.y + L * Math.sin(a1), seed + 2),
      ...roughLine(e.x, e.y, e.x + L * Math.cos(a2), e.y + L * Math.sin(a2), seed + 3),
    ];
  }, [e.x, e.y, ang, seed]);

  const local = frame - enterFrame;
  if (local < 0) return null;
  const progress = spring({frame: local, fps, config: {damping: 200, mass: 0.6}});
  const headIn = Math.max(0, (progress - 0.7) / 0.3);
  const mid = {x: (s.x + e.x) / 2, y: (s.y + e.y) / 2};

  return (
    <svg style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} viewBox="0 0 1920 1080">
      {drawOn(line, progress).map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke={palette.edgeStroke} strokeWidth={2.6} strokeLinecap="round"
          strokeDasharray={p.dasharray} strokeDashoffset={p.dashoffset} />
      ))}
      {head.map((d, i) => (
        <path key={`h${i}`} d={d} fill="none" stroke={palette.edgeStroke} strokeWidth={2.6} strokeLinecap="round" opacity={headIn} />
      ))}
      {label ? (
        <text x={mid.x} y={mid.y - 14} textAnchor="middle" fontFamily={handFamily} fontSize={26} fill={palette.edgeLabel} opacity={progress}>
          {label}
        </text>
      ) : null}
    </svg>
  );
};

export const TensionScene: React.FC<SceneProps> = ({ts, sceneIndex, sceneCount}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accent(scene.accent);
  const cols = scene.grid?.cols ?? 3;
  const rows = scene.grid?.rows ?? 3;
  const nodes = scene.nodes ?? [];
  const edges = scene.edges ?? [];
  // The skin's colour table. `whiteboard` swaps to marker-on-paper; anything
  // else (sketch, or no treatment) is the original chalkboard.
  const isWhiteboard = scene.treatment === 'whiteboard';
  const palette = paletteFor(scene.treatment);

  const boxes: Record<string, Box> = {};
  nodes.forEach((n) => {
    boxes[n.id] = nodeBox(n, cols, rows);
  });

  const revealFrame: Record<string, number> = {};
  ts.beats.forEach((b) => {
    if (Array.isArray(b.reveal)) {
      b.reveal.forEach((id) => {
        if (revealFrame[id] === undefined) revealFrame[id] = b.from;
      });
    }
  });
  const revealOf = (id: string) => revealFrame[id] ?? 0;

  const active = activeBeatIndex(ts.beats, frame);
  const focusIds = new Set(ts.beats[active]?.focus ?? []);
  const focusNodes = new Set([...focusIds].filter((id) => boxes[id]));
  const hasFocus = focusNodes.size > 0;
  const nodeState = (id: string): 'hidden' | 'normal' | 'focus' | 'dim' => {
    if (frame < revealOf(id)) return 'hidden';
    if (hasFocus) return focusNodes.has(id) ? 'focus' : 'dim';
    return 'normal';
  };

  const intro = interpolate(frame, [0, 18], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const headingUnderline = useMemo(() => roughLine(120, 196, 120 + (scene.heading?.length ?? 10) * 19, 198, 99), [scene.heading]);
  const ulProgress = interpolate(frame, [10, 34], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{backgroundColor: palette.background}}>
      {/* erased-chalkboard smudges / paper-grain washes — same geometry, the
          palette decides whether they read as smoke on slate or wash on paper. */}
      <div style={{position: 'absolute', width: 1500, height: 900, left: 200, top: 90, borderRadius: '50%',
        background: `radial-gradient(ellipse, ${palette.smudge1} 0%, transparent 70%)`, opacity: palette.smudge1Opacity}} />
      <div style={{position: 'absolute', width: 700, height: 460, right: 120, bottom: 110, borderRadius: '50%',
        background: `radial-gradient(ellipse, ${palette.smudge2} 0%, transparent 72%)`, opacity: palette.smudge2Opacity}} />
      <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 66% at 50% 46%, ${palette.vignetteInner} 42%, ${palette.vignetteOuter} 100%)`}} />

      {/* chrome */}
      <div style={{position: 'absolute', left: 120, top: 86, opacity: intro}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
          <div style={{width: 9, height: 9, borderRadius: 2, background: accentHex, boxShadow: `0 0 14px ${accentHex}`}} />
          <div style={{fontFamily: monoFamily, fontSize: 21, letterSpacing: 4, color: accentHex, fontWeight: 500}}>
            {scene.kicker}
          </div>
        </div>
        {scene.heading ? (
          <div style={{fontFamily: handFamily, fontSize: 66, fontWeight: 700, color: palette.textPrimary, marginTop: 4}}>
            {scene.heading}
          </div>
        ) : null}
      </div>
      <svg style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} viewBox="0 0 1920 1080">
        {drawOn(headingUnderline, ulProgress).map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke={accentHex} strokeWidth={3} strokeLinecap="round"
            strokeDasharray={p.dasharray} strokeDashoffset={p.dashoffset} opacity={0.8} />
        ))}
      </svg>

      <AbsoluteFill
        style={{
          transformOrigin: '0 0',
          transform: (() => {
            const cam = resolveCamera(ts.beats, active, boxes, frame, fps);
            return `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.scale})`;
          })(),
        }}
      >
        {edges.map((e) =>
          boxes[e.from] && boxes[e.to] && frame >= revealOf(e.id) ? (
            <SketchEdge key={e.id} from={boxes[e.from]} to={boxes[e.to]} label={e.label} enterFrame={revealOf(e.id)} palette={palette} />
          ) : null,
        )}
        {nodes.map((n) => (
          <SketchNode
            key={n.id}
            node={n}
            box={boxes[n.id]}
            accentHex={accent(n.accent ?? scene.accent)}
            state={nodeState(n.id)}
            enterFrame={revealOf(n.id)}
            palette={palette}
            isWhiteboard={isWhiteboard}
          />
        ))}
      </AbsoluteFill>

      {/* progress */}
      <div style={{position: 'absolute', left: 122, bottom: 66, display: 'flex', gap: 9}}>
        {Array.from({length: sceneCount}).map((_, i) => (
          <div key={i} style={{width: i === sceneIndex ? 42 : 20, height: 4, borderRadius: 2,
            background: i <= sceneIndex ? accentHex : palette.progressDim, boxShadow: i === sceneIndex ? `0 0 10px ${accentHex}` : 'none'}} />
        ))}
      </div>
      <div style={{position: 'absolute', right: 122, bottom: 60, fontFamily: handFamily, fontSize: 24, color: palette.brand}}>
        docent
      </div>
      <Narration beats={ts.beats} />
    </AbsoluteFill>
  );
};
