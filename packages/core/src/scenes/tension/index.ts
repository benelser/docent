// @docent/core — `tension` scene plugin.
//
// The trade-off ledger: this path was taken, these alternatives were
// rejected, this risk survives. Cluster: `categorization` — the scene's
// cognitive move is to sort the choice into sworn lanes (CHOSEN vs
// REJECTED, with a RISK band below) and let the verdict read at a glance.
// Not flow (control/data), not connection (relations), not comparison (a
// side-by-side of options on the same dimensions) — categorization, the
// act of assigning each option to its lane.
//
// Migrated from packages/engine/src/scenes/TensionScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. See ./component.tsx for the
// renderer, ./schema.ts for the spec branch, and ./validate.ts for the
// structural validator (the one v2.5.x contract: nodes.length >= 1).
//
// The film-wide tension-related depth rules (`tension-scene`, `risk-node`,
// `adjudication`, `tradeoff`, `scorecard`) live on the depthcheck framework
// itself, not on this plugin — they reason about the whole spec, not about
// a single tension scene in isolation. See ./depth-rules.ts for the
// reasoning.

import type {ScenePlugin} from '@docent/kit';

import {TensionSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {TensionScene} from './validate';
import {validate} from './validate';

export const tensionPlugin: ScenePlugin<TensionScene> = {
  kind: 'scene',
  name: 'tension',
  version: '1.0.0',
  sceneType: 'tension',
  cluster: 'categorization',
  schema,
  component: TensionSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — tension renders the verdict as
  // typography and verdict marks, not karaoke word-aligned passage text;
  // the default chunk-level alignment every TTS provider supports is
  // sufficient.
};

export type {TensionScene, TensionNode} from './validate';
export default tensionPlugin;
