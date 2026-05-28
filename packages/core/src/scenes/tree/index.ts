// @bjelser/core — `tree` scene plugin.
//
// A rooted hierarchy where depth encodes a classification axis. Cluster:
// `connection` (the tree shows what relates to what — a parent→child
// containment structure; like `structure`, `walkthrough`, and `map`, it
// answers the connectivity question, not flow or time).
//
// Migrated from packages/engine/src/scenes/TreeScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. See ./component.tsx for the
// renderer, ./schema.ts for the spec branch, ./validate.ts for the
// structural validator, ./depth-rules.ts for `tree-discriminates`, and
// ./judge-dimensions.ts for `hierarchy-meaningful`.

import type {ScenePlugin} from '@bjelser/kit';

import {TreeSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {TreeScene} from './validate';
import {validate} from './validate';

export const treePlugin: ScenePlugin<TreeScene> = {
  kind: 'scene',
  name: 'tree',
  version: '1.0.0',
  sceneType: 'tree',
  cluster: 'connection',
  schema,
  component: TreeSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — tree narrates over its reveal
  // beats with chunk-level alignment; no word-level karaoke needed.

  cue: 'the structure is parent-child and the levels mean something (a taxonomy).',
  signals: [
    {needle: 'parent-child', weight: 4},
    {needle: 'parent/child', weight: 4},
    {needle: 'hierarchy', weight: 3},
    {needle: 'taxonomy', weight: 4},
    {needle: 'taxonomic', weight: 3},
    {needle: 'classification', weight: 2},
    {needle: 'rooted tree', weight: 4},
    {needle: 'org chart', weight: 3},
    {needle: 'kingdom', weight: 2},
    {needle: 'phylum', weight: 2},
    {needle: 'dependency tree', weight: 3},
    {needle: 'reporting line', weight: 2},
    {needle: 'levels mean', weight: 2},
  ],
};

export type {TreeScene, TreeNodeSpec} from './validate';
export default treePlugin;
