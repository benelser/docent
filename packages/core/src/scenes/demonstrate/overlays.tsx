// Demonstrate-scene overlays — cursor track and pin callouts.
//
// Two declarative primitives that turn a passive playback into a guided
// demo:
//
//   - `cursor`: an ordered list of waypoints (at, x, y, action?). The
//     cursor element is a macOS-style or Windows-style pointer SVG that
//     tweens between waypoints with an ease-in-out spring. A `click`
//     waypoint fires a concentric-ring ripple in the accent color for
//     ~250ms at the waypoint position.
//   - `pins`: floating callout cards anchored at a point in the clip
//     with a leader line connecting the anchor to the card. Each pin
//     fades in at `at`, holds for `durationFrames`, then fades out.
//
// Both render ABOVE the video, in their own absolute-positioned div over
// the same rect. The video is z-index 1; cursor is z-index 2; pins are
// z-index 3 (so a pin sits above the cursor when they overlap, matching
// "the annotation is the most important thing on screen").
//
// Coordinate system: the author specifies (x, y) in CLIP-NATIVE PIXELS —
// i.e., the pixel coordinates as they would be in the recorded clip at
// its native resolution. Because `objectFit: 'contain'` letterboxes the
// video inside the panel when the aspect ratios differ, the overlays
// compute the active video rect (where the clip actually paints) and
// scale clip-pixel coordinates into that rect. The result: an author who
// authors against the recording's natural pixel space gets pixel-perfect
// overlays regardless of the panel's aspect.

import React from 'react';
import {interpolate, spring} from 'remotion';

import {glow} from '../../_shared';
import type {
  DemonstrateCursorWaypoint,
  DemonstrateOverlayTiming,
  DemonstratePin,
} from './validate';

/**
 * The active video rect — the rectangle inside `panel` where the clip
 * actually paints after `objectFit: 'contain'` letterboxing. All overlay
 * coordinates resolve into THIS rect, not the panel rect, so the cursor
 * lines up with the pixel under it.
 */
export interface ActiveVideoRect {
  /** Offset from the panel's top-left, in panel-pixels. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Active video rect width and height, in panel-pixels. */
  readonly width: number;
  readonly height: number;
  /** The clip's assumed native size — the coordinate system overlays use. */
  readonly clipW: number;
  readonly clipH: number;
}

/**
 * Compute the active video rect inside a panel given the panel size and
 * the assumed clip-native size. Mirrors CSS `objectFit: 'contain'`:
 * preserve the clip's aspect, scale to fit the panel, center-letterbox.
 */
export const computeActiveVideoRect = (
  panelW: number,
  panelH: number,
  clipW: number,
  clipH: number,
): ActiveVideoRect => {
  const panelAR = panelW / panelH;
  const clipAR = clipW / clipH;
  let width: number;
  let height: number;
  if (clipAR > panelAR) {
    // Clip is wider than panel — letterbox top/bottom.
    width = panelW;
    height = panelW / clipAR;
  } else {
    // Clip is taller than panel — letterbox left/right.
    height = panelH;
    width = panelH * clipAR;
  }
  return {
    offsetX: (panelW - width) / 2,
    offsetY: (panelH - height) / 2,
    width,
    height,
    clipW,
    clipH,
  };
};

/** Map a clip-pixel (x, y) into panel-pixel coordinates. */
export const mapToPanel = (
  rect: ActiveVideoRect,
  clipX: number,
  clipY: number,
): {x: number; y: number} => ({
  x: rect.offsetX + (clipX / rect.clipW) * rect.width,
  y: rect.offsetY + (clipY / rect.clipH) * rect.height,
});

/**
 * Resolve an `at` field (which is either a plain number — scene-frame —
 * or `{ videoFrame: N }` — clip-frame) into a single scene-frame number.
 * `videoStartFrame` is the scene-frame at which the clip begins playing
 * (today: 0; reserved for a future kicker-into-clip transition).
 */
export const resolveAt = (
  at: DemonstrateOverlayTiming,
  videoStartFrame: number,
): number => {
  if (typeof at === 'number') return at;
  if (at && typeof at === 'object' && typeof at.videoFrame === 'number') {
    return videoStartFrame + at.videoFrame;
  }
  return 0;
};

/**
 * The macOS-style pointer arrow, embedded as a React SVG so the scene has
 * no extra `public/` deps. ~24px tall in clip-native pixels.
 */
export const MacPointer: React.FC<{accentHex: string}> = ({accentHex}) => (
  <svg
    width="28"
    height="32"
    viewBox="0 0 28 32"
    fill="none"
    style={{
      filter: `drop-shadow(0 2px 6px ${glow('#000000', 0.6)}) drop-shadow(0 0 4px ${glow(accentHex, 0.5)})`,
    }}
  >
    {/* The classic single-fill arrow: dark stroke, white fill, accent tip. */}
    <path
      d="M3 2 L3 24 L9 18 L13 27 L17 25 L13 16 L22 16 Z"
      fill="#ffffff"
      stroke="#0a0a0a"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The Windows-style pointer chevron, also embedded as SVG. Similar
 * silhouette to the mac pointer but with the steeper Windows angles.
 */
export const WindowsPointer: React.FC<{accentHex: string}> = ({accentHex}) => (
  <svg
    width="28"
    height="32"
    viewBox="0 0 28 32"
    fill="none"
    style={{
      filter: `drop-shadow(0 2px 6px ${glow('#000000', 0.6)}) drop-shadow(0 0 4px ${glow(accentHex, 0.5)})`,
    }}
  >
    <path
      d="M2 2 L2 22 L8 17 L11 27 L15 25 L12 15 L20 14 Z"
      fill="#ffffff"
      stroke="#0a0a0a"
      strokeWidth="1.6"
      strokeLinejoin="miter"
    />
  </svg>
);

/**
 * Interpolate the cursor position at `frame` (scene-frame) given the
 * waypoint list and the video-start offset. Uses an ease-in-out spring
 * between adjacent waypoints; before the first waypoint, holds at the
 * first; after the last, holds at the last.
 */
export const interpolateCursor = (
  cursor: ReadonlyArray<DemonstrateCursorWaypoint>,
  frame: number,
  fps: number,
  videoStartFrame: number,
): {x: number; y: number; visible: boolean} | null => {
  if (cursor.length === 0) return null;
  // Resolve at-values once.
  const resolved = cursor.map((w) => ({
    at: resolveAt(w.at, videoStartFrame),
    x: w.x,
    y: w.y,
  }));
  const first = resolved[0];
  const last = resolved[resolved.length - 1];
  if (!first || !last) return null;
  // Cursor is hidden until the first waypoint's at.
  if (frame < first.at) return null;
  // Past the last waypoint — hold at it.
  if (frame >= last.at) {
    return {x: last.x, y: last.y, visible: true};
  }
  // Find the segment we're in.
  for (let i = 0; i < resolved.length - 1; i++) {
    const a = resolved[i];
    const b = resolved[i + 1];
    if (!a || !b) continue;
    if (frame >= a.at && frame < b.at) {
      const span = Math.max(1, b.at - a.at);
      const local = frame - a.at;
      // Spring tween (damping 200 — feel matches the scene intro spring),
      // saturated to [0, 1].
      const t = Math.min(
        1,
        Math.max(
          0,
          spring({
            frame: local,
            fps,
            config: {damping: 200, mass: 0.7},
            durationInFrames: span,
          }),
        ),
      );
      return {
        x: interpolate(t, [0, 1], [a.x, b.x]),
        y: interpolate(t, [0, 1], [a.y, b.y]),
        visible: true,
      };
    }
  }
  return null;
};

/**
 * The click-ripple element: a concentric circle that scales out and
 * fades over ~250ms (7-8 frames at 30fps) from a click waypoint's
 * position. Returns null when the ripple is past its lifetime.
 */
export const Ripple: React.FC<{
  panelX: number;
  panelY: number;
  /** Frames since the click waypoint landed. */
  frame: number;
  fps: number;
  accentHex: string;
  /** Active video rect scale — to keep the ripple size proportional. */
  scale: number;
}> = ({panelX, panelY, frame, fps, accentHex, scale}) => {
  // ~250ms lifetime — 7-8 frames at 30fps, 12 at 50fps. We compute in
  // frames because every other value in this scene is in frames; convert
  // the 250ms target through fps so a non-30fps render still feels
  // right.
  const lifetimeFrames = Math.round(0.25 * fps);
  if (frame < 0 || frame > lifetimeFrames + 4) return null;
  const t = Math.max(0, Math.min(1, frame / lifetimeFrames));
  // Two concentric rings, scaling out and fading. The base ring scale
  // matches the clip's display scale so the ripple feels "in the
  // viewport" not "on the canvas".
  const baseR = 18 * scale;
  const r = baseR + interpolate(t, [0, 1], [0, baseR * 2.8]);
  const alpha = interpolate(t, [0, 1], [0.85, 0]);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: panelX - r,
          top: panelY - r,
          width: r * 2,
          height: r * 2,
          borderRadius: '50%',
          border: `${Math.max(1.5, 3 * scale)}px solid ${accentHex}`,
          opacity: alpha,
          boxShadow: `0 0 ${12 * scale}px ${glow(accentHex, alpha)}`,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: panelX - r * 0.55,
          top: panelY - r * 0.55,
          width: r * 1.1,
          height: r * 1.1,
          borderRadius: '50%',
          background: glow(accentHex, alpha * 0.35),
          opacity: alpha,
          pointerEvents: 'none',
        }}
      />
    </>
  );
};
