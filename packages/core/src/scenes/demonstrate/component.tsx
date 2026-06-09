// DemonstrateScene — the docent move that *shows the phenomenon
// itself*: an embedded screen-capture clip, framed in a device-style
// panel, with the narration playing over it.
//
// Migrated from packages/engine/src/scenes/DemonstrateScene.tsx as part
// of the v3.0 plugin-architecture rip-and-replace. Behavior is
// UNCHANGED from the v2.5.x renderer for any spec that does NOT supply
// the optional `cursor` or `pins` overlay fields; only import paths and
// the prop shape were updated:
//   - props receive `SceneRenderProps<DemonstrateSceneSpec>` from
//     @bjelser/kit (the kit-owned `{scene, common}` envelope) rather
//     than the legacy `SceneProps` (the engine-owned `ts: TimedScene`
//     envelope).
//   - the engine-shared chrome (SceneFrame, Narration, FittedText,
//     fonts, glow) lives as colocated helpers in this scene's
//     directory until the shared-infra migration agent lands; the
//     integrator will swap the underscore-prefixed local helpers for
//     shared imports at merge time.
//
// When the clip is absent the scene degrades to a centred placeholder
// panel — it must never crash on a missing file. The placeholder
// re-uses the scene heading as its caption and surfaces a
// "clip unavailable" annotation in mono ink-low.
//
// Two OPT-IN overlay primitives turn a passive playback into a guided
// demo when the spec supplies them:
//   - `cursor` — an ordered list of (at, x, y, action?) waypoints; the
//     renderer draws a pointer SVG over the video, tweening between
//     waypoints with an ease-in-out spring. A `click` waypoint fires a
//     ~250ms concentric ripple in the accent color.
//   - `pins` — floating callout cards anchored at a point in the clip
//     with a leader line. Each pin fades in at its `at`, holds for
//     `durationFrames`, then fades out.
// Both render ABOVE the video; coordinates are in clip-native pixels
// and mapped into the active video rect, so `objectFit: 'contain'`
// letterboxing is handled. See ./overlays.tsx for the implementation.

import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {ResolvedStyle, SceneRenderProps} from '@bjelser/kit';

import {FittedText, Narration, SceneFrame, glow} from '../../_shared';
import {
  MacPointer,
  Ripple,
  WindowsPointer,
  computeActiveVideoRect,
  interpolateCursor,
  mapToPanel,
  resolveAt,
} from './overlays';
import type {DemonstrateScene as DemonstrateSceneSpec} from './validate';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string>;
  return (key && map[key]) || map.blue || '#3B82F6';
};

export const DemonstrateSceneComponent: React.FC<
  SceneRenderProps<DemonstrateSceneSpec>
> = ({scene, common}) => {
  const frame = useCurrentFrame();
  const {fps, width: canvasW, height: canvasH} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, meta, style} = common;
  const accentHex = accentOf(style, undefined);
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  // The v2.5.x DemonstrateScene captioned the placeholder with
  // `meta.subject · demonstration`. The kit's canonical FilmMeta does
  // not carry `subject` (the engine-side FilmSpec did; the kit lifted
  // a smaller closed shape). To preserve the v2.5.x caption byte for
  // byte when a subject is present (every existing film carries it),
  // read it through the open shape and fall back to `meta.title` so
  // the placeholder remains useful even when no subject is set.
  const subjectish =
    (meta as {subject?: unknown}).subject &&
    typeof (meta as {subject?: unknown}).subject === 'string'
      ? ((meta as {subject?: unknown}).subject as string)
      : meta.title;

  const intro = spring({frame, fps, config: {damping: 200}});
  const scale = interpolate(intro, [0, 1], [0.94, 1]);

  // The framed stage the clip (or placeholder) sits inside.
  const panelW = 1340;
  const panelH = 632;
  // The title bar is 46px tall; the inner video region is the panel
  // minus that bar. Cursor/pin coordinates resolve into THIS rect.
  const titleBarH = 46;
  const videoPanelW = panelW;
  const videoPanelH = panelH - titleBarH;

  // The active video rect — where the clip actually paints inside the
  // video panel after `objectFit: 'contain'`. We assume the clip's
  // native resolution matches the film's canvas size (the common case
  // for screen captures authored against the film aspect). If the
  // overlay coordinates were authored against a different clip
  // resolution this still self-corrects as long as the author's
  // coordinate system has the same aspect.
  const activeRect = computeActiveVideoRect(
    videoPanelW,
    videoPanelH,
    canvasW,
    canvasH,
  );
  // The display scale: how many panel-pixels per clip-pixel. Used to
  // keep the cursor SVG and ripple sized "in viewport" rather than
  // "on canvas".
  const displayScale = activeRect.width / activeRect.clipW;

  // Today the video starts at scene-frame 0 — the same frame the
  // panel intro spring fires. We expose `videoStartFrame` as a single
  // named binding so a future kicker-into-clip transition that pushes
  // the video start has ONE place to change.
  const videoStartFrame = 0;

  const panelStyle: React.CSSProperties = {
    width: panelW,
    height: panelH,
    opacity: intro,
    transform: `scale(${scale})`,
    borderRadius: 18,
    overflow: 'hidden',
    background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
    border: `1.5px solid ${accentHex}`,
    boxShadow: `0 0 0 1px ${glow(accentHex, 0.3)}, 0 40px 90px -36px #000000ee`,
    display: 'flex',
    flexDirection: 'column',
  };

  // A title bar, so the clip reads as a captured window.
  const titleBar = (
    <div
      style={{
        height: titleBarH,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 18px',
        background: bg.void,
        borderBottom: `1px solid ${bg.line}`,
      }}
    >
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
        <div key={c} style={{width: 12, height: 12, borderRadius: '50%', background: c, opacity: 0.85}} />
      ))}
      {/* clip caption — sits in the title bar. The panel is 1340px wide
          with ~76px reserved for the traffic-light dots; cap the caption
          at the remaining width and let it shrink rather than overflow. */}
      <FittedText
        text={scene.clip ? scene.clip : `${subjectish} · demonstration`}
        maxWidth={1340 - 76 - 36}
        basePx={14}
        floorPx={10}
        charAdvance={0.62}
        mode="shrink-single"
        style={{
          marginLeft: 14,
          fontFamily: monoFamily,
          letterSpacing: 0.6,
          color: ink.low,
        }}
      />
    </div>
  );

  // Cursor — the pointer SVG that tweens between waypoints. The
  // interpolation lives in `interpolateCursor` so the rendering here is
  // pure layout: position the SVG at the resolved (clip-pixel) point,
  // mapped into panel-pixels.
  const cursorWaypoints = scene.cursor ?? [];
  const cursorState =
    cursorWaypoints.length > 0
      ? interpolateCursor(cursorWaypoints, frame, fps, videoStartFrame)
      : null;

  // Click ripples — the renderer scans every `click` waypoint and emits
  // a Ripple at it for ~250ms. Computed lazily: an empty cursor array is
  // free.
  const ripples = cursorWaypoints
    .map((w, i) => ({
      i,
      at: resolveAt(w.at, videoStartFrame),
      x: w.x,
      y: w.y,
      action: w.action ?? 'move',
    }))
    .filter((w) => w.action === 'click')
    .map((w) => ({...w, local: frame - w.at}));

  const cursorStyle: 'mac' | 'windows' = scene.cursorStyle ?? 'mac';

  // Pins — floating callout cards. Each pin fades in at `at`, holds
  // for `durationFrames`, then fades out over ~6 frames.
  const PIN_FADE = 6;
  const pinElements = (scene.pins ?? []).map((pin, i) => {
    const pinAt = resolveAt(pin.at, videoStartFrame);
    const local = frame - pinAt;
    const dur = pin.durationFrames;
    if (local < -PIN_FADE || local > dur + PIN_FADE) return null;
    // Triangular fade: ramp in over PIN_FADE, hold, ramp out over PIN_FADE.
    let alpha = 1;
    if (local < 0) alpha = Math.max(0, 1 + local / PIN_FADE);
    else if (local > dur)
      alpha = Math.max(0, 1 - (local - dur) / PIN_FADE);
    const enter =
      local <= 0
        ? 0
        : spring({frame: local, fps, config: {damping: 200, mass: 0.6}});
    const slide = interpolate(enter, [0, 1], [8, 0]);

    const {x: panelX, y: panelY} = mapToPanel(activeRect, pin.x, pin.y);
    const anchor = pin.anchor ?? 'br';
    const leader = pin.leader !== false;

    // Card position: anchor corner relative to the anchor point. The
    // card is ~360px wide; the leader line draws from the anchor point
    // to the card's near corner. We keep the card a comfortable
    // ~36px from the anchor so the leader has room to read.
    const CARD_W = 360;
    const CARD_H_MAX = 120; // estimated; the card grows with text
    const GAP = 36;
    let cardLeft: number;
    let cardTop: number;
    let leaderEndX: number;
    let leaderEndY: number;
    if (anchor === 'tl') {
      cardLeft = panelX - GAP - CARD_W;
      cardTop = panelY - GAP - CARD_H_MAX;
      leaderEndX = panelX - GAP;
      leaderEndY = panelY - GAP;
    } else if (anchor === 'tr') {
      cardLeft = panelX + GAP;
      cardTop = panelY - GAP - CARD_H_MAX;
      leaderEndX = panelX + GAP;
      leaderEndY = panelY - GAP;
    } else if (anchor === 'bl') {
      cardLeft = panelX - GAP - CARD_W;
      cardTop = panelY + GAP;
      leaderEndX = panelX - GAP;
      leaderEndY = panelY + GAP;
    } else {
      // br (default)
      cardLeft = panelX + GAP;
      cardTop = panelY + GAP;
      leaderEndX = panelX + GAP;
      leaderEndY = panelY + GAP;
    }

    // Clamp the card to stay inside the video panel (so a pin near a
    // panel edge doesn't paint off the panel and get clipped).
    cardLeft = Math.max(
      8,
      Math.min(videoPanelW - CARD_W - 8, cardLeft),
    );
    cardTop = Math.max(8, Math.min(videoPanelH - 32 - 8, cardTop));

    return (
      <div
        key={`pin-${i}`}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: alpha,
          pointerEvents: 'none',
        }}
      >
        {/* the anchor dot — a small accent pip at the (x, y) so the eye
            knows where the pin actually points. */}
        <div
          style={{
            position: 'absolute',
            left: panelX - 7,
            top: panelY - 7,
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: `2px solid ${accentHex}`,
            background: glow(accentHex, 0.35),
            boxShadow: `0 0 14px -2px ${glow(accentHex, 0.85)}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: panelX - 3,
            top: panelY - 3,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: accentHex,
          }}
        />
        {/* the leader line, anchor point -> card corner */}
        {leader ? (
          <svg
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible',
              pointerEvents: 'none',
            }}
          >
            <line
              x1={panelX}
              y1={panelY}
              x2={leaderEndX}
              y2={leaderEndY}
              stroke={accentHex}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              opacity={0.85}
            />
          </svg>
        ) : null}
        {/* the card */}
        <div
          style={{
            position: 'absolute',
            left: cardLeft,
            top: cardTop,
            transform: `translateY(${slide}px)`,
            width: CARD_W,
            padding: '12px 16px',
            borderRadius: 10,
            background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
            border: `1.5px solid ${accentHex}`,
            boxShadow: `0 0 0 1px ${glow(accentHex, 0.25)}, 0 18px 40px -16px #000000ee`,
          }}
        >
          <FittedText
            text={pin.text}
            maxWidth={CARD_W - 32}
            basePx={20}
            floorPx={13}
            charAdvance={0.58}
            mode="shrink-wrap"
            maxLines={3}
            lineHeight={1.25}
            style={{
              fontFamily: sansFamily,
              fontWeight: 600,
              color: ink.hi,
              letterSpacing: -0.2,
            }}
          />
        </div>
      </div>
    );
  });

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div style={{...panelStyle, marginTop: 36, position: 'relative'}}>
          {titleBar}
          {scene.clip ? (
            <div
              style={{
                position: 'relative',
                width: videoPanelW,
                height: videoPanelH,
              }}
            >
              <OffthreadVideo
                src={staticFile(`clips/${meta.id}/${scene.clip}`)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  background: bg.void,
                  zIndex: 1,
                }}
              />

              {/* cursor overlay — z-index 2 */}
              {cursorState && cursorState.visible ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 2,
                    pointerEvents: 'none',
                  }}
                >
                  {/* the click ripples — emitted at every click waypoint
                      that is within its ~250ms lifetime. */}
                  {ripples.map((r) => {
                    const {x, y} = mapToPanel(activeRect, r.x, r.y);
                    return (
                      <Ripple
                        key={`ripple-${r.i}`}
                        panelX={x}
                        panelY={y}
                        frame={r.local}
                        fps={fps}
                        accentHex={accentHex}
                        scale={displayScale}
                      />
                    );
                  })}
                  {(() => {
                    const {x, y} = mapToPanel(
                      activeRect,
                      cursorState.x,
                      cursorState.y,
                    );
                    // The cursor SVG natural size is 28x32 px. We scale
                    // it proportionally to the active rect so it reads
                    // "in the viewport" rather than always 28px on the
                    // canvas. Floor at 0.85 so it never disappears, cap
                    // at 1.4 so it never gets absurd on a giant panel.
                    const cursorScale = Math.max(
                      0.85,
                      Math.min(1.4, displayScale * 1.2),
                    );
                    return (
                      <div
                        style={{
                          position: 'absolute',
                          // The pointer's "tip" (its drawn point) is at
                          // (3, 2) in the SVG viewBox; offset so (x, y)
                          // is the click point, not the SVG's top-left.
                          left: x - 3 * cursorScale,
                          top: y - 2 * cursorScale,
                          transform: `scale(${cursorScale})`,
                          transformOrigin: 'top left',
                          pointerEvents: 'none',
                        }}
                      >
                        {cursorStyle === 'windows' ? (
                          <WindowsPointer accentHex={accentHex} />
                        ) : (
                          <MacPointer accentHex={accentHex} />
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              {/* pins overlay — z-index 3 (sits above cursor when they
                  overlap, matching "annotation is the most important
                  thing on screen"). */}
              {pinElements.length > 0 ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 3,
                    pointerEvents: 'none',
                  }}
                >
                  {pinElements}
                </div>
              ) : null}
            </div>
          ) : (
            // graceful placeholder — no clip, no crash
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                background: `radial-gradient(circle at 50% 42%, ${glow(accentHex, 0.08)} 0%, transparent 64%)`,
              }}
            >
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  border: `2px solid ${accentHex}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 0 30px -6px ${glow(accentHex, 0.6)}`,
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    marginLeft: 6,
                    borderTop: '15px solid transparent',
                    borderBottom: '15px solid transparent',
                    borderLeft: `24px solid ${accentHex}`,
                  }}
                />
              </div>
              <div
                style={{
                  fontFamily: sansFamily,
                  fontSize: 28,
                  fontWeight: 600,
                  color: ink.hi,
                }}
              >
                {scene.heading ?? 'Demonstration'}
              </div>
              <div
                style={{
                  fontFamily: monoFamily,
                  fontSize: 16,
                  letterSpacing: 1,
                  color: ink.low,
                }}
              >
                clip unavailable · narrated walkthrough
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
