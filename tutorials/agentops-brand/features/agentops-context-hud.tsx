// agentopsContextHud — the FIRST third-party FeaturePlugin shipped on docent.
//
// The lunch-and-learn metaphor: the viewer is *watching* a live agent trace
// the whole time the film plays. This plugin paints a small, persistent
// observability HUD in the bottom-left of every scene — a trace id badge,
// the current span breadcrumb, and a stability-ratio dot that drifts as the
// film progresses.
//
// Three teaching purposes:
//
//   1. Prove that the FeaturePlugin contract carries a third-party concern
//      (a cross-cutting visual overlay) without any change to @bjelser/core
//      and without forking the scene plugins. The kit's `wrapsScenes` hook
//      is the load-bearing seam.
//
//   2. Stitch the film's recurring metaphor onto every frame. The runbook's
//      span taxonomy lives in the brand pack; this plugin pulls those same
//      colours through and makes the abstraction *visible* — instead of
//      "imagine a trace", the viewer is *looking* at one (synthetic, but
//      legible).
//
//   3. Give the stability dot enough drift to *teach* the gauge. Scene 6
//      ("when this does not apply") drops to 0.83 — amber-red — then the
//      flow demo and recap recover. A viewer who notices the dot dimming
//      during the trade-off scene has learned the metaphor without a word
//      of narration about it.
//
// ── Why `wrapsScenes`, not `wrapsFilm`? ────────────────────────────────────
//
// Both would render every frame. The decisive difference is where the
// composition mounts them:
//
//   - `wrapsFilm`   — once, OUTSIDE the per-scene `<Sequence>` stack. The
//                     overlay sees ABSOLUTE film frames (`useCurrentFrame`
//                     returns 0…totalFrames). Good for continuous overlays
//                     that should never restart (a music bed, a watermark).
//                     Bad for per-scene state — we'd have to bucket the
//                     absolute frame back into a scene index manually.
//
//   - `wrapsScenes` — mounts INSIDE each scene's `<Sequence>` alongside the
//                     scene component. Receives `sceneIndex` / `sceneCount`
//                     directly; `useCurrentFrame` is scene-relative.
//
// The HUD's per-scene span + per-scene stability ratio are scene-derived.
// `wrapsScenes` hands us `sceneIndex` for free, so the obvious choice. The
// trade-off: the HUD restarts its mount tree at every scene boundary — fine,
// it has no state that needs to survive the cut.
//
// ── How does the plugin know the "current span"? ───────────────────────────
//
// SceneFeatureProps carries `sceneIndex` and `meta`, but NOT the scene's id
// or its spec body. Three options the kit's contract supports:
//
//   a) Extend CommonSceneProps with a `span?: SpanKind` hint that the kit
//      threads through. — Invasive; widens the kit's public surface for one
//      feature. Wrong tier.
//
//   b) Extend SceneFeatureProps with the raw scene spec. — Also invasive;
//      same problem.
//
//   c) Read a per-scene map keyed by index off `meta.featureOptions`. The
//      meta schema is `additionalProperties: true` precisely for this kind
//      of plugin-owned side channel. This is what we do.
//
// The side-channel pattern is what a real third-party FeaturePlugin author
// reaches for: declare a namespaced bag on `meta`, document the shape, and
// look it up at render time. The cost is one indirection in the spec; the
// benefit is the kit stays closed.
//
// ── Where does the stability ratio come from? ──────────────────────────────
//
// A hand-authored array, indexed by sceneIndex, with sensible defaults for
// the lunch-and-learn film. A real production HUD would read from a live
// telemetry sidecar — but for a teaching plugin, the leverage point is
// `meta.featureOptions.agentopsContextHud.stability`, which lets the spec
// author override the curve without editing this file.

import React from 'react';
import {AbsoluteFill} from 'remotion';

import type {
  FeaturePlugin,
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
 * Healthy at the open, sags through the demo, *drops to amber* at scene 6
 * (the tension — "ship AgentOps when the agent has a plan to drift, not
 * before"), recovers as the killer panel + recap close out the film. The
 * arc is the metaphor: stability tells you *what's wrong* before anything
 * else does.
 *
 * Override via `meta.featureOptions.agentopsContextHud.stability`.
 */
const DEFAULT_STABILITY_BY_INDEX: ReadonlyArray<number> = [
  0.94, 0.96, 0.95, 0.93, 0.91, 0.88, 0.83, 0.89, 0.93,
];

/**
 * Scenes the HUD reads as "most relevant" — bumps opacity from the
 * baseline (0.6) to the focused level (0.85). The flow-discovery and
 * waterfall scenes are where the abstraction lands hardest; the HUD
 * should feel a touch louder there. Indexed by sceneIndex.
 *
 * Override via `meta.featureOptions.agentopsContextHud.focusedSceneIndices`.
 */
const DEFAULT_FOCUSED_INDICES: ReadonlySet<number> = new Set([3, 7]);

/**
 * A short fake trace id — same every render so the metaphor is stable. Any
 * real telemetry sidecar would inject the live id here; for a teaching
 * plugin, a frozen string keeps every still byte-identical run-to-run.
 *
 * Override via `meta.featureOptions.agentopsContextHud.traceId`.
 */
const DEFAULT_TRACE_ID = '4a7c…b2f1';

// ── meta.featureOptions plumbing ───────────────────────────────────────────

/**
 * Side-channel options the plugin reads off `meta.featureOptions
 * .agentopsContextHud`. The kit's meta schema is `additionalProperties:
 * true`, so a film can scribble this bag without any schema change.
 *
 * Every field is optional — a film with no options bag still gets a
 * sensible HUD (the defaults above are tuned for the lunch-and-learn).
 */
interface HudOptions {
  /** Override the displayed trace id. */
  readonly traceId?: string;
  /** Per-scene span override; `null` hides the breadcrumb on that scene. */
  readonly spans?: ReadonlyArray<SpanKind | null>;
  /** Per-scene stability ratio override (0..1). */
  readonly stability?: ReadonlyArray<number>;
  /** Per-scene indices the HUD should pop at higher opacity. */
  readonly focusedSceneIndices?: ReadonlyArray<number>;
}

const readOptions = (meta: FilmMeta): HudOptions => {
  // `meta` is open by schema; the bag is plugin-owned. Defensive read so a
  // misshapen value never throws at render time.
  const raw = (meta as unknown as {
    featureOptions?: {agentopsContextHud?: unknown};
  }).featureOptions?.agentopsContextHud;
  if (!raw || typeof raw !== 'object') return {};
  return raw as HudOptions;
};

// ── Visual helpers ─────────────────────────────────────────────────────────

/**
 * Stability dot colour. The thresholds match how an on-call engineer reads
 * the gauge in the runbook: green ≥0.92 (healthy), amber 0.85-0.91 (watch),
 * red <0.85 (act). The preset's accent palette is the source of truth — we
 * pull the green / amber / rose channels rather than hard-coding hexes, so
 * a brand swap propagates through automatically.
 */
const stabilityColor = (ratio: number, style: ResolvedStyle): string => {
  const {accent} = style.tokens;
  if (ratio >= 0.92) return accent.green;
  if (ratio >= 0.85) return accent.amber;
  return accent.rose;
};

const spanLabel = (kind: SpanKind): string => {
  // Map the enum back to the runbook's underscore form. Mono + low-emphasis
  // typography lets the underscore read as code without being shouty.
  return kind;
};

// ── The HUD component ──────────────────────────────────────────────────────

/**
 * The HUD lives in the bottom-left at `left: 122`, the same gutter the
 * progress dots use. It stacks UP from `bottom: 110` (the progress dots
 * sit at `bottom: 66`, so 110 puts the dot row roughly 26px clear of the
 * HUD's bottom edge). Width capped at 180px so it never bleeds into the
 * scene's working area, which begins to the right of column ~270 in the
 * 1920-wide canvas.
 *
 * Opacity is two-level (`0.6` baseline, `0.85` focused). Higher than 0.85
 * starts to compete with the scene's own structure; lower than 0.55 makes
 * the dot impossible to read.
 */
const HudOverlay: React.FC<SceneFeatureProps> = ({sceneIndex, meta, style}) => {
  const opts = readOptions(meta);

  const traceId = opts.traceId ?? DEFAULT_TRACE_ID;

  const spans = opts.spans ?? DEFAULT_SPANS_BY_INDEX;
  const span = spans[sceneIndex] ?? null;

  const stability = opts.stability ?? DEFAULT_STABILITY_BY_INDEX;
  const ratio = stability[sceneIndex] ?? stability[stability.length - 1] ?? 0.9;

  const focusedSet = opts.focusedSceneIndices
    ? new Set(opts.focusedSceneIndices)
    : DEFAULT_FOCUSED_INDICES;
  const opacity = focusedSet.has(sceneIndex) ? 0.85 : 0.6;

  const {ink, accent, typography} = style.tokens;
  const dot = stabilityColor(ratio, style);

  // Render in an AbsoluteFill so we never affect the scene's layout. The
  // inner panel is the only thing that paints; everything else is
  // pointer-events: none and transparent.
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
          // No background — the HUD reads as bare text on the scene
          // backdrop, the way a terminal status line does. A panel would
          // shout; we want a *barely there* observability ticker.
        }}
      >
        {/* Trace id badge — `trace_id: <short>`. Faint label, hi-emphasis
            value, like a console field. */}
        <div style={{fontSize: 12, letterSpacing: 0.3, lineHeight: 1.2}}>
          <span style={{color: ink.faint}}>trace_id:&nbsp;</span>
          <span style={{color: ink.mid}}>{traceId}</span>
        </div>

        {/* Span breadcrumb — `plan_step ▸ <current>`. The triangle is the
            U+25B8 black right-pointing small triangle; renders cleanly in
            JetBrains Mono. When span is null, we still draw the root —
            never an empty line. */}
        <div style={{fontSize: 13, lineHeight: 1.2, color: ink.mid}}>
          <span style={{color: accent.violet}}>plan_step</span>
          {span && span !== 'plan_step' ? (
            <>
              <span style={{color: ink.faint, margin: '0 5px'}}>▸</span>
              <span>{spanLabel(span)}</span>
            </>
          ) : null}
        </div>

        {/* Stability gauge — `stability ▮ 0.94`. The dot is the live signal;
            the number is the precise reading. Both share the same colour
            so the eye reads them as one unit. */}
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
              // A soft glow ties the dot back to the kit's accent-glow
              // language the chrome already uses — same vocabulary, lower
              // dose. The blur stays small so a 1080p decode doesn't smear
              // the dot into a bigger blob than the text it sits next to.
              boxShadow: `0 0 6px ${dot}`,
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

// ── Plugin descriptor ──────────────────────────────────────────────────────

export const agentopsContextHud: FeaturePlugin = {
  kind: 'feature',
  name: 'agentops-context-hud',
  version: '0.1.0',

  // The HUD is per-scene, so we use `wrapsScenes` — mounts inside each
  // scene's `<Sequence>` alongside the scene component. The kit composes
  // this with `audio-bed`'s `wrapsFilm` and `narration`'s `wrapsScenes`
  // without any cross-talk: the three are layered, not exclusive.
  wrapsScenes: HudOverlay,
};

export default agentopsContextHud;
