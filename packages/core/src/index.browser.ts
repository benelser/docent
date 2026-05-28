// Browser-safe entry — same plugin set as the default index EXCEPT the
// TTS providers. TTS providers import `node:fs` (for cache-dir setup) and
// `node:path`/`node:os` indirectly — those break Remotion's webpack bundle
// when chrome-headless renders frames in-browser.
//
// The Remotion render-entry only needs SCENE plugins, FEATURE plugins,
// and PRESET plugins to draw frames. TTS runs Node-side during the
// cascade, not in the browser bundle.
//
// Loaded by @bjelser/cli's generated render-entry via the `./browser`
// subpath export. The default `@bjelser/core` (index.ts) re-exports
// from index.generated.ts which DOES include TTS — Node-side code paths
// keep working unchanged.

import type {Plugin} from '@bjelser/kit';

// Presets
import {neutralPreset} from './presets/neutral';
import {engineeringPreset} from './presets/engineering';
import {editorialPreset} from './presets/editorial';
import {paperPreset} from './presets/paper';
import {analyticalPreset} from './presets/analytical';
import {executivePreset} from './presets/executive';

// Features
import {narrationFeature} from './features/narration';
import {audioRhythmFeature} from './features/audio-rhythm';

// Scenes — same 29 as index.generated
import {bigIdeaPlugin} from './scenes/big-idea';
import {causalLoopPlugin} from './scenes/causal-loop';
import {chartPlugin} from './scenes/chart';
import {closeupPlugin} from './scenes/closeup';
import {comparePlugin} from './scenes/compare';
import {concessionPlugin} from './scenes/concession';
import {demonstratePlugin} from './scenes/demonstrate';
import {diffPlugin} from './scenes/diff';
import {epigraphPlugin} from './scenes/epigraph';
import {figurePlugin} from './scenes/figure';
import {framePlugin} from './scenes/frame';
import {journeyMapPlugin} from './scenes/journey-map';
import {landscapePlugin} from './scenes/landscape';
import {mapPlugin} from './scenes/map';
import {mechanismPlugin} from './scenes/mechanism';
import {objectionPlugin} from './scenes/objection';
import {passagePlugin} from './scenes/passage';
import {priorArtPlugin} from './scenes/prior-art';
import {probePlugin} from './scenes/probe';
import {progressionPlugin} from './scenes/progression';
import {provocationPlugin} from './scenes/provocation';
import {quantitiesPlugin} from './scenes/quantities';
import {recapPlugin} from './scenes/recap';
import {structurePlugin} from './scenes/structure';
import {tensionPlugin} from './scenes/tension';
import {timelinePlugin} from './scenes/timeline';
import {treePlugin} from './scenes/tree';
import {vennPlugin} from './scenes/venn';
import {walkthroughPlugin} from './scenes/walkthrough';

export const corePluginsBrowser: ReadonlyArray<Plugin> = [
  // Presets
  neutralPreset,
  engineeringPreset,
  editorialPreset,
  paperPreset,
  analyticalPreset,
  executivePreset,
  // Features
  narrationFeature,
  audioRhythmFeature,
  // Scenes
  bigIdeaPlugin,
  causalLoopPlugin,
  chartPlugin,
  closeupPlugin,
  comparePlugin,
  concessionPlugin,
  demonstratePlugin,
  diffPlugin,
  epigraphPlugin,
  figurePlugin,
  framePlugin,
  journeyMapPlugin,
  landscapePlugin,
  mapPlugin,
  mechanismPlugin,
  objectionPlugin,
  passagePlugin,
  priorArtPlugin,
  probePlugin,
  progressionPlugin,
  provocationPlugin,
  quantitiesPlugin,
  recapPlugin,
  structurePlugin,
  tensionPlugin,
  timelinePlugin,
  treePlugin,
  vennPlugin,
  walkthroughPlugin,
];

export default corePluginsBrowser;
