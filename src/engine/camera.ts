// The camera. A scene's diagram lives in a fixed 1920x1080 "world"; the camera
// leans toward the component under discussion. Crucially it is *hard-clamped*:
// the diagram can never ride up under the heading or off any edge — the camera
// pans and zooms only within a safe band, so it cannot break the layout.

import {interpolate, spring} from 'remotion';
import {STAGE, type Box} from './layout';

export const VIEW = {w: 1920, h: 1080};

// The band the diagram is allowed to occupy: clear of the heading (top) and
// the progress bar (bottom), with side margins.
const SAFE = {x0: 70, y0: 268, x1: 1850, y1: 1004};

export type CameraState = {scale: number; tx: number; ty: number};

type Rect = {x0: number; y0: number; x1: number; y1: number};

const worldBox = (boxes: Box[]): Rect => {
  if (boxes.length === 0)
    return {x0: STAGE.x, y0: STAGE.y, x1: STAGE.x + STAGE.w, y1: STAGE.y + STAGE.h};
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.cx - b.w / 2);
    y0 = Math.min(y0, b.cy - b.h / 2);
    x1 = Math.max(x1, b.cx + b.w / 2);
    y1 = Math.max(y1, b.cy + b.h / 2);
  }
  return {x0, y0, x1, y1};
};

const clamp = (v: number, a: number, b: number) =>
  Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));

// A shot that leans toward `focus`, then is clamped so the whole world stays
// inside SAFE — never under the heading, never off-screen.
const composeShot = (world: Rect, focus: Box[]): CameraState => {
  if (focus.length === 0) return {scale: 1, tx: 0, ty: 0}; // the resting wide shot

  const worldW = world.x1 - world.x0;
  const worldH = world.y1 - world.y0;
  const safeW = SAFE.x1 - SAFE.x0;
  const safeH = SAFE.y1 - SAFE.y0;

  // Never zoom past the point where the whole world still fits the safe band —
  // this is what makes off-screen / under-heading structurally impossible.
  const sMax = Math.min(safeW / worldW, safeH / worldH, 1.3);
  const scale = clamp(1.18, 1.0, sMax);

  const fx = focus.reduce((a, b) => a + b.cx, 0) / focus.length;
  const fy = focus.reduce((a, b) => a + b.cy, 0) / focus.length;
  let tx = VIEW.w / 2 - fx * scale;
  let ty = VIEW.h / 2 - fy * scale;

  tx = clamp(tx, SAFE.x0 - world.x0 * scale, SAFE.x1 - world.x1 * scale);
  ty = clamp(ty, SAFE.y0 - world.y0 * scale, SAFE.y1 - world.y1 * scale);
  return {scale, tx, ty};
};

// A whisper of idle drift, so a held shot is never perfectly dead.
const drift = (frame: number, fps: number, amt = 4): {x: number; y: number} => {
  const t = frame / fps;
  return {x: Math.sin(t * 0.32) * amt, y: Math.cos(t * 0.26) * amt * 0.6};
};

// The resolved camera for the current frame: ease from the previous beat's
// shot to the active one, plus the drift.
export const resolveCamera = (
  beats: {from: number; focus?: string[]}[],
  active: number,
  boxesById: Record<string, Box>,
  frame: number,
  fps: number,
): CameraState => {
  const world = worldBox(Object.values(boxesById));
  const shotFor = (i: number): CameraState => {
    const f = (beats[i]?.focus ?? [])
      .map((id) => boxesById[id])
      .filter((b): b is Box => Boolean(b));
    return composeShot(world, f);
  };
  const cur = shotFor(active);
  const prev = shotFor(Math.max(0, active - 1));
  const local = frame - (beats[active]?.from ?? 0);
  const p =
    local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass: 1.1}});
  const d = drift(frame, fps);
  return {
    scale: interpolate(p, [0, 1], [prev.scale, cur.scale]),
    tx: interpolate(p, [0, 1], [prev.tx, cur.tx]) + d.x,
    ty: interpolate(p, [0, 1], [prev.ty, cur.ty]) + d.y,
  };
};
