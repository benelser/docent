// @docent/core — the default implementation of @docent/kit.
//
// This file is assembled at integration time. Each plugin (scene, preset,
// feature, TTS) lives in its own subdirectory and is migrated independently
// during the Phase B fan-out. The integrator (main session) re-exports each
// plugin from here once it lands.
//
// The pattern:
//
//   import {framePlugin} from './scenes/frame';
//   import {neutralPreset} from './presets/neutral';
//   import {narrationFeature} from './features/narration';
//   import {kokoroTtsPlugin} from './tts/kokoro';
//
//   export const corePlugins = [
//     framePlugin, /* ... */,
//     neutralPreset, /* ... */,
//     narrationFeature, /* ... */,
//     kokoroTtsPlugin,
//   ];
//
//   export default corePlugins;
//
// Per the strategic plan, this manifest is the SINGLE merge-conflict-prone
// point of the fan-out — kept manual on purpose so the integrator owns it.

import type {Plugin} from '@docent/kit';

// Phase B agents register their plugins below as they complete. The
// integrator merges each branch one at a time, adding to this array.

export const corePlugins: Plugin[] = [];

export default corePlugins;
