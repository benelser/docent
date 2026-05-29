// docent.config.ts — repo-root extension point for the brand-pack tutorial.
//
// The CLI's engine factory walks UP from the working directory looking for
// the first `docent.config.{ts,tsx,js,mjs}` it finds (see
// packages/cli/src/load-config.ts). When found, its default export's
// `plugins` array is registered on top of @bjelser/core's `corePlugins`.
//
// This file is the load-bearing seam in the third-party-pack on-ramp: a
// project ships a preset / scene type / TTS provider / feature by
// declaring it here — no fork of @bjelser/core required.
//
// The tutorial film (films/brand-pack-tutorial.json) opens this exact file
// in a `closeup` scene to show the wiring; if you change the import path,
// keep the film's `code` field in sync.

import {tutorialBrandPreset} from './tutorials/brand-pack/presets/tutorial-brand';

export default {
  plugins: [tutorialBrandPreset],
};
