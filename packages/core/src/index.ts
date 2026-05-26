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

// Re-exports for callers that want named imports.
export {
  neutralPreset, engineeringPreset, editorialPreset,
  paperPreset, analyticalPreset, executivePreset,
};
export {narrationFeature, audioRhythmFeature};

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
];

export default corePlugins;
