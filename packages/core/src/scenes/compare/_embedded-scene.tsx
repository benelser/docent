// Local EmbeddedScene — Sprint B compositional grammar.
//
// Re-export shim for the canonical renderer in
// `packages/core/src/_shared/embedded-scene.tsx`. This file used to inline
// a minimal placeholder; A3 of the v3.0 stabilization sprint replaced the
// placeholder with a real per-type tableau dispatcher in `_shared`.
//
// The host's `component.tsx` imports `EmbeddedScene` from
// `./_embedded-scene`; keeping this shim avoids editing the component.

export {
  EmbeddedScene,
  type EmbedBounds,
  type EmbeddedSceneSpec,
} from '../../_shared/embedded-scene';
