// Inlined helpers for the tree scene.
//
// Mirror the v2.5.x engine's shared utilities (`glow`, `STAGE`, the palette
// resolvers, `cadenceOffset`, `ACCENTS`, `activeBeatIndex`) the TreeScene
// component reads. The v3.0 fan-out moves each scene into its own directory
// in @docent/core; the shared component infrastructure will be migrated by
// separate agents and reconciled by the integrator at merge time. Until
// then we colocate the minimum each scene needs so the per-scene worktree
// builds clean.
//
// When the shared-infra migration lands, the tree scene will import these
// from @docent/core/_shared (or equivalent) and this file goes away.

import type {ResolvedStyle} from '@docent/kit';

// ----- stage geometry (mirrors packages/engine/src/engine/layout.ts) -------

/**
 * The drawable region inside the SceneFrame chrome — the rectangle the
 * scene body owns. (1920×1080 stage; chrome takes the rest.)
 */
export const STAGE = {x: 235, y: 338, w: 1450, h: 560};

// ----- glow (mirrors packages/engine/src/theme.ts) -------------------------

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

// ----- accent table (mirrors packages/engine/src/theme.ts) -----------------

/**
 * The dark-console accent palette. The default tokens fall back to this
 * table when a `ResolvedStyle` doesn't supply its own.
 */
export const ACCENTS: Record<string, string> = {
  blue: '#5cb6ff',
  cyan: '#3fe0d0',
  green: '#5fe8a4',
  amber: '#ffc24d',
  rose: '#ff7d97',
  violet: '#b69cff',
};

// ----- cadence (mirrors packages/engine/src/engine/knobs.ts) ---------------

/** Frames of stagger between cascaded items. */
export const CASCADE_STEP = 5;

/**
 * The per-item entrance-frame offset for the item at declared `order`
 * within a beat's revealed set. `cascade` staggers; `together`/`snap` do
 * not. Mirrors knobs.ts exactly so a tree spec renders byte-identical
 * across the v2.5 → v3 migration.
 */
export const cadenceOffset = (
  cadence: 'together' | 'cascade' | 'snap' | undefined,
  order: number,
): number => (cadence === 'cascade' ? Math.max(0, order) * CASCADE_STEP : 0);

// ----- palette resolvers (mirrors packages/engine/src/engine/knobs.ts) -----

/**
 * Resolve an accent *key* under a scene's palette. Without a palette this
 * is the identity — the element's own accent, else the scene's, else the
 * universal default ('blue', which every preset defines).
 *
 * The tree scene only ever calls this with `palette = undefined` (per
 * v2.4.0 the palette knob was removed; the helper survives so future
 * re-introduction can plug back in without another migration). The
 * identity branch returns `ownAccent ?? sceneAccent ?? 'blue'`.
 */
export const paletteAccentKey = (
  palette: undefined,
  sceneAccent: string | undefined,
  ownAccent: string | undefined,
  index = 0,
): string => {
  void palette;
  void index;
  return ownAccent ?? sceneAccent ?? 'blue';
};

/**
 * The resolved accent *hex* for the scene as a whole. Used for the
 * scene's chrome. With no `palette` (the v2.4.0+ default state of every
 * caller) this is exactly `style.tokens.accent[sceneAccent ?? 'blue']`.
 */
export const paletteSceneHex = (
  palette: undefined,
  sceneAccent: string | undefined,
  style?: ResolvedStyle,
): string => {
  void palette;
  const key = sceneAccent ?? 'blue';
  const table = (style?.tokens.accent ?? ACCENTS) as Record<string, string>;
  return table[key] ?? table.blue ?? ACCENTS.blue;
};

/**
 * The glow-intensity multiplier a scene's palette implies. 1 (the
 * identity) when no palette is set — which, post-v2.4.0, is every caller.
 */
export const paletteGlowScale = (palette: undefined): number => {
  void palette;
  return 1;
};

// ----- active beat (mirrors packages/engine/src/engine/spec.ts) ------------

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
