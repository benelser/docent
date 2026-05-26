// MapScene — a spatial / topological / geographic representation.
//
// MIGRATED from packages/engine/src/scenes/MapScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. Behavior is UNCHANGED from the
// v2.5.x renderer; only import paths and the prop shape were updated:
//   - props receive `SceneRenderProps<MapSceneSpec>` from @docent/kit
//     (the kit-owned `{scene, common}` envelope), rather than the legacy
//     `SceneProps` (the engine-owned `ts: TimedScene` envelope).
//   - the engine-shared chrome (SceneFrame, Narration, FittedText, fonts,
//     STAGE, glow, activeBeatIndex) lives as colocated helpers in this
//     scene's directory until the shared-infra migration agent lands; the
//     integrator will swap the underscore-prefixed local helpers for
//     shared imports at merge time.
//   - the engine's palette knobs (paletteSceneHex, paletteGlowScale) are
//     inlined as their identity-arm: no map scene in v2.5.x sets the
//     palette knob, so `paletteSceneHex(undefined, undefined, style)`
//     resolves to `style.tokens.accent.blue` and `paletteGlowScale(
//     undefined)` resolves to 1. We compute those directly.
//
// Position IS the argument: a region's place on the stage carries
// information, never decoration. Two layout modes:
//
//   topology (default) — abstract named blobs at normalized 0..1 positions
//                        and sizes. Used for distributed-system regions,
//                        network topologies, supply-chain origins. No real
//                        geography ships — country shapes are not the engine's
//                        business; the topology is.
//   grid             — a rectangular grid of labelled cells (rows × cols).
//                      Used for floor plans, stylized geographic layouts.
//
// Reveal beats animate regions / markers / connections in order. Focused
// regions glow. The author pins positions; the engine owns the pixels.
//
// Treatment honored from the scene knob (whiteboard / sketch / crisp).
// Today: crisp is the default rendering; sketch/whiteboard apply a subtle
// paper backdrop tint. The renderer remains crisp shapes — the position
// argument is the load-bearing affordance, not the visual skin.

import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Beat, ResolvedStyle, SceneRenderProps} from '@docent/kit';

import {
  FittedText,
  Narration,
  SceneFrame,
  activeBeatIndex,
  fitFontSize,
  glow,
  interFamily,
  monoFamily,
  truncateForSlot,
} from '../../_shared';
import {STAGE} from './_helpers';
import type {
  MapConnection,
  MapMarker,
  MapRegion,
  MapScene as MapSceneSpec,
} from './validate';

// Resolve the scene's accent hex through the preset's accent table. With no
// `palette` knob set (the default state of every map scene in v2.5.x) this
// is identical to `paletteSceneHex(undefined, undefined, style)` — it looks
// up `'blue'` in `style.tokens.accent`. We default the field guard to keep
// rendering safe if a preset omits `blue`.
const accentOf = (style: ResolvedStyle, key = 'blue'): string => {
  const table = style.tokens.accent as unknown as Record<string, string | undefined>;
  return table[key] ?? table.blue ?? '#5cb6ff';
};

export const MapSceneComponent: React.FC<SceneRenderProps<MapSceneSpec>> = ({
  scene,
  common,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  const {bg, ink} = style.tokens;
  const accentHex = accentOf(style);
  const glowScale = 1;
  const layout: 'topology' | 'grid' = scene.layout ?? 'topology';
  const regions: MapRegion[] = scene.regions ?? [];
  const markers: MapMarker[] = scene.markers ?? [];
  const connections: MapConnection[] = scene.connections ?? [];

  // ----- reveal timing ---------------------------------------------------
  // A region / marker / connection id appears the first beat its `reveal`
  // array names it. A scene with no reveals shows every shape from the
  // start — same convention as ChartScene.
  const revealFrame: Record<string, number> = {};
  ts.beats.forEach((b) => {
    const rev = b.beat.reveal;
    if (Array.isArray(rev)) {
      rev.forEach((id) => {
        if (revealFrame[id] === undefined) revealFrame[id] = b.startFrame;
      });
    }
  });
  const anyReveal = Object.keys(revealFrame).length > 0;
  const revealOf = (id: string): number =>
    revealFrame[id] ?? (anyReveal ? Infinity : 0);

  const active = activeBeatIndex(ts.beats, frame);
  const beat: Beat | undefined = ts.beats[active]?.beat;
  const focusIds = new Set(
    Array.isArray((beat as {focus?: unknown})?.focus)
      ? ((beat as {focus: string[]}).focus as string[])
      : [],
  );
  const hasFocus = focusIds.size > 0;

  type ItemState = 'hidden' | 'focus' | 'dim' | 'live';
  const stateOf = (id: string): ItemState => {
    if (frame < revealOf(id)) return 'hidden';
    if (hasFocus) return focusIds.has(id) ? 'focus' : 'dim';
    return 'live';
  };

  // ----- the stage → pixel mapper ---------------------------------------
  // The map occupies the same STAGE rectangle every diagram type uses. For
  // `topology` a region's `pos` is normalized (0..1) over that rectangle.
  // For `grid` the rectangle is sliced into gridSize.cols × gridSize.rows
  // cells and pos.{x,y} are integer cell coordinates.
  type Rect = {x: number; y: number; w: number; h: number};
  const regionRect = (r: MapRegion): Rect => {
    if (layout === 'grid') {
      const cols = scene.gridSize?.cols ?? 1;
      const rows = scene.gridSize?.rows ?? 1;
      const cellW = STAGE.w / cols;
      const cellH = STAGE.h / rows;
      const cx = Math.max(0, Math.min(cols - 1, Math.floor(r.pos.x)));
      const cy = Math.max(0, Math.min(rows - 1, Math.floor(r.pos.y)));
      const inset = 8;
      return {
        x: STAGE.x + cx * cellW + inset,
        y: STAGE.y + cy * cellH + inset,
        w: Math.max(20, cellW - inset * 2),
        h: Math.max(20, cellH - inset * 2),
      };
    }
    // topology — normalized [0..1] x, y, w, h
    const nx = Math.max(0, Math.min(1, r.pos.x));
    const ny = Math.max(0, Math.min(1, r.pos.y));
    const w = Math.max(0.04, Math.min(0.7, r.pos.w ?? 0.18));
    const h = Math.max(0.04, Math.min(0.7, r.pos.h ?? 0.18));
    // Anchor the blob centered on (nx, ny). Clamp so it never escapes STAGE.
    let px = STAGE.x + nx * STAGE.w - (w * STAGE.w) / 2;
    let py = STAGE.y + ny * STAGE.h - (h * STAGE.h) / 2;
    const pw = w * STAGE.w;
    const ph = h * STAGE.h;
    px = Math.max(STAGE.x, Math.min(STAGE.x + STAGE.w - pw, px));
    py = Math.max(STAGE.y, Math.min(STAGE.y + STAGE.h - ph, py));
    return {x: px, y: py, w: pw, h: ph};
  };

  // Region rects, keyed by id, computed once.
  const rectOf: Record<string, Rect> = {};
  for (const r of regions) {
    rectOf[r.id] = regionRect(r);
  }
  const centerOf = (id: string): {x: number; y: number} | null => {
    const r = rectOf[id];
    if (!r) return null;
    return {x: r.x + r.w / 2, y: r.y + r.h / 2};
  };

  // The whole scene fades in once (matching ChartScene / FigureScene).
  const intro = spring({frame, fps, config: {damping: 200, mass: 0.6}});
  const introScale = interpolate(intro, [0, 1], [0.975, 1]);

  // ----- region rendering ------------------------------------------------
  // A region is a labelled rounded rectangle (for grid) or a soft blob (for
  // topology). The label sits inside the shape; `sub` is the per-region
  // annotation that makes the position load-bearing.
  const renderRegion = (r: MapRegion): React.ReactNode => {
    const st = stateOf(r.id);
    if (st === 'hidden') return null;
    const rect = rectOf[r.id];
    if (!rect) return null;
    const local = frame - revealOf(r.id);
    const a =
      local <= 0
        ? 0
        : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});
    const lit = st === 'focus' || st === 'live';
    const dim = st === 'dim';
    const isGrid = layout === 'grid';

    return (
      <div
        key={r.id}
        style={{
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
          opacity: a * (dim ? 0.36 : 1),
          transform: `scale(${interpolate(a, [0, 1], [0.94, 1])})`,
          borderRadius: isGrid ? 10 : Math.min(rect.w, rect.h) * 0.32,
          border: `${st === 'focus' ? 2.5 : 1.5}px solid ${lit ? accentHex : bg.lineHi}`,
          background: lit
            ? `radial-gradient(ellipse at 50% 40%, ${glow(accentHex, 0.32 * glowScale)} 0%, ${glow(accentHex, 0.08 * glowScale)} 60%, ${bg.panel} 100%)`
            : `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
          boxShadow: dim
            ? 'none'
            : st === 'focus'
              ? `0 0 ${48 * glowScale}px -6px ${glow(accentHex, 0.7)}`
              : `0 0 ${22 * glowScale}px -8px ${glow(accentHex, 0.45)}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 16px',
          textAlign: 'center',
        }}
      >
        {/* region label / sub — sized to the region's rectangle. The
            region rectangle has 32px of horizontal padding (16 each
            side); subtract that for the content box. */}
        <FittedText
          text={r.label}
          maxWidth={rect.w - 32}
          basePx={rect.h > 120 ? 24 : 19}
          floorPx={12}
          charAdvance={0.58}
          mode="shrink-wrap"
          maxLines={2}
          lineHeight={1.15}
          style={{
            fontFamily: interFamily,
            fontWeight: 600,
            color: lit ? ink.hi : ink.mid,
            letterSpacing: -0.2,
            textAlign: 'center',
          }}
        />
        {r.sub ? (
          <FittedText
            text={r.sub}
            maxWidth={rect.w - 32}
            basePx={rect.h > 120 ? 15 : 13}
            floorPx={10}
            charAdvance={0.58}
            mode="shrink-wrap"
            maxLines={3}
            lineHeight={1.32}
            style={{
              fontFamily: interFamily,
              color: lit ? ink.low : ink.faint,
              marginTop: 5,
              textAlign: 'center',
            }}
          />
        ) : null}
      </div>
    );
  };

  // ----- connection rendering --------------------------------------------
  // A connection is a curve between two regions' centers. `kind` picks the
  // stroke style. The path eases on across its reveal beat by clipping its
  // stroke length with strokeDasharray, the same draw-on shape ChartScene
  // uses for evolvePath.
  const renderConnection = (c: MapConnection): React.ReactNode => {
    const st = stateOf(c.id);
    if (st === 'hidden') return null;
    const a0 = centerOf(c.from);
    const b0 = centerOf(c.to);
    if (!a0 || !b0) return null;
    const local = frame - revealOf(c.id);
    const a =
      local <= 0
        ? 0
        : spring({frame: local, fps, config: {damping: 200, mass: 0.8}});
    const lit = st === 'focus' || st === 'live';
    const dim = st === 'dim';
    const stroke = lit ? accentHex : ink.faint;
    const kind = c.kind ?? 'route';
    const isTransmission = kind === 'transmission';
    const isSupply = kind === 'supply';

    // A gentle quadratic curve — the midpoint is perpendicular-offset from
    // the chord so connections never overlap a region's rectangle.
    const dx = b0.x - a0.x;
    const dy = b0.y - a0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const bulge = Math.min(140, len * 0.18);
    const mx = (a0.x + b0.x) / 2 + nx * bulge;
    const my = (a0.y + b0.y) / 2 + ny * bulge;
    const d = `M ${a0.x} ${a0.y} Q ${mx} ${my} ${b0.x} ${b0.y}`;

    // Approximate path length for the draw-on clip — a quadratic curve's
    // length is between chord and (sum of control distances); the average
    // is a fine visual approximation.
    const chord = Math.hypot(dx, dy);
    const a2c = Math.hypot(mx - a0.x, my - a0.y);
    const c2b = Math.hypot(b0.x - mx, b0.y - my);
    const approx = (chord + a2c + c2b) / 2;
    const drawn = approx * a;
    const dash = isTransmission ? `8 8` : `${drawn} ${approx + 4}`;

    return (
      <g key={c.id} opacity={dim ? 0.35 : 1}>
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={isSupply ? 4 : st === 'focus' ? 3 : 2}
          strokeLinecap="round"
          strokeDasharray={isTransmission ? dash : isTransmission ? undefined : dash}
          // Transmission animates the dash phase to suggest motion.
          strokeDashoffset={
            isTransmission ? -((frame / 2) % 16) : 0
          }
          style={{
            filter: lit && !dim ? `drop-shadow(0 0 8px ${glow(accentHex, 0.55)})` : 'none',
          }}
        />
        {/* arrow head for supply edges */}
        {isSupply && a > 0.6 ? (
          (() => {
            const ang = Math.atan2(b0.y - my, b0.x - mx);
            const ah = 14;
            const ax = b0.x - Math.cos(ang) * 8;
            const ay = b0.y - Math.sin(ang) * 8;
            const p1x = ax - Math.cos(ang - 0.5) * ah;
            const p1y = ay - Math.sin(ang - 0.5) * ah;
            const p2x = ax - Math.cos(ang + 0.5) * ah;
            const p2y = ay - Math.sin(ang + 0.5) * ah;
            return (
              <polygon
                points={`${ax},${ay} ${p1x},${p1y} ${p2x},${p2y}`}
                fill={stroke}
                opacity={a}
              />
            );
          })()
        ) : null}
        {c.label && a > 0.5 ? (() => {
          const budget = Math.max(160, Math.min(420, len * 0.55));
          const fs = fitFontSize(c.label, {maxWidth: budget, basePx: 15, floorPx: 10, charAdvance: 0.62});
          const txt = truncateForSlot(c.label, {maxWidth: budget, fontSize: fs, charAdvance: 0.62});
          return (
            <text
              x={mx}
              y={my - 8}
              textAnchor="middle"
              fontFamily={monoFamily}
              fontSize={fs}
              letterSpacing={1}
              fill={lit ? ink.mid : ink.faint}
              opacity={a}
            >
              {txt}
            </text>
          );
        })() : null}
      </g>
    );
  };

  // ----- marker rendering ------------------------------------------------
  // A marker pins a labelled point AT a region — the region center, offset
  // slightly so multiple markers on the same region don't stack. `kind`
  // picks the glyph (pin / dot / flag).
  const markerIndexByRegion = new Map<string, number>();
  const markerOrder = markers.map((m) => {
    const i = markerIndexByRegion.get(m.at) ?? 0;
    markerIndexByRegion.set(m.at, i + 1);
    return i;
  });

  const renderMarker = (m: MapMarker, idx: number): React.ReactNode => {
    const st = stateOf(m.id);
    if (st === 'hidden') return null;
    const c = centerOf(m.at);
    if (!c) return null;
    const local = frame - revealOf(m.id);
    const a =
      local <= 0
        ? 0
        : spring({frame: local, fps, config: {damping: 200, mass: 0.6}});
    const lit = st === 'focus' || st === 'live';
    const dim = st === 'dim';
    const kind = m.kind ?? 'pin';
    const ord = markerOrder[idx] ?? 0;
    // Fan markers around the region center on a tight arc.
    const ang = -Math.PI / 2 + ord * 0.6;
    const radius = ord === 0 ? 0 : 38;
    const x = c.x + Math.cos(ang) * radius;
    const y = c.y + Math.sin(ang) * radius;

    const labelOffset = 18;

    return (
      <div
        key={m.id}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          opacity: a * (dim ? 0.5 : 1),
          transform: `translate(-50%, -50%) scale(${interpolate(a, [0, 1], [0.5, 1])})`,
        }}
      >
        {/* glyph */}
        {kind === 'pin' ? (
          <div
            style={{
              width: 22,
              height: 28,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50% 50% 50% 0',
                transform: 'rotate(-45deg)',
                background: accentHex,
                boxShadow: lit && !dim ? `0 0 14px ${glow(accentHex, 0.85)}` : 'none',
                border: `1.5px solid ${bg.void}`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 7,
                top: 5,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: bg.void,
              }}
            />
          </div>
        ) : kind === 'flag' ? (
          <svg width={26} height={28} viewBox="0 0 26 28">
            <line
              x1={3}
              y1={2}
              x2={3}
              y2={28}
              stroke={accentHex}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <polygon
              points={`4,3 22,8 4,14`}
              fill={accentHex}
              stroke={bg.void}
              strokeWidth={0.8}
            />
          </svg>
        ) : (
          // dot
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: accentHex,
              border: `2px solid ${bg.void}`,
              boxShadow: lit && !dim ? `0 0 12px ${glow(accentHex, 0.85)}` : 'none',
            }}
          />
        )}
        {/* marker label — pinned beside the glyph. Single-line shrink
            so a marker name like "Edge node, us-east-2c" fits inside
            a reasonable width before ellipsis. */}
        <div
          style={{
            position: 'absolute',
            left: labelOffset,
            top: -2,
            background: `${bg.panel}d8`,
            padding: '2px 8px',
            borderRadius: 6,
            border: `1px solid ${lit ? glow(accentHex, 0.5) : bg.line}`,
            maxWidth: 320,
          }}
        >
          <FittedText
            text={m.label}
            maxWidth={304}
            basePx={16}
            floorPx={11}
            charAdvance={0.6}
            mode="shrink-single"
            style={{
              fontFamily: interFamily,
              fontWeight: 600,
              color: lit ? ink.hi : ink.low,
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      glowScale={glowScale}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          opacity: intro,
          transform: `scale(${introScale})`,
          transformOrigin: '50% 55%',
        }}
      >
        {/* the stage backdrop — a faint inset frame the regions sit inside.
            For `grid` layout, faint cell lines make the integer coordinates
            legible. */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1920 1080"
          style={{position: 'absolute', inset: 0}}
        >
          <rect
            x={STAGE.x - 12}
            y={STAGE.y - 12}
            width={STAGE.w + 24}
            height={STAGE.h + 24}
            rx={16}
            fill="none"
            stroke={bg.line}
            strokeWidth={1}
            strokeDasharray="2 6"
            opacity={0.4}
          />
          {layout === 'grid' && scene.gridSize ? (
            <g opacity={0.18}>
              {Array.from({length: scene.gridSize.cols + 1}).map((_, i) => {
                const x = STAGE.x + (i * STAGE.w) / scene.gridSize!.cols;
                return (
                  <line
                    key={`gx-${i}`}
                    x1={x}
                    y1={STAGE.y}
                    x2={x}
                    y2={STAGE.y + STAGE.h}
                    stroke={bg.lineHi}
                    strokeWidth={1}
                  />
                );
              })}
              {Array.from({length: scene.gridSize.rows + 1}).map((_, i) => {
                const y = STAGE.y + (i * STAGE.h) / scene.gridSize!.rows;
                return (
                  <line
                    key={`gy-${i}`}
                    x1={STAGE.x}
                    y1={y}
                    x2={STAGE.x + STAGE.w}
                    y2={y}
                    stroke={bg.lineHi}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}
          {/* connections drawn under the regions so labels read clean */}
          {connections.map((c) => renderConnection(c))}
        </svg>

        {/* regions — the labelled places */}
        {regions.map((r) => renderRegion(r))}

        {/* markers — pinned points on top of everything */}
        {markers.map((m, i) => renderMarker(m, i))}
      </div>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
