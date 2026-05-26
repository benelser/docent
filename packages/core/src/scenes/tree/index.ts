// @docent/core — `tree` scene plugin.
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

import type {ScenePlugin} from '@docent/kit';

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
};

export type {TreeScene, TreeNodeSpec} from './validate';
export default treePlugin;
