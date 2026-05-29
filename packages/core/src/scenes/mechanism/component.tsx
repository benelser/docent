// Mechanism scene component — a working diagram in continuous motion.
//
// MIGRATED from packages/engine/src/scenes/MechanismScene.tsx (behaviour
// preserved). The motion is generated procedurally from closed primitives
// (cycle / oscillate / descend / iterate); the author names the kind of
// motion and the parts it visits, the engine owns the animation.
//
// Mechanism is the answer to a question the prior scene types could not pose:
// what does this thing *do* when it runs? `structure` shows what it IS;
// `diff` shows what it BECAME; `walkthrough`'s messages show how data MOVES
// through it; but none of them let a viewer watch a feedback loop converge,
// a thermostat compensate, gradient descent walk, or a state machine cycle.
// The motion IS the argument: a beat can `freezes` it to call attention to
// a phase, then the next beat lets it resume.
//
// In Phase D, `Film.tsx` becomes a registry-dispatcher that routes each
// scene to its registered plugin's `component`. For v1 of the plugin
// protocol, the component is preserved with the same animation math; the
// engine helpers it consumed (STAGE, glow, activeBeatIndex, the palette
// resolvers) are inlined here as local helpers so the plugin is self-
// contained and `packages/core` carries no dependency on `packages/engine`.

import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

import type {
  Beat,
  CommonSceneProps,
  ResolvedStyle,
  Scene,
  SceneRenderProps,
  StageRect,
} from '@bjelser/kit';
import {useStage} from '@bjelser/kit';

// ---------------------------------------------------------------------------
// Per-type spec shape — the scene branch the mechanism plugin owns.
// ---------------------------------------------------------------------------

/**
 * One named position on the stage the motion visits. `kind` picks the visual:
 * `node` is the labelled card (default), `value` a numeric readout (used by
 * oscillate to show what is being compensated), `token` a small accent puck
 * (used by cycle motion paths). Position is normalized 0..1 on the stage.
 */
export interface MechanismPart {
  id: string;
  label: string;
  sub?: string;
  pos: {x: number; y: number};
  kind?: 'node' | 'value' | 'token';
}

/**
 * A motion primitive. Each variant is closed: the author names `kind` and the
 * parts the motion visits; the engine generates the loop procedurally over
 * `period` frames.
 *   cycle     — a token travels around a closed loop visiting parts in order
 *   oscillate — value bounces between two parts (e.g. a thermostat compensating)
 *   descend   — a marker walks down a gradient toward a low point
 *   iterate   — a counter ticks through named phases highlighting parts each
 */
export type MechanismMotion =
  | {kind: 'cycle'; path: string[]; period: number}
  | {kind: 'oscillate'; between: [string, string]; period: number}
  | {kind: 'descend'; from: string; to: string; period: number}
  | {
      kind: 'iterate';
      phases: {label: string; show: string[]}[];
      period: number;
    };

/**
 * A freeze directive — a beat can pause the motion at a specific phase to
 * narrate over it. `beatId` names the beat; `phase` is the integer step in
 * [0, length-of-loop): for `cycle` it indexes `path`, for `iterate` it
 * indexes `phases`, for `oscillate`/`descend` it is the half-step (0 = at
 * start, 1 = at end).
 */
export interface MechanismPhaseFreeze {
  beatId: string;
  phase: number;
}

/**
 * The per-spec shape this plugin's component consumes. Extends the kit's
 * shared `Scene` (id / type / beats / style) with mechanism-only fields.
 */
export interface MechanismScene extends Scene {
  type: 'mechanism';
  kicker?: string;
  heading?: string;
  parts?: MechanismPart[];
  motion?: MechanismMotion;
  freezes?: MechanismPhaseFreeze[];
}

// ---------------------------------------------------------------------------
// Local helpers — inlined from packages/engine. Self-contained so the plugin
// has no dependency on `@bjelser/engine`. Phase D will replace these with the
// kit's shared layout/palette/timing utilities; the values are preserved
// byte-equivalently from v2.5.x.
// ---------------------------------------------------------------------------

/**
 * The drawable stage — the rectangle within the canvas where diagrams
 * live. The legacy 16:9 numbers ({x:235, y:338, w:1450, h:560}) remain the
 * module-level fallback for pure helpers; the rendered scene reads the
 * aspect-aware STAGE via `useStage()` (kit) inside the component body.
 */
const STAGE = {x: 235, y: 338, w: 1450, h: 560};

/** Translucent accent fill, for glows and panel washes. */
const glow = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
};

/** The universal accent fallback table — every preset re-declares these. */
const FALLBACK_ACCENTS = {
  blue: '#5cb6ff',
  cyan: '#3fe0d0',
  green: '#5fe8a4',
  amber: '#ffc24d',
  rose: '#ff7d97',
  violet: '#b69cff',
} as const;

/**
 * Resolve the scene's chrome accent hex against the resolved style's accent
 * table. Without a palette (the v2.4.0+ default state of every caller) this
 * is exactly `style.tokens.accent.blue`.
 */
const sceneAccentHex = (style: ResolvedStyle): string => {
  const table = style.tokens.accent as unknown as Record<string, string>;
  return table.blue ?? FALLBACK_ACCENTS.blue;
};

/**
 * The per-part accent key. Without a palette this is the default `blue`;
 * each part inherits the scene chrome. (The v2.4.0+ scene knobs no longer
 * carry palette/accent overrides, so the resolver simplifies to the table
 * lookup the engine performed.)
 */
const partAccentKey = (_order: number): string => 'blue';

/**
 * Beat-window record — the runtime shape every scene component reads.
 * Mirrors `BeatTimelineSlot` from the kit's protocols (the field names map
 * 1:1 onto `startFrame`/`frames`/`beat`).
 */
interface BeatWindow {
  startFrame: number;
  frames: number;
  beat: Beat;
}

/** Which beat is on screen at a given (scene-relative) frame. */
const activeBeatIndex = (beats: ReadonlyArray<BeatWindow>, frame: number): number => {
  for (let i = beats.length - 1; i >= 0; i--) {
    const slot = beats[i];
    if (slot && frame >= slot.startFrame) return i;
  }
  return 0;
};

// ---------------------------------------------------------------------------
// Chrome — minimal local frame + per-beat narration. Phase D wires the
// shared `SceneFrame` + `Narration` overlays via FeaturePlugin.wrapRender;
// the local stubs here preserve the structural shape so the component reads
// the same against tests.
// ---------------------------------------------------------------------------

interface SceneFrameProps {
  style: ResolvedStyle;
  accentHex: string;
  kicker?: string | undefined;
  heading?: string | undefined;
  sceneIndex: number;
  sceneCount: number;
  children?: React.ReactNode;
}

const SceneFrame: React.FC<SceneFrameProps> = ({
  style,
  accentHex,
  kicker,
  heading,
  sceneIndex,
  sceneCount,
  children,
}) => {
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  // Aspect-aware STAGE — chrome margins scale with the aspect ratio so
  // portrait / square renders don't crop the heading band.
  const stage = useStage();
  // Heading position — in 16:9 the original top is 140; in portrait the
  // safe band is narrower so we land higher (80) to give the body room.
  const headingTop = stage.worldH === 1920 ? 80 : 140;
  return (
    <AbsoluteFill style={{background: bg.base}}>
      {/* kicker / heading / scene-count chrome */}
      <div
        style={{
          position: 'absolute',
          left: stage.x,
          top: headingTop,
          right: stage.x,
          color: ink.mid,
          fontFamily: sansFamily,
        }}
      >
        {kicker ? (
          <div
            style={{
              fontSize: 18,
              color: accentHex,
              letterSpacing: 4,
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {kicker}
          </div>
        ) : null}
        {heading ? (
          <div
            style={{
              fontSize: 56,
              color: ink.hi,
              fontWeight: 600,
              letterSpacing: -1,
              lineHeight: 1.1,
              marginTop: 12,
            }}
          >
            {heading}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: 'absolute',
          right: stage.x,
          top: 80,
          fontSize: 12,
          fontFamily: style.tokens.typography.family.mono,
          color: ink.low,
          letterSpacing: 2,
        }}
      >
        {String(sceneIndex + 1).padStart(2, '0')} / {String(sceneCount).padStart(2, '0')}
      </div>
      {children}
    </AbsoluteFill>
  );
};

/**
 * Beat-narration audio overlay. Renders one `<Sequence>` per beat whose beat
 * record carries an `audio` field (populated by the TTS stage). When no audio
 * is yet attached the component renders nothing and the film plays silent.
 */
const Narration: React.FC<{
  style: ResolvedStyle;
  beats: ReadonlyArray<BeatWindow>;
}> = ({beats, style}) => {
  void style;
  return (
    <>
      {beats.map((slot) => {
        const audio = (slot.beat as Record<string, unknown>).audio as
          | string
          | null
          | undefined;
        if (!audio) return null;
        return (
          <Sequence
            key={slot.beat.id ?? `b-${slot.startFrame}`}
            from={slot.startFrame}
            durationInFrames={slot.frames}
            name={`♪ ${slot.beat.id ?? ''}`}
          >
            <Audio src={staticFile(audio)} />
          </Sequence>
        );
      })}
    </>
  );
};

interface FittedTextProps {
  text: string;
  maxWidth: number;
  basePx: number;
  floorPx: number;
  charAdvance: number;
  mode: 'shrink-single' | 'shrink-wrap';
  maxLines?: number;
  lineHeight?: number;
  style?: React.CSSProperties;
}

/**
 * Auto-fit text. Computes a target font-size from the character count vs.
 * the declared advance ratio so long values shrink to fit, clamped between
 * `floorPx` and `basePx`. The original engine FittedText branches on `mode`
 * for wrap-vs-single-line; both branches share the same shrink rule.
 */
const FittedText: React.FC<FittedTextProps> = ({
  text,
  maxWidth,
  basePx,
  floorPx,
  charAdvance,
  mode,
  maxLines,
  lineHeight,
  style,
}) => {
  const widthPerChar = basePx * charAdvance;
  const fitOneLine = Math.floor(maxWidth / widthPerChar);
  let px = basePx;
  if (mode === 'shrink-single') {
    if (text.length > fitOneLine) {
      px = Math.max(floorPx, (maxWidth / text.length) / charAdvance);
    }
  } else {
    const lines = Math.max(1, Math.ceil(text.length / fitOneLine));
    const allowed = maxLines ?? 2;
    if (lines > allowed) {
      px = Math.max(floorPx, (maxWidth * allowed) / (text.length * charAdvance));
    }
  }
  return (
    <div
      style={{
        fontSize: px,
        lineHeight: lineHeight ?? 1.2,
        whiteSpace: mode === 'shrink-single' ? 'nowrap' : 'normal',
        overflow: 'hidden',
        ...style,
      }}
    >
      {text}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component — the mechanism renderer. Animation math is preserved verbatim
// from packages/engine/src/scenes/MechanismScene.tsx.
// ---------------------------------------------------------------------------

// Normalize a 0..1 position over the STAGE rectangle. Parts in a spec carry
// `pos: {x, y}` with both in 0..1; here we resolve them to pixel coords
// inside the (aspect-aware) STAGE — `stage` is whatever `useStage()` returns
// for the current composition.
const partXY = (p: MechanismPart, stage: StageRect): {x: number; y: number} => ({
  x: stage.x + Math.max(0, Math.min(1, p.pos.x)) * stage.w,
  y: stage.y + Math.max(0, Math.min(1, p.pos.y)) * stage.h,
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
  const local = Math.max(0, frame - freezeStart);
  const period = Math.max(1, motion.period);
  const through = (local / period) * len;
  const phase = Math.floor(through) % len;
  const t = through - Math.floor(through);
  return {phase, t};
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const Component: React.FC<SceneRenderProps<MechanismScene>> = ({
  scene,
  common,
}) => {
  const {ts, sceneIndex, sceneCount, style} = common as CommonSceneProps;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  // Aspect-aware STAGE — 16:9 returns the legacy band; 9:16 / 1:1 each
  // return their own narrower rectangle. Shadows the module-level STAGE
  // constant inside this component body so all geometry below picks up
  // the right STAGE for the current composition.
  const STAGE = useStage();

  const accentHex = sceneAccentHex(style);
  const parts: MechanismPart[] = scene.parts ?? [];
  const motion = scene.motion;
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;
  const accentMap = style.tokens.accent as unknown as Record<string, string>;

  // Beat windows — the kit's BeatTimelineSlot[]. The local helpers read
  // {startFrame, frames, beat} fields, so cast through the kit type.
  const beats: ReadonlyArray<BeatWindow> = (ts.beats as ReadonlyArray<BeatWindow>) ?? [];

  // Look up part by id once for cheap lookups inside the motion math.
  const partById = new Map<string, MechanismPart>();
  parts.forEach((p) => partById.set(p.id, p));

  // ----- freezes — beat-level pauses on a named phase ----------------------
  const freezes = scene.freezes ?? [];
  const active = activeBeatIndex(beats, frame);
  const activeBeat = beats[active]?.beat;
  const activeFreeze = activeBeat
    ? freezes.find((f) => f.beatId === activeBeat.id)
    : undefined;
  let freezeStart = 0;
  for (let i = 0; i < active; i++) {
    const slot = beats[i];
    if (!slot) continue;
    const b = slot.beat;
    const fz = freezes.find((f) => f.beatId === b.id);
    if (fz) {
      freezeStart = slot.startFrame + slot.frames;
    }
  }

  // No motion to draw — just render an empty diagram skeleton.
  if (!motion || parts.length === 0) {
    return (
      <SceneFrame
        style={style}
        accentHex={accentHex}
        kicker={scene.kicker}
        heading={scene.heading}
        sceneIndex={sceneIndex}
        sceneCount={sceneCount}
      >
        <Narration style={style} beats={beats} />
      </SceneFrame>
    );
  }

  const {phase, t} = motionPhase(
    motion,
    frame,
    activeFreeze ? activeFreeze.phase : null,
    freezeStart,
  );

  // Per-motion: resolve the (from, to) pair the moving marker travels between
  // AT THIS PHASE, and the active part ids (the ones the motion is visibly
  // touching right now — used to brighten their cards).
  type Step = {
    fromId: string | null;
    toId: string | null;
    activeIds: Set<string>;
  };
  const step: Step = (() => {
    const empty: Step = {fromId: null, toId: null, activeIds: new Set()};
    switch (motion.kind) {
      case 'cycle': {
        const ids = motion.path;
        if (ids.length === 0) return empty;
        const a = ids[phase % ids.length]!;
        const b = ids[(phase + 1) % ids.length]!;
        return {fromId: a, toId: b, activeIds: new Set([a, b])};
      }
      case 'oscillate': {
        const [a, b] = motion.between;
        const fromId = phase === 0 ? a : b;
        const toId = phase === 0 ? b : a;
        return {fromId, toId, activeIds: new Set([a, b])};
      }
      case 'descend': {
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
    const ap = partXY(a, STAGE);
    const bp = partXY(b, STAGE);
    let tt = t;
    if (motion.kind === 'descend') {
      tt = phase === 1 ? 1 : 1 - Math.pow(1 - t, 1.8);
    } else if (motion.kind === 'oscillate') {
      tt = 0.5 - 0.5 * Math.cos(Math.PI * t);
    }
    return {x: lerp(ap.x, bp.x, tt), y: lerp(ap.y, bp.y, tt)};
  })();

  // Whole-scene fade-in (the chart/figure intro shape).
  const intro = spring({frame, fps, config: {damping: 200, mass: 0.7}});

  // The colour resolution per part: resolved against the style tokens' accent
  // map so a preset that redefines a hue is honoured.
  const partAccentHex = (_p: MechanismPart, order: number): string => {
    const key = partAccentKey(order);
    const fromMap = accentMap[key] ?? accentMap.blue;
    return fromMap ?? FALLBACK_ACCENTS.blue;
  };

  // ----- the active-phase label -------------------------------------------
  const phaseLabel: string | null =
    motion.kind === 'iterate'
      ? motion.phases[phase % motion.phases.length]?.label ?? null
      : null;

  // A breathing pulse on the active parts.
  const t01 = (frame / fps) % 1;
  const breathe = 0.5 + 0.5 * Math.sin(t01 * Math.PI * 2);

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <AbsoluteFill>
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
          viewBox={`0 0 ${STAGE.worldW} ${STAGE.worldH}`}
        >
          {/* ---- the loop path (cycle motion) ---- */}
          {motion.kind === 'cycle' && motion.path.length >= 2 && (
            <g opacity={0.55 * intro}>
              {motion.path.map((id, i) => {
                const a = partById.get(id);
                const next = motion.path[(i + 1) % motion.path.length];
                const b = next ? partById.get(next) : undefined;
                if (!a || !b) return null;
                const ap = partXY(a, STAGE);
                const bp = partXY(b, STAGE);
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
                  const a = partById.get(step.fromId!);
                  const b = partById.get(step.toId!);
                  if (!a || !b) return null;
                  const ap = partXY(a, STAGE);
                  const bp = partXY(b, STAGE);
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
          const xy = partXY(p, STAGE);
          const col = partAccentHex(p, i);
          const isActive = step.activeIds.has(p.id);
          const kind = p.kind ?? 'node';
          if (kind === 'token') {
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
              // Land below the last part row. In 16:9 STAGE.y+STAGE.h = 898,
              // worldH - 220 = 860 — close enough that the legacy hand-tuned
              // bottom:220 sits a hair above the diagram's bottom. Compute
              // from STAGE so portrait / square place this in the gap below
              // the diagram instead of on top of the bottom-row card.
              bottom: STAGE.worldH - (STAGE.y + STAGE.h) - 8,
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

      <Narration style={style} beats={beats} />
    </SceneFrame>
  );
};

export default Component;
