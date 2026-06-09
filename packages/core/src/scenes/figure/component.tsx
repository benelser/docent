// FigureScene — annotates a still image (a painting, a map, a photograph,
// an experimental stimulus). The scene references an image resolved via
// Remotion `staticFile`; the author pins `callouts` — labelled markers at
// normalized 0..1 (x, y) regions of the image. Beats reveal/focus callout
// ids through the existing model: `reveal` brings a marker on, `focus`
// narrows to a subset. If the image file is absent the scene degrades
// gracefully to a labelled panel (mirroring DemonstrateScene's
// missing-clip fallback) so the type is always renderable. The author
// pins regions; the engine owns the pixels.
//
// Migrated from packages/engine/src/scenes/FigureScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. Behavior is UNCHANGED from
// the v2.5.x renderer; only import paths and the prop shape were updated:
//   - props receive `SceneRenderProps<FigureSceneSpec>` from @bjelser/kit
//     (the kit-owned `{scene, common}` envelope), rather than the legacy
//     `SceneProps` (the engine-owned `ts: TimedScene` envelope). The
//     legacy TimedBeat exposed `reveal`/`focus`/`from` directly; the
//     kit's BeatTimelineSlot nests these under `beat`, with `startFrame`
//     replacing `from`.
//   - the engine-shared chrome (SceneFrame, Narration, FittedText, glow,
//     activeBeatIndex) lives as colocated helpers in this scene's
//     directory until the shared-infra migration agent lands; the
//     integrator will swap the underscore-prefixed local helpers for
//     shared imports at merge time.

import React, {useEffect, useState} from 'react';
import {
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {Beat, ResolvedStyle, SceneRenderProps} from '@bjelser/kit';

import {FittedText, Narration, SceneFrame, activeBeatIndex, glow} from '../../_shared';
import type {FigureCallout, FigureScene as FigureSceneSpec} from './validate';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string | undefined>;
  return (key ? map[key] : undefined) ?? map.blue ?? '#5cb6ff';
};

// The framed stage the image (or fallback) sits inside.
const STAGE_W = 1340;
const STAGE_H = 716;

export const FigureSceneComponent: React.FC<SceneRenderProps<FigureSceneSpec>> = ({
  scene,
  common,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, meta, style} = common;
  const accentHex = accentOf(style, undefined);
  const callouts = scene.callouts ?? [];
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  // Resolve the image path. `scene.image` may be a bare filename (resolved
  // under public/figures/) or an explicit path; either way it goes through
  // staticFile. The image is probed once — if it fails to load we fall back
  // to a labelled panel, exactly as DemonstrateScene does for a missing clip.
  const src = scene.image
    ? staticFile(
        scene.image.includes('/') ? scene.image : `figures/${scene.image}`,
      )
    : null;
  const [imgOk, setImgOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!src) {
      setImgOk(false);
      return;
    }
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => !cancelled && setImgOk(true);
    probe.onerror = () => !cancelled && setImgOk(false);
    probe.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  const hasImage = src !== null && imgOk !== false;

  // First frame each callout id becomes live — the StructureScene reveal model.
  // In the kit's BeatTimelineSlot shape, `reveal` lives on `b.beat` and the
  // per-beat start frame is `b.startFrame` (the v2.5.x engine surfaced both
  // on the TimedBeat itself).
  const revealFrame: Record<string, number> = {};
  ts.beats.forEach((b) => {
    const reveal = (b.beat as {reveal?: unknown}).reveal;
    if (Array.isArray(reveal)) {
      reveal.forEach((id) => {
        if (typeof id !== 'string') return;
        if (revealFrame[id] === undefined) revealFrame[id] = b.startFrame;
      });
    }
  });
  const revealOf = (id: string): number => revealFrame[id] ?? 0;

  const active = activeBeatIndex(ts.beats, frame);
  const beat: Beat | undefined = ts.beats[active]?.beat;
  const focusList = (beat as {focus?: unknown} | undefined)?.focus;
  const focusIds = new Set<string>(
    Array.isArray(focusList)
      ? focusList.filter((id): id is string => typeof id === 'string')
      : [],
  );
  const hasFocus = focusIds.size > 0;

  type MarkState = 'hidden' | 'focus' | 'dim' | 'live';
  const calloutState = (id: string): MarkState => {
    if (frame < revealOf(id)) return 'hidden';
    if (hasFocus) return focusIds.has(id) ? 'focus' : 'dim';
    return 'live';
  };

  const intro = spring({frame, fps, config: {damping: 200, mass: 0.6}});
  const scale = interpolate(intro, [0, 1], [0.975, 1]);

  // A callout marker — a dot at the normalized point with a label card. The
  // label sits to the right unless the point is in the right third, in which
  // case it flips left so it never leaves the stage.
  const renderCallout = (c: FigureCallout): React.ReactNode => {
    const st = calloutState(c.id);
    if (st === 'hidden') return null;
    const [nx, ny] = c.at;
    const x = Math.max(0, Math.min(1, nx)) * STAGE_W;
    const y = Math.max(0, Math.min(1, ny)) * STAGE_H;
    const local = frame - revealOf(c.id);
    const a =
      local <= 0
        ? 0
        : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});
    const lit = st === 'focus' || st === 'live';
    const dim = st === 'dim';
    const flipLeft = nx > 0.66;
    // R14 — per-callout accent: when the callout names an accent key
    // (e.g. 'violet' for plan_step, 'green' for llm_call, 'rose' for
    // hallucination), resolve it against the style's accent palette.
    // Falls back to the scene default when absent or when the key isn't
    // in the palette. This lets a single figure carry span-typed
    // callouts that match the brand-pack-defined accents.
    const calloutAccentHex = accentOf(style, c.accent);

    return (
      <div
        key={c.id}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          opacity: a * (dim ? 0.42 : 1),
        }}
      >
        {/* the pinned marker */}
        <div
          style={{
            position: 'absolute',
            left: -13,
            top: -13,
            width: 26,
            height: 26,
            borderRadius: '50%',
            border: `2.5px solid ${calloutAccentHex}`,
            background: glow(calloutAccentHex, st === 'focus' ? 0.42 : 0.22),
            boxShadow: dim
              ? 'none'
              : `0 0 ${st === 'focus' ? 26 : 16}px -2px ${glow(calloutAccentHex, 0.85)}`,
            transform: `scale(${interpolate(a, [0, 1], [0.4, 1])})`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: -5,
            top: -5,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: calloutAccentHex,
          }}
        />
        {/* the label card, flipped away from the stage edge.
            The horizontal offset has to clear the marker dot AND any
            image content adjacent to the dot — 22px placed labels
            directly over the right half of a diagram box. 44px gives
            the label its own gutter so it never overlaps the region
            it annotates. */}
        <div
          style={{
            position: 'absolute',
            left: flipLeft ? undefined : 44,
            right: flipLeft ? 44 : undefined,
            top: -18,
            transform: `translateX(${interpolate(
              a,
              [0, 1],
              [flipLeft ? 14 : -14, 0],
            )}px)`,
            maxWidth: 380,
            padding: '9px 15px',
            borderRadius: 10,
            background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
            border: `1.5px solid ${lit ? calloutAccentHex : bg.line}`,
            boxShadow: `0 18px 40px -16px #000000ee`,
          }}
        >
          {/* callout label / note — the card is maxWidth 380 with 15px
              horizontal padding (~350px content). Wrap to 2 lines for
              labels, 4 lines for notes so the dense AgentOps-style
              annotations don't truncate to "...". */}
          <FittedText
            text={c.label}
            maxWidth={350}
            basePx={21}
            floorPx={13}
            charAdvance={0.58}
            mode="shrink-wrap"
            maxLines={2}
            lineHeight={1.18}
            style={{
              fontFamily: sansFamily,
              fontWeight: 600,
              color: lit ? ink.hi : ink.mid,
              letterSpacing: -0.2,
            }}
          />
          {c.note ? (
            <FittedText
              text={c.note}
              maxWidth={350}
              basePx={16}
              floorPx={11}
              charAdvance={0.58}
              mode="shrink-wrap"
              maxLines={4}
              lineHeight={1.4}
              style={{
                fontFamily: sansFamily,
                color: ink.low,
                marginTop: 3,
              }}
            />
          ) : null}
        </div>
      </div>
    );
  };

  // R15.1 chrome-kicker hint — the agentops kicker style (set on the
  // preset) renders the scene's chromeKickerHint or scene.type when set;
  // falls back gracefully to legacy kicker text everywhere else.
  const chromeKickerHint =
    typeof (scene as {chromeKickerHint?: unknown}).chromeKickerHint === 'string'
      ? ((scene as {chromeKickerHint?: string}).chromeKickerHint as string)
      : undefined;

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      sceneType="figure"
      {...(chromeKickerHint !== undefined ? {chromeKickerHint} : {})}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 224,
          width: STAGE_W,
          height: STAGE_H,
          transform: `translateX(-50%) scale(${scale})`,
          opacity: intro,
          borderRadius: 18,
          overflow: 'visible',
          background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
          border: `1.5px solid ${accentHex}`,
          boxShadow: `0 0 0 1px ${glow(accentHex, 0.3)}, 0 40px 90px -36px #000000ee`,
        }}
      >
        {/* the image — or a graceful labelled fallback if it is absent */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 18,
            overflow: 'hidden',
          }}
        >
          {hasImage && src ? (
            <Img
              src={src}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                background: bg.void,
              }}
            />
          ) : (
            // graceful fallback — no image, no crash
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                background: `radial-gradient(circle at 50% 42%, ${glow(
                  accentHex,
                  0.08,
                )} 0%, transparent 64%)`,
              }}
            >
              <svg width="84" height="84" viewBox="0 0 84 84" fill="none">
                <rect
                  x="6"
                  y="14"
                  width="72"
                  height="56"
                  rx="6"
                  stroke={accentHex}
                  strokeWidth="2.5"
                />
                <circle cx="28" cy="33" r="7" stroke={accentHex} strokeWidth="2.5" />
                <path
                  d="M12 62L34 42L48 54L62 40L78 56"
                  stroke={accentHex}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
              </svg>
              <div
                style={{
                  fontFamily: sansFamily,
                  fontSize: 28,
                  fontWeight: 600,
                  color: ink.hi,
                }}
              >
                {scene.heading ?? 'Figure'}
              </div>
              <div
                style={{
                  fontFamily: monoFamily,
                  fontSize: 16,
                  letterSpacing: 1,
                  color: ink.low,
                }}
              >
                {scene.image
                  ? `image unavailable · ${scene.image}`
                  : `${(meta as {subject?: unknown}).subject ?? meta.subtitle ?? meta.title} · figure`}
              </div>
            </div>
          )}
        </div>

        {/* callouts — pinned over the image, revealed beat by beat */}
        {callouts.map((c) => renderCallout(c))}
      </div>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
