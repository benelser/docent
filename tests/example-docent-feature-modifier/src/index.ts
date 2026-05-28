// @example/docent-feature-modifier — the R3 modifier registry demo.
//
// A FeaturePlugin that uses registerModifiers to advertise two concrete
// modifiers — one film-tier, one scene-tier. The cascade walks the
// ModifierRegistry after preprocessSpec and merges the per-key patches
// into the appropriate target.
//
//   FILM tier — 'kicker-prefix'
//     A film with `modifiers: { 'kicker-prefix': 'OPENCLAW' }` gets
//     every scene's `kicker` field prefixed with that token. The
//     modifier reads the film, walks scenes, and merges back a
//     `defaultKickerPrefix` field on meta the renderer reads. Useful
//     for branded series.
//
//   SCENE tier — 'highlight'
//     A scene with `modifiers: { highlight: 2 }` gets node index 2
//     marked as the hero. The modifier returns `{accent: 'amber'}` —
//     a scene-level patch that overlays whatever the spec already
//     declared.
//
//   BEAT tier — 'pace-override'
//     A beat with `modifiers: { 'pace-override': 'hold' }` gets its
//     pace set to 'hold' regardless of the surrounding cadence. Useful
//     when authors want one beat to LAND.
//
// All three are SCOPED to the modifier id namespace. The cascade strips
// the 'modifiers' object from the spec before validation, so the
// per-target validators never see it.

import type {
  FeaturePlugin,
  ModifierContext,
  ModifierRegistry,
} from '@docent/kit';

// The kit's FilmMeta / Scene / Beat types are open-ended (they carry
// `[key: string]: unknown`), so a modifier patch can introduce a new
// field that the renderer reads. Cast to Record<string, unknown> to
// satisfy the typed ModifierFn signature.

const kickerPrefix = (value: unknown, _ctx: ModifierContext) => {
  if (typeof value !== 'string') return {} as Record<string, unknown>;
  // The modifier emits a meta-level prefix that the renderer can read.
  return {defaultKickerPrefix: value} as Record<string, unknown>;
};

const highlight = (value: unknown, _ctx: ModifierContext) => {
  // A scene-level patch that names the accent. The renderer reads
  // scene.accent (where supported) and uses it for hero emphasis.
  if (typeof value !== 'number') return {} as Record<string, unknown>;
  return {accent: 'amber', emphasisIndex: value} as Record<string, unknown>;
};

type BeatPace = 'hold' | 'settle' | 'normal' | 'brisk';

const paceOverride = (value: unknown, _ctx: ModifierContext) => {
  if (
    value !== 'hold' &&
    value !== 'settle' &&
    value !== 'normal' &&
    value !== 'brisk'
  )
    return {};
  return {pace: value as BeatPace};
};

export const modifierFeature: FeaturePlugin = {
  kind: 'feature',
  name: '@example/docent-feature-modifier',
  version: '0.1.0',

  registerModifiers(reg: ModifierRegistry): void {
    reg.film.set('kicker-prefix', kickerPrefix);
    reg.scene.set('highlight', highlight);
    reg.beat.set('pace-override', paceOverride);
  },
};

export default modifierFeature;
