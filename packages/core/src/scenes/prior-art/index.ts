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
//
// Phase B migration note: the engine still owns the render path in this
// build (Film.tsx's 29-way switch). The component this plugin exposes is
// a placeholder until Phase D refactors Film.tsx to dispatch through the
// registry — at which point the renderer ports across in one move with
// hermetic-gallery parity. See `./component.tsx`.

import type {ScenePlugin} from '@docent/kit';

import {Component} from './component';
import {schema} from './schema';
import {validate} from './validate';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';

export const priorArtPlugin: ScenePlugin = {
  kind: 'scene',
  name: 'prior-art',
  version: '1.0.0',
  sceneType: 'prior-art',
  cluster: 'comparison',
  schema,
  component: Component,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities — prior-art does not need word-level alignment;
  // the narration walks one column at a time but is bound to the BEAT
  // (reveal/focus) not the character. Leave undefined.
};

export default priorArtPlugin;
