import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {glow} from '../theme';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {FittedText} from '../components/FittedText';
import {STAGE} from '../engine/layout';
import {
  activeBeatIndex,
  type MechanismMotion,
  type MechanismPart,
  type SceneProps,
} from '../engine/spec';
import {paletteAccentKey, paletteSceneHex} from '../engine/knobs';
import type {ResolvedStyle} from '../style';

// A mechanism scene — a working diagram in continuous motion that lets the
// viewer SEE how a thing operates. The motion is generated procedurally from
// closed primitives (cycle / oscillate / descend / iterate); the author names
// the kind of motion and the parts it visits, the engine owns the animation.
//
// Mechanism is the answer to a question the prior scene types could not pose:
// what does this thing *do* when it runs? `structure` shows what it IS;
// `diff` shows what it BECAME; `walkthrough`'s messages show how data MOVES
// through it; but none of them let a viewer watch a feedback loop converge,
// a thermostat compensate, gradient descent walk, or a state machine cycle.
// The motion IS the argument: a beat can `freezes` it to call attention to
// a phase, then the next beat lets it resume.

// Normalize a 0..1 position over the STAGE rectangle. Parts in a spec carry
// `pos: {x, y}` with both in 0..1; here we resolve them to pixel coords.
const partXY = (p: MechanismPart): {x: number; y: number} => ({
  x: STAGE.x + Math.max(0, Math.min(1, p.pos.x)) * STAGE.w,
  y: STAGE.y + Math.max(0, Math.min(1, p.pos.y)) * STAGE.h,
});

// The integer length of the motion loop — used by freezes to address a
// specific phase. `cycle` visits |path| positions; `iterate` visits |phases|;
// `oscillate` and `descend` are two-phase (start, end) in the loop.
const motionLength = (m: MechanismMotion): number => {
  switch (m.kind) {
    case 'cycle':
      return Math.max(1, m.path.length);
    case 'iterate':
      return Math.max(1, m.phases.length);
    case 'oscillate':
    case 'descend':
      return 2;
  }
};

// The motion's progress at the current frame as a (phase, t) pair: `phase` is
// the integer step in [0, length); `t` is the fractional position into the
// next step in [0, 1). A freeze pins (phase, 0) for the freeze's beat span.
// Beats that don't carry a freeze let the motion advance smoothly at the
// `period` rate.
type Phase = {phase: number; t: number};

const motionPhase = (
  motion: MechanismMotion,
  frame: number,
  frozenPhase: number | null,
  freezeStart: number,
): Phase => {
  const len = motionLength(motion);
  if (frozenPhase !== null) {
    return {phase: ((frozenPhase % len) + len) % len, t: 0};
  }
  // The frame the motion last began running freely: either 0 (no freeze yet)
  // or the end of the most recent freeze. `freezeStart` is the start of the
  // CURRENT live (unfrozen) interval — see the caller.
  const local = Math.max(0, frame - freezeStart);
  const period = Math.max(1, motion.period);
  const through = (local / period) * len;
  const phase = Math.floor(through) % len;
  const t = through - Math.floor(through);
  return {phase, t};
};

// Linear interpolation in 2D, used by every motion to position the moving
// marker between two named parts.
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const MechanismScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  // `palette` (a scene knob) re-selects chrome over a family; without a
  // palette this is exactly `accent(scene.accent)`. paletteSceneHex still
  // reads the closed ACCENTS map from theme.ts (owned by engine/knobs); the
  // tokens-driven swap of palette colours is left for a follow-on sprint.
  const accentHex = paletteSceneHex(scene.palette, scene.accent);
  const parts: MechanismPart[] = scene.parts ?? [];
  const motion = scene.motion;
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;
  const accentMap = style.tokens.accent as unknown as Record<string, string>;

  // Look up part by id once for cheap lookups inside the motion math.
  const partById = new Map<string, MechanismPart>();
  parts.forEach((p) => partById.set(p.id, p));

  // ----- freezes — beat-level pauses on a named phase ----------------------
  // A scene's `freezes` array carries (beatId, phase) entries. At the current
  // frame, find the active beat's freeze (if any) and the start frame of the
  // live (unfrozen) interval — the motion resumes from there.
  const freezes = scene.freezes ?? [];
  const active = activeBeatIndex(ts.beats, frame);
  const activeBeat = ts.beats[active];
  const activeFreeze = activeBeat
    ? freezes.find((f) => f.beatId === activeBeat.id)
    : undefined;
  // `freezeStart` is the start frame of the most-recent unfrozen interval:
  // walk forward through beats, accumulating frames spent unfrozen so the
  // motion advances continuously across non-freeze beats and pauses on the
  // ones with a freeze.
  let freezeStart = 0;
  for (let i = 0; i < active; i++) {
    const b = ts.beats[i];
    const fz = freezes.find((f) => f.beatId === b.id);
    if (fz) {
      // The freeze beat doesn't advance the clock; reset the live-interval
      // start to the end of this frozen beat.
      freezeStart = b.from + b.durationInFrames;
    }
  }
  // No motion to draw — just render an empty diagram skeleton.
  if (!motion || parts.length === 0) {
    return (
      <SceneFrame
        style={style}        accentHex={accentHex}
        kicker={scene.kicker}
        heading={scene.heading}
        sceneIndex={sceneIndex}
        sceneCount={sceneCount}
      >
        <Narration style={style} beats={ts.beats} />
      </SceneFrame>
    );
  }

  const {phase, t} = motionPhase(
    motion,
    frame,
    activeFreeze ? activeFreeze.phase : null,
    freezeStart,
  );

  // Per-motion: resolve the (from, to) pair the moving marker travels
  // between AT THIS PHASE, and the active part ids (the ones the motion is
  // visibly touching right now — used to brighten their cards).
  type Step = {fromId: string | null; toId: string | null; activeIds: Set<string>};
  const step: Step = (() => {
    const empty: Step = {fromId: null, toId: null, activeIds: new Set()};
    switch (motion.kind) {
      case 'cycle': {
        const ids = motion.path;
        if (ids.length === 0) return empty;
        const a = ids[phase % ids.length];
        const b = ids[(phase + 1) % ids.length];
        return {fromId: a, toId: b, activeIds: new Set([a, b])};
      }
      case 'oscillate': {
        const [a, b] = motion.between;
        // phase 0: a → b; phase 1: b → a
        const fromId = phase === 0 ? a : b;
        const toId = phase === 0 ? b : a;
        return {fromId, toId, activeIds: new Set([a, b])};
      }
      case 'descend': {
        // descend is a one-shot half-cycle; render the marker walking from
        // `from` to `to` on phase 0, resting at `to` on phase 1.
        return {
          fromId: motion.from,
          toId: motion.to,
          activeIds: new Set([motion.from, motion.to]),
        };
      }
      case 'iterate': {
        const ph = motion.phases[phase % motion.phases.length];
        const ids = new Set(ph?.show ?? []);
        return {fromId: null, toId: null, activeIds: ids};
      }
    }
  })();

  // The marker (or token) position for the motions that animate one. For
  // `descend` we ease the t into a settling shape so the walk feels like a
  // gradient descent — fast at first, slower toward the minimum.
  const markerPos = ((): {x: number; y: number} | null => {
    if (!step.fromId || !step.toId) return null;
    const a = partById.get(step.fromId);
    const b = partById.get(step.toId);
    if (!a || !b) return null;
    const ap = partXY(a);
    const bp = partXY(b);
    let tt = t;
    if (motion.kind === 'descend') {
      // Phase 0: walk; Phase 1: rest at `to`. Apply a settling easing.
      tt = phase === 1 ? 1 : 1 - Math.pow(1 - t, 1.8);
    } else if (motion.kind === 'oscillate') {
      // Smooth ease so the oscillation feels like a settling motion.
      tt = 0.5 - 0.5 * Math.cos(Math.PI * t);
    }
    return {x: lerp(ap.x, bp.x, tt), y: lerp(ap.y, bp.y, tt)};
  })();

  // Whole-scene fade-in (the chart/figure intro shape).
  const intro = spring({frame, fps, config: {damping: 200, mass: 0.7}});

  // The colour resolution per part: a part's id can pick a slot in the
  // palette (so multi-accent palettes spread across parts visibly), defaulting
  // to the scene accent. Resolved against the style tokens' accent map so a
  // preset that redefines a hue is honoured.
  const partAccentHex = (p: MechanismPart, order: number): string => {
    const key = paletteAccentKey(scene.palette, scene.accent, undefined, order);
    return accentMap[key] ?? accentMap.blue;
  };

  // ----- the active-phase label -------------------------------------------
  // For `iterate`, the current phase carries a `label` the engine pins at the
  // top of the stage so the viewer reads what state the machine is in.
  const phaseLabel: string | null =
    motion.kind === 'iterate'
      ? motion.phases[phase % motion.phases.length]?.label ?? null
      : null;

  // A breathing pulse on the active parts — visibly indicates "this is what
  // the motion is touching right now", on top of the marker that travels.
  const t01 = (frame / fps) % 1;
  const breathe = 0.5 + 0.5 * Math.sin(t01 * Math.PI * 2);

  return (
    <SceneFrame
      style={style}      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <AbsoluteFill>
        <svg
          style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
          viewBox="0 0 1920 1080"
        >
          {/* ---- the loop path (cycle motion) ---- */}
          {motion.kind === 'cycle' && motion.path.length >= 2 && (
            <g opacity={0.55 * intro}>
              {motion.path.map((id, i) => {
                const a = partById.get(id);
                const b = partById.get(motion.path[(i + 1) % motion.path.length]);
                if (!a || !b) return null;
                const ap = partXY(a);
                const bp = partXY(b);
                return (
                  <line
                    key={`cyc-${i}`}
                    x1={ap.x}
                    y1={ap.y}
                    x2={bp.x}
                    y2={bp.y}
                    stroke={accentHex}
                    strokeWidth={2.4}
                    strokeDasharray="6 9"
                    strokeLinecap="round"
                    opacity={0.7}
                  />
                );
              })}
            </g>
          )}
          {/* ---- the between line (oscillate / descend) ---- */}
          {(motion.kind === 'oscillate' || motion.kind === 'descend') &&
            step.fromId &&
            step.toId && (
              <g opacity={0.5 * intro}>
                {(() => {
                  const a = partById.get(step.fromId);
                  const b = partById.get(step.toId);
                  if (!a || !b) return null;
                  const ap = partXY(a);
                  const bp = partXY(b);
                  return (
                    <line
                      x1={ap.x}
                      y1={ap.y}
                      x2={bp.x}
                      y2={bp.y}
                      stroke={accentHex}
                      strokeWidth={2.4}
                      strokeDasharray="6 9"
                      strokeLinecap="round"
                    />
                  );
                })()}
              </g>
            )}
        </svg>

        {/* ---- parts: cards / values / tokens at named positions ---- */}
        {parts.map((p, i) => {
          const xy = partXY(p);
          const col = partAccentHex(p, i);
          const isActive = step.activeIds.has(p.id);
          const kind = p.kind ?? 'node';
          if (kind === 'token') {
            // a passive token-shaped part, used as an orbital marker
            return (
              <div
                key={p.id}
                style={{
                  position: 'absolute',
                  left: xy.x - 22,
                  top: xy.y - 22,
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: glow(col, 0.45),
                  border: `2px solid ${col}`,
                  opacity: intro,
                  boxShadow: `0 0 22px ${glow(col, 0.5)}`,
                }}
              />
            );
          }
          if (kind === 'value') {
            // a numeric readout — the digit is the part's `sub`, the part's
            // `label` sits below it. Pulses when the motion touches it.
            return (
              <div
                key={p.id}
                style={{
                  position: 'absolute',
                  left: xy.x - 110,
                  top: xy.y - 48,
                  width: 220,
                  textAlign: 'center',
                  opacity: intro,
                }}
              >
                {/* value readout — large numeric; auto-shrink for
                    longer values ("3.14159"). Width is 220 with a
                    16-px interior pad on each side. */}
                <FittedText
                  text={String(p.sub ?? '—')}
                  maxWidth={188}
                  basePx={44}
                  floorPx={22}
                  charAdvance={0.62}
                  mode="shrink-single"
                  style={{
                    fontFamily: monoFamily,
                    fontWeight: 700,
                    color: isActive ? ink.hi : ink.mid,
                    letterSpacing: -1,
                    textAlign: 'center',
                    textShadow: isActive
                      ? `0 0 ${18 + breathe * 14}px ${glow(col, 0.75)}`
                      : 'none',
                  }}
                />
                <FittedText
                  text={p.label}
                  maxWidth={188}
                  basePx={16}
                  floorPx={10}
                  charAdvance={0.66}
                  mode="shrink-single"
                  style={{
                    fontFamily: sansFamily,
                    color: ink.low,
                    marginTop: 4,
                    textTransform: 'uppercase',
                    letterSpacing: 1.4,
                    textAlign: 'center',
                  }}
                />
              </div>
            );
          }
          // default: a labelled node card
          return (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                left: xy.x - 120,
                top: xy.y - 36,
                width: 240,
                padding: '12px 16px',
                borderRadius: 12,
                background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
                border: `1.5px solid ${isActive ? col : bg.line}`,
                boxShadow: isActive
                  ? `0 0 ${20 + breathe * 18}px -2px ${glow(col, 0.7)}`
                  : '0 14px 30px -16px #000000cc',
                opacity: interpolate(intro, [0, 1], [0, 1]),
                transform: `scale(${interpolate(intro, [0, 1], [0.96, 1])})`,
              }}
            >
              {/* Part card label / sub — the card is 240 with 32 horizontal
                  pad (~208 content). Wrap to 2 lines for label, 2 for
                  sub. */}
              <FittedText
                text={p.label}
                maxWidth={208}
                basePx={20}
                floorPx={12}
                charAdvance={0.58}
                mode="shrink-wrap"
                maxLines={2}
                lineHeight={1.18}
                style={{
                  fontFamily: sansFamily,
                  fontWeight: 600,
                  color: isActive ? ink.hi : ink.mid,
                  letterSpacing: -0.2,
                }}
              />
              {p.sub ? (
                <FittedText
                  text={p.sub}
                  maxWidth={208}
                  basePx={14}
                  floorPx={10}
                  charAdvance={0.6}
                  mode="shrink-wrap"
                  maxLines={2}
                  lineHeight={1.35}
                  style={{
                    fontFamily: sansFamily,
                    color: ink.low,
                    marginTop: 2,
                  }}
                />
              ) : null}
            </div>
          );
        })}

        {/* ---- the moving marker — cycle/oscillate/descend ---- */}
        {markerPos && (
          <div
            style={{
              position: 'absolute',
              left: markerPos.x - 18,
              top: markerPos.y - 18,
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: accentHex,
              border: `3px solid ${bg.base}`,
              boxShadow: `0 0 ${24 + breathe * 14}px ${glow(accentHex, 0.85)}`,
              opacity: intro,
            }}
          />
        )}

        {/* ---- the active-phase label (iterate) ---- */}
        {phaseLabel && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 230,
              textAlign: 'center',
              opacity: intro,
            }}
          >
            <div
              style={{
                display: 'inline-block',
                fontFamily: monoFamily,
                fontSize: 16,
                fontWeight: 600,
                color: accentHex,
                letterSpacing: 2,
                textTransform: 'uppercase',
                padding: '6px 18px',
                borderRadius: 8,
                background: glow(accentHex, 0.1),
                border: `1.5px solid ${glow(accentHex, 0.45)}`,
              }}
            >
              phase · {phaseLabel}
            </div>
          </div>
        )}

        {/* ---- freeze indicator — when a beat pins the motion ---- */}
        {activeFreeze && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 220,
              textAlign: 'center',
              opacity: 0.85 * intro,
            }}
          >
            <div
              style={{
                display: 'inline-block',
                fontFamily: monoFamily,
                fontSize: 13,
                color: ink.low,
                letterSpacing: 2,
                textTransform: 'uppercase',
                padding: '4px 12px',
                borderRadius: 6,
                background: bg.panel,
                border: `1px solid ${bg.line}`,
              }}
            >
              ◼ paused · phase {activeFreeze.phase}
            </div>
          </div>
        )}
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
