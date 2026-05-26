// Inlined helpers for the timeline scene.
//
// MIRROR of the v2.5.x engine's STAGE / glow / activeBeatIndex / palette
// resolvers. Each scene in the v3.0 fan-out colocates the minimum infra it
// needs so the per-scene worktree builds clean and the plugin carries no
// dependency on @docent/engine. The shared component infrastructure
// (SceneFrame, Narration, FittedText, fonts) will be migrated by separate
// agents and reconciled by the integrator at merge time; until then, each
// scene's underscore-prefixed local helpers stand in.

import type {ResolvedStyle} from '@docent/kit';

/** The stage: the rectangle within the 1920x1080 frame where diagrams live. */
export const STAGE = {x: 235, y: 338, w: 1450, h: 560};

/**
 * Translucent accent fills, for glows and panel washes. Mirrors
 * packages/engine/src/theme.ts:glow exactly.
 */
export const glow = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
};

/** Hardcoded accent fallbacks — mirrors theme.ts:ACCENTS. */
const FALLBACK_ACCENTS: Record<string, string> = {
  blue: '#5cb6ff',
  cyan: '#3fe0d0',
  green: '#5fe8a4',
  amber: '#ffc24d',
  rose: '#ff7d97',
  violet: '#b69cff',
};

/**
 * The resolved accent *hex* for the scene as a whole. Used for the timeline's
 * chrome (axis dots, span fills, focused glow). The timeline never sets a
 * palette and never carries a scene-level accent override, so this resolves
 * to `style.tokens.accent.blue` — exactly what `paletteSceneHex(undefined,
 * undefined, style)` returns in v2.5.x.
 */
export const sceneAccentHex = (style: ResolvedStyle): string => {
  const table = style.tokens.accent as unknown as Record<string, string>;
  return table.blue ?? FALLBACK_ACCENTS.blue;
};

/**
 * The glow-intensity multiplier a scene's palette implies. Without a
 * palette — every v2.4.0+ caller — this is the identity (1).
 */
export const paletteGlowScale = (): number => 1;

/**
 * Which beat is on screen at a given (scene-relative) frame. Mirrors the
 * v2.5.x engine's `activeBeatIndex`, adapted to walk the kit's
 * BeatTimelineSlot[] (which exposes `startFrame` rather than the legacy
 * `from`).
 */
export const activeBeatIndex = (
  beats: ReadonlyArray<{readonly startFrame: number}>,
  frame: number,
): number => {
  for (let i = beats.length - 1; i >= 0; i--) {
    const b = beats[i];
    if (b && frame >= b.startFrame) return i;
  }
  return 0;
};
