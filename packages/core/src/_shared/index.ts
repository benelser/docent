// _shared — chrome infrastructure consumed by every @docent/core scene.
//
// The 29 scenes used to each carry their own underscore-prefixed copies of
// these helpers (SceneFrame, Narration, FittedText, fonts, glow, palette
// resolvers, …). Wave A1 of v3.0 stabilization consolidates them here. A
// scene reaches for chrome through `../../_shared` (or one of the named
// sub-modules below) — never reaches into `packages/engine/`.
//
// Closed surface: everything intentionally exported is listed here. Add a
// new helper only by also exporting it from this barrel.

export {interFamily, monoFamily} from './fonts';
export {codeTheme} from './code-theme';
export {
  FittedText,
  fitFontSize,
  truncateForSlot,
  type FittedTextMode,
  type FittedTextProps,
} from './fitted-text';
export {Narration} from './narration';
export {SceneFrame, type CameraState} from './scene-frame';
export {BoundValue, formatValue} from './bound-value';
export {
  ACCENTS,
  CASCADE_STEP,
  cadenceAppear,
  cadenceOffset,
  cadenceSpringConfig,
  activeBeatIndex,
  glow,
  numericRevealMap,
  paletteAccentKey,
  paletteGlowScale,
  paletteSceneHex,
  theme,
  tweenValue,
  type AccentKey,
  type Metric,
  type MetricFormat,
  type PaletteName,
  type RevealEntry,
  type Tween,
} from './helpers';
