// @docent/core — the default implementation of @docent/kit.
//
// Plugin manifest. Each plugin lives in its own subdirectory and is
// migrated independently during the Phase B fan-out. The integrator
// re-exports each plugin from here as it lands.
//
// Loading:
//
//   import {Engine} from '@docent/kit';
//   import {corePlugins} from '@docent/core';
//   const engine = new Engine().use(corePlugins);

import type {Plugin} from '@docent/kit';

// Presets (6)
import {neutralPreset} from './presets/neutral';
import {engineeringPreset} from './presets/engineering';
import {editorialPreset} from './presets/editorial';
import {paperPreset} from './presets/paper';
import {analyticalPreset} from './presets/analytical';
import {executivePreset} from './presets/executive';

// Features (2)
import {narrationFeature} from './features/narration';
import {audioRhythmFeature} from './features/audio-rhythm';

// TTS providers (1 — Kokoro; OpenAI/ElevenLabs/compatible stay in engine
// for now and migrate when Build A's TS providers split into separate
// @docent/tts-* packages in a later release)
import {kokoroTtsPlugin} from './tts/kokoro';

// Scenes (6 of 29 so far — migrations land additively as agents return)
import diffPlugin from './scenes/diff';
import {epigraphPlugin} from './scenes/epigraph';
import {mechanismPlugin} from './scenes/mechanism';
import {objectionPlugin} from './scenes/objection';
import {priorArtPlugin} from './scenes/prior-art';
import {quantitiesPlugin} from './scenes/quantities';

// Re-exports for callers that want named imports.
export {
  neutralPreset, engineeringPreset, editorialPreset,
  paperPreset, analyticalPreset, executivePreset,
};
export {narrationFeature, audioRhythmFeature};
export {kokoroTtsPlugin};

/**
 * The set of plugins shipped with `@docent/core` — the opinionated default
 * implementation. Loading order is irrelevant; the engine's `use()` sniffs
 * plugin.kind and dispatches to the right registry.
 *
 * This manifest grows additively as Phase B agents return. Wave 1 + Wave 2
 * are in flight; entries land here when their worktrees merge.
 */
export const corePlugins: readonly Plugin[] = [
  // Presets (6)
  neutralPreset,
  engineeringPreset,
  editorialPreset,
  paperPreset,
  analyticalPreset,
  executivePreset,
  // Features (2)
  narrationFeature,
  audioRhythmFeature,
  // TTS (1)
  kokoroTtsPlugin,
  // Scenes (6 of 29)
  diffPlugin,
  epigraphPlugin,
  mechanismPlugin,
  objectionPlugin,
  priorArtPlugin,
  quantitiesPlugin,
];

export default corePlugins;
