// Scene-variant resolver — the overlay that turns an optional `archetype`
// + `variant` tag on a Scene into a small, render-time-readable token bag
// that scene components honour to scale title, pick entrance shape, tune
// accent strength, and show/hide the kicker.
//
// The shape mirrors the prior /ventures/250 visualStyle config (font
// sizes, spring physics, opacity curves, fade-vs-translate behaviour),
// re-anchored to the docent style system: the active `ResolvedStyle` is
// the baseline; the variant table picks a treatment; the archetype table
// nudges the treatment toward the rhetorical move's natural shape.
//
// Compose order (later wins):
//   baseline (titleScale=1, entrance fade, kicker visible, …)
//   → VARIANT_TABLE[variant]            (e.g. `bold` → titleScale 1.25)
//   → ARCHETYPE_NUDGE[archetype]        (e.g. `provocation` → ×1.1 + snap)
//
// What this file does NOT do:
//   - Pixel-level rendering. The token bag is data; the scene component
//     reads it and decides what to do at render time.
//   - Brand-pack extension (yet). The two tables are kit-owned and
//     baked in for v1; a future hook on `PresetPlugin` or a new
//     `VariantPlugin` can let brand packs ship their own overlays.

import type {ResolvedStyle} from '../types/style';
import type {SceneArchetype, SceneVariant} from '../types/spec';

/**
 * The variant overlay scene components read at render time. Carried on
 * {@link CommonSceneProps.variantTokens}. Every field is non-optional —
 * the resolver always returns a complete bag — so a scene component can
 * read `variantTokens.titleScale` without nullchecks.
 *
 * The bag is small by design: each field has one purpose, and each scene
 * component owns its own mapping from the token to a CSS / spring /
 * layout choice. Adding a new dimension is cheap; the kit just extends
 * this interface and updates the resolver.
 */
export interface SceneVariantTokens {
  /**
   * Multiplier on the title's basePx (or the equivalent hero-text size the
   * scene picks). `bold` = 1.25; `minimal` = 0.85; baseline = 1.0.
   *
   * A scene component computes its hero size, then multiplies by this
   * before rendering. Floor/ceiling clamps are the component's
   * responsibility — the resolver only declares the dial.
   */
  readonly titleScale: number;
  /**
   * The entrance animation shape used by the *primary* reveal in the
   * scene (the title, the hero, the first beat). A scene component reads
   * this and picks one of four physics:
   *  - `'fade'` — opacity only, no translate.
   *  - `'translate'` — slide-in from below.
   *  - `'spring'` — Remotion `spring()` with default damping.
   *  - `'snap'` — instant, no interpolation (the provocation shape).
   */
  readonly entranceShape: 'fade' | 'translate' | 'spring' | 'snap';
  /**
   * Ramp duration in milliseconds. The scene component converts to frames
   * using the active fps. Lower bound: 0 (snap). Upper bound: 1200.
   */
  readonly entranceMs: number;
  /**
   * Strength of the accent treatment — multiplier on shadow/glow opacity,
   * divider line alpha, etc. `bold` = 1.0; `minimal` = 0.6; baseline = 0.85.
   */
  readonly accentOpacity: number;
  /**
   * Density of the scene's primary grid (gap and padding scale). Most
   * v1 scene components ignore this; structure honours it.
   *
   *  - `'tight'`  — gaps collapsed.
   *  - `'normal'` — baseline.
   *  - `'wide'`   — gaps widened (the `stacked` variant's default).
   */
  readonly gridDensity: 'tight' | 'normal' | 'wide';
  /**
   * Whether the scene's kicker (the small label above the heading) is
   * rendered. `minimal` = false; baseline = true. Scene components that
   * draw their own kicker honour this; chrome-rendered kickers (via
   * `SceneFrame`) pass an empty string when this is false.
   */
  readonly kickerVisible: boolean;
}

// ---- baseline -------------------------------------------------------------

/**
 * The do-nothing default. Returned when `archetype` and `variant` are both
 * absent — every existing film renders byte-identically to v1.
 */
export const STANDARD_VARIANT_TOKENS: Readonly<SceneVariantTokens> = Object.freeze({
  titleScale: 1.0,
  entranceShape: 'fade',
  entranceMs: 420,
  accentOpacity: 0.85,
  gridDensity: 'normal',
  kickerVisible: true,
});

// ---- variant table --------------------------------------------------------

/**
 * The closed table of variant overlays — one entry per {@link SceneVariant}.
 *
 * Each entry is a *delta* against {@link STANDARD_VARIANT_TOKENS}; the
 * resolver applies the delta on top of the baseline (later wins). Fields
 * omitted from an entry mean "inherit baseline".
 */
const VARIANT_TABLE: Readonly<Record<SceneVariant, Partial<SceneVariantTokens>>> = Object.freeze({
  standard: {},
  bold: {
    titleScale: 1.25,
    entranceShape: 'snap',
    entranceMs: 180,
    accentOpacity: 1.0,
    gridDensity: 'normal',
    kickerVisible: true,
  },
  stacked: {
    titleScale: 1.05,
    entranceShape: 'translate',
    entranceMs: 520,
    accentOpacity: 0.9,
    gridDensity: 'wide',
    kickerVisible: true,
  },
  minimal: {
    titleScale: 0.85,
    entranceShape: 'fade',
    entranceMs: 640,
    accentOpacity: 0.6,
    gridDensity: 'tight',
    kickerVisible: false,
  },
});

// ---- archetype nudge ------------------------------------------------------

/**
 * Archetype nudges — applied *on top of* the variant overlay. These
 * multiply the title scale (rather than overwriting it) so a
 * `provocation` × `minimal` still reads as smaller-than-default while
 * leaning louder than a plain `minimal`.
 *
 * `entranceShape` and `cadenceHint` on an archetype overwrite the
 * variant's choice — the rhetorical move's natural shape wins. A
 * `mirror` archetype always fades, regardless of variant.
 */
interface ArchetypeNudge {
  readonly titleScaleMul?: number;
  readonly entranceShape?: SceneVariantTokens['entranceShape'];
  readonly entranceMsDelta?: number;
  readonly accentOpacityMul?: number;
}

/**
 * The closed table of archetype nudges. Public so a brand-pack
 * developer can introspect; the resolver consumes it internally.
 */
export const ARCHETYPE_NUDGE: Readonly<Record<SceneArchetype, ArchetypeNudge>> = Object.freeze({
  provocation: {
    titleScaleMul: 1.1,
    entranceShape: 'snap',
    entranceMsDelta: -120,
    accentOpacityMul: 1.1,
  },
  turn: {
    titleScaleMul: 1.0,
    entranceShape: 'translate',
    entranceMsDelta: 0,
    accentOpacityMul: 1.0,
  },
  question: {
    titleScaleMul: 1.0,
    entranceShape: 'spring',
    entranceMsDelta: 80,
    accentOpacityMul: 0.95,
  },
  list: {
    titleScaleMul: 0.98,
    entranceShape: 'translate',
    entranceMsDelta: 60,
    accentOpacityMul: 0.9,
  },
  history: {
    titleScaleMul: 0.96,
    entranceShape: 'fade',
    entranceMsDelta: 200,
    accentOpacityMul: 0.85,
  },
  mirror: {
    titleScaleMul: 0.95,
    entranceShape: 'fade',
    entranceMsDelta: 160,
    accentOpacityMul: 0.8,
  },
});

// ---- resolver -------------------------------------------------------------

/**
 * Resolve the variant overlay for a scene.
 *
 * @param style       — the active resolved style. Reserved for future
 *                      brand-pack-driven overlays (a `PresetPlugin` will
 *                      be able to contribute its own variant deltas);
 *                      v1 ignores it.
 * @param archetype   — optional rhetorical archetype.
 * @param variant     — optional visual variant; absent defaults to
 *                      `'standard'`.
 *
 * @returns a complete, frozen {@link SceneVariantTokens} bag — every
 *          field has a value. When both `archetype` and `variant` are
 *          absent the return is byte-identical to
 *          {@link STANDARD_VARIANT_TOKENS}, so existing films don't
 *          shift.
 */
export const resolveSceneVariant = (
  style: ResolvedStyle,
  archetype: SceneArchetype | undefined,
  variant: SceneVariant | undefined,
): SceneVariantTokens => {
  // No tags = baseline. Cheapest possible path so v1 films pay zero cost.
  if (archetype === undefined && variant === undefined) {
    return STANDARD_VARIANT_TOKENS;
  }

  // Reserved: the style argument is the future extension hook for
  // brand-pack overlays. Touch it so the linter knows we read it.
  void style;

  // 1. Start from the baseline.
  // 2. Layer the variant delta.
  const v = variant ?? 'standard';
  const variantDelta = VARIANT_TABLE[v] ?? {};

  let titleScale =
    variantDelta.titleScale ?? STANDARD_VARIANT_TOKENS.titleScale;
  let entranceShape =
    variantDelta.entranceShape ?? STANDARD_VARIANT_TOKENS.entranceShape;
  let entranceMs =
    variantDelta.entranceMs ?? STANDARD_VARIANT_TOKENS.entranceMs;
  let accentOpacity =
    variantDelta.accentOpacity ?? STANDARD_VARIANT_TOKENS.accentOpacity;
  const gridDensity =
    variantDelta.gridDensity ?? STANDARD_VARIANT_TOKENS.gridDensity;
  const kickerVisible =
    variantDelta.kickerVisible ?? STANDARD_VARIANT_TOKENS.kickerVisible;

  // 3. Layer the archetype nudge. titleScale + accentOpacity multiply
  //    (so a `provocation × minimal` is louder than a plain minimal but
  //    still smaller than a `provocation × bold`). entranceShape and
  //    entranceMs are nudges: the archetype's rhetorical shape wins.
  if (archetype !== undefined) {
    const nudge = ARCHETYPE_NUDGE[archetype];
    if (nudge) {
      titleScale *= nudge.titleScaleMul ?? 1;
      if (nudge.entranceShape !== undefined) {
        entranceShape = nudge.entranceShape;
      }
      entranceMs = Math.max(0, entranceMs + (nudge.entranceMsDelta ?? 0));
      accentOpacity = Math.min(
        1.25,
        Math.max(0, accentOpacity * (nudge.accentOpacityMul ?? 1)),
      );
    }
  }

  // Clamp the title scale to a sane band so a malformed brand pack can't
  // explode the type out of the safe area.
  const clampedTitleScale = Math.max(0.5, Math.min(1.6, titleScale));

  return Object.freeze({
    titleScale: clampedTitleScale,
    entranceShape,
    entranceMs,
    accentOpacity,
    gridDensity,
    kickerVisible,
  });
};
