// ModifierRegistry — **R3 forward-compat. Empty in this build.**
//
// The registry holds three Maps (one per tier — film, scene, beat) that a
// `FeaturePlugin.registerModifiers(reg)` hook can populate. The shape is
// declared in `../protocols.ts` (`ModifierRegistry`); this file is the
// concrete empty instance used by the engine.
//
// **Modifiers are NOT a plugin kind.** A modifier is a function registered
// THROUGH a feature plugin. The four plugin kinds remain
// `scene | preset | tts | feature` for the public `engine.use()` surface.
//
// R3 lands by:
//   (a) exposing a user-facing config surface (`docent.config.ts`'s
//       `modifiers: { ... }` field) the engine compiles into a synthetic
//       feature plugin at boot.
//   (b) making the engine's spec resolver walk this registry — currently a
//       no-op pass that becomes load-bearing.
// Neither (a) nor (b) breaks `@bjelser/kit`'s public API; both are additive.

import type {
  Beat,
  FilmMeta,
  ModifierFn,
  ModifierRegistry,
  Scene,
} from '../protocols';

/**
 * The empty-but-typed ModifierRegistry. Populated through
 * `FeaturePlugin.registerModifiers(reg)`. The engine's resolve pass walks
 * it (no-op when empty); R3 lights up the same code path with non-empty
 * Maps.
 */
export class ModifierRegistryImpl implements ModifierRegistry {
  readonly film: Map<string, ModifierFn<unknown, Partial<FilmMeta>>> = new Map();
  readonly scene: Map<string, ModifierFn<unknown, Partial<Scene>>> = new Map();
  readonly beat: Map<string, ModifierFn<unknown, Partial<Beat>>> = new Map();
}
