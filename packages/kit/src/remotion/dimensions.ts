// dimensions — aspect-ratio → canvas dimensions + STAGE rectangle.
//
// docent's rendering surface was originally hard-coded at 1920x1080 (16:9).
// Multi-aspect support (Phase 3.1) adds two more canvas shapes:
//   - `'9:16'` → 1080x1920 (portrait — phone-vertical / TikTok-shape)
//   - `'1:1'`  → 1080x1080 (square — Instagram-feed shape)
//
// The composition reads `meta.aspect`, resolves dimensions through
// `resolveDimensions`, and threads the canvas size into the Remotion
// `<Composition>`. Inside the bundle, every scene calls `useStage()` and
// receives an aspect-aware `STAGE` rectangle to render its body into.
//
// Authoring contract: the STAGE rectangle is the *only* layout primitive a
// scene component needs to know about. All other safe-band math (heading
// position, card sizes, etc.) is keyed off STAGE or off the world
// dimensions returned alongside it.

import {useVideoConfig} from 'remotion';

/** The default film resolution — the 16:9 canvas every legacy film uses. */
export const DEFAULT_WIDTH = 1920;
export const DEFAULT_HEIGHT = 1080;

/**
 * The drawable STAGE rectangle each scene body renders within, plus the
 * world dimensions (matching the canvas) used by every scene's SVG
 * `viewBox`. STAGE is *inside* the world; the chrome (SceneFrame heading,
 * progress, watermark) occupies the rest.
 */
export interface StageRect {
  /** STAGE x-offset within the world (matches canvas-space pixels). */
  x: number;
  /** STAGE y-offset within the world. */
  y: number;
  /** STAGE width in world units. */
  w: number;
  /** STAGE height in world units. */
  h: number;
  /** World width — matches canvas width; scene SVGs use it as `viewBox` w. */
  worldW: number;
  /** World height — matches canvas height; scene SVGs use it as `viewBox` h. */
  worldH: number;
}

/**
 * The hard-coded STAGE for 16:9 — the central 1450x560 region inside the
 * 1920x1080 canvas. Every legacy film depends on these exact numbers;
 * touching them silently regresses every existing render.
 */
export const STAGE_16_9: StageRect = {
  x: 235,
  y: 338,
  w: 1450,
  h: 560,
  worldW: 1920,
  worldH: 1080,
};

/**
 * Portrait STAGE — narrow + tall. Canvas is 1080x1920. The chrome
 * (kicker, heading, progress dots, wordmark) takes a tall top band and a
 * tall bottom band, leaving the middle for diagrams.
 *
 * STAGE is centered: 100 px margin on each side (880 wide), 480 px top
 * band reserved for chrome, 1280 px tall body, 160 px bottom band.
 */
export const STAGE_9_16: StageRect = {
  x: 100,
  y: 480,
  w: 880,
  h: 1280,
  worldW: 1080,
  worldH: 1920,
};

/**
 * Square STAGE — centered 880x720 region inside the 1080x1080 canvas.
 * 100 px side margins, 280 px top chrome band (so the kicker/heading sits
 * above STAGE the way it does in 16:9), 80 px bottom chrome band.
 */
export const STAGE_1_1: StageRect = {
  x: 100,
  y: 280,
  w: 880,
  h: 720,
  worldW: 1080,
  worldH: 1080,
};

/**
 * Resolve `meta.aspect` → canvas dimensions. The `'16:9'` branch is the
 * default — every existing film without an explicit `aspect` renders
 * byte-identically because it returns the legacy 1920x1080 numbers.
 *
 * Authored on the `<Composition>` in `entry.tsx`; consumed nowhere else.
 *
 * @param aspect — one of `'16:9' | '9:16' | '1:1'` or `undefined` (defaults to `'16:9'`).
 * @returns `{w, h}` — the Remotion canvas size for the resolved aspect.
 */
export const resolveDimensions = (
  aspect: string | undefined,
): {w: number; h: number} => {
  const stage = resolveStage(aspect);
  return {w: stage.worldW, h: stage.worldH};
};

/**
 * Resolve `meta.aspect` → the full `StageRect` (STAGE rectangle + world
 * dimensions). Pure — no React hooks. Useful for tests and for any
 * non-component code that needs the layout up front.
 */
export const resolveStage = (aspect: string | undefined): StageRect => {
  switch (aspect) {
    case '9:16':
      return STAGE_9_16;
    case '1:1':
      return STAGE_1_1;
    case '16:9':
    case undefined:
    default:
      return STAGE_16_9;
  }
};

/**
 * `useStage()` — the React hook every scene component calls to retrieve
 * its STAGE rectangle. Reads the current Remotion `<Composition>` dims via
 * `useVideoConfig()` and matches them against the known canvas shapes.
 *
 * Returns `STAGE_16_9` as the safe fallback whenever the dims don't match
 * a known aspect — so an unrecognised canvas renders with the legacy
 * (landscape) layout rather than a blank scene.
 *
 * @returns the aspect-aware `StageRect` for the current composition.
 */
export const useStage = (): StageRect => {
  const {width, height} = useVideoConfig();
  if (width === 1080 && height === 1920) return STAGE_9_16;
  if (width === 1080 && height === 1080) return STAGE_1_1;
  return STAGE_16_9;
};
