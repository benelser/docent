import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {glow} from '../theme';
import type {ResolvedStyle} from '../style';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {FittedText} from '../components/FittedText';
import {activeBeatIndex, type SceneProps, type VennNovelty, type VennRegion} from '../engine/spec';
import {paletteGlowScale, paletteSceneHex} from '../engine/knobs';

// VennScene — the overlap-analysis primitive. Renders 2 or 3 named sets as
// overlapping circles and lets the film argue from the INTERSECTION:
// not "these things exist" but "what lives in the overlap, and ONLY there,
// is what the argument hinges on".
//
// 2-set: two circles, 50% overlap, three addressable regions: {A}, {B}, {A,B}.
// 3-set: three circles in the classic triangular layout, seven addressable
// regions: {A}, {B}, {C}, {A,B}, {A,C}, {B,C}, {A,B,C}.
//
// Each region has a stable id (declared in spec.regions). Beats reveal/focus
// these region ids one at a time; the matching region lights up. The
// `novelty.regionId` names the intersection the film argues from — when that
// region is revealed it gets a glow ring + a one-line note below the diagram.
//
// Honors `accent`, `palette`, `treatment` (sketch/whiteboard) knobs. The
// "dangerous intersection" — the region the argument hinges on — is the
// shape the film builds toward and the one the eye should rest on last.

// Circle geometry — STAGE coordinates (1920×1080). Diagrams sit in the
// upper-middle so the novelty note has room beneath.
const CENTER_X = 960;
const CENTER_Y = 540;
const RADIUS_2 = 280; // 2-set: large enough that the intersection is readable
const RADIUS_3 = 250; // 3-set: tighter so all 7 regions fit comfortably

// 2-set: two circles offset on the x-axis, ~50% overlap.
const SET_2_OFFSETS: [number, number][] = [
  [-RADIUS_2 * 0.5, 0],
  [RADIUS_2 * 0.5, 0],
];

// 3-set: classic 3-petal layout, circles arranged on an equilateral triangle.
const SET_3_OFFSETS: [number, number][] = [
  [0, -RADIUS_3 * 0.6], // A — top
  [-RADIUS_3 * 0.55, RADIUS_3 * 0.4], // B — bottom-left
  [RADIUS_3 * 0.55, RADIUS_3 * 0.4], // C — bottom-right
];

// Region label positions — where a region's label/note sits inside its area.
// Tuned per layout so each label has room.
const REGION_2_LABEL: Record<string, [number, number]> = {
  // a single-set regions
  '2:0': [-RADIUS_2 - 30, 0], // A only — left of the overlap
  '2:1': [RADIUS_2 + 30, 0], // B only — right
  '2:0,1': [0, 0], // A∩B — center
};

const REGION_3_LABEL: Record<string, [number, number]> = {
  // A only / B only / C only — pulled outward from the center
  '3:0': [0, -RADIUS_3 * 0.95],
  '3:1': [-RADIUS_3 * 0.95, RADIUS_3 * 0.5],
  '3:2': [RADIUS_3 * 0.95, RADIUS_3 * 0.5],
  // pairwise intersections — between two circles
  '3:0,1': [-RADIUS_3 * 0.55, -RADIUS_3 * 0.05],
  '3:0,2': [RADIUS_3 * 0.55, -RADIUS_3 * 0.05],
  '3:1,2': [0, RADIUS_3 * 0.55],
  // triple intersection — dead center
  '3:0,1,2': [0, RADIUS_3 * 0.16],
};

// Build a stable lookup key for a region given the spec sets order. Region
// `in` lists set ids; we resolve them to indices for the label-position map.
const regionKey = (
  setCount: 2 | 3,
  region: VennRegion,
  setIdToIndex: Map<string, number>,
): string => {
  const indices = region.in
    .map((id) => setIdToIndex.get(id))
    .filter((v): v is number => typeof v === 'number')
    .sort((a, b) => a - b);
  return `${setCount}:${indices.join(',')}`;
};

export const VennScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const {ink} = style.tokens;
  const accentHex = paletteSceneHex(scene.palette, scene.accent);
  const sets = scene.sets ?? [];
  // VennScene reads its OWN regions variant — VennRegion (with `in`). The
  // spec union (MapRegion[] | VennRegion[]) is widened on Scene so the same
  // field name can carry either; the validator pins each variant to its
  // scene type, so this cast is safe on a valid venn scene.
  const regions = (scene.regions as VennRegion[] | undefined) ?? [];
  // Narrow `Scene.novelty` (the widened `PriorArtNovelty | VennNovelty`
  // union) via the `kind` discriminator. The validator pins
  // `novelty.kind === 'venn'` on every venn scene; this read is safe on any
  // spec that passes the contract.
  const novelty: VennNovelty | undefined =
    scene.novelty?.kind === 'venn' ? scene.novelty : undefined;
  const treatment = scene.treatment;
  const isLight = treatment === 'whiteboard';
  const isSketch = treatment === 'sketch';

  // 2 or 3 sets — validator enforces this; clamp defensively.
  const setCount: 2 | 3 = sets.length >= 3 ? 3 : 2;
  const offsets = setCount === 3 ? SET_3_OFFSETS : SET_2_OFFSETS;
  const radius = setCount === 3 ? RADIUS_3 : RADIUS_2;

  const setIdToIndex = new Map<string, number>();
  sets.forEach((s, i) => setIdToIndex.set(s.id, i));

  // Active beat — what reveal/focus is live.
  const active = activeBeatIndex(ts.beats, frame);
  const revealedIds = new Set<string>();
  for (let i = 0; i <= active; i++) {
    const r = ts.beats[i]?.reveal;
    if (Array.isArray(r)) for (const id of r) revealedIds.add(id);
  }
  const allByDefault = !ts.beats.some(
    (b) => Array.isArray(b.reveal) && b.reveal.length > 0,
  );
  const focusIds = new Set(ts.beats[active]?.focus ?? []);
  const hasFocus = focusIds.size > 0;

  const enterFrameFor = (id: string): number => {
    for (const b of ts.beats) {
      const r = b.reveal;
      if (Array.isArray(r) && r.includes(id)) return b.from;
    }
    return 0;
  };

  const intro = spring({frame, fps, config: {damping: 200}});

  // Region appearance progress — driven by the reveal of its id.
  const regionEnterAlpha = (rid: string): number => {
    if (allByDefault) return intro;
    if (!revealedIds.has(rid)) return 0;
    const local = frame - enterFrameFor(rid);
    return spring({frame: local, fps, config: {damping: 200, mass: 0.7}});
  };

  // Set/circle appearance — circles enter when the scene opens (intro). When a
  // set id is referenced in `reveal` directly, it eases in on that beat; if no
  // beat names sets specifically, circles ride the intro.
  const setEnterAlpha = (sid: string): number => {
    if (allByDefault || !ts.beats.some((b) =>
      Array.isArray(b.reveal) && b.reveal.some((id) => setIdToIndex.has(id)),
    )) {
      return intro;
    }
    if (!revealedIds.has(sid)) return 0;
    const local = frame - enterFrameFor(sid);
    return spring({frame: local, fps, config: {damping: 200, mass: 0.8}});
  };

  // The active "dangerous intersection" — the novelty region — once revealed,
  // gets a glow ring. We need its center to draw the ring.
  const noveltyRevealed =
    novelty && (allByDefault || revealedIds.has(novelty.regionId));
  const noveltyFocused = novelty && focusIds.has(novelty.regionId);

  // Circle color tuning — light treatments need darker ink; crisp uses the accent.
  const strokeColor = isLight ? '#3b2a0d' : accentHex;
  const labelColor = isLight ? '#15161a' : ink.hi;
  const subLabelColor = isLight ? '#5a4419' : ink.mid;

  // Per-circle accent tints — give each set a slightly different hue so the
  // overlaps read as overlaps (mix-blend-mode multiplies them).
  const circleTintFor = (i: number): string => {
    // For 2 sets: alternate primary/secondary. For 3 sets: spread accents.
    // We just use the same accentHex with different opacity so it always
    // composes against the scene's palette; multiplication darkens the overlap
    // automatically.
    return accentHex;
  };

  // The fill alpha that produces a clearly visible overlap region under
  // multiply blending. Lower alpha = brighter pairwise overlap.
  const FILL_ALPHA = isLight ? 0.20 : 0.16;

  const body = (
    <AbsoluteFill>
      {/* The Venn diagram — SVG, parked in the upper-middle of the stage. */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 1080"
        style={{position: 'absolute', inset: 0}}
      >
        {/* Defs — a soft blur for the dangerous-intersection glow ring. */}
        <defs>
          <filter id="venn-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        {/* The circles. mix-blend-mode darkens overlaps naturally on a dark
            background; on the whiteboard we lighten instead. We draw each
            circle's body (translucent fill) and its outline. */}
        <g
          style={{
            mixBlendMode: isLight ? 'multiply' : 'screen',
          }}
        >
          {sets.map((s, i) => {
            const a = setEnterAlpha(s.id);
            if (a <= 0) return null;
            const [dx, dy] = offsets[i] ?? [0, 0];
            const cx = CENTER_X + dx;
            const cy = CENTER_Y + dy;
            const r = radius * interpolate(a, [0, 1], [0.85, 1]);
            return (
              <circle
                key={`fill-${s.id}`}
                cx={cx}
                cy={cy}
                r={r}
                fill={circleTintFor(i)}
                opacity={a * FILL_ALPHA}
              />
            );
          })}
        </g>

        {/* Outlines — drawn after fills so they sit cleanly on top. */}
        {sets.map((s, i) => {
          const a = setEnterAlpha(s.id);
          if (a <= 0) return null;
          const [dx, dy] = offsets[i] ?? [0, 0];
          const cx = CENTER_X + dx;
          const cy = CENTER_Y + dy;
          const r = radius * interpolate(a, [0, 1], [0.85, 1]);
          return (
            <circle
              key={`outline-${s.id}`}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isSketch ? 2.5 : 2}
              opacity={a * 0.85}
              strokeDasharray={isSketch ? '6 4' : undefined}
            />
          );
        })}

        {/* The dangerous-intersection glow ring — anchored at the novelty
            region's label point. Pulses gently when focused. */}
        {noveltyRevealed && novelty ? (() => {
          const key = (() => {
            const r = regions.find((rg) => rg.id === novelty.regionId);
            return r ? regionKey(setCount, r, setIdToIndex) : null;
          })();
          if (!key) return null;
          const pos = setCount === 3 ? REGION_3_LABEL[key] : REGION_2_LABEL[key];
          if (!pos) return null;
          const a = regionEnterAlpha(novelty.regionId);
          if (a <= 0) return null;
          const cx = CENTER_X + pos[0];
          const cy = CENTER_Y + pos[1];
          // Pulse — a slow breathing scale when focused.
          const pulse = noveltyFocused
            ? 1 + 0.08 * Math.sin((frame - enterFrameFor(novelty.regionId)) / fps * 2.6)
            : 1;
          const ringR = (setCount === 3 ? 78 : 110) * pulse;
          return (
            <g opacity={a}>
              <circle
                cx={cx}
                cy={cy}
                r={ringR * 1.2}
                fill={accentHex}
                opacity={0.18}
                filter="url(#venn-glow)"
              />
              <circle
                cx={cx}
                cy={cy}
                r={ringR}
                fill="none"
                stroke={accentHex}
                strokeWidth={3}
                opacity={0.85}
              />
            </g>
          );
        })() : null}
      </svg>

      {/* Set labels — placed beside each circle, away from the center. */}
      {sets.map((s, i) => {
        const a = setEnterAlpha(s.id);
        if (a <= 0) return null;
        const [dx, dy] = offsets[i] ?? [0, 0];
        // Label sits on the outer edge of each set's circle.
        const outX =
          setCount === 3
            ? dx === 0
              ? dx
              : dx * 1.6
            : dx * 1.5;
        const outY = setCount === 3 ? (dy < 0 ? dy * 1.6 - 60 : dy * 1.4 + 50) : -radius - 70;
        return (
          <div
            key={`label-${s.id}`}
            style={{
              position: 'absolute',
              left: CENTER_X + outX - 200,
              top: CENTER_Y + outY - 30,
              width: 400,
              opacity: a,
              transform: `translateY(${interpolate(a, [0, 1], [-12, 0])}px)`,
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            {/* set label / id / sub — the label tile is 400px wide
                with internal pad for breathing room (~360 content). */}
            <FittedText
              text={s.id}
              maxWidth={360}
              basePx={14}
              floorPx={10}
              charAdvance={0.66}
              mode="shrink-single"
              style={{
                fontFamily: monoFamily,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: subLabelColor,
                marginBottom: 4,
                textAlign: 'center',
              }}
            />
            <FittedText
              text={s.label}
              maxWidth={360}
              basePx={26}
              floorPx={14}
              charAdvance={0.56}
              mode="shrink-wrap"
              maxLines={2}
              lineHeight={1.15}
              style={{
                fontFamily: interFamily,
                fontWeight: 600,
                color: labelColor,
                letterSpacing: -0.2,
                textAlign: 'center',
              }}
            />
            {s.sub ? (
              <FittedText
                text={s.sub}
                maxWidth={360}
                basePx={16}
                floorPx={11}
                charAdvance={0.58}
                mode="shrink-wrap"
                maxLines={2}
                lineHeight={1.3}
                style={{
                  fontFamily: interFamily,
                  color: subLabelColor,
                  marginTop: 4,
                  textAlign: 'center',
                }}
              />
            ) : null}
          </div>
        );
      })}

      {/* Region labels — each region's one-liner pinned at the region's
          interior point. The novelty region is rendered with its accent. */}
      {regions.map((r) => {
        const key = regionKey(setCount, r, setIdToIndex);
        const pos = setCount === 3 ? REGION_3_LABEL[key] : REGION_2_LABEL[key];
        if (!pos) return null;
        const a = regionEnterAlpha(r.id);
        if (a <= 0) return null;
        const isNovelty = novelty?.regionId === r.id;
        const focused = focusIds.has(r.id);
        const dim = hasFocus && !focused;
        const opacity = a * (dim ? 0.42 : 1);
        const tx = CENTER_X + pos[0] - 130;
        const ty = CENTER_Y + pos[1] - 36;
        return (
          <div
            key={`region-${r.id}`}
            style={{
              position: 'absolute',
              left: tx,
              top: ty,
              width: 260,
              opacity,
              transform: `scale(${interpolate(a, [0, 1], [0.94, 1])})`,
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            {r.label ? (
              <FittedText
                text={r.label}
                maxWidth={260}
                basePx={isNovelty ? 19 : 17}
                floorPx={11}
                charAdvance={0.58}
                mode="shrink-wrap"
                maxLines={3}
                lineHeight={1.2}
                style={{
                  fontFamily: interFamily,
                  fontWeight: isNovelty || focused ? 700 : 500,
                  color: isNovelty ? accentHex : labelColor,
                  letterSpacing: -0.1,
                  textShadow: isLight ? 'none' : '0 1px 3px rgba(0,0,0,0.6)',
                }}
              />
            ) : null}
          </div>
        );
      })}

      {/* The novelty claim — a one-line note pinned beneath the diagram, only
          when the novelty region has been revealed. THE intersection the
          argument hinges on; the line that makes the film. */}
      {noveltyRevealed && novelty ? (() => {
        const a = regionEnterAlpha(novelty.regionId);
        if (a <= 0) return null;
        const y = CENTER_Y + radius + 220;
        return (
          <div
            style={{
              position: 'absolute',
              left: 180,
              top: y,
              width: 1560,
              opacity: a,
              transform: `translateY(${interpolate(a, [0, 1], [12, 0])}px)`,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '16px 26px',
              borderRadius: 14,
              background: isLight
                ? '#fffdf6'
                : `linear-gradient(90deg, ${glow(accentHex, 0.12)}, transparent)`,
              border: `1px dashed ${isLight ? '#b9a677' : glow(accentHex, 0.6)}`,
            }}
          >
            <span
              style={{
                fontFamily: monoFamily,
                fontSize: 13,
                letterSpacing: 1.6,
                color: accentHex,
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              the intersection
            </span>
            {/* novelty claim — banner is 1560 wide; the kicker chip
                takes the left side (~180px), so the claim has ~1340 to
                work with. Wrap to 2 lines and shrink past that. */}
            <FittedText
              text={novelty.claim}
              maxWidth={1340}
              basePx={22}
              floorPx={14}
              charAdvance={0.56}
              mode="shrink-wrap"
              maxLines={2}
              lineHeight={1.3}
              style={{
                fontFamily: interFamily,
                color: isLight ? '#15161a' : ink.hi,
                fontWeight: 500,
                letterSpacing: -0.1,
                flex: 1,
                minWidth: 0,
              }}
            />
          </div>
        );
      })() : null}
    </AbsoluteFill>
  );

  return (
    <SceneFrame
      style={style}      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      glowScale={paletteGlowScale(scene.palette)}
    >
      {body}
      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
