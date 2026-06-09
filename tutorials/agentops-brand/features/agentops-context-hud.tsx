// agentopsContextHud — the FIRST third-party FeaturePlugin shipped on docent.
//
// R15.3 — the persistent observability HUD: a small ticker in the bottom-left
// (trace_id, span breadcrumb, stability dot) on every scene.
//
// R16.4 — the **emotional throughline**. The HUD's stability ratio is no
// longer a corner cue; it is the film's **physical sensation**. Three layers
// compose:
//
//   1. The corner HUD (R15.3, unchanged in spirit) — trace id, span breadcrumb,
//      and a stability dot. The dot now PULSES at the alert level (< 0.85),
//      so the eye is pulled to it the way a real on-call console would draw
//      it during an incident.
//
//   2. A **full-frame stain overlay** (the room's lighting changes) — a
//      pale-amber-to-deep-warm-red radial gradient laid over the WHOLE scene
//      via `mix-blend-mode: overlay`. At healthy (≥ 0.92) it is invisible; at
//      concern (0.85-0.91) it warms the edges of the frame; at alert (< 0.85)
//      it casts a strong amber-red wash across the canvas. A SECOND radial
//      acts as an additional vignette ring that *tightens* as stability
//      drops — so the frame closes in around the viewer.
//
//   3. A **low-frequency rumble** (the audio's gut-feel) — a 50 Hz sine wave
//      (~ -36 dBFS) fades in across alert scenes and out again at recovery.
//      Below conscious-hearing threshold on most laptop speakers; felt as
//      pressure on a real monitor. The intent is sub-perceptual; if you can
//      consciously hear the rumble, the mix has gone too far.
//
//   4. (Coupled — see audio-bed/component.tsx) The film's music bed *ducks
//      harder* during low-stability scenes. The bed reads the SAME
//      `meta.featureOptions.agentopsContextHud.stability` array this plugin
//      exposes — a one-way coupling we document as "v1 tactical" with the
//      generalized side channel (`meta.audioMix.duckCurve`) noted as the
//      path-B follow-up.
//
// The thresholds and curves are EXPORTED so the audio-bed feature reads them
// off the same math table the visual layer uses — one source of truth.
//
// ── Why `wrapsScenes`, not `wrapsFilm` (for the stain)? ────────────────────
//
// Both would render every frame. The decisive difference is where the
// composition mounts them:
//
//   - `wrapsFilm`   — once, OUTSIDE the per-scene `<Sequence>` stack. The
//                     overlay sees ABSOLUTE film frames. Good for continuous
//                     overlays that should never restart (a music bed, the
//                     rumble track). Bad for per-scene state — we'd have to
//                     bucket the absolute frame back into a scene index
//                     manually.
//
//   - `wrapsScenes` — mounts INSIDE each scene's `<Sequence>` alongside the
//                     scene component. Receives `sceneIndex` / `sceneCount`
//                     directly; `useCurrentFrame` is scene-relative.
//
// The HUD + stain are per-scene; the rumble is film-scoped. So this plugin
// uses BOTH hooks — `wrapsScenes` for the corner HUD and the stain; `wrapsFilm`
// for the rumble. The kit's composition mounts each at its proper site.
//
// ── How does the plugin know the "current span" / stability? ───────────────
//
// SceneFeatureProps carries `sceneIndex` and `meta`, but NOT the scene's id
// or its spec body. We use the kit's `meta.featureOptions` side channel: the
// meta schema is `additionalProperties: true` precisely for plugin-owned
// bags. This plugin owns `featureOptions.agentopsContextHud`, declares its
// shape via `HudOptions`, and reads it at render time.
//
// The side-channel pattern is what a real third-party FeaturePlugin author
// reaches for: declare a namespaced bag on `meta`, document the shape, and
// look it up at render time. The cost is one indirection in the spec; the
// benefit is the kit stays closed.

import React from 'react';
import {AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame} from 'remotion';

import type {
  FeaturePlugin,
  FilmFeatureProps,
  FilmMeta,
  ResolvedStyle,
  SceneFeatureProps,
} from '@bjelser/kit';

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * The six span types from the AgentOps runbook taxonomy. The breadcrumb
 * surfaces one per scene as `plan_step ▸ <span>`. `plan_step` is always
 * the root — it's the cognitive frame the viewer sits inside.
 */
export type SpanKind =
  | 'plan_step'
  | 'llm_call'
  | 'tool_call'
  | 'agent_decision'
  | 'flow_checkpoint'
  | 'hallucination'
  | 'recap'
  | 'taxonomy'
  | 'instrument';

/**
 * Default per-scene span the breadcrumb shows, indexed by sceneIndex. Sized
 * for the 9-scene lunch-and-learn arc; shorter films just see the first N.
 * Override via `meta.featureOptions.agentopsContextHud.spans`.
 */
const DEFAULT_SPANS_BY_INDEX: ReadonlyArray<SpanKind> = [
  'plan_step',      // 0: s-frame
  'llm_call',       // 1: s-passage — the runbook page
  'taxonomy',       // 2: s-figure — the taxonomy diagram
  'llm_call',       // 3: s-waterfall — the trace
  'tool_call',      // 4: s-demo-overview — the fleet
  'instrument',     // 5: s-closeup — the python contract
  'agent_decision', // 6: s-tension — when not to ship (the trade-off)
  'flow_checkpoint',// 7: s-demo-flow — the killer panel
  'recap',          // 8: s-recap
];

/**
 * Default stability ratio per scene — the gauge's "live" curve. Picked so
 * the viewer can read the drop:
 *
 *   0.94 → 0.96 → 0.95 → 0.93 → 0.91 → 0.88 → 0.83 → 0.89 → 0.93
 *
 * Healthy at the open, sags through the demo, *drops to amber* at scene 5
 * (closeup — concern level), *crashes to red* at scene 6 (tension — the
 * trade-off scene the film must make the viewer feel), recovers through the
 * killer panel + recap.
 *
 * Override via `meta.featureOptions.agentopsContextHud.stability`.
 */
const DEFAULT_STABILITY_BY_INDEX: ReadonlyArray<number> = [
  0.94, 0.96, 0.95, 0.93, 0.91, 0.88, 0.83, 0.89, 0.93,
];

/**
 * Scenes the HUD reads as "most relevant" — bumps opacity from the
 * baseline (0.6) to the focused level (0.85). Indexed by sceneIndex.
 *
 * Override via `meta.featureOptions.agentopsContextHud.focusedSceneIndices`.
 */
const DEFAULT_FOCUSED_INDICES: ReadonlySet<number> = new Set([3, 7]);

/**
 * A short fake trace id — same every render so the metaphor is stable.
 * Override via `meta.featureOptions.agentopsContextHud.traceId`.
 */
const DEFAULT_TRACE_ID = '4a7c…b2f1';

// ── R16.4 — the stability → treatment math table ───────────────────────────
//
// One source of truth for the stain layer (rendered here), the corner-HUD
// pulse (rendered here), the rumble track (rendered here), and the music-bed
// duck (read by `packages/core/src/features/audio-bed/component.tsx`).
//
// The thresholds — 0.92 (healthy floor) and 0.85 (alert ceiling) — match the
// on-call gauge in the runbook. Everything else is linearly interpolated
// between the two anchors so the visual curve is smooth, not stepped — a
// scene at 0.88 reads as "halfway between concern and alert", not as "in
// the amber bucket".

/**
 * Stain opacity: 0 at healthy, ramps to 0.55 at full alert. The 0.55 cap
 * keeps the underlying scene content legible — overlay-blended warmth at
 * 0.55 noticeably tints, but you can still read text and trace structure
 * through it. A higher cap (we tried 0.70) makes the alert scene visually
 * unreadable.
 */
export function stabilityToStainOpacity(s: number): number {
  if (s >= 0.92) return 0;
  if (s <= 0.80) return 0.55;
  // Linear interpolation across the [0.80, 0.92] band.
  return ((0.92 - s) / (0.92 - 0.80)) * 0.55;
}

/**
 * Stain color: a temperature gradient from "pale amber" (just past healthy)
 * through "amber" (concern) to "deep warm red" (alert). The thresholds match
 * the corner-dot color rules so a viewer reading the dot color sees the
 * stain color tracking it. The intermediate breakpoint (0.88) is the
 * concern-floor color the closeup scene lands on.
 */
export function stabilityToStainColor(s: number): string {
  if (s >= 0.92) return 'transparent';
  if (s <= 0.80) return '#cc3a22'; // deep warm red — alert
  if (s <= 0.88) return '#d96b3a'; // amber — concern
  return '#deb054';                // pale amber — borderline
}

/**
 * Vignette tightening: 1.0 at healthy (no extra vignette), up to 1.5 at full
 * alert (the frame closes in by ~50%). The stain's secondary radial reads
 * this and scales its outer-darkness ring inward.
 */
export function stabilityToVignetteScale(s: number): number {
  if (s >= 0.92) return 1.0;
  if (s <= 0.80) return 1.5;
  return 1.0 + ((0.92 - s) / 0.12) * 0.5;
}

/**
 * Music-bed duck DELTA, in volume-multiplier space (multiplicative on the
 * bed's resolved per-frame volume). 1.0 means "no extra duck"; smaller
 * values pull the bed lower than its natural duck.
 *
 * Anchors:
 *   - s ≥ 0.92 → 1.0   (no extra duck)
 *   - s = 0.85 → 0.71  (≈ -3 dB extra duck)
 *   - s ≤ 0.80 → 0.50  (≈ -6 dB extra duck)
 *
 * Read by `audio-bed/component.tsx` via the same `featureOptions
 * .agentopsContextHud.stability` array — see that file for the application
 * point. Centralised here so the visual and audio treatments share one
 * mathematical truth.
 */
export function stabilityToMusicDuckGain(s: number): number {
  if (s >= 0.92) return 1.0;
  if (s <= 0.80) return 0.5;
  if (s >= 0.85) {
    // 0.85 → 0.71 ; 0.92 → 1.0 — linear in the [0.85, 0.92] band.
    return 0.71 + ((s - 0.85) / (0.92 - 0.85)) * (1.0 - 0.71);
  }
  // 0.80 → 0.50 ; 0.85 → 0.71 — linear in the [0.80, 0.85] band.
  return 0.5 + ((s - 0.80) / (0.85 - 0.80)) * (0.71 - 0.5);
}

/**
 * The namespace key on `meta.featureOptions` where the HUD plugin and the
 * audio-bed feature meet. Hoisted so the audio-bed (which lives in
 * `@bjelser/core`, not in the tutorial) can import the same key string
 * rather than re-typing it.
 */
export const FEATURE_OPTIONS_KEY = 'agentopsContextHud' as const;

/**
 * Threshold below which the rumble track fades in / the corner dot pulses.
 * Exported because the audio-bed uses it to decide whether to mount its
 * extra-duck pass at all.
 */
export const ALERT_THRESHOLD = 0.85 as const;

/**
 * Threshold below which the stain layer turns on. Above this is "healthy"
 * — no extra treatment at all.
 */
export const CONCERN_THRESHOLD = 0.92 as const;

// ── meta.featureOptions plumbing ───────────────────────────────────────────

/**
 * Side-channel options the plugin reads off `meta.featureOptions
 * .agentopsContextHud`. The kit's meta schema is `additionalProperties:
 * true`, so a film can scribble this bag without any schema change.
 *
 * Every field is optional — a film with no options bag still gets a
 * sensible HUD (the defaults above are tuned for the lunch-and-learn).
 */
export interface HudOptions {
  /** Override the displayed trace id. */
  readonly traceId?: string;
  /** Per-scene span override; `null` hides the breadcrumb on that scene. */
  readonly spans?: ReadonlyArray<SpanKind | null>;
  /** Per-scene stability ratio override (0..1). */
  readonly stability?: ReadonlyArray<number>;
  /** Per-scene indices the HUD should pop at higher opacity. */
  readonly focusedSceneIndices?: ReadonlyArray<number>;
  /**
   * R16.4 — turn off the full-frame stain treatment WHILE keeping the corner
   * HUD. Useful when the treatment would compete with the teaching subject.
   * Defaults to `false` (treatment ON).
   */
  readonly stainDisabled?: boolean;
  /**
   * R16.4 — explicit override of the rumble track URL. Defaults to
   * `agentops-rumble.wav` (resolved under `<publicDir>/audio/`).
   */
  readonly rumbleUrl?: string;
  /**
   * R16.4 — turn off the rumble track entirely while keeping the visual
   * treatment. Defaults to `false` (rumble ON when any scene is < 0.85).
   */
  readonly rumbleDisabled?: boolean;
  /**
   * R16.4 — base volume the rumble track plays at when fully faded in.
   * Multiplicative on top of the source file's intrinsic level. Defaults
   * to 1.0; lower for tinny laptop monitors that don't reproduce 50 Hz
   * cleanly anyway.
   */
  readonly rumbleVolume?: number;
}

/**
 * Defensive read of the HUD options bag. Public so the audio-bed feature
 * can share the same parser when it reads the stability curve — there is
 * exactly one place the bag is parsed.
 */
export const readHudOptions = (meta: FilmMeta): HudOptions => {
  const raw = (meta as unknown as {
    featureOptions?: Record<string, unknown>;
  }).featureOptions?.[FEATURE_OPTIONS_KEY];
  if (!raw || typeof raw !== 'object') return {};
  return raw as HudOptions;
};

/**
 * Resolve the stability value for a given scene, applying the
 * defaults-then-overrides cascade. Public so the audio-bed feature can
 * share the same resolution rules — and so a film that disables the HUD
 * still gets a sensible curve for the audio side.
 */
export const resolveStability = (
  meta: FilmMeta,
  sceneIndex: number,
): number => {
  const opts = readHudOptions(meta);
  const arr = opts.stability ?? DEFAULT_STABILITY_BY_INDEX;
  return arr[sceneIndex] ?? arr[arr.length - 1] ?? 0.95;
};

// ── Visual helpers ─────────────────────────────────────────────────────────

/**
 * Stability dot colour. The thresholds match how an on-call engineer reads
 * the gauge in the runbook: green ≥0.92 (healthy), amber 0.85-0.91 (watch),
 * red <0.85 (act).
 */
const stabilityColor = (ratio: number, style: ResolvedStyle): string => {
  const {accent} = style.tokens;
  if (ratio >= CONCERN_THRESHOLD) return accent.green;
  if (ratio >= ALERT_THRESHOLD) return accent.amber;
  return accent.rose;
};

const spanLabel = (kind: SpanKind): string => kind;

// ── The full-frame stain overlay ───────────────────────────────────────────

/**
 * The stain layer. Two stacked radial gradients:
 *
 *   1. The "warmth" radial — pale amber → amber → deep warm red, blended
 *      via `mix-blend-mode: overlay`. Overlay multiplies highlights and
 *      screens shadows on the underlying scene; the practical effect on a
 *      navy-dominated panel is a noticeable warm cast that REVEALS rather
 *      than HIDES the content — text stays readable while the room
 *      temperature changes.
 *
 *   2. The "tightened vignette" radial — a pure-black ring that closes in
 *      as stability drops. This stacks ABOVE the warmth and below the HUD,
 *      with `mix-blend-mode: multiply` so it darkens edges without affecting
 *      the centre. SceneFrame's own vignette is preset-fixed at 1.0 — this
 *      second ring is the per-scene modulation we can do WITHOUT editing
 *      every scene component.
 *
 * `pointer-events: none` on both so click handlers in the Remotion studio
 * still target the scene below.
 */
const StainOverlay: React.FC<{stability: number; disabled?: boolean}> = ({
  stability,
  disabled,
}) => {
  if (disabled) return null;
  const stainOpacity = stabilityToStainOpacity(stability);
  if (stainOpacity <= 0) return null;
  const stainColor = stabilityToStainColor(stability);
  const vignetteScale = stabilityToVignetteScale(stability);
  // Vignette ring inner-radius shrinks as scale grows: at scale 1.0 the
  // ring starts at 60% of the canvas (a soft edge darken); at scale 1.5
  // it starts at 36% (a much tighter close-in).
  const vignetteInnerPct = Math.round(60 / vignetteScale);
  // Vignette ring strength tracks stability — at healthy the ring is
  // invisible (opacity 0); at alert it's ~0.5.
  const vignetteOpacity = Math.max(
    0,
    Math.min(0.5, ((CONCERN_THRESHOLD - stability) / 0.12) * 0.5),
  );
  // The dual-layer warmth: a `screen`-blended pass lifts the dark navy ground
  // up into the warm-temperature range (so the room *gets brighter on the
  // warm side*), then a `normal`-blended pass at low opacity adds the
  // saturation that the screen-blend lacks at the edges. Tried alternatives:
  //
  //   - `overlay` alone — almost invisible against the agentops navy. Overlay
  //     darkens dark inputs and only kicks in past the 0.5 brightness floor;
  //     the scene's background sits at ~0.08 brightness so the overlay does
  //     nothing structurally helpful.
  //   - `multiply` alone — everything goes dim, no warmth at all.
  //   - `soft-light` — too subtle to read at thumbnail scale.
  //
  // The screen + normal hybrid lands the temperature shift legibly without
  // turning text unreadable: the `screen` lifts the navy toward the warm
  // chroma WHERE it's already dark; the `normal`-blended overlay at reduced
  // opacity adds saturation on the lit panel surfaces.
  const screenOpacity = stainOpacity; // full mapped opacity for the screen pass
  const normalOpacity = stainOpacity * 0.4; // 40% reduction for the normal pass
  return (
    <>
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: `radial-gradient(ellipse at center, ${stainColor}40 0%, ${stainColor} 100%)`,
          opacity: screenOpacity,
          mixBlendMode: 'screen',
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: `radial-gradient(ellipse at center, transparent 30%, ${stainColor} 100%)`,
          opacity: normalOpacity,
        }}
      />
      {vignetteOpacity > 0 ? (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            background: `radial-gradient(ellipse at center, transparent ${vignetteInnerPct}%, #000 100%)`,
            opacity: vignetteOpacity,
            mixBlendMode: 'multiply',
          }}
        />
      ) : null}
    </>
  );
};

// ── The HUD component ──────────────────────────────────────────────────────

/**
 * The HUD lives in the bottom-left at `left: 122`. Width capped at 180px
 * so it never bleeds into the scene's working area.
 *
 * R16.4: when stability < 0.85 the dot PULSES — a 1.6s sine modulation on
 * both opacity (0.55 ↔ 1.0) and box-shadow blur (4 ↔ 14px). The pulse rate
 * is slow enough to read as "anxious heartbeat" rather than blinking
 * notification spam.
 */
const HudOverlay: React.FC<SceneFeatureProps> = ({sceneIndex, meta, style}) => {
  const opts = readHudOptions(meta);
  const frame = useCurrentFrame();

  const traceId = opts.traceId ?? DEFAULT_TRACE_ID;

  const spans = opts.spans ?? DEFAULT_SPANS_BY_INDEX;
  const span = spans[sceneIndex] ?? null;

  const ratio = resolveStability(meta, sceneIndex);

  const focusedSet = opts.focusedSceneIndices
    ? new Set(opts.focusedSceneIndices)
    : DEFAULT_FOCUSED_INDICES;
  const opacity = focusedSet.has(sceneIndex) ? 0.85 : 0.6;

  const {ink, accent, typography} = style.tokens;
  const dot = stabilityColor(ratio, style);

  // R16.4: pulse the stability dot when at alert. The animation cycle is
  // 48 frames at 30fps = 1.6s — anxious heartbeat, not notification blink.
  const isAlert = ratio < ALERT_THRESHOLD;
  const pulsePhase = isAlert
    ? (Math.sin((frame / 48) * Math.PI * 2) + 1) / 2 // [0, 1]
    : 0.5;
  const dotOpacity = isAlert ? 0.55 + 0.45 * pulsePhase : 1.0;
  const dotGlowBlur = isAlert ? 4 + 10 * pulsePhase : 6;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: 122,
          bottom: 110,
          width: 180,
          opacity,
          fontFamily: typography.family.mono,
          color: ink.mid,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{fontSize: 12, letterSpacing: 0.3, lineHeight: 1.2}}>
          <span style={{color: ink.faint}}>trace_id:&nbsp;</span>
          <span style={{color: ink.mid}}>{traceId}</span>
        </div>

        <div style={{fontSize: 13, lineHeight: 1.2, color: ink.mid}}>
          <span style={{color: accent.violet}}>plan_step</span>
          {span && span !== 'plan_step' ? (
            <>
              <span style={{color: ink.faint, margin: '0 5px'}}>▸</span>
              <span>{spanLabel(span)}</span>
            </>
          ) : null}
        </div>

        <div
          style={{
            fontSize: 12,
            lineHeight: 1.2,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: ink.faint,
          }}
        >
          <span>stability</span>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 999,
              background: dot,
              opacity: dotOpacity,
              boxShadow: `0 0 ${dotGlowBlur}px ${dot}`,
            }}
          />
          <span style={{color: ink.mid, fontVariantNumeric: 'tabular-nums'}}>
            {ratio.toFixed(2)}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * The `wrapsScenes` component the plugin registers. Stacks the stain
 * overlay BELOW the corner HUD so the HUD always reads on top of the
 * temperature treatment.
 */
const SceneOverlay: React.FC<SceneFeatureProps> = (props) => {
  const opts = readHudOptions(props.meta);
  const stability = resolveStability(props.meta, props.sceneIndex);
  return (
    <>
      <StainOverlay
        stability={stability}
        {...(opts.stainDisabled !== undefined
          ? {disabled: opts.stainDisabled}
          : {})}
      />
      <HudOverlay {...props} />
    </>
  );
};

// ── The rumble track (wrapsFilm) ───────────────────────────────────────────

/**
 * Resolve the rumble URL the way `staticFile` resolves any audio asset —
 * bare filename → `audio/<file>`; explicit path → as-is.
 */
const resolveRumbleUrl = (url: string): string => {
  if (/^https?:\/\//i.test(url)) return url;
  const rel = url.includes('/') ? url : `audio/${url}`;
  return staticFile(rel);
};

/**
 * Derive per-scene start/end frame windows from the `beats` list. We use
 * beats (always present) rather than `sceneClusters` (optional) so the
 * rumble works on every cascade output.
 */
const sceneFrameWindows = (
  beats: FilmFeatureProps['beats'],
  totalFrames: number,
): ReadonlyArray<{sceneIndex: number; start: number; end: number}> => {
  const byScene = new Map<number, {start: number; end: number}>();
  for (const b of beats) {
    const end = b.startFrame + b.frames;
    const prev = byScene.get(b.sceneIndex);
    if (!prev) {
      byScene.set(b.sceneIndex, {start: b.startFrame, end});
      continue;
    }
    byScene.set(b.sceneIndex, {
      start: Math.min(prev.start, b.startFrame),
      end: Math.max(prev.end, end),
    });
  }
  const out: {sceneIndex: number; start: number; end: number}[] = [];
  for (const [sceneIndex, win] of byScene) {
    out.push({sceneIndex, start: win.start, end: Math.min(win.end, totalFrames)});
  }
  out.sort((a, b) => a.sceneIndex - b.sceneIndex);
  return out;
};

/**
 * The `wrapsFilm` rumble layer. Mounts a single `<Audio>` for the 50 Hz
 * drone and tweens its volume per frame.
 *
 * Volume curve: 0 outside any alert scene; ramp UP for 18 frames at the
 * scene boundary, hold at base rumble volume, ramp DOWN for 18 frames at
 * exit. The fade smooths the boundary so the rumble doesn't appear with
 * a click when the closeup→tension cut lands.
 */
const RumbleOverlay: React.FC<FilmFeatureProps> = ({meta, totalFrames, beats}) => {
  const opts = readHudOptions(meta);
  // Hooks must come BEFORE early returns to satisfy React's rules-of-hooks.
  // Compute per-scene alert windows from the beats list + the meta-resolved
  // stability curve. Memoised on meta + beats — the inputs don't change
  // within a film render, so this is effectively a one-shot compute.
  const windows = React.useMemo(() => {
    const scenes = sceneFrameWindows(beats, totalFrames);
    const alert: {start: number; end: number}[] = [];
    for (const s of scenes) {
      const stab = resolveStability(meta, s.sceneIndex);
      if (stab < ALERT_THRESHOLD) {
        alert.push({start: s.start, end: s.end});
      }
    }
    return alert;
  }, [beats, meta, totalFrames]);

  // Touch useCurrentFrame so Remotion re-evaluates each frame — same idiom
  // as the audio-bed. Also called before any conditional return.
  useCurrentFrame();

  if (opts.rumbleDisabled) return null;
  if (windows.length === 0) return null;

  const url = resolveRumbleUrl(opts.rumbleUrl ?? 'agentops-rumble.wav');
  const baseVolume = opts.rumbleVolume ?? 1.0;
  const rampFrames = 18;

  const volumeFor = (frame: number): number => {
    let v = 0;
    for (const {start, end} of windows) {
      if (frame < start - rampFrames || frame > end + rampFrames) continue;
      const lifted = interpolate(
        frame,
        [start - rampFrames, start, end, end + rampFrames],
        [0, baseVolume, baseVolume, 0],
        {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
      );
      if (lifted > v) v = lifted;
    }
    return v;
  };

  // NOTE: no `loop` prop on the <Audio> below. Remotion v4's <Audio loop>
  // works in the studio preview but the renderer's asset extractor in our
  // current version only emits ONE asset position per <Audio>, so a short
  // looped source effectively plays once and goes silent. The rumble WAV
  // is sized at 600s to cover the whole film without needing the loop
  // attribute. Documented as friction note #3 in the R16.4 retro.
  return <Audio src={url} volume={volumeFor} endAt={totalFrames} />;
};

// ── Plugin descriptor ──────────────────────────────────────────────────────

export const agentopsContextHud: FeaturePlugin = {
  kind: 'feature',
  name: 'agentops-context-hud',
  version: '0.2.0',

  // Per-scene: the stain overlay + corner HUD. Mounts INSIDE each scene's
  // Sequence so `useCurrentFrame` is scene-relative — the pulse animation
  // restarts at every scene boundary, which is what we want for the corner
  // dot.
  wrapsScenes: SceneOverlay,

  // Film-scope: the rumble drone. Mounts ONCE outside the per-scene
  // sequence stack so the audio doesn't restart at boundaries. The volume
  // selector reads absolute frames and gates by per-scene alert windows.
  wrapsFilm: RumbleOverlay,
};

export default agentopsContextHud;
