// Per-scene structural validation for the `demonstrate` scene.
//
// Mirrors the v2.5.x engine's per-scene-type validate.ts entry for
// demonstrate (packages/engine/cli/validate.ts:2533):
//
//     demonstrate: () => (typeof sc.clip !== 'string' || !sc.clip.trim()
//       ? 'demonstrate requires a clip path'
//       : null),
//
// The demonstrate scene shows the phenomenon itself — a screen-capture
// clip framed in a device-style panel with narration over it. The clip
// reference is the load-bearing field; without it the scene degrades to
// a centred placeholder. The placeholder is intentional graceful
// degradation at *render* time (no crash on a missing file), but at the
// *spec authoring* time the absence of a `clip` is an error — a
// demonstrate scene without a clip has nothing to demonstrate.
//
// The optional `cursor` and `pins` overlays carry their own per-item
// invariants the JSON schema cannot express:
//   - cursor waypoints must arrive in non-decreasing `at` order (so the
//     spring tween between them has a defined direction). An out-of-order
//     waypoint is an error.
//   - pin `at` and `durationFrames` must both be non-negative numbers;
//     `durationFrames` is required to be at least 1 frame.
//   - both overlay primitives accept `at` as either a plain number
//     (scene-frame) or an object `{ videoFrame: N }` (clip-frame); the
//     validator normalizes the shape check.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

export type DemonstrateOverlayTiming =
  | number
  | {readonly videoFrame: number};

export interface DemonstrateCursorWaypoint {
  at: DemonstrateOverlayTiming;
  x: number;
  y: number;
  action?: 'move' | 'click' | 'hover';
}

export interface DemonstratePin {
  at: DemonstrateOverlayTiming;
  durationFrames: number;
  x: number;
  y: number;
  text: string;
  anchor?: 'tl' | 'tr' | 'bl' | 'br';
  leader?: boolean;
}

export interface DemonstrateScene extends Scene {
  type: 'demonstrate';
  clip?: string;
  kicker?: string;
  heading?: string;
  cursorStyle?: 'mac' | 'windows';
  cursor?: ReadonlyArray<DemonstrateCursorWaypoint>;
  pins?: ReadonlyArray<DemonstratePin>;
}

const finiteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const resolveAtNumber = (at: unknown): number | undefined => {
  if (finiteNumber(at)) return at;
  if (
    at &&
    typeof at === 'object' &&
    finiteNumber((at as {videoFrame?: unknown}).videoFrame)
  ) {
    return (at as {videoFrame: number}).videoFrame;
  }
  return undefined;
};

export const validate = (
  scene: DemonstrateScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;

  if (typeof scene.clip !== 'string' || !scene.clip.trim()) {
    issues.push({
      path: `${at}.clip`,
      message: 'demonstrate requires a clip path',
      severity: 'error',
      code: 'demonstrate/missing-clip',
    });
  }

  // cursor — optional. When present, each waypoint must carry a valid
  // (at, x, y) and `at` values must be non-decreasing across the array
  // so the spring tween between adjacent waypoints has a defined
  // direction in time.
  if (scene.cursor !== undefined) {
    if (!Array.isArray(scene.cursor)) {
      issues.push({
        path: `${at}.cursor`,
        message: 'cursor must be an array of waypoints',
        severity: 'error',
        code: 'demonstrate/cursor-not-array',
      });
    } else {
      let prevAt = -Infinity;
      scene.cursor.forEach((w, k) => {
        const wAt = `${at}.cursor[${k}]`;
        if (!w || typeof w !== 'object') {
          issues.push({
            path: wAt,
            message: 'cursor waypoint must be an object {at, x, y, action?}',
            severity: 'error',
            code: 'demonstrate/cursor-shape',
          });
          return;
        }
        const atN = resolveAtNumber(w.at);
        if (atN === undefined || atN < 0) {
          issues.push({
            path: `${wAt}.at`,
            message:
              'at must be a non-negative number or { videoFrame: <non-negative number> }',
            severity: 'error',
            code: 'demonstrate/cursor-at-shape',
          });
        } else if (atN < prevAt) {
          issues.push({
            path: `${wAt}.at`,
            message: `cursor waypoints must be ordered by at (got ${atN} after ${prevAt})`,
            severity: 'error',
            code: 'demonstrate/cursor-at-out-of-order',
          });
        } else {
          prevAt = atN;
        }
        if (!finiteNumber(w.x)) {
          issues.push({
            path: `${wAt}.x`,
            message: 'x must be a finite number (pixels in clip-native canvas)',
            severity: 'error',
            code: 'demonstrate/cursor-x-shape',
          });
        }
        if (!finiteNumber(w.y)) {
          issues.push({
            path: `${wAt}.y`,
            message: 'y must be a finite number (pixels in clip-native canvas)',
            severity: 'error',
            code: 'demonstrate/cursor-y-shape',
          });
        }
        if (
          w.action !== undefined &&
          w.action !== 'move' &&
          w.action !== 'click' &&
          w.action !== 'hover'
        ) {
          issues.push({
            path: `${wAt}.action`,
            message: 'action must be one of "move", "click", "hover"',
            severity: 'error',
            code: 'demonstrate/cursor-action-shape',
          });
        }
      });
    }
  }

  // pins — optional. Each pin must carry (at, durationFrames, x, y, text);
  // the anchor + leader are optional with sensible defaults.
  if (scene.pins !== undefined) {
    if (!Array.isArray(scene.pins)) {
      issues.push({
        path: `${at}.pins`,
        message: 'pins must be an array of callout objects',
        severity: 'error',
        code: 'demonstrate/pins-not-array',
      });
    } else {
      scene.pins.forEach((p, k) => {
        const pAt = `${at}.pins[${k}]`;
        if (!p || typeof p !== 'object') {
          issues.push({
            path: pAt,
            message:
              'pin must be an object {at, durationFrames, x, y, text, anchor?, leader?}',
            severity: 'error',
            code: 'demonstrate/pin-shape',
          });
          return;
        }
        const atN = resolveAtNumber(p.at);
        if (atN === undefined || atN < 0) {
          issues.push({
            path: `${pAt}.at`,
            message:
              'at must be a non-negative number or { videoFrame: <non-negative number> }',
            severity: 'error',
            code: 'demonstrate/pin-at-shape',
          });
        }
        if (!finiteNumber(p.durationFrames) || p.durationFrames < 1) {
          issues.push({
            path: `${pAt}.durationFrames`,
            message: 'durationFrames must be a number >= 1',
            severity: 'error',
            code: 'demonstrate/pin-duration-shape',
          });
        }
        if (!finiteNumber(p.x)) {
          issues.push({
            path: `${pAt}.x`,
            message: 'x must be a finite number (pixels in clip-native canvas)',
            severity: 'error',
            code: 'demonstrate/pin-x-shape',
          });
        }
        if (!finiteNumber(p.y)) {
          issues.push({
            path: `${pAt}.y`,
            message: 'y must be a finite number (pixels in clip-native canvas)',
            severity: 'error',
            code: 'demonstrate/pin-y-shape',
          });
        }
        if (typeof p.text !== 'string' || !p.text.trim()) {
          issues.push({
            path: `${pAt}.text`,
            message: 'text must be a non-empty string',
            severity: 'error',
            code: 'demonstrate/pin-text-shape',
          });
        }
        if (
          p.anchor !== undefined &&
          p.anchor !== 'tl' &&
          p.anchor !== 'tr' &&
          p.anchor !== 'bl' &&
          p.anchor !== 'br'
        ) {
          issues.push({
            path: `${pAt}.anchor`,
            message: 'anchor must be one of "tl", "tr", "bl", "br"',
            severity: 'error',
            code: 'demonstrate/pin-anchor-shape',
          });
        }
        if (p.leader !== undefined && typeof p.leader !== 'boolean') {
          issues.push({
            path: `${pAt}.leader`,
            message: 'leader must be a boolean',
            severity: 'error',
            code: 'demonstrate/pin-leader-shape',
          });
        }
      });
    }
  }

  if (
    scene.cursorStyle !== undefined &&
    scene.cursorStyle !== 'mac' &&
    scene.cursorStyle !== 'windows'
  ) {
    issues.push({
      path: `${at}.cursorStyle`,
      message: 'cursorStyle must be one of "mac", "windows"',
      severity: 'error',
      code: 'demonstrate/cursor-style-shape',
    });
  }

  return issues;
};

export default validate;
