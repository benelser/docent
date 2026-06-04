// Node-only loudness surface — mirrors the `engine-render.ts` pattern.
//
// The cascade's loudnorm helper lives under `./cascade/loudnorm.ts` and
// shells to ffmpeg via `node:child_process`. The kit's `index.ts` does
// not re-export it because the web bundle stubs `node:*` modules — any
// static `import from '@bjelser/kit'` that ended at child_process would
// break a browser consumer.
//
// This file is the Node-only re-export point. The CLI imports it the
// same way it would import `engine-render.ts`: by deep path, or via the
// engine's runtime-built dynamic import that hides the specifier from
// webpack's static analyser.

export {
  LOUDNESS_PRESETS,
  buildNormalizedOutPath,
  measureLoudness,
  normalizeLoudness,
  resolveLoudnessTarget,
} from './cascade/loudnorm';

export type {LoudnessMeasurement} from './cascade/loudnorm';
