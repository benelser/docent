// @docent/core — `structure` scene plugin.
//
// The load-bearing template most architecture films rest on: a node-and-edge
// diagram. Cluster: `connection` (the move is showing how the parts
// relate — what is connected to what, what asserts what about which).
//
// Migrated from packages/engine/src/scenes/StructureScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. See ./component.tsx for the
// renderer, ./schema.ts for the spec branch, and ./validate.ts for the
// structural validator (node/edge shape, the as/cells/expr cross-field
// rules, the box-overlap guarantee, the embed-allowlist check).

import type {ScenePlugin} from '@docent/kit';

import {StructureSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {StructureScene} from './_types';
import {validate} from './validate';

export const structurePlugin: ScenePlugin<StructureScene> = {
  kind: 'scene',
  name: 'structure',
  version: '1.0.0',
  sceneType: 'structure',
  cluster: 'connection',
  schema,
  component: StructureSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — structure renders a node-and-edge
  // diagram with beat-driven reveals; it does NOT need word-level
  // alignment. The default chunk-level alignment every TTS provider
  // supports is sufficient.
};

export type {
  NodeRepr,
  StructureEdge,
  StructureEmbeddedScene,
  StructureNode,
  StructureScene,
  StructureTransform,
  StructureBeatDirectives,
} from './_types';
export default structurePlugin;
