import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {glow} from '../theme';
import type {ResolvedStyle} from '../style';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {STAGE} from '../engine/layout';
import {
  activeBeatIndex,
  type Beat,
  type SceneProps,
  type TreeNode,
} from '../engine/spec';
import {
  cadenceOffset,
  paletteAccentKey,
  paletteGlowScale,
  paletteSceneHex,
} from '../engine/knobs';

// TreeScene — a rooted hierarchy.
//
// Today `structure` is flat: nodes occupy a grid, edges assert arbitrary
// relations. A tree is the *classification* shape: parent→child, level→sublevel,
// type→instance. Depth carries meaning — kingdom→phylum→class, model→toolset→
// orchestrator→application — and the renderer reads that depth off the
// recursion rather than off a (col, row) grid.
//
// Layout. A simple Reingold–Tilford-style placement: every leaf gets one unit of
// width, every internal node centres over its subtree's leaf-width sum. Depth
// determines the orthogonal axis (the depth axis); breadth fills the STAGE
// extent on the other axis. `orientation: 'vertical'` puts the root at the top
// of the STAGE and grows downward (the org-chart shape); `'horizontal'` puts
// the root at the left and grows rightward (the taxonomy shape).
//
// Entrance. Every node reveals on the beat whose `reveal` array names its id;
// edges to children animate in from the parent on the child's reveal beat, so
// the tree *grows*. A focused node gets the accent ring; non-focused dim.
//
// Treatment. The default `crisp` skin uses the same Card-like geometry as the
// rest of the docent dark-console family — the tree is one node-and-edge family
// with `structure`, just with a different layout interpreter. `sketch` and
// `whiteboard` re-skin the ink/paper but keep the same lines.

// ----- layout: a depth-2 walk of the tree ----------------------------------
// First pass — width: each leaf is 1, each internal node is the sum of its
// children's widths. Second pass — placement: walk in declared order, the
// child's centre is the running offset plus half its width.

type LayoutNode = {
  id: string;
  label: string;
  sub?: string;
  accent?: string;
  depth: number;
  // normalized 0..1 along the depth axis (0 at root, 1 at deepest leaf row)
  d: number;
  // normalized 0..1 along the breadth axis (centre of this node's subtree)
  b: number;
  // declared order across the whole tree (BFS), used for cadence
  order: number;
  // the node's parent id, or null for the root
  parent: string | null;
};

type LayoutEdge = {
  id: string;
  from: string; // parent id
  to: string;   // child id
};

// Walk the tree, return its leaf count. Tags `widths[id]` along the way.
const measure = (n: TreeNode, widths: Map<string, number>): number => {
  if (!n.children || n.children.length === 0) {
    widths.set(n.id, 1);
    return 1;
  }
  let w = 0;
  for (const c of n.children) w += measure(c, widths);
  widths.set(n.id, w);
  return w;
};

// The maximum depth of the tree (root is depth 0).
const maxDepth = (n: TreeNode, d = 0): number => {
  if (!n.children || n.children.length === 0) return d;
  let m = d;
  for (const c of n.children) m = Math.max(m, maxDepth(c, d + 1));
  return m;
};

// Total visible node count.
const countNodes = (n: TreeNode): number => {
  let c = 1;
  for (const k of n.children ?? []) c += countNodes(k);
  return c;
};

type Layout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  depthMax: number; // 0-based, used to normalise the depth axis
  breadthTotal: number; // total leaves — the denominator of the breadth axis
};

const layoutTree = (root: TreeNode): Layout => {
  const widths = new Map<string, number>();
  const total = measure(root, widths);
  const depthMax = maxDepth(root);
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  let order = 0;

  // Walk: each call gets the [start, end] breadth slot the subtree occupies,
  // and places the node at the slot's centre. Recurse left-to-right with each
  // child taking its widths-share of the parent's slot.
  const walk = (
    n: TreeNode,
    parent: string | null,
    depth: number,
    bStart: number, // breadth slot start (in leaf units)
    bEnd: number,   // breadth slot end (in leaf units)
  ): void => {
    const bCenter = (bStart + bEnd) / 2;
    const b = total === 0 ? 0.5 : bCenter / total;
    const d = depthMax === 0 ? 0 : depth / depthMax;
    nodes.push({
      id: n.id,
      label: n.label,
      sub: n.sub,
      accent: n.accent,
      depth,
      d,
      b,
      order: order++,
      parent,
    });
    if (parent !== null) {
      edges.push({id: `${parent}→${n.id}`, from: parent, to: n.id});
    }
    if (!n.children || n.children.length === 0) return;
    let cursor = bStart;
    for (const c of n.children) {
      const w = widths.get(c.id) ?? 1;
      walk(c, n.id, depth + 1, cursor, cursor + w);
      cursor += w;
    }
  };
  walk(root, null, 0, 0, total);
  return {nodes, edges, depthMax, breadthTotal: total};
};

// Map a normalized (b, d) to STAGE pixel space, branching on orientation. The
// breadth axis spans nearly the full STAGE on its dimension; the depth axis
// uses padded margins so the root/leaf rows don't touch the edge.
const placeNode = (
  ln: LayoutNode,
  orientation: 'vertical' | 'horizontal',
  depthMax: number,
): {cx: number; cy: number} => {
  // Padding on the depth axis (so the root and leaves breathe). The breadth
  // axis stays tight to the STAGE; nodes are centred on their subtree.
  if (orientation === 'horizontal') {
    const dPad = depthMax === 0 ? 0 : 0.06;
    const dx = dPad + ln.d * (1 - 2 * dPad);
    return {
      cx: STAGE.x + dx * STAGE.w,
      cy: STAGE.y + (0.08 + ln.b * 0.84) * STAGE.h,
    };
  }
  // vertical (default)
  const dPad = depthMax === 0 ? 0 : 0.06;
  const dy = dPad + ln.d * (1 - 2 * dPad);
  return {
    cx: STAGE.x + (0.08 + ln.b * 0.84) * STAGE.w,
    cy: STAGE.y + dy * STAGE.h,
  };
};

// Node card width: shrinks as the tree gets wider, so 5 nodes on a row still
// breathe. A vertical tree with N leaves divides STAGE.w by N; a horizontal
// tree with N leaves divides STAGE.h by N (but the card width stays bounded by
// STAGE.w/depth — there's much more horizontal real estate).
const nodeDims = (
  layout: Layout,
  orientation: 'vertical' | 'horizontal',
): {w: number; h: number} => {
  const leaves = Math.max(1, layout.breadthTotal);
  if (orientation === 'horizontal') {
    // breadth axis is vertical; divide STAGE.h by leaves to bound card height
    const slotH = STAGE.h / leaves;
    const h = Math.min(110, Math.max(64, slotH - 18));
    // card width — divide STAGE.w by (depthMax+1) so the depth axis fits cleanly
    const slotW = STAGE.w / (layout.depthMax + 1);
    const w = Math.min(300, Math.max(180, slotW - 32));
    return {w, h};
  }
  // vertical — breadth axis is horizontal; tighten card width to fit
  const slotW = STAGE.w / leaves;
  const w = Math.min(280, Math.max(140, slotW - 24));
  const slotH = STAGE.h / (layout.depthMax + 1);
  const h = Math.min(110, Math.max(64, slotH - 28));
  return {w, h};
};

// Stroke a line from a parent box to a child box, trimming to the box edges
// with a small gap. Mirrors layout.ts's connectorPath behaviour but inlined so
// the tree renderer carries no dependency on the structure scene's connector
// component (we draw thin SVG lines instead of the flowing-dashes Connector —
// a tree edge is a *containment* line, not a data wire).
const edgePath = (
  fx: number,
  fy: number,
  fw: number,
  fh: number,
  tx: number,
  ty: number,
  tw: number,
  th: number,
): string => {
  const exit = (cx: number, cy: number, w: number, h: number, ox: number, oy: number) => {
    const dx = ox - cx;
    const dy = oy - cy;
    if (dx === 0 && dy === 0) return {x: cx, y: cy};
    const sx = dx !== 0 ? w / 2 / Math.abs(dx) : Infinity;
    const sy = dy !== 0 ? h / 2 / Math.abs(dy) : Infinity;
    const t = Math.min(sx, sy);
    return {x: cx + dx * t, y: cy + dy * t};
  };
  const a = exit(fx, fy, fw, fh, tx, ty);
  const b = exit(tx, ty, tw, th, fx, fy);
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
};

// ----- the component --------------------------------------------------------

export const TreeScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
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
  const orientation = scene.orientation ?? 'vertical';

  // No root? Render the chrome and let the validator surface the error. (The
  // engine refuses to render a malformed film at the cascade level, so this
  // branch is only reached in studio with a half-written spec.)
  if (!scene.root) {
    return (
      <SceneFrame
        style={style}        accentHex={accentHex}
        kicker={scene.kicker}
        heading={scene.heading}
        sceneIndex={sceneIndex}
        sceneCount={sceneCount}
        glowScale={paletteGlowScale(scene.palette)}
      >
        <Narration style={style} beats={ts.beats} />
      </SceneFrame>
    );
  }

  const layout = layoutTree(scene.root);
  const {w: nodeW, h: nodeH} = nodeDims(layout, orientation);

  // Resolve pixel positions for every node.
  const placed = layout.nodes.map((ln) => {
    const {cx, cy} = placeNode(ln, orientation, layout.depthMax);
    return {ln, cx, cy};
  });
  const byId = new Map(placed.map((p) => [p.ln.id, p]));

  // Reveal map — same model as StructureScene, but the tree also reveals an
  // edge whenever its child node is revealed (a tree edge is the line *into*
  // the child, so child-reveal implies edge-reveal). An author can still name
  // an edge id directly to override.
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
  // Auto-reveal each edge with its child node (unless the author named it).
  for (const e of layout.edges) {
    if (revealFrame[e.id] === undefined && revealFrame[e.to] !== undefined) {
      revealFrame[e.id] = revealFrame[e.to];
      revealCadence[e.id] = revealCadence[e.to];
    }
  }
  // The root reveals on the first beat that mentions it OR, if not, at the
  // scene's first beat (a tree without its root revealed is a void). Auto-pin
  // the root to the first beat if no beat names it.
  if (revealFrame[scene.root.id] === undefined && ts.beats.length > 0) {
    revealFrame[scene.root.id] = ts.beats[0].from;
  }
  const revealOf = (id: string): number => revealFrame[id] ?? 0;

  // Focus map.
  const active = activeBeatIndex(ts.beats, frame);
  const beat = ts.beats[active];
  const focusIds = new Set(beat?.focus ?? []);
  const hasFocus = focusIds.size > 0;

  // Per-node accent: explicit per-node `accent` wins, else palette-spread
  // (cycle the family across declared order), else the scene accent.
  const nodeAccentHex = (ln: LayoutNode): string =>
    accentOf(paletteAccentKey(scene.palette, scene.accent, ln.accent, ln.order));

  const cam = undefined; // tree has no follow-camera; the layout is self-framing

  return (
    <SceneFrame
      style={style}      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      cam={cam}
      glowScale={paletteGlowScale(scene.palette)}
    >
      {/* edges first, so nodes draw on top */}
      <AbsoluteFill>
        <svg width="100%" height="100%" viewBox="0 0 1920 1080">
          {layout.edges.map((e) => {
            const from = byId.get(e.from);
            const to = byId.get(e.to);
            if (!from || !to) return null;
            const enter = revealOf(e.id);
            const local = frame - enter;
            if (local <= 0) return null;
            // grow the line in from the parent toward the child — a containment
            // line, not a flowing wire.
            const draw = spring({
              frame: local,
              fps,
              config: {damping: 200, mass: 0.55},
            });
            const d = edgePath(
              from.cx,
              from.cy,
              nodeW,
              nodeH,
              to.cx,
              to.cy,
              nodeW,
              nodeH,
            );
            // Use stroke-dasharray to grow the line.
            // Approximate the path length as the chord (straight lines).
            const len = Math.hypot(to.cx - from.cx, to.cy - from.cy);
            const dashOffset = (1 - draw) * len;
            const focused =
              hasFocus && (focusIds.has(e.from) || focusIds.has(e.to));
            const dim = hasFocus && !focused;
            return (
              <path
                key={e.id}
                d={d}
                stroke={focused ? accentHex : bg.lineHi}
                strokeWidth={focused ? 2.2 : 1.6}
                fill="none"
                strokeDasharray={len}
                strokeDashoffset={dashOffset}
                opacity={dim ? 0.28 : 0.85}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* nodes */}
        {placed.map((p) => {
          const enter = revealOf(p.ln.id);
          const local = frame - enter;
          if (local <= 0) return null;
          const appear = spring({
            frame: local,
            fps,
            config: {damping: 200, mass: 0.7},
          });
          const aHex = nodeAccentHex(p.ln);
          const focused = focusIds.has(p.ln.id);
          const dim = hasFocus && !focused;
          const isRoot = p.ln.depth === 0;
          // The root reads as a hero; focused nodes get the accent ring +
          // breathing glow; dim nodes recede.
          const breathe = focused ? 0.5 + 0.5 * Math.sin((frame / fps) * 3.0) : 0;
          const opacity = appear * (dim ? 0.34 : 1);
          const scale = interpolate(appear, [0, 1], [0.86, 1]);
          // size — auto-fit so the label can never overflow its card.
          const labelFs =
            p.ln.label.length <= 14
              ? isRoot
                ? 26
                : 22
              : p.ln.label.length <= 22
                ? 18
                : 15;
          const subFs = 13;
          return (
            <div
              key={p.ln.id}
              style={{
                position: 'absolute',
                left: p.cx - nodeW / 2,
                top: p.cy - nodeH / 2,
                width: nodeW,
                height: nodeH,
                opacity,
                transform: `scale(${scale})`,
                borderRadius: 14,
                background: focused || isRoot
                  ? `radial-gradient(120% 140% at 0% 0%, ${glow(aHex, 0.18)} 0%, ${bg.panelHi} 42%, ${bg.panel} 100%)`
                  : `linear-gradient(158deg, ${bg.panelHi} 0%, ${bg.panel} 100%)`,
                border: `1.5px solid ${focused || isRoot ? aHex : bg.line}`,
                boxShadow:
                  focused || isRoot
                    ? `0 0 0 1px ${glow(aHex, 0.32)}, 0 20px 50px -22px ${glow(aHex, 0.45 + breathe * 0.22)}, inset 0 1px 0 ${glow('#ffffff', 0.05)}`
                    : `0 14px 36px -22px #000000cc, inset 0 1px 0 ${glow('#ffffff', 0.04)}`,
                display: 'flex',
                alignItems: 'center',
                padding: '0 14px 0 16px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: 4,
                  alignSelf: 'stretch',
                  background: aHex,
                  boxShadow: `0 0 14px ${glow(aHex, focused || isRoot ? 0.9 : 0.45)}`,
                  marginRight: 12,
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontFamily: interFamily,
                    fontSize: labelFs,
                    fontWeight: isRoot ? 700 : 600,
                    color: ink.hi,
                    letterSpacing: -0.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.ln.label}
                </div>
                {p.ln.sub ? (
                  <div
                    style={{
                      fontFamily: monoFamily,
                      fontSize: subFs,
                      color: focused || isRoot ? ink.mid : ink.low,
                      letterSpacing: 0.2,
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      overflow: 'hidden',
                      lineHeight: 1.22,
                    }}
                  >
                    {p.ln.sub}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
