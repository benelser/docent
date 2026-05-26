// narrationFeature — the per-beat narration overlay, expressed as a
// FeaturePlugin (see plugin-architecture-strategy.md §4.5).
//
// In the v1 plugin protocol the engine still owns the render pipeline; this
// plugin's `wrapRender` is a pass-through. The point of landing it now is to
// formalise the SURFACE: when Phase D moves `Film.tsx` to a dispatcher that
// routes scenes through registered feature hooks, this plugin's `wrapRender`
// is where the `Narration` overlay attaches — no migration of the protocol
// itself required.
//
// Hooks used in v1: `wrapRender` (identity).
// Hooks reserved for later phases: `injectStyleTokens` (caption typography),
// `registerModifiers` (R3 microsyntax).

import type {FeaturePlugin, SceneOutput} from '@docent/kit';

export {Narration} from './component.js';
export type {NarrationBeat, NarrationProps} from './component.js';

export const narrationFeature: FeaturePlugin = {
  kind: 'feature',
  name: 'narration',
  version: '1.0.0',

  // Narration ATTACHES per-scene via this hook — the engine renders the scene
  // component, then the feature overlays the narration audio (and, later,
  // captions) on top. For v1 the narration is essentially baked into the
  // engine's SceneFrame already; full migration of the overlay's role is
  // deferred to Phase D when Film.tsx becomes the dispatcher.
  wrapRender(rendered: SceneOutput, _ctx): SceneOutput {
    return rendered;
  },
};

export default narrationFeature;
