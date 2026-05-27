// prior-art — the AR-mode scene that places the subject against 2-4
// prior systems, dimensionally. A column per prior system, a row per
// trade-off dimension, one cell per (system, dimension) pair marking
// `same` (✓) or `diverges` (✗), and one named `novelty` row that lights
// up — the line of difference the film argues from.
//
// Position contract (enforced at the film level, NOT in this plugin):
// exactly one prior-art scene sits between the frame and the first
// structure scene in an AR-mode film. The viewer learns what's at stake
// (frame), then what's been tried (prior-art), then sees the system
// itself (structure).
//
// Per the cognitive-cluster taxonomy (kit §11.5): prior-art is a
// `comparison` cluster move — it places the subject against alternatives
// on dimensions, the family that includes `compare`, `landscape`,
// `quantities`, `chart`, `venn`, `probe`.

import type {Scene, ScenePlugin} from '@docent/kit';

import {Component} from './component';
import {schema} from './schema';
import {validate} from './validate';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';

// The component reads typed `prior-art` fields, but the plugin contract is
// keyed on the open `Scene` union — the engine narrows on `scene.type`
// before dispatch, and the validator hard-fails any prior-art scene whose
// per-type fields don't match the shape Component reads.
export const priorArtPlugin: ScenePlugin<Scene> = {
  kind: 'scene',
  name: 'prior-art',
  version: '1.0.0',
  sceneType: 'prior-art',
  cluster: 'comparison',
  schema,
  // Component accepts `SceneRenderProps<PriorArtScene>` internally; the
  // plugin protocol asks for `SceneRenderProps<Scene>`. The structural cast
  // is safe because the validator (above) hard-fails any spec that violates
  // the prior-art shape, so the renderer never sees a malformed object.
  component: Component as ScenePlugin<Scene>['component'],
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities — prior-art does not need word-level alignment;
  // the narration walks one column at a time but is bound to the BEAT
  // (reveal/focus) not the character. Leave undefined.
};

export default priorArtPlugin;
