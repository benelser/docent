// docent.config.ts — wires @example/docent-feature-captions into the engine.
//
// The captions feature implements `FeaturePlugin.afterRender` — when the
// orchestrator finishes the render stage, the hook fires and the SRT
// sidecar is written next to the mp4. No CLI changes; pure protocol.

import captions from './src';

export default {
  plugins: captions,
};
