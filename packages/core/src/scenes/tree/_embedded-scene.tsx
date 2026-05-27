// Local EmbeddedScene — Sprint B compositional grammar.
//
// Re-export shim for the canonical renderer in
// `packages/core/src/_shared/embedded-scene.tsx`. The tree scene's
// component.tsx reaches the embed renderer through this module, so the
// re-export keeps the import surface stable across the consolidation.

export {
  EmbeddedScene,
  type EmbedBounds,
  type EmbeddedSceneSpec,
} from '../../_shared/embedded-scene';
