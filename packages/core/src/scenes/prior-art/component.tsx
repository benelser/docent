// component — the React/Remotion render function for the prior-art scene.
//
// MIGRATED from `packages/engine/src/scenes/PriorArtScene.tsx`. In v3.0
// Phase B (this build) the engine still owns the active render path —
// `packages/engine/src/Film.tsx`'s 29-way switch continues to instantiate
// the original `PriorArtScene` directly. THIS component formalises the
// plugin's `component` surface so:
//
//   1. The ScenePlugin contract is satisfied (a `React.ComponentType<
//      SceneRenderProps<Scene>>` is required by the kit).
//   2. Phase D (`Film.tsx` → registry dispatch) can swap the engine's
//      switch for `engine.scenes.get('prior-art').component` without
//      touching this plugin again — the wire-in is a one-line change in
//      `Film.tsx`, not a 29-way refactor of every plugin's component.
//
// Until Phase D wires the dispatch, this component is intentionally a
// thin placeholder: it renders nothing. Calling it through the engine
// today would be a routing bug, not a render bug — the engine's own
// switch still owns the active visuals.
//
// The pixel-level behaviour (table geometry, novelty row glow, reveal
// timing, focus dimming, narration overlay) all stays in
// `packages/engine/src/scenes/PriorArtScene.tsx` unchanged. When Phase D
// activates this plugin, the engine's copy gets DELETED and the renderer
// is ported in one move — preserving byte-for-byte parity against the
// hermetic gallery.

import React from 'react';

import type {Scene, SceneRenderProps} from '@docent/kit';

export const Component: React.FC<SceneRenderProps<Scene>> = (_props) => {
  // Phase D: this returns the full `<SceneFrame>...<AbsoluteFill>...` tree
  // from `packages/engine/src/scenes/PriorArtScene.tsx`. Until then the
  // engine's switch routes around this — the placeholder is the contract,
  // not the renderer.
  return null;
};

export default Component;
