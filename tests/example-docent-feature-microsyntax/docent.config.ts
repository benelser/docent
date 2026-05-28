// docent.config.ts — wires @example/docent-feature-microsyntax into the engine.
//
// The CLI's engine factory registers @docent/core's plugins first; the
// `plugins` array below is registered on top. We only register the
// microsyntax feature here — corePlugins are NOT redeclared (the CLI
// adds them).
//
// The feature implements FeaturePlugin.preprocessSpec — the cascade
// orchestrator runs every registered preprocessSpec hook BEFORE the
// validator sees the spec, so @@@auto-id / @@@reveal-all / @@@beat-stride
// directives get expanded transparently.

import microsyntaxFeature from './src';

export default {
  plugins: [microsyntaxFeature],
};
