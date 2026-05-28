// @example/docent-feature-captions — an SRT captions sidecar feature.
//
// Demonstrates `FeaturePlugin.afterRender` as the post-render hook for
// side-output writers. When `engine.render(spec, ...)` completes, the
// orchestrator calls this plugin's `afterRender`; the hook consumes the
// per-beat TTS clip durations + the spec's narration text and writes a
// SubRip (`.srt`) file alongside the rendered mp4.
//
// A consumer wires this pack into the engine via:
//
//   import {Engine} from '@bjelser/kit';
//   import corePlugins from '@bjelser/core';
//   import captions from '@example/docent-feature-captions';
//
//   const engine = new Engine().use(corePlugins).use(captions);
//
// The next render writes `<outputDir>/<filmId>.srt` next to the mp4.

import type {Plugin} from '@bjelser/kit';

import {captionsFeature} from './captions/feature';

export {captionsFeature} from './captions/feature';

const plugins: ReadonlyArray<Plugin> = [captionsFeature];

export default plugins;
